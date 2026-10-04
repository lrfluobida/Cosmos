import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { IntakeController } from '../../src/runtime/intake.ts';
import { RunController } from '../../src/runtime/run.ts';
import { createBrowserHost, createProductHost } from '../../src/runtime/entrypoint-host.ts';
import { validateGameDraft } from '../../src/roles/requirements.ts';

const source = JSON.parse(await readFile(new URL('../../probes/transfer/requirements.json', import.meta.url), 'utf8'));
const start = Date.parse('2026-10-05T00:00:00.000Z');
const draft = () => ({ preparation: { kind: 'preparation', adapterId: 'cos16-input/1', sourceVersion: 'cos16-transfer-v1' }, brief: '中文单关鼠标推箱子', questions: [{ id: 'scope', prompt: '多少箱子？' }], answers: { scope: '两个箱子两个目标' }, acceptance: structuredClone(source.preparation.acceptance), unsupported: [] });
async function fixture(t: test.TestContext, selected = true) {
  const parent = await mkdtemp(join(tmpdir(), 'cos53-intake-')), root = join(parent, 'run');
  let now = start;
  const options = { root, runId: 'synthetic-original', ledgerId: 'same-ledger', specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 4, durationMs: 43_200_000, now: () => now, allocations: [{ taskId: 'intake', amountMicroCny: 1000 }], ...(selected ? { draftMode: 'cos16-input/1' } : {}) };
  t.after(() => rm(parent, { recursive: true, force: true }));
  return { root, options, setTime(value: number) { now = value; } };
}

test('unknown mode is refused before creating the run directory or ledger', async t => {
  const { root, options } = await fixture(t);
  await assert.rejects(IntakeController.create({ ...options, draftMode: 'unknown' } as any), /mode/i);
  await assert.rejects(access(root), { code: 'ENOENT' });
});

test('selected mode persists before the first draft and cold resume retains exact source bytes and one ledger/clock', async t => {
  const { root, options, setTime } = await fixture(t);
  let controller = await IntakeController.create(options as any);
  try {
    const empty = await controller.read();
    assert.deepEqual((empty as any).draftMode, { kind: 'preparation', adapterId: 'cos16-input/1', sourceVersion: 'cos16-transfer-v1' });
    assert.equal(empty.draft, null);
    await controller.reserve({ requestId: 'synthetic-paid', taskId: 'intake', provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: 100 });
    await controller.admit('synthetic-paid'); await controller.settle('synthetic-paid', 20, [{ artifactId: 'synthetic-bill', version: 'v1', location: 'synthetic-bill.json' }]);
    const saved = await controller.saveDraft(draft() as any), bytes = await readFile(join(root, saved.source.location));
    await controller.close(); controller = await IntakeController.open({ root, now: options.now });
    assert.deepEqual((await controller.read()).draft, saved);
    assert.deepEqual(await readFile(join(root, saved.source.location)), bytes);
    await assert.rejects(controller.confirm({ revision: 1, confirmed: false, actorId: 'synthetic-stdin', at: new Date(start).toISOString() }), /explicit/i);
    await controller.confirm({ revision: 1, confirmed: true, actorId: 'synthetic-stdin', at: new Date(start).toISOString() });
    const before = await controller.read(); setTime(start + 1000);
    const first = await controller.activateGeneration({ environmentReady: true, executionReady: true });
    assert.deepEqual(first.ledger, before.ledger); assert.equal(first.run.fees.settledMicroCny, 20);
    assert.equal(first.run.originalDeadlineAt, new Date(start + 1000 + 43_200_000).toISOString());
    setTime(start + 2000); assert.deepEqual(await controller.activateGeneration({ environmentReady: true, executionReady: true }), first);
    await controller.close();
    const run = await RunController.open({ root, now: options.now });
    try { assert.deepEqual(await run.read(), first); } finally { await run.close(); }
  } finally { await controller.close(); }
});

test('legacy intake cannot acquire preparation from a model draft or mutated snapshot metadata', async t => {
  const { root, options } = await fixture(t, false);
  const controller = await IntakeController.create(options);
  const bytes = await readFile(join(root, 'snapshot.json'));
  await assert.rejects(controller.saveDraft(draft() as any), /mode|fields|browser/i);
  assert.deepEqual(await readFile(join(root, 'snapshot.json')), bytes);
  await controller.close();
  const changed = JSON.parse(bytes.toString('utf8')); changed.draftMode = { kind: 'preparation', adapterId: 'cos16-input/1', sourceVersion: 'cos16-transfer-v1' };
  await writeFile(join(root, 'snapshot.json'), JSON.stringify(changed), 'utf8');
  await assert.rejects(IntakeController.open({ root }), /mode|origin/i);
});

test('default and explicit browser intake serialize the original bytes without mode metadata or a new receipt', async t => {
  const { root, options } = await fixture(t, false), secondRoot = join(root, 'explicit-browser');
  const controller = await IntakeController.create(options), explicit = await IntakeController.create({ ...options, root: secondRoot, draftMode: 'browser' });
  try {
    const old = await readFile(join(root, 'snapshot.json'));
    assert.deepEqual(await readFile(join(secondRoot, 'snapshot.json')), old);
    assert.equal(JSON.parse(old.toString('utf8')).draftMode, undefined);
    await assert.rejects(access(join(root, 'intake-mode.json')), { code: 'ENOENT' });
    await assert.rejects(access(join(secondRoot, 'intake-mode.json')), { code: 'ENOENT' });
  } finally { await explicit.close(); await controller.close(); }
});

test('preparation source version changes, unsupported scope and unknown charges block confirmation/activation', async t => {
  const { root, options } = await fixture(t);
  const controller = await IntakeController.create(options as any);
  try {
    await assert.rejects(controller.saveDraft({ ...draft(), preparation: { ...draft().preparation, sourceVersion: 'new' } } as any), /version|mode|preparation/i);
    const unsupported = await controller.saveDraft({ ...draft(), unsupported: ['用户还要求战斗和多关卡，当前模式不支持。'] } as any);
    await assert.rejects(controller.confirm({ revision: unsupported.revision, confirmed: true, actorId: 'synthetic-stdin', at: new Date(start).toISOString() }), /unsupported/i);
    const valid = await controller.saveDraft(draft() as any);
    await controller.confirm({ revision: valid.revision, confirmed: true, actorId: 'synthetic-stdin', at: new Date(start).toISOString() });
    await controller.reserve({ requestId: 'unknown', taskId: 'intake', provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: 100 }); await controller.admit('unknown');
    const before = await controller.read();
    await assert.rejects(controller.activateGeneration({ environmentReady: true, executionReady: true }), /outstanding|unknown/i);
    assert.deepEqual(await controller.read(), before);
    await writeFile(join(root, valid.source.location), JSON.stringify({ ...draft(), brief: '篡改用户需求' }), 'utf8');
    await assert.rejects(controller.confirm({ revision: valid.revision, confirmed: true, actorId: 'another', at: new Date(start).toISOString() }), /already|changed/i);
  } finally { await controller.close(); }
});

test('ordinary browser host refuses disconnected preparation before accessing runtime authority', async () => {
  let dispatch = 0;
  await assert.rejects(createBrowserHost({ draft: draft(), controller: { requireExecutionWindow() { dispatch++; } } } as any), /preparation|browser|mode/i);
  assert.equal(dispatch, 0);
});

test('changed preparation origin or draft bytes cannot be reused for save, native read or cold resume', async t => {
  const { root, options } = await fixture(t);
  const controller = await IntakeController.create(options as any);
  const saved = await controller.saveDraft(draft() as any), original = await readFile(join(root, 'intake-mode.json'));
  try {
    await writeFile(join(root, 'intake-mode.json'), JSON.stringify({ runId: options.runId, createdAt: new Date(start).toISOString(), draftMode: { kind: 'preparation', adapterId: 'cos16-input/1', sourceVersion: 'changed' } }), 'utf8');
    await assert.rejects(controller.saveDraft(draft() as any), /mode|origin/i);
    await assert.rejects(controller.read(), /mode|origin/i);
    await writeFile(join(root, 'intake-mode.json'), original);
    await writeFile(join(root, saved.source.location), JSON.stringify({ ...draft(), answers: { scope: '篡改回答' } }), 'utf8');
  } finally { await controller.close(); }
  await assert.rejects(IntakeController.open({ root }), /source changed/i);
});

test('the existing product browser interviewer rejects preparation before any native session intent', async t => {
  const { root, options } = await fixture(t);
  const controller = await IntakeController.create(options as any), host = createProductHost(root);
  Object.defineProperty(controller, 'signal', { value: { throwIfAborted() { throw new Error('SYNTHETIC dispatch guard reached; native providers are disabled in this test.'); } } });
  try {
    const input = { controller, roundId: 'unconnected', brief: draft().brief };
    await assert.rejects(host.questions(input), /preparation|browser|mode/i);
    await assert.rejects(host.draft({ ...input, questions: draft().questions, answers: draft().answers }), /preparation|browser|mode/i);
    await assert.rejects(access(join(root, 'intake-sessions')), { code: 'ENOENT' });
    assert.deepEqual((await controller.read()).ledger.entries, []);
  } finally { await controller.close(); }
});

const invalidPreparationQuestions = [
  { id: 'scope', prompt: 'SYNTHETIC 确认范围', paths: { executable: ['right'] }, confirmedBy: 'model' },
  { id: 'scope', prompt: 'SYNTHETIC 确认范围', confirmedBy: 'model' },
  { id: 'scope', prompt: 'SYNTHETIC 确认范围', map: {} },
  { id: 'scope', prompt: 'SYNTHETIC 确认范围', solution: ['right'] },
  { id: 1, prompt: 'SYNTHETIC 确认范围' },
  { id: 'scope', prompt: null },
];

test('preparation questions reject hidden executable or authority fields and require string IDs/prompts', () => {
  for (const question of invalidPreparationQuestions) {
    assert.throws(() => validateGameDraft({ ...draft(), questions: [question] }, 'cos16-input/1'), /preparation question fields/i);
  }
  assert.doesNotThrow(() => validateGameDraft(draft(), 'cos16-input/1'));
});

test('SYNTHETIC hidden preparation question fields cannot persist a draft or authorize confirmation', async t => {
  const { root, options } = await fixture(t);
  const controller = await IntakeController.create(options as any), before = await readFile(join(root, 'snapshot.json'));
  try {
    for (const question of invalidPreparationQuestions) {
      await assert.rejects(controller.saveDraft({ ...draft(), questions: [question] } as any), /preparation question fields/i);
      await assert.rejects(controller.confirm({ revision: 1, confirmed: true, actorId: 'synthetic-stdin', at: new Date(start).toISOString() }), /current draft revision/i);
      assert.deepEqual(await readFile(join(root, 'snapshot.json')), before);
      await assert.rejects(access(join(root, 'requirements')), { code: 'ENOENT' });
    }
    const ordinary = await controller.saveDraft(draft() as any);
    const requirement = await controller.confirm({ revision: ordinary.revision, confirmed: true, actorId: 'synthetic-stdin', at: new Date(start).toISOString() });
    assert.equal(requirement.confirmedBy, 'synthetic-stdin');
    assert.deepEqual(JSON.parse(await readFile(join(root, ordinary.source.location), 'utf8')).questions, draft().questions);
  } finally { await controller.close(); }
});
