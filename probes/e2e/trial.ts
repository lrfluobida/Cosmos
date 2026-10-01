import { lstat, mkdir, open } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { safePath } from '../../src/artifacts/paths.ts';
import { jsonFile } from './host.ts';
import { PILOT_LIMITS } from './admission.ts';

export const TRIAL = Object.freeze({
  id: 'cos10-cos11-validation-1', durationMs: 60 * 60 * 1000, maxRequests: 40, maxRepairTasks: 1, maxTaskAttempts: 2,
  reviewProtocolCorrections: 1 as const, childAllocationMicroCny: 19_000_000,
  allocations: Object.freeze({ design: 1_900_000, art: 5_700_000, coding: 7_600_000, repair: 3_800_000 }),
  cos11ReviewedCommit: '005f51bbe48fb2ec356d77f365e538394e37c740',
  repairEstimate: Object.freeze({ costMicroCny: 3_000_000, durationMs: 10 * 60 * 1000, cleanupMs: 5000, requests: 8 }),
});
const g2 = ['COS-03', 'COS-04', 'COS-05', 'COS-06', 'COS-07', 'COS-08', 'COS-09'];
interface Dependency { taskId: string; state: string; reviewedCommit?: string; mergeCommit?: string; reviewStatus?: string; integrationStatus?: string }
interface Snapshot {
  run: { state: string; runId: string; ledgerId: string; specVersion: string; originalDeadlineAt: string };
  stopReason: unknown;
  ledger: { scope: string; ledgerId: string; limitMicroCny: number; allocations: { taskId: string; amountMicroCny: number }[];
    entries: { requestId: string; taskId: string; status: string; unknown: boolean; settledMicroCny: number; reservedMicroCny: number }[] };
}
function need(value: unknown, message: string): asserts value { if (!value) throw new Error(`Fixed trial: ${message}`); }

/** A new experiment identity, retaining the original validation run, allocations and all charges. */
export async function checkTrialAdmission(input: { snapshot: Snapshot; dependencies: Dependency[]; now: number; platformHead: string; isAncestor: (sha: string) => Promise<boolean> }) {
  const { snapshot, now } = input, { ledger, run } = snapshot;
  for (const id of [...g2, 'COS-11']) {
    const matches = input.dependencies.filter(item => item.taskId === id), item = matches[0];
    need(matches.length === 1 && /^[a-f0-9]{40}$/.test(item.reviewedCommit ?? '') && /^[a-f0-9]{40}$/.test(item.mergeCommit ?? ''), `${id} requires reviewed and merged source evidence`);
    need(id === 'COS-11' ? item.reviewedCommit === TRIAL.cos11ReviewedCommit && (item.state === 'closed' || item.reviewStatus === 'READY' && item.integrationStatus === 'offline-verified-awaiting-live') : item.state === 'closed', `${id} approval state is not eligible`);
    for (const sha of [item.reviewedCommit!, item.mergeCommit!]) need(await input.isAncestor(sha), `${id} reviewed source must be an ancestor of main`);
  }
  need(run.runId === 'validation-2026-10-01' && run.ledgerId === 'cosmos-validation' && run.specVersion === '1.0'
    && ledger.ledgerId === run.ledgerId && ledger.scope === 'validation' && ledger.limitMicroCny === 150_000_000, 'use the original shared validation ledger');
  need(run.state === 'running' && !snapshot.stopReason, 'shared run is stopped');
  need(Number.isSafeInteger(now) && run.originalDeadlineAt === '2026-10-01T18:16:16.857Z' && Date.parse(run.originalDeadlineAt) > now + 5000, 'original shared deadline expired or changed');
  need(!ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny > 0 || ['reserved', 'unknown'].includes(entry.status)), 'unknown or in-flight charges require reconciliation');
  need(ledger.entries.some(entry => entry.requestId === 'prior-deepseek-direct-probes' && entry.status === 'settled' && entry.settledMicroCny >= 721_771), 'prior validation charges are required');
  const committed = ledger.entries.reduce((sum, entry) => sum + entry.settledMicroCny + entry.reservedMicroCny, 0);
  need(committed < PILOT_LIMITS.cumulativeMicroCny, 'cumulative CNY 30 cap is exhausted');
  need(ledger.limitMicroCny - ledger.allocations.reduce((sum, allocation) => sum + allocation.amountMicroCny, 0) >= TRIAL.childAllocationMicroCny, 'shared unallocated amount cannot cover the fixed role bounds');
  const planning = ledger.allocations.find(allocation => allocation.taskId === 'COS-10');
  const planningUsed = ledger.entries.filter(entry => entry.taskId === 'COS-10').reduce((sum, entry) => sum + entry.settledMicroCny + entry.reservedMicroCny, 0);
  need(planning && planning.amountMicroCny - planningUsed >= PILOT_LIMITS.planningMaxOutputTokens * 8, 'existing planning allocation has insufficient remaining capacity');
  return { trialId: TRIAL.id, runId: run.runId, ledgerId: ledger.ledgerId, platformHead: input.platformHead,
    startedAt: new Date(now).toISOString(), deadlineAt: new Date(Math.min(now + TRIAL.durationMs, Date.parse(run.originalDeadlineAt))).toISOString(), sharedDeadlineAt: run.originalDeadlineAt,
    baselineCommittedMicroCny: committed, baselineRequestIds: ledger.entries.map(entry => entry.requestId), phaseRemainingMicroCny: PILOT_LIMITS.cumulativeMicroCny - committed,
    childAllocationCapMicroCny: TRIAL.childAllocationMicroCny, planningAllocationMicroCny: planning.amountMicroCny, planningUsedMicroCny: planningUsed,
    limits: TRIAL, approvals: input.dependencies.filter(item => [...g2, 'COS-11'].includes(item.taskId)) };
}
export type TrialAdmission = Awaited<ReturnType<typeof checkTrialAdmission>>;
export interface PreviousTrial { root: string; results: string[]; outcome: 'failed'; requestCount: number; deadlineAt: string }

export async function readPreviousTrial(repository: string, ledgerRoot: string): Promise<PreviousTrial> {
  const marker = await jsonFile(ledgerRoot, 'cos10-pilot.json');
  const location = relative(repository, resolve(marker.root)).replaceAll('\\', '/');
  need(/^\.cosmos\/e2e\/pilot-\d{17}$/.test(location), 'old pilot marker location changed');
  const root = await safePath(repository, location);
  const [first, second, journal, confirmed, requirements] = await Promise.all([
    jsonFile(root, 'result.json'), jsonFile(root, 'continuation-result.json'), jsonFile(root, 'pilot-budget.json'), jsonFile(root, 'confirmed-requirement.json'), jsonFile(repository, 'probes/e2e/requirements.json'),
  ]);
  need(first.outcome === 'failed' && second.outcome === 'failed' && journal.requestIds.length === 13
    && isDeepStrictEqual(second.pilotBudget, journal) && journal.deadlineAt === marker.deadlineAt, 'old failed results or 13-request journal changed');
  const source = confirmed.requirement.sources[0];
  const frozen = await jsonFile(root, `${source.location}/_cosmos/requirements.json`);
  need(requirements.requirementVersion === 'cos10-pilot-v2' && isDeepStrictEqual(frozen, requirements), 'frozen v2 requirement/acceptance changed');
  return { root, results: [join(root, 'result.json'), join(root, 'continuation-result.json')], outcome: 'failed', requestCount: 13, deadlineAt: marker.deadlineAt };
}

export async function assertTrialUnused(repository: string, ledgerRoot: string): Promise<void> {
  for (const path of [await safePath(repository, `.cosmos/e2e/${TRIAL.id}`), await safePath(ledgerRoot, `${TRIAL.id}.json`)]) {
    const exists = await lstat(path).then(() => true, (error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return false; throw error; });
    need(!exists, 'this only trial already has a root or marker; do not restart it');
  }
}

/** Called with the shared controller lock held. A partial root/marker also consumes this only trial. */
export async function claimTrial(input: { repository: string; ledgerRoot: string; admission: TrialAdmission; previous: PreviousTrial }) {
  need(input.admission.trialId === TRIAL.id && isDeepStrictEqual(input.admission.limits, TRIAL), 'only the fixed trial configuration can be claimed');
  await assertTrialUnused(input.repository, input.ledgerRoot);
  const root = await safePath(input.repository, `.cosmos/e2e/${TRIAL.id}`);
  await mkdir(dirname(root), { recursive: true }); await mkdir(root);
  const origin = { ...input.admission, root, previousFailedTrial: input.previous,
    reason: 'One new validation after reviewed COS-11 protocol correction and bounded repair materially changed the platform; this does not reopen or relabel the failed pilot.',
    requirements: { version: 'cos10-pilot-v2', path: 'probes/e2e/requirements.json' }, reusedOutputs: [],
    budgets: { sharedLedger: input.ledgerRoot, sharedLimitMicroCny: 150_000_000, cumulativeAllValidationMicroCny: PILOT_LIMITS.cumulativeMicroCny, oldAllocationsRetained: true } };
  for (const path of [join(input.ledgerRoot, `${TRIAL.id}.json`), join(root, 'origin.json')]) {
    const file = await open(path, 'wx');
    try { await file.writeFile(JSON.stringify(origin, null, 2) + '\n', 'utf8'); await file.sync(); }
    finally { await file.close(); }
  }
  return origin;
}
