import { COS16_GROUP_GRANTS, validationBudgetGroup } from '../../src/contracts/budget.ts';
import { sameValue } from '../../src/contracts/validation.ts';
import { freeze } from '../../src/roles/requirements.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import type { ValidationDeclaration, ValidationRole } from '../../src/runtime/validation-types.ts';
import { VALIDATION_ROLES, validateValidationDeclaration } from '../../src/runtime/validation-validation.ts';
import { TRANSFER_VALIDATION_CASE as D1, parseTransferValidationEntry } from './validation-declaration.ts';
import { TRANSFER_VALIDATION_CASE_TWO as D2 } from './validation-case-two-declaration.ts';
import { TRANSFER_VALIDATION_CASE_THREE as D3 } from './validation-case-three-declaration.ts';
import { TRANSFER_VALIDATION_CASE_FOUR as D4 } from './validation-case-four-declaration.ts';
import { TRANSFER_VALIDATION_CASE_FIVE as D5 } from './validation-case-five-declaration.ts';
import { TRANSFER_VALIDATION_CASE_SIX as D6 } from './validation-case-six-declaration.ts';

export const TRANSFER_VALIDATION_CASE_SEVEN_ID = 'cos20-transfer-validation-7';
export const TRANSFER_CASE_SEVEN_HISTORY = freeze([D1, D2, D3, D4, D5, D6]);
const oldFees = [76_320, 601_462, 166_678, 677_647, 0];
function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Case7 settled capacity: ${message}`);
}

/** Pure derivation from authenticated settled history; never a reservation or execution authority. */
export function deriveTransferValidationCaseSevenDeclaration(state: RunSnapshot): ValidationDeclaration {
  const declarations = TRANSFER_CASE_SEVEN_HISTORY, members = declarations.map(d => d.caseId);
  requireThat(state.ledger.contractVersion === '4.0.0' && state.validation, 'original ledger4 history is required.');
  requireThat(!state.ledger.entries.some(e => e.unknown || e.reservedMicroCny || !['settled', 'cancelled'].includes(e.status)), 'unknown or reserved costs require actual reconciliation.');
  requireThat(new Set(state.ledger.entries.map(e => e.requestId)).size === state.ledger.entries.length
    && new Set(state.requests.map(r => r.requestId)).size === state.requests.length, 'duplicate request or cost.');
  requireThat(sameValue(state.ledger.allocationDelegations?.slice(0, 6).map(d => d.caseId), members), 'exact six original delegation members are required.');
  const totals = Object.fromEntries(VALIDATION_ROLES.map(role => [role, 0])) as Record<ValidationRole, number>;
  for (const [index, declaration] of declarations.entries()) {
    const matches = state.validation.cases.filter(w => w.caseId === declaration.caseId), window = matches[0];
    requireThat(matches.length === 1 && window.stopReason && sameValue(window.quote.declaration, declaration), 'stopped original case declaration changed.');
    requireThat(sameValue(state.ledger.allocationDelegations![index].taskIds, VALIDATION_ROLES.map(role => declaration.grants[role].taskId)), 'foreign role grant membership.');
    const requests = state.requests.filter(r => r.validation?.caseId === declaration.caseId);
    const rows = state.ledger.entries.filter(e => VALIDATION_ROLES.some(role => declaration.grants[role].taskId === e.taskId));
    requireThat(rows.length === requests.length, 'historical fee has no exact case request.');
    for (const row of rows) {
      const request = requests.find(r => r.requestId === row.requestId);
      requireThat(request?.validation?.windowId === window.windowId, 'cost/request window or member changed.');
      requireThat(Number.isSafeInteger(row.settledMicroCny) && row.settledMicroCny >= 0, 'invalid actual cost.');
      requireThat(request.admittedAt !== null ? row.status === 'settled' && row.evidence.length > 0
        : row.status === 'cancelled' && row.settledMicroCny === 0, 'admitted cost needs actual settlement evidence.');
      const role = VALIDATION_ROLES.find(role => declaration.grants[role].taskId === row.taskId)!;
      requireThat(index !== 5 || role === 'coding' && request.validation.purpose === 'author' && request.admittedAt !== null, 'original C6 costs must belong to its thirteen coding author requests.');
      totals[role] += row.settledMicroCny;
    }
    if (index === 4) requireThat(sameValue(VALIDATION_ROLES.map(role => totals[role]), oldFees), 'original five-case actual fee vector changed.');
    if (index === 5) requireThat(rows.length === 13 && rows.slice(0, 12).reduce((sum, row) => sum + row.settledMicroCny, 0) === 135_531,
      'C6 requires its twelve preserved settled costs and final actual reconciliation.');
  }
  const grants = Object.fromEntries(VALIDATION_ROLES.map(role => {
    const remaining = COS16_GROUP_GRANTS[role] - totals[role];
    requireThat(Number.isSafeInteger(remaining) && remaining > 0, 'each original role must retain positive capacity.');
    return [role, { taskId: `${TRANSFER_VALIDATION_CASE_SEVEN_ID}-${role}`, amountMicroCny: remaining }];
  })) as ValidationDeclaration['grants'];
  const cost = VALIDATION_ROLES.reduce((sum, role) => sum + totals[role], 0), group = validationBudgetGroup(state.ledger);
  requireThat(group && !state.ledger.entries.some(e => e.taskId === 'COS-16') && group.committedMicroCny >= cost
    && (state.validation.cases.some(w => w.caseId === TRANSFER_VALIDATION_CASE_SEVEN_ID) || group.allocatedMicroCny === cost && group.committedMicroCny === cost), 'closed original role net must equal actual settled group costs.');
  requireThat(Object.values(grants).reduce((sum, g) => sum + g.amountMicroCny, 0) === 10_000_000 - cost, 'remaining vector differs from original parent capacity.');
  const declaration = freeze<ValidationDeclaration>({ ...structuredClone(D1), caseId: TRANSFER_VALIDATION_CASE_SEVEN_ID, grants });
  validateValidationDeclaration(declaration); return declaration;
}
export function parseTransferValidationCaseSevenEntry(args: string[]) {
  try { return { ...parseTransferValidationEntry(args), caseId: TRANSFER_VALIDATION_CASE_SEVEN_ID }; }
  catch { throw new Error('Usage: probes/transfer/validation-case-seven-run.ts --validation-preflight <reviewed-main-sha> | --validation-case <reviewed-main-sha> <operator-validation-source>'); }
}
