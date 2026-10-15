import assert from 'node:assert/strict';
import test from 'node:test';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';

const api = await import('../../src/acceptance/native-validation-waits.ts').catch((error: NodeJS.ErrnoException) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('native-validation-waits.ts')) return {};
  throw error;
}) as any;
function factory() {
  assert.equal(typeof api.createNativeValidationWaits, 'function', 'The source-owned native wait factory is required');
  return api.createNativeValidationWaits;
}
function deferred<T = void>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function fixture() {
  const owner = new AbortController(), work = new OwnedWork(owner.signal), base = Date.now();
  const waits = factory()({ caseId: 'case', windowId: 'window', taskId: 'task', deadlineAt: base + 600_000,
    signal: work.signal, trackRaw: <T>(start: (signal: AbortSignal) => Promise<T>) => work.run(start) });
  return { owner, work, base, waits };
}

test('COS97 fixed preparation accepts 25 seconds and expires at 60 seconds without configurable caps', async t => {
  const f = fixture();
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: f.base }); t.after(() => t.mock.timers.reset());
  assert.equal(api.isNativeValidationWaits(f.waits), true); assert.equal(api.isNativeValidationWaits({ ...f.waits }), false);
  assert.throws(() => factory()({ caseId: 'case', windowId: 'window', taskId: 'task', deadlineAt: f.base + 600_000,
    signal: f.work.signal, trackRaw: f.work.run.bind(f.work), caps: { prepare_authority: 1 } }), /field|cap|invalid/i);
  const segment = f.waits.beginSegment('segment'), entered = deferred(), gate = deferred();
  const pending = segment.runStage('prepare_authority', async (life: any) => { entered.resolve(); await gate.promise; return life.deadlineAt; });
  await entered.promise; t.mock.timers.tick(25_000); gate.resolve();
  assert.equal(await pending, f.base + 60_000);
  assert.equal(segment.snapshot().stages[0].capMs, 60_000);
  const secondGate = deferred(), secondEntered = deferred();
  const registration = segment.runStage('register_authority', async () => { secondEntered.resolve(); await secondGate.promise; });
  const failed = assert.rejects(registration, (error: any) => error.stage === 'register_authority');
  await secondEntered.promise; t.mock.timers.tick(60_000); await failed;
  secondGate.resolve(); await Promise.resolve();
});

test('COS97 preparation is clamped to original cleanup reserve and expired work is never dispatched', async t => {
  const owner = new AbortController(), work = new OwnedWork(owner.signal), base = Date.now();
  const waits = factory()({ caseId: 'case', windowId: 'window', taskId: 'task', deadlineAt: base + 10_000,
    signal: work.signal, trackRaw: work.run.bind(work) });
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: base }); t.after(() => t.mock.timers.reset());
  const segment = waits.beginSegment('segment'), entered = deferred(), gate = deferred(); let calls = 0;
  const pending = segment.runStage('prepare_authority', async (life: any) => { calls++; assert.equal(life.deadlineAt, base + 5000); entered.resolve(); await gate.promise; });
  const failed = assert.rejects(pending, /deadline|expired|timed out/i);
  await entered.promise; t.mock.timers.tick(5000); await failed; gate.resolve();
  await assert.rejects(segment.runStage('register_authority', async () => { calls++; }), /deadline|cancel|expired/i);
  assert.equal(calls, 1);
});

test('COS97 native inner reader is owned before start and remains pending until its real settlement', async t => {
  const f = fixture(), entered = deferred(), gate = deferred(); let started = 0;
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: f.base }); t.after(() => t.mock.timers.reset());
  const derived = api.associateNativeReadSignal(f.waits.readSignal, AbortSignal.any([f.waits.readSignal]));
  const reading = api.runNativeValidationRead(derived, async () => { started++; entered.resolve(); await gate.promise; return 7; });
  await entered.promise; assert.equal(started, 1); assert.equal(f.waits.snapshot().rawReads.pending, 1);
  const draining = assert.rejects(f.work.cancelAndDrain('fixture stop', 100), /did not quiesce/);
  t.mock.timers.tick(100); await draining;
  assert.equal(f.waits.snapshot().rawReads.pending, 1);
  gate.resolve(); assert.equal(await reading, 7); await f.work.cancelAndDrain('fixture finished');
  assert.equal(f.waits.snapshot().rawReads.pending, 0);
});

test('COS97 pre-cancelled native reader starts no thunk and preserves the original reason', async () => {
  const f = fixture(), reason = new Error('original native stop'); let calls = 0;
  f.owner.abort(reason);
  await assert.rejects(api.runNativeValidationRead(f.waits.readSignal, async () => { calls++; }), (error: unknown) => error === reason);
  assert.equal(calls, 0); assert.equal(f.waits.snapshot().rawReads.pending, 0);
});

test('COS97 late native reader rejection is observed with its exact error and cleared after settlement', async () => {
  const f = fixture(), gate = deferred(), entered = deferred(), error = new Error('late raw failure');
  const reading = api.runNativeValidationRead(f.waits.readSignal, async () => { entered.resolve(); await gate.promise; throw error; });
  const failed = assert.rejects(reading, (reason: unknown) => reason === error);
  await entered.promise; assert.equal(f.waits.snapshot().rawReads.pending, 1);
  gate.resolve(); await failed; assert.equal(f.waits.snapshot().rawReads.pending, 0);
});

test('COS97 ordinary reader keeps its immediate default and gains no native owner', async () => {
  factory(); let started = false;
  const plain = new AbortController().signal;
  const reading = api.runNativeValidationRead(plain, async (signal: AbortSignal) => { assert.equal(signal, plain); started = true; return 3; });
  assert.equal(started, true); assert.equal(await reading, 3);
});
