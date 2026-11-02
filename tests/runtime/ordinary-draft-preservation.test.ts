import assert from 'node:assert/strict';
import { link, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createWorkspaceTools } from '../../src/providers/workspace-tools.ts';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';

const designPath = 'authors/design/design.json', planPath = 'authors/design/acceptance-plan.json';
const design = { summary: '原创鼠标游戏', implementationNotes: ['通过正常鼠标操作显示结果'], acceptanceMapping: { light: '点击后显示完成' },
  experienceMapping: { readable: '状态清楚呈现' }, characters: [{ id: 'target', purpose: '目标', states: ['idle'] }], audio: [] };
async function call(config: PiSessionOptions, name: string, args: object, signal?: AbortSignal) {
  const tool = config.tools!.find(tool => tool.name === name);
  assert.ok(tool);
  return tool.execute('draft-test', args, signal, undefined, undefined as never);
}

for (const operation of ['raw write', 'plan save', 'raw edit', 'plan append', 'design save', 'design set']) test(`COS161 valid pair survives ${operation} reset`, async t => {
  let completed = false, failure: unknown;
  const f = await ordinaryHostFixture(t, { fault: 'review', sessionFactory: async (config, fallback) => {
    if (JSON.parse(config.context!).role !== 'design') return fallback;
    return { close: fallback.close, prompt: async () => { try {
      await call(config, 'write-game-design', { operation: 'save', design });
      await call(config, 'write-game-plan', { operation: 'save', scenario: f.scenario });
      const check = await call(config, 'validate-game-design', {});
      assert.ok(check.content[0].type === 'text' && JSON.parse(check.content[0].text).passed);
      const readPair = () => Promise.all([designPath, planPath].map(path => readFile(join(config.workspace, path))));
      const before = await readPair();
      const mutations: Record<string, [string, object, RegExp]> = {
        'raw write': ['write', { path: planPath, content: 'unfinished ordinary scenario' }, /acceptance-plan\.json/],
        'raw edit': ['edit', { path: designPath, edits: [{ oldText: '"target"', newText: '"BAD_ID"' }] }, /characters\[0\]\.id/],
        'plan save': ['write-game-plan', { operation: 'save', scenario: { viewport: f.scenario.viewport, steps: [] } }, /steps/],
        'plan append': ['write-game-plan', { operation: 'append', stage: 'main', steps: [f.scenario.steps[0]] }, /duplicate|unique/i],
        'design save': ['write-game-design', { operation: 'save', design: {} }, /design.json/],
        'design set': ['write-game-design', { operation: 'set', section: 'acceptanceMapping', value: {} }, /missing IDs/],
      };
      const [name, args, diagnostic] = mutations[operation];
      const reset = call(config, name, args);
      const error = await reset.then(() => undefined, error => error);
      assert.deepEqual((await readPair()).map((bytes, i) => bytes.equals(before[i])), [true, true], 'A rejected reset must retain the complete original pair.');
      assert.match(String(error), /current draft preserved/i);
      assert.match(String(error), diagnostic);
      assert.doesNotMatch(String(error), /Successfully wrote|Saved acceptance plan draft/);
      assert.ok(error instanceof Error && error.message.length <= 4096);
      completed = true;
      return { text: JSON.stringify({ summary: '合成测试', remaining: [], uncertainty: [] }) };
    } catch (error) { failure = error; throw error; } } };
  } });
  await f.execute();
  if (failure) throw failure;
  assert.ok(completed);
});

test('COS161 unsafe companion blocks partial construction and missing classic output cannot disable protection', async t => {
  let completed = false, failure: unknown;
  const f = await ordinaryHostFixture(t, { classic: true, sessionFactory: async (config, fallback) => {
    if (JSON.parse(config.context!).role !== 'design') return fallback;
    return { close: fallback.close, prompt: async () => { try {
      const companion = join(config.workspace, designPath), target = join(config.workspace, planPath);
      const save = () => call(config, 'write-game-plan', { operation: 'save', scenario: f.scenario });
      await call(config, 'write', { path: designPath, content: '{' });
      await writeFile(companion, Buffer.from([0xff]));
      await assert.rejects(save(), /UTF-8|encoded/i);
      await assert.rejects(readFile(target), { code: 'ENOENT' });
      await writeFile(companion, '{}');
      await link(companion, companion + '.link');
      try { await assert.rejects(save(), /independent regular file/i); }
      finally { await unlink(companion + '.link'); }
      await assert.rejects(readFile(target), { code: 'ENOENT' });
      await save();
      await call(config, 'write-game-design', { operation: 'save', design });
      const explicit = await call(config, 'validate-game-design', {});
      assert.match(JSON.stringify(explicit.content), /classic-entry-plan/);
      await link(target, target + '.link');
      const originalDesign = await readFile(companion);
      try { await assert.rejects(call(config, 'write', { path: designPath, content: '{}' }), /independent regular file/i); }
      finally { await unlink(target + '.link'); }
      assert.deepEqual(await readFile(companion), originalDesign);
      const updated = { ...f.scenario, viewport: { width: 800, height: 600 } };
      await call(config, 'write-game-plan', { operation: 'save', scenario: updated });
      const before = await readFile(target);
      assert.deepEqual(JSON.parse(before.toString('utf8')).scenario.viewport, updated.viewport);
      const changedCase = process.platform === 'win32' ? target.toUpperCase() : target;
      await assert.rejects(call(config, 'write', { path: changedCase, content: '{' }), /current draft preserved/i);
      const active = new AbortController(); active.abort();
      await assert.rejects(call(config, 'write', { path: planPath, content: '{}' }, active.signal), /abort/i);
      assert.deepEqual(await readFile(target), before);
      completed = true;
      return { text: JSON.stringify({ summary: '合成测试', remaining: [], uncertainty: [] }) };
    } catch (error) { failure = error; throw error; } } };
  } });
  await f.execute(); if (failure) throw failure;
  assert.ok(completed);
});

test('COS161 validates actual SDK edit bytes and observes cancellation between validation and commit', async t => {
  const workspace = await mkdtemp(join(tmpdir(), 'cos161-edit-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const path = 'draft.json', full = join(workspace, path);
  await writeFile(full, '\ufeffline 1\r\nline 2\r\n');
  const controller = new AbortController(), candidates: Buffer[] = [];
  const tools = await createWorkspaceTools({ workspace, readPaths: [], writePaths: [path], async beforeFileWrite(actual, candidate, signal) {
    assert.equal(actual, full);
    candidates.push(candidate);
    if (signal === controller.signal) controller.abort();
  } });
  const edit = tools.find(tool => tool.name === 'edit')!, write = tools.find(tool => tool.name === 'write')!;
  const args = { path, edits: [{ oldText: 'line 1\nline 2', newText: '新一行\nsecond' }] };
  await edit.execute('edit', args, undefined, undefined, undefined as never);
  const before = await readFile(full);
  assert.deepEqual(before, Buffer.from('\ufeff新一行\r\nsecond\r\n')); assert.deepEqual(candidates[0], before);
  await assert.rejects(write.execute('write', { path, content: 'new\ud800text' }, controller.signal, undefined, undefined as never), /abort/i);
  assert.deepEqual(candidates[1], Buffer.from('new\ufffdtext')); assert.deepEqual(await readFile(full), before);
});

test('COS161 a malformed viewport can be repaired and cannot replace a valid plan', async t => {
  let completed = false, failure: unknown;
  const f = await ordinaryHostFixture(t, { fault: 'review', sessionFactory: async (config, fallback) => {
    if (JSON.parse(config.context!).role !== 'design') return fallback;
    return { close: fallback.close, prompt: async () => { try {
      await call(config, 'write-game-design', { operation: 'save', design });
      const malformed = { ...f.scenario, viewport: { width: { toString: '1280' }, height: 720 },
        steps: [{ id: 'click', kind: 'mouse-click', x: 42, y: 24 }, f.scenario.steps[1]] };
      await call(config, 'write-game-plan', { operation: 'save', scenario: malformed });
      await call(config, 'write-game-plan', { operation: 'save', scenario: f.scenario });
      const target = join(config.workspace, planPath), before = await readFile(target);
      assert.deepEqual(JSON.parse(before.toString('utf8')).scenario, f.scenario);
      await assert.rejects(call(config, 'write-game-plan', { operation: 'save', scenario: malformed }), /current draft preserved[\s\S]*Cannot convert object to primitive value/i);
      assert.deepEqual(await readFile(target), before);
      completed = true; return { text: JSON.stringify({ summary: '合成修复测试', remaining: [], uncertainty: [] }) };
    } catch (error) { failure = error; throw error; } } };
  } });
  await f.execute(); if (failure) throw failure; assert.ok(completed);
});
