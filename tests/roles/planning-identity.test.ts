import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { validateTask } from '../../src/contracts/index.ts';
import { createRoleFactory } from '../../src/roles/factory.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import type { PlanOptions, PlanningTaskPolicy } from '../../src/roles/planner.ts';
import { requireValidationTask } from '../../src/runtime/validation-validation.ts';
import { requirement as humanRequirement } from '../contracts/fixtures.ts';
import { ids, transferFixture } from '../transfer/runtime-host.fixture.ts';

const protocol = 'validation-policy-aliases/1' as const;
const authorRoles = ['design', 'art', 'coding'] as const;
// Sanitized failed proposal shape only; no real run files or provider responses.
const proposal = [
  { taskId: 'cos20-design', policyId: 'game-design', role: 'design', objective: 'Produce fixed design', acceptanceIds: ['COSMOS-DESIGN'], dependsOn: [] },
  { taskId: 'cos20-art', policyId: 'game-art', role: 'art', objective: 'Original media', acceptanceIds: ['COSMOS-MEDIA'], dependsOn: ['cos20-design'] },
  { taskId: 'cos20-coding', policyId: 'game-code', role: 'coding', objective: 'Implement transfer', acceptanceIds: ids, dependsOn: ['cos20-design', 'cos20-art'] },
];

async function fixture(t: test.TestContext) {
  const f = await transferFixture(t), grants = f.window.quote.declaration.grants;
  const taskPolicies: PlanningTaskPolicy[] = authorRoles.map((role, index) => ({ policyId: proposal[index].policyId, role, workspace: f.root,
    allocationMicroCny: grants[role].amountMicroCny, writePaths: [`authors/${role}`], readOnlyPaths: ['requirements'], tools: ['read', 'write'],
    rules: ['保留主机权限与固定验收'], interfaces: f.requirement.sources,
    outputs: [{ artifactId: `offline-${role}`, version: 'v1', destination: `artifacts/${role}/v1`, type: 'data', schema: 'offline/1' }] }));
  let drafts: unknown = structuredClone(proposal), beforeReply: (() => Promise<void>) | undefined;
  const observed = { sessions: 0, prompts: [] as string[], closes: 0, contexts: [] as any[] };
  const roleFactory = createRoleFactory({ maxOutputTokens: 4096, maxRequests: 1, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 1,
    sessionFactory: async config => {
      observed.sessions++; observed.contexts.push(JSON.parse(config.context));
      assert.deepEqual(config.tools.map(tool => tool.name), ['read']);
      return { async prompt(text) { observed.prompts.push(text); await beforeReply?.(); return { text: JSON.stringify({ tasks: drafts }) }; },
        async close() { observed.closes++; } };
    } });
  const options: PlanOptions = { controller: f.controller, requirement: f.requirement, validation: f.validation,
    planningTaskId: grants.planning.taskId, workspace: f.root, sessionRoot: join(f.root, 'sessions'), availableArtifacts: f.requirement.sources,
    taskPolicies, roleFactory };
  const snapshotPath = join(f.ledgerRoot, 'snapshot.json'), before = await readFile(snapshotPath);
  return { ...f, grants, taskPolicies, options, observed, before,
    reply: (value: unknown) => { drafts = value; }, beforeReply: (action: () => Promise<void>) => { beforeReply = action; },
    unchanged: async () => assert.deepEqual(await readFile(snapshotPath), before, 'Planning preserves task registration, fees, grants, history and clocks byte for byte.') };
}

test('default strict planning still rejects local aliases without registration or fees', async t => {
  const f = await fixture(t);
  await assert.rejects(planTaskDag(f.options), /Plan tasks and policy slots must be unique and new/);
  assert.equal(f.observed.sessions, 1); assert.equal(f.observed.closes, 1);
  for (const role of authorRoles) assert.ok(f.observed.prompts[0].includes(f.grants[role].taskId));
  await f.unchanged();
});

test('opt-in binds validated policy aliases to current grants and preserves host authority', async t => {
  const f = await fixture(t), result = await planTaskDag({ ...f.options, proposalIdentity: protocol } as PlanOptions);
  assert.equal(f.observed.sessions, 1); assert.equal(f.observed.prompts.length, 1); assert.equal(f.observed.closes, 1);
  assert.match(f.observed.prompts[0], /local proposal alias/i);
  assert.match(f.observed.prompts[0], /\{tasks:\[\{taskId,policyId,role,objective,acceptanceIds,dependsOn\}\]\}/);
  for (const role of authorRoles) assert.ok(!f.observed.prompts[0].includes(f.grants[role].taskId), 'Billing task identity is host-owned and absent from the proposal policies.');
  const snapshot = await f.controller.read();
  assert.deepEqual(result.tasks.map(item => item.task.taskId), authorRoles.map(role => f.grants[role].taskId));
  for (const [index, prepared] of result.tasks.entries()) {
    const policy = f.taskPolicies[index];
    assert.deepEqual(validateTask(prepared.task), []); requireValidationTask(snapshot, prepared.task);
    assert.deepEqual(prepared.task.acceptanceIds, proposal[index].acceptanceIds);
    assert.deepEqual(prepared.task.ownership, { writePaths: policy.writePaths, readOnlyPaths: policy.readOnlyPaths });
    assert.deepEqual(prepared.task.context.rules, policy.rules); assert.deepEqual(prepared.task.context.tools, policy.tools);
    assert.deepEqual(prepared.task.context.interfaces, policy.interfaces); assert.equal(prepared.task.budget.allocationMicroCny, policy.allocationMicroCny);
    assert.deepEqual(prepared.expectedArtifacts, policy.outputs.map(({ artifactId, version, destination }) => ({ artifactId, version, location: destination })));
    assert.deepEqual(prepared.task.dependsOn.map(item => item.taskId), proposal[index].dependsOn.map(alias => f.grants[authorRoles[proposal.findIndex(item => item.taskId === alias)]].taskId));
    assert.deepEqual(prepared.task.inputs, [...f.requirement.sources, ...prepared.task.dependsOn.flatMap(dep => result.tasks.find(item => item.task.taskId === dep.taskId)!.expectedArtifacts!)]);
  }
  const plan = JSON.parse(await readFile(result.plan.location, 'utf8'));
  assert.deepEqual(plan.identityBinding, proposal.map((draft, index) => ({ protocol, policy: draft.policyId, localAlias: draft.taskId, actualTaskId: f.grants[authorRoles[index]].taskId })));
  assert.deepEqual(plan.tasks, result.tasks); assert.deepEqual(plan.expectedOutputs.map((item: any) => item.taskId), result.tasks.map(item => item.task.taskId));
  assert.deepEqual(f.observed.contexts[0].ownership.writePaths, []);
  assert.deepEqual(f.observed.contexts[0].tools, ['read']); await f.unchanged();
});

test('foreign and other-role-looking aliases are bound only by the verified host policy', async t => {
  const f = await fixture(t), drafts = structuredClone(proposal);
  const aliases = ['cos20-other-case-coding', 'cos20-other-case-design', 'cos20-other-case-art'];
  drafts.forEach((draft, index) => { draft.taskId = aliases[index]; draft.dependsOn = index ? aliases.slice(0, index) : []; });
  // Reordered host slots cannot turn array position or model alias text into role authority.
  f.options.taskPolicies = [...f.taskPolicies].reverse(); f.reply(drafts);
  const result = await planTaskDag({ ...f.options, proposalIdentity: protocol } as PlanOptions);
  assert.deepEqual(result.tasks.map(item => item.task.taskId), authorRoles.map(role => f.grants[role].taskId));
  assert.deepEqual(result.tasks[2].task.dependsOn.map(item => item.taskId), [f.grants.design.taskId, f.grants.art.taskId]);
  const plan = JSON.parse(await readFile(result.plan.location, 'utf8'));
  assert.deepEqual(plan.identityBinding.map((item: any) => item.localAlias), aliases); await f.unchanged();
});

test('exact-grant default policy mode keeps its original prompt and plan shape', async t => {
  const f = await fixture(t), drafts = structuredClone(proposal);
  drafts.forEach((draft, index) => { draft.taskId = f.grants[authorRoles[index]].taskId; draft.dependsOn = index ? authorRoles.slice(0, index).map(role => f.grants[role].taskId) : []; });
  f.reply(drafts); const result = await planTaskDag(f.options), plan = JSON.parse(await readFile(result.plan.location, 'utf8'));
  assert.deepEqual(Object.keys(plan), ['status', 'specVersion', 'sessionDirectory', 'expectedOutputs', 'tasks']);
  assert.ok(!f.observed.prompts[0].includes('local proposal alias')); await f.unchanged();
});

for (const mode of ['duplicate-alias', 'duplicate-policy', 'missing-policy', 'unknown-policy', 'wrong-role', 'unknown-dependency', 'self-dependency', 'cycle', 'coverage', 'extra-authority', 'missing-slot', 'coding-dependencies'] as const) {
  test(`alias proposals retain strict rejection before task compilation: ${mode}`, async t => {
    const f = await fixture(t), drafts: any[] = structuredClone(proposal);
    if (mode === 'duplicate-alias') { drafts[1].taskId = drafts[0].taskId; drafts[1].dependsOn = []; drafts[2].dependsOn = [drafts[0].taskId]; }
    if (mode === 'duplicate-policy') Object.assign(drafts[1], { policyId: drafts[0].policyId, role: drafts[0].role });
    if (mode === 'missing-policy') delete drafts[0].policyId;
    if (mode === 'unknown-policy') drafts[0].policyId = 'unknown';
    if (mode === 'wrong-role') drafts[0].role = 'coding';
    if (mode === 'unknown-dependency') drafts[1].dependsOn = ['not-in-proposal'];
    if (mode === 'self-dependency') drafts[1].dependsOn.push(drafts[1].taskId);
    if (mode === 'cycle') drafts[0].dependsOn = [drafts[2].taskId];
    if (mode === 'coverage') drafts[2].acceptanceIds.pop();
    if (mode === 'extra-authority') drafts[0].allocationMicroCny = 99_999_999;
    if (mode === 'missing-slot') drafts.pop();
    if (mode === 'coding-dependencies') drafts[2].dependsOn = [drafts[0].taskId];
    f.reply(drafts);
    await assert.rejects(planTaskDag({ ...f.options, proposalIdentity: protocol } as PlanOptions), /Invalid task draft|policy slots|unique|fixed design and art|coverage|cycle/i);
    assert.equal(f.observed.sessions, 1); assert.equal(f.observed.closes, 1); await f.unchanged();
  });
}

for (const mode of ['unknown-flag', 'human', 'roles', 'wrong-role-slots', 'duplicate-slots', 'wrong-grant', 'empty-outputs'] as const) {
  test(`alias mode rejects invalid host configuration before FactorySession: ${mode}`, async t => {
    const f = await fixture(t), options: any = { ...f.options, proposalIdentity: protocol };
    if (mode === 'unknown-flag') options.proposalIdentity = 'validation-policy-aliases/2';
    if (mode === 'human') { options.validation = undefined; options.requirement = humanRequirement(); }
    if (mode === 'roles') { options.roles = Object.fromEntries(f.taskPolicies.map(({ role, policyId: _id, ...policy }) => [role, policy])); options.taskPolicies = undefined; }
    if (mode === 'wrong-role-slots') options.taskPolicies = f.taskPolicies.map((policy, index) => index ? policy : { ...policy, role: 'cosmos' });
    if (mode === 'duplicate-slots') options.taskPolicies = [f.taskPolicies[0], f.taskPolicies[0], f.taskPolicies[2]];
    if (mode === 'wrong-grant') options.taskPolicies = f.taskPolicies.map((policy, index) => index ? policy : { ...policy, allocationMicroCny: 1 });
    if (mode === 'empty-outputs') options.taskPolicies = f.taskPolicies.map((policy, index) => index ? policy : { ...policy, outputs: [] });
    await assert.rejects(planTaskDag(options));
    assert.equal(f.observed.sessions, 0); assert.deepEqual(f.observed.prompts, []); await f.unchanged();
  });
}

test('alias binding cannot publish after its actual operator source changes during planning', async t => {
  const f = await fixture(t), operatorPath = join(f.ledgerRoot, f.requirement.validation.decision.source.location);
  f.beforeReply(async () => { await writeFile(operatorPath, '{"changed":"合成篡改"}\n', 'utf8'); });
  await assert.rejects(planTaskDag({ ...f.options, proposalIdentity: protocol } as PlanOptions), /scope|operator source|authority/i);
  const [sessionDirectory] = await readdir(join(f.root, 'sessions'));
  assert.ok(!(await readdir(join(f.root, 'sessions', sessionDirectory))).includes('plan.json'));
  assert.equal(f.observed.closes, 1); await f.unchanged();
});

test('alias binding cannot publish after caller cancellation during planning', async t => {
  const f = await fixture(t), abort = new AbortController();
  f.beforeReply(async () => { abort.abort(new Error('Cancelled offline planning')); });
  await assert.rejects(planTaskDag({ ...f.options, proposalIdentity: protocol, signal: abort.signal } as PlanOptions), /Cancelled offline planning/);
  assert.equal(f.observed.closes, 1); await f.unchanged();
});
