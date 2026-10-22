import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';
import { fundingFixture } from './public-validation-funding.fixture.ts';
import { reservePublicValidationFunding } from '../../src/runtime/public-validation-funding.ts';
import { createBrowserHost, createProductHost } from '../../src/runtime/entrypoint-host.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import { runProductSession } from '../../src/cli/session.ts';
import { withHostStages } from '../../src/roles/requirements.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';

for (const modular of [false, true]) test(`ordinary ${modular ? 'five' : 'three'} slots bind misplaced design acceptance before strict host validation`, async t => {
  const f = await ordinaryHostFixture(t, { modular, fault: 'planning-acceptance' }), result: any = await f.execute();
  assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps));
  const execution = JSON.parse(await readFile(join(f.root, 'execution.json'), 'utf8'));
  const plan = JSON.parse(await readFile(execution.plan.location, 'utf8'));
  const id = modular ? 'count' : 'light';
  assert.deepEqual(plan.acceptanceBinding, [
    { policyId: 'game-design', taskId: 'design-task', proposedIds: ['COSMOS-DESIGN', id], boundIds: ['COSMOS-DESIGN'] },
    { policyId: 'game-art', taskId: 'art-task', proposedIds: ['COSMOS-MEDIA'], boundIds: ['COSMOS-MEDIA'] },
    ...(modular ? ['a', 'b'].map(slot => ({ policyId: `game-module-${slot}`, taskId: `module-${slot}-task`, proposedIds: [`COSMOS-MODULE-${slot.toUpperCase()}`], boundIds: [`COSMOS-MODULE-${slot.toUpperCase()}`] })) : []),
    { policyId: 'game-code', taskId: 'coding-task', proposedIds: [id], boundIds: [id] },
  ]);
  assert.deepEqual(execution.tasks.map((item: any) => item.task.acceptanceIds), plan.acceptanceBinding.map((item: any) => item.boundIds));
  assert.deepEqual(execution.tasks.map((item: any) => item.task.acceptance.map((a: any) => a.acceptanceId)), plan.acceptanceBinding.map((item: any) => item.boundIds));
  assert.ok(f.packets.some(packet => packet.role === 'design'), 'The real author factory must be dispatched after strict host validation.');
  assert.equal(f.plays.length, 1);
});

test('ordinary acceptance binding does not fix a valid DAG with missing host dependencies', async t => {
  const f = await ordinaryHostFixture(t, { fault: 'planning-dependencies' }), result: any = await f.execute();
  assert.equal(result.acceptedCandidate, undefined);
  assert.ok(!f.packets.some(packet => packet.role === 'design'));
  await assert.rejects(readFile(join(f.root, 'execution.json')), { code: 'ENOENT' });
  const dirs = await readdir(join(f.root, 'sessions'));
  const plans = await Promise.all(dirs.filter(dir => dir.startsWith('planning-')).map(async dir => JSON.parse(await readFile(join(f.root, 'sessions', dir, 'plan.json'), 'utf8'))));
  assert.equal(plans.length, 1, 'The valid DAG must reach the unchanged host guard.');
  assert.deepEqual(plans[0].acceptanceBinding[0].boundIds, ['COSMOS-DESIGN']);
  assert.deepEqual(plans[0].tasks[2].task.dependsOn.map((dep: any) => dep.taskId), ['design-task']);
});

test('funded ordinary entry uses the same trusted policy binding within its original budget and window', async t => {
  const f = await fundingFixture(t), args = await f.authorization('acceptance'), funding = await reservePublicValidationFunding(args);
  const configs: PiSessionOptions[] = [], output = new PassThrough(); output.resume(); let checked = false;
  const sessionFactory = async (config: PiSessionOptions) => {
    configs.push(config);
    return { close: async () => {}, prompt: async () => ({ text: JSON.stringify({ tasks: [
      { taskId: 'design', policyId: 'game-design', role: 'design', objective: '设计', acceptanceIds: ['COSMOS-DESIGN', 'click'], dependsOn: [] },
      { taskId: 'art', policyId: 'game-art', role: 'art', objective: '素材', acceptanceIds: ['COSMOS-MEDIA'], dependsOn: ['design'] },
      { taskId: 'coding', policyId: 'game-code', role: 'coding', objective: '编码', acceptanceIds: ['click'], dependsOn: ['design', 'art'] },
    ] }) }) };
  };
  const host = createProductHost(fileURLToPath(new URL('../../', import.meta.url)), { sessionFactory });
  host.prepare = async root => {
    await mkdir(join(root, 'toolchain'), { recursive: true });
    for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await writeFile(join(root, 'toolchain', name), name.endsWith('.ts') ? 'export default {}' : '{}', 'utf8');
    return { environmentReady: true, executionReady: true };
  };
  host.questions = async () => [{ id: 'goal', prompt: '操作目标？' }];
  host.draft = async () => withHostStages({ ordinaryProfile: 'ordinary-design/1', brief: args.payload.brief,
    questions: [{ id: 'goal', prompt: '操作目标？' }], answers: { goal: '点击完成' }, unsupported: [],
    acceptance: [{ acceptanceId: 'click', description: '点击完成', steps: ['点击目标'], expected: '完成', evidenceKinds: ['test_report'] }], experienceCriteria: [] });
  host.execute = async input => {
    const controller = await RunController.open({ root: input.root });
    try {
      const options = { ...input, controller, work: new OwnedWork(controller.signal), sessionFactory };
      const active = await createBrowserHost(options), before = await controller.read();
      assert.deepEqual(active.taskPolicies.map(policy => policy.acceptanceIds), [['COSMOS-DESIGN'], ['COSMOS-MEDIA'], ['click']]);
      const plan = await planTaskDag({ controller, requirement: input.requirement, planningTaskId: 'planning', workspace: input.root,
        sessionRoot: join(input.root, 'sessions'), availableArtifacts: active.availableArtifacts, taskPolicies: active.taskPolicies, roleFactory: active.roleFactory });
      active.validateTasks!(plan.tasks);
      const record = JSON.parse(await readFile(plan.plan.location, 'utf8'));
      assert.deepEqual(record.acceptanceBinding[0], { policyId: 'game-design', taskId: 'design', proposedIds: ['COSMOS-DESIGN', 'click'], boundIds: ['COSMOS-DESIGN'] });
      assert.deepEqual(plan.tasks.map(item => item.task.budget.allocationMicroCny), active.taskPolicies.map(policy => policy.allocationMicroCny));
      assert.ok(plan.tasks.every(item => item.task.budget.originalDeadlineAt === before.run.originalDeadlineAt));
      assert.deepEqual(await controller.read(), before); checked = true;
      return { outcome: 'incomplete', gaps: ['Source-only planning boundary fixture.'] };
    } finally { await controller.close(); }
  };
  await runProductSession({ command: 'new', root: args.runRoot, brief: args.payload.brief, funding, limits: args.payload.limits,
    host, input: Readable.from(['点击完成\nconfirm 1\n']), output });
  assert.equal(checked, true); assert.equal(configs.length, 1); assert.equal(JSON.parse(configs[0].context).role, 'cosmos');
  assert.equal(configs[0].maxRequests, 16); assert.equal(configs[0].maxOutputTokens, 8192); assert.equal(configs[0].requestTimeoutMs, 120000);
  const state = await f.child(args.runRoot);
  assert.deepEqual(state.validationFunding, funding); assert.equal(state.ledger.limitMicroCny, 5000000);
  assert.equal(Date.parse(state.run.originalDeadlineAt) - Date.parse(state.run.originalStartedAt), 1800000);
  assert.deepEqual(state.tasks, []); assert.deepEqual(state.ledger.entries, []);
});
