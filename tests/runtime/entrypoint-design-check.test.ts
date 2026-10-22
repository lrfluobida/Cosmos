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
  await f.write({ ...design(), acceptanceMapping: {} }); assert.match((await f.call()).errors[0].message, /acceptanceMapping.*missing IDs.*"move"/);
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

const experience = [{ criterionId: 'readable', description: '清楚', steps: ['查看'], expected: '清楚' }];
function mappingError(value: unknown, ids = ['move'], ordinary = false): string {
  let message = '';
  assert.throws(() => validateDesign(value, ids, false, ordinary ? experience : undefined), error => {
    assert.ok(error instanceof Error); message = error.message; return true;
  });
  return message;
}
for (const field of ['acceptanceMapping', 'experienceMapping']) test(`COS121 ${field} reports missing, extra and invalid values together`, () => {
  const id = field === 'acceptanceMapping' ? 'move' : 'readable', label = field === 'acceptanceMapping' ? 'gameplayId' : 'criterionId';
  const value = { ...design(), experienceMapping: { readable: '清楚显示' }, [field]: { [label]: [id] } };
  const message = mappingError(value, ['move'], true);
  assert.match(message, new RegExp(field)); assert.match(message, new RegExp(`missing IDs.*"${id}"`));
  assert.match(message, new RegExp(`extra keys.*"${label}"`)); assert.match(message, new RegExp(`non-string values.*"${label}"`));
  for (const bad of [[id], { nested: true }, null, 1]) {
    const error = mappingError({ ...value, [field]: { [id]: bad } }, ['move'], true);
    assert.match(error, new RegExp(`${field}.*non-string values.*"${id}"`));
  }
  for (const bad of ['', ' \n\t', '文'.repeat(16001)]) {
    const error = mappingError({ ...value, [field]: { [id]: bad } }, ['move'], true);
    assert.match(error, new RegExp(`${field}.*blank or over-16000-character strings.*"${id}"`));
    assert.ok(error.length < 1000); assert.ok(!error.includes('文'.repeat(100)));
  }
  for (const bad of [undefined, null, [], ['wrong'], 'wrong', true, 1]) {
    const error = mappingError({ ...value, [field]: bad }, ['move'], true);
    assert.match(error, new RegExp(`${field}.*JSON object`));
  }
});

test('COS121 mapping diagnostics bound key lists and escaped long keys without echoing values', () => {
  const ids = ['normal', ...Array.from({ length: 30 }, (_, i) => `required-${i}`)];
  const mapping = Object.fromEntries(['unexpected', ...Array.from({ length: 30 }, (_, i) => `extra-${i}-${'"\\\n'.repeat(2000)}`)].map(key => [key, ['PRIVATE_VALUE_DO_NOT_ECHO']]));
  const message = mappingError({ ...design(), acceptanceMapping: mapping }, ids);
  assert.ok(message.length <= 2048); assert.match(message, /acceptanceMapping.*missing IDs.*"normal"/);
  assert.match(message, /extra keys.*"unexpected"/); assert.match(message, /non-string values.*"unexpected"/);
  assert.match(message, /\+\d+ more/); assert.match(message, /truncated/); assert.doesNotMatch(message, /PRIVATE_VALUE_DO_NOT_ECHO/);
});

test('COS121 valid Chinese mappings and literal label IDs preserve all other strict design gates', () => {
  const value = { ...design(), acceptanceMapping: { gameplayId: '点击后移动箱子', __proto__: 'unused' }, experienceMapping: { criterionId: '状态变化清楚' } };
  value.acceptanceMapping = JSON.parse('{"gameplayId":"点击后移动箱子","__proto__":"真实条目说明"}');
  const criteria = [{ ...experience[0], criterionId: 'criterionId' }];
  assert.doesNotThrow(() => validateDesign(value, ['gameplayId', '__proto__'], false, criteria));
  assert.doesNotThrow(() => validateDesign({ ...design(), experienceMapping: {} }, ['move'], false, []));
  assert.doesNotThrow(() => validateDesign({ ...design(), acceptanceMapping: { move: '文'.repeat(16000) } }, ['move']));
  assert.throws(() => validateDesign(value, ['gameplayId', '__proto__']));
  for (const change of [
    { summary: '' }, { implementationNotes: [] }, { characters: [] }, { audio: Array.from({ length: 65 }, () => design().audio[0]) },
    { characters: [{ id: 'BAD_ID', purpose: '目标', states: ['idle'] }] }, { audio: [{ id: 'push', trigger: '推', loop: 'false' }] },
    { extra: true }, { modulePurposes: { a: '甲', b: '乙' } },
  ]) assert.throws(() => validateDesign({ ...design(), ...change }, ['move']));
  assert.throws(() => validateDesign(design(), ['move'], true), /module purposes/);
});
