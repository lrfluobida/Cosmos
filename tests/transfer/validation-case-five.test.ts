import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, readFile, readdir, stat, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { transferCaseFiveFixture } from './validation-case-five.fixture.ts';
import { TRANSFER_VALIDATION_CASE as D1 } from '../../probes/transfer/validation-declaration.ts';
import { TRANSFER_VALIDATION_CASE_TWO as D2 } from '../../probes/transfer/validation-case-two-declaration.ts';
import { TRANSFER_VALIDATION_CASE_THREE as D3 } from '../../probes/transfer/validation-case-three-declaration.ts';
import { TRANSFER_VALIDATION_CASE_FOUR as D4 } from '../../probes/transfer/validation-case-four-declaration.ts';
import { validateValidationDeclaration, validationInputHash } from '../../src/runtime/validation-validation.ts';
import { budgetCapacity, validationBudgetGroup } from '../../src/contracts/budget.ts';
import { preflightTransferValidationRun, preflightTransferValidationCaseTwoRun, preflightTransferValidationCaseThreeRun, preflightTransferValidationCaseFourRun } from '../../probes/transfer/validation-run.ts';
import { createTransferConsumerHost } from '../../probes/transfer/runtime-host.ts';
import type { ValidationHostInput } from '../../probes/e2e/validation-run.ts';

const drafts = [
  { taskId: 'cos20-design', policyId: 'game-design', role: 'design', objective: 'Design transfer', acceptanceIds: ['COSMOS-DESIGN'], dependsOn: [] },
  { taskId: 'cos20-art', policyId: 'game-art', role: 'art', objective: 'Create media', acceptanceIds: ['COSMOS-MEDIA'], dependsOn: ['cos20-design'] },
  { taskId: 'cos20-coding', policyId: 'game-code', role: 'coding', objective: 'Implement transfer', acceptanceIds: ['T16-01', 'T16-02', 'T16-03', 'T16-04', 'T16-05', 'T16-06'], dependsOn: ['cos20-design', 'cos20-art'] },
];
async function api() {
  const module: any = await import('../../probes/transfer/validation-case-five-run.ts').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
  assert.equal(typeof module.preflightTransferValidationCaseFiveRun, 'function', 'COS51 fixed case5 entry is missing'); return module;
}
async function recordState(repository: string) {
  const rows: { path: string; mtimeMs: number; sha256?: string }[] = [];
  async function visit(path: string) {
    const info = await stat(join(repository, path));
    rows.push({ path, mtimeMs: info.mtimeMs, ...(info.isFile() ? { sha256: createHash('sha256').update(await readFile(join(repository, path))).digest('hex') } : {}) });
    if (info.isDirectory()) for (const name of (await readdir(join(repository, path))).sort()) await visit(path + '/' + name);
  }
  await visit('.cosmos'); return rows;
}

test('case5 fixes original remaining grants, input hash and strict CLI without caller selectors', async () => {
  const a = await api(), d = a.TRANSFER_VALIDATION_CASE_FIVE;
  validateValidationDeclaration(d); assert.equal(d.caseId, 'cos20-transfer-validation-5');
  assert.deepEqual(Object.values(d.grants).map((item: any) => item.amountMicroCny), [340618, 854278, 2800000, 2800000, 2800000]);
  assert.equal(Object.values(d.grants).reduce((sum: number, grant: any) => sum + grant.amountMicroCny, 0), 9_594_896);
  assert.deepEqual(d.limits, D1.limits); assert.deepEqual(d.inputs, D1.inputs); assert.deepEqual(d.budgetGroup, D1.budgetGroup);
  assert.equal(validationInputHash(d), 'f52b3846140b9b46733238ec5dc2a8d243c0145326f8c4f799bffc23d4bdc78c');
  assert.equal(a.parseTransferValidationCaseFiveEntry(['--validation-preflight', 'a'.repeat(40)]).caseId, d.caseId);
  for (const selector of ['--proposalIdentity', '--declaration', '--roles', '--map', '--path', '--host', '--clock', '--fixture']) {
    assert.throws(() => a.parseTransferValidationCaseFiveEntry(['--validation-case', 'a'.repeat(40), 'source', selector]), /Usage/);
  }
  for (const args of [['--validation-preflight', 'a'.repeat(40), 'fixture'], ['--validation-case', 'a'.repeat(40)], ['--validation-preflight', 'main']]) assert.throws(() => a.parseTransferValidationCaseFiveEntry(args), /Usage/);
  const input: any = await import('../../probes/transfer/validation-input.ts');
  assert.equal((await input.readTransferValidationCaseFiveInput(fileURLToPath(new URL('../../', import.meta.url)))).caseId, d.caseId);
});

test('case5 preflight authenticates twelve histories and ten own-input audits while preserving bytes and mtime', async t => {
  const a = await api(), f = await transferCaseFiveFixture(t), before = await recordState(f.repository);
  const result = await a.preflightTransferValidationCaseFiveRun({ repository: f.repository, args: ['--validation-preflight', f.head] });
  assert.equal(result.outcome, 'ready'); assert.equal(result.paidRequests, 0);
  assert.equal(result.quote.budgetGroup.availableAllocationMicroCny, 9_594_896);
  assert.deepEqual(result.quote.budgetGroup.memberCaseIds, [D1.caseId, D2.caseId, D3.caseId, D4.caseId]);
  assert.equal(result.quote.budgetGroup.authorizationDecisionId, f.baseline.validation.cases[8].operatorDecision.decisionId);
  assert.deepEqual(result.quote.budgetGroup.parentAllocation, f.baseline.validation.cases[8].quote.budgetGroup.parentAllocation);
  for (const id of ['COS-49', 'COS-50']) assert.ok(result.sourceApprovals.some((item: any) => item.taskId === id));
  for (const old of [preflightTransferValidationRun, preflightTransferValidationCaseTwoRun, preflightTransferValidationCaseThreeRun, preflightTransferValidationCaseFourRun]) {
    await assert.rejects(old({ repository: f.repository, args: ['--validation-preflight', f.head] }), /exists|ledger3|eleven|ten|nine|eight/i);
  }
  assert.deepEqual(await recordState(f.repository), before);
  assert.equal((await readdir(join(f.repository, '.cosmos/e2e'))).includes(a.TRANSFER_VALIDATION_CASE_FIVE.caseId), false);
  assert.ok(!(await readdir(f.ledgerRoot)).some(name => name === '.controller.lock' || name === a.TRANSFER_VALIDATION_CASE_FIVE.caseId + '.json'));
  const last = f.baseline.allocationClosureDecisions[9];
  assert.equal(last.quote.basis.currentCaseId, D4.caseId); assert.equal(last.quote.identity.frozenCaseInputHash, validationInputHash(D4));
  const snapshot = join(f.ledgerRoot, 'snapshot.json'), originalSnapshot = await readFile(snapshot), unstopped = structuredClone(f.baseline);
  unstopped.validation.cases[11].stopReason = null;
  await writeFile(snapshot, JSON.stringify(unstopped), 'utf8');
  await assert.rejects(a.preflightTransferValidationCaseFiveRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /twelve|stopped|validation/i);
  await writeFile(snapshot, originalSnapshot);
  const operator = join(f.ledgerRoot, f.baseline.validation.cases[11].operatorDecision.source.location), originalOperator = await readFile(operator);
  await writeFile(operator, Buffer.concat([originalOperator, Buffer.from(' ')]));
  await assert.rejects(a.preflightTransferValidationCaseFiveRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /operator|source/i);
  await writeFile(operator, originalOperator);
  const fixedInput = join(f.repository, D4.inputs.requirements.path), originalInput = await readFile(fixedInput);
  await writeFile(fixedInput, Buffer.concat([originalInput, Buffer.from(' ')]));
  await f.git('add', '.'); await f.git('commit', '-m', 'OFFLINE changed frozen input');
  const changedHead = await f.git('rev-parse', 'HEAD');
  await assert.rejects(a.preflightTransferValidationCaseFiveRun({ repository: f.repository, args: ['--validation-preflight', changedHead] }), /Fixed transfer input changed/i);
  await writeFile(fixedInput, originalInput);
  await f.git('add', '.'); await f.git('commit', '-m', 'OFFLINE restore frozen input');
  const restoredHead = await f.git('rev-parse', 'HEAD');
  const source = join(f.ledgerRoot, last.operatorDecision.source.location); await writeFile(source, (await readFile(source, 'utf8')) + ' ', 'utf8');
  await assert.rejects(a.preflightTransferValidationCaseFiveRun({ repository: f.repository, args: ['--validation-preflight', restoredHead] }), /closure|source/i);
});

test('case5 refuses pending source49 or source50, either nonancestor, dirty source and wrong HEAD before effects', async t => {
  const a = await api(), f = await transferCaseFiveFixture(t), before = await recordState(f.repository); let prepared = 0;
  const host = { prepare: async () => { prepared++; }, execute: async () => { throw new Error('Must not execute'); } };
  const originals = new Map(['COS-49', 'COS-50'].map(id => [id, structuredClone(f.mapping.tasks.find((item: any) => item.taskId === id))]));
  const unrelated = await f.git('commit-tree', f.head + '^{tree}', '-m', 'OFFLINE unrelated source');
  let head = f.head;
  for (const id of ['COS-49', 'COS-50']) {
    for (const change of [{ reviewStatus: 'SOURCE_NOT_READY' }, { reviewStatus: 'READY' }, { integrationStatus: 'actual-validation-failed-author-handoff' }, { reviewedCommit: unrelated }, { mergeCommit: unrelated }]) {
      head = await f.updateMapping(mapping => {
        for (const [key, original] of originals) Object.assign(mapping.tasks.find((item: any) => item.taskId === key), original);
        Object.assign(mapping.tasks.find((item: any) => item.taskId === id), change);
      });
      await assert.rejects(a.runTransferValidationCaseFiveWithHost({ repository: f.repository, args: ['--validation-case', head, 'OFFLINE source'], host }), /COS-49|COS-50|source|ancestor/i);
      assert.equal(prepared, 0); assert.deepEqual(await recordState(f.repository), before);
    }
  }
  head = await f.updateMapping(mapping => { for (const [id, original] of originals) Object.assign(mapping.tasks.find((item: any) => item.taskId === id), original); });
  const dirty = join(f.repository, 'OFFLINE-untracked-source.txt'); await writeFile(dirty, 'OFFLINE', 'utf8');
  await assert.rejects(a.runTransferValidationCaseFiveWithHost({ repository: f.repository, args: ['--validation-case', head, 'OFFLINE source'], host }), /clean main|HEAD/i);
  await unlink(dirty);
  await assert.rejects(a.runTransferValidationCaseFiveWithHost({ repository: f.repository, args: ['--validation-case', f.head, 'OFFLINE source'], host }), /clean main|HEAD/i);
  assert.equal(prepared, 0); assert.deepEqual(await recordState(f.repository), before);
});

test('equal-total wrong-role historical fees cannot authorize case5 fixed remaining grants', async t => {
  const a = await api(), f = await transferCaseFiveFixture(t, { planning: 14_293, design: 200_401 });
  assert.equal(validationBudgetGroup(f.baseline.ledger)!.committedMicroCny, 405_104);
  const before = await recordState(f.repository); let prepared = 0;
  await assert.rejects(a.runTransferValidationCaseFiveWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => { prepared++; }, execute: async () => { throw new Error('Must not execute'); } } }), /role|capacity/i);
  assert.equal(prepared, 0); assert.deepEqual(await recordState(f.repository), before);
});

test('atomic case5 claim and real driver bind aliases through the original planner and host with original authority', async t => {
  const a = await api(), f = await transferCaseFiveFixture(t), before = f.baseline, d = a.TRANSFER_VALIDATION_CASE_FIVE;
  const driver: any = await import('../../probes/transfer/validation-driver.ts'); let validated = false, sessions = 0, closes = 0;
  const result = await a.runTransferValidationCaseFiveWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => {}, execute: async (input: ValidationHostInput) => {
    try {
      await driver.bootstrapTransferValidationCaseFiveToolchain(input, async (job: any) => {
        assert.equal(job.authority.caseId, d.caseId); assert.equal(job.authority.taskId, d.grants.planning.taskId);
        const request = JSON.parse(await readFile(job.args.at(-1), 'utf8')); await cp(join(input.repository, 'templates/2d'), join(input.root, 'toolchain'), { recursive: true });
        await writeFile(request.response, JSON.stringify({ formatVersion: 'validation-worker-result-1', operation: 'bootstrap', outcome: 'completed', result: join(input.root, 'toolchain') }), 'utf8');
        return { passed: true, code: 0, stdout: '', stderr: '', diagnostics: 'OFFLINE transport only', cleanup: {} };
      });
      const { requirement, binding, proposal } = await driver.stageTransferValidationCaseFiveInput(input);
      assert.equal(requirement.validation.caseId, d.caseId); assert.equal(requirement.sources[0].artifactId, d.caseId + '-input');
      assert.deepEqual((await binding.readScope(input.signal)).requirement, requirement);
      for (const old of [driver.bootstrapTransferToolchain, driver.bootstrapTransferValidationCaseTwoToolchain, driver.bootstrapTransferValidationCaseThreeToolchain, driver.bootstrapTransferValidationCaseFourToolchain]) await assert.rejects(old(input), /fixed|declaration|roots/i);
      const host = await createTransferConsumerHost({ root: input.root, controller: input.controller, requirement, proposal, validation: binding, work: input.work, resume: false,
        sessionFactory: async config => {
          sessions++; const context = JSON.parse(config.context); assert.equal(context.role, 'cosmos'); assert.equal(context.taskId, d.grants.planning.taskId);
          assert.deepEqual(config.tools.map(tool => tool.name), ['read']);
          return { prompt: async text => { assert.ok(text.includes('local proposal alias')); return { text: JSON.stringify({ tasks: drafts }) }; }, close: async () => { closes++; } };
        } });
      const original = host.validateTasks!;
      host.validateTasks = tasks => {
        original(tasks); validated = true;
        assert.deepEqual(tasks.map(item => item.task.taskId), [d.grants.design.taskId, d.grants.art.taskId, d.grants.coding.taskId]);
        assert.deepEqual(tasks[1].task.dependsOn.map(dep => dep.taskId), [d.grants.design.taskId]);
        assert.deepEqual(tasks[2].task.dependsOn.map(dep => dep.taskId), [d.grants.design.taskId, d.grants.art.taskId]);
        throw new Error('OFFLINE stop before author DAG');
      };
      await assert.rejects(driver.executeTransferValidationCaseFiveDag(input, requirement, binding, host), /OFFLINE stop before author DAG/);
      const [folder] = await readdir(join(input.root, 'sessions')), plan = JSON.parse(await readFile(join(input.root, 'sessions', folder, 'plan.json'), 'utf8'));
      assert.deepEqual(plan.identityBinding, drafts.map((draft, index) => ({ protocol: 'validation-policy-aliases/1', policy: draft.policyId,
        localAlias: draft.taskId, actualTaskId: [d.grants.design.taskId, d.grants.art.taskId, d.grants.coding.taskId][index] })));
      assert.deepEqual(plan.tasks.map((item: any) => item.task.taskId), [d.grants.design.taskId, d.grants.art.taskId, d.grants.coding.taskId]);
      assert.deepEqual((await input.controller.read()).ledger.entries, before.ledger.entries);
      return { outcome: 'failed', gaps: ['OFFLINE planner wire only; no generated game'] };
    } catch (error) { t.diagnostic(error instanceof Error ? error.stack ?? error.message : String(error)); throw error; }
  } } });
  assert.equal(validated, true); assert.equal(sessions, 1); assert.equal(closes, 1); assert.equal(result.outcome, 'failed');
  const after = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8'));
  assert.deepEqual(after.validation.cases.slice(0, 12), before.validation.cases); assert.deepEqual(after.allocationClosureDecisions, before.allocationClosureDecisions);
  assert.deepEqual(after.ledger.entries, before.ledger.entries); assert.deepEqual(after.requests, before.requests); assert.deepEqual(after.ledger.allocationClosures, before.ledger.allocationClosures);
  assert.deepEqual(after.ledger.allocations.slice(0, before.ledger.allocations.length), before.ledger.allocations);
  assert.deepEqual(after.ledger.allocationDelegations.slice(0, 4), before.ledger.allocationDelegations);
  assert.equal(after.validation.currentCaseId, d.caseId); assert.equal(after.ledger.allocationDelegations.length, 5);
  assert.equal(after.ledger.allocationDelegations[4].authorizationDecisionId, before.ledger.allocationDelegations[0].authorizationDecisionId);
  assert.deepEqual(after.ledger.allocationDelegations[4].parentAllocation, before.ledger.allocationDelegations[0].parentAllocation);
  assert.equal(validationBudgetGroup(after.ledger)!.allocatedMicroCny, 10_000_000); assert.equal(validationBudgetGroup(after.ledger)!.committedMicroCny, 405_104);
  assert.deepEqual(budgetCapacity(after.ledger), budgetCapacity(before.ledger));
  assert.equal(after.run.originalStartedAt, before.run.originalStartedAt); assert.equal(after.run.originalDeadlineAt, before.run.originalDeadlineAt); assert.deepEqual(after.stopReason, before.stopReason);
});
