import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { mock, test } from 'node:test';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRoleFactory } from '../../src/roles/factory.ts';
import type { RoleFactoryOptions, RoleSession } from '../../src/roles/factory.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';
import { RunController } from '../../src/runtime/run.ts';
import type { RequirementContract, TaskContract } from '../../src/contracts/index.ts';
import { requirement as requirementFixture, task as taskFixture } from '../contracts/fixtures.ts';
import { validationBrowserFixture } from './entrypoint-host-validation.fixture.ts';
import { fundingFixture } from './public-validation-funding.fixture.ts';
import { reservePublicValidationFunding } from '../../src/runtime/public-validation-funding.ts';
import { runProductSession } from '../../src/cli/session.ts';
import { createBrowserHost, createProductHost } from '../../src/runtime/entrypoint-host.ts';
import { withHostStages } from '../../src/roles/requirements.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';

const base = { maxOutputTokens: 8192, maxRequests: 16, requestTimeoutMs: 120000, estimatedMaxCostMicroCny: 1000 };
const handoff = { summary: '离线协议交接', remaining: ['尚待补全的真实缺陷'], uncertainty: [] };

async function fixture(t: TestContext, allocation = 100000) {
  const root = await mkdtemp(join(tmpdir(), 'cos122-'));
  const requirement = requirementFixture() as RequirementContract, task = taskFixture() as TaskContract;
  const controller = await RunController.create({ root: join(root, 'run'), runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation',
    specVersion: requirement.specVersion, scope: 'generation', limitMicroCny: allocation, allocations: [{ taskId: task.taskId, amountMicroCny: allocation }] });
  task.budget = { ...task.budget, allocationMicroCny: allocation, originalDeadlineAt: (await controller.read()).run.originalDeadlineAt };
  task.context.tools = ['read'];
  await mkdir(join(root, 'game'));
  await writeFile(join(root, 'game/note.txt'), '原始中文内容。', 'utf8');
  const sessions: RoleSession[] = [];
  t.after(async () => { for (const session of sessions) await session.close(); await controller.close(); assert.ok(root.startsWith(tmpdir())); await rm(root, { recursive: true, force: true }); });
  const input = { role: 'design' as const, task, requirement, controller, workspace: root, stateDirectory: join(root, 'session') };
  const create = async (options: Partial<RoleFactoryOptions> = {}) => {
    const session = await createRoleFactory({ ...base, authorMaxRequests: { design: 32 }, env: { DEEPSEEK_API_KEY: 'offline-cos122' }, ...options })(input);
    sessions.push(session); return session;
  };
  return { root, controller, input, create };
}

async function nativeFixture(t: TestContext, finalAt: number, allocation?: number) {
  const f = await fixture(t, allocation), payloads: any[] = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    assert.equal(new URL(request.url).origin, 'https://api.deepseek.com');
    payloads.push(JSON.parse(await request.text()));
    const state = await f.controller.read(), entry = state.ledger.entries.at(-1)!;
    assert.equal(entry.status, 'reserved'); assert.equal(entry.reservedMicroCny, 1000);
    assert.equal(state.requests.at(-1)!.requestId, entry.requestId);
    const index = payloads.length;
    const delta = index === finalAt ? { content: JSON.stringify(handoff) } : { tool_calls: [0, 1].map(slot => ({ index: slot, id: `read-${index}-${slot}`, type: 'function',
      function: { name: 'read', arguments: JSON.stringify({ path: 'game/note.txt' }) } })) };
    const chunk = { id: `offline-${index}`, model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason: index === finalAt ? 'stop' : 'tool_calls' }],
      usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 } };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  t.after(() => fetchMock.mock.restore());
  return { ...f, payloads };
}

test('COS122 trusted author request caps select once by purpose and retain omitted/empty fallback', async t => {
  const f = await fixture(t); let seen!: PiSessionOptions;
  const sessionFactory = async (config: PiSessionOptions) => { seen = config; return { prompt: async () => ({ text: '' }), close: async () => {} }; };
  for (const authorMaxRequests of [undefined, {}, { design: 32, cosmos: 21, art: 22, coding: 24 }]) {
    const factory = createRoleFactory({ ...base, authorMaxRequests, sessionFactory });
    for (const [role, purpose] of [['design', undefined], ['art', undefined], ['coding', undefined], ['cosmos', undefined],
      ['design', 'planning'], ['cosmos', 'planning'], ['reviewer', undefined]] as const) {
      const session = await factory({ ...f.input, role, purpose }); await session.close();
      const cap = purpose !== 'planning' && role !== 'reviewer' ? authorMaxRequests?.[role] : undefined;
      assert.equal(seen.maxRequests, cap ?? 16, `${role}/${purpose ?? 'author'}`);
      if (cap) {
        assert.match(seen.systemPrompt, new RegExp(`at most ${cap} model requests`));
        assert.match(seen.systemPrompt, /not files or individual tool calls/);
        assert.match(seen.systemPrompt, /Reserve requests for complete self-checks.*final JSON handoff/);
        assert.match(seen.systemPrompt, /report.*real.*remaining/i);
      } else assert.doesNotMatch(seen.systemPrompt, /model requests/);
      assert.equal(seen.maxOutputTokens, 8192); assert.equal(seen.requestTimeoutMs, 120000);
      assert.equal(JSON.parse(seen.context).budget.allocationMicroCny, 100000);
      assert.deepEqual(await seen.requestWindow!(), { deadlineAt: Date.parse(f.input.task.budget.originalDeadlineAt), cleanupMs: 5000 });
    }
  }
  const override = { design: 23 }, factory = createRoleFactory({ ...base, authorMaxRequests: override, sessionFactory });
  override.design = 99;
  const session = await factory(f.input); await session.close();
  assert.equal(seen.maxRequests, 23); assert.match(seen.systemPrompt, /at most 23 model requests/);
});

test('COS122 invalid trusted request caps fail before constructing any session', () => {
  for (const authorMaxRequests of [{ reviewer: 32 }, { planning: 32 }, { unknown: 32 }, { design: 0 }, { design: -1 }, { design: 1.5 },
    { design: Infinity }, { design: NaN }, { design: Number.MAX_SAFE_INTEGER + 1 }, { design: undefined }, { design: null }, { design: '32' }]) {
    assert.throws(() => createRoleFactory({ ...base, authorMaxRequests } as unknown as RoleFactoryOptions), /authorMaxRequests/);
  }
});

test('COS122 fixed validation retains the declared host cap and ignores a trusted author override', async t => {
  const f = await validationBrowserFixture(t), host = await f.create(), prepared = f.prepare(host);
  host.validateTasks!(prepared); await f.controller.registerTasks(prepared.map(item => item.task));
  await host.preAuthor!(prepared[0].task, f.controller.signal);
  const task = structuredClone(prepared[0].task); task.state = 'ready'; await f.controller.saveTask(task, { role: 'system', actorId: 'runtime' });
  task.state = 'running'; task.attempts = [{ attemptId: 'capacity-attempt', sessionRef: join(f.root, 'sessions/capacity-attempt'), startedAt: new Date().toISOString(), endedAt: null, outcome: 'running', failure: null }];
  await f.controller.saveTask(task, { role: 'system', actorId: 'runtime' });
  const input = { role: 'design' as const, task, requirement: f.requirement, validation: f.validation, controller: f.controller,
    workspace: prepared[0].workspace, stateDirectory: join(f.root, 'sessions/capacity-attempt/author') };
  const original = await host.roleFactory(input); await original.close();
  assert.equal(f.configs.at(-1)!.maxRequests, f.declaration.limits.maxRequests);
  assert.doesNotMatch(f.configs.at(-1)!.systemPrompt, /model requests/);
  let seen!: PiSessionOptions;
  const factory = createRoleFactory({ ...base, authorMaxRequests: { design: 32 }, sessionFactory: async config => {
    seen = config; return { prompt: async () => ({ text: '' }), close: async () => {} };
  } });
  const overridden = await factory(input); await overridden.close();
  assert.equal(seen.maxRequests, 16); assert.doesNotMatch(seen.systemPrompt, /model requests/);
});

for (const count of [17, 32]) test(`COS122 native design author reaches protocol handoff on model request ${count}`, async t => {
  const f = await nativeFixture(t, count), before = await f.controller.read(), session = await f.create();
  const result = await session.prompt('Read the fixed input, then report the real remaining work.');
  assert.deepEqual(JSON.parse(result.text), handoff); assert.equal(f.payloads.length, count);
  const last = f.payloads.at(-1);
  assert.equal(last.messages.filter((message: any) => message.role === 'tool').length, 2 * (count - 1));
  assert.match(JSON.stringify(last.messages), /原始中文内容/);
  assert.equal(last.max_tokens, 8192);
  const after = await f.controller.read();
  assert.equal(after.requests.length, count); assert.equal(after.ledger.entries.length, count);
  assert.ok(after.ledger.entries.every(entry => entry.status === 'settled' && entry.settledMicroCny === 140));
  assert.deepEqual(after.ledger.allocations, before.ledger.allocations); assert.deepEqual(after.tasks, before.tasks);
  assert.equal(after.run.originalDeadlineAt, before.run.originalDeadlineAt); assert.equal(after.ledger.limitMicroCny, before.ledger.limitMicroCny);
  if (count === 32) {
    assert.ok(session.readonlyPrompt);
    await assert.rejects(session.readonlyPrompt!('A new format correction still consumes the same cap.'), { code: 'request_limit' });
    assert.equal(f.payloads.length, 32); assert.deepEqual(await f.controller.read(), after);
  }
});

test('COS122 native request 33 is denied before transport and accounting, including readonly correction', async t => {
  const f = await nativeFixture(t, 33), session = await f.create();
  await assert.rejects(session.prompt('The final response would require request 33.'), { code: 'request_limit' });
  assert.equal(f.payloads.length, 32);
  const before = await f.controller.read();
  assert.equal(before.requests.length, 32); assert.equal(before.ledger.entries.length, 32);
  assert.ok(before.ledger.entries.every(entry => entry.status === 'settled'));
  assert.ok(session.readonlyPrompt);
  await assert.rejects(session.readonlyPrompt!('Return only final JSON.'), { code: 'request_limit' });
  assert.equal(f.payloads.length, 32); assert.deepEqual(await f.controller.read(), before);
});

test('COS122 omitted override retains the native 16 request cap', async t => {
  const f = await nativeFixture(t, 17), session = await f.create({ authorMaxRequests: undefined });
  await assert.rejects(session.prompt('The final response would require request 17.'), { code: 'request_limit' });
  assert.equal(f.payloads.length, 16); assert.equal((await f.controller.read()).ledger.entries.length, 16);
});

test('COS122 increased capacity still stops at the original insufficient allocation', async t => {
  const f = await nativeFixture(t, 17, 1000), session = await f.create();
  await assert.rejects(session.prompt('Continue only within the existing allocation.'), { code: 'admission_rejected' });
  assert.equal(f.payloads.length, 1);
  const state = await f.controller.read(); assert.equal(state.requests.length, 1); assert.equal(state.ledger.entries.length, 1);
  assert.equal(state.ledger.entries[0].settledMicroCny, 140); assert.equal(state.ledger.limitMicroCny, 1000);
});

for (const fault of ['deadline', 'authority'] as const) test(`COS122 increased capacity retains the original ${fault} guard`, async t => {
  const f = await nativeFixture(t, 1), session = await f.create();
  await session.prompt('First permitted request.');
  const before = await f.controller.read();
  if (fault === 'deadline') {
    const clock = mock.method(Date, 'now', () => Date.parse(before.run.originalDeadlineAt) - 4000);
    t.after(() => clock.mock.restore());
  } else {
    const original = await f.controller.executionAuthority(f.input.task.taskId);
    const authority = mock.method(f.controller, 'executionAuthority', async () => ({ ...original, executionAllowed: false, admissionAllowed: false }));
    t.after(() => authority.mock.restore());
  }
  await assert.rejects(session.prompt('No authority to send another request.'), { code: 'admission_rejected' });
  assert.equal(f.payloads.length, 1); assert.deepEqual(await f.controller.read(), before);
});

test('COS122 funded ordinary host gets design capacity while retaining its original grant and window', async t => {
  const f = await fundingFixture(t), args = await f.authorization('capacity'), binding = await reservePublicValidationFunding(args);
  const configs: PiSessionOptions[] = [], output = new PassThrough(); output.resume();
  const sessionFactory = async (config: PiSessionOptions) => {
    configs.push(config); const packet = JSON.parse(config.context);
    return { close: async () => {}, prompt: async () => ({ text: JSON.stringify(packet.role === 'cosmos' ? { tasks: [
      { taskId: 'design', policyId: 'game-design', role: 'design', objective: '设计', acceptanceIds: ['COSMOS-DESIGN'], dependsOn: [] },
      { taskId: 'art', policyId: 'game-art', role: 'art', objective: '素材', acceptanceIds: ['COSMOS-MEDIA'], dependsOn: ['design'] },
      { taskId: 'coding', policyId: 'game-code', role: 'coding', objective: '编码', acceptanceIds: ['click'], dependsOn: ['design', 'art'] },
    ] } : { summary: 'Offline capacity fixture only', remaining: [], uncertainty: ['This fixture cannot supply design content.'] }) }) };
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
    acceptance: [{ acceptanceId: 'click', description: '点击完成', steps: ['点击目标'], expected: '完成', evidenceKinds: ['test_report'] }],
    experienceCriteria: [{ criterionId: 'readable', description: '清楚显示', steps: ['查看状态'], expected: '状态清楚' }] });
  // Construct the actual funded author, then stop this configuration-only fixture before generation.
  host.execute = async input => {
    const controller = await RunController.open({ root: input.root });
    try {
      const options = { ...input, controller, work: new OwnedWork(controller.signal), sessionFactory };
      const active = await createBrowserHost(options);
      const plan = await planTaskDag({ controller, requirement: input.requirement, planningTaskId: 'planning', workspace: input.root,
        sessionRoot: join(input.root, 'sessions'), availableArtifacts: active.availableArtifacts, taskPolicies: active.taskPolicies, roleFactory: active.roleFactory });
      active.validateTasks!(plan.tasks);
      await writeFile(join(input.root, 'execution.json'), JSON.stringify({ capability: active.capability, requirement: input.requirement, tasks: plan.tasks, availableArtifacts: active.availableArtifacts, plan: plan.plan }), 'utf8');
      await active.bindPreparedTasks?.(plan.tasks); await controller.registerTasks(plan.tasks.map(item => item.task));
      const task = structuredClone(plan.tasks[0].task); await active.preAuthor!(task, controller.signal);
      task.state = 'ready'; await controller.saveTask(task, { role: 'system', actorId: 'runtime' });
      task.state = 'running'; task.attempts = [{ attemptId: 'capacity', sessionRef: join(input.root, 'sessions/capacity'), startedAt: new Date().toISOString(), endedAt: null, outcome: 'running', failure: null }];
      await controller.saveTask(task, { role: 'system', actorId: 'runtime' });
      const author = await active.roleFactory({ role: 'design', task, requirement: input.requirement, controller, workspace: plan.tasks[0].workspace, stateDirectory: join(input.root, 'sessions/capacity/author') });
      await author.close(); return { outcome: 'incomplete', gaps: ['Configuration-only source fixture.'] };
    } finally { await controller.close(); }
  };
  await runProductSession({ command: 'new', root: args.runRoot, brief: args.payload.brief, funding: binding, limits: args.payload.limits,
    host, input: Readable.from(['点击完成\nconfirm 1\n']), output });
  assert.deepEqual(configs.map(config => [JSON.parse(config.context).role, config.maxRequests]), [['cosmos', 16], ['design', 32]]);
  const state = await f.child(args.runRoot), packet = JSON.parse(configs[1].context);
  assert.equal(state.ledger.limitMicroCny, 5000000); assert.deepEqual(state.validationFunding, binding);
  assert.equal(Date.parse(state.run.originalDeadlineAt) - Date.parse(state.run.originalStartedAt), 1800000);
  assert.equal(packet.budget.originalDeadlineAt, state.run.originalDeadlineAt);
  assert.equal(packet.budget.allocationMicroCny, state.ledger.allocations.find((item: any) => item.taskId === 'design').amountMicroCny);
  assert.equal(state.tasks.find((task: TaskContract) => task.taskId === 'design').attempts.length, 1);
  assert.equal(state.ledger.entries.length, 0);
});
