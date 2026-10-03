import { lstat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { regularFile, safePath } from '../artifacts/paths.ts';
import { evidenceReferences, nonEmpty } from '../budget/ledger.ts';
import { budgetCapacity, budgetSummary, validateLedgerUpdate } from '../contracts/index.ts';
import { sameValue } from '../contracts/validation.ts';
import { SnapshotStore } from './store.ts';
import { validateSnapshot } from './run-validation.ts';
import { requireNoRegistryWriter } from './window-idle.ts';
import { verifyOperatorDecision, verifyValidationIdentity } from './validation-window.ts';
import { currentValidationCase, VALIDATION_ROLES, validationHash } from './validation-validation.ts';
import { validateValidationAllocationClosureQuote } from './validation-allocation-validation.ts';
import type { RunSnapshot } from './run-types.ts';
import type { ApplyValidationAllocationClosureOptions, OperatorValidationAllocationClosureDecision, PrepareValidationAllocationClosureOptions,
  ValidationAllocationClosureQuote, ValidationAllocationClosureReceipt, ValidationContextOptions } from './validation-types.ts';

async function absentOwner(root: string): Promise<void> {
  const path = await safePath(root, '.controller.lock');
  const exists = await lstat(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
  if (exists) throw new Error('Controller owner or child drain is unresolved; allocation closure refused.');
}
function eligible(state: RunSnapshot, caseIds: string[]): void {
  if (state.formatVersion !== 3 || state.run.kind !== 'evaluation' || state.ledger.scope !== 'validation' || !['1.0.0', '3.0.0'].includes(state.ledger.contractVersion)
    || !currentValidationCase(state).stopReason) throw new Error('Allocation closure requires an explicitly stopped current validation case.');
  if (!Array.isArray(caseIds) || !caseIds.length || new Set(caseIds).size !== caseIds.length) throw new Error('Allocation closure requires unique known case IDs.');
  if (state.ledger.entries.some(entry => entry.reservedMicroCny || entry.unknown || !['settled', 'cancelled'].includes(entry.status))) throw new Error('Reserved or unknown requests require reconciliation before allocation closure.');
  for (const caseId of caseIds) {
    const window = state.validation!.cases.find(window => window.caseId === caseId);
    if (!window?.stopReason) throw new Error('Only explicitly stopped known validation cases may close their own grants.');
    if (VALIDATION_ROLES.some(role => state.ledger.allocationClosures?.some(closure => closure.taskId === window.quote.declaration.grants[role].taskId))) throw new Error('Case grants are already permanently closed.');
  }
}

/** Roots are derived from the reviewed repository and case ID; caller-selected directories cannot prove idle. */
async function observeCaseRoots(options: ValidationContextOptions, caseIds: string[], ownedLedger: boolean) {
  await safePath(options.root); await safePath(options.repositoryRoot);
  if (!ownedLedger) await absentOwner(options.root);
  await requireNoRegistryWriter(options.root);
  const roots = new Map<string, string>();
  for (const caseId of caseIds) {
    const path = await safePath(options.repositoryRoot, `.cosmos/e2e/${caseId}`), stat = await lstat(path);
    if (!stat.isDirectory()) throw new Error('Fixed validation case artifact root must be an existing directory.');
    await absentOwner(path); await requireNoRegistryWriter(path); roots.set(caseId, path);
  }
  return roots;
}

async function verifyCaseSources(options: ValidationContextOptions, state: RunSnapshot, caseIds: string[], identity: ValidationAllocationClosureQuote['identity']) {
  for (const caseId of caseIds) {
    const window = state.validation!.cases.find(window => window.caseId === caseId)!;
    await verifyValidationIdentity(options, window.quote.declaration, identity);
    const { sourceSha256, ...decision } = window.operatorDecision;
    if ((await verifyOperatorDecision(options.root, window.quote, decision, (options.now ?? Date.now)())).sourceSha256 !== sourceSha256) throw new Error('Historical operator validation source changed.');
  }
}

async function quoteFor(options: ValidationContextOptions, state: RunSnapshot, bytes: Buffer, caseIds: string[], ownedLedger: boolean): Promise<ValidationAllocationClosureQuote> {
  eligible(state, caseIds);
  const current = currentValidationCase(state), observed = await verifyValidationIdentity(options, current.quote.declaration);
  await verifyCaseSources(options, state, caseIds, observed.identity);
  const cases: ValidationAllocationClosureQuote['cases'] = [], closures: ValidationAllocationClosureQuote['closures'] = [];
  for (const caseId of caseIds) {
    const window = state.validation!.cases.find(window => window.caseId === caseId)!;
    const { sourceSha256 } = window.operatorDecision;
    const taskIds = VALIDATION_ROLES.map(role => window.quote.declaration.grants[role].taskId);
    cases.push({ caseId, artifactRoot: '', windowId: window.windowId, stopReason: structuredClone(window.stopReason!), originalQuoteId: window.quote.quoteId,
      originalOperatorSourceSha256: sourceSha256, taskIds, requestIds: state.ledger.entries.filter(entry => taskIds.includes(entry.taskId)).map(entry => entry.requestId) });
    for (const role of VALIDATION_ROLES) {
      const grant = window.quote.declaration.grants[role], spentMicroCny = state.ledger.entries.filter(entry => entry.taskId === grant.taskId).reduce((sum, entry) => sum + entry.settledMicroCny, 0);
      closures.push({ caseId, taskId: grant.taskId, allocatedMicroCny: grant.amountMicroCny, spentMicroCny, releasedMicroCny: grant.amountMicroCny - spentMicroCny });
    }
  }
  const roots = await observeCaseRoots(options, caseIds, ownedLedger);
  for (const item of cases) item.artifactRoot = roots.get(item.caseId)!;
  if (!bytes.equals(await regularFile(options.root, 'snapshot.json'))) throw new Error('Allocation closure snapshot baseline changed.');
  const allocatedMicroCny = budgetCapacity(state.ledger).allocatedMicroCny, releasedMicroCny = closures.reduce((sum, item) => sum + item.releasedMicroCny, 0);
  const payload: Omit<ValidationAllocationClosureQuote, 'quoteId'> = {
    formatVersion: 'validation-allocation-closure-quote-1', profile: 'operator_validation_allocation_closure', activationAllowed: false, identity: observed.identity,
    basis: { runId: state.run.runId, ledgerId: state.ledger.ledgerId, specVersion: state.run.specVersion, revision: state.revision, snapshotSha256: validationHash(bytes), currentCaseId: current.caseId,
      originalStartedAt: state.run.originalStartedAt, originalDeadlineAt: state.run.originalDeadlineAt, originalLimitMicroCny: state.ledger.limitMicroCny, stopReason: structuredClone(state.stopReason),
      allocatedMicroCny, committedMicroCny: budgetSummary(state.ledger).committedMicroCny, allocations: structuredClone(state.ledger.allocations), entries: structuredClone(state.ledger.entries), requests: structuredClone(state.requests) },
    cases, closures, releasedMicroCny, allocatedAfterMicroCny: allocatedMicroCny - releasedMicroCny,
  };
  return { ...payload, quoteId: `vacq1-${validationHash(JSON.stringify(payload))}` };
}

/** Free read-only proposal. It never acquires ownership, opens a controller or creates an execution window. */
export async function prepareValidationAllocationClosure(options: PrepareValidationAllocationClosureOptions): Promise<ValidationAllocationClosureQuote> {
  const bytes = await regularFile(options.root, 'snapshot.json'), state = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); validateSnapshot(state);
  return quoteFor(options, state, bytes, structuredClone(options.caseIds), false);
}

async function verifyClosureDecision(root: string, quote: ValidationAllocationClosureQuote, decision: OperatorValidationAllocationClosureDecision, now: number) {
  if (decision.kind !== 'operator_validation_allocation_closure' || Object.keys(decision).length !== 6
    || Object.keys(decision).some(key => !['kind', 'decisionId', 'actorId', 'decidedAt', 'source', 'sourceRefs'].includes(key))) throw new Error('Only an independent operator allocation closure decision is accepted.');
  for (const key of ['decisionId', 'actorId', 'decidedAt'] as const) nonEmpty(decision[key], key);
  if (!Number.isFinite(Date.parse(decision.decidedAt)) || new Date(decision.decidedAt).toISOString() !== decision.decidedAt || Date.parse(decision.decidedAt) > now) throw new Error('Invalid allocation closure operator decision time.');
  evidenceReferences([decision.source]); evidenceReferences(decision.sourceRefs);
  const bytes = await regularFile(root, decision.source.location), receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!sameValue(receipt, { formatVersion: 'operator-validation-allocation-closure-decision-1', kind: decision.kind, decisionId: decision.decisionId, actorId: decision.actorId,
    decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote })) throw new Error('Operator source does not authorize this exact allocation closure quote.');
  return { ...structuredClone(decision), sourceSha256: validationHash(bytes) };
}

/** One exclusive atomic commit; original fees, grants, cases, human decisions and clocks are untouched. */
export async function applyValidationAllocationClosure(options: ApplyValidationAllocationClosureOptions): Promise<ValidationAllocationClosureReceipt> {
  const quote = structuredClone(options.quote), decision = structuredClone(options.decision), now = options.now ?? Date.now;
  if (!isAbsolute(options.root) || !isAbsolute(options.repositoryRoot)) throw new Error('Allocation closure requires explicit roots.');
  await safePath(options.root); const store = await SnapshotStore.acquire(options.root);
  try {
    const previous = await store.read(); validateSnapshot(previous); validateValidationAllocationClosureQuote(quote, previous);
    const operatorDecision = await verifyClosureDecision(store.root, quote, decision, now());
    const existing = previous.allocationClosureDecisions?.find(receipt => receipt.operatorDecision.decisionId === decision.decisionId);
    if (existing) {
      if (!sameValue(existing.quote, quote) || !sameValue(existing.operatorDecision, operatorDecision)) throw new Error('Allocation closure decision conflicts with its recorded quote or source.');
      await verifyValidationIdentity(options, currentValidationCase(previous).quote.declaration, quote.identity);
      await verifyCaseSources(options, previous, quote.cases.map(item => item.caseId), quote.identity);
      const roots = await observeCaseRoots(options, quote.cases.map(item => item.caseId), true);
      if (quote.cases.some(item => item.artifactRoot !== roots.get(item.caseId))
        || !sameValue(await verifyClosureDecision(store.root, quote, decision, now()), operatorDecision)) throw new Error('Allocation closure source or fixed artifact root changed.');
      return structuredClone(existing);
    }
    if (previous.validation!.cases.some(window => window.operatorDecision.decisionId === decision.decisionId)) throw new Error('Allocation closure requires a separate operator decision ID.');
    const bytes = await regularFile(store.root, 'snapshot.json');
    if (previous.revision !== quote.basis.revision || validationHash(bytes) !== quote.basis.snapshotSha256) throw new Error('Allocation closure quote is stale.');
    const fresh = await quoteFor(options, previous, bytes, quote.cases.map(item => item.caseId), true);
    if (!sameValue(fresh, quote)) throw new Error('Allocation closure quote or its exact source identity changed.');
    if (!sameValue(await verifyClosureDecision(store.root, quote, decision, now()), operatorDecision)) throw new Error('Allocation closure operator source changed during verification.');
    const appliedAt = new Date(now()).toISOString(), receipt = { appliedAt, quote, operatorDecision }, next = structuredClone(previous);
    next.ledger.contractVersion = '3.0.0';
    next.ledger.allocationClosures = [...(next.ledger.allocationClosures ?? []), ...quote.closures.map(item => ({ taskId: item.taskId, decisionId: decision.decisionId, releasedMicroCny: item.releasedMicroCny }))];
    next.allocationClosureDecisions = [...(next.allocationClosureDecisions ?? []), receipt];
    next.events.push({ sequence: next.events.length + 1, at: appliedAt, type: 'validation_allocation_closed', requestId: null,
      reason: JSON.stringify({ decisionId: decision.decisionId, quoteId: quote.quoteId, releasedMicroCny: quote.releasedMicroCny }) });
    next.revision++;
    const issues = validateLedgerUpdate(previous.ledger, next.ledger, { role: 'system', actorId: 'validation-allocation-closure' }, { validationClosureUpgrade: true });
    if (issues.length) throw new Error(`Invalid allocation closure: ${issues.map(issue => issue.message).join('; ')}`);
    validateSnapshot(next); await store.write(next); return structuredClone(receipt);
  } finally { await store.close(); }
}
