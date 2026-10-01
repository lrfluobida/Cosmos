import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { task as taskFixture } from '../contracts/fixtures.ts';

const receipt = [{ artifactId: 'receipt', version: 'v1', location: 'evidence/receipt.json' }];
const start = Date.parse('2026-10-01T00:00:00.000Z');
const request = (requestId: string, amount = 60, taskId = 'model') => ({ requestId, taskId, provider: 'fixture', pricingVersion: 'fixed-v1', estimatedMaxCostMicroCny: amount });

async function fixture(t: test.TestContext, limitMicroCny = 100) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-run-'));
  let time = start;
  const options = { root, runId: 'run-1', ledgerId: 'ledger-1', kind: 'evaluation' as const, specVersion: 'spec-1', scope: 'validation' as const, limitMicroCny, allocations: [{ taskId: 'model', amountMicroCny: limitMicroCny }], now: () => time };
  const controller = await RunController.create(options);
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  return { root, controller, options, setTime: (value: number) => { time = value; } };
}

test('concurrent reservations cannot oversell the shared budget', async t => {
  const { controller } = await fixture(t);
  const results = await Promise.allSettled([controller.reserve(request('one')), controller.reserve(request('two'))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const snapshot = await controller.read();
  assert.equal(snapshot.run.fees.reservedMicroCny, 60);
  assert.equal(snapshot.ledger.entries.length, 1);
});

test('80 percent emits one warning and all callers consume the same ledger', async t => {
  const { controller } = await fixture(t);
  await controller.reserve(request('one', 80));
  await controller.admit('one');
  await controller.settle('one', 80, receipt);
  await controller.reserve(request('retry', 20));
  await assert.rejects(controller.reserve(request('asset', 1)), /budget/i);
  assert.equal((await controller.read()).events.filter(e => e.type === 'budget_warning').length, 1);
});

test('unknown timeout retains exposure and blocks blind retry until reconciliation', async t => {
  const { controller } = await fixture(t);
  await controller.reserve(request('one'));
  await controller.admit('one');
  await controller.markUnknown('one', receipt);
  await assert.rejects(controller.reserve(request('retry', 1)), /reconcil/i);
  await assert.rejects(controller.cancel('one', receipt), /no.cost/i);
  assert.equal((await controller.read()).run.fees.reservedMicroCny, 60);
  await controller.settle('one', 50, receipt);
  await controller.reserve(request('retry', 50));
});

test('admission checks the exact deadline and stops outstanding work', async t => {
  const { controller, setTime } = await fixture(t);
  await controller.reserve(request('queued', 20));
  await controller.reserve(request('sent', 30));
  await controller.admit('sent');
  setTime(start + 12 * 60 * 60 * 1000);
  await assert.rejects(controller.admit('queued'), /deadline/i);
  const state = await controller.read();
  assert.equal(state.run.state, 'waiting_user');
  assert.equal(state.ledger.entries[0].status, 'cancelled');
  assert.equal(state.ledger.entries[1].status, 'unknown');
  assert.equal(state.run.fees.reservedMicroCny, 30);
  assert.equal(controller.signal.aborted, true);
});

test('reopening preserves fees, original times, request history and run identity', async t => {
  const { controller, root, options } = await fixture(t);
  await controller.reserve(request('one'));
  await controller.admit('one');
  await controller.settle('one', 45, receipt);
  const previous = await controller.read();
  await controller.close();
  const reopened = await RunController.open({ root, now: options.now });
  try {
    assert.deepEqual(await reopened.read(), previous);
    await assert.rejects(reopened.settle('one', 1, receipt), /closed/i);
  } finally { await reopened.close(); }
});

test('reopening converts unresolved admitted requests to unknown, never dispatches twice', async t => {
  const { controller, root, options } = await fixture(t);
  await controller.reserve(request('one'));
  await controller.admit('one');
  await assert.rejects(controller.admit('one'), /admitted/i);
  await controller.close();
  const reopened = await RunController.open({ root, now: options.now });
  try {
    assert.equal((await reopened.read()).ledger.entries[0].status, 'unknown');
    await assert.rejects(reopened.reserve(request('retry', 1)), /reconcil/i);
  } finally { await reopened.close(); }
});

test('second controller cannot own a live run and cannot reset it with create', async t => {
  const { controller, root, options } = await fixture(t);
  await assert.rejects(RunController.open({ root, now: options.now }), /owner|controller/i);
  await controller.close();
  await assert.rejects(RunController.create(options), /exist/i);
  const reopened = await RunController.open({ root, now: options.now });
  await reopened.close();
});

test('partial uncommitted file cannot replace committed state', async t => {
  const { controller, root, options } = await fixture(t);
  await controller.reserve(request('one'));
  const previous = await controller.read();
  await controller.close();
  await writeFile(join(root, '.snapshot-interrupted.tmp'), '{"version":', 'utf8');
  const reopened = await RunController.open({ root, now: options.now });
  try { assert.deepEqual(await reopened.read(), previous); } finally { await reopened.close(); }
});

test('invalid or inconsistent committed state fails closed', async t => {
  const { controller, root, options } = await fixture(t);
  await controller.close();
  const file = join(root, 'snapshot.json');
  const snapshot = JSON.parse(await readFile(file, 'utf8'));
  snapshot.run.fees.settledMicroCny = 4;
  await writeFile(file, JSON.stringify(snapshot), 'utf8');
  await assert.rejects(RunController.open({ root, now: options.now }), /fees|snapshot/i);
});

test('prior settled usage imports once with evidence through a generic API', async t => {
  const { controller } = await fixture(t, 150_000_000);
  const input = { ...request('prior-probe', 721_771), actualCostMicroCny: 721_771, evidence: receipt };
  await controller.importSettled(input);
  await controller.importSettled(input);
  assert.equal((await controller.read()).run.fees.settledMicroCny, 721_771);
  await assert.rejects(controller.importSettled({ ...input, actualCostMicroCny: 1 }), /conflict/i);
});

test('honest overcharge is retained durably and permanently halts paid admission', async t => {
  const { controller, root, options } = await fixture(t);
  await controller.reserve(request('one', 90));
  await controller.admit('one');
  await controller.settle('one', 110, receipt);
  const state = await controller.read();
  assert.equal(state.run.fees.settledMicroCny, 110);
  assert.equal(state.stopReason?.code, 'charge_overrun');
  await assert.rejects(controller.reserve(request('retry', 1)), /stopped|overrun/i);
  await controller.close();
  const reopened = await RunController.open({ root, now: options.now });
  try {
    assert.equal((await reopened.read()).run.fees.settledMicroCny, 110);
    await assert.rejects(reopened.reserve(request('after-reopen', 1)), /stopped|overrun/i);
    await assert.rejects(reopened.admit('one'), /stopped|overrun/i);
  } finally { await reopened.close(); }
});

test('cancellation releases only unstarted or explicitly proven no-cost requests', async t => {
  const { controller } = await fixture(t);
  await controller.reserve(request('queued', 30));
  await controller.cancel('queued', receipt);
  await controller.reserve(request('sent', 50));
  await controller.admit('sent');
  await assert.rejects(controller.cancel('sent', receipt), /no.cost/i);
  await controller.cancel('sent', receipt, { provenNoCost: true });
  assert.equal((await controller.read()).run.fees.reservedMicroCny, 0);
});

test('unknown prices and noninteger amounts never reserve or dispatch', async t => {
  const { controller } = await fixture(t);
  for (const amount of [0, -1, 0.5, NaN, Infinity, undefined]) {
    await assert.rejects(controller.reserve({ ...request('bad'), estimatedMaxCostMicroCny: amount as number }), /price|integer|positive/i);
  }
  await assert.rejects(controller.admit('missing'), /request/i);
  assert.equal((await controller.read()).ledger.entries.length, 0);
});

test('optimization target does not stop generation at six hours or 100 CNY', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-generation-'));
  let time = start;
  const controller = await RunController.create({ root, runId: 'run', ledgerId: 'ledger', kind: 'runtime_generation', specVersion: 'v1', scope: 'generation', allocations: [{ taskId: 'model', amountMicroCny: 200_000_000 }], now: () => time });
  try {
    time += 6 * 60 * 60 * 1000 + 1;
    await controller.reserve(request('one', 101_000_000));
    await controller.admit('one');
    assert.equal((await controller.read()).stopReason, null);
  } finally { await controller.close(); await rm(root, { recursive: true, force: true }); }
});

test('admission that crosses the deadline while persisting cannot authorize dispatch', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-late-admission-'));
  let ticks = false, time = start;
  const controller = await RunController.create({ root, runId: 'run', ledgerId: 'ledger', kind: 'evaluation', specVersion: 'v1', scope: 'validation', durationMs: 3, allocations: [{ taskId: 'model', amountMicroCny: 100 }], now: () => ticks ? time++ : time });
  try {
    await controller.reserve(request('one', 10));
    ticks = true;
    await assert.rejects(controller.admit('one'), /deadline/i);
    assert.equal((await controller.read()).stopReason?.code, 'deadline');
  } finally { await controller.close(); await rm(root, { recursive: true, force: true }); }
});

test('failed snapshot replacement fails closed and does not publish dirty in-memory fees', async t => {
  const { controller, root, options } = await fixture(t);
  const previous = await controller.read();
  const file = join(root, 'snapshot.json'), backup = join(root, 'committed.json');
  await rename(file, backup);
  await mkdir(file); // Inject an unwritable replacement target while retaining the prior bytes.
  await assert.rejects(controller.reserve(request('one')), /persistence failed/i);
  await assert.rejects(controller.admit('one'), /persistence failed/i);
  assert.equal(controller.signal.aborted, true);
  assert.deepEqual(JSON.parse(await readFile(backup, 'utf8')), previous);
  await rm(file, { recursive: true });
  await rename(backup, file);
  await controller.close();
  const reopened = await RunController.open({ root, now: options.now });
  try { assert.deepEqual(await reopened.read(), previous); } finally { await reopened.close(); }
});

test('persisted task attempts and Chinese evidence survive reopening and reject history edits', async t => {
  const { controller, root, options } = await fixture(t);
  const task = taskFixture();
  Object.assign(task, { taskId: 'model', kind: 'evaluation', specVersion: 'spec-1' });
  task.evidence[0].taskId = 'model';
  task.budget.allocationMicroCny = 100;
  await controller.saveTask(task, { role: 'system', actorId: 'runtime' });
  const changed = structuredClone(task);
  changed.attempts[0].sessionRef = 'replaced-session';
  await assert.rejects(controller.saveTask(changed, { role: 'system', actorId: 'runtime' }), /immutable/i);
  changed.attempts = [];
  await assert.rejects(controller.saveTask(changed, { role: 'system', actorId: 'runtime' }), /attempt/i);
  const exposed = await controller.read();
  exposed.tasks[0].context.rules[0] = 'mutated';
  await controller.close();
  const reopened = await RunController.open({ root, now: options.now });
  try {
    const saved = (await reopened.read()).tasks[0];
    assert.deepEqual(saved, task);
    assert.equal(saved.context.rules[0], '保留中文内容');
  } finally { await reopened.close(); }
});

test('manual stop retains in-flight costs and cancels only unstarted work', async t => {
  const { controller } = await fixture(t);
  await controller.reserve(request('sent', 40));
  await controller.admit('sent');
  await controller.reserve(request('queued', 30));
  await controller.stop('等待用户决定');
  const state = await controller.read();
  assert.equal(state.run.fees.reservedMicroCny, 40);
  assert.equal(state.ledger.entries[0].status, 'unknown');
  assert.equal(state.ledger.entries[1].status, 'cancelled');
  await controller.settle('sent', 25, receipt);
  await assert.rejects(controller.admit('queued'), /stopped/i);
});

test('deadline timer aborts active work without another API call', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-timer-'));
  const controller = await RunController.create({ root, runId: 'run', ledgerId: 'ledger', kind: 'evaluation', specVersion: 'v1', scope: 'validation', durationMs: 100, allocations: [{ taskId: 'model', amountMicroCny: 100 }] });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Deadline timer did not abort.')), 2000);
      const aborted = () => { clearTimeout(timeout); resolve(); };
      if (controller.signal.aborted) aborted(); else controller.signal.addEventListener('abort', aborted, { once: true });
    });
    assert.equal((await controller.read()).stopReason?.code, 'deadline');
  } finally { await controller.close(); await rm(root, { recursive: true, force: true }); }
});
