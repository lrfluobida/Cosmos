import { evidenceReferences } from '../budget/ledger.ts';
import { budgetCapacity, budgetSummary, COS16_SUPPLEMENT_CASE, COS16_SUPPLEMENT_GRANTS, COS16_SUPPLEMENT_MICRO_CNY, validationBudgetGroup } from '../contracts/budget.ts';
import { sameValue } from '../contracts/validation.ts';
import type { BudgetLedger } from '../contracts/types.ts';
import type { RunSnapshot } from './run-types.ts';
import type { ValidationGroupSupplementQuote } from './validation-types.ts';
import { validationHash, validationInputHash, VALIDATION_ROLES } from './validation-validation.ts';

function fail(): never { throw new Error('Invalid fixed validation group supplement or history.'); }
function fields(value: unknown, keys: string[]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !sameValue(Object.keys(value).sort(), keys.sort())) fail();
}
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const sha = (v: unknown, length = 64): v is string => typeof v === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(v);
const timestamp = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;

/** Historical prefixes suffice; no copy of the complete ledger is persisted in the new quote. */
export function supplementHistoryHash(state: RunSnapshot, basis: Pick<ValidationGroupSupplementQuote['basis'], 'allocationCount' | 'entryCount' | 'caseCount' | 'closureDecisionCount' | 'taskCount' | 'eventCount'>): string {
  return validationHash(JSON.stringify({ allocations: state.ledger.allocations.slice(0, basis.allocationCount), entries: state.ledger.entries.slice(0, basis.entryCount),
    requests: state.requests.slice(0, basis.entryCount), cases: state.validation!.cases.slice(0, basis.caseCount),
    closures: state.allocationClosureDecisions?.slice(0, basis.closureDecisionCount), tasks: state.tasks.slice(0, basis.taskCount), events: state.events.slice(0, basis.eventCount) }));
}

export function historicalSupplements(state: RunSnapshot, revision: number): NonNullable<BudgetLedger['allocationSupplements']> {
  return (state.ledger.allocationSupplements ?? []).filter(item => item.basisRevision < revision);
}

export function requireSupplementStopped(state: RunSnapshot): void {
  if (state.formatVersion !== 3 || state.run.kind !== 'evaluation' || state.ledger.scope !== 'validation' || state.ledger.contractVersion !== '4.0.0'
    || state.ledger.limitMicroCny !== 150_000_000 || !state.validation?.cases.length || state.validation.cases.some(window => !window.stopReason || window.stopReason.code === 'charge_overrun')
    || state.stopReason?.code === 'charge_overrun' || state.tasks.some(task => task.state === 'running' || task.attempts.some(attempt => attempt.outcome === 'running'))
    || state.validation.cases.some(window => VALIDATION_ROLES.some(role => !state.ledger.allocationClosures?.some(item => item.taskId === window.quote.declaration.grants[role].taskId)))
    || state.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny || !['settled', 'cancelled'].includes(entry.status))) throw new Error('Supplement requires the original ledger4 group, all cases stopped and closed, no running work, and reconciled charges.');
}

export function validateValidationGroupSupplementQuote(quote: ValidationGroupSupplementQuote, state: RunSnapshot): void {
  fields(quote, ['formatVersion', 'profile', 'activationAllowed', 'quoteId', 'identity', 'basis', 'parentAllocation', 'authorizationDecisionId', 'group', 'targetCaseId', 'additionalMicroCny', 'grants']);
  fields(quote.identity, ['reviewedPlatformSha', 'frozenCaseInputHash']);
  fields(quote.basis, ['runId', 'ledgerId', 'specVersion', 'revision', 'snapshotSha256', 'currentCaseId', 'originalStartedAt', 'originalDeadlineAt', 'originalLimitMicroCny',
    'allocatedMicroCny', 'committedMicroCny', 'unallocatedMicroCny', 'allocationCount', 'entryCount', 'caseCount', 'closureDecisionCount', 'taskCount', 'eventCount', 'historySha256']);
  const { quoteId, ...payload } = quote, b = quote.basis;
  if (quote.formatVersion !== 'validation-group-supplement-quote-1' || quote.profile !== 'operator_validation_group_supplement' || quote.activationAllowed !== false
    || quoteId !== `vgsq1-${validationHash(JSON.stringify(payload))}` || quote.targetCaseId !== COS16_SUPPLEMENT_CASE || quote.additionalMicroCny !== COS16_SUPPLEMENT_MICRO_CNY
    || !sameValue(quote.grants, COS16_SUPPLEMENT_GRANTS) || !sha(quote.identity.reviewedPlatformSha, 40) || !sha(quote.identity.frozenCaseInputHash)
    || !integer(b.revision) || b.revision < 1 || b.revision > state.revision || !sha(b.snapshotSha256) || !sha(b.historySha256)
    || b.runId !== state.run.runId || b.ledgerId !== state.ledger.ledgerId || b.specVersion !== state.run.specVersion
    || b.originalStartedAt !== state.run.originalStartedAt || b.originalDeadlineAt !== state.run.originalDeadlineAt || b.originalLimitMicroCny !== state.ledger.limitMicroCny
    || [b.allocationCount, b.entryCount, b.caseCount, b.closureDecisionCount, b.taskCount, b.eventCount].some(n => !integer(n))
    || b.allocationCount > state.ledger.allocations.length || b.entryCount > state.ledger.entries.length || b.caseCount < 1 || b.caseCount > (state.validation?.cases.length ?? 0)
    || b.closureDecisionCount < 1 || b.closureDecisionCount > (state.allocationClosureDecisions?.length ?? 0) || b.taskCount > state.tasks.length || b.eventCount > state.events.length
    || supplementHistoryHash(state, b) !== b.historySha256) fail();
  const cases = state.validation!.cases.slice(0, b.caseCount), current = cases.at(-1)!;
  const allocations = state.ledger.allocations.slice(0, b.allocationCount), entries = state.ledger.entries.slice(0, b.entryCount);
  const closures = state.allocationClosureDecisions!.slice(0, b.closureDecisionCount).flatMap(receipt => receipt.quote.closures.map(c => ({ taskId: c.taskId, decisionId: receipt.operatorDecision.decisionId, releasedMicroCny: c.releasedMicroCny })));
  const delegations = state.ledger.allocationDelegations!.filter(item => cases.some(window => window.caseId === item.caseId));
  const prior: RunSnapshot = { ...state, revision: b.revision, tasks: state.tasks.slice(0, b.taskCount), validation: { ...state.validation!, currentCaseId: current.caseId, cases },
    ledger: { ...state.ledger, contractVersion: '4.0.0', allocations, entries, allocationClosures: closures, allocationDelegations: delegations, allocationSupplements: undefined } };
  requireSupplementStopped(prior);
  const group = validationBudgetGroup(prior.ledger)!, capacity = budgetCapacity(prior.ledger), committed = budgetSummary(prior.ledger).committedMicroCny;
  const first = cases.find(window => window.caseId === delegations[0]?.caseId), parent = first?.quote.budgetGroup?.parentAllocation;
  if (!parent || !sameValue(quote.parentAllocation, parent) || parent.sha256 !== validationHash(JSON.stringify(allocations[parent.index]))
    || quote.authorizationDecisionId !== delegations[0].authorizationDecisionId || cases.some(window => window.caseId === quote.targetCaseId)
    || current.caseId !== b.currentCaseId || validationInputHash(current.quote.declaration) !== quote.identity.frozenCaseInputHash
    || !sameValue(quote.group, { limitMicroCny: group.limitMicroCny, allocatedMicroCny: group.allocatedMicroCny, committedMicroCny: group.committedMicroCny, availableAllocationMicroCny: group.limitMicroCny - group.allocatedMicroCny })
    || b.allocatedMicroCny !== capacity.allocatedMicroCny || b.committedMicroCny !== committed || b.unallocatedMicroCny !== capacity.effectiveLimitMicroCny - capacity.allocatedMicroCny
    || b.unallocatedMicroCny < COS16_SUPPLEMENT_MICRO_CNY || committed + 2_500_000 > 30_000_000
    || group.limitMicroCny - group.allocatedMicroCny + COS16_SUPPLEMENT_MICRO_CNY !== 2_500_000) fail();
}

export function validateValidationGroupSupplements(state: RunSnapshot): void {
  if (state.ledger.contractVersion !== '5.0.0') {
    if (state.allocationSupplementDecisions !== undefined || state.ledger.allocationSupplements !== undefined || state.events.some(event => event.type === 'validation_group_supplemented')) fail();
    return;
  }
  const receipts = state.allocationSupplementDecisions;
  if (state.formatVersion !== 3 || !receipts || receipts.length !== 1) fail();
  const receipt = receipts[0]; fields(receipt, ['appliedAt', 'quote', 'operatorDecision']);
  validateValidationGroupSupplementQuote(receipt.quote, state);
  const d = receipt.operatorDecision, q = receipt.quote;
  fields(d, ['kind', 'decisionId', 'actorId', 'decidedAt', 'source', 'sourceRefs', 'sourceSha256']);
  evidenceReferences([d.source]); evidenceReferences(d.sourceRefs);
  if (d.kind !== 'operator_validation_group_supplement' || !d.decisionId?.trim() || !d.actorId?.trim() || !timestamp(d.decidedAt) || !timestamp(receipt.appliedAt)
    || Date.parse(d.decidedAt) > Date.parse(receipt.appliedAt) || !sha(d.sourceSha256) || q.basis.revision >= state.revision
    || state.validation!.cases.some(window => window.operatorDecision.decisionId === d.decisionId) || state.allocationClosureDecisions!.some(item => item.operatorDecision.decisionId === d.decisionId)
    || !sameValue(state.ledger.allocationSupplements, [{ parentTaskId: 'COS-16', authorizationDecisionId: q.authorizationDecisionId, decisionId: d.decisionId,
      basisRevision: q.basis.revision, targetCaseId: q.targetCaseId, additionalMicroCny: q.additionalMicroCny, grants: q.grants }])) fail();
  const events = state.events.filter(event => event.type === 'validation_group_supplemented');
  if (events.length !== 1 || events[0].sequence !== q.basis.eventCount + 1 || events[0].at !== receipt.appliedAt || events[0].requestId !== null
    || events[0].reason !== JSON.stringify({ decisionId: d.decisionId, quoteId: q.quoteId, additionalMicroCny: q.additionalMicroCny })) fail();
}
