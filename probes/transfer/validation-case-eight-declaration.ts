import { validationBudgetGroup } from '../../src/contracts/budget.ts';
import { sameValue } from '../../src/contracts/validation.ts';
import { freeze } from '../../src/roles/requirements.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import type { ValidationDeclaration } from '../../src/runtime/validation-types.ts';
import { VALIDATION_ROLES, validateValidationDeclaration } from '../../src/runtime/validation-validation.ts';
import { deriveTransferValidationCaseSevenDeclaration, TRANSFER_CASE_SEVEN_HISTORY, parseTransferValidationCaseSevenEntry } from './validation-case-seven-declaration.ts';

export const TRANSFER_VALIDATION_CASE_EIGHT_ID = 'cos20-transfer-validation-8';
function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Case8 settled capacity: ${message}`);
}
export function transferCaseEightHistory(state: RunSnapshot) {
  return freeze([...TRANSFER_CASE_SEVEN_HISTORY, deriveTransferValidationCaseSevenDeclaration(state)]);
}
/** Original C7 is accounting-only history; its requests never authorize a new dispatch. */
export function deriveTransferValidationCaseEightDeclaration(state: RunSnapshot): ValidationDeclaration {
  const history = transferCaseEightHistory(state), previous = history.at(-1)!, matches = state.validation!.cases.filter(w => w.caseId === previous.caseId), window = matches[0];
  requireThat(matches.length === 1 && window.stopReason && sameValue(window.quote.declaration, previous), 'stopped original C7 declaration changed.');
  requireThat(sameValue(state.ledger.allocationDelegations?.slice(0, 7).map(d => d.caseId), history.map(d => d.caseId))
    && sameValue(state.ledger.allocationDelegations![6].taskIds, VALIDATION_ROLES.map(role => previous.grants[role].taskId)), 'exact seven original delegation members are required.');
  const requests = state.requests.filter(r => r.validation?.caseId === previous.caseId), rows = state.ledger.entries.filter(e => VALIDATION_ROLES.some(role => previous.grants[role].taskId === e.taskId));
  requireThat(rows.length === 18 && requests.length === rows.length, 'C7 requires its eighteen original coding author costs.');
  let cost = 0;
  for (const row of rows) {
    const request = requests.find(r => r.requestId === row.requestId);
    requireThat(row.taskId === previous.grants.coding.taskId && request?.validation?.windowId === window.windowId
      && request.validation.purpose === 'author' && request.admittedAt !== null, 'original C7 cost/request role or window changed.');
    requireThat(row.status === 'settled' && !row.unknown && row.reservedMicroCny === 0 && row.evidence.length > 0
      && Number.isSafeInteger(row.settledMicroCny) && row.settledMicroCny >= 0, 'C7 needs actual settled costs and evidence.');
    cost += row.settledMicroCny;
  }
  const grants = Object.fromEntries(VALIDATION_ROLES.map(role => {
    const amountMicroCny = previous.grants[role].amountMicroCny - (role === 'coding' ? cost : 0);
    requireThat(Number.isSafeInteger(amountMicroCny) && amountMicroCny > 0, 'each original role must retain positive capacity.');
    const closures = state.ledger.allocationClosures!.filter(c => c.taskId === previous.grants[role].taskId);
    requireThat(closures.length === 1 && closures[0].releasedMicroCny === amountMicroCny, 'original C7 closed grant net differs from actual settled costs.');
    return [role, { taskId: `${TRANSFER_VALIDATION_CASE_EIGHT_ID}-${role}`, amountMicroCny }];
  })) as ValidationDeclaration['grants'];
  const total = Object.values(grants).reduce((sum, grant) => sum + grant.amountMicroCny, 0), group = validationBudgetGroup(state.ledger);
  requireThat(group && group.committedMicroCny >= 10_000_000 - total
    && (state.validation!.cases.some(w => w.caseId === TRANSFER_VALIDATION_CASE_EIGHT_ID)
      || group.committedMicroCny === 10_000_000 - total && group.allocatedMicroCny === group.committedMicroCny), 'closed seven-case net differs from actual settled group costs.');
  const declaration = freeze<ValidationDeclaration>({ ...structuredClone(previous), caseId: TRANSFER_VALIDATION_CASE_EIGHT_ID, grants });
  validateValidationDeclaration(declaration); return declaration;
}
export function parseTransferValidationCaseEightEntry(args: string[]) {
  try { return { ...parseTransferValidationCaseSevenEntry(args), caseId: TRANSFER_VALIDATION_CASE_EIGHT_ID }; }
  catch { throw new Error('Usage: probes/transfer/validation-case-eight-run.ts --validation-preflight <reviewed-main-sha> | --validation-case <reviewed-main-sha> <operator-validation-source>'); }
}
