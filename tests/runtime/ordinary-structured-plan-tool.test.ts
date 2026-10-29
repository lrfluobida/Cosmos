import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, rmdir, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGamePlanWriter, ORDINARY_PLAN_AUTHORING_RULE, readPlanAuthoringPolicy, requirePlanAuthoringTasks } from '../../src/runtime/entrypoint-plan-authoring.ts';
import { task } from '../contracts/fixtures.ts';
import type { TaskContract } from '../../src/contracts/types.ts';
import { validateOrdinaryAcceptancePlan } from '../../src/runtime/entrypoint-acceptance-plan.ts';
import { ordinaryDraft } from '../roles/ordinary.fixture.ts';

const path = 'authors/design/acceptance-plan.json';
const requirement = { artifactId: 'requirement-bundle', version: 'v1', location: 'registry/captures/requirement-bundle/v1/files' };
const scenario = () => ({ viewport: { width: 800, height: 600 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#开始', timeoutMs: 1000 }] });
const checkpoint = { expected: '已保存', snapshot: { kind: 'text', selector: '#current' }, savedSnapshot: { kind: 'text', selector: '#saved' } };
const envelope = () => ({ formatVersion: 'ordinary-acceptance-plan/1', requirement, scenario: scenario() });
async function fixture(t: test.TestContext, guard: (signal: AbortSignal) => Promise<void> = async () => {}, seededRevision?: boolean) {
  const workspace = await mkdtemp(join(tmpdir(), 'cos147-plan-')); t.after(() => rm(workspace, { recursive: true, force: true }));
  await mkdir(join(workspace, 'authors/design'), { recursive: true });
  let feedback = 0;
  const host = await createGamePlanWriter({ workspace, requirement, guard, seededRevision, afterFileWrite: async () => { feedback++; return 'Existing advisory diagnostics'; } });
  const invoke = (args: any, signal?: AbortSignal) => host.tool.execute('synthetic-write', args, signal, undefined, undefined as any);
  const put = (value: string | Buffer) => writeFile(join(workspace, path), value, typeof value === 'string' ? 'utf8' : undefined);
  const read = () => readFile(join(workspace, path));
  return { workspace, host, invoke, put, read, feedback: () => feedback };
}

test('tool owns only a fixed path and preserves BOM/newlines, parsed values and large complete drafts', async t => {
  const f = await fixture(t), value: any = envelope();
  value.scenario.steps[0].selector = '#中文 "引号"\n下一行';
  value.scenario.steps.push(...Array.from({ length: 2100 }, (_, i) => ({ id: `synthetic-${i}`, text: '完整草稿'.repeat(20) })));
  await f.put('\ufeff' + JSON.stringify(value, null, 2).replaceAll('\n', '\r\n') + '\r\n');
  await f.invoke({ operation: 'append', stage: 'main', steps: [{ id: 'last', kind: 'bad-step' }] });
  const bytes = await f.read(), decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  assert.ok(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))); assert.ok(decoded.includes('\r\n')); assert.ok(!/(?<!\r)\n/.test(decoded));
  value.scenario.steps.push({ id: 'last', kind: 'bad-step' }); assert.deepEqual(JSON.parse(decoded), value);
  assert.equal(f.feedback(), 1); assert.equal(f.host.readOnly, false);
  const schema = f.host.tool.parameters as any; assert.equal(schema.type, 'object'); assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties).sort(), ['afterStepId', 'checkpoint', 'operation', 'scenario', 'stage', 'steps']);
  assert.deepEqual(schema.properties.afterStepId, { type: 'string' }); assert.ok(!schema.required.includes('afterStepId'));
});

test('save documents full replacement while empty and omitted scenario data remain valid drafts to record', async t => {
  const f = await fixture(t);
  assert.match(f.host.tool.description, /[Ss]ave replaces the entire scenario/);
  assert.match(f.host.tool.description, /viewport, all steps and reopen; omitted content is not retained/);
  assert.match(f.host.tool.description, /[Aa]ppend adds steps to the chosen stage in order/);
  assert.doesNotMatch(f.host.tool.description, /seeded|unapproved drafts/);
  assert.equal(f.host.tool.executionMode, 'sequential');
  const revision = await fixture(t, async () => {}, true);
  assert.deepEqual(revision.host.tool.parameters, f.host.tool.parameters);
  const complete = { ...scenario(), reopen: { steps: [{ id: 'reopen' }], checkpoint } };
  for (const selected of [f, revision]) for (const replacement of [{ viewport: scenario().viewport, steps: [] }, {}]) {
    await selected.invoke({ operation: 'save', scenario: complete });
    await selected.invoke({ operation: 'save', scenario: replacement });
    const saved = JSON.parse((await selected.read()).toString('utf8'));
    assert.deepEqual(saved, { formatVersion: 'ordinary-acceptance-plan/1', requirement, scenario: replacement });
    assert.throws(() => validateOrdinaryAcceptancePlan(saved, ordinaryDraft()));
  }
  const before = await f.read();
  await assert.rejects(f.invoke({ operation: 'save', scenario: scenario(), seededRevision: true }), /field/);
  assert.deepEqual(await f.read(), before);
});

test('unknown and inapplicable arguments or non-JSON values never change a saved draft', async t => {
  const f = await fixture(t); await f.invoke({ operation: 'save', scenario: scenario() }); const before = await f.read();
  const cycle: any = {}; cycle.self = cycle;
  const customArray = new class extends Array<unknown> { toJSON() { return 'Changed by inherited serialization'; } }();
  const sparse = Array(1), symbol = { [Symbol('x')]: 'discarded' }, getter = Object.defineProperty({}, 'x', { enumerable: true, get() { throw new Error('Getter must not run'); } });
  for (const args of [null, [], {}, { operation: 'other' }, { operation: 'save', scenario: [], path },
    ...['path', 'requirement', 'formatVersion', 'authority', 'url', 'steps', 'checkpoint', 'stage'].map(key => ({ operation: 'save', scenario: scenario(), [key]: key })),
    { operation: 'append', stage: 'other', steps: [] }, { operation: 'append', stage: 'main', steps: {}, },
    { operation: 'append', stage: 'main', steps: [], checkpoint }, { operation: 'append', stage: 'reopen', steps: [] },
    { operation: 'append', stage: 'main', steps: [], scenario: {} },
    ...[undefined, () => {}, Number.NaN, Infinity, BigInt(1), cycle, sparse, symbol, getter, new Date(), customArray].map(bad => ({ operation: 'save', scenario: { bad } }))]) {
    await assert.rejects(f.invoke(args)); assert.deepEqual(await f.read(), before);
  }
  assert.equal(f.feedback(), 1);
});

test('append refuses missing, bad UTF-8, JSON, envelopes, sources and containers without reconstruction', async t => {
  const f = await fixture(t), append = () => f.invoke({ operation: 'append', stage: 'main', steps: [] });
  await assert.rejects(append(), /missing.*save/i); await assert.rejects(f.read(), { code: 'ENOENT' });
  for (const bad of ['{', 'null', '[]', JSON.stringify({ ...envelope(), extra: true }), JSON.stringify({ ...envelope(), formatVersion: 'wrong' }),
    JSON.stringify({ ...envelope(), requirement: { ...requirement, version: 'v2' } }), JSON.stringify({ ...envelope(), scenario: [] }),
    JSON.stringify({ ...envelope(), scenario: { steps: {} } }), JSON.stringify({ ...envelope(), scenario: { steps: [], reopen: { steps: [], checkpoint: null } } }),
    JSON.stringify({ ...envelope(), scenario: { steps: [], reopen: { steps: {} } } }), '{"formatVersion":"ordinary-acceptance-plan/1","number":1e400}', Buffer.from([0xff, 0xfe, 0x61])]) {
    await f.put(bad); const before = await f.read(); await assert.rejects(append()); assert.deepEqual(await f.read(), before);
  }
  await assert.rejects(f.invoke({ operation: 'save', scenario: scenario() }), /UTF-8/); assert.equal(f.feedback(), 0);
});

test('reopen appends retain checkpoint and order and refuse replacement until explicit save', async t => {
  const f = await fixture(t); await f.invoke({ operation: 'save', scenario: scenario() });
  await f.invoke({ operation: 'append', stage: 'reopen', steps: [{ id: 'one' }], checkpoint });
  const before = await f.read();
  await assert.rejects(f.invoke({ operation: 'append', stage: 'reopen', steps: [{ id: 'discarded' }], checkpoint: { ...checkpoint, expected: 'changed' } }), /checkpoint differs/i);
  assert.deepEqual(await f.read(), before);
  await f.invoke({ operation: 'append', stage: 'reopen', steps: [{ id: 'two' }], checkpoint: structuredClone(checkpoint) });
  await f.invoke({ operation: 'append', stage: 'reopen', steps: [] });
  const value = JSON.parse((await f.read()).toString('utf8'));
  assert.deepEqual(value.scenario.reopen, { checkpoint, steps: [{ id: 'one' }, { id: 'two' }] }); assert.equal(value.reopen, undefined);
  await f.invoke({ operation: 'save', scenario: { ...scenario(), reopen: { steps: [], checkpoint: { ...checkpoint, expected: 'changed' } } } });
  assert.equal(JSON.parse((await f.read()).toString('utf8')).scenario.reopen.checkpoint.expected, 'changed');
});

test('anchored append inserts ordered batches in only the selected stage and retains all other data', async t => {
  const f = await fixture(t), value: any = envelope();
  value.scenario.steps.push({ id: 'last', text: '原有末尾' });
  value.scenario.reopen = { checkpoint, steps: [{ id: 'click', text: '另一阶段同名' }, { id: 'last', text: '重开末尾' }] };
  await f.put('\ufeff' + JSON.stringify(value, null, 2).replaceAll('\n', '\r\n') + '\r\n');
  for (const stage of ['main', 'reopen']) {
    const steps = [{ id: `${stage}-one`, text: '中文 "引号"\n下一行' }, { id: `${stage}-two`, text: '第二步' }];
    await f.invoke({ operation: 'append', stage, afterStepId: 'click', steps, ...(stage === 'reopen' ? { checkpoint: structuredClone(checkpoint) } : {}) });
    (stage === 'main' ? value.scenario.steps : value.scenario.reopen.steps).splice(1, 0, ...steps);
    const bytes = await f.read(), decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assert.ok(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))); assert.ok(!/(?<!\r)\n/.test(decoded));
    assert.deepEqual(JSON.parse(decoded), value);
  }
  assert.equal(f.feedback(), 2);
  assert.match(f.host.tool.description, /afterStepId/);
  assert.match(f.host.tool.description, /A,C,B/);
  assert.match(f.host.tool.description, /last inserted step/);
});

test('anchored append uses current step IDs for chaining and repeats the same anchor without a cursor', async t => {
  const f = await fixture(t); await f.put(JSON.stringify(envelope()));
  for (const [afterStepId, id] of [['click', 'B'], ['click', 'C'], ['C', 'D']]) {
    await f.invoke({ operation: 'append', stage: 'main', afterStepId, steps: [{ id }] });
  }
  await f.invoke({ operation: 'append', stage: 'main', steps: [{ id: 'tail' }] });
  const value = JSON.parse((await f.read()).toString('utf8'));
  assert.deepEqual(value.scenario.steps.map((step: any) => step.id), ['click', 'C', 'D', 'B', 'tail']);
});

test('invalid or ambiguous anchors and changed source or checkpoint leave draft bytes intact', async t => {
  const f = await fixture(t), value: any = envelope();
  value.scenario.reopen = { checkpoint, steps: [{ id: 'reopen-only' }, { id: 'duplicate' }, { id: 'duplicate' }] };
  const cases = [
    { operation: 'append', stage: 'main', afterStepId: 'missing', steps: [] },
    { operation: 'append', stage: 'main', afterStepId: 'reopen-only', steps: [] },
    { operation: 'append', stage: 'reopen', afterStepId: 'click', steps: [] },
    { operation: 'append', stage: 'reopen', afterStepId: 'duplicate', steps: [] },
    { operation: 'append', stage: 'reopen', afterStepId: 'reopen-only', steps: [], checkpoint: { ...checkpoint, expected: 'changed' } },
    { operation: 'append', stage: 'main', afterStepId: 'click', steps: [], unknown: true },
    { operation: 'save', scenario: scenario(), afterStepId: 'click' },
    ...['', null, 1, true, [], {}].map(afterStepId => ({ operation: 'append', stage: 'main', afterStepId, steps: [] })),
  ];
  await f.put(JSON.stringify(value)); const before = await f.read();
  for (const args of cases) { await assert.rejects(f.invoke(args)); assert.deepEqual(await f.read(), before); }
  for (const invalid of [envelope(), { ...value, requirement: { ...requirement, version: 'changed' } }]) {
    await f.put(JSON.stringify(invalid)); const original = await f.read();
    await assert.rejects(f.invoke({ operation: 'append', stage: 'reopen', afterStepId: 'reopen-only', steps: [{ id: 'not-written' }], checkpoint }));
    assert.deepEqual(await f.read(), original);
  }
  assert.equal(f.feedback(), 0);
});

for (const phase of [1, 2]) test(`anchored append preserves both original guards (${phase})`, async t => {
  let calls = 0; const f = await fixture(t, async () => { if (++calls === phase) throw new Error('Original authority changed'); });
  await f.put(JSON.stringify(envelope())); const before = await f.read();
  await assert.rejects(f.invoke({ operation: 'append', stage: 'main', afterStepId: 'click', steps: [{ id: 'not-written' }] }), /authority changed/);
  assert.deepEqual(await f.read(), before); assert.equal(f.feedback(), 0);
});

for (const phase of [1, 2]) test(`guard refusal before operation or write (${phase}) leaves original bytes intact`, async t => {
  let calls = 0; const f = await fixture(t, async () => { if (++calls === phase) throw new Error('Original authority changed'); });
  await f.put(JSON.stringify(envelope())); const before = await f.read();
  await assert.rejects(f.invoke({ operation: 'append', stage: 'main', steps: [{ id: 'not-written' }] }), /authority changed/);
  assert.deepEqual(await f.read(), before); assert.equal(f.feedback(), 0);
});

test('cancellation and symlink paths cannot write through the fixed writer', async t => {
  const f = await fixture(t), abort = new AbortController(); await f.put(JSON.stringify(envelope())); const before = await f.read(); abort.abort(new Error('Cancelled author'));
  await assert.rejects(f.invoke({ operation: 'save', scenario: {} }, abort.signal), /Cancelled author/); assert.deepEqual(await f.read(), before);
  await unlink(join(f.workspace, path)); const outside = join(f.workspace, 'protected'); await mkdir(outside);
  const protectedPath = join(outside, 'acceptance-plan.json'); await writeFile(protectedPath, before);
  await rmdir(join(f.workspace, 'authors/design')); await symlink(outside, join(f.workspace, 'authors/design'), 'junction');
  await assert.rejects(f.invoke({ operation: 'save', scenario: {} }), /link|junction/i); assert.deepEqual(await readFile(protectedPath), before);
});

test('frozen policy requires exact tool and canonical rule markers without interpreting user text', () => {
  const item = { role: 'design', task: task() as TaskContract }; item.task.context.tools = ['read', 'write', 'edit']; item.task.context.rules = ['User brief mentions write-game-plan in ordinary prose.'];
  const execution = { capability: 'ordinary-design-execution/1', tasks: [item] };
  assert.equal(readPlanAuthoringPolicy(execution, {}, true), undefined);
  assert.throws(() => readPlanAuthoringPolicy(execution, { ordinaryPlanAuthoringPolicy: 'structured-plan/1' }, true), /policy/);
  item.task.context.tools.push('write-game-plan'); assert.throws(() => readPlanAuthoringPolicy(execution, {}, true), /policy/);
  item.task.context.rules.push(ORDINARY_PLAN_AUTHORING_RULE);
  const selected = { ...execution, ordinaryPlanAuthoringPolicy: 'structured-plan/1' }, planning = { ordinaryPlanAuthoringPolicy: 'structured-plan/1' };
  assert.equal(readPlanAuthoringPolicy(selected, planning, true), 'structured-plan/1');
  assert.throws(() => readPlanAuthoringPolicy(selected, planning, false), /policy/);
  assert.throws(() => readPlanAuthoringPolicy(selected, undefined, true), /policy/);
  assert.throws(() => readPlanAuthoringPolicy({ ...selected, ordinaryPlanAuthoringPolicy: 'future' }, planning, true), /policy/);
  assert.throws(() => requirePlanAuthoringTasks([{ ...item, role: 'coding' }], 'structured-plan/1'), /policy/);
  item.task.context.rules.pop(); assert.throws(() => readPlanAuthoringPolicy(selected, planning, true), /policy/);
  item.task.context.rules.push(ORDINARY_PLAN_AUTHORING_RULE); item.task.context.tools.pop(); assert.throws(() => readPlanAuthoringPolicy(selected, planning, true), /policy/);
  assert.throws(() => readPlanAuthoringPolicy(execution, {}, true), /policy/);
});
