import { budgetSummary } from '../contracts/index.ts';
import type { ArtifactReference, BudgetLedger, LedgerEntry } from '../contracts/index.ts';
import { checkShape, referenceShape } from '../contracts/structure.ts';
import type { RequestInput } from '../runtime/run-types.ts';

export function money(value: number, positive = false): void {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) throw new Error('Price must be a known safe integer micro-CNY amount' + (positive ? ' and positive.' : '.'));
}

export function nonEmpty(value: string, name: string): void {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be non-empty.`);
}

export function evidenceReferences(evidence: ArtifactReference[]): void {
  if (!Array.isArray(evidence) || evidence.length === 0 || evidence.some(ref => checkShape(ref, referenceShape).length > 0)) throw new Error('Reconciliation requires versioned evidence references.');
}

export function appendEvidence(entry: LedgerEntry, evidence: ArtifactReference[]): void {
  evidenceReferences(evidence);
  for (const reference of evidence) {
    const previous = entry.evidence.find(ref => ref.artifactId === reference.artifactId && ref.version === reference.version);
    if (previous && previous.location !== reference.location) throw new Error('Evidence identity conflicts with its recorded location.');
    if (!previous) entry.evidence.push(structuredClone(reference));
  }
}

export function findRequest(ledger: BudgetLedger, requestId: string): LedgerEntry {
  const entry = ledger.entries.find(item => item.requestId === requestId);
  if (!entry) throw new Error(`Unknown request: ${requestId}`);
  return entry;
}

export function requireOpen(entry: LedgerEntry): void {
  if (entry.status === 'settled' || entry.status === 'cancelled') throw new Error(`Request is closed: ${entry.requestId}`);
}

/** All roles and retries use these same allocations and one global total. */
export function reserveEntry(ledger: BudgetLedger, input: RequestInput): LedgerEntry {
  money(input.estimatedMaxCostMicroCny, true);
  for (const key of ['requestId', 'taskId', 'provider', 'pricingVersion'] as const) nonEmpty(input[key], key);
  if (ledger.entries.some(entry => entry.requestId === input.requestId)) throw new Error(`Request ID already exists: ${input.requestId}`);
  if (ledger.allocationClosures?.some(item => item.taskId === input.taskId)) throw new Error('Task grant is permanently closed.');
  const summary = budgetSummary(ledger);
  if (summary.reconciliationRequired) throw new Error('Reconciliation required before further paid requests.');
  if (input.estimatedMaxCostMicroCny > summary.availableMicroCny) throw new Error('Shared budget is insufficient.');
  const allocation = ledger.allocations.find(item => item.taskId === input.taskId);
  if (!allocation) throw new Error(`Missing task allocation: ${input.taskId}`);
  const committed = ledger.entries.filter(entry => entry.taskId === input.taskId).reduce((sum, entry) => sum + entry.reservedMicroCny + entry.settledMicroCny, 0);
  if (input.estimatedMaxCostMicroCny > allocation.amountMicroCny - committed) throw new Error('Task budget allocation is insufficient.');
  const entry: LedgerEntry = { requestId: input.requestId, taskId: input.taskId, provider: input.provider, pricingVersion: input.pricingVersion, reservedMicroCny: input.estimatedMaxCostMicroCny, settledMicroCny: 0, unknown: false, status: 'reserved', evidence: [] };
  ledger.entries.push(entry);
  return entry;
}

export function settleEntry(entry: LedgerEntry, actualCostMicroCny: number, evidence: ArtifactReference[]): boolean {
  requireOpen(entry);
  money(actualCostMicroCny);
  evidenceReferences(evidence);
  const overrun = actualCostMicroCny > entry.reservedMicroCny + entry.settledMicroCny;
  if (actualCostMicroCny < entry.settledMicroCny) throw new Error('Settled costs cannot decrease.');
  entry.reservedMicroCny = 0;
  entry.settledMicroCny = actualCostMicroCny;
  entry.unknown = false;
  entry.status = 'settled';
  appendEvidence(entry, evidence);
  return overrun;
}
