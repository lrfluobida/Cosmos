import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import * as hosts from '../../src/runtime/entrypoint-host.ts';
import { snapshot } from '../../src/artifacts/paths.ts';
import { executeTaskDag, resumeTaskDag } from '../../src/runtime/orchestrator.ts';
import { validationBrowserFixture } from './entrypoint-host-validation.fixture.ts';
import { planTaskDag } from '../../src/roles/planner.ts';

test('validation planning reads its fixed inputs before any role task registration', async t => {
  const f = await validationBrowserFixture(t); let host: any, reads = 0;
  host = await f.create({ sessionFactory: async (config: any) => {
    const packet = JSON.parse(config.context);
    assert.equal(packet.role, 'cosmos'); assert.equal(config.maxOutputTokens, 4096); assert.equal(config.requestTimeoutMs, 120000); assert.deepEqual(config.tools.map((tool: any) => tool.name), ['read']);
    return { close: async () => {}, prompt: async () => {
      await config.tools[0].execute('planning-read', { path: f.requirement.sources[0].location }, f.controller.signal, undefined, undefined); reads++;
      return { text: JSON.stringify({ tasks: host.taskPolicies.map((policy: any, index: number) => ({ taskId: f.declaration.grants[policy.role].taskId, policyId: policy.policyId,
        role: policy.role, objective: 'Offline planning read fixture', acceptanceIds: index === 0 ? [f.window.quote.requirements.stageAcceptanceIds[0]] : index === 1 ? [f.window.quote.requirements.stageAcceptanceIds[1]] : f.window.quote.requirements.acceptanceIds,
        dependsOn: host.taskPolicies.slice(0, index).map((item: any) => f.declaration.grants[item.role].taskId) })) }) };
    } };
  } });
  const before = await f.controller.read();
  const plan = await planTaskDag({ controller: f.controller, validation: f.validation, requirement: f.requirement, planningTaskId: f.declaration.grants.planning.taskId,
    workspace: f.root, sessionRoot: join(f.root, 'sessions'), availableArtifacts: host.availableArtifacts, taskPolicies: host.taskPolicies, roleFactory: host.roleFactory });
  assert.equal(reads, 1); host.validateTasks(plan.tasks);
  assert.deepEqual(await f.controller.read(), before, 'Planning is a proposal and cannot manufacture passed DAG work or fees.');
});

for (const field of ['role', 'expectedArtifacts'] as const) test(`repair rejects changed prepared ${field} before consuming its slot`, async t => {
  const f = await validationBrowserFixture(t), host = await f.create(), tasks = f.prepare(host); host.validateTasks(tasks);
  const recovery = { artifactRoot: f.root, journalRoot: join(f.root, 'journal'), recoverCapture: host.recoverCapture };
  f.failBuild(true);
  const failed = await executeTaskDag({ controller: f.controller, validation: f.validation, requirement: f.requirement, tasks,
    sessionRoot: join(f.root, 'sessions'), availableArtifacts: host.availableArtifacts, roleFactory: host.roleFactory, preAuthor: host.preAuthor,
    capture: host.capture, verify: host.verify, reviewImages: host.reviewImages, diagnoseFailure: host.diagnoseFailure, recovery, reviewProtocolCorrections: 1 });
  assert.deepEqual(failed.map(item => item.state), ['passed', 'passed', 'failed']);
  const source = { ...tasks[2], task: failed[2] }, changed = structuredClone(source);
  if (field === 'role') changed.role = 'art'; else changed.expectedArtifacts![0].version = 'changed';
  const feedback = JSON.parse(await readFile(join(source.task.attempts[0].sessionRef, 'failure.json'), 'utf8'));
  const before = await f.controller.read(), files = await snapshot(f.root);
  await assert.rejects(host.prepareValidationRepair(changed, feedback, recovery), /fixed|source|role|binding|output/i);
  assert.deepEqual(await f.controller.read(), before, 'Rejected prepared metadata must not claim, register or change fees.');
  assert.deepEqual(await snapshot(f.root), files, 'Rejected prepared metadata must not stage feedback or new workspaces.');
  const repair = await host.prepareValidationRepair(source, feedback, recovery);
  assert.equal(repair.role, 'coding'); assert.equal(repair.task.taskId, f.declaration.grants.repair.taskId);
  assert.equal(repair.task.budget.allocationMicroCny, f.declaration.grants.repair.amountMicroCny);
  assert.equal((await f.controller.read()).validation!.cases[0].repair!.sourceTaskId, source.task.taskId);
});

test('operator browser host uses current claimed grants without human fields or an extra session request cap', async t => {
  assert.equal(typeof (hosts as any).createValidationBrowserHost, 'function', 'Explicit operator-validation browser adapter is missing');
  const f = await validationBrowserFixture(t), before = await f.controller.read(), host = await f.create(), tasks = f.prepare(host);
  assert.deepEqual(host.taskPolicies.map((item: any) => item.allocationMicroCny), [1_900_000, 5_700_000, 7_600_000]);
  assert.ok(host.availableArtifacts.every((ref: any) => ref.artifactId.startsWith(f.window.caseId)));
  host.validateTasks(tasks); await f.controller.registerTasks(tasks.map(item => item.task));
  await host.preAuthor(tasks[0].task, f.controller.signal);
  const role = await host.roleFactory({ controller: f.controller, requirement: f.requirement, role: 'design', task: tasks[0].task, workspace: tasks[0].workspace,
    stateDirectory: join(f.root, 'sessions/design') }); await role.close();
  assert.equal(f.configs[0].maxRequests, 80); assert.equal(f.configs[0].maxOutputTokens, 16384);
  assert.equal(f.configs[0].requestTimeoutMs, 120000);
  assert.ok(!('confirmedBy' in f.requirement)); assert.deepEqual((await f.controller.read()).run.humanDecisions, []);
  assert.deepEqual((await f.controller.read()).ledger, before.ledger); assert.deepEqual((await f.controller.read()).stopReason, before.stopReason);
});

test('wrong profile, case, frozen proposal/template or root fails before host writes', async t => {
  const f = await validationBrowserFixture(t), before = await snapshot(f.root), stateBefore = await f.controller.read();
  await assert.rejects(f.create({ validation: { ...f.validation, caseId: 'old-case' } }), /case|validation/i);
  await assert.rejects(f.create({ proposal: { ...f.input.proposal, brief: 'changed' } }), /frozen|proposal|input/i);
  await assert.rejects(f.create({ root: join(f.root, 'wrong') }), /root|case/i);
  await assert.rejects(hosts.createBrowserHost(f.input), /legacy|continuation|validation|unconnected preparation draft/i);
  assert.deepEqual(await snapshot(f.root), before);
  assert.deepEqual(await f.controller.read(), stateBefore); assert.equal(f.configs.length, 0); assert.equal(f.calls.length, 0);
  await writeFile(join(f.root, 'toolchain/package.json'), '{} changed', 'utf8');
  await assert.rejects(f.create(), /template|frozen|input/i);
  assert.equal((await f.controller.read()).requests.length, 1);
});

test('task grants, fixed workspace/output and identity are checked before capture or input mirroring', async t => {
  const f = await validationBrowserFixture(t), host = await f.create(), tasks = f.prepare(host);
  for (const mutate of [(item: any) => { item.task.taskId = 'legacy'; }, (item: any) => { item.task.budget.allocationMicroCny++; },
    (item: any) => { item.workspace = f.root; }, (item: any) => { item.expectedArtifacts[0].version = 'old'; }, (item: any) => { item.task.inputs = []; }]) {
    const changed = structuredClone(tasks); mutate(changed[0]); assert.throws(() => host.validateTasks(changed), /fixed|case|grant|task|workspace|input|output/i);
  }
  host.validateTasks(tasks); await f.controller.registerTasks(tasks.map(item => item.task));
  await host.preAuthor(tasks[0].task, f.controller.signal);
  const session = await host.roleFactory({ controller: f.controller, requirement: f.requirement, role: 'design', task: tasks[0].task, workspace: tasks[0].workspace, stateDirectory: join(f.root, 'sessions/design') });
  const tool = f.configs[0].tools!.find(tool => tool.name === 'write')!;
  const before = await snapshot(f.root); f.changeIdentity();
  await assert.rejects(tool.execute('offline-tool', { path: 'authors/design/design.json', content: '{}' }, f.controller.signal, undefined, undefined as any), /identity|source|platform/i);
  await session.close();
  await assert.rejects(host.preAuthor(tasks[0].task, f.controller.signal), /identity|source|platform/i);
  await assert.rejects(host.capture(tasks[0].task, {}, f.controller.signal), /identity|source|platform/i);
  assert.deepEqual(await snapshot(f.root), before); assert.equal(f.calls.length, 0);
});

test('unreconciled charges and cancellation block host work without changing historical fees', async t => {
  const f = await validationBrowserFixture(t), host = await f.create(), tasks = f.prepare(host); host.validateTasks(tasks); await f.controller.registerTasks(tasks.map(item => item.task));
  await host.preAuthor(tasks[0].task, f.controller.signal);
  const session = await host.roleFactory({ controller: f.controller, requirement: f.requirement, role: 'design', task: tasks[0].task, workspace: tasks[0].workspace, stateDirectory: join(f.root, 'sessions/design') });
  const tool = f.configs[0].tools!.find(tool => tool.name === 'write')!;
  await f.controller.reserve({ requestId: 'reserved', taskId: f.declaration.grants.planning.taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: 8,
    validation: { caseId: f.window.caseId, windowId: f.window.windowId, purpose: 'planning', modelId: 'deepseek-flash', maxOutputTokens: 1, inputBytes: 0, hasImages: false } });
  const before = await snapshot(f.root);
  await assert.rejects(host.preAuthor(tasks[0].task, f.controller.signal), /charge|reserved|reconcil/i);
  await assert.rejects(tool.execute('offline-reserved', { path: 'authors/design/design.json', content: '{}' }, f.controller.signal, undefined, undefined as any), /charge|reserved|reconcil/i);
  await f.controller.admit('reserved');
  await f.controller.markUnknown('reserved', [{ artifactId: 'unknown', version: 'v1', location: 'unknown.json' }]);
  await assert.rejects(host.capture(tasks[0].task, {}, f.controller.signal), /charge|unknown|reconcil/i);
  await assert.rejects(tool.execute('offline-unknown', { path: 'authors/design/design.json', content: '{}' }, f.controller.signal, undefined, undefined as any), /charge|unknown|reconcil/i);
  assert.deepEqual(await snapshot(f.root), before); assert.equal(f.calls.length, 0);
  const old = (await f.controller.read()).stopReason; await f.controller.stop('Offline case cancelled');
  await assert.rejects(host.reviewImages(tasks[0].task, f.controller.signal), /stop|cancel|abort|active/i);
  assert.deepEqual((await f.controller.read()).stopReason, old); assert.equal((await f.controller.read()).ledger.entries[0].settledMicroCny, 100);
  await session.close();
  const expired = await validationBrowserFixture(t), expiredHost = await expired.create(), expiredTasks = expired.prepare(expiredHost);
  expiredHost.validateTasks(expiredTasks); await expired.controller.registerTasks(expiredTasks.map(item => item.task)); await expiredHost.preAuthor(expiredTasks[0].task, expired.controller.signal);
  const role = await expiredHost.roleFactory({ controller: expired.controller, requirement: expired.requirement, role: 'design', task: expiredTasks[0].task, workspace: expiredTasks[0].workspace, stateDirectory: join(expired.root, 'sessions/design') });
  const source = await snapshot(expiredTasks[0].workspace); expired.advance(2_700_000);
  await assert.rejects(expired.configs[0].tools!.find(tool => tool.name === 'write')!.execute('offline-expired', { path: 'authors/design/design.json', content: '{}' }, expired.controller.signal, undefined, undefined as any), /deadline|stop|abort|active/i);
  assert.deepEqual(await snapshot(expiredTasks[0].workspace), source); await role.close();
});

test('synthetic pipeline binds capture, independent review and IO to current case versions; linked repair keeps its exact grant', async t => {
  const f = await validationBrowserFixture(t), codingWindows: any[] = [], host = await f.create({ sessionFactory: async (config: any) => {
    if (JSON.parse(config.context).role === 'coding') codingWindows.push(await config.requestWindow());
    return f.input.sessionFactory(config);
  } }), tasks = f.prepare(host); host.validateTasks(tasks);
  const recovery = { artifactRoot: f.root, journalRoot: join(f.root, 'journal'), recoverCapture: host.recoverCapture };
  const run = (items: any[]) => executeTaskDag({ controller: f.controller, validation: f.validation, requirement: f.requirement, tasks: items,
    sessionRoot: join(f.root, 'sessions'), availableArtifacts: host.availableArtifacts, roleFactory: host.roleFactory, preAuthor: host.preAuthor,
    capture: host.capture, verify: host.verify, reviewImages: host.reviewImages, diagnoseFailure: host.diagnoseFailure, recovery, reviewProtocolCorrections: 1 });
  f.failBuild(true); const failed = await run(tasks); assert.deepEqual(failed.map(item => item.state), ['passed', 'passed', 'failed']);
  assert.equal((await host.finish(failed)).acceptedCandidate, undefined);
  const source = { ...tasks[2], task: failed[2] }, feedback = JSON.parse(await readFile(join(source.task.attempts[0].sessionRef, 'failure.json'), 'utf8'));
  const before = await f.controller.read(), repair = await host.prepareValidationRepair(source, feedback, recovery);
  assert.equal(repair.task.taskId, f.declaration.grants.repair.taskId); assert.equal(repair.task.budget.allocationMicroCny, 3_800_000);
  assert.notEqual(repair.workspace, source.workspace); assert.deepEqual((await f.controller.read()).ledger, before.ledger);
  await assert.rejects(host.prepareValidationRepair(source, feedback, recovery), /already|repair|claimed/i);
  f.failBuild(false); const resumed = await resumeTaskDag({ controller: f.controller, validation: f.validation, requirement: f.requirement,
    tasks: [tasks[0], tasks[1], repair], sessionRoot: join(f.root, 'sessions'), availableArtifacts: host.availableArtifacts,
    roleFactory: host.roleFactory, preAuthor: host.preAuthor, capture: host.capture, verify: host.verify, reviewImages: host.reviewImages,
    diagnoseFailure: host.diagnoseFailure, recovery, reviewProtocolCorrections: 1 });
  assert.equal(resumed.tasks[2].state, 'passed', JSON.stringify(resumed.blocked));
  const finished = await host.finish(resumed.tasks); assert.deepEqual(finished.gaps, []); assert.ok(finished.acceptedCandidate);
  assert.ok(f.calls.filter(call => ['build', 'play'].includes(call.kind)).every(call => call.authority.caseId === f.window.caseId && call.authority.windowId === f.window.windowId && call.authority.deadlineAt === f.window.deadlineAt));
  const current = await f.controller.read(); assert.deepEqual(current.stopReason, before.stopReason); assert.deepEqual(current.run.humanDecisions, []);
  assert.equal(current.requests.filter(item => item.validation).length, f.calls.filter(call => ['design', 'art', 'coding', 'reviewer'].includes(call.kind)).length);
  const codingConfigs = f.configs.filter(config => JSON.parse(config.context).role === 'coding');
  assert.deepEqual(codingConfigs.map(config => JSON.parse(config.context).taskId), [source.task.taskId, repair.task.taskId]);
  assert.ok(codingConfigs.every(config => config.requestTimeoutMs === 600000));
  assert.deepEqual(codingWindows, codingConfigs.map(() => ({ deadlineAt: Date.parse(f.window.deadlineAt), cleanupMs: 5000 })));
  assert.ok(f.configs.filter(config => JSON.parse(config.context).role !== 'coding').every(config => config.requestTimeoutMs === 120000));
});
