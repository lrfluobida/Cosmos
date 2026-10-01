import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { createRoleBudget, reconcileRoleReceipt } from '../../src/roles/provider-budget.ts';
import * as module from '../../src/runtime/intake.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
const start = Date.parse('2026-10-01T00:00:00.000Z');
const evidence = [{ artifactId: 'bill', version: 'v1', location: 'billing.json' }];
const request = (requestId: string, amount = 100) => ({ requestId, taskId: 'intake', provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: amount });
const draft = (brief = '点击星星得分') => ({ brief, questions: [{ id: 'goal', prompt: '怎样获胜？' }], answers: { goal: '得一分获胜' },
  acceptance: [{ acceptanceId: 'win', description: '点击得分', steps: ['点击星星'], expected: '得分 1', evidenceKinds: ['test_report'] }],
  scenario: { viewport: { width: 1280, height: 720 }, steps: [
    { id: 'click', kind: 'locator-click', selector: '#star', timeoutMs: 1000 },
    { id: 'score', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#score' }, expected: '得分 1', timeoutMs: 1000 },
  ] }, unsupported: [] });

async function fixture(t: test.TestContext, overrides = {}) {
  assert.equal(typeof module.IntakeController, 'function', 'IntakeController must expose the paid intake phase');
  const root = await mkdtemp(join(tmpdir(), 'cosmos-intake-'));
  let time = start;
  const options = { root, runId: 'game-1', ledgerId: 'game-1-budget', specVersion: '1.0', limitMicroCny: 1000,
    allocations: [{ taskId: 'intake', amountMicroCny: 400 }, { taskId: 'planning', amountMicroCny: 100 }],
    interviewTaskId: 'intake', maxRequests: 4, durationMs: 43_200_000, now: () => time, ...overrides };
  const controller = await module.IntakeController.create(options);
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  return { root, controller, options, setTime: (at: number) => { time = at; } };
}

async function confirm(controller: any) {
  const saved = await controller.saveDraft(draft());
  return controller.confirm({ revision: saved.revision, confirmed: true, actorId: 'local-user', at: new Date(start).toISOString() });
}
const ready = { environmentReady: true, executionReady: true };

test('activation keeps the single ledger, admissions and fees and starts the formal clock only once', async t => {
  const { root, controller, setTime } = await fixture(t);
  await controller.reserve(request('first')); await controller.admit('first'); await controller.settle('first', 50, evidence);
  await confirm(controller);
  const before = await controller.read();
  assert.equal(before.run.originalDeadlineAt, undefined);
  setTime(start + 90_000);
  const active = await controller.activateGeneration(ready);
  assert.deepEqual(active.ledger, before.ledger); assert.deepEqual(active.requests, before.requests);
  assert.deepEqual(active.events.slice(0, before.events.length), before.events);
  assert.equal(active.run.runId, 'game-1'); assert.equal(active.run.fees.settledMicroCny, 50);
  assert.equal(active.run.originalStartedAt, new Date(start + 90_000).toISOString());
  assert.equal(active.run.originalDeadlineAt, new Date(start + 90_000 + 43_200_000).toISOString());
  setTime(start + 180_000);
  assert.deepEqual(await controller.activateGeneration(ready), active);
  await controller.close();
  const opened = await RunController.open({ root, now: () => start + 180_000 });
  try { assert.deepEqual(await opened.read(), active); } finally { await opened.close(); }
  await assert.rejects(module.IntakeController.open({ root }), /already activated|intake/i);
});

test('activation rejects missing confirmation, missing host prerequisites and stale draft confirmation', async t => {
  const { controller } = await fixture(t);
  await assert.rejects(controller.activateGeneration(ready), /confirm/i);
  await confirm(controller);
  await assert.rejects(controller.activateGeneration({ ...ready, environmentReady: false }), /environment/i);
  await assert.rejects(controller.activateGeneration({ ...ready, executionReady: false }), /execution/i);
  const next = await controller.saveDraft(draft('点击月亮得分'));
  await assert.rejects(controller.confirm({ revision: next.revision - 1, confirmed: true, actorId: 'local-user', at: new Date(start).toISOString() }), /revision/i);
  await assert.rejects(controller.activateGeneration(ready), /confirm/i);
  assert.equal((await controller.read()).confirmation, null);
});

test('draft sources and actual confirmation persist exact Chinese bytes and remain immutable', async t => {
  const { root, controller } = await fixture(t);
  const requirement = await confirm(controller);
  assert.equal(requirement.confirmedBy, 'local-user');
  const source = requirement.sources.find((ref: any) => ref.artifactId === 'requirement-draft');
  const persisted = JSON.parse(await readFile(join(root, source.location), 'utf8'));
  assert.equal(persisted.brief, '点击星星得分');
  const previous = await readFile(join(root, source.location), 'utf8');
  await controller.saveDraft(draft('另一个需求'));
  assert.equal(await readFile(join(root, source.location), 'utf8'), previous);
  assert.equal(requirement.sources.length, 2);
});

test('blank answers, unsupported host checks and non-explicit confirmation cannot start generation', async t => {
  const { controller } = await fixture(t);
  const missing = await controller.saveDraft({ ...draft(), answers: {} });
  await assert.rejects(controller.confirm({ revision: missing.revision, confirmed: true, actorId: 'user', at: new Date(start).toISOString() }), /answer/i);
  const supported = await controller.saveDraft(draft());
  await assert.rejects(controller.confirm({ revision: supported.revision, confirmed: false, actorId: 'user', at: new Date(start).toISOString() }), /explicit/i);
  const unsupported = await controller.saveDraft({ ...draft(), unsupported: ['需要尚未实现的键盘输入'] });
  await assert.rejects(controller.confirm({ revision: unsupported.revision, confirmed: true, actorId: 'user', at: new Date(start).toISOString() }), /unsupported/i);
});

for (const phase of ['reserved', 'admitted', 'unknown']) test(`activation refuses ${phase} exposure without resetting its cost`, async t => {
  const { controller } = await fixture(t);
  await confirm(controller); await controller.reserve(request('pending'));
  if (phase !== 'reserved') await controller.admit('pending');
  if (phase === 'unknown') await controller.markUnknown('pending', evidence);
  const before = await controller.read();
  await assert.rejects(controller.activateGeneration(ready), /outstanding|unknown/i);
  assert.deepEqual(await controller.read(), before);
});

test('intake reopen preserves request limit and retains admitted unknown charges for receipt reconciliation', async t => {
  const { controller, root, options } = await fixture(t, { maxRequests: 1 });
  const billing = createRoleBudget({ controller, taskId: 'intake', evidenceDirectory: join(root, 'receipts') });
  await billing.beforeRequest({ requestId: 'lost', modelId: 'deepseek-flash', maxOutputTokens: 2, inputBytes: 10, hasImages: false, estimatedMaxCostMicroCny: 100 });
  await controller.close();
  const reopened = await module.IntakeController.open({ root, now: options.now });
  try {
    assert.equal((await reopened.read()).ledger.entries[0].status, 'unknown');
    assert.equal((await reconcileRoleReceipt({ controller: reopened, requestId: 'lost', evidenceDirectory: join(root, 'receipts') })).status, 'pending');
    await assert.rejects(reopened.reserve(request('retry')), /limit|reconcil/i);
    await reopened.settle('lost', 20, evidence);
    await assert.rejects(reopened.reserve(request('second')), /limit/i);
  } finally { await reopened.close(); }
});

test('native billing receipt settles intake and survives transition without a second accounting path', async t => {
  const { controller, root } = await fixture(t);
  const billing = createRoleBudget({ controller, taskId: 'intake', evidenceDirectory: join(root, 'receipts') });
  await billing.beforeRequest({ requestId: 'paid', modelId: 'deepseek-flash', maxOutputTokens: 2, inputBytes: 10, hasImages: false, estimatedMaxCostMicroCny: 100 });
  await billing.afterResponse({ requestId: 'paid', outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
    usage: { input: 4, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 6, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
  await confirm(controller);
  assert.equal((await controller.activateGeneration(ready)).run.fees.settledMicroCny, 24);
  assert.equal(JSON.parse(await readFile(join(root, 'receipts', 'billing-paid.json'), 'utf8')).ledgerId, 'game-1-budget');
});

test('concurrent intake reservations cannot oversell and concurrent activation cannot reset timing', async t => {
  const { controller } = await fixture(t);
  const attempted = await Promise.allSettled([controller.reserve(request('a', 250)), controller.reserve(request('b', 250))]);
  assert.equal(attempted.filter(result => result.status === 'fulfilled').length, 1);
  const entry = (await controller.read()).ledger.entries[0]; await controller.cancel(entry.requestId, evidence);
  await confirm(controller);
  const [first, second] = await Promise.all([controller.activateGeneration(ready), controller.activateGeneration(ready)]);
  assert.deepEqual(first, second);
  assert.equal(first.events.filter((event: any) => event.type === 'generation_activated').length, 1);
});

test('manual stop remains durable and paid overrun is retained rather than discarded', async t => {
  const { controller, root, options } = await fixture(t);
  await controller.reserve(request('sent')); await controller.admit('sent');
  await controller.stop('user stopped intake');
  assert.equal((await controller.read()).ledger.entries[0].status, 'unknown');
  await controller.settle('sent', 120, evidence);
  await controller.close();
  const reopened = await module.IntakeController.open({ root, now: options.now });
  try {
    assert.equal((await reopened.read()).stopReason.code, 'charge_overrun');
    assert.equal((await reopened.read()).ledger.entries[0].settledMicroCny, 120);
    await assert.rejects(reopened.activateGeneration(ready), /stopped/i);
  } finally { await reopened.close(); }
});

test('existing v1 runs cannot acquire a new intake phase or reset their original deadline', async t => {
  assert.equal(typeof module.IntakeController, 'function');
  const root = await mkdtemp(join(tmpdir(), 'cosmos-old-run-'));
  const old = await RunController.create({ root, runId: 'old', ledgerId: 'old', kind: 'evaluation', specVersion: '1.0', scope: 'validation', allocations: [{ taskId: 'model', amountMicroCny: 100 }], now: () => start });
  await old.close();
  try {
    const before = await readFile(join(root, 'snapshot.json'), 'utf8');
    await assert.rejects(module.IntakeController.open({ root }), /already activated|intake/i);
    await assert.rejects(module.IntakeController.create({ root, runId: 'new', ledgerId: 'new', specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 1, allocations: [{ taskId: 'intake', amountMicroCny: 100 }] }), /exist/i);
    assert.equal(await readFile(join(root, 'snapshot.json'), 'utf8'), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('uncommitted temporary snapshot cannot replace the original intake or authorize generation', async t => {
  const { controller, root, options } = await fixture(t);
  await confirm(controller); const before = await controller.read(); await controller.close();
  await writeFile(join(root, '.snapshot-crash.tmp'), '{"formatVersion":1', 'utf8');
  const reopened = await module.IntakeController.open({ root, now: options.now });
  try { assert.deepEqual(await reopened.read(), before); } finally { await reopened.close(); }
});

for (const boundary of ['before', 'after']) test(`process exit ${boundary} activation preserves one ledger and one possible formal origin`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-activation-crash-'));
  let controller: any;
  t.after(async () => { await controller?.close(); await rm(root, { recursive: true, force: true }); });
  const source = `import {IntakeController} from ${JSON.stringify(new URL('../../src/runtime/intake.ts', import.meta.url).href)};
import {SnapshotStore} from ${JSON.stringify(new URL('../../src/runtime/store.ts', import.meta.url).href)};
const run=await IntakeController.create({root:process.argv[1],runId:'original',ledgerId:'same-ledger',specVersion:'1.0',interviewTaskId:'intake',maxRequests:3,allocations:[{taskId:'intake',amountMicroCny:100}],now:()=>${start}});
await run.reserve(${JSON.stringify(request('one', 50))});await run.admit('one');await run.settle('one',25,${JSON.stringify(evidence)});
const draft=await run.saveDraft(${JSON.stringify(draft())});await run.confirm({revision:draft.revision,confirmed:true,actorId:'user',at:${JSON.stringify(new Date(start).toISOString())}});
const write=SnapshotStore.prototype.write;
SnapshotStore.prototype.write=async function(value){if(process.argv[2]==='before')process.exit(23);await write.call(this,value);process.exit(23);};
await run.activateGeneration({environmentReady:true,executionReady:true});`;
  const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source, root, boundary], { stdio: 'ignore', windowsHide: true, env: { SYSTEMROOT: process.env.SYSTEMROOT } });
  assert.equal((await once(child, 'close'))[0], 23);
  await SnapshotStore.recover(root);
  if (boundary === 'before') {
    controller = await module.IntakeController.open({ root, now: () => start + 1000 });
    assert.equal((await controller.read()).run.originalStartedAt, undefined);
    await controller.activateGeneration(ready); await controller.close();
  } else await assert.rejects(module.IntakeController.open({ root }), /activated|intake/i);
  controller = await RunController.open({ root, now: () => start + 2000 });
  const state = await controller.read();
  assert.equal(state.run.runId, 'original'); assert.equal(state.ledger.ledgerId, 'same-ledger');
  assert.equal(state.ledger.entries.length, 1); assert.equal(state.run.fees.settledMicroCny, 25);
  assert.equal(state.requests[0].requestId, 'one');
  assert.equal(state.run.originalStartedAt, new Date(start + (boundary === 'before' ? 1000 : 0)).toISOString());
  assert.equal(state.events.filter((event: any) => event.type === 'generation_activated').length, 1);
});
