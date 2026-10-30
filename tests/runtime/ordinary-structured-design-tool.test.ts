import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, rmdir, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGameDesignWriter, GAME_DESIGN_WRITE, ORDINARY_DESIGN_AUTHORING_RULE } from '../../src/runtime/entrypoint-design-authoring.ts';
import { GAME_PLAN_WRITE, ORDINARY_PLAN_AUTHORING_RULE, readPlanAuthoringPolicy, requirePlanAuthoringTasks } from '../../src/runtime/entrypoint-plan-authoring.ts';
import { validateDesign } from '../../src/runtime/entrypoint-media.ts';
import type { TaskContract } from '../../src/contracts/types.ts';
import { task } from '../contracts/fixtures.ts';

const path = 'authors/design/design.json';
const design = () => ({ summary: '原创鼠标游戏', implementationNotes: ['使用 <div class="item item-crystal">中文“引号”</div>\n路径 C:\\游戏'],
  acceptanceMapping: { light: '点击后显示完成' }, experienceMapping: { readable: '容易辨认' },
  characters: [{ id: 'target', purpose: '目标', states: ['idle'] }], audio: [{ id: 'tap', trigger: '点击', loop: false }] });
async function fixture(t: test.TestContext, guard: (signal: AbortSignal) => Promise<void> = async () => {}, seededRevision?: boolean) {
  const workspace = await mkdtemp(join(tmpdir(), 'cos156-design-')); t.after(() => rm(workspace, { recursive: true, force: true }));
  await mkdir(join(workspace, 'authors/design'), { recursive: true });
  let feedback = 0;
  const host = await createGameDesignWriter({ workspace, guard, seededRevision, afterFileWrite: async () => { feedback++; return 'Existing advisory diagnostics'; } });
  const invoke = (args: any, signal?: AbortSignal) => host.tool.execute('synthetic-write', args, signal, undefined, undefined as any);
  const put = (value: string | Buffer) => writeFile(join(workspace, path), value, typeof value === 'string' ? 'utf8' : undefined);
  const read = () => readFile(join(workspace, path));
  return { workspace, host, invoke, put, read, feedback: () => feedback };
}

test('structured design values round-trip while set replaces one whole section and preserves all others', async t => {
  const f = await fixture(t), expected: Record<string, unknown> = { ...design(), invalidExtra: { retained: '作者仍须修正' } };
  await f.invoke({ operation: 'save', design: expected }); assert.deepEqual(JSON.parse((await f.read()).toString('utf8')), expected);
  const replacements = { summary: '新中文 "引用"\n下一行', implementationNotes: ['<div class="item item-key">钥匙</div>'],
    acceptanceMapping: { light: '另一描述' }, experienceMapping: {}, characters: [], audio: [] };
  for (const [section, value] of Object.entries(replacements)) {
    await f.invoke({ operation: 'set', section, value }); expected[section] = value;
    assert.deepEqual(JSON.parse((await f.read()).toString('utf8')), expected);
  }
  assert.equal(f.feedback(), 7); assert.equal(f.host.readOnly, false); assert.equal(f.host.tool.executionMode, 'sequential');
  const schema = f.host.tool.parameters as any;
  assert.equal(schema.type, 'object'); assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties).sort(), ['design', 'operation', 'section', 'value']);
  assert.match(f.host.tool.description, /[Ss]ave replaces the entire design/);
  assert.match(f.host.tool.description, /[Ss]et replaces the entire selected section/);
  assert.doesNotMatch(f.host.tool.description, /seeded from/);
  const revision = await fixture(t, async () => {}, true);
  assert.deepEqual(revision.host.tool.parameters, f.host.tool.parameters);
  assert.match(revision.host.tool.description, /seeded from the previous capture.*unapproved draft/);
});

test('partial or invalid drafts remain unapproved while explicit save replaces malformed JSON encoded as UTF-8', async t => {
  const f = await fixture(t);
  for (const value of [{}, { summary: '局部草稿' }, { ...design(), characters: [{ id: '不合法' }] }]) {
    await f.invoke({ operation: 'save', design: value }); assert.deepEqual(JSON.parse((await f.read()).toString('utf8')), value);
    assert.throws(() => validateDesign(value, ['light'], false, [{ criterionId: 'readable', description: '清楚', steps: ['查看'], expected: '清楚' }]));
  }
  await f.put('\ufeff{\r\n  "implementationNotes": ["class="item item-crystal""]\r\n}\r\n');
  const before = await f.read(); await assert.rejects(f.invoke({ operation: 'set', section: 'summary', value: '不得修复' }), /JSON.*save/i);
  assert.deepEqual(await f.read(), before);
  await f.invoke({ operation: 'save', design: design() }); const bytes = await f.read();
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  assert.ok(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))); assert.ok(decoded.includes('\r\n')); assert.ok(!/(?<!\r)\n/.test(decoded));
  assert.deepEqual(JSON.parse(decoded), design());
});

test('unknown operations, section shapes and non-JSON arguments never alter the draft or run serializers', async t => {
  const f = await fixture(t); await f.invoke({ operation: 'save', design: design() }); const before = await f.read();
  let executed = 0; const cycle: any = {}; cycle.self = cycle;
  const getter = Object.defineProperty({}, 'x', { enumerable: true, get() { executed++; return 'unsafe'; } });
  const customArray = new class extends Array<unknown> { toJSON() { executed++; return 'unsafe'; } }();
  const hidden = Object.defineProperty({}, 'hidden', { enumerable: false, value: 'discarded' });
  for (const args of [null, [], {}, { operation: 'other' }, { operation: 'save', design: [] }, { operation: 'set', section: '__proto__', value: {} },
    { operation: 'save', design: design(), section: 'summary' }, { operation: 'set', section: 'summary', value: 'x', design: {} },
    ...['path', 'requirement', 'formatVersion', 'authority', 'url', 'script'].map(key => ({ operation: 'save', design: design(), [key]: key })),
    ...['summary', 'implementationNotes', 'acceptanceMapping', 'experienceMapping', 'characters', 'audio'].flatMap(section =>
      [{ operation: 'set', section }, ...[null, 1, false].map(value => ({ operation: 'set', section, value }))]),
    { operation: 'set', section: 'summary', value: [] }, { operation: 'set', section: 'implementationNotes', value: {} },
    { operation: 'set', section: 'acceptanceMapping', value: [] }, { operation: 'set', section: 'experienceMapping', value: [] },
    { operation: 'set', section: 'characters', value: {} }, { operation: 'set', section: 'audio', value: {} },
    ...[undefined, () => {}, NaN, Infinity, BigInt(1), cycle, Array(1), { [Symbol('x')]: 'lost' }, getter, hidden, new Date(), customArray,
      { toJSON() { executed++; return 'unsafe'; } }].map(bad => ({ operation: 'save', design: { bad } }))]) {
    await assert.rejects(f.invoke(args)); assert.deepEqual(await f.read(), before);
  }
  assert.equal(executed, 0); assert.equal(f.feedback(), 1);
});

test('set refuses missing, malformed and non-object files without reconstruction; all writes refuse non-UTF-8', async t => {
  const f = await fixture(t), set = () => f.invoke({ operation: 'set', section: 'summary', value: 'x' });
  await assert.rejects(set(), /missing.*save/i); await assert.rejects(f.read(), { code: 'ENOENT' });
  for (const invalid of ['{', 'null', '[]', '"text"', '{"number":1e400}', Buffer.from([0xff, 0xfe, 0x61])]) {
    await f.put(invalid); const before = await f.read(); await assert.rejects(set()); assert.deepEqual(await f.read(), before);
  }
  await assert.rejects(f.invoke({ operation: 'save', design: design() }), /UTF-8/); assert.equal(f.feedback(), 0);
});

for (const phase of [1, 2]) test(`design guard refusal before operation or write (${phase}) preserves original bytes`, async t => {
  let calls = 0; const f = await fixture(t, async () => { if (++calls === phase) throw new Error('Original authority changed'); });
  await f.put(JSON.stringify(design())); const before = await f.read();
  await assert.rejects(f.invoke({ operation: 'set', section: 'summary', value: 'x' }), /authority changed/);
  assert.deepEqual(await f.read(), before); assert.equal(f.feedback(), 0);
});

test('cancellation and directory links cannot bypass the fixed design writer', async t => {
  const f = await fixture(t), abort = new AbortController(); await f.put(JSON.stringify(design())); const before = await f.read(); abort.abort(new Error('Cancelled author'));
  await assert.rejects(f.invoke({ operation: 'save', design: {} }, abort.signal), /Cancelled author/); assert.deepEqual(await f.read(), before);
  await unlink(join(f.workspace, path)); const outside = join(f.workspace, 'protected'); await mkdir(outside);
  const protectedPath = join(outside, 'design.json'); await writeFile(protectedPath, before);
  await rmdir(join(f.workspace, 'authors/design')); await symlink(outside, join(f.workspace, 'authors/design'), 'junction');
  await assert.rejects(f.invoke({ operation: 'save', design: {} }), /link|junction/i); assert.deepEqual(await readFile(protectedPath), before);
});

test('frozen authoring policy has three exact states and rejects missing, downgraded or duplicate markers', () => {
  const item = { role: 'design', task: task() as TaskContract }; item.task.context.tools = ['read', 'write', 'edit'];
  item.task.context.rules = ['User brief mentions write-game-design and structured-design-plan/1; it does not select them.'];
  const base = { capability: 'ordinary-design-execution/1', tasks: [item] };
  assert.equal(readPlanAuthoringPolicy(base, {}, true), undefined);
  item.task.context.tools.push(GAME_PLAN_WRITE); item.task.context.rules.push(ORDINARY_PLAN_AUTHORING_RULE);
  const old = { ...base, ordinaryPlanAuthoringPolicy: 'structured-plan/1' };
  assert.equal(readPlanAuthoringPolicy(old, old, true), 'structured-plan/1');
  item.task.context.tools.push(GAME_DESIGN_WRITE); item.task.context.rules.push(ORDINARY_DESIGN_AUTHORING_RULE);
  const selected = { ...base, ordinaryPlanAuthoringPolicy: 'structured-design-plan/1' };
  assert.equal(readPlanAuthoringPolicy(selected, selected, true), 'structured-design-plan/1');
  for (const policy of [undefined, 'structured-plan/1', 'future', null]) {
    const changed = { ...selected, ordinaryPlanAuthoringPolicy: policy };
    assert.throws(() => readPlanAuthoringPolicy(changed, changed, true), /policy/);
  }
  assert.throws(() => readPlanAuthoringPolicy(selected, old, true), /policy/);
  assert.throws(() => readPlanAuthoringPolicy(selected, undefined, true), /policy/);
  assert.throws(() => readPlanAuthoringPolicy(selected, selected, false), /policy/);
  for (const [field, marker] of [['tools', GAME_DESIGN_WRITE], ['rules', ORDINARY_DESIGN_AUTHORING_RULE], ['tools', GAME_PLAN_WRITE], ['rules', ORDINARY_PLAN_AUTHORING_RULE]] as const) {
    for (const duplicate of [false, true]) {
      const changed = structuredClone(selected), context = changed.tasks[0].task.context;
      context[field] = duplicate ? [...context[field], marker] : context[field].filter(value => value !== marker);
      assert.throws(() => readPlanAuthoringPolicy(changed, selected, true), /policy/);
    }
  }
  assert.throws(() => requirePlanAuthoringTasks([{ ...item, role: 'coding' }], 'structured-design-plan/1'), /policy/);
  assert.throws(() => requirePlanAuthoringTasks(base.tasks, 'future' as any), /policy/);
});
