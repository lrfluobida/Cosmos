import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { SimpleStreamOptions } from '@earendil-works/pi-ai';
import { createPiSession } from '../../src/providers/pi.ts';
import type { PiResponse } from '../../src/providers/pi.ts';
import { createRoleFactory } from '../../src/roles/factory.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import type { PlanOptions, PlanningTaskPolicy } from '../../src/roles/planner.ts';
import { usageCostMicroCny } from '../../src/roles/provider-budget.ts';
import { RunController } from '../../src/runtime/run.ts';
import { validationReservation } from '../../src/runtime/validation-validation.ts';
import type { RequirementContract } from '../../src/contracts/index.ts';
import { requirement as requirementFixture } from '../contracts/fixtures.ts';
import { transferFixture } from '../transfer/runtime-host.fixture.ts';

const objective = '保留 "引号"、路径 sample\\file 与换行\n第二行。';
const usage = { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 };
type Payload = { model: string; max_tokens: number; reasoning_effort: string; response_format?: unknown;
  tools?: { function: { name: string } }[]; messages: { role: string; content: string }[]; [key: string]: unknown };

function transport(t: test.TestContext, content: () => string, finishReason = 'stop') {
  const bodies: Payload[] = [], dispatches: SimpleStreamOptions[] = [];
  const nativeStream = ModelRuntime.prototype.streamSimple;
  t.mock.method(ModelRuntime.prototype, 'streamSimple', function(this: ModelRuntime, ...args: Parameters<typeof nativeStream>) {
    dispatches.push(args[2]!);
    return nativeStream.apply(this, args);
  });
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    assert.equal(new URL(request.url).origin, 'https://api.deepseek.com');
    bodies.push(JSON.parse(await request.text()) as Payload);
    const chunk = { id: 'offline-planning', model: 'deepseek-flash', choices: [{ index: 0, delta: { content: content() }, finish_reason: finishReason }], usage };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  return { bodies, dispatches };
}

async function fixture(t: test.TestContext, validation = false) {
  const f = validation ? await transferFixture(t) : undefined;
  const root = f?.root ?? await mkdtemp(join(tmpdir(), 'cosmos-planning-json-'));
  const requirement = f?.requirement ?? requirementFixture() as RequirementContract;
  if (!f) {
    await mkdir(join(root, 'requirements'));
    await writeFile(join(root, requirement.sources[0].location), '{"brief":"通用离线规划测试"}\n', 'utf8');
  }
  const controller = f?.controller ?? await RunController.create({ root: join(root, 'run'), runId: 'run-1', ledgerId: 'ledger-1',
    kind: 'runtime_generation', specVersion: requirement.specVersion, scope: 'validation', limitMicroCny: 1_000_000,
    allocations: [{ taskId: 'planning', amountMicroCny: 200_000 }] });
  if (!f) t.after(async () => { await controller.close(); assert.ok(root.startsWith(tmpdir())); await rm(root, { recursive: true, force: true }); });
  const roles = validation ? ['design', 'art', 'coding'] as const : ['design'] as const;
  const taskPolicies: PlanningTaskPolicy[] = roles.map(role => ({ policyId: `host-${role}`, role, workspace: root,
    allocationMicroCny: f?.window.quote.declaration.grants[role].amountMicroCny ?? 100_000,
    writePaths: [`outputs/${role}`], readOnlyPaths: ['requirements'], tools: ['read', 'write'], rules: ['保持固定权限和中文内容'],
    outputs: [{ artifactId: `result-${role}`, version: 'v1', destination: `artifacts/${role}/v1`, type: 'data', schema: 'offline/1' }] }));
  const drafts = taskPolicies.map((policy, index) => ({ taskId: `proposal-${policy.role}`, policyId: policy.policyId, role: policy.role, objective,
    acceptanceIds: f ? policy.role === 'coding' ? f.window.quote.requirements.acceptanceIds : [f.window.quote.requirements.stageAcceptanceIds[index]]
      : requirement.acceptance.map(item => item.acceptanceId), dependsOn: index ? roles.slice(0, index).map(role => `proposal-${role}`) : [] }));
  const roleFactory = createRoleFactory({ maxOutputTokens: 512, authorMaxOutputTokens: { cosmos: 1024 }, maxRequests: 3,
    requestTimeoutMs: 2000, codingAuthorRequestTimeoutMs: 3000, thinkingLevel: 'low', authorThinkingLevel: { cosmos: 'high' },
    estimatedMaxCostMicroCny: validationReservation, env: { DEEPSEEK_API_KEY: 'offline-test-key' } });
  const options: PlanOptions = { controller, requirement, planningTaskId: f?.window.quote.declaration.grants.planning.taskId ?? 'planning',
    workspace: root, sessionRoot: join(root, 'sessions'), availableArtifacts: requirement.sources, taskPolicies, roleFactory,
    ...(f ? { validation: f.validation, proposalIdentity: 'validation-policy-aliases/1' as const } : {}) };
  return { root, controller, options, drafts, taskPolicies, validation: f, before: await controller.read() };
}

async function assertRequest(f: Awaited<ReturnType<typeof fixture>>, wire: ReturnType<typeof transport>) {
  assert.equal(wire.bodies.length, 1, 'There is no corrective or hidden second request.');
  assert.equal(wire.dispatches.length, 1);
  const body = wire.bodies[0], dispatch = wire.dispatches[0];
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(body.model, 'deepseek-flash');
  assert.equal(body.reasoning_effort, 'low');
  assert.equal(body.max_tokens, f.validation?.window.quote.declaration.outputTokens.planning ?? 512);
  assert.deepEqual(body.tools?.map(tool => tool.function.name), ['read']);
  assert.equal(dispatch.maxRetries, 0); assert.equal(dispatch.timeoutMs, 2000); assert.equal(dispatch.signal?.aborted, false);
  const after = await f.controller.read(), before = f.before;
  assert.deepEqual(after.tasks, before.tasks); assert.deepEqual(after.run.taskIds, before.run.taskIds);
  assert.deepEqual(after.ledger.allocations, before.ledger.allocations);
  assert.equal(after.run.originalDeadlineAt, before.run.originalDeadlineAt);
  const entries = after.ledger.entries.filter(entry => entry.taskId === f.options.planningTaskId);
  assert.equal(entries.length, 1); assert.equal(entries[0].status, 'settled'); assert.equal(entries[0].settledMicroCny, 140);
  assert.ok(after.requests.find(request => request.requestId === entries[0].requestId)?.admittedAt);
  const [directory] = await readdir(f.options.sessionRoot), files = await readdir(join(f.options.sessionRoot, directory));
  const receipt = JSON.parse(await readFile(join(f.options.sessionRoot, directory, `billing-${entries[0].requestId}.json`), 'utf8'));
  assert.equal(receipt.taskId, f.options.planningTaskId); assert.equal(receipt.outcome, 'settled');
  assert.equal(receipt.responseModel, body.model); assert.equal(usageCostMicroCny(receipt.usage), 140);
  const native = files.find(file => file.endsWith('.jsonl'));
  assert.ok(native, 'The original native transcript is retained.');
  const transcript = await readFile(join(f.options.sessionRoot, directory, native), 'utf8');
  assert.equal(transcript.includes('offline-test-key'), false);
  return { directory: join(f.options.sessionRoot, directory), files, transcript, receipt };
}

for (const validation of [false, true]) test(`trusted planning reaches native JSON transport and preserves host bindings: validation=${validation}`, async t => {
  const f = await fixture(t, validation), response = JSON.stringify({ tasks: f.drafts });
  const wire = transport(t, () => response), result = await planTaskDag(f.options);
  await assertRequest(f, wire);
  for (const [index, prepared] of result.tasks.entries()) {
    const policy = f.taskPolicies[index];
    assert.equal(prepared.task.objective, objective);
    assert.deepEqual(prepared.task.context.rules, policy.rules);
    assert.deepEqual(prepared.task.context.tools, policy.tools);
    assert.deepEqual(prepared.task.ownership, { writePaths: policy.writePaths, readOnlyPaths: policy.readOnlyPaths });
    assert.deepEqual(prepared.task.acceptanceIds, f.drafts[index].acceptanceIds);
    assert.equal(prepared.task.budget.allocationMicroCny, policy.allocationMicroCny);
    assert.equal(prepared.task.taskId, f.validation?.window.quote.declaration.grants[policy.role as 'design' | 'art' | 'coding'].taskId ?? f.drafts[index].taskId);
  }
  assert.deepEqual(JSON.parse(await readFile(result.plan.location, 'utf8')).tasks, result.tasks);
});

for (const mode of ['empty', 'invalid', 'length'] as const) test(`JSON transport remains fail closed for ${mode} responses without correction`, async t => {
  const f = await fixture(t), response = mode === 'empty' ? '' : mode === 'invalid' ? '{"tasks":[{"objective":"含"引号""}]}' : '{"tasks":[';
  const wire = transport(t, () => response, mode === 'length' ? 'length' : 'stop');
  await assert.rejects(planTaskDag(f.options), mode === 'length' ? { code: 'incomplete' } : /one complete JSON object/);
  const saved = await assertRequest(f, wire);
  assert.equal(saved.files.includes('plan.json'), false); assert.equal(saved.files.includes('execution.json'), false);
  assert.equal(JSON.parse(await readFile(join(saved.directory, 'handoff.json'), 'utf8')).status, 'failed');
  assert.equal(saved.receipt.stopReason, mode === 'length' ? 'length' : 'stop');
  if (mode === 'invalid') assert.ok(saved.transcript.includes(JSON.stringify(response).slice(1, -1)), 'Invalid model text is retained verbatim.');
});

for (const role of ['cosmos', 'design', 'art', 'coding', 'reviewer'] as const) test(`nonplanning ${role} retains its native response format`, async t => {
  const f = await fixture(t), wire = transport(t, () => JSON.stringify({ tasks: f.drafts }));
  const result = await planTaskDag(f.options), task = result.tasks[0].task;
  // Reuse a valid proposal contract with the existing planning grant; only this TEMP role session sends a request.
  task.taskId = f.options.planningTaskId; task.budget.allocationMicroCny = 200_000;
  const session = await f.options.roleFactory({ role, task, requirement: f.options.requirement, workspace: f.root,
    stateDirectory: join(f.root, `nonplanning-${role}`), controller: f.controller });
  try { await session.prompt('Return the synthetic reply.'); } finally { await session.close(); }
  assert.equal(wire.bodies.length, 2); assert.equal(wire.bodies[1].response_format, undefined);
  assert.equal(wire.bodies[1].max_tokens, role === 'cosmos' ? 1024 : 512);
  assert.equal(wire.bodies[1].reasoning_effort, role === 'cosmos' ? 'high' : 'low');
  assert.equal(wire.dispatches[1].timeoutMs, role === 'coding' ? 3000 : 2000);
  assert.deepEqual(wire.bodies[1].tools?.map(tool => tool.function.name), role === 'reviewer' ? ['read'] : ['read', 'write']);
});

for (const mode of ['default', 'in-place', 'async-replacement', 'frozen-replacement'] as const) test(`native payload hook semantics are retained: ${mode}`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-json-hook-')), wire = transport(t, () => '{"synthetic":true}');
  let runtime!: ModelRuntime, hookCalls = 0;
  const nativeCreate = ModelRuntime.create;
  t.mock.method(ModelRuntime, 'create', async (...args: Parameters<typeof nativeCreate>) => (runtime = await nativeCreate(...args)));
  const admissions: string[] = [], settlements: PiResponse[] = [];
  let frozenReplacement: Readonly<Record<string, unknown>> | undefined;
  const session = await createPiSession({ workspace: root, stateDirectory: join(root, 'session'), systemPrompt: 'Return JSON.', context: '', tools: [],
    env: { DEEPSEEK_API_KEY: 'offline-hook-key' }, maxOutputTokens: 128, maxRequests: 1, requestTimeoutMs: 1000,
    ...(mode === 'default' ? {} : { jsonOutput: true }), estimatedMaxCostMicroCny: 1000,
    budget: { beforeRequest: async request => { admissions.push(request.requestId); }, afterResponse: async response => { settlements.push(response); } } });
  t.after(async () => { await session.close(); assert.ok(root.startsWith(tmpdir())); await rm(root, { recursive: true, force: true }); });
  if (mode === 'default') await session.prompt('Return JSON.');
  else {
    const model = runtime.getModel('deepseek', 'deepseek-flash')!;
    const hook: NonNullable<SimpleStreamOptions['onPayload']> = (payload, actualModel) => {
      hookCalls++; assert.equal(actualModel.id, model.id);
      const body = payload as Record<string, unknown>;
      if (mode === 'in-place') { body.seed = 17; body.response_format = { type: 'text' }; return undefined; }
      if (mode === 'frozen-replacement') {
        frozenReplacement = Object.freeze({ ...body, seed: 23, response_format: { type: 'text' } });
        return Promise.resolve(frozenReplacement);
      }
      return Promise.resolve({ ...body, seed: 23, response_format: { type: 'text' } });
    };
    const result = await runtime.streamSimple(model, { messages: [{ role: 'user', content: 'Return JSON.', timestamp: 0 }] }, { onPayload: hook }).result();
    assert.equal(result.stopReason, 'stop');
    assert.equal(hookCalls, 1);
    assert.equal(wire.bodies[0].seed, mode === 'in-place' ? 17 : 23);
    if (mode === 'frozen-replacement') {
      assert.ok(Object.isFrozen(frozenReplacement));
      assert.deepEqual(frozenReplacement!.response_format, { type: 'text' });
      assert.equal(frozenReplacement!.seed, 23);
    }
  }
  assert.equal(wire.bodies.length, 1); assert.equal(wire.bodies[0].model, 'deepseek-flash');
  assert.equal(wire.bodies[0].max_tokens, 128); assert.ok(wire.bodies[0].messages.length);
  assert.deepEqual(wire.bodies[0].response_format, mode === 'default' ? undefined : { type: 'json_object' });
  assert.equal(admissions.length, 1); assert.deepEqual(settlements.map(response => response.requestId), admissions);
  assert.equal(settlements[0].outcome, 'settled'); assert.equal(settlements[0].stopReason, 'stop');
});
