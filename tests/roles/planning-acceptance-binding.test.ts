import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import type { PlanOptions, PlanningTaskPolicy } from '../../src/roles/planner.ts';
import { createRoleFactory } from '../../src/roles/factory.ts';
import { validateTaskInputs } from '../../src/contracts/index.ts';
import type { RequirementContract } from '../../src/contracts/index.ts';
import { requirement as requirementFixture } from '../contracts/fixtures.ts';
import { validationBrowserFixture } from '../runtime/entrypoint-host-validation.fixture.ts';

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cos123-planning-'));
  const requirement = requirementFixture() as RequirementContract;
  requirement.acceptance = ['DESIGN', 'MEDIA', 'PLAY'].map(acceptanceId => ({ acceptanceId, description: '完整原始需求', steps: ['核对可信来源'], expected: '中文与完整要求保持', evidenceKinds: ['test_report'] }));
  await mkdir(join(root, 'requirements'));
  await writeFile(join(root, requirement.sources[0].location), JSON.stringify(requirement), 'utf8');
  const controller = await RunController.create({ root: join(root, 'run'), runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation',
    specVersion: requirement.specVersion, scope: 'validation', limitMicroCny: 1000, allocations: [{ taskId: 'planning', amountMicroCny: 100 }] });
  t.after(async () => { await controller.close(); assert.ok(root.startsWith(tmpdir())); await rm(root, { recursive: true, force: true }); });
  const taskPolicies: PlanningTaskPolicy[] = (['design', 'art', 'coding'] as const).map((role, index) => ({ policyId: `slot-${index}`, role, workspace: root,
    allocationMicroCny: 200, writePaths: [`authors/${role}`], readOnlyPaths: ['requirements'], tools: ['read', 'write'], rules: ['保留主机权限与中文内容'],
    interfaces: requirement.sources, outputs: [{ artifactId: role, version: 'v1', destination: `artifacts/${role}/v1`, type: 'source', schema: 'source/1' }] }));
  const drafts = taskPolicies.map((policy, index) => ({ taskId: `task-${index}`, policyId: policy.policyId, role: policy.role, objective: `创建 ${policy.role}`,
    acceptanceIds: index === 0 ? ['DESIGN', 'PLAY'] : index === 1 ? ['MEDIA'] : ['PLAY'], dependsOn: index ? taskPolicies.slice(0, index).map((_, i) => `task-${i}`) : [] }));
  const observed = { sessions: 0, closes: 0, prompts: [] as string[], replies: [] as string[] };
  let duringPrompt: (() => void) | undefined;
  const roleFactory = createRoleFactory({ maxOutputTokens: 500, maxRequests: 1, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 100,
    sessionFactory: async () => {
      observed.sessions++;
      return { async prompt(text) { observed.prompts.push(text); duringPrompt?.(); const reply = JSON.stringify({ tasks: drafts }); observed.replies.push(reply); return { text: reply }; },
        async close() { observed.closes++; } };
    } });
  const options: PlanOptions = { controller, requirement, planningTaskId: 'planning', workspace: root, sessionRoot: join(root, 'sessions'),
    availableArtifacts: requirement.sources, taskPolicies, roleFactory };
  const before = await controller.read();
  const bind = () => taskPolicies.forEach((policy, index) => { Object.assign(policy, { acceptanceIds: [['DESIGN'], ['MEDIA'], ['PLAY']][index] }); });
  const noPlan = async () => {
    const dirs = await readdir(options.sessionRoot).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; });
    for (const dir of dirs) await assert.rejects(readFile(join(options.sessionRoot, dir, 'plan.json')), { code: 'ENOENT' });
    assert.deepEqual(await controller.read(), before, 'Rejected proposals cannot change task registration, fees, grants or deadline.');
  };
  return { options, taskPolicies, drafts, observed, before, bind, noPlan, duringPrompt: (callback: () => void) => { duringPrompt = callback; } };
}

test('trusted acceptance binding preserves the proposal and every other task contract field', async t => {
  const f = await fixture(t), original = await planTaskDag(f.options), proposal = structuredClone(f.drafts);
  f.bind();
  const result = await planTaskDag(f.options), plan = JSON.parse(await readFile(result.plan.location, 'utf8'));
  assert.deepEqual(result.tasks.map(item => item.task.acceptanceIds), [['DESIGN'], ['MEDIA'], ['PLAY']]);
  assert.deepEqual(plan.acceptanceBinding, f.taskPolicies.map((policy, index) => ({ policyId: policy.policyId, taskId: proposal[index].taskId,
    proposedIds: proposal[index].acceptanceIds, boundIds: [['DESIGN'], ['MEDIA'], ['PLAY']][index] })));
  for (const [index, item] of result.tasks.entries()) {
    assert.deepEqual(validateTaskInputs(item.task, item.task.inputs), []);
    assert.deepEqual(item.task.acceptance, f.options.requirement.acceptance.filter(a => item.task.acceptanceIds.includes(a.acceptanceId))
      .map(a => ({ acceptanceId: a.acceptanceId, steps: a.steps, expected: a.expected, evidenceDestinations: [`evidence/${item.task.taskId}/report.json`] })));
    const prior = original.tasks[index];
    const stable = (entry: typeof item) => ({ ...entry, task: { ...entry.task, acceptanceIds: [], acceptance: [], authorId: '', context: { ...entry.task.context, contextId: '' } } });
    assert.deepEqual(stable(item), stable(prior));
  }
  assert.deepEqual(f.drafts, proposal); assert.deepEqual(f.observed.replies, [JSON.stringify({ tasks: proposal }), JSON.stringify({ tasks: proposal })]);
  const policies = JSON.parse(/host policies: (\[.*\])\. Task IDs/.exec(f.observed.prompts[1])![1]);
  assert.deepEqual(policies.map((policy: any) => policy.acceptanceIds), [['DESIGN'], ['MEDIA'], ['PLAY']]);
  assert.match(f.observed.prompts[1], /design.*map.*gameplay/i);
  const example = JSON.parse(/```json\n([^\n]+)\n```/.exec(f.observed.prompts[1])![1]);
  assert.deepEqual(Object.keys(example.tasks[0]), ['taskId', 'policyId', 'role', 'objective', 'acceptanceIds', 'dependsOn']);
  assert.deepEqual(await f.options.controller.read(), f.before);
});

test('prompt-time mutation cannot change the snapshotted policy binding or its record', async t => {
  const f = await fixture(t); f.bind();
  f.duringPrompt(() => { Object.assign(f.taskPolicies[0], { acceptanceIds: ['PLAY'] }); (f.taskPolicies[2] as PlanningTaskPolicy & { acceptanceIds: string[] }).acceptanceIds.push('DESIGN'); });
  const result = await planTaskDag(f.options), plan = JSON.parse(await readFile(result.plan.location, 'utf8'));
  assert.deepEqual(result.tasks.map(item => item.task.acceptanceIds), [['DESIGN'], ['MEDIA'], ['PLAY']]);
  assert.deepEqual(plan.acceptanceBinding.map((entry: any) => entry.boundIds), [['DESIGN'], ['MEDIA'], ['PLAY']]);
  const policies = JSON.parse(/host policies: (\[.*\])\. Task IDs/.exec(f.observed.prompts[0])![1]);
  assert.deepEqual(policies.map((policy: any) => policy.acceptanceIds), [['DESIGN'], ['MEDIA'], ['PLAY']]);
});

test('only selected configured policies bind; omitted policies keep model acceptance', async t => {
  const f = await fixture(t); Object.assign(f.taskPolicies[0], { acceptanceIds: ['DESIGN'] });
  f.drafts[1].acceptanceIds.push('PLAY');
  f.taskPolicies.push({ ...f.taskPolicies[2], policyId: 'unused', acceptanceIds: ['PLAY'] } as PlanningTaskPolicy);
  const result = await planTaskDag(f.options), plan = JSON.parse(await readFile(result.plan.location, 'utf8'));
  assert.deepEqual(result.tasks.map(item => item.task.acceptanceIds), [['DESIGN'], ['MEDIA', 'PLAY'], ['PLAY']]);
  assert.deepEqual(plan.acceptanceBinding, [{ policyId: 'slot-0', taskId: 'task-0', proposedIds: ['DESIGN', 'PLAY'], boundIds: ['DESIGN'] }]);
});

for (const legacy of [false, true]) test(`${legacy ? 'legacy roles' : 'unconfigured slots'} preserve proposal semantics and original plan shape`, async t => {
  const f = await fixture(t);
  if (legacy) { f.options.roles = Object.fromEntries(f.taskPolicies.map(({ role, policyId: _id, ...policy }) => [role, policy])); f.options.taskPolicies = undefined;
    for (const draft of f.drafts) delete (draft as Partial<typeof draft>).policyId; }
  const result = await planTaskDag(f.options), plan = JSON.parse(await readFile(result.plan.location, 'utf8'));
  assert.deepEqual(result.tasks.map(item => item.task.acceptanceIds), f.drafts.map(draft => draft.acceptanceIds));
  assert.deepEqual(Object.keys(plan), ['status', 'specVersion', 'sessionDirectory', 'expectedOutputs', 'tasks']);
});

for (const value of [[], ['DESIGN', 'DESIGN'], ['UNKNOWN'], [''], [3], 'DESIGN', null]) test(`invalid trusted acceptance configuration is rejected before session creation: ${JSON.stringify(value)}`, async t => {
  const f = await fixture(t); f.bind(); Object.assign(f.taskPolicies[0], { acceptanceIds: value });
  await assert.rejects(planTaskDag(f.options), /acceptance.*polic|polic.*acceptance/i);
  assert.equal(f.observed.sessions, 0); assert.equal(f.observed.prompts.length, 0); await f.noPlan();
});

for (const fault of ['duplicate-acceptance', 'empty-acceptance', 'unknown-acceptance', 'original-coverage', 'bound-coverage', 'unknown-dependency', 'self-dependency', 'cycle', 'duplicate-task', 'duplicate-policy', 'wrong-role', 'extra-authority', 'over-budget'] as const) {
  test(`binding preserves rejection of ${fault}`, async t => {
    const f = await fixture(t); f.bind();
    if (fault === 'duplicate-acceptance') f.drafts[0].acceptanceIds.push('DESIGN');
    if (fault === 'empty-acceptance') f.drafts[0].acceptanceIds = [];
    if (fault === 'unknown-acceptance') f.drafts[0].acceptanceIds.push('UNKNOWN');
    if (fault === 'original-coverage') f.drafts[1].acceptanceIds = ['DESIGN'];
    if (fault === 'bound-coverage') Object.assign(f.taskPolicies[1], { acceptanceIds: ['DESIGN'] });
    if (fault === 'unknown-dependency') f.drafts[1].dependsOn = ['UNKNOWN'];
    if (fault === 'self-dependency') f.drafts[1].dependsOn = ['task-1'];
    if (fault === 'cycle') f.drafts[0].dependsOn = ['task-2'];
    if (fault === 'duplicate-task') f.drafts[1].taskId = 'task-0';
    if (fault === 'duplicate-policy') { f.drafts[1].policyId = 'slot-0'; f.drafts[1].role = 'design'; }
    if (fault === 'wrong-role') f.drafts[0].role = 'coding';
    if (fault === 'extra-authority') Object.assign(f.drafts[0], { tools: ['node'] });
    if (fault === 'over-budget') f.taskPolicies[0].allocationMicroCny = 900;
    await assert.rejects(planTaskDag(f.options), /draft|coverage|unique|cycle|budget|contract/i);
    assert.equal(f.observed.sessions, 1); assert.equal(f.observed.closes, 1); await f.noPlan();
  });
}

test('fixed validation host keeps its old policies and rejects acceptance binding before a session', async t => {
  const f = await validationBrowserFixture(t), host = await f.create();
  assert.ok(host.taskPolicies.every((policy: PlanningTaskPolicy) => !('acceptanceIds' in policy)));
  Object.assign(host.taskPolicies[0], { acceptanceIds: ['COSMOS-DESIGN'] });
  let sessions = 0;
  await assert.rejects(planTaskDag({ controller: f.controller, requirement: f.requirement, validation: f.validation,
    planningTaskId: f.window.quote.declaration.grants.planning.taskId, workspace: f.root, sessionRoot: join(f.root, 'sessions'),
    availableArtifacts: host.availableArtifacts, taskPolicies: host.taskPolicies,
    roleFactory: async () => { sessions++; throw new Error('Must not create a session'); } }), /validation.*acceptance|acceptance.*validation/i);
  assert.equal(sessions, 0); assert.equal(f.configs.length, 0);
});
