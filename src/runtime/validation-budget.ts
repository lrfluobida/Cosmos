import { createHash } from 'node:crypto';
import { regularFile } from '../artifacts/paths.ts';
import { sameValue } from '../contracts/validation.ts';
import { COS16_GROUP_GRANTS, validationBudgetGroup } from '../contracts/budget.ts';
import type { BudgetLedger } from '../contracts/types.ts';
import type { RunSnapshot } from './run-types.ts';
import type { ValidationBudgetGroupBinding, ValidationCaseQuote, ValidationDeclaration } from './validation-types.ts';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function requireThat(condition: unknown, message: string): asserts condition { if (!condition) throw new Error('COS-16 budget group: ' + message); }

/** Read-only exact parent source; the operator receipt authorizes this complete quote. */
export function prepareValidationBudgetGroup(state: RunSnapshot, declaration: ValidationDeclaration): ValidationBudgetGroupBinding | undefined {
  if (declaration.formatVersion !== 'validation-declaration-3') return undefined;
  requireThat(state.formatVersion === 3 && ['3.0.0', '4.0.0'].includes(state.ledger.contractVersion), 'requires the existing audited validation ledger.');
  const index = state.ledger.allocations.findIndex(item => item.taskId === 'COS-16'), parent = state.ledger.allocations[index];
  requireThat(parent?.amountMicroCny === 10_000_000 && !state.ledger.allocationClosures?.some(item => item.taskId === 'COS-16'), 'original parent allocation is missing, changed or closed.');
  const delegations = state.ledger.allocationDelegations ?? [], group = validationBudgetGroup(state.ledger);
  if (!delegations.length) requireThat(Object.entries(COS16_GROUP_GRANTS).every(([role, amount]) => declaration.grants[role as keyof typeof COS16_GROUP_GRANTS].amountMicroCny === amount), 'first delegation requires the exact approved five grant vector.');
  const parentCommitted = state.ledger.entries.filter(item => item.taskId === parent.taskId).reduce((sum, item) => sum + item.settledMicroCny + item.reservedMicroCny, 0);
  const allocatedMicroCny = group?.allocatedMicroCny ?? parentCommitted, committedMicroCny = group?.committedMicroCny ?? parentCommitted;
  const first = delegations[0] && state.validation!.cases.find(item => item.caseId === delegations[0].caseId);
  const parentAllocation = first?.quote.budgetGroup?.parentAllocation ?? { index, taskId: 'COS-16' as const, amountMicroCny: 10_000_000 as const,
    sha256: hash(JSON.stringify(parent)), source: { artifactId: 'original-COS-16-allocation', version: `revision-${state.revision}`, location: `snapshot.json#ledger/allocations/${index}` } };
  requireThat(parentAllocation.index === index && parentAllocation.sha256 === hash(JSON.stringify(parent)), 'immutable parent allocation source changed.');
  const amount = Object.values(declaration.grants).reduce((sum, item) => sum + item.amountMicroCny, 0), availableAllocationMicroCny = 10_000_000 - allocatedMicroCny;
  requireThat(Number.isSafeInteger(availableAllocationMicroCny) && amount <= availableAllocationMicroCny && committedMicroCny <= 10_000_000, 'new child grants exceed remaining original group capacity.');
  return { parentAllocation: structuredClone(parentAllocation), authorizationDecisionId: delegations[0]?.authorizationDecisionId ?? null,
    memberCaseIds: delegations.map(item => item.caseId), committedMicroCny, allocatedMicroCny, availableAllocationMicroCny };
}

/** The old audit prefixes retain their original capacity; only ledger4 delegations are projected. */
export function historicalDelegations(state: RunSnapshot, allocations: BudgetLedger['allocations']) {
  return (state.ledger.allocationDelegations ?? []).filter(item => item.taskIds.every(id => allocations.some(allocation => allocation.taskId === id)));
}

export function validateValidationBudgetGroups(state: RunSnapshot): void {
  const grouped = state.validation?.cases.filter(item => item.quote.declaration.formatVersion === 'validation-declaration-3') ?? [];
  if (!grouped.length) { requireThat(state.ledger.contractVersion !== '4.0.0' && state.ledger.allocationDelegations === undefined, 'ledger4 requires authenticated grouped cases.'); return; }
  requireThat(state.formatVersion === 3 && state.ledger.contractVersion === '4.0.0', 'grouped cases require the explicit ledger4 contract.');
  const expected: NonNullable<BudgetLedger['allocationDelegations']> = [], firstDecision = grouped[0].operatorDecision.decisionId;
  for (const window of grouped) {
    const quote = window.quote, grantIds = (Object.keys(COS16_GROUP_GRANTS) as (keyof typeof COS16_GROUP_GRANTS)[]).map(role => quote.declaration.grants[role].taskId);
    const start = state.ledger.allocations.findIndex(item => item.taskId === grantIds[0]);
    requireThat(start >= 0 && sameValue(state.ledger.allocations.slice(start, start + 5).map(item => item.taskId), grantIds), 'child grants are not the exact appended case envelope.');
    const oldClosures = (state.allocationClosureDecisions ?? []).filter(item => item.quote.basis.revision < quote.basis.revision)
      .flatMap(item => item.quote.closures.map(closure => ({ taskId: closure.taskId, decisionId: item.operatorDecision.decisionId, releasedMicroCny: closure.releasedMicroCny })));
    const prior: RunSnapshot = { ...state, revision: quote.basis.revision,
      ledger: { ...state.ledger, contractVersion: expected.length ? '4.0.0' : '3.0.0', allocations: state.ledger.allocations.slice(0, start),
        entries: state.ledger.entries.filter(item => quote.basis.requestIds.includes(item.requestId)), allocationClosures: oldClosures,
        ...(expected.length ? { allocationDelegations: structuredClone(expected) } : { allocationDelegations: undefined }) },
      validation: { ...state.validation!, cases: state.validation!.cases.filter(item => item.quote.basis.revision < quote.basis.revision) } };
    requireThat(quote.formatVersion === 'validation-case-quote-2' && sameValue(quote.budgetGroup, prepareValidationBudgetGroup(prior, quote.declaration)), 'parent source, group basis or historical membership changed.');
    if (!expected.length) requireThat(quote.budgetGroup!.parentAllocation.source.version === `revision-${quote.basis.revision}`
      && quote.budgetGroup!.parentAllocation.source.artifactId === 'original-COS-16-allocation'
      && quote.budgetGroup!.parentAllocation.source.location === `snapshot.json#ledger/allocations/${quote.budgetGroup!.parentAllocation.index}`, 'parent allocation reference changed.');
    expected.push({ parentTaskId: 'COS-16', authorizationDecisionId: firstDecision, caseId: window.caseId, decisionId: window.operatorDecision.decisionId, taskIds: grantIds });
  }
  requireThat(sameValue(state.ledger.allocationDelegations, expected), 'delegations do not match exact authenticated case grants.');
}

/** Re-read actual source bytes before every grouped provider/tool/child dispatch. */
export async function verifyValidationBudgetSources(root: string, state: RunSnapshot): Promise<void> {
  if (state.ledger.contractVersion !== '4.0.0') return;
  for (const delegation of state.ledger.allocationDelegations!) {
    const window = state.validation!.cases.find(item => item.caseId === delegation.caseId)!;
    const { sourceSha256, source, ...decision } = window.operatorDecision;
    const bytes = await regularFile(root, source.location), value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    requireThat(hash(bytes) === sourceSha256 && sameValue(value, { formatVersion: 'operator-validation-decision-1', ...decision, quote: window.quote }), 'actual operator delegation source changed.');
  }
}

export function requireBudgetGroupQuote(quote: ValidationCaseQuote, state: RunSnapshot): void {
  requireThat(sameValue(quote.budgetGroup, prepareValidationBudgetGroup(state, quote.declaration)), 'parent allocation or group quote is stale.');
}
