import { sameValue } from '../../src/contracts/validation.ts';
import { freeze } from '../../src/roles/requirements.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import type { ValidationDeclaration } from '../../src/runtime/validation-types.ts';
import { prepareValidationBudgetGroup } from '../../src/runtime/validation-budget.ts';
import { VALIDATION_ROLES, validateValidationDeclaration } from '../../src/runtime/validation-validation.ts';
import { deriveTransferValidationCaseNineDeclaration, parseTransferValidationCaseNineEntry, transferCaseNineHistory } from './validation-case-nine-declaration.ts';

export const TRANSFER_VALIDATION_CASE_TEN_ID = 'cos20-transfer-validation-10';
const amounts = { planning: 1, design: 1, art: 1, coding: 2_400_000, repair: 599_997 };
export function transferCaseTenHistory(state: RunSnapshot) { return freeze([...transferCaseNineHistory(state), deriveTransferValidationCaseNineDeclaration(state)]); }
/** New operator envelope; historical grants and settled costs are never rewritten or carried forward as new role grants. */
export function deriveTransferValidationCaseTenDeclaration(state: RunSnapshot): ValidationDeclaration {
  return deriveFixedThreeYuanTransferSuccessor(state, transferCaseTenHistory(state), 'ten');
}
/** Only these source-owned successors share the new three yuan envelope; no budget or case selector reaches the CLI. */
export function deriveFixedThreeYuanTransferSuccessor(state: RunSnapshot, history: readonly ValidationDeclaration[], selected: 'ten' | 'eleven'): ValidationDeclaration {
  if (selected !== 'ten' && selected !== 'eleven') throw new Error('Unknown fixed three yuan successor.');
  const ten = selected === 'ten', members = ten ? 9 : 10, count = ten ? 31 : 40, prior = ten ? 'C9' : 'C10';
  const caseId = ten ? TRANSFER_VALIDATION_CASE_TEN_ID : 'cos20-transfer-validation-11';
  function requireThat(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(`Case${ten ? 10 : 11} fixed budget: ${message}`); }
  const previous = history.at(-1)!;
  requireThat(history.length === members && previous.caseId === `cos20-transfer-validation-${members}`, 'fixed predecessor history changed.');
  const matches = state.validation!.cases.filter(w => w.caseId === previous.caseId), window = matches[0];
  requireThat(matches.length === 1 && window.stopReason && window.repair === null && sameValue(window.quote.declaration, previous), `stopped original ${prior} declaration or no-repair history changed.`);
  requireThat(sameValue(state.ledger.allocationDelegations?.slice(0, members).map(d => d.caseId), history.map(d => d.caseId))
    && sameValue(state.ledger.allocationDelegations![members - 1].taskIds, VALIDATION_ROLES.map(role => previous.grants[role].taskId)), `exact ${ten ? 'nine' : 'ten'} original delegation members are required.`);
  const requests = state.requests.filter(r => r.validation?.caseId === previous.caseId), rows = state.ledger.entries.filter(e => VALIDATION_ROLES.some(role => previous.grants[role].taskId === e.taskId));
  requireThat(rows.length === count && requests.length === rows.length, `${prior} requires its ${ten ? 'thirty-one' : 'forty'} original coding author costs.`);
  let cost = 0;
  for (const row of rows) {
    const request = requests.find(r => r.requestId === row.requestId);
    requireThat(row.taskId === previous.grants.coding.taskId && request?.validation?.windowId === window.windowId
      && request.validation.purpose === 'author' && request.admittedAt !== null, `original ${prior} cost/request role or window changed.`);
    requireThat(row.status === 'settled' && !row.unknown && row.reservedMicroCny === 0 && row.evidence.length > 0
      && Number.isSafeInteger(row.settledMicroCny) && row.settledMicroCny >= 0, `${prior} needs actual settled costs and evidence.`);
    cost += row.settledMicroCny;
  }
  for (const role of VALIDATION_ROLES) {
    const released = previous.grants[role].amountMicroCny - (role === 'coding' ? cost : 0), closures = state.ledger.allocationClosures!.filter(c => c.taskId === previous.grants[role].taskId);
    requireThat(Number.isSafeInteger(released) && released >= 0 && closures.length === 1 && closures[0].releasedMicroCny === released, `original ${prior} closed grant net differs from actual settled costs.`);
  }
  const declaration = freeze<ValidationDeclaration>({ ...structuredClone(previous), caseId,
    limits: { ...previous.limits, incrementalMicroCny: 3_000_000 },
    grants: Object.fromEntries(VALIDATION_ROLES.map(role => [role, { taskId: `${caseId}-${role}`, amountMicroCny: amounts[role] }])) as ValidationDeclaration['grants'] });
  validateValidationDeclaration(declaration);
  if (!state.validation!.cases.some(w => w.caseId === declaration.caseId)) {
    const group = prepareValidationBudgetGroup(state, declaration)!;
    requireThat(group.allocatedMicroCny === group.committedMicroCny, 'all historical group grants must be closed before the new envelope.');
  }
  return declaration;
}
export function parseTransferValidationCaseTenEntry(args: string[]) {
  try { return { ...parseTransferValidationCaseNineEntry(args), caseId: TRANSFER_VALIDATION_CASE_TEN_ID }; }
  catch { throw new Error('Usage: probes/transfer/validation-case-ten-run.ts --validation-preflight <reviewed-main-sha> | --validation-case <reviewed-main-sha> <operator-validation-source>'); }
}
