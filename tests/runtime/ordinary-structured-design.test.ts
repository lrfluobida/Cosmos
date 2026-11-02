import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { createPiSession } from '../../src/providers/pi.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';
import type { RoleInput } from '../../src/roles/factory.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { ORDINARY_DESIGN_AUTHORING_RULE, ORDINARY_DRAFT_PRESERVATION_RULE } from '../../src/runtime/entrypoint-design-authoring.ts';
import { ORDINARY_PLAN_AUTHORING_RULE } from '../../src/runtime/entrypoint-plan-authoring.ts';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';

const path = 'authors/design/design.json';
const handoff = { text: JSON.stringify({ summary: '合成设计写入测试，不是实际生成结果', remaining: [], uncertainty: [] }) };
const design = { summary: '原创鼠标游戏', implementationNotes: ['使用 <div class="item item-crystal">水晶</div>\n中文 "引号" 与 \\ 路径'],
  acceptanceMapping: { light: '点击后显示完成' }, experienceMapping: { readable: '状态清楚呈现' }, characters: [{ id: 'target', purpose: '目标', states: ['idle'] }], audio: [] };
type Fixture = Awaited<ReturnType<typeof ordinaryHostFixture>>;
async function call(config: PiSessionOptions, name: string, args: object, signal?: AbortSignal) {
  const tool = config.tools!.find(tool => tool.name === name); assert.ok(tool, `Selected design author requires ${name}.`);
  return tool.execute('synthetic-design-write', args, signal, undefined, undefined as any);
}
const content = (result: Awaited<ReturnType<typeof call>>) => result.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
function author(f: Fixture, action: (config: PiSessionOptions) => Promise<void>) {
  const scripted = f.hostOptions.sessionFactory!; let failure: unknown;
  f.hostOptions.sessionFactory = async config => {
    const session = await scripted(config);
    if (JSON.parse(config.context!).role !== 'design') {
      assert.ok(!config.tools?.some(tool => tool.name === 'write-game-design')); return session;
    }
    return { ...session, prompt: async () => { try { await action(config); return handoff; } catch (error) { failure = error; throw error; } } };
  };
  return async () => { const result: any = await f.execute(); if (failure) throw failure; return result; };
}

test('native factory exposes structured design data and serializes same-reply sets without bypassing independent review', async t => {
  const f = await ordinaryHostFixture(t, { fault: 'review' }), scripted = f.hostOptions.sessionFactory!;
  const payloads: any[] = [], summary = '新摘要 "引号"\n下一行', notes = ['<span class="item item-key">钥匙</span>\n保留中文'];
  t.mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init), body = JSON.parse(await request.text()); payloads.push(body);
    const actions = [
      { name: 'write-game-design', arguments: { operation: 'save', design, section: null, value: null } },
      { name: 'write-game-design', arguments: { operation: 'set', section: 'summary', value: summary, design: null } },
      { name: 'write-game-design', arguments: { operation: 'set', section: 'implementationNotes', value: notes } },
      { name: 'write-game-plan', arguments: { operation: 'save', scenario: f.scenario } },
      { name: 'write-game-design', arguments: { operation: 'save', design: {}, section: 'summary' } },
    ];
    const writing = payloads.length === 1;
    const delta = writing ? { tool_calls: actions.map((action, index) => ({ index, id: `synthetic-${index}`, type: 'function', function: { name: action.name, arguments: JSON.stringify(action.arguments) } })) } : { content: handoff.text };
    const chunk = { id: 'offline-cos156', model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason: writing ? 'tool_calls' : 'stop' }],
      usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 } };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  f.hostOptions.sessionFactory = async config => {
    if (JSON.parse(config.context!).role !== 'design') {
      assert.ok(!config.tools?.some(tool => tool.name === 'write-game-design')); return scripted(config);
    }
    assert.equal(config.tools!.find(tool => tool.name === 'write-game-design')?.executionMode, 'sequential');
    for (const name of ['write-game-design', 'write-game-plan']) {
      const description = config.tools!.find(tool => tool.name === name)!.description;
      assert.match(description, /Once the pair passes/); assert.match(description, /complete valid first reopen batch/);
    }
    assert.equal(JSON.parse(config.context!).rules.filter((rule: string) => rule === ORDINARY_DRAFT_PRESERVATION_RULE).length, 1);
    const session = await createPiSession({ ...config, env: { DEEPSEEK_API_KEY: 'offline-cos156-synthetic' } });
    return { ...session, prompt: async (...args) => {
      const result = await session.prompt(...args);
      await session.readonlyPrompt('Synthetic host-only read-only format check; preserve the original handoff.');
      return result;
    } };
  };
  const result: any = await f.execute(); assert.equal(payloads.length, 3);
  const fn = payloads[0]?.tools.find((tool: any) => tool.function.name === 'write-game-design')?.function;
  assert.ok(fn); assert.equal(fn.strict, false); assert.equal(fn.parameters.additionalProperties, false);
  assert.deepEqual(Object.keys(fn.parameters.properties).sort(), ['design', 'operation', 'section', 'value']);
  assert.deepEqual(payloads[2].tools ?? [], [], 'Native read-only followup exposes no callable writer.');
  const toolResults = payloads[1].messages.filter((message: any) => message.role === 'tool');
  assert.equal(toolResults.filter((message: any) => /Saved game design draft/.test(JSON.stringify(message.content))).length, 3);
  assert.equal(toolResults.filter((message: any) => /Unknown or inapplicable design authoring field/.test(JSON.stringify(message.content))).length, 1);
  assert.match(JSON.stringify(toolResults), /read-only.*advisory/);
  const captured = JSON.parse(await readFile(join(f.root, 'registry/captures/design/v1/files/_cosmos/design.json'), 'utf8'));
  assert.deepEqual(captured, { ...design, summary, implementationNotes: notes });
  assert.equal(result.acceptedCandidate, undefined); assert.equal(f.plays.length, 0); assert.equal(f.packets.filter(packet => packet.role === 'reviewer').length, 1);
  const executionPath = join(f.root, 'execution.json'), planningPath = join(f.root, 'planning-started.json');
  const executionBytes = await readFile(executionPath), planningBytes = await readFile(planningPath);
  const execution = JSON.parse(executionBytes.toString('utf8')), planning = JSON.parse(planningBytes.toString('utf8'));
  assert.equal(execution.ordinaryPlanAuthoringPolicy, 'structured-design-plan/2'); assert.equal(planning.ordinaryPlanAuthoringPolicy, 'structured-design-plan/2');
  const before = f.packets.length;
  for (const policy of [undefined, 'structured-plan/1', 'structured-design-plan/1', 'future']) {
    await writeFile(executionPath, JSON.stringify({ ...execution, ordinaryPlanAuthoringPolicy: policy }), 'utf8');
    await writeFile(planningPath, JSON.stringify({ ...planning, ordinaryPlanAuthoringPolicy: policy }), 'utf8');
    await assert.rejects(f.host.execute({ root: f.root, requirement: execution.requirement, draft: f.draft, resume: true }), /policy/i);
  }
  await writeFile(executionPath, executionBytes); await writeFile(planningPath, planningBytes);
  for (const field of [executionPath, planningPath]) {
    const old = await readFile(field);
    await writeFile(field, JSON.stringify({ ...JSON.parse(old.toString('utf8')), ordinaryPlanAuthoringPolicy: 'structured-design-plan/1' }));
    await assert.rejects(f.host.execute({ root: f.root, requirement: execution.requirement, draft: f.draft, resume: true }), /policy/i);
    await writeFile(field, old);
  }
  for (const spec of ['remove', 'duplicate']) {
    const changed = structuredClone(execution), rules: string[] = changed.tasks.find((item: any) => item.role === 'design').task.context.rules;
    if (spec === 'remove') rules.splice(rules.indexOf(ORDINARY_DRAFT_PRESERVATION_RULE), 1); else rules.push(ORDINARY_DRAFT_PRESERVATION_RULE);
    await writeFile(executionPath, JSON.stringify(changed));
    await assert.rejects(f.host.execute({ root: f.root, requirement: execution.requirement, draft: f.draft, resume: true }), /policy/i);
    await writeFile(executionPath, executionBytes);
  }
  assert.equal(f.packets.length, before); assert.equal(payloads.length, 3);
});

for (const fault of ['partial-design', 'checkpoint']) test(`structured draft save still rejects ${fault} at existing host validation`, async t => {
  const f = await ordinaryHostFixture(t, { persistent: true });
  const run = author(f, async config => {
    const snapshot = await readFile(join(f.root, 'snapshot.json'));
    const saved = await call(config, 'write-game-design', { operation: 'save', design: fault === 'partial-design' ? { summary: '不完整草稿' } : design });
    assert.match(content(saved), /Saved game design draft/); assert.match(content(saved), /incomplete or invalid/);
    const scenario: any = structuredClone(f.scenario);
    if (fault === 'checkpoint') scenario.reopen.checkpoint.snapshot = '#progress';
    const plan = await call(config, 'write-game-plan', { operation: 'save', scenario });
    if (fault === 'checkpoint') assert.match(content(plan), /checkpoint.snapshot.*observation object/);
    const checked = await call(config, 'validate-game-design', {}); assert.equal(JSON.parse((checked.content[0] as any).text).passed, false);
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), snapshot);
  });
  const result = await run(); assert.equal(result.acceptedCandidate, undefined); assert.equal(f.plays.length, 0);
  assert.equal(f.packets.filter(packet => packet.role === 'reviewer').length, 0);
});

test('design writer retains actual factory workspace, attempt, source, authority, ownership and deadline guards', async t => {
  const f = await ordinaryHostFixture(t, { fault: 'review' });
  let active!: Awaited<ReturnType<typeof createBrowserHost>>, roleInput!: RoleInput;
  f.host.execute = input => executeGeneration({ ...input, createHost: async hostInput => {
    active = await createBrowserHost({ ...hostInput, ...f.hostOptions, ordinaryDesignRevisionPolicy: undefined });
    const create = active.roleFactory; active.roleFactory = async input => { if (input.role === 'design') roleInput = input; return create(input); }; return active;
  } });
  const run = author(f, async config => {
    await call(config, 'write-game-design', { operation: 'save', design }); const before = await readFile(join(config.workspace, path));
    const original = roleInput, factory = active.roleFactory;
    // Exercise loss of the host's late-bound binding without weakening the public factory.
    const mapGet = Map.prototype.get;
    const missing = t.mock.method(Map.prototype, 'get', function (this: Map<unknown, unknown>, key: unknown) {
      const entry = mapGet.call(this, key);
      return key === original.task.taskId && entry?.beforeFileWrite ? undefined : entry;
    });
    try { await assert.rejects(call(config, 'write', { path, content: '{}' }), /original author attempt and workspace check/); }
    finally { missing.mock.restore(); }
    const otherRole = await factory({ ...original, role: 'art' }); await otherRole.close();
    await assert.rejects(factory({ ...original, workspace: join(f.root, 'authors') }), /workspace|ownership/i);
    const readonlyTask = structuredClone(original.task); readonlyTask.ownership.readOnlyPaths.push(path);
    await assert.rejects(factory({ ...original, task: readonlyTask }), /original|read-only|changed/i);
    const source = join(f.root, original.requirement.sources[0].location), sourceBytes = await readFile(source);
    await writeFile(source, Buffer.concat([sourceBytes, Buffer.from(' ')]));
    try {
      await assert.rejects(call(config, 'write', { path, content: '{}' }), /source|changed/i);
      await assert.rejects(call(config, 'write-game-design', { operation: 'save', design: {} }), /source|changed/i);
    } finally { await writeFile(source, sourceBytes); }
    const authority = original.controller.executionAuthority.bind(original.controller);
    const deny = t.mock.method(original.controller, 'executionAuthority', async (...args: Parameters<typeof authority>) => ({ ...await authority(...args), admissionAllowed: false }));
    try { await assert.rejects(call(config, 'write-game-design', { operation: 'set', section: 'summary', value: 'x' }), /authority/i); } finally { deny.mock.restore(); }
    const read = original.controller.read.bind(original.controller);
    const changed = t.mock.method(original.controller, 'read', async () => { const state = await read(); state.tasks.find(task => task.taskId === original.task.taskId)!.attempts.at(-1)!.attemptId = 'changed-attempt'; return state; });
    try {
      await assert.rejects(call(config, 'write', { path, content: '{}' }), /attempt|original|changed/i);
      await assert.rejects(call(config, 'write-game-design', { operation: 'save', design: {} }), /attempt|original|changed/i);
    } finally { changed.mock.restore(); }
    const expired = t.mock.method(Date, 'now', () => Date.parse(original.task.budget.originalDeadlineAt) + 1);
    try { await assert.rejects(call(config, 'write-game-design', { operation: 'save', design: {} }), /authority|deadline/i); } finally { expired.mock.restore(); }
    assert.deepEqual(await readFile(join(config.workspace, path)), before);
    await call(config, 'write-game-plan', { operation: 'save', scenario: f.scenario });
  });
  const result = await run(); assert.equal(result.acceptedCandidate, undefined); assert.equal(f.packets.filter(packet => packet.role === 'reviewer').length, 1);
});

test('new-policy revision uses only its bound seeded draft and preserves the original captured design', async t => {
  let revised = false, failure: unknown;
  const f = await ordinaryHostFixture(t, { revisionPolicy: true, limits: { limitMicroCny: 5000000, durationMs: 1800000 }, sessionFactory: async (config, fallback) => {
    const packet = JSON.parse(config.context!);
    if (packet.role === 'art') throw new Error('SOURCE cutoff after design revision.');
    if (packet.role === 'reviewer' && packet.taskId === 'design-task') return { close: fallback.close, prompt: async () => ({ text: JSON.stringify({
      verdict: 'changes_requested', findings: ['明确原需求中的完成状态。'], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((item: any) => item.evidenceId),
    }) }) };
    if (packet.role !== 'design') { assert.ok(!config.tools?.some(tool => tool.name === 'write-game-design')); return fallback; }
    const writer = config.tools!.find(tool => tool.name === 'write-game-design'); assert.ok(writer);
    if (packet.taskId === 'design-task') { assert.doesNotMatch(writer.description, /seeded from/); return fallback; }
    return { close: fallback.close, prompt: async () => { try {
      assert.equal(packet.taskId, 'design-task-revision'); assert.match(writer.description, /seeded from the previous capture.*unapproved draft/);
      assert.ok(packet.rules.includes(ORDINARY_PLAN_AUTHORING_RULE)); assert.ok(packet.rules.includes(ORDINARY_DESIGN_AUTHORING_RULE));
      const capturedPath = join(f.root, 'registry/captures/design/v1/files/_cosmos/design.json'), captured = await readFile(capturedPath);
      assert.deepEqual(await readFile(join(config.workspace, path)), captured);
      await assert.rejects(call(config, 'write-game-design', { operation: 'save', design: {} }), /current draft preserved/i);
      assert.deepEqual(await readFile(join(config.workspace, path)), captured);
      const saved = await call(config, 'write-game-design', { operation: 'set', section: 'summary', value: '原创鼠标游戏：点击后明确显示完成' });
      assert.match(content(saved), /read-only.*advisory.*passed/i);
      assert.deepEqual(await readFile(capturedPath), captured);
      const execution = JSON.parse(await readFile(join(f.root, 'execution.json'), 'utf8'));
      const revision = JSON.parse(await readFile(join(f.root, 'ordinary-design-revision-plan.json'), 'utf8'));
      const original = execution.tasks.find((item: any) => item.role === 'design').task;
      assert.deepEqual(revision.task.task.context.tools, original.context.tools);
      assert.deepEqual(packet.rules.slice(0, original.context.rules.length), original.context.rules);
      revised = true; return handoff;
    } catch (error) { failure = error; throw error; } } };
  } });
  const result: any = await f.execute(); if (failure) throw failure;
  assert.equal(revised, true); assert.equal(result.acceptedCandidate, undefined); assert.equal(f.plays.length, 0);
  assert.equal(result.ordinaryDesignReview.selectedVersion, 'v2');
});

for (const policy of [undefined, 'structured-plan/1', 'structured-design-plan/1'] as const) test(`frozen ${policy ?? 'legacy'} author and revision resume without upgrading their surface`, async t => {
  let revised = false, failure: unknown;
  const f = await ordinaryHostFixture(t, { pause: true, frozenPlanAuthoringPolicy: policy, revisionPolicy: true,
    limits: { limitMicroCny: 5000000, durationMs: 1800000 }, sessionFactory: async (config, fallback) => {
      const packet = JSON.parse(config.context!);
      assert.equal(!!config.tools?.some(tool => tool.name === 'write-game-design'), packet.role === 'design' && policy === 'structured-design-plan/1');
      if (packet.role === 'design') {
        assert.equal(packet.rules.includes(ORDINARY_DESIGN_AUTHORING_RULE), policy === 'structured-design-plan/1');
        assert.ok(!packet.rules.includes(ORDINARY_DRAFT_PRESERVATION_RULE));
        assert.ok(!config.tools!.some(tool => /current draft is preserved/.test(tool.description)));
      }
      if (packet.role === 'art') throw new Error('SOURCE cutoff after frozen design revision.');
      if (packet.role === 'reviewer' && packet.taskId === 'design-task') return { close: fallback.close, prompt: async () => ({ text: JSON.stringify({
        verdict: 'changes_requested', findings: ['Clarify the original completion requirement.'], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((item: any) => item.evidenceId),
      }) }) };
      if (packet.role !== 'design') return fallback;
      assert.equal(config.tools!.some(tool => tool.name === 'write-game-plan'), !!policy);
      assert.equal(packet.rules.includes(ORDINARY_PLAN_AUTHORING_RULE), !!policy);
      if (packet.taskId === 'design-task') return fallback;
      return { close: fallback.close, prompt: async () => { try {
        assert.equal(packet.taskId, 'design-task-revision');
        const execution = JSON.parse(await readFile(join(f.root, 'execution.json'), 'utf8'));
        const original = execution.tasks.find((item: any) => item.role === 'design').task;
        assert.deepEqual(packet.rules.slice(0, original.context.rules.length), original.context.rules);
        const revision = JSON.parse(await readFile(join(f.root, 'ordinary-design-revision-plan.json'), 'utf8'));
        assert.deepEqual(revision.task.task.context.tools, original.context.tools);
        const current = JSON.parse(await readFile(join(config.workspace, path), 'utf8'));
        assert.match(content(await call(config, 'write', { path, content: '{}' })), /read-only.*advisory.*invalid/i);
        assert.equal(await readFile(join(config.workspace, path), 'utf8'), '{}');
        await call(config, 'write', { path, content: JSON.stringify({ ...current, summary: '原选择保留，修订只澄清文本' }) });
        revised = true; return handoff;
      } catch (error) { failure = error; throw error; } } };
    } });
  await f.execute(); if (failure) throw failure;
  const before = await readFile(join(f.root, 'execution.json')), execution = JSON.parse(before.toString('utf8'));
  const origin = join(f.root, 'journal/task-design-task/origin.json'), originBytes = await readFile(origin);
  assert.equal(execution.ordinaryPlanAuthoringPolicy, policy);
  const result: any = await f.host.execute({ root: f.root, requirement: execution.requirement, draft: f.draft, resume: true });
  if (failure) throw failure;
  assert.equal(revised, true); assert.equal(result.acceptedCandidate, undefined); assert.equal(f.plays.length, 0);
  assert.equal(result.ordinaryDesignReview.selectedVersion, 'v2'); assert.deepEqual(await readFile(join(f.root, 'execution.json')), before);
  assert.deepEqual(await readFile(origin), originBytes);
});

test('COS161 native mixed and raw-only replies preserve order across both files after a rejection', async t => {
  const f = await ordinaryHostFixture(t, { fault: 'review' }), fallback = f.hostOptions.sessionFactory!;
  const plan = 'authors/design/acceptance-plan.json';
  const mixed = [
    ['write-game-design', { operation: 'save', design }],
    ['write-game-plan', { operation: 'save', scenario: f.scenario }],
    ['write', { path: plan, content: '{' }],
    ['edit', { path, edits: [{ oldText: design.summary, newText: 'first valid edit' }] }],
    ['write-game-plan', { operation: 'append', stage: 'main', steps: [{ ...f.scenario.steps[0], id: 'added-click' }] }],
    ['write-game-design', { operation: 'set', section: 'summary', value: 'second valid edit' }],
  ] as const;
  const raw = [
    ['write', { path, content: '{}' }],
    ['edit', { path: plan, edits: [{ oldText: 'added-click', newText: 'final-click' }] }],
  ] as const;
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    const actions = [mixed, raw][requests++];
    const delta = actions ? { tool_calls: actions.map(([name, args], index) => ({ index, id: `cos161-${requests}-${index}`,
      type: 'function', function: { name, arguments: JSON.stringify(args) } })) } : { content: handoff.text };
    const chunk = { id: 'offline-test', model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason: actions ? 'tool_calls' : 'stop' }],
      usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 } };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  function overlapProbe() {
    let active = 0, peak = 0, release!: () => void, entered!: () => void;
    const gate = new Promise<void>(done => { release = done; }), first = new Promise<void>(done => { entered = done; });
    return { first, release, peak: () => peak, async run<T>(action: () => Promise<T>) {
      peak = Math.max(peak, ++active); entered();
      try { await gate; return await action(); } finally { active--; }
    } };
  }
  const negative = overlapProbe(), a = negative.run(async () => {}), b = negative.run(async () => {});
  assert.equal(negative.peak(), 2); negative.release(); await Promise.all([a, b]);
  const probes = [overlapProbe(), overlapProbe()], events: string[] = [], native: string[] = [];
  const errors: boolean[] = [];
  let failure: unknown, checked = false;
  f.hostOptions.sessionFactory = async config => {
    if (JSON.parse(config.context!).role !== 'design') return fallback(config);
    const writers = new Set(['write', 'edit', 'write-game-plan', 'write-game-design']);
    const selected = config.tools!.filter(tool => writers.has(tool.name));
    assert.equal(selected.length, 4); assert.ok(selected.every(tool => tool.executionMode === 'sequential'));
    const tools = config.tools!.map(tool => !writers.has(tool.name) ? tool : { ...tool, async execute(...args: Parameters<typeof tool.execute>) {
      events.push('enter ' + tool.name);
      try { return await probes[requests - 1].run(() => tool.execute(...args)); }
      finally { events.push('exit ' + tool.name); }
    } });
    const session = await createPiSession({ ...config, tools, env: { DEEPSEEK_API_KEY: 'offline-cos161-synthetic' } });
    session.subscribe(event => {
      if (event.type === 'tool_execution_start') native.push('start ' + event.toolName);
      if (event.type === 'tool_execution_end') { native.push('end ' + event.toolName); errors.push(event.isError); }
    });
    return { ...session, prompt: async (...args) => { try {
      const pending = session.prompt(...args);
      for (const probe of probes) {
        await Promise.race([probe.first, pending.then(() => { throw new Error('Expected another native mutation reply'); })]);
        // The first tool is held while the SDK has an event-loop turn to start any parallel siblings.
        await new Promise<void>(done => setImmediate(done));
        probe.release();
      }
      const result = await pending;
      const names = [...mixed, ...raw].map(([name]) => name);
      assert.deepEqual(probes.map(probe => probe.peak()), [1, 1]);
      assert.deepEqual(events, names.flatMap(name => ['enter ' + name, 'exit ' + name]));
      assert.deepEqual(native, names.flatMap(name => ['start ' + name, 'end ' + name]));
      assert.deepEqual(errors, [false, false, true, false, false, false, true, false]);
      const current = JSON.parse(await readFile(join(config.workspace, path), 'utf8'));
      assert.deepEqual(current, { ...design, summary: 'second valid edit' });
      assert.equal(JSON.parse(await readFile(join(config.workspace, plan), 'utf8')).scenario.steps.at(-1).id, 'final-click');
      checked = true; return result;
    } catch (error) { failure = error; throw error; } } };
  };
  await f.execute(); if (failure) throw failure;
  assert.ok(checked); assert.equal(requests, 3);
});
