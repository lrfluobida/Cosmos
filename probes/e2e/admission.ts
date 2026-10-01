/** Host-only preparation. This module never opens a provider session or creates a ledger. */
export const PILOT_LIMITS = Object.freeze({
  cumulativeMicroCny: 30_000_000, durationMs: 90 * 60 * 1000, maxRequests: 40,
  maxRepairTasks: 1, maxTaskAttempts: 2, maxPlannedTasks: 3,
  planningMaxOutputTokens: 4096, authorMaxOutputTokens: 16384, requestTimeoutMs: 180_000,
});
const DEPENDENCIES = ['COS-03', 'COS-04', 'COS-05', 'COS-06', 'COS-07', 'COS-08', 'COS-09'];
interface Dependency { taskId: string; state: string; reviewedCommit?: string; mergeCommit?: string }
interface Snapshot {
  run: { runId: string; originalDeadlineAt: string; state: string };
  stopReason: unknown;
  ledger: {
    ledgerId: string; scope: string; limitMicroCny: number;
    allocations: { taskId: string; amountMicroCny: number }[];
    entries: { requestId: string; taskId: string; status: string; settledMicroCny: number; reservedMicroCny: number; unknown: boolean }[];
  };
}
function requireThat(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function amount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${label}`);
}

/** Caller uses a locked RunController.read() and binds isAncestor to the current main HEAD. */
export async function preparePilot(input: {
  snapshot: Snapshot; dependencies: Dependency[]; now: number;
  isAncestor: (commit: string) => Promise<boolean>;
}) {
  const { snapshot, dependencies, now } = input;
  amount(now, 'clock');
  for (const id of DEPENDENCIES) {
    const matches = dependencies.filter(item => item.taskId === id);
    const dependency = matches[0];
    requireThat(matches.length === 1 && dependency.state === 'closed'
      && /^[a-f0-9]{40}$/.test(dependency.reviewedCommit ?? '') && /^[a-f0-9]{40}$/.test(dependency.mergeCommit ?? ''),
    `${id} must be independently reviewed and merged before planning or generation`);
    for (const commit of [dependency.reviewedCommit!, dependency.mergeCommit!]) {
      requireThat(await input.isAncestor(commit), `${id} approved commit must be an ancestor of the running main HEAD`);
    }
  }
  requireThat(snapshot.run.state === 'running' && !snapshot.stopReason, 'Shared run must be active');
  const originalDeadline = Date.parse(snapshot.run.originalDeadlineAt);
  requireThat(Number.isFinite(originalDeadline) && originalDeadline > now, 'Shared run deadline has expired');
  const { ledger } = snapshot;
  requireThat(ledger.scope === 'validation' && ledger.limitMicroCny > 0 && ledger.limitMicroCny <= 150_000_000, 'Use the existing shared validation ledger');
  amount(ledger.limitMicroCny, 'ledger limit');
  for (const entry of ledger.entries) {
    amount(entry.settledMicroCny, 'settled cost'); amount(entry.reservedMicroCny, 'reservation');
  }
  requireThat(ledger.entries.some(entry => entry.requestId === 'prior-deepseek-direct-probes'
    && entry.status === 'settled' && entry.settledMicroCny >= 721_771), 'Shared prior direct-probe charge is required; a fresh ledger is forbidden');
  requireThat(!ledger.entries.some(entry => entry.unknown || entry.status === 'unknown'), 'Reconcile unknown charges before this pilot');
  requireThat(!ledger.entries.some(entry => entry.status === 'reserved' || entry.reservedMicroCny > 0), 'Another request is in-flight; paid probes must run serially');
  requireThat(!ledger.entries.some(entry => entry.taskId === 'COS-10'), 'An existing pilot must resume its saved deadline and request count; preparation cannot restart it');
  requireThat(new Set(ledger.allocations.map(a => a.taskId)).size === ledger.allocations.length, 'Duplicate allocation');
  for (const allocation of ledger.allocations) amount(allocation.amountMicroCny, 'allocation');
  const planning = ledger.allocations.find(a => a.taskId === 'COS-10');
  requireThat(planning && planning.amountMicroCny > 0 && planning.amountMicroCny <= 10_000_000, 'COS-10 requires its existing planning allocation, at most CNY 10');
  const priorCommittedMicroCny = ledger.entries.reduce((sum, entry) => sum + entry.settledMicroCny + entry.reservedMicroCny, 0);
  const unallocated = ledger.limitMicroCny - ledger.allocations.reduce((sum, allocation) => sum + allocation.amountMicroCny, 0);
  const childAllocationCapMicroCny = Math.min(unallocated, PILOT_LIMITS.cumulativeMicroCny - priorCommittedMicroCny - planning.amountMicroCny);
  requireThat(childAllocationCapMicroCny > 0, 'No child allocation remains inside the cumulative CNY 30 pilot cap');
  return {
    runId: snapshot.run.runId, ledgerId: ledger.ledgerId, priorCommittedMicroCny,
    planningAllocationMicroCny: planning.amountMicroCny, childAllocationCapMicroCny,
    startedAt: new Date(now).toISOString(), deadlineAt: new Date(Math.min(originalDeadline, now + PILOT_LIMITS.durationMs)).toISOString(),
    limits: PILOT_LIMITS,
  };
}

/** Arguments stay in arrays with shell:false. No API credentials or runtime preload variables cross this boundary. */
export function filteredChildEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const allowed = new Set(['path', 'systemroot', 'windir', 'temp', 'tmp', 'pathext', 'comspec', 'localappdata']);
  return Object.fromEntries(Object.entries(environment).filter(([key, value]) => allowed.has(key.toLowerCase()) && value !== undefined));
}

/** Frozen conservative peak prices: 2 micro-CNY/input token, 8/output token. One UTF-8 byte per token upper-bounds text. */
export function requestReservation(request: { inputBytes: number; maxOutputTokens: number; hasImages: boolean }): number {
  amount(request.inputBytes, 'inputBytes'); amount(request.maxOutputTokens, 'maxOutputTokens');
  requireThat(request.maxOutputTokens > 0 && request.maxOutputTokens <= 1_000_000, 'Invalid maxOutputTokens');
  const reservation = (request.hasImages ? 1_000_000 : request.inputBytes) * 2 + request.maxOutputTokens * 8;
  amount(reservation, 'request reservation');
  return reservation;
}
