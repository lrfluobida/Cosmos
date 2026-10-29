import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { PiSessionOptions } from '../../src/providers/pi.ts';
import { createRoleFactory } from '../../src/roles/factory.ts';
import type { RoleFactoryOptions } from '../../src/roles/factory.ts';
import { createGameDesignCheck } from '../../src/runtime/entrypoint-design-check.ts';
import { RunController } from '../../src/runtime/run.ts';
import type { RequirementContract, TaskContract } from '../../src/contracts/types.ts';
import { requirement as requirementFixture, task as taskFixture } from '../contracts/fixtures.ts';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';

const main = 'authors/design/design.json', acceptance = 'authors/design/acceptance-plan.json';
const handoff = { text: JSON.stringify({ summary: '受控源码测试', remaining: [], uncertainty: [] }) };
const design = () => ({ summary: '原创鼠标游戏', implementationNotes: ['通过正常鼠标操作显示结果'], acceptanceMapping: { light: '点击后显示完成' },
  experienceMapping: { readable: '状态清楚呈现' }, characters: [{ id: 'target', purpose: '目标', states: ['idle'] }], audio: [] });
type Fixture = Awaited<ReturnType<typeof ordinaryHostFixture>>;
function plan(f: Fixture, config: PiSessionOptions): any {
  return { formatVersion: 'ordinary-acceptance-plan/1', requirement: JSON.parse(config.context!).inputs.find((ref: any) => ref.artifactId === 'requirement-bundle'), scenario: structuredClone(f.scenario) };
}
async function call(config: PiSessionOptions, name: string, args: object, signal?: AbortSignal) {
  return config.tools!.find(tool => tool.name === name)!.execute('controlled-file-tool', args, signal, undefined, undefined as any);
}
function feedback(result: Awaited<ReturnType<typeof call>>) {
  assert.ok(result.content.length > 1, 'Successful file tool must append immediate design feedback without an explicit check.');
  assert.equal('isError' in result && result.isError, false);
  const original = result.content[0], added = result.content.at(-1)!;
  assert.equal(original.type, 'text'); assert.equal(added.type, 'text');
  if (original.type !== 'text' || added.type !== 'text') throw new Error('Expected file result text');
  assert.match(original.text, /successfully/i); assert.match(added.text, /read-only.*advisory/i);
  assert.ok(added.text.length <= 4096); assert.ok(added.text.split('\n').filter(line => line.startsWith('- ')).length <= 8);
  return added.text;
}
function author(f: Fixture, action: (config: PiSessionOptions) => Promise<void>) {
  const scripted = f.hostOptions.sessionFactory!; let actionError: unknown;
  f.hostOptions.sessionFactory = async config => {
    const session = await scripted(config), packet = JSON.parse(config.context!);
    if (packet.role !== 'design') return session;
    return { ...session, prompt: async () => { try { await action(config); return handoff; } catch (error) { actionError = error; throw error; } } };
  };
  return async () => { const result: any = await f.execute(); if (actionError) throw actionError; return result; };
}

test('COS121 real write and edit feedback share explicit mapping diagnostics without changing authority', async t => {
  const f = await ordinaryHostFixture(t, { fault: 'review' });
  const run = author(f, async config => {
    const state = await readFile(join(f.root, 'snapshot.json'));
    const bad = { ...design(), acceptanceMapping: { gameplayId: ['light'] }, experienceMapping: { criterionId: ['readable'] } };
    const first = JSON.stringify(bad);
    let text = feedback(await call(config, 'write', { path: main, content: first }));
    assert.match(text, /acceptanceMapping.*missing IDs.*"light"/); assert.match(text, /extra keys.*"gameplayId"/); assert.match(text, /non-string values.*"gameplayId"/);
    const check = async () => {
      const result = await call(config, 'validate-game-design', {}), block = result.content[0]; assert.equal(block.type, 'text');
      if (block.type !== 'text') throw new Error('Expected diagnostic text');
      const parsed = JSON.parse(block.text); assert.equal(parsed.passed, false); return parsed.errors[0].message as string;
    };
    const acceptanceError = await check();
    for (const part of acceptanceError.split('; ')) assert.ok(text.includes(part));
    assert.equal(await readFile(join(config.workspace, main), 'utf8'), first);
    const second = JSON.stringify({ ...bad, acceptanceMapping: design().acceptanceMapping });
    text = feedback(await call(config, 'edit', { path: main, edits: [{ oldText: first, newText: second }] }));
    assert.match(text, /experienceMapping.*missing IDs.*"readable"/); assert.match(text, /extra keys.*"criterionId"/); assert.match(text, /non-string values.*"criterionId"/);
    const experienceError = await check();
    for (const part of experienceError.split('; ')) assert.ok(text.includes(part));
    assert.equal(await readFile(join(config.workspace, main), 'utf8'), second);
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), state);
    await call(config, 'write', { path: acceptance, content: JSON.stringify(plan(f, config)) });
    assert.match(feedback(await call(config, 'edit', { path: main, edits: [{ oldText: second, newText: JSON.stringify(design()) }] })), /passed/);
  });
  const result = await run(); assert.equal(result.acceptedCandidate, undefined);
  assert.equal(f.packets.filter(packet => packet.role === 'reviewer').length, 1); assert.equal(f.plays.length, 0);
});

test('ordinary author receives current errors after real writes and edits, then reaches independent review', async t => {
  const f = await ordinaryHostFixture(t, { persistent: true });
  const run = author(f, async config => {
    const state = await readFile(join(f.root, 'snapshot.json'));
    const put = (path: string, value: unknown) => call(config, 'write', { path, content: typeof value === 'string' ? value : JSON.stringify(value) });
    assert.match(feedback(await put(main, design())), /acceptance-plan\.json/);
    assert.match(feedback(await put(acceptance, '{')), /acceptance-plan\.json/);
    assert.equal(await readFile(join(config.workspace, acceptance), 'utf8'), '{');
    const valid = plan(f, config), bad = structuredClone(valid);
    bad.scenario.steps[0].acceptanceId = 'light';
    let text = feedback(await put(acceptance, bad));
    assert.match(text, /acceptance-plan\.json/); assert.match(text, /scenario\.steps\[0\].*Unknown field.*acceptanceId/);
    text = feedback(await call(config, 'edit', { path: acceptance, edits: [{ oldText: JSON.stringify(bad), newText: JSON.stringify(valid) }] }));
    assert.match(text, /passed/);
    const pixels = structuredClone(valid); pixels.scenario.steps[0] = { id: 'click', kind: 'mouse-click', selector: '#light', x: 240, y: 160 };
    text = feedback(await put(acceptance, pixels));
    assert.match(text, /scenario\.steps\[0\]\.x/); assert.match(text, /normalized selector bounds/);
    const multiple = structuredClone(valid); multiple.scenario.reopen.checkpoint.expected = '';
    multiple.scenario.steps[1].observation.kind = 'appears'; multiple.scenario.reopen.steps[1].observation.kind = 'disabled';
    text = feedback(await put(acceptance, multiple));
    assert.match(text, /checkpoint.expected/); assert.match(text, /scenario.steps\[1\]/); assert.match(text, /scenario.reopen.steps\[1\]/);
    const reopen = structuredClone(valid); reopen.scenario.reopen.steps.pop();
    text = feedback(await put(acceptance, reopen));
    assert.match(text, /scenario\.reopen\.steps.*checkpoint.savedSnapshot/);
    assert.match(feedback(await put(acceptance, valid)), /passed/);
    const read = await call(config, 'read', { path: main }); assert.equal(read.content.length, 1); assert.match(JSON.stringify(read), /原创鼠标游戏/);
    for (const file of ['module-contracts.d.ts', 'classic-entry-plan.json']) await assert.rejects(put(`authors/design/${file}`, '{}'), /outside/);
    await assert.rejects(call(config, 'edit', { path: acceptance, edits: [{ oldText: 'missing text', newText: 'x' }] }), /not find|not found/i);
    assert.equal(await readFile(join(config.workspace, acceptance), 'utf8'), JSON.stringify(valid));
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), state, 'Advisory writes must not mutate task, attempt, ledger or capture state.');
  });
  const result = await run(); assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps));
  assert.equal(f.packets.filter(packet => packet.role === 'design').length, 1);
  assert.equal(f.packets.filter(packet => packet.role === 'reviewer').length, 3);
});

test('COS155 real write/edit feedback distinguishes checkpoint matches without prior input and preserves draft bytes', async t => {
  const f = await ordinaryHostFixture(t, { persistent: true, fault: 'review' });
  const run = author(f, async config => {
    const state = await readFile(join(f.root, 'snapshot.json'));
    await call(config, 'write', { path: main, content: JSON.stringify(design()) });
    const value = plan(f, config), steps = value.scenario.reopen.steps;
    for (let index = steps.length - 1; index >= 0; index--) if (['mouse-click', 'locator-click'].includes(steps[index].kind)) steps.splice(index, 1);
    const first = JSON.stringify(value);
    let text = feedback(await call(config, 'write', { path: acceptance, content: first }));
    assert.match(text, /scenario\.reopen\.steps: checkpoint.snapshot has matching visible checks, but none has preceding normal click input/);
    assert.match(text, /"firstNormalClick":null/); assert.match(text, /Renaming step IDs does not fix input order/);
    assert.equal(await readFile(join(config.workspace, acceptance), 'utf8'), first);
    const renamed = steps.find((step: any) => step.observation?.selector === value.scenario.reopen.checkpoint.snapshot.selector);
    renamed.id = 'renamed-checkpoint'; const second = JSON.stringify(value);
    text = feedback(await call(config, 'edit', { path: acceptance, edits: [{ oldText: first, newText: second }] }));
    assert.match(text, /"id":"renamed-checkpoint"/); assert.match(text, /none has preceding normal click input/);
    const explicit = await call(config, 'validate-game-design', {}), block = explicit.content[0];
    assert.equal(block.type, 'text'); if (block.type !== 'text') throw new Error('Expected diagnostic text');
    const checked = JSON.parse(block.text); assert.equal(checked.passed, false); assert.ok(text.includes(checked.errors[0].message));
    assert.equal(await readFile(join(config.workspace, acceptance), 'utf8'), second);
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), state);
  });
  const result = await run(); assert.equal(result.acceptedCandidate, undefined); assert.equal(f.plays.length, 0);
  assert.equal(f.packets.filter(packet => packet.role === 'reviewer').length, 0, 'Invalid checkpoint input still fails before capture and independent review.');
});

for (const name of ['write', 'edit']) test(`Windows case variants retain ordinary feedback after scoped ${name}`, { skip: process.platform !== 'win32' }, async t => {
  const f = await ordinaryHostFixture(t, { fault: 'review' });
  const run = author(f, async config => {
    const valid = plan(f, config);
    for (const [path, value] of [[main, design()], [acceptance, valid]] as const) await call(config, 'write', { path, content: JSON.stringify(value) });
    const change = async (file: string, value: unknown) => {
      const path = file.replace(/[^/]+$/, filename => filename.toUpperCase()), content = JSON.stringify(value);
      const result = await call(config, name, name === 'write' ? { path, content }
        : { path, edits: [{ oldText: await readFile(join(config.workspace, file), 'utf8'), newText: content }] });
      assert.equal(await readFile(join(config.workspace, file), 'utf8'), content, 'The case variant must write the same declared file.');
      return feedback(result);
    };
    const badDesign = design(); badDesign.characters[0].id = 'BAD_ID';
    assert.match(await change(main, badDesign), /design\.json: characters\[0\]\.id/);
    assert.match(await change(main, design()), /passed/);
    const badPlan = structuredClone(valid); badPlan.scenario.steps[0].acceptanceId = 'light';
    assert.match(await change(acceptance, badPlan), /scenario\.steps\[0\].*Unknown field.*acceptanceId/);
    assert.match(await change(acceptance, valid), /passed/);
  });
  const result = await run(); assert.equal(result.acceptedCandidate, undefined);
  assert.equal(f.packets.filter(packet => packet.role === 'reviewer').length, 1); assert.equal(f.plays.length, 0);
});

test('automatic diagnostics bound both repeated schema failures and long field names', async t => {
  const f = await ordinaryHostFixture(t);
  const run = author(f, async config => {
    const invalid = { ...design(), characters: Array.from({ length: 12 }, (_, i) => ({ id: `BAD_${i}`, purpose: '中文目标', states: ['idle'] })) };
    let text = feedback(await call(config, 'write', { path: main, content: JSON.stringify(invalid) }));
    assert.equal(text.split('\n').filter(line => line.startsWith('- ')).length, 8);
    assert.match(text, /design\.json: characters\[0\]\.id/); assert.doesNotMatch(text, /characters\[8\]/);
    await call(config, 'write', { path: main, content: JSON.stringify(design()) });
    const bad = plan(f, config);
    bad.scenario.steps = [...Array.from({ length: 12 }, (_, i) => ({ id: `click-${i}`, kind: 'locator-click', selector: '#light', timeoutMs: 1000, acceptanceId: 'light' })), bad.scenario.steps[1]];
    text = feedback(await call(config, 'write', { path: acceptance, content: JSON.stringify(bad) }));
    assert.equal(text.split('\n').filter(line => line.startsWith('- ')).length, 1); assert.match(text, /steps\[11\]/);
    const long = plan(f, config); long.scenario.steps[0]['错误字段'.repeat(2000)] = true;
    text = feedback(await call(config, 'write', { path: acceptance, content: JSON.stringify(long) }));
    assert.ok(text.length <= 4096); assert.match(text, /Unknown field.*错误字段/); assert.match(text, /detail characters omitted.*validate-game-design/);
    assert.match(feedback(await call(config, 'write', { path: acceptance, content: JSON.stringify(plan(f, config)) })), /passed/);
  });
  assert.ok((await run()).acceptedCandidate);
});

test('selected ordinary module and classic outputs receive the same scoped feedback', async t => {
  const f = await ordinaryHostFixture(t, { modular: true, classic: true }); let checked = false;
  const run = author(f, async config => {
    const put = (path: string, value: unknown) => call(config, 'write', { path, content: typeof value === 'string' ? value : JSON.stringify(value) });
    await put(main, { ...design(), acceptanceMapping: { count: '点击后显示完成' }, modulePurposes: { a: '计算数值', b: '显示结果' } });
    assert.match(feedback(await put(acceptance, plan(f, config))), /module-contracts\.d\.ts/);
    const contracts = 'export interface ModuleA { advance(value: number): number; }\nexport interface ModuleB { label(value: number): string; }\n';
    assert.match(feedback(await put('authors/design/module-contracts.d.ts', contracts)), /classic-entry-plan\.json/);
    const classic = { formatVersion: 'classic-entry-plan/1', measurementId: f.draft.classicEntry!.measurement!.id, acceptanceId: 'count',
      inputs: [{ id: 'show-cost', kind: 'locator-click', selector: '#show-cost', timeoutMs: 1000 }], observation: { kind: 'text', selector: '#cost' }, timeoutMs: 1000 };
    assert.match(feedback(await put('authors/design/classic-entry-plan.json', classic)), /passed/); checked = true;
    // Stop this design-only representative at capture; no module/compiler/browser execution is needed.
    await writeFile(join(config.workspace, main), '{}', 'utf8');
  });
  assert.equal((await run()).acceptedCandidate, undefined); assert.equal(checked, true); assert.equal(f.plays.length, 0);
});

test('ordinary art/coding writes and reviewer reads keep their original results', async t => {
  const f = await ordinaryHostFixture(t), scripted = f.hostOptions.sessionFactory!; let actionError: unknown;
  const seen = new Set<string>();
  f.hostOptions.sessionFactory = async config => {
    const session = await scripted(config), packet = JSON.parse(config.context!);
    return { ...session, prompt: async (...args) => { try {
      if (packet.role === 'reviewer') {
        assert.ok(!config.tools!.some(tool => ['write', 'edit', 'validate-game-design'].includes(tool.name)));
        const input = packet.inputFiles.find((item: any) => item.files.length);
        assert.ok(input);
        const result = await call(config, 'read', { path: input.kind === 'file' ? input.location : `${input.location}/${input.files[0]}` });
        assert.equal(result.content.length, 1);
        seen.add('reviewer');
      } else if (packet.role === 'art' || packet.role === 'coding') {
        const path = packet.role === 'art' ? 'authors/art/media.json' : 'authors/coding/src/main.ts';
        assert.equal((await call(config, 'write', { path, content: '中文临时片段' })).content.length, 1); seen.add(packet.role);
      }
      return await session.prompt(...args);
    } catch (error) { actionError = error; throw error; } } };
  };
  const result: any = await f.execute(); if (actionError) throw actionError;
  assert.ok(result.acceptedCandidate); assert.deepEqual([...seen].sort(), ['art', 'coding', 'reviewer']);
});

test('legacy design writes keep their original result without ordinary automatic feedback', async t => {
  const f = await ordinaryHostFixture(t), legacy = f.draft as any;
  delete legacy.ordinaryProfile; delete legacy.experienceCriteria; legacy.scenario = f.scenario;
  f.host.ordinaryProfile = undefined;
  let written = false;
  const run = author(f, async config => {
    const result = await call(config, 'write', { path: main, content: '{' });
    assert.equal(result.content.length, 1); written = true;
  });
  const result = await run(); assert.equal(written, true); assert.equal(result.acceptedCandidate, undefined);
});

for (const fault of ['invalid', 'changed', 'missing', 'review']) test(`write feedback cannot replace capture or independent review: ${fault}`, async t => {
  const f = await ordinaryHostFixture(t, { ...(fault === 'review' ? { fault: 'review' } : {}) });
  const run = author(f, async config => {
    await call(config, 'write', { path: main, content: JSON.stringify(design()) });
    const value = plan(f, config); if (fault === 'invalid') value.scenario.steps[0].acceptanceId = 'light';
    const text = feedback(await call(config, 'write', { path: acceptance, content: JSON.stringify(value) }));
    assert.match(text, fault === 'invalid' ? /Unknown field/ : /passed/);
    if (fault === 'changed') await writeFile(join(config.workspace, acceptance), '{}', 'utf8');
    if (fault === 'missing') await unlink(join(config.workspace, acceptance));
  });
  const result = await run(); assert.equal(result.acceptedCandidate, undefined); assert.equal(f.plays.length, 0);
  if (fault !== 'review') assert.equal(f.packets.filter(packet => packet.role === 'reviewer').length, 0);
});

async function fileFactory(t: test.TestContext, hook: NonNullable<RoleFactoryOptions['afterFileWrite']>) {
  const root = await mkdtemp(join(tmpdir(), 'cos118-files-')), workspace = join(root, 'author');
  await mkdir(join(workspace, 'authors/design'), { recursive: true }); await mkdir(join(workspace, 'requirements'), { recursive: true });
  await writeFile(join(workspace, 'requirements/v1.json'), '{"brief":"中文需求"}', 'utf8');
  const requirement = requirementFixture() as RequirementContract;
  const controller = await RunController.create({ root: join(root, 'run'), runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation', specVersion: requirement.specVersion,
    scope: 'validation', limitMicroCny: 1000, allocations: [{ taskId: 'planning', amountMicroCny: 100 }], now: () => Date.parse('2026-10-01T01:00:00.000Z') });
  const task = taskFixture() as TaskContract;
  Object.assign(task, { state: 'not_started', dependsOn: [], attempts: [], artifacts: [], evidence: [] });
  task.context.tools = ['read', 'write', 'edit']; task.ownership.writePaths = ['authors/design']; task.budget.allocationMicroCny = 100;
  task.budget.originalDeadlineAt = (await controller.read()).run.originalDeadlineAt;
  let config!: PiSessionOptions;
  const factory = createRoleFactory({ maxOutputTokens: 100, maxRequests: 1, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 100, afterFileWrite: hook,
    sessionFactory: async input => { config = input; return { prompt: async () => handoff, close: async () => {} }; } });
  const role = await factory({ role: 'design', task, requirement, workspace, stateDirectory: join(root, 'session'), controller });
  t.after(async () => { await role.close(); await controller.close(); await removeOwned(tmpdir(), root); });
  return { workspace, config, task };
}

test('file callback only follows successful scoped write/edit; read, failed edit, UTF-8, links and escape remain rejected', async t => {
  const seen: { name: string; path: string; taskId: string }[] = [];
  const f = await fileFactory(t, async (input, write, signal) => { signal.throwIfAborted(); seen.push({ ...write, taskId: input.task.taskId }); return 'read-only advisory'; });
  assert.equal((await call(f.config, 'write', { path: main, content: '中文第一段' })).content.length, 2);
  assert.equal((await call(f.config, 'edit', { path: main, edits: [{ oldText: '第一段', newText: '第二段' }] })).content.length, 2);
  assert.equal((await call(f.config, 'read', { path: main })).content.length, 1);
  await assert.rejects(call(f.config, 'edit', { path: main, edits: [{ oldText: '缺失', newText: 'x' }] }), /not find|not found/i);
  await assert.rejects(call(f.config, 'write', { path: '../outside.txt', content: 'x' }), /outside/);
  await assert.rejects(call(f.config, 'write', { path: 'requirements/v1.json', content: 'x' }), /outside/);
  const invalid = 'authors/design/non-utf8.json'; await writeFile(join(f.workspace, invalid), Buffer.from([0xff]));
  for (const name of ['write', 'edit']) await assert.rejects(call(f.config, name, { path: invalid, content: '{}', edits: [{ oldText: 'x', newText: '{}' }] }), /not UTF-8/);
  await symlink(join(f.workspace, 'requirements'), join(f.workspace, 'authors/design/linked'), 'junction');
  await assert.rejects(call(f.config, 'write', { path: 'authors/design/linked/v1.json', content: 'x' }), /Symlink/);
  assert.deepEqual(seen, ['write', 'edit'].map(name => ({ name, path: main, taskId: f.task.taskId })));
  assert.equal(await readFile(join(f.workspace, main), 'utf8'), '中文第二段');
});

for (const phase of ['before', 'after', 'abort-before', 'abort-after']) test(`post-write ${phase} guard failure propagates with successful bytes intact`, async t => {
  const abort = new AbortController(); let checks = 0;
  const f = await fileFactory(t, async (input, _write, signal) => createGameDesignCheck({ workspace: input.workspace, gameplayIds: ['light'],
    guard: async () => { if (++checks === (phase.endsWith('before') ? 1 : 2)) {
      if (phase.startsWith('abort')) abort.abort(new Error('Original operation cancelled'));
      else throw new Error('Original authority changed');
    } } }).afterFileWrite(signal));
  await assert.rejects(call(f.config, 'write', { path: main, content: JSON.stringify(design()) }, abort.signal), /Original (authority changed|operation cancelled)/);
  assert.equal(await readFile(join(f.workspace, main), 'utf8'), JSON.stringify(design()));
  assert.equal(checks, phase.endsWith('before') ? 1 : 2);
});
