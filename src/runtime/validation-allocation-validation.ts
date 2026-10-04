import { evidenceReferences } from '../budget/ledger.ts';
import { sameValue } from '../contracts/validation.ts';
import type { RunSnapshot } from './run-types.ts';
import type { ValidationAllocationClosureQuote } from './validation-types.ts';
import { VALIDATION_ROLES, validationHash, validationInputHash } from './validation-validation.ts';
import { budgetCapacity } from '../contracts/budget.ts';
import { historicalDelegations } from './validation-budget.ts';

const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const sha = (value: unknown, length = 64): value is string => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
function fail(): never { throw new Error('Invalid validation allocation closure quote or decision history.'); }
function fields(value: unknown, keys: string[]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail();
}

/** Structural and historical binding; filesystem/source identity is checked separately at quote/apply. */
export function validateValidationAllocationClosureQuote(quote: ValidationAllocationClosureQuote, state: RunSnapshot): void {
  fields(quote, ['formatVersion', 'profile', 'activationAllowed', 'quoteId', 'identity', 'basis', 'cases', 'closures', 'releasedMicroCny', 'allocatedAfterMicroCny']);
  const { quoteId, ...payload } = quote;
  const grouped = quote.formatVersion === 'validation-allocation-closure-quote-2';
  if (!['validation-allocation-closure-quote-1', 'validation-allocation-closure-quote-2'].includes(quote.formatVersion) || quote.profile !== 'operator_validation_allocation_closure' || quote.activationAllowed !== false
    || quoteId !== `${grouped ? 'vacq2' : 'vacq1'}-${validationHash(JSON.stringify(payload))}` || !Array.isArray(quote.cases) || !quote.cases.length || !Array.isArray(quote.closures)) fail();
  fields(quote.identity, ['reviewedPlatformSha', 'frozenCaseInputHash']);
  fields(quote.basis, ['runId', 'ledgerId', 'specVersion', 'revision', 'snapshotSha256', 'currentCaseId', 'originalStartedAt', 'originalDeadlineAt', 'originalLimitMicroCny',
    'stopReason', 'allocatedMicroCny', 'committedMicroCny', 'allocations', 'entries', 'requests', ...(grouped ? ['allocationDelegations'] : [])]);
  const basis = quote.basis;
  if (basis.runId !== state.run.runId || basis.ledgerId !== state.ledger.ledgerId || basis.specVersion !== state.run.specVersion || !integer(basis.revision)
    || !sha(basis.snapshotSha256) || !sha(quote.identity.reviewedPlatformSha, 40) || !sha(quote.identity.frozenCaseInputHash)
    || basis.originalStartedAt !== state.run.originalStartedAt || basis.originalDeadlineAt !== state.run.originalDeadlineAt || basis.originalLimitMicroCny !== state.ledger.limitMicroCny
    || !sameValue(basis.stopReason, state.stopReason) || !integer(basis.allocatedMicroCny) || !integer(basis.committedMicroCny)
    || !Array.isArray(basis.allocations) || !Array.isArray(basis.entries) || !Array.isArray(basis.requests)
    || !sameValue(basis.allocations, state.ledger.allocations.slice(0, basis.allocations.length))
    || !sameValue(basis.entries, state.ledger.entries.slice(0, basis.entries.length)) || !sameValue(basis.requests, state.requests.slice(0, basis.requests.length))
    || basis.committedMicroCny !== basis.entries.reduce((sum, entry) => sum + entry.settledMicroCny + entry.reservedMicroCny, 0)
    || basis.entries.some(entry => entry.reservedMicroCny || entry.unknown || !['settled', 'cancelled'].includes(entry.status))) fail();
  const current = state.validation?.cases.find(window => window.caseId === basis.currentCaseId);
  if (grouped && !sameValue(basis.allocationDelegations, historicalDelegations(state, basis.allocations))) fail();
  if (!current?.stopReason || quote.identity.frozenCaseInputHash !== validationInputHash(current.quote.declaration)
    || new Set(quote.cases.map(item => item.caseId)).size !== quote.cases.length) fail();
  const expected: ValidationAllocationClosureQuote['closures'] = [];
  for (const item of quote.cases) {
    fields(item, ['caseId', 'artifactRoot', 'windowId', 'stopReason', 'originalQuoteId', 'originalOperatorSourceSha256', 'taskIds', 'requestIds']);
    const window = state.validation?.cases.find(window => window.caseId === item.caseId);
    if (!window?.stopReason || typeof item.artifactRoot !== 'string' || !item.artifactRoot || item.windowId !== window.windowId || !sameValue(item.stopReason, window.stopReason)
      || item.originalQuoteId !== window.quote.quoteId || item.originalOperatorSourceSha256 !== window.operatorDecision.sourceSha256
      || !sameValue(item.taskIds, VALIDATION_ROLES.map(role => window.quote.declaration.grants[role].taskId))) fail();
    const entries = basis.entries.filter(entry => item.taskIds.includes(entry.taskId));
    if (!sameValue(entries, state.ledger.entries.filter(entry => item.taskIds.includes(entry.taskId))) || !sameValue(item.requestIds, entries.map(entry => entry.requestId))
      || entries.some(entry => entry.reservedMicroCny || entry.unknown || !['settled', 'cancelled'].includes(entry.status))) fail();
    for (const role of VALIDATION_ROLES) {
      const grant = window.quote.declaration.grants[role], allocated = basis.allocations.find(allocation => allocation.taskId === grant.taskId);
      const spentMicroCny = entries.filter(entry => entry.taskId === grant.taskId).reduce((sum, entry) => sum + entry.settledMicroCny, 0);
      if (!allocated || allocated.amountMicroCny !== grant.amountMicroCny) fail();
      expected.push({ caseId: item.caseId, taskId: grant.taskId, allocatedMicroCny: grant.amountMicroCny, spentMicroCny, releasedMicroCny: grant.amountMicroCny - spentMicroCny });
    }
  }
  const released = expected.reduce((sum, closure) => sum + closure.releasedMicroCny, 0);
  const priorClosures = (state.allocationClosureDecisions ?? []).filter(item => item.quote.basis.revision < basis.revision)
    .flatMap(item => item.quote.closures.map(closure => ({ taskId: closure.taskId, decisionId: item.operatorDecision.decisionId, releasedMicroCny: closure.releasedMicroCny })));
  const allocatedAfter = grouped ? budgetCapacity({ ...state.ledger, contractVersion: '4.0.0', allocations: basis.allocations, entries: basis.entries,
    allocationDelegations: basis.allocationDelegations, allocationClosures: [...priorClosures, ...expected.map(item => ({ taskId: item.taskId, decisionId: 'pending-closure', releasedMicroCny: item.releasedMicroCny }))] }).allocatedMicroCny : basis.allocatedMicroCny - released;
  if (!sameValue(quote.closures, expected) || expected.some(closure => !integer(closure.releasedMicroCny)) || !integer(released)
    || quote.releasedMicroCny !== released || !integer(quote.allocatedAfterMicroCny) || quote.allocatedAfterMicroCny !== allocatedAfter) fail();
}

export function validateValidationAllocationClosures(state: RunSnapshot): void {
  const decisions = state.allocationClosureDecisions;
  if (!['3.0.0', '4.0.0'].includes(state.ledger.contractVersion)) { if (decisions !== undefined || state.events.some(event => event.type === 'validation_allocation_closed')) fail(); return; }
  if (state.formatVersion !== 3 || !Array.isArray(decisions) || !decisions.length || new Set(decisions.map(item => item.operatorDecision?.decisionId)).size !== decisions.length) fail();
  const closures: NonNullable<RunSnapshot['ledger']['allocationClosures']> = [];
  for (const receipt of decisions) {
    fields(receipt, ['appliedAt', 'quote', 'operatorDecision']);
    validateValidationAllocationClosureQuote(receipt.quote, state);
    const originalCapacity = budgetCapacity({ ...state.ledger, contractVersion: receipt.quote.formatVersion === 'validation-allocation-closure-quote-2' ? '4.0.0' : '3.0.0',
      allocations: receipt.quote.basis.allocations, entries: receipt.quote.basis.entries, allocationClosures: closures, allocationDelegations: receipt.quote.basis.allocationDelegations }).allocatedMicroCny;
    if (!integer(originalCapacity) || receipt.quote.basis.allocatedMicroCny !== originalCapacity) fail();
    const decision = receipt.operatorDecision;
    fields(decision, ['kind', 'decisionId', 'actorId', 'decidedAt', 'source', 'sourceRefs', 'sourceSha256']);
    evidenceReferences([decision.source]); evidenceReferences(decision.sourceRefs);
    if (decision.kind !== 'operator_validation_allocation_closure' || !decision.decisionId?.trim() || !decision.actorId?.trim() || !timestamp(decision.decidedAt)
      || !timestamp(receipt.appliedAt) || Date.parse(decision.decidedAt) > Date.parse(receipt.appliedAt) || !sha(decision.sourceSha256) || receipt.quote.basis.revision >= state.revision
      || state.validation!.cases.some(window => window.operatorDecision.decisionId === decision.decisionId)
      || !state.events.some(event => event.type === 'validation_allocation_closed' && event.at === receipt.appliedAt && event.requestId === null && event.reason === JSON.stringify({ decisionId: decision.decisionId, quoteId: receipt.quote.quoteId, releasedMicroCny: receipt.quote.releasedMicroCny }))) fail();
    closures.push(...receipt.quote.closures.map(item => ({ taskId: item.taskId, decisionId: decision.decisionId, releasedMicroCny: item.releasedMicroCny })));
  }
  if (!sameValue(state.ledger.allocationClosures, closures) || new Set(closures.map(item => item.taskId)).size !== closures.length
    || state.events.filter(event => event.type === 'validation_allocation_closed').length !== decisions.length) fail();
}
