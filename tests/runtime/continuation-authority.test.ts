import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { buildContinuationQuote } from '../../src/runtime/continuation-quote.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import { task as taskFixture } from '../contracts/fixtures.ts';

const start = Date.parse('2026-10-01T00:00:00.000Z');
const receipt = [{ artifactId: 'receipt', version: 'v1', location: 'evidence/receipt.json' }];
const request = (requestId: string, taskId: string, amount = 10) => ({ requestId, taskId, provider: 'offline', pricingVersion: 'v1', estimatedMaxCostMicroCny: amount });

async function fixture(t: test.TestContext, customize?: (task: ReturnType<typeof taskFixture>) => void) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-continuation-'));
  let time = start;
  const now = () => time;
  const controller = await RunController.create({ root, runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation', specVersion: 'spec-v1', scope: 'generation', limitMicroCny: 100, allocations: [{ taskId: 'source', amountMicroCny: 100 }], now });
  const task = taskFixture();
  Object.assign(task, { taskId: 'source', state: 'failed', stateReason: 'Offline failure', dependsOn: [] });
  task.evidence[0].taskId = 'source';
  task.budget.allocationMicroCny = 100;
  customize?.(task);
  await controller.saveTask(task as any, { role: 'system', actorId: 'runtime' });
  t.after(async () => { await controller.close().catch(() => {}); await rm(root, { recursive: true, force: true }); });
  return { root, controller, now, advance: (ms: number) => { time += ms; } };
}

async function proposal(root: string, now: () => number) {
  return buildContinuationQuote({ root, now: now(), additionalMicroCny: 50, additionalDurationMs: 60_000 });
}
async function confirm(root: string, quote: Awaited<ReturnType<typeof proposal>>, now: () => number, decisionId = 'decision-1') {
  const confirmation = { decisionId, actorId: 'offline-user', decidedAt: new Date(now()).toISOString(), source: { artifactId: 'user-continuation', version: decisionId, location: `${decisionId}.json` } };
  await writeFile(join(root, confirmation.source.location), JSON.stringify({ formatVersion: 'continuation-confirmation-1', decisionId, actorId: confirmation.actorId, decidedAt: confirmation.decidedAt, confirmed: true, quote }), 'utf8');
  return confirmation;
}
async function stopped(t: test.TestContext) {
  const f = await fixture(t);
  await f.controller.reserve(request('original-paid', 'source', 30));
  await f.controller.admit('original-paid');
  await f.controller.settle('original-paid', 30, receipt);
  await f.controller.stop('用户决定前保持停止');
  const original = await f.controller.read();
  await f.controller.close();
  const quote = await proposal(f.root, f.now), confirmation = await confirm(f.root, quote, f.now);
  return { ...f, original, quote, confirmation };
}
function draft(original: any, grant: any) {
  const value = structuredClone(original.tasks.find((task: any) => task.taskId === grant.sourceTaskId));
  Object.assign(value, { taskId: grant.taskId, authorId: `${grant.taskId}-author`, state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [] });
  value.context.contextId = `${grant.taskId}-context`;
  value.budget.allocationMicroCny = grant.amountMicroCny;
  value.review = { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] };
  return value;
}

test('one exact confirmation atomically keeps history, closes old grants and records an idempotent window', async t => {
  const f = await stopped(t);
  const window = await RunController.activateContinuation(f);
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  validateSnapshot(state);
  assert.equal(state.formatVersion, 2);
  assert.equal(state.revision, f.original.revision + 1);
  assert.deepEqual(state.stopReason, f.original.stopReason);
  assert.deepEqual(state.tasks, f.original.tasks);
  assert.deepEqual(state.requests, f.original.requests);
  assert.deepEqual(state.events.slice(0, -1), f.original.events);
  assert.deepEqual(state.ledger.entries, f.original.ledger.entries);
  assert.equal(state.ledger.limitMicroCny, 100);
  assert.equal(state.run.originalStartedAt, f.original.run.originalStartedAt);
  assert.equal(state.run.originalDeadlineAt, f.original.run.originalDeadlineAt);
  assert.equal(state.run.fees.settledMicroCny, 30);
  assert.equal(state.run.state, 'waiting_user');
  assert.deepEqual(state.ledger.allocationClosures, [{ taskId: 'source', decisionId: 'decision-1', releasedMicroCny: 70 }]);
  const bytes = await readFile(join(f.root, 'snapshot.json'));
  f.advance(90_000);
  assert.deepEqual(await RunController.activateContinuation(f), window);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), bytes);
  assert.equal(f.controller.signal.aborted, true);
  await assert.rejects(f.controller.reserve(request('old-instance', 'source')), /closed/i);
  await assert.rejects(RunController.open({ root: f.root, now: f.now }), /window|continuation/i);
});

test('explicit window refuses unregistered and old tasks, then admits only its quoted new task until its own deadline', async t => {
  const f = await stopped(t), window = await RunController.activateContinuation(f);
  const active = await RunController.open({ root: f.root, now: f.now, windowId: window.windowId });
  t.after(() => active.close());
  assert.equal(active.signal.aborted, false);
  assert.equal((await active.executionAuthority('source')).admissionAllowed, false);
  await assert.rejects(active.reserve(request('unregistered', window.grants[0].taskId)), /registered|authority/i);
  await assert.rejects(active.prepareOwnedChild(), /task|window|authority/i);
  await assert.rejects(active.prepareOwnedChild({ taskId: 'source', windowId: window.windowId }), /authority|closed|grant/i);
  const task = draft(f.original, window.grants[0]);
  await assert.rejects(active.registerTasks([{ ...task, objective: 'unapproved different work' }]), /source|quote|objective/i);
  await active.registerTasks([task]);
  const authority = await active.executionAuthority(task.taskId);
  assert.equal(authority.windowId, window.windowId);
  assert.equal(authority.taskGrantMicroCny, 120);
  assert.equal(authority.effectiveLimitMicroCny, 150);
  assert.equal(authority.admissionAllowed, true);
  await assert.rejects(active.admit('original-paid'), /window|authority|closed/i);
  await active.reserve(request('new-paid', task.taskId, 20));
  await active.admit('new-paid');
  await active.settle('new-paid', 20, receipt);
  assert.equal((await active.read()).requests.at(-1)?.windowId, window.windowId);
  const changed = structuredClone(task); changed.attempts = [...f.original.tasks[0].attempts, { ...f.original.tasks[0].attempts[0], attemptId: 'second' }];
  await assert.rejects(active.saveTask(changed, { role: 'system', actorId: 'runtime' }), /attempt/i);
  f.advance(60_000);
  await assert.rejects(active.reserve(request('too-late', task.taskId)), /deadline|stopped/i);
  const final = await active.read();
  assert.equal(final.continuation?.windows[0].stopReason?.code, 'deadline');
  assert.deepEqual(final.stopReason, f.original.stopReason);
  assert.equal(final.run.fees.settledMicroCny, 50);
  assert.deepEqual(final.tasks[0], f.original.tasks[0]);
  assert.equal(active.signal.aborted, true);
  await active.close();
  const reopened = await RunController.open({ root: f.root, now: f.now, windowId: window.windowId });
  try { assert.equal(reopened.signal.aborted, true); await assert.rejects(reopened.reserve(request('retry', task.taskId)), /stopped|deadline/i); }
  finally { await reopened.close(); }
});

test('stale quote or altered confirmation does not mutate the original stopped snapshot', async t => {
  const f = await stopped(t), before = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(RunController.activateContinuation({ ...f, confirmation: { ...f.confirmation, actorId: 'forged' } }), /confirmation/i);
  const forged = structuredClone(f.quote); forged.proposed.grants[0].amountMicroCny++;
  const confirmation = await confirm(f.root, forged, f.now, 'forged-quote');
  await assert.rejects(RunController.activateContinuation({ ...f, quote: forged, confirmation }), /quote/i);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  const controller = await RunController.open({ root: f.root, now: f.now });
  await controller.importSettled({ requestId: 'late-receipt', taskId: 'source', provider: 'offline', pricingVersion: 'v1', actualCostMicroCny: 1, evidence: receipt });
  await controller.close();
  await assert.rejects(RunController.activateContinuation(f), /quote/i);
});

test('activation cannot bypass the current owner, even for a stopped original controller', async t => {
  const { controller, root, now } = await fixture(t);
  await controller.stop('等待用户确认续跑');
  await assert.rejects(async () => RunController.activateContinuation({ root, now, quote: {} as any, confirmation: {} as any }), /owner/i);
  assert.equal(controller.signal.aborted, true);
});

test('concurrent activations commit one authorization and retries never reset its clock', async t => {
  const f = await stopped(t);
  const results = await Promise.allSettled([RunController.activateContinuation(f), RunController.activateContinuation(f)]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  const first = results.find(item => item.status === 'fulfilled')!;
  f.advance(20_000);
  assert.deepEqual(await RunController.activateContinuation(f), (first as PromiseFulfilledResult<any>).value);
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.ledger.authorizations.length, 1);
  assert.equal(state.ledger.allocationClosures.length, 1);
  assert.equal(state.events.filter((item: any) => item.type === 'continuation_activated').length, 1);
});

test('expired original without a persisted stop records that stop in the same activation', async t => {
  const f = await fixture(t);
  const original = await f.controller.read();
  await f.controller.close();
  f.advance(12 * 60 * 60 * 1000);
  const quote = await proposal(f.root, f.now), confirmation = await confirm(f.root, quote, f.now);
  assert.equal(quote.basis.stopReason, null);
  await RunController.activateContinuation({ ...f, quote, confirmation });
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.revision, original.revision + 1);
  assert.equal(state.stopReason.code, 'deadline');
  assert.equal(state.run.originalDeadlineAt, original.run.originalDeadlineAt);
  assert.deepEqual(state.events.slice(0, -2), original.events);
  assert.equal(state.events.at(-2).type, 'stopped');
});

test('unknown charges, running source attempts and validation runs cannot receive continuation authority', async t => {
  for (const scenario of ['unknown', 'running', 'validation'] as const) {
    await t.test(scenario, async t => {
      const f = await fixture(t, task => {
        if (scenario === 'running') { task.state = 'running'; task.stateReason = null; task.attempts[0].outcome = 'running'; task.attempts[0].endedAt = null as any; }
      });
      if (scenario === 'unknown') { await f.controller.reserve(request('unresolved', 'source')); await f.controller.admit('unresolved'); }
      await f.controller.stop('stop'); await f.controller.close();
      const path = join(f.root, 'snapshot.json');
      let quote: any;
      if (scenario === 'unknown') {
        await assert.rejects(proposal(f.root, f.now), /未知|预留/);
        quote = { requested: { additionalMicroCny: 50, additionalDurationMs: 60_000 } };
      } else quote = await proposal(f.root, f.now);
      if (scenario === 'validation') {
        const snapshot = JSON.parse(await readFile(path, 'utf8'));
        snapshot.run.kind = 'evaluation'; snapshot.ledger.scope = 'validation'; snapshot.tasks.forEach((task: any) => { task.kind = 'evaluation'; });
        await writeFile(path, JSON.stringify(snapshot), 'utf8');
      }
      const before = await readFile(path), confirmation = await confirm(f.root, quote, f.now);
      await assert.rejects(RunController.activateContinuation({ ...f, quote, confirmation }), /unknown|running|generation/i);
      assert.deepEqual(await readFile(path), before);
    });
  }
});

test('a fully settled cancelled source may authorize a fresh attempt while artifact reuse stays pending', async t => {
  const f = await fixture(t, task => { task.state = 'cancelled'; task.artifacts = []; task.evidence = []; task.attempts[0].outcome = 'cancelled'; });
  await f.controller.stop('cancelled'); await f.controller.close();
  const quote = await proposal(f.root, f.now), confirmation = await confirm(f.root, quote, f.now);
  assert.equal(quote.blockers.some(item => item.code === 'source_evidence_missing'), true);
  const window = await RunController.activateContinuation({ ...f, quote, confirmation });
  assert.equal(window.verification.artifactReuse, 'pending_task_validation');
  const active = await RunController.open({ root: f.root, windowId: window.windowId, now: f.now });
  try { await assert.rejects(active.reserve(request('missing-contract', window.grants[0].taskId)), /registered|authority/i); }
  finally { await active.close(); }
});

test('new window overcharge remains a billing fact and does not overwrite original stop or costs', async t => {
  const f = await stopped(t), window = await RunController.activateContinuation(f);
  const active = await RunController.open({ root: f.root, windowId: window.windowId, now: f.now });
  const task = draft(f.original, window.grants[0]);
  try {
    await active.registerTasks([task]);
    await active.reserve(request('overcharge', task.taskId, 10)); await active.admit('overcharge');
    assert.deepEqual(await active.settle('overcharge', 200, receipt), { halted: true });
    const state = await active.read();
    assert.equal(state.run.fees.settledMicroCny, 230);
    assert.deepEqual(state.stopReason, f.original.stopReason);
    assert.equal(state.continuation?.windows[0].stopReason?.code, 'charge_overrun');
    await assert.rejects(active.reserve(request('after-overcharge', task.taskId)), /stopped/i);
  } finally { await active.close(); }
  const reopened = await RunController.open({ root: f.root, windowId: window.windowId, now: f.now });
  try { assert.equal((await reopened.read()).run.fees.settledMicroCny, 230); assert.equal(reopened.signal.aborted, true); }
  finally { await reopened.close(); }
});

test('hard stop retains window request ownership for unknown-cost reconciliation', async t => {
  const f = await stopped(t), window = await RunController.activateContinuation(f);
  const active = await RunController.open({ root: f.root, windowId: window.windowId, now: f.now });
  const task = draft(f.original, window.grants[0]);
  try {
    await active.registerTasks([task]);
    await active.reserve(request('inflight', task.taskId)); await active.admit('inflight');
    await active.reserve(request('queued', task.taskId));
    await active.stop('window cancelled');
    const stopped = await active.read();
    assert.equal(stopped.ledger.entries.find(item => item.requestId === 'inflight')?.status, 'unknown');
    assert.equal(stopped.ledger.entries.find(item => item.requestId === 'queued')?.status, 'cancelled');
    assert.equal(stopped.requests.find(item => item.requestId === 'inflight')?.windowId, window.windowId);
    await active.settle('inflight', 8, receipt);
    assert.equal((await active.read()).run.fees.settledMicroCny, 38);
    await assert.rejects(active.admit('queued'), /stopped/i);
  } finally { await active.close(); }
});

for (const boundary of ['before', 'after'] as const) test(`process exit ${boundary} authorization commit retains one complete snapshot and clock`, async t => {
  const f = await stopped(t), before = await readFile(join(f.root, 'snapshot.json'));
  const source = `import {readFile} from 'node:fs/promises';
import {RunController} from ${JSON.stringify(new URL('../../src/runtime/run.ts', import.meta.url).href)};
import {SnapshotStore} from ${JSON.stringify(new URL('../../src/runtime/store.ts', import.meta.url).href)};
const receipt=JSON.parse(await readFile(process.argv[1]+'/decision-1.json','utf8'));
const confirmation={decisionId:receipt.decisionId,actorId:receipt.actorId,decidedAt:receipt.decidedAt,source:{artifactId:'user-continuation',version:'decision-1',location:'decision-1.json'}};
const original=SnapshotStore.prototype.write;
SnapshotStore.prototype.write=async function(value){if(process.argv[2]==='before')process.exit(23);await original.call(this,value);process.exit(23);};
await RunController.activateContinuation({root:process.argv[1],quote:receipt.quote,confirmation,now:()=>${start}});`;
  const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source, f.root, boundary], { stdio: 'ignore', windowsHide: true, env: { SYSTEMROOT: process.env.SYSTEMROOT } });
  assert.equal((await once(child, 'close'))[0], 23);
  await assert.rejects(RunController.activateContinuation(f), /owner/i);
  const committed = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  if (boundary === 'before') assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  else assert.equal(committed.formatVersion, 2);
  await SnapshotStore.recover(f.root);
  f.advance(20_000);
  const window = await RunController.activateContinuation(f);
  assert.equal(window.startedAt, new Date(start + (boundary === 'before' ? 20_000 : 0)).toISOString());
  assert.equal(window.deadlineAt, new Date(start + (boundary === 'before' ? 80_000 : 60_000)).toISOString());
  assert.equal(JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')).ledger.authorizations.length, 1);
});

test('old children and unresolved spawn intents keep ownership and block continuation', async t => {
  const f = await fixture(t), ticket = await f.controller.prepareOwnedChild();
  await f.controller.stop('stop before child registration');
  await assert.rejects(f.controller.close(), /unresolved/i);
  await assert.rejects(RunController.activateContinuation({ root: f.root, now: f.now, quote: {} as any, confirmation: {} as any }), /owner/i);
  assert.ok(ticket);
});

test('child registration at an expired window records ownership but cannot authorize release of its startup barrier', async t => {
  const f = await stopped(t), window = await RunController.activateContinuation(f);
  const active = await RunController.open({ root: f.root, windowId: window.windowId, now: f.now });
  const task = draft(f.original, window.grants[0]);
  await active.registerTasks([task]);
  const ticket = await active.prepareOwnedChild({ taskId: task.taskId, windowId: window.windowId });
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true, env: { SYSTEMROOT: process.env.SYSTEMROOT } });
  const exited = once(child, 'exit');
  try {
    f.advance(60_000);
    await assert.rejects(active.registerOwnedChild(child.pid!, ticket), /stopped|deadline/i);
    await assert.rejects(active.close(), /alive/i);
    await assert.rejects(RunController.activateContinuation(f), /owner/i);
  } finally {
    child.kill(); await exited; await active.close();
  }
});

test('stopped window can finish cancelling its active attempt without authorizing another attempt', async t => {
  const f = await stopped(t), window = await RunController.activateContinuation(f);
  const active = await RunController.open({ root: f.root, windowId: window.windowId, now: f.now });
  const task = draft(f.original, window.grants[0]);
  try {
    await active.registerTasks([task]);
    task.state = 'ready'; await active.saveTask(task, { role: 'system', actorId: 'runtime' });
    task.state = 'running'; task.attempts = [{ attemptId: 'new-attempt', sessionRef: 'new-session', startedAt: new Date(f.now()).toISOString(), endedAt: null, outcome: 'running', failure: null }];
    await active.saveTask(task, { role: 'system', actorId: 'runtime' });
    await active.stop('cancel new window');
    task.state = 'cancelled'; task.stateReason = 'cancel new window'; task.attempts[0].outcome = 'cancelled'; task.attempts[0].endedAt = new Date(f.now()).toISOString();
    await active.saveTask(task, { role: 'system', actorId: 'runtime' });
    assert.equal((await active.read()).tasks.at(-1)?.attempts[0].outcome, 'cancelled');
    await assert.rejects(active.reserve(request('after-cancel', task.taskId)), /stopped/i);
  } finally { await active.close(); }
});

test('snapshot format, original stop, request window and authorization facts reject incompatible mutations', async t => {
  const f = await stopped(t), window = await RunController.activateContinuation(f);
  const active = await RunController.open({ root: f.root, windowId: window.windowId, now: f.now });
  const task = draft(f.original, window.grants[0]);
  await active.registerTasks([task]);
  await active.reserve(request('window-request', task.taskId));
  const original = await active.read(); await active.close();
  for (const change of [
    (state: any) => { state.formatVersion = 1; },
    (state: any) => { state.stopReason = { ...state.stopReason, reason: 'rewritten original stop' }; },
    (state: any) => { state.continuation.windows[0].deadlineAt = new Date(start + 120_000).toISOString(); },
    (state: any) => { delete state.requests.at(-1).windowId; },
    (state: any) => { state.requests[0].windowId = window.windowId; },
    (state: any) => { state.ledger.allocationClosures[0].releasedMicroCny++; },
    (state: any) => { state.continuation.windows[0].grants[0].sourceTaskId = 'invented-source'; },
    (state: any) => { state.tasks.pop(); },
  ]) {
    const state = structuredClone(original); change(state);
    assert.throws(() => validateSnapshot(state));
  }
});
