import { sameValue } from '../../src/contracts/validation.ts';
import { freeze } from '../../src/roles/requirements.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import type { ValidationDeclaration } from '../../src/runtime/validation-types.ts';
import { prepareValidationBudgetGroup } from '../../src/runtime/validation-budget.ts';
import { VALIDATION_ROLES, validateValidationDeclaration } from '../../src/runtime/validation-validation.ts';
import { deriveTransferValidationCaseTwelveDeclaration, parseTransferValidationCaseTwelveEntry, transferCaseTwelveHistory } from './validation-case-twelve-declaration.ts';

export const TRANSFER_VALIDATION_CASE_THIRTEEN_ID = 'cos20-transfer-validation-13';
const amounts = { planning: 1, design: 1, art: 1, coding: 1_900_000, repair: 599_997 };
export function transferCaseThirteenHistory(state: RunSnapshot) { return freeze([...transferCaseTwelveHistory(state), deriveTransferValidationCaseTwelveDeclaration(state)]); }
/** C13 alone uses this fixed envelope; the original three yuan declarations remain historical inputs. */
export function deriveTransferValidationCaseThirteenDeclaration(state: RunSnapshot): ValidationDeclaration {
  function requireThat(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(`Case13 fixed budget: ${message}`); }
  const history = transferCaseThirteenHistory(state), previous = history.at(-1)!;
  requireThat(history.length === 12 && previous.caseId === 'cos20-transfer-validation-12', 'fixed predecessor history changed.');
  const matches = state.validation!.cases.filter(w => w.caseId === previous.caseId), window = matches[0];
  requireThat(matches.length === 1 && window.stopReason && window.repair === null && sameValue(window.quote.declaration, previous), 'stopped original C12 declaration or no-repair history changed.');
  requireThat(sameValue(state.ledger.allocationDelegations?.slice(0, 12).map(d => d.caseId), history.map(d => d.caseId))
    && sameValue(state.ledger.allocationDelegations![11].taskIds, VALIDATION_ROLES.map(role => previous.grants[role].taskId)), 'exact twelve original delegation members are required.');
  const requests = state.requests.filter(r => r.validation?.caseId === previous.caseId), rows = state.ledger.entries.filter(e => VALIDATION_ROLES.some(role => previous.grants[role].taskId === e.taskId));
  requireThat(rows.length === 52 && requests.length === rows.length, 'C12 requires its fifty-two original coding author costs.');
  let cost = 0;
  for (const row of rows) {
    const request = requests.find(r => r.requestId === row.requestId);
    requireThat(row.taskId === previous.grants.coding.taskId && request?.validation?.windowId === window.windowId
      && request.validation.purpose === 'author' && request.admittedAt !== null, 'original C12 cost/request role or window changed.');
    requireThat(row.status === 'settled' && !row.unknown && row.reservedMicroCny === 0 && row.evidence.length > 0
      && Number.isSafeInteger(row.settledMicroCny) && row.settledMicroCny >= 0, 'C12 needs actual settled costs and evidence.');
    cost += row.settledMicroCny;
  }
  for (const role of VALIDATION_ROLES) {
    const released = previous.grants[role].amountMicroCny - (role === 'coding' ? cost : 0), closures = state.ledger.allocationClosures!.filter(c => c.taskId === previous.grants[role].taskId);
    requireThat(Number.isSafeInteger(released) && released >= 0 && closures.length === 1 && closures[0].releasedMicroCny === released, 'original C12 closed grant net differs from actual settled costs.');
  }
  const declaration = freeze<ValidationDeclaration>({ ...structuredClone(previous), caseId: TRANSFER_VALIDATION_CASE_THIRTEEN_ID,
    limits: { ...previous.limits, incrementalMicroCny: 2_500_000 },
    grants: Object.fromEntries(VALIDATION_ROLES.map(role => [role, { taskId: `${TRANSFER_VALIDATION_CASE_THIRTEEN_ID}-${role}`, amountMicroCny: amounts[role] }])) as ValidationDeclaration['grants'] });
  validateValidationDeclaration(declaration);
  if (!state.validation!.cases.some(w => w.caseId === declaration.caseId)) {
    const group = prepareValidationBudgetGroup(state, declaration)!;
    requireThat(group.allocatedMicroCny === group.committedMicroCny, 'all historical group grants must be closed before the new envelope.');
  }
  return declaration;
}
export function parseTransferValidationCaseThirteenEntry(args: string[]) {
  try { return { ...parseTransferValidationCaseTwelveEntry(args), caseId: TRANSFER_VALIDATION_CASE_THIRTEEN_ID }; }
  catch { throw new Error('Usage: probes/transfer/validation-case-thirteen-run.ts --validation-preflight <reviewed-main-sha> | --validation-case <reviewed-main-sha> <operator-validation-source>'); }
}
