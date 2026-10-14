import { lstat } from 'node:fs/promises';
import { regularFile, safePath } from '../artifacts/paths.ts';
import { evidenceReferences, nonEmpty } from '../budget/ledger.ts';
import { budgetCapacity, budgetSummary, COS16_SUPPLEMENT_CASE, COS16_SUPPLEMENT_GRANTS, COS16_SUPPLEMENT_MICRO_CNY, validationBudgetGroup } from '../contracts/budget.ts';
import { sameValue } from '../contracts/validation.ts';
import { validateLedgerUpdate } from '../contracts/updates.ts';
import { SnapshotStore } from './store.ts';
import { validateSnapshot } from './run-validation.ts';
import { requireNoRegistryWriter } from './window-idle.ts';
import { verifyOperatorDecision, verifyValidationIdentity } from './validation-window.ts';
import { verifyValidationBudgetSources } from './validation-budget.ts';
import { currentValidationCase, validationHash } from './validation-validation.ts';
import { requireSupplementStopped, supplementHistoryHash, validateValidationGroupSupplementQuote } from './validation-group-supplement-validation.ts';
import type { RunSnapshot } from './run-types.ts';
import type { ApplyValidationGroupSupplementOptions, OperatorValidationGroupSupplementDecision, ValidationContextOptions, ValidationGroupSupplementQuote, ValidationGroupSupplementReceipt } from './validation-types.ts';

async function absentOwner(root: string): Promise<void> {
  const path = await safePath(root, '.controller.lock');
  if (await lstat(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) throw new Error('Supplement owner or child drain is unresolved.');
}
async function idle(options: ValidationContextOptions, state: RunSnapshot, owned: boolean): Promise<void> {
  await safePath(options.repositoryRoot);
  if (!owned) await absentOwner(options.root);
  await requireNoRegistryWriter(options.root);
  for (const window of state.validation!.cases) {
    const root = await safePath(options.repositoryRoot, `.cosmos/e2e/${window.caseId}`);
    if (!(await lstat(root)).isDirectory()) throw new Error('Supplement existing case root is missing or invalid.');
    await absentOwner(root); await requireNoRegistryWriter(root);
  }
}

async function historicalSources(options: ValidationContextOptions, state: RunSnapshot): Promise<void> {
  await verifyValidationBudgetSources(options.root, state);
  for (const window of state.validation!.cases) {
    const { sourceSha256, ...decision } = window.operatorDecision;
    if ((await verifyOperatorDecision(options.root, window.quote, decision, (options.now ?? Date.now)())).sourceSha256 !== sourceSha256) throw new Error('Supplement historical case operator source changed.');
  }
  for (const receipt of state.allocationClosureDecisions!) {
    const { sourceSha256, source, ...decision } = receipt.operatorDecision;
    const bytes = await regularFile(options.root, source.location), value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (validationHash(bytes) !== sourceSha256 || !sameValue(value, { formatVersion: 'operator-validation-allocation-closure-decision-1', ...decision, quote: receipt.quote })) throw new Error('Supplement historical closure operator source changed.');
  }
}

async function quoteFor(options: ValidationContextOptions, state: RunSnapshot, bytes: Buffer, owned: boolean): Promise<ValidationGroupSupplementQuote> {
  requireSupplementStopped(state);
  await idle(options, state, owned); await historicalSources(options, state);
  const observed = await verifyValidationIdentity(options, currentValidationCase(state).quote.declaration);
  const capacity = budgetCapacity(state.ledger), group = validationBudgetGroup(state.ledger)!;
  const first = state.validation!.cases.find(window => window.caseId === state.ledger.allocationDelegations![0].caseId)!;
  const counts = { allocationCount: state.ledger.allocations.length, entryCount: state.ledger.entries.length, caseCount: state.validation!.cases.length,
    closureDecisionCount: state.allocationClosureDecisions!.length, taskCount: state.tasks.length, eventCount: state.events.length };
  const value: Omit<ValidationGroupSupplementQuote, 'quoteId'> = {
    formatVersion: 'validation-group-supplement-quote-1', profile: 'operator_validation_group_supplement', activationAllowed: false, identity: observed.identity,
    basis: { runId: state.run.runId, ledgerId: state.ledger.ledgerId, specVersion: state.run.specVersion, revision: state.revision, snapshotSha256: validationHash(bytes),
      currentCaseId: currentValidationCase(state).caseId, originalStartedAt: state.run.originalStartedAt, originalDeadlineAt: state.run.originalDeadlineAt, originalLimitMicroCny: state.ledger.limitMicroCny,
      allocatedMicroCny: capacity.allocatedMicroCny, committedMicroCny: budgetSummary(state.ledger).committedMicroCny, unallocatedMicroCny: capacity.effectiveLimitMicroCny - capacity.allocatedMicroCny,
      ...counts, historySha256: supplementHistoryHash(state, counts) },
    parentAllocation: structuredClone(first.quote.budgetGroup!.parentAllocation), authorizationDecisionId: state.ledger.allocationDelegations![0].authorizationDecisionId,
    group: { limitMicroCny: group.limitMicroCny, allocatedMicroCny: group.allocatedMicroCny, committedMicroCny: group.committedMicroCny, availableAllocationMicroCny: group.limitMicroCny - group.allocatedMicroCny },
    targetCaseId: COS16_SUPPLEMENT_CASE, additionalMicroCny: COS16_SUPPLEMENT_MICRO_CNY, grants: structuredClone(COS16_SUPPLEMENT_GRANTS),
  };
  const quote = { ...value, quoteId: `vgsq1-${validationHash(JSON.stringify(value))}` };
  validateValidationGroupSupplementQuote(quote, state);
  if (!bytes.equals(await regularFile(options.root, 'snapshot.json'))) throw new Error('Supplement snapshot baseline changed.');
  return quote;
}

/** Read only; the proposal itself grants no execution or budget authority. */
export async function prepareValidationGroupSupplement(options: ValidationContextOptions): Promise<ValidationGroupSupplementQuote> {
  const bytes = await regularFile(options.root, 'snapshot.json'), state = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); validateSnapshot(state);
  return quoteFor(options, state, bytes, false);
}

async function verifyDecision(root: string, quote: ValidationGroupSupplementQuote, decision: OperatorValidationGroupSupplementDecision, now: number) {
  if (decision.kind !== 'operator_validation_group_supplement' || Object.keys(decision).length !== 6
    || Object.keys(decision).some(key => !['kind', 'decisionId', 'actorId', 'decidedAt', 'source', 'sourceRefs'].includes(key))) throw new Error('Supplement requires an independent operator decision.');
  for (const key of ['decisionId', 'actorId', 'decidedAt'] as const) nonEmpty(decision[key], key);
  if (!Number.isFinite(Date.parse(decision.decidedAt)) || new Date(decision.decidedAt).toISOString() !== decision.decidedAt || Date.parse(decision.decidedAt) > now) throw new Error('Invalid supplement operator time.');
  evidenceReferences([decision.source]); evidenceReferences(decision.sourceRefs);
  const bytes = await regularFile(root, decision.source.location), receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const { source: _source, ...value } = decision;
  if (!sameValue(receipt, { formatVersion: 'operator-validation-group-supplement-decision-1', ...value, quote })) throw new Error('Operator source does not authorize this exact supplement quote.');
  return { ...structuredClone(decision), sourceSha256: validationHash(bytes) };
}

/** The sole 4→5 commit changes capacity, receipt and event together in the original snapshot. */
export async function applyValidationGroupSupplement(options: ApplyValidationGroupSupplementOptions): Promise<ValidationGroupSupplementReceipt> {
  const quote = structuredClone(options.quote), decision = structuredClone(options.decision), now = options.now ?? Date.now;
  await safePath(options.repositoryRoot); const store = await SnapshotStore.acquire(options.root);
  try {
    const previous = await store.read(); validateSnapshot(previous); validateValidationGroupSupplementQuote(quote, previous);
    const operatorDecision = await verifyDecision(store.root, quote, decision, now());
    const existing = previous.allocationSupplementDecisions?.find(item => item.operatorDecision.decisionId === decision.decisionId);
    if (existing) {
      if (!sameValue(existing.quote, quote) || !sameValue(existing.operatorDecision, operatorDecision)) throw new Error('Supplement decision conflicts with its recorded quote or source.');
      await historicalSources(options, previous);
      await verifyValidationIdentity(options, previous.validation!.cases.find(window => window.caseId === quote.basis.currentCaseId)!.quote.declaration, quote.identity);
      return structuredClone(existing);
    }
    if (previous.validation!.cases.some(window => window.operatorDecision.decisionId === decision.decisionId)
      || previous.allocationClosureDecisions!.some(item => item.operatorDecision.decisionId === decision.decisionId)) throw new Error('Supplement requires a separate decision identity.');
    const bytes = await regularFile(store.root, 'snapshot.json');
    if (previous.revision !== quote.basis.revision || validationHash(bytes) !== quote.basis.snapshotSha256) throw new Error('Supplement quote is stale.');
    if (!sameValue(await quoteFor(options, previous, bytes, true), quote)) throw new Error('Supplement quote, capacity or identity changed.');
    await verifyValidationIdentity(options, currentValidationCase(previous).quote.declaration, quote.identity);
    await historicalSources(options, previous); await idle(options, previous, true);
    if (!sameValue(await verifyDecision(store.root, quote, decision, now()), operatorDecision)) throw new Error('Supplement operator source changed during verification.');
    if (!bytes.equals(await regularFile(store.root, 'snapshot.json'))) throw new Error('Supplement snapshot baseline changed before commit.');
    const appliedAt = new Date(now()).toISOString(), receipt = { appliedAt, quote, operatorDecision }, next = structuredClone(previous);
    next.ledger.contractVersion = '5.0.0';
    next.ledger.allocationSupplements = [{ parentTaskId: 'COS-16', authorizationDecisionId: quote.authorizationDecisionId, decisionId: decision.decisionId,
      basisRevision: quote.basis.revision, targetCaseId: quote.targetCaseId, additionalMicroCny: quote.additionalMicroCny, grants: structuredClone(quote.grants) }];
    next.allocationSupplementDecisions = [receipt];
    next.events.push({ sequence: next.events.length + 1, at: appliedAt, type: 'validation_group_supplemented', requestId: null,
      reason: JSON.stringify({ decisionId: decision.decisionId, quoteId: quote.quoteId, additionalMicroCny: quote.additionalMicroCny }) });
    next.revision++;
    const issues = validateLedgerUpdate(previous.ledger, next.ledger, { role: 'system', actorId: 'validation-group-supplement' }, { validationSupplementUpgrade: true });
    if (issues.length) throw new Error(`Invalid supplement: ${issues.map(item => item.message).join('; ')}`);
    validateSnapshot(next); await store.write(next); return structuredClone(receipt);
  } finally { await store.close(); }
}
