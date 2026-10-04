import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { snapshot } from '../../src/artifacts/paths.ts';
import { createGameDesignCheck, MEDIA_IDENTIFIER_RULE } from '../../src/runtime/entrypoint-design-check.ts';
import { validateDesign } from '../../src/runtime/entrypoint-media.ts';

const design = () => ({ summary: '原创中文展示不受标识符限制', implementationNotes: ['规则不变'], acceptanceMapping: { move: '移动箱子' },
  characters: [{ id: 'player', purpose: '玩家', states: ['idle'] }, { id: 'box', purpose: '箱子', states: ['idle', 'pushed', 'on-target'] }],
  audio: [{ id: 'push', trigger: '推箱子', loop: false }] });
async function fixture(t: test.TestContext, guard: (signal: AbortSignal) => Promise<void> = async () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-design-check-')); await mkdir(join(root, 'authors/design'), { recursive: true });
  t.after(async () => { assert.ok(root.startsWith(tmpdir())); await rm(root, { recursive: true, force: true }); });
  const file = join(root, 'authors/design/design.json'), tool = createGameDesignCheck({ workspace: root, gameplayIds: ['move'], guard });
  const call = async (args: any = {}, signal?: AbortSignal) => JSON.parse((await (tool.tool.execute as any)('check', args, signal, undefined, undefined)).content[0].text);
  return { root, file, tool, call, write: (value: unknown) => writeFile(file, JSON.stringify(value), 'utf8') };
}

test('COS46 uses original strict validation and identifies illegal and reserved media fields without writes', async t => {
  const f = await fixture(t), value = design(); value.characters[1].states[2] = 'onTarget'; value.characters[0].id = 'con'; value.audio[0].id = 'alarm_name';
  assert.throws(() => validateDesign(value, ['move']), /Invalid media spec/);
  await f.write(value); const before = await snapshot(f.root), result = await f.call();
  assert.equal(f.tool.readOnly, true); assert.equal(result.passed, false);
  assert.deepEqual(result.errors.map((item: any) => item.path), ['characters[0].id', 'characters[1].states[2]', 'audio[0].id']);
  assert.ok(result.errors.every((item: any) => item.message.includes(MEDIA_IDENTIFIER_RULE)));
  assert.deepEqual(await snapshot(f.root), before);
  assert.throws(() => validateDesign(value, ['move']), /Invalid media spec/);
});

test('COS46 checks current bytes after missing, invalid JSON, valid and changed files', async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.call(), { passed: false, errors: [{ path: 'authors/design/design.json', message: 'Required design output is missing.' }] });
  await writeFile(f.file, '{', 'utf8'); assert.match((await f.call()).errors[0].message, /complete JSON/);
  await writeFile(f.file, Buffer.from([0xff])); assert.match((await f.call()).errors[0].message, /UTF-8/);
  await f.write(design()); assert.deepEqual(await f.call(), { passed: true, errors: [] });
  const changed = design(); changed.characters[1].states[2] = 'onTarget'; await f.write(changed);
  assert.equal((await f.call()).errors[0].path, 'characters[1].states[2]');
  await f.write({ ...design(), acceptanceMapping: {} }); assert.match((await f.call()).errors[0].message, /exact gameplay/);
  await unlink(f.file); assert.equal((await f.call()).passed, false);
});

test('COS46 accepts only empty arguments and checks authority before and after the fixed file read', async t => {
  let calls = 0, rejectAt = Infinity;
  const f = await fixture(t, async signal => { signal.throwIfAborted(); if (++calls === rejectAt) throw new Error('Original authority changed'); }); await f.write(design());
  for (const args of [{ path: 'other.json' }, { unused: true }, null, [], '']) await assert.rejects(f.call(args), /no arguments/);
  assert.equal(calls, 0);
  assert.deepEqual(await f.call(), { passed: true, errors: [] }); assert.equal(calls, 2);
  rejectAt = 4; await assert.rejects(f.call(), /authority changed/); assert.equal(calls, 4);
  const aborted = new AbortController(); aborted.abort(new Error('Stopped')); await assert.rejects(f.call({}, aborted.signal), /Stopped/);
  assert.equal(calls, 4);
});
