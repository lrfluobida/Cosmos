import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { transferCaseThreeFixture } from './validation-case-three.fixture.ts';
import { TRANSFER_VALIDATION_CASE as D1 } from '../../probes/transfer/validation-declaration.ts';
import { TRANSFER_VALIDATION_CASE_TWO as D2 } from '../../probes/transfer/validation-case-two-declaration.ts';
import { preflightTransferValidationRun, preflightTransferValidationCaseTwoRun } from '../../probes/transfer/validation-run.ts';
import { validationInputHash, validateValidationDeclaration } from '../../src/runtime/validation-validation.ts';
import { budgetCapacity, validationBudgetGroup } from '../../src/contracts/budget.ts';
import type { ValidationHostInput } from '../../probes/e2e/validation-run.ts';

async function api() {
  const module: any = await import('../../probes/transfer/validation-case-three-run.ts').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
  assert.equal(typeof module.preflightTransferValidationCaseThreeRun, 'function', 'COS47 fixed case3 entry is missing'); return module;
}
test('case3 fixes remaining role grants and identical input without accepting override arguments', async () => {
  const a = await api(), d = a.TRANSFER_VALIDATION_CASE_THREE;
  validateValidationDeclaration(d); assert.equal(d.caseId, 'cos20-transfer-validation-3');
  assert.deepEqual(Object.values(d.grants).map((item: any) => item.amountMicroCny), [369692, 1054678, 2800000, 2800000, 2800000]);
  assert.deepEqual(d.limits, D1.limits); assert.deepEqual(d.inputs, D1.inputs); assert.deepEqual(d.budgetGroup, D1.budgetGroup);
  assert.equal(validationInputHash(d), 'f52b3846140b9b46733238ec5dc2a8d243c0145326f8c4f799bffc23d4bdc78c');
  assert.equal(Object.values(d.grants).reduce((sum: number, grant: any) => sum + grant.amountMicroCny, 0), 9_824_370);
  assert.equal(a.parseTransferValidationCaseThreeEntry(['--validation-preflight', 'a'.repeat(40)]).caseId, d.caseId);
  for (const args of [['--validation-preflight', 'a'.repeat(40), 'fixture'], ['--validation-case', 'a'.repeat(40), 'source', '--declaration'], ['--validation-case', 'a'.repeat(40)]]) assert.throws(() => a.parseTransferValidationCaseThreeEntry(args), /Usage/);
  const input: any = await import('../../probes/transfer/validation-input.ts');
  assert.equal((await input.readTransferValidationCaseThreeInput(fileURLToPath(new URL('../../', import.meta.url)))).caseId, d.caseId);
});
test('case3 preflight authenticates ten histories and each of eight original closure inputs without side effects; old entries refuse', async t => {
  const a = await api(), f = await transferCaseThreeFixture(t), before = await readFile(join(f.ledgerRoot, 'snapshot.json'));
  const result = await a.preflightTransferValidationCaseThreeRun({ repository: f.repository, args: ['--validation-preflight', f.head] });
  assert.equal(result.outcome, 'ready'); assert.equal(result.paidRequests, 0);
  assert.equal(result.quote.budgetGroup.availableAllocationMicroCny, 9_824_370);
  assert.deepEqual(result.quote.budgetGroup.memberCaseIds, [D1.caseId, D2.caseId]);
  assert.equal(result.quote.budgetGroup.authorizationDecisionId, f.baseline.validation.cases[8].operatorDecision.decisionId);
  assert.deepEqual(result.quote.budgetGroup.parentAllocation, f.baseline.validation.cases[8].quote.budgetGroup.parentAllocation);
  for (const id of ['COS-45', 'COS-46']) assert.ok(result.sourceApprovals.some((item: any) => item.taskId === id));
  for (const old of [preflightTransferValidationRun, preflightTransferValidationCaseTwoRun]) await assert.rejects(old({ repository: f.repository, args: ['--validation-preflight', f.head] }), /exists|ledger3|nine|eight/i);
  assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before);
  assert.equal((await readdir(join(f.repository, '.cosmos/e2e'))).includes(a.TRANSFER_VALIDATION_CASE_THREE.caseId), false);
  const last = f.baseline.allocationClosureDecisions[7];
  assert.equal(last.quote.basis.currentCaseId, D2.caseId); assert.equal(last.quote.identity.frozenCaseInputHash, validationInputHash(D2));
  const source = join(f.ledgerRoot, last.operatorDecision.source.location); await writeFile(source, (await readFile(source, 'utf8')) + ' ', 'utf8');
  await assert.rejects(a.preflightTransferValidationCaseThreeRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /closure|source/i);
});
test('pending self-check source46 rejects before host preparation, receipt or claim', async t => {
  const a = await api(), f = await transferCaseThreeFixture(t), head = await f.updateMapping(mapping => { mapping.tasks.find((item: any) => item.taskId === 'COS-46').reviewStatus = 'SOURCE_NOT_READY'; });
  const before = await readFile(join(f.ledgerRoot, 'snapshot.json')), entries = await readdir(f.ledgerRoot); let prepared = 0;
  await assert.rejects(a.runTransferValidationCaseThreeWithHost({ repository: f.repository, args: ['--validation-case', head, 'OFFLINE source'], host: { prepare: async () => { prepared++; }, execute: async () => { throw new Error('Must not execute'); } } }), /COS-46|source/i);
  assert.equal(prepared, 0); assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before); assert.deepEqual(await readdir(f.ledgerRoot), entries);
});
test('equal-total wrong-role historical fees cannot authorize the fixed case3 remaining vector', async t => {
  const a = await api(), f = await transferCaseThreeFixture(t, { planning: 16_207, design: 145_321 });
  assert.equal(validationBudgetGroup(f.baseline.ledger)!.committedMicroCny, 175_630);
  const before = await readFile(join(f.ledgerRoot, 'snapshot.json')), entries = await readdir(f.ledgerRoot); let prepared = 0;
  await assert.rejects(a.runTransferValidationCaseThreeWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => { prepared++; }, execute: async () => { throw new Error('Must not execute'); } } }), /role|capacity/i);
  assert.equal(prepared, 0); assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before); assert.deepEqual(await readdir(f.ledgerRoot), entries);
});
test('atomic case3 claim and owned bootstrap preserve histories, first parent authority, fees and shared capacity', async t => {
  const a = await api(), f = await transferCaseThreeFixture(t), before = f.baseline, d = a.TRANSFER_VALIDATION_CASE_THREE;
  const driver: any = await import('../../probes/transfer/validation-driver.ts'); let completed = false;
  const result = await a.runTransferValidationCaseThreeWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => {}, execute: async (input: ValidationHostInput) => {
    try {
      await driver.bootstrapTransferValidationCaseThreeToolchain(input, async (job: any) => {
        assert.equal(job.authority.caseId, d.caseId); assert.equal(job.authority.taskId, d.grants.planning.taskId);
        const request = JSON.parse(await readFile(job.args.at(-1), 'utf8')); await cp(join(input.repository, 'templates/2d'), join(input.root, 'toolchain'), { recursive: true });
        await writeFile(request.response, JSON.stringify({ formatVersion: 'validation-worker-result-1', operation: 'bootstrap', outcome: 'completed', result: join(input.root, 'toolchain') }), 'utf8');
        return { passed: true, code: 0, stdout: '', stderr: '', diagnostics: 'OFFLINE transport only', cleanup: {} };
      });
      const { requirement, binding } = await driver.stageTransferValidationCaseThreeInput(input);
      assert.equal(requirement.validation.caseId, d.caseId); assert.equal(requirement.sources[0].artifactId, d.caseId + '-input');
      assert.deepEqual((await binding.readScope(input.signal)).requirement, requirement);
      for (const old of [driver.bootstrapTransferToolchain, driver.bootstrapTransferValidationCaseTwoToolchain]) await assert.rejects(old(input), /fixed|declaration|roots/i);
      let entered = false, closed = false;
      await assert.rejects(driver.executeTransferValidationCaseThreeDag({ ...input, root: join(input.root, 'wrong-root') }, requirement, binding,
        { withPreparation: async (operation: () => Promise<unknown>) => { entered = true; try { return await operation(); } finally { closed = true; } } }), /fixed|roots/i);
      assert.equal(entered, true); assert.equal(closed, true);
      completed = true; return { outcome: 'failed', gaps: ['OFFLINE no generated game'] };
    } catch (error) { t.diagnostic(error instanceof Error ? error.stack ?? error.message : String(error)); throw error; }
  } } });
  assert.equal(completed, true); assert.equal(result.outcome, 'failed');
  const after = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8'));
  assert.deepEqual(after.validation.cases.slice(0, 10), before.validation.cases); assert.deepEqual(after.allocationClosureDecisions, before.allocationClosureDecisions);
  assert.deepEqual(after.ledger.entries, before.ledger.entries); assert.deepEqual(after.requests, before.requests); assert.deepEqual(after.ledger.allocationClosures, before.ledger.allocationClosures);
  assert.deepEqual(after.ledger.allocations.slice(0, before.ledger.allocations.length), before.ledger.allocations);
  assert.deepEqual(after.ledger.allocationDelegations.slice(0, 2), before.ledger.allocationDelegations);
  assert.equal(after.validation.currentCaseId, d.caseId); assert.equal(after.ledger.allocationDelegations.length, 3);
  assert.equal(after.ledger.allocationDelegations[2].authorizationDecisionId, before.ledger.allocationDelegations[0].authorizationDecisionId);
  assert.equal(validationBudgetGroup(after.ledger)!.allocatedMicroCny, 10_000_000); assert.equal(validationBudgetGroup(after.ledger)!.committedMicroCny, 175_630);
  assert.deepEqual(budgetCapacity(after.ledger), budgetCapacity(before.ledger));
  assert.equal(after.run.originalStartedAt, before.run.originalStartedAt); assert.equal(after.run.originalDeadlineAt, before.run.originalDeadlineAt); assert.deepEqual(after.stopReason, before.stopReason);
});
