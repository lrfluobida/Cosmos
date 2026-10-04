import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { createRoleFactory } from '../../src/roles/factory.ts';
import type { AuthorRole } from '../../src/roles/factory.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import type { PlanningTaskPolicy } from '../../src/roles/planner.ts';
import { validateTask } from '../../src/contracts/index.ts';
import type { RequirementContract } from '../../src/contracts/index.ts';
import { HOST_STAGE_ACCEPTANCE } from '../../src/roles/requirements.ts';
import { requirement as requirementFixture } from '../contracts/fixtures.ts';

const roleFields = ['taskId', 'role', 'objective', 'acceptanceIds', 'dependsOn'];
const policyFields = ['taskId', 'policyId', 'role', 'objective', 'acceptanceIds', 'dependsOn'];
const gameIds = ['T16-01', 'T16-02', 'T16-03', 'T16-04', 'T16-05', 'T16-06'];
// Only the desensitized shape of the failed reply; no real run files or provider calls.
const missingPolicyReply = [
  { taskId: 'cos20-transfer-validation-1-design', role: 'design', objective: 'Produce fixed design and transfer design', acceptanceIds: ['COSMOS-DESIGN'], dependsOn: [] },
  { taskId: 'cos20-transfer-validation-1-art', role: 'art', objective: 'Produce original media', acceptanceIds: ['COSMOS-MEDIA'], dependsOn: ['cos20-transfer-validation-1-design'] },
  { taskId: 'cos20-transfer-validation-1-coding', role: 'coding', objective: 'Implement confirmed six transfer criteria', acceptanceIds: gameIds, dependsOn: ['cos20-transfer-validation-1-design', 'cos20-transfer-validation-1-art'] },
];

function schemas(prompt: string): string[][] {
  return [...prompt.matchAll(/\{tasks:\[\{([^{}]+)\}\]\}/g)].map(match => match[1].split(',').map(field => field.trim()));
}
async function fixture(t: test.TestContext, repeatedRole = false) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-planning-schema-'));
  const requirement = requirementFixture() as RequirementContract;
  if (!repeatedRole) requirement.acceptance = [
    ...gameIds.map(acceptanceId => ({ acceptanceId, description: '离线规划结构', steps: ['核对固定输入'], expected: '原要求保持', evidenceKinds: ['test_report' as const] })),
    ...structuredClone(HOST_STAGE_ACCEPTANCE),
  ];
  await mkdir(join(root, 'requirements'));
  await writeFile(join(root, requirement.sources[0].location), JSON.stringify({ brief: '离线规划测试；不生成游戏' }), 'utf8');
  const controller = await RunController.create({ root: join(root, 'run'), runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation',
    specVersion: requirement.specVersion, scope: 'validation', limitMicroCny: 1000, allocations: [{ taskId: 'planning', amountMicroCny: 100 }] });
  t.after(async () => { await controller.close(); assert.ok(root.startsWith(tmpdir())); await rm(root, { recursive: true, force: true }); });
  const roles: AuthorRole[] = repeatedRole ? ['coding', 'coding'] : ['design', 'art', 'coding'];
  const taskPolicies: PlanningTaskPolicy[] = roles.map((role, index) => ({ policyId: repeatedRole ? `code-${index}` : `game-${role}`, role, workspace: root,
    allocationMicroCny: 200, writePaths: [`outputs/${index}`], readOnlyPaths: ['requirements'], tools: ['read', 'write'], rules: ['保留 host 权限与中文内容'],
    outputs: [{ artifactId: `result-${index}`, version: 'v1', destination: `artifacts/result-${index}/v1`, type: 'data', schema: 'offline/1' }] }));
  const drafts = repeatedRole ? taskPolicies.map((policy, index) => ({ taskId: `coding-${index}`, role: policy.role, objective: 'Independent coding slot',
    acceptanceIds: ['AC-1'], dependsOn: index ? ['coding-0'] : [] })) : structuredClone(missingPolicyReply);
  return { root, controller, requirement, taskPolicies, drafts };
}

for (const mode of ['policies', 'roles', 'repeated-role'] as const) test(`planning communicates its exact schema and binds a native mock proposal: ${mode}`, async t => {
  const f = await fixture(t, mode === 'repeated-role'), policyMode = mode !== 'roles';
  const before = await f.controller.read(); let prompts = 0, closed = 0;
  const factory = createRoleFactory({ maxOutputTokens: 500, maxRequests: 1, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 100,
    sessionFactory: async config => ({ async prompt(text) {
      prompts++;
      assert.deepEqual(schemas(config.systemPrompt), [policyFields, roleFields], 'System instruction must state both conditional schemas instead of an unconditional five-field reply.');
      const [fields] = schemas(text);
      assert.deepEqual(fields, policyMode ? policyFields : roleFields, 'The actual host request must declare every required field for its selected mode.');
      // This offline transport follows the advertised schema; the real planner binds the result.
      return { text: JSON.stringify({ tasks: f.drafts.map((draft, index) => {
        const values = { ...draft, policyId: f.taskPolicies[index].policyId };
        return Object.fromEntries(fields.map(field => [field, values[field as keyof typeof values]]));
      }) }) };
    }, async close() { closed++; } }) });
  const result = await planTaskDag({ controller: f.controller, requirement: f.requirement, planningTaskId: 'planning', workspace: f.root,
    sessionRoot: join(f.root, 'sessions'), availableArtifacts: f.requirement.sources, roleFactory: factory,
    ...(policyMode ? { taskPolicies: f.taskPolicies } : { roles: Object.fromEntries(f.taskPolicies.map(({ role, policyId: _id, ...policy }) => [role, policy])) }) });
  assert.equal(prompts, 1); assert.equal(closed, 1);
  assert.deepEqual(result.tasks.map(item => item.task.taskId), f.drafts.map(item => item.taskId));
  for (const [index, prepared] of result.tasks.entries()) {
    assert.deepEqual(validateTask(prepared.task), []);
    assert.deepEqual(prepared.task.ownership, { writePaths: f.taskPolicies[index].writePaths, readOnlyPaths: f.taskPolicies[index].readOnlyPaths });
    assert.deepEqual(prepared.task.context.tools, f.taskPolicies[index].tools);
    assert.deepEqual(prepared.task.context.rules, ['保留 host 权限与中文内容']);
    assert.equal(prepared.task.budget.allocationMicroCny, 200);
    assert.deepEqual(prepared.expectedArtifacts, f.taskPolicies[index].outputs.map(({ artifactId, version, destination }) => ({ artifactId, version, location: destination })));
    assert.deepEqual(prepared.task.inputs, [...f.requirement.sources, ...prepared.task.dependsOn.flatMap(dependency => result.tasks.find(item => item.task.taskId === dependency.taskId)!.expectedArtifacts!)]);
  }
  assert.deepEqual(JSON.parse(await readFile(result.plan.location, 'utf8')).tasks, result.tasks);
  assert.deepEqual(await f.controller.read(), before, 'A plan proposal cannot register author tasks or alter fees, grants and deadline.');
});

for (const mode of ['missing-policy', 'unknown-policy', 'duplicate-policy', 'wrong-role'] as const) test(`policy validation still rejects the original unsafe reply without task registration: ${mode}`, async t => {
  const f = await fixture(t), before = await f.controller.read(); let prompts = 0, closed = 0;
  const drafts = f.drafts.map((draft, index) => ({ ...draft, ...(mode === 'missing-policy' ? {} : { policyId: f.taskPolicies[index].policyId }) }));
  if (mode === 'unknown-policy') Object.assign(drafts[0], { policyId: 'unknown' });
  if (mode === 'duplicate-policy') Object.assign(drafts[1], { policyId: f.taskPolicies[0].policyId });
  if (mode === 'wrong-role') Object.assign(drafts[0], { role: 'coding' });
  const roleFactory = createRoleFactory({ maxOutputTokens: 500, maxRequests: 1, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 100,
    sessionFactory: async () => ({ async prompt() { prompts++; return { text: JSON.stringify({ tasks: drafts }) }; }, async close() { closed++; } }) });
  await assert.rejects(planTaskDag({ controller: f.controller, requirement: f.requirement, planningTaskId: 'planning', workspace: f.root,
    sessionRoot: join(f.root, 'sessions'), availableArtifacts: f.requirement.sources, taskPolicies: f.taskPolicies, roleFactory }), /Invalid task draft|policy slots|unique/i);
  assert.equal(prompts, 1); assert.equal(closed, 1);
  assert.deepEqual(await f.controller.read(), before);
  assert.deepEqual(before.tasks, []); assert.deepEqual(before.ledger.entries, []);
});
