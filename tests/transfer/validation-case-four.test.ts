import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { transferCaseFourFixture } from './validation-case-four.fixture.ts';
import { transferCaseThreeFixture } from './validation-case-three.fixture.ts';
import { TRANSFER_VALIDATION_CASE as D1 } from '../../probes/transfer/validation-declaration.ts';
import { TRANSFER_VALIDATION_CASE_TWO as D2 } from '../../probes/transfer/validation-case-two-declaration.ts';
import { TRANSFER_VALIDATION_CASE_THREE as D3 } from '../../probes/transfer/validation-case-three-declaration.ts';
import { preflightTransferValidationRun, preflightTransferValidationCaseTwoRun, preflightTransferValidationCaseThreeRun } from '../../probes/transfer/validation-run.ts';
import { validationInputHash, validateValidationDeclaration } from '../../src/runtime/validation-validation.ts';
import { budgetCapacity, validationBudgetGroup } from '../../src/contracts/budget.ts';
import { createTransferConsumerHost } from '../../probes/transfer/runtime-host.ts';
import type { ValidationHostInput } from '../../probes/e2e/validation-run.ts';

const drafts = [
  { taskId: 'cos20-design', policyId: 'game-design', role: 'design', objective: 'Prepare fixed design', acceptanceIds: ['COSMOS-DESIGN'], dependsOn: [] },
  { taskId: 'cos20-art', policyId: 'game-art', role: 'art', objective: 'Produce original media', acceptanceIds: ['COSMOS-MEDIA'], dependsOn: ['cos20-design'] },
  { taskId: 'cos20-coding', policyId: 'game-code', role: 'coding', objective: 'Implement fixed transfer', acceptanceIds: ['T16-01', 'T16-02', 'T16-03', 'T16-04', 'T16-05', 'T16-06'], dependsOn: ['cos20-design', 'cos20-art'] },
];

async function api() {
  const module: any = await import('../../probes/transfer/validation-case-four-run.ts').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
  assert.equal(typeof module.preflightTransferValidationCaseFourRun, 'function', 'COS49 fixed case4 entry is missing'); return module;
}

test('case4 fixes remaining original grants and identical input without accepting protocol or other overrides', async () => {
  const a = await api(), d = a.TRANSFER_VALIDATION_CASE_FOUR;
  validateValidationDeclaration(d); assert.equal(d.caseId, 'cos20-transfer-validation-4');
  assert.deepEqual(Object.values(d.grants).map((item: any) => item.amountMicroCny), [354912, 1054678, 2800000, 2800000, 2800000]);
  assert.deepEqual(d.limits, D1.limits); assert.deepEqual(d.inputs, D1.inputs); assert.deepEqual(d.budgetGroup, D1.budgetGroup);
  assert.equal(validationInputHash(d), 'f52b3846140b9b46733238ec5dc2a8d243c0145326f8c4f799bffc23d4bdc78c');
  assert.equal(Object.values(d.grants).reduce((sum: number, grant: any) => sum + grant.amountMicroCny, 0), 9_809_590);
  assert.equal(a.parseTransferValidationCaseFourEntry(['--validation-preflight', 'a'.repeat(40)]).caseId, d.caseId);
  for (const args of [['--validation-preflight', 'a'.repeat(40), 'fixture'], ['--validation-case', 'a'.repeat(40), 'source', '--proposalIdentity'], ['--validation-case', 'a'.repeat(40)]]) assert.throws(() => a.parseTransferValidationCaseFourEntry(args), /Usage/);
  const input: any = await import('../../probes/transfer/validation-input.ts');
  assert.equal((await input.readTransferValidationCaseFourInput(fileURLToPath(new URL('../../', import.meta.url)))).caseId, d.caseId);
});

test('case4 preflight authenticates eleven histories and nine own-input audits without side effects; all old entries refuse', async t => {
  const a = await api(), f = await transferCaseFourFixture(t), before = await readFile(join(f.ledgerRoot, 'snapshot.json'));
  const result = await a.preflightTransferValidationCaseFourRun({ repository: f.repository, args: ['--validation-preflight', f.head] });
  assert.equal(result.outcome, 'ready'); assert.equal(result.paidRequests, 0);
  assert.equal(result.quote.budgetGroup.availableAllocationMicroCny, 9_809_590);
  assert.deepEqual(result.quote.budgetGroup.memberCaseIds, [D1.caseId, D2.caseId, D3.caseId]);
  assert.equal(result.quote.budgetGroup.authorizationDecisionId, f.baseline.validation.cases[8].operatorDecision.decisionId);
  assert.deepEqual(result.quote.budgetGroup.parentAllocation, f.baseline.validation.cases[8].quote.budgetGroup.parentAllocation);
  for (const id of ['COS-47', 'COS-48']) assert.ok(result.sourceApprovals.some((item: any) => item.taskId === id));
  for (const old of [preflightTransferValidationRun, preflightTransferValidationCaseTwoRun, preflightTransferValidationCaseThreeRun]) await assert.rejects(old({ repository: f.repository, args: ['--validation-preflight', f.head] }), /exists|ledger3|ten|nine|eight/i);
  assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before);
  assert.equal((await readdir(join(f.repository, '.cosmos/e2e'))).includes(a.TRANSFER_VALIDATION_CASE_FOUR.caseId), false);
  const last = f.baseline.allocationClosureDecisions[8];
  assert.equal(last.quote.basis.currentCaseId, D3.caseId); assert.equal(last.quote.identity.frozenCaseInputHash, validationInputHash(D3));
  const source = join(f.ledgerRoot, last.operatorDecision.source.location); await writeFile(source, (await readFile(source, 'utf8')) + ' ', 'utf8');
  await assert.rejects(a.preflightTransferValidationCaseFourRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /closure|source/i);
});

test('pending host identity source48 rejects case4 before host preparation, receipt or claim', async t => {
  const a = await api(), f = await transferCaseFourFixture(t), head = await f.updateMapping(mapping => { mapping.tasks.find((item: any) => item.taskId === 'COS-48').reviewStatus = 'SOURCE_NOT_READY'; });
  const before = await readFile(join(f.ledgerRoot, 'snapshot.json')), entries = await readdir(f.ledgerRoot); let prepared = 0;
  await assert.rejects(a.runTransferValidationCaseFourWithHost({ repository: f.repository, args: ['--validation-case', head, 'OFFLINE source'], host: { prepare: async () => { prepared++; }, execute: async () => { throw new Error('Must not execute'); } } }), /COS-48|source/i);
  assert.equal(prepared, 0); assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before); assert.deepEqual(await readdir(f.ledgerRoot), entries);
});

test('equal-total wrong-role historical fees cannot authorize case4 fixed remaining grants', async t => {
  const a = await api(), f = await transferCaseFourFixture(t, { planning: 14_779, design: 1 });
  assert.equal(validationBudgetGroup(f.baseline.ledger)!.committedMicroCny, 190_410);
  const before = await readFile(join(f.ledgerRoot, 'snapshot.json')), entries = await readdir(f.ledgerRoot); let prepared = 0;
  await assert.rejects(a.runTransferValidationCaseFourWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => { prepared++; }, execute: async () => { throw new Error('Must not execute'); } } }), /role|capacity/i);
  assert.equal(prepared, 0); assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before); assert.deepEqual(await readdir(f.ledgerRoot), entries);
});

async function bootstrap(input: ValidationHostInput, driver: any, d: typeof D1) {
  await driver.bootstrapTransferValidationCaseFourToolchain(input, async (job: any) => {
    assert.equal(job.authority.caseId, d.caseId); assert.equal(job.authority.taskId, d.grants.planning.taskId);
    const request = JSON.parse(await readFile(job.args.at(-1), 'utf8')); await cp(join(input.repository, 'templates/2d'), join(input.root, 'toolchain'), { recursive: true });
    await writeFile(request.response, JSON.stringify({ formatVersion: 'validation-worker-result-1', operation: 'bootstrap', outcome: 'completed', result: join(input.root, 'toolchain') }), 'utf8');
    return { passed: true, code: 0, stdout: '', stderr: '', diagnostics: 'OFFLINE transport only', cleanup: {} };
  });
}

test('atomic case4 claim and new planning bootstrap preserve original histories, parent authority and shared capacity', async t => {
  const a = await api(), f = await transferCaseFourFixture(t), before = f.baseline, d = a.TRANSFER_VALIDATION_CASE_FOUR;
  const driver: any = await import('../../probes/transfer/validation-driver.ts'); let completed = false;
  const result = await a.runTransferValidationCaseFourWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => {}, execute: async (input: ValidationHostInput) => {
    try {
      await bootstrap(input, driver, d);
      const { requirement, binding } = await driver.stageTransferValidationCaseFourInput(input);
      assert.equal(requirement.validation.caseId, d.caseId); assert.equal(requirement.sources[0].artifactId, d.caseId + '-input');
      assert.deepEqual((await binding.readScope(input.signal)).requirement, requirement);
      for (const old of [driver.bootstrapTransferToolchain, driver.bootstrapTransferValidationCaseTwoToolchain, driver.bootstrapTransferValidationCaseThreeToolchain]) await assert.rejects(old(input), /fixed|declaration|roots/i);
      let entered = false, closed = false;
      await assert.rejects(driver.executeTransferValidationCaseFourDag({ ...input, root: join(input.root, 'wrong-root') }, requirement, binding,
        { withPreparation: async (operation: () => Promise<unknown>) => { entered = true; try { return await operation(); } finally { closed = true; } } }), /fixed|roots/i);
      assert.equal(entered, true); assert.equal(closed, true);
      completed = true; return { outcome: 'failed', gaps: ['OFFLINE no generated game'] };
    } catch (error) { t.diagnostic(error instanceof Error ? error.stack ?? error.message : String(error)); throw error; }
  } } });
  assert.equal(completed, true); assert.equal(result.outcome, 'failed');
  const after = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8'));
  assert.deepEqual(after.validation.cases.slice(0, 11), before.validation.cases); assert.deepEqual(after.allocationClosureDecisions, before.allocationClosureDecisions);
  assert.deepEqual(after.ledger.entries, before.ledger.entries); assert.deepEqual(after.requests, before.requests); assert.deepEqual(after.ledger.allocationClosures, before.ledger.allocationClosures);
  assert.deepEqual(after.ledger.allocations.slice(0, before.ledger.allocations.length), before.ledger.allocations);
  assert.deepEqual(after.ledger.allocationDelegations.slice(0, 3), before.ledger.allocationDelegations);
  assert.equal(after.validation.currentCaseId, d.caseId); assert.equal(after.ledger.allocationDelegations.length, 4);
  assert.equal(after.ledger.allocationDelegations[3].authorizationDecisionId, before.ledger.allocationDelegations[0].authorizationDecisionId);
  assert.deepEqual(after.ledger.allocationDelegations[3].parentAllocation, before.ledger.allocationDelegations[0].parentAllocation);
  assert.equal(validationBudgetGroup(after.ledger)!.allocatedMicroCny, 10_000_000); assert.equal(validationBudgetGroup(after.ledger)!.committedMicroCny, 190_410);
  assert.deepEqual(budgetCapacity(after.ledger), budgetCapacity(before.ledger));
  assert.equal(after.run.originalStartedAt, before.run.originalStartedAt); assert.equal(after.run.originalDeadlineAt, before.run.originalDeadlineAt); assert.deepEqual(after.stopReason, before.stopReason);
});

test('case4 real driver and planner bind six-field aliases before the original host validates tasks', async t => {
  const a = await api(), f = await transferCaseFourFixture(t), d = a.TRANSFER_VALIDATION_CASE_FOUR;
  const driver: any = await import('../../probes/transfer/validation-driver.ts'); let validated = false, sessions = 0, closes = 0;
  await a.runTransferValidationCaseFourWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => {}, execute: async (input: ValidationHostInput) => {
    try {
      await bootstrap(input, driver, d);
      const { requirement, binding, proposal } = await driver.stageTransferValidationCaseFourInput(input);
      const host = await createTransferConsumerHost({ root: input.root, controller: input.controller, requirement, proposal, validation: binding, work: input.work, resume: false,
        sessionFactory: async config => {
          sessions++; const context = JSON.parse(config.context); assert.equal(context.role, 'cosmos'); assert.equal(context.taskId, d.grants.planning.taskId);
          assert.deepEqual(config.tools.map(tool => tool.name), ['read']);
          return { prompt: async () => ({ text: JSON.stringify({ tasks: drafts }) }), close: async () => { closes++; } };
        } });
      const original = host.validateTasks!;
      host.validateTasks = tasks => {
        original(tasks); validated = true;
        assert.deepEqual(tasks.map(item => item.task.taskId), [d.grants.design.taskId, d.grants.art.taskId, d.grants.coding.taskId]);
        assert.deepEqual(tasks[1].task.dependsOn.map(dep => dep.taskId), [d.grants.design.taskId]);
        assert.deepEqual(tasks[2].task.dependsOn.map(dep => dep.taskId), [d.grants.design.taskId, d.grants.art.taskId]);
        throw new Error('OFFLINE stop before author DAG');
      };
      await assert.rejects(driver.executeTransferValidationCaseFourDag(input, requirement, binding, host), /OFFLINE stop before author DAG/);
      const [folder] = await readdir(join(input.root, 'sessions')), plan = JSON.parse(await readFile(join(input.root, 'sessions', folder, 'plan.json'), 'utf8'));
      assert.deepEqual(plan.identityBinding, drafts.map((draft, index) => ({ protocol: 'validation-policy-aliases/1', policy: draft.policyId,
        localAlias: draft.taskId, actualTaskId: [d.grants.design.taskId, d.grants.art.taskId, d.grants.coding.taskId][index] })));
      assert.deepEqual(plan.tasks.map((item: any) => item.task.taskId), [d.grants.design.taskId, d.grants.art.taskId, d.grants.coding.taskId]);
      assert.deepEqual((await input.controller.read()).ledger.entries, f.baseline.ledger.entries);
      return { outcome: 'failed', gaps: ['OFFLINE planner wire only; author DAG deliberately not entered'] };
    } catch (error) { t.diagnostic(error instanceof Error ? error.stack ?? error.message : String(error)); throw error; }
  } } });
  assert.equal(validated, true); assert.equal(sessions, 1); assert.equal(closes, 1);
});

test('original case3 driver keeps strict task identities and never publishes alias binding', async t => {
  const f = await transferCaseThreeFixture(t), driver: any = await import('../../probes/transfer/validation-driver.ts'); let rejected = false;
  const { runTransferValidationCaseThreeWithHost } = await import('../../probes/transfer/validation-run.ts');
  await runTransferValidationCaseThreeWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => {}, execute: async input => {
    try {
      await driver.bootstrapTransferValidationCaseThreeToolchain(input, async (job: any) => {
        const request = JSON.parse(await readFile(job.args.at(-1), 'utf8')); await cp(join(input.repository, 'templates/2d'), join(input.root, 'toolchain'), { recursive: true });
        await writeFile(request.response, JSON.stringify({ formatVersion: 'validation-worker-result-1', operation: 'bootstrap', outcome: 'completed', result: join(input.root, 'toolchain') }), 'utf8');
        return { passed: true, code: 0, stdout: '', stderr: '', diagnostics: 'OFFLINE case3 transport only', cleanup: {} };
      });
      const { requirement, binding, proposal } = await driver.stageTransferValidationCaseThreeInput(input);
      const host = await createTransferConsumerHost({ root: input.root, controller: input.controller, requirement, proposal, validation: binding, work: input.work, resume: false,
        sessionFactory: async () => ({ prompt: async text => {
          assert.ok(!text.includes('local proposal alias')); assert.ok(text.includes(D3.grants.design.taskId));
          return { text: JSON.stringify({ tasks: drafts }) };
        }, close: async () => {} }) });
      await assert.rejects(driver.executeTransferValidationCaseThreeDag(input, requirement, binding, host), /Plan tasks and policy slots must be unique and new/);
      const [folder] = await readdir(join(input.root, 'sessions'));
      assert.ok(!(await readdir(join(input.root, 'sessions', folder))).includes('plan.json'));
      assert.deepEqual((await input.controller.read()).ledger.entries, f.baseline.ledger.entries);
      rejected = true; return { outcome: 'failed', gaps: ['OFFLINE original case3 strict wire only'] };
    } catch (error) { t.diagnostic(error instanceof Error ? error.stack ?? error.message : String(error)); throw error; }
  } } });
  assert.equal(rejected, true);
});
