import assert from 'node:assert/strict';
import test from 'node:test';
import { VALIDATION_ROLES, validationInputHash, validateValidationDeclaration } from '../../src/runtime/validation-validation.ts';
import { TRANSFER_VALIDATION_CASE_SIX as D6 } from '../../probes/transfer/validation-case-six-declaration.ts';
import { caseSevenFeeData } from './validation-case-seven.fixture.ts';

async function api() {
  const a: any = await import('../../probes/transfer/validation-case-seven-declaration.ts').catch(() => null);
  assert.equal(typeof a?.deriveTransferValidationCaseSevenDeclaration, 'function', 'C7 actual settled-cost declaration is missing.');
  return a;
}
test('C7 declaration derives two actual settled cost variants without spending its reservation', async () => {
  const a = await api();
  for (const amount of [200_000, 450_000]) {
    const state = caseSevenFeeData(amount), declaration = a.deriveTransferValidationCaseSevenDeclaration(state);
    validateValidationDeclaration(declaration);
    assert.equal(declaration.caseId, 'cos20-transfer-validation-7');
    assert.deepEqual(Object.fromEntries(VALIDATION_ROLES.map(role => [role, declaration.grants[role].amountMicroCny])), state.expected);
    assert.deepEqual(declaration.limits, D6.limits); assert.deepEqual(declaration.outputTokens, D6.outputTokens);
    assert.equal(validationInputHash(declaration), validationInputHash(D6));
    assert.equal(Object.values(declaration.grants).reduce((n: number, g: any) => n + g.amountMicroCny, 0), 10_000_000 - state.ledger.entries.reduce((n, e) => n + e.settledMicroCny, 0));
    assert.deepEqual(a.deriveTransferValidationCaseSevenDeclaration(state), declaration);
  }
});
test('C7 declaration refuses unresolved costs, missing financial evidence, foreign roles and nonpositive grants', async () => {
  const a = await api();
  for (const mutate of [
    (s: any) => Object.assign(s.ledger.entries.at(-1), { unknown: true, status: 'unknown', reservedMicroCny: 974_882, settledMicroCny: 0 }),
    (s: any) => { s.ledger.entries.at(-1).evidence = []; },
    (s: any) => { s.requests.at(-1).admittedAt = null; },
    (s: any) => { s.requests.at(-1).validation.caseId = D6.caseId + '-foreign'; },
    (s: any) => { s.ledger.entries.at(-1).taskId = D6.grants.design.taskId; },
    (s: any) => { s.ledger.entries.push(structuredClone(s.ledger.entries.at(-1))); },
    (s: any) => { s.ledger.allocationDelegations[5].caseId = 'cos20-foreign'; },
    (s: any) => { s.ledger.entries.at(-1).settledMicroCny = 2_122_353; },
  ]) { const state = caseSevenFeeData(); mutate(state); assert.throws(() => a.deriveTransferValidationCaseSevenDeclaration(state)); }
});
test('C7 parser fixes its case identity and strict public argument contract', async () => {
  const a = await api();
  assert.equal(a.parseTransferValidationCaseSevenEntry(['--validation-preflight', 'a'.repeat(40)]).caseId, 'cos20-transfer-validation-7');
  for (const args of [[], ['--validation-preflight', 'a'.repeat(40), 'extra'], ['--validation-case', 'a'.repeat(40)], ['--validation-case', 'a'.repeat(40), 'source', '--grant']]) assert.throws(() => a.parseTransferValidationCaseSevenEntry(args), /Usage/);
});
