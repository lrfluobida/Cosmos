import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { TRANSFER_VALIDATION_CASE_FIFTEEN as fixed } from '../../probes/transfer/validation-case-fifteen-declaration.ts';
import { RunController } from '../../src/runtime/run.ts';
import { budgetCapacity, validationBudgetGroup } from '../../src/contracts/budget.ts';
import { prepareValidationCase } from '../../src/runtime/validation-window.ts';
import { validateValidationDeclaration } from '../../src/runtime/validation-validation.ts';
import { supplementFixture } from './validation-group-supplement.fixture.ts';

/** The short synthetic ledger is built by the production claim, request, supplement and closure APIs. */
async function fixture(t: test.TestContext) {
  const f = await supplementFixture(t), supplement = await RunController.prepareValidationGroupSupplement(f);
  await RunController.applyValidationGroupSupplement({ ...f, quote: supplement, decision: await f.decision(supplement) });
  const c14 = await f.claim(f.target); assert.equal(c14.quote.formatVersion, 'validation-case-quote-3');
  await f.charge(c14, 'coding', 792_063); await f.close(c14);
  for (const file of [fixed.inputs.requirements, ...fixed.inputs.template.files]) {
    const destination = join(f.repositoryRoot, file.path); await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(new URL('../../' + file.path, import.meta.url)));
  }
  f.setCurrent(fixed);
  return f;
}

test('fixed C15 alone authorizes the complete ninety-minute declaration', () => {
  assert.doesNotThrow(() => validateValidationDeclaration(fixed));
});

test('authentic ledger5 admits nongrouped C15 after C14 closure without changing the old group', async t => {
  const f = await fixture(t), before = await f.snapshot();
  const declaration = structuredClone(fixed); f.setCurrent(declaration);
  const quote = await prepareValidationCase({ ...f, declaration });
  assert.equal(quote.formatVersion, 'validation-case-quote-1'); assert.equal(quote.budgetGroup, undefined);
  const value = await f.claim(declaration), after = await value.controller.read();
  assert.equal(after.ledger.contractVersion, '5.0.0');
  assert.equal(budgetCapacity(after.ledger).allocatedMicroCny - budgetCapacity(before.ledger).allocatedMicroCny, 21_000_000);
  assert.deepEqual(validationBudgetGroup(after.ledger), validationBudgetGroup(before.ledger));
});
