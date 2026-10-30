import assert from 'node:assert/strict';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import type { PiSessionOptions } from '../../src/providers/pi.ts';
import { createPiSession } from '../../src/providers/pi.ts';
import { ORDINARY_PLAN_AUTHORING_RULE } from '../../src/runtime/entrypoint-plan-authoring.ts';
import { readConfirmedGeneration } from '../../src/cli/session.ts';
import { readRunSnapshot } from '../../src/cli/control.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import type { RoleInput } from '../../src/roles/factory.ts';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';

const path = 'authors/design/acceptance-plan.json';
const handoff = { text: JSON.stringify({ summary: '合成接口验证', remaining: [], uncertainty: [] }) };
const design = { summary: '原创鼠标游戏', implementationNotes: ['通过正常鼠标操作显示结果'], acceptanceMapping: { light: '点击后显示完成' },
  experienceMapping: { readable: '状态清楚呈现' }, characters: [{ id: 'target', purpose: '目标', states: ['idle'] }], audio: [] };
type Fixture = Awaited<ReturnType<typeof ordinaryHostFixture>>;
function author(f: Fixture, action: (config: PiSessionOptions) => Promise<void>) {
  const scripted = f.hostOptions.sessionFactory!; let actionError: unknown;
  f.hostOptions.sessionFactory = async config => {
    const session = await scripted(config), packet = JSON.parse(config.context!);
    if (packet.role !== 'design') {
      assert.ok(!config.tools?.some(tool => tool.name === 'write-game-plan'), 'Other roles must not receive the author plan writer.');
      return session;
    }
    return { ...session, prompt: async () => { try { await action(config); return handoff; } catch (error) { actionError = error; throw error; } } };
  };
  return async () => { const result: any = await f.execute(); if (actionError) throw actionError; return result; };
}
async function call(config: PiSessionOptions, name: string, args: object, signal?: AbortSignal) {
  const tool = config.tools!.find(tool => tool.name === name);
  assert.ok(tool, `The selected author must receive ${name}.`);
  return tool.execute('synthetic-plan-write', args, signal, undefined, undefined as any);
}
const content = (result: Awaited<ReturnType<typeof call>>) => result.content.filter(block => block.type === 'text').map(block => block.text).join('\n');

test('structured author saves JSON data and appends both stages through the real writer before independent review', async t => {
  const f = await ordinaryHostFixture(t, { persistent: true, configure: (_draft, scenario) => {
    if (scenario.steps[1].kind === 'assert') scenario.steps[1].expected = '中文 "引号"\n下一行';
  } });
  const run = author(f, async config => {
    await call(config, 'write', { path: 'authors/design/design.json', content: JSON.stringify(design) });
    const state = await readFile(join(f.root, 'snapshot.json'));
    const requirement = JSON.parse(config.context!).inputs.find((ref: any) => ref.artifactId === 'requirement-bundle');
    const steps = structuredClone(f.scenario.steps);
    const saved = await call(config, 'write-game-plan', { operation: 'save', scenario: { viewport: f.scenario.viewport, steps: [] } });
    assert.match(content(saved), /draft/i);
    assert.match(content(saved), /read-only.*advisory/i);
    assert.match(content(saved), /incomplete|invalid/i);
    const read = async () => JSON.parse(await readFile(join(config.workspace, path), 'utf8'));
    assert.deepEqual(await read(), { formatVersion: 'ordinary-acceptance-plan/1', requirement, scenario: { viewport: f.scenario.viewport, steps: [] } });
    for (const step of steps) {
      await call(config, 'write-game-plan', { operation: 'append', stage: 'main', steps: [step] });
    }
    const first = f.scenario.reopen!;
    await call(config, 'write-game-plan', { operation: 'append', stage: 'reopen', steps: first.steps.slice(0, 2), checkpoint: first.checkpoint });
    const last = await call(config, 'write-game-plan', { operation: 'append', stage: 'reopen', steps: first.steps.slice(2) });
    assert.match(content(last), /read-only.*advisory.*passed/i);
    assert.deepEqual(await read(), { formatVersion: 'ordinary-acceptance-plan/1', requirement, scenario: { viewport: f.scenario.viewport, steps, reopen: first } });
    assert.equal(Object.hasOwn(await read(), 'reopen'), false);
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), state, 'Saving a draft must not change authority, accounting or approval.');
  });
  const result = await run();
  assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps));
  assert.equal(f.packets.filter(packet => packet.role === 'reviewer').length, 3);
  const executionPath = join(f.root, 'execution.json'), planningPath = join(f.root, 'planning-started.json');
  const executionBytes = await readFile(executionPath), planningBytes = await readFile(planningPath), execution = JSON.parse(executionBytes.toString('utf8'));
  assert.equal(execution.ordinaryPlanAuthoringPolicy, 'structured-design-plan/1');
  assert.equal(JSON.parse(planningBytes.toString('utf8')).ordinaryPlanAuthoringPolicy, 'structured-design-plan/1');
  const before = f.packets.length;
  for (const mutate of [
    (value: any) => { delete value.ordinaryPlanAuthoringPolicy; },
    (value: any) => { value.ordinaryPlanAuthoringPolicy = 'future'; },
    (value: any) => { value.tasks[0].task.context.tools = value.tasks[0].task.context.tools.filter((name: string) => name !== 'write-game-plan'); },
    (value: any) => { value.tasks[0].task.context.rules = value.tasks[0].task.context.rules.filter((rule: string) => rule !== ORDINARY_PLAN_AUTHORING_RULE); },
  ]) {
    const changed = structuredClone(execution); mutate(changed); await writeFile(executionPath, JSON.stringify(changed), 'utf8');
    await assert.rejects(f.host.execute({ root: f.root, requirement: execution.requirement, draft: f.draft, resume: true }), /plan authoring policy/i);
  }
  await writeFile(executionPath, executionBytes);
  await rename(planningPath, planningPath + '.saved');
  try { await assert.rejects(f.host.execute({ root: f.root, requirement: execution.requirement, draft: f.draft, resume: true }), /plan authoring policy/i); }
  finally { await rename(planningPath + '.saved', planningPath); }
  const resumed = await f.host.execute({ root: f.root, requirement: execution.requirement, draft: f.draft, resume: true });
  assert.equal(resumed.outcome, result.outcome); assert.equal(f.packets.length, before);
  assert.deepEqual(await readFile(executionPath), executionBytes); assert.deepEqual(await readFile(planningPath), planningBytes);
});

test('legacy frozen ordinary tasks resume with identical tools and rules without selecting the writer', async t => {
  const f = await ordinaryHostFixture(t, { pause: true }); await f.execute();
  const before = await readFile(join(f.root, 'execution.json')), execution = JSON.parse(before.toString('utf8'));
  assert.equal(execution.ordinaryPlanAuthoringPolicy, undefined);
  assert.ok(execution.tasks.every((item: any) => !item.task.context.tools.includes('write-game-plan') && !item.task.context.rules.includes(ORDINARY_PLAN_AUTHORING_RULE)));
  const snapshot = await readRunSnapshot(f.root); if (snapshot.formatVersion !== 1) throw new Error('Expected active fixture');
  const confirmed = await readConfirmedGeneration(f.root, snapshot);
  const result = await f.host.execute({ root: f.root, ...confirmed, resume: true });
  assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps)); assert.deepEqual(await readFile(join(f.root, 'execution.json')), before);
});

test('planning interrupted before execution keeps its selection and cannot replan on resume or reentry', async t => {
  const f = await ordinaryHostFixture(t, { sessionFactory: async (config, fallback) => JSON.parse(config.context!).role === 'cosmos'
    ? { ...fallback, prompt: async () => { throw new Error('Synthetic planning interruption'); } } : fallback });
  assert.equal((await f.execute() as any).outcome, 'incomplete');
  const planningBytes = await readFile(join(f.root, 'planning-started.json')), planning = JSON.parse(planningBytes.toString('utf8'));
  assert.equal(planning.ordinaryPlanAuthoringPolicy, 'structured-design-plan/1'); await assert.rejects(readFile(join(f.root, 'execution.json')), { code: 'ENOENT' });
  const before = f.packets.length;
  await assert.rejects(f.host.execute({ root: f.root, requirement: planning.requirement, draft: f.draft, resume: true }), /planning result is unavailable/);
  await assert.rejects(f.host.execute({ root: f.root, requirement: planning.requirement, draft: f.draft, resume: false }), /Immutable version already exists|EEXIST/);
  assert.equal(f.packets.length, before); assert.deepEqual(await readFile(join(f.root, 'planning-started.json')), planningBytes);
});

test('native SDK normalizes null anchors and serializes same-reply anchored batches before independent rejection', async t => {
  const f = await ordinaryHostFixture(t, { fault: 'review', persistent: true, configure: (_draft, scenario) => {
    const complete = scenario.steps[1];
    scenario.steps = [scenario.steps[0], complete, ...['A', 'B', 'C', 'tail'].map(id => ({ ...complete, id }))];
    scenario.steps.push(...scenario.reopen!.steps.slice(2));
  } }), scripted = f.hostOptions.sessionFactory!;
  const payloads: any[] = [];
  t.mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init), body = JSON.parse(await request.text()); payloads.push(body);
    const [click, complete, a, b, c, ...tail] = f.scenario.steps;
    const actions = [
      { name: 'write', arguments: { path: 'authors/design/design.json', content: JSON.stringify(design) } },
      { name: 'write-game-plan', arguments: { operation: 'save', scenario: { ...f.scenario, steps: [click] }, stage: null, steps: null, checkpoint: null, afterStepId: null } },
      { name: 'write-game-plan', arguments: { operation: 'append', stage: 'main', steps: tail.slice(0, 1) } },
      { name: 'write-game-plan', arguments: { operation: 'append', scenario: null, stage: 'main', steps: tail.slice(1), checkpoint: null, afterStepId: null } },
      { name: 'write-game-plan', arguments: { operation: 'append', stage: 'main', steps: [complete], afterStepId: click.id } },
      { name: 'write-game-plan', arguments: { operation: 'append', stage: 'main', steps: [c], afterStepId: complete.id } },
      { name: 'write-game-plan', arguments: { operation: 'append', stage: 'main', steps: [a], afterStepId: complete.id } },
      { name: 'write-game-plan', arguments: { operation: 'append', stage: 'main', steps: [b], afterStepId: a.id } },
      { name: 'write-game-plan', arguments: { operation: 'save', scenario: {}, afterStepId: click.id } },
    ];
    const writing = payloads.length === 1;
    const delta = writing ? { tool_calls: actions.map((action, index) => ({ index, id: `synthetic-${index}`, type: 'function', function: { name: action.name, arguments: JSON.stringify(action.arguments) } })) } : { content: handoff.text };
    const chunk = { id: 'offline-cos147', model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason: writing ? 'tool_calls' : 'stop' }],
      usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 } };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  f.hostOptions.sessionFactory = async config => {
    if (JSON.parse(config.context!).role !== 'design') return scripted(config);
    const tool = config.tools!.find(tool => tool.name === 'write-game-plan')!;
    assert.equal(tool.executionMode, 'sequential');
    assert.deepEqual((tool.parameters as any).properties.afterStepId, { type: 'string' });
    assert.ok(!(tool.parameters as any).required.includes('afterStepId'));
    return createPiSession({ ...config, env: { DEEPSEEK_API_KEY: 'offline-cos147-synthetic' } });
  };
  const result: any = await f.execute();
  const fn = payloads[0]?.tools.find((tool: any) => tool.function.name === 'write-game-plan')?.function;
  assert.ok(fn); assert.equal(fn.parameters.type, 'object'); assert.equal(fn.parameters.additionalProperties, false);
  assert.deepEqual(Object.keys(fn.parameters.properties).sort(), ['afterStepId', 'checkpoint', 'operation', 'scenario', 'stage', 'steps']);
  assert.equal(fn.strict, false); assert.ok(!fn.parameters.required.includes('afterStepId'));
  assert.deepEqual(fn.parameters.properties.afterStepId, { type: 'string' });
  assert.equal(payloads.length, 2); assert.equal(result.acceptedCandidate, undefined); assert.equal(f.plays.length, 0);
  assert.equal(f.packets.filter(packet => packet.role === 'reviewer').length, 1);
  const results = payloads.at(-1).messages.filter((message: any) => message.role === 'tool' && /Saved acceptance plan draft/.test(JSON.stringify(message.content)));
  assert.equal(results.length, 7); assert.match(JSON.stringify(results.at(-1).content), /read-only.*advisory.*passed/i);
  const refused = payloads.at(-1).messages.filter((message: any) => message.role === 'tool' && /Unknown or inapplicable plan authoring field/.test(JSON.stringify(message.content)));
  assert.equal(refused.length, 1);
  const captured = JSON.parse(await readFile(join(f.root, 'registry/captures/design/v1/files/_cosmos/acceptance-plan.json'), 'utf8'));
  assert.deepEqual(captured.scenario, f.scenario);
});

test('structured draft diagnostics retain strict coverage, step and checkpoint rejection before capture', async t => {
  const f = await ordinaryHostFixture(t, { persistent: true });
  const run = author(f, async config => {
    await call(config, 'write', { path: 'authors/design/design.json', content: JSON.stringify(design) });
    const missing = await call(config, 'write-game-plan', { operation: 'save', scenario: { viewport: f.scenario.viewport, steps: f.scenario.steps.slice(0, 1) } });
    assert.match(content(missing), /light/);
    const invalid = structuredClone(f.scenario) as any; invalid.steps[0].acceptanceId = 'light'; invalid.reopen.steps[1].observation.kind = 'appears'; invalid.reopen.checkpoint.expected = '';
    const saved = await call(config, 'write-game-plan', { operation: 'save', scenario: invalid });
    assert.match(content(saved), /scenario.steps\[0\]/); assert.match(content(saved), /scenario.reopen.steps\[1\]/); assert.match(content(saved), /checkpoint.expected/);
    assert.deepEqual(JSON.parse(await readFile(join(config.workspace, path), 'utf8')).scenario, invalid);
    const checked = await call(config, 'validate-game-design', {}); assert.equal(JSON.parse((checked.content[0] as any).text).passed, false);
  });
  const result = await run(); assert.equal(result.acceptedCandidate, undefined); assert.equal(f.plays.length, 0);
  assert.equal(f.packets.filter(packet => packet.role === 'reviewer').length, 0);
});

test('new writer keeps original role, workspace, attempt, source, authority and deadline guards', async t => {
  const f = await ordinaryHostFixture(t, { fault: 'review' });
  let active: Awaited<ReturnType<typeof createBrowserHost>>, roleInput: RoleInput;
  f.host.execute = input => executeGeneration({ ...input, createHost: async hostInput => {
    active = await createBrowserHost({ ...hostInput, ...f.hostOptions, ordinaryDesignRevisionPolicy: undefined });
    const create = active.roleFactory;
    active.roleFactory = async input => { if (input.role === 'design') roleInput = input; return create(input); }; return active;
  } });
  const run = author(f, async config => {
    const original = roleInput, factory = active.roleFactory;
    await call(config, 'write-game-plan', { operation: 'save', scenario: f.scenario }); const before = await readFile(join(config.workspace, path));
    const otherRole = await factory({ ...original, role: 'art' }); await otherRole.close();
    await assert.rejects(factory({ ...original, workspace: join(f.root, 'authors') }), /workspace|ownership/i);
    const source = join(f.root, original.requirement.sources[0].location), sourceBytes = await readFile(source);
    await writeFile(source, Buffer.concat([sourceBytes, Buffer.from(' ')]));
    try { await assert.rejects(call(config, 'write-game-plan', { operation: 'save', scenario: {} }), /source|changed/i); }
    finally { await writeFile(source, sourceBytes); }
    const authority = original.controller.executionAuthority.bind(original.controller);
    const deny = t.mock.method(original.controller, 'executionAuthority', async (...args: Parameters<typeof authority>) => ({ ...await authority(...args), admissionAllowed: false }));
    try { await assert.rejects(call(config, 'write-game-plan', { operation: 'save', scenario: {} }), /authority/i); } finally { deny.mock.restore(); }
    const read = original.controller.read.bind(original.controller);
    const changed = t.mock.method(original.controller, 'read', async () => { const state = await read(); state.tasks.find(task => task.taskId === original.task.taskId)!.attempts.at(-1)!.attemptId = 'changed-attempt'; return state; });
    try { await assert.rejects(call(config, 'write-game-plan', { operation: 'save', scenario: {} }), /attempt|original|changed/i); } finally { changed.mock.restore(); }
    const expired = t.mock.method(Date, 'now', () => Date.parse(original.task.budget.originalDeadlineAt) + 1);
    try { await assert.rejects(call(config, 'write-game-plan', { operation: 'save', scenario: {} }), /authority|deadline/i); } finally { expired.mock.restore(); }
    assert.deepEqual(await readFile(join(config.workspace, path)), before);
    await call(config, 'write', { path: 'authors/design/design.json', content: JSON.stringify(design) });
  });
  const result = await run(); assert.equal(result.acceptedCandidate, undefined); assert.equal(f.packets.filter(packet => packet.role === 'reviewer').length, 1);
});

test('design revision inherits the selected writer and saves its own isolated draft before review', async t => {
  let revised = false;
  const f = await ordinaryHostFixture(t, { revisionPolicy: true, limits: { limitMicroCny: 5000000, durationMs: 1800000 }, sessionFactory: async (config, fallback) => {
    const packet = JSON.parse(config.context!);
    if (packet.role === 'reviewer' && packet.taskId === 'design-task') return { close: fallback.close, prompt: async () => ({ text: JSON.stringify({
      verdict: 'changes_requested', findings: ['明确原需求中的完成状态。'], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((item: any) => item.evidenceId),
    }) }) };
    if (packet.role !== 'design' || packet.taskId === 'design-task') return fallback;
    return { close: fallback.close, prompt: async () => {
      assert.match(config.workspace, /continuations[\\/]design-task-revision[\\/]workspace$/); assert.ok(packet.rules.includes(ORDINARY_PLAN_AUTHORING_RULE));
      await call(config, 'edit', { path: 'authors/design/design.json', edits: [{ oldText: '原创鼠标游戏', newText: '原创鼠标游戏：点击后明确显示完成' }] });
      const saved = await call(config, 'write-game-plan', { operation: 'save', scenario: f.scenario });
      assert.match(content(saved), /read-only.*advisory.*passed/i); revised = true; return handoff;
    } };
  } });
  const result: any = await f.execute(); assert.equal(revised, true); assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps));
  assert.equal(result.ordinaryDesignReview.selectedVersion, 'v2');
});
