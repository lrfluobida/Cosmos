import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { VALIDATION_CASE } from '../../probes/e2e/validation-declaration.ts';
import { validationInputHash, validateValidationDeclaration } from '../../src/runtime/validation-validation.ts';
import { HOST_STAGE_ACCEPTANCE } from '../../src/roles/requirements.ts';

async function api() {
  const declaration: any = await import('../../probes/transfer/validation-declaration.ts').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error;
  });
  assert.equal(typeof declaration.parseTransferValidationEntry, 'function', 'COS43 fixed declaration and entry are missing');
  return declaration;
}
test('fixed transfer input preserves six gameplay checks, original host stages and original budget group', async () => {
  const { TRANSFER_VALIDATION_CASE: d, parseTransferValidationEntry: parse } = await api();
  validateValidationDeclaration(d);
  assert.equal(d.caseId, 'cos20-transfer-validation-1');
  assert.equal(d.formatVersion, 'validation-declaration-3');
  assert.deepEqual(d.budgetGroup, { parentTaskId: 'COS-16', allocationMicroCny: 10_000_000 });
  assert.deepEqual(Object.values(d.grants).map((item: any) => item.amountMicroCny), [400000, 1200000, 2800000, 2800000, 2800000]);
  assert.deepEqual(d.inputs.template, VALIDATION_CASE.inputs.template);
  assert.notEqual(validationInputHash(d), validationInputHash(VALIDATION_CASE));
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const { readTransferValidationInput } = await import('../../probes/transfer/validation-input.ts');
  const input = await readTransferValidationInput(root), requirements = input.requirements;
  assert.deepEqual(requirements.acceptanceIds, ['T16-01', 'T16-02', 'T16-03', 'T16-04', 'T16-05', 'T16-06']);
  assert.deepEqual(requirements.preparation.acceptance.slice(6), HOST_STAGE_ACCEPTANCE);
  assert.equal(requirements.preparation.adapterId, 'cos16-input/1');
  assert.deepEqual(requirements.budgetGroup, d.budgetGroup);
  const forbidden = new Set(['map', 'tiles', 'solution', 'paths', 'scenario', 'confirmed', 'confirmedBy', 'confirmedAt', 'answers', 'questions']);
  function inspect(value: any) {
    if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { assert.ok(!forbidden.has(key), `Preauthored or human field ${key}`); inspect(item); }
  }
  inspect(requirements);
  assert.deepEqual(JSON.parse(await readFile(join(root, d.inputs.requirements.path), 'utf8')), requirements);
  assert.equal(parse(['--validation-preflight', 'a'.repeat(40)]).caseId, d.caseId);
  for (const args of [['--validation-preflight', 'a'.repeat(40), 'fixture'], ['--validation-case', 'a'.repeat(40)], ['--fixture', 'a'.repeat(40)], ['--validation-case', 'a'.repeat(40), 'source', '--host']]) assert.throws(() => parse(args), /Usage/);
});
