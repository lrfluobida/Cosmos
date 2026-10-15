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
function fixture(controllerSignal?: AbortSignal) {
  const owner = new AbortController(), work = new OwnedWork(owner.signal), base = Date.now();
  const waits = factory()({ caseId: 'case', windowId: 'window', taskId: 'task', deadlineAt: base + 600_000,
    signal: work.signal, ...(controllerSignal ? { controllerSignal } : {}), trackRaw: <T>(start: (signal: AbortSignal) => Promise<T>) => work.run(start) });
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

test('COS97 expired stage dispatches no operation even when its timer callback is delayed', async t => {
  const f = fixture(); let calls = 0;
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: f.base }); t.after(() => t.mock.timers.reset());
  const segment = f.waits.beginSegment('segment');
  const pending = segment.runStage('prepare_authority', async () => { calls++; });
  t.mock.timers.setTime(f.base + 60_000);
  await assert.rejects(pending, (error: any) => error.stage === 'prepare_authority');
  assert.equal(calls, 0, 'The frozen stage deadline must be checked before operation dispatch');
});

test('COS97 cancellation after ownership registration counts one settled operation with zero reader dispatches', async () => {
  const f = fixture(), reason = new Error('queued native cancellation'); let calls = 0;
  const pending = api.runNativeValidationRead(f.waits.readSignal, async () => { calls++; });
  const failed = assert.rejects(pending, (error: unknown) => error === reason);
  f.owner.abort(reason); await failed;
  assert.equal(calls, 0);
  assert.deepEqual(f.waits.snapshot().rawReads, { started: 1, settled: 1, pending: 0 }, 'Counts describe owned operations, including cancellation before reader dispatch');
});

async function transportReady(segment: any) {
  await segment.runStage('prepare_authority', async () => {});
  await segment.runStage('register_authority', async () => {});
  await segment.runStage('browser_transport', async () => {});
}
test('COS97 traffic stays closed through transport and navigation owns its full 300 second budget', async t => {
  const f = fixture(); let calls = 0;
  assert.equal(typeof f.waits.runRequest, 'function');
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: f.base }); t.after(() => t.mock.timers.reset());
  await assert.rejects(f.waits.runRequest(async () => { calls++; }), /closed|not ready/i);
  const segment = f.waits.beginSegment('segment'); await transportReady(segment);
  await assert.rejects(f.waits.runRequest(async () => { calls++; }), /closed|not ready/i);
  segment.beginNavigation();
  const entered = deferred(), gate = deferred();
  const navigation = segment.runStage('navigation', async (life: any) => { entered.resolve(); await gate.promise; return life.deadlineAt; });
  await entered.promise; t.mock.timers.tick(25_000); gate.resolve();
  assert.equal(await navigation, f.base + 300_000); segment.finishNavigation();
  assert.equal(segment.snapshot().state, 'input'); assert.equal(calls, 0);
});
test('COS97 HTTP requests run fixed pre body post stages and retain raw request ownership', async () => {
  const f = fixture(), segment = f.waits.beginSegment('segment');
  assert.equal(typeof f.waits.runRequest, 'function');
  await transportReady(segment); segment.beginNavigation();
  const order: string[] = [];
  const navigation = segment.runStage('navigation', async () => f.waits.runRequest(async (request: any) => {
    for (const stage of ['http_pre_authority', 'http_body', 'http_post_authority']) await request.runStage(stage, async (life: any) => {
      order.push(stage); assert.ok(life.deadlineAt <= f.base + 300_000 + 100); return stage;
    });
    request.check(); return 'actual body';
  }));
  assert.equal(await navigation, 'actual body'); segment.finishNavigation();
  assert.deepEqual(order, ['http_pre_authority', 'http_body', 'http_post_authority']);
  assert.equal(segment.snapshot().http.started, 1); assert.equal(segment.snapshot().http.settled, 1);
  assert.deepEqual(segment.snapshot().http.stages.map((row: any) => row.capMs), [60_000, 15_000, 60_000]);
  assert.equal(segment.snapshot().http.pending, 0);
});
test('COS97 old segment handles and request callbacks cannot operate a later generation', async () => {
  const f = fixture(), segment = f.waits.beginSegment('first');
  assert.equal(typeof segment.revoke, 'function'); assert.equal(typeof segment.settle, 'function');
  await transportReady(segment); segment.beginNavigation(); let previous: any;
  await segment.runStage('navigation', async () => f.waits.runRequest(async (request: any) => {
    previous = request;
    for (const stage of ['http_pre_authority', 'http_body', 'http_post_authority']) await request.runStage(stage, async () => {});
  }));
  segment.finishNavigation(); segment.revoke(); await segment.settle(f.base + 5000);
  const next = f.waits.beginSegment('second'), before = next.snapshot();
  assert.throws(() => segment.beginNavigation(), /stale|closed|cancel/i);
  assert.throws(() => previous.check(), /stale|closed|cancel/i);
  segment.revoke(new Error('late close callback'));
  assert.deepEqual(next.snapshot(), before); assert.equal(next.generation, segment.generation + 1);
});
test('COS97 navigation completion does not extend an already admitted HTTP lifetime', async t => {
  const f = fixture(), segment = f.waits.beginSegment('segment');
  assert.equal(typeof f.waits.runRequest, 'function');
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: f.base }); t.after(() => t.mock.timers.reset());
  await transportReady(segment); segment.beginNavigation();
  const navEntered = deferred(), navGate = deferred();
  const navigation = segment.runStage('navigation', async () => { navEntered.resolve(); await navGate.promise; });
  await navEntered.promise; t.mock.timers.setTime(f.base + 299_000);
  const bodyEntered = deferred(), bodyGate = deferred(); let posts = 0;
  const request = f.waits.runRequest(async (current: any) => {
    await current.runStage('http_pre_authority', async () => {});
    await current.runStage('http_body', async (life: any) => { assert.equal(life.deadlineAt, f.base + 300_000); bodyEntered.resolve(); await bodyGate.promise; });
    await current.runStage('http_post_authority', async () => { posts++; });
  });
  const failed = assert.rejects(request, /deadline|expired/i);
  await bodyEntered.promise; navGate.resolve(); await navigation; segment.finishNavigation();
  t.mock.timers.setTime(f.base + 300_000); bodyGate.resolve(); await failed;
  assert.equal(posts, 0);
});
test('COS97 segment settlement includes deferred inner readers and prevents the next generation', async t => {
  const f = fixture(), segment = f.waits.beginSegment('segment'); let signal!: AbortSignal;
  assert.equal(typeof segment.settle, 'function');
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: f.base }); t.after(() => t.mock.timers.reset());
  await segment.runStage('prepare_authority', async (life: any) => { signal = life.signal; });
  const entered = deferred(), gate = deferred();
  const reading = api.runNativeValidationRead(signal, async () => { entered.resolve(); await gate.promise; });
  await entered.promise; segment.revoke();
  const failed = assert.rejects(segment.settle(f.base + 100), /drain|settle|pending/i);
  t.mock.timers.tick(100); await failed; assert.throws(() => f.waits.beginSegment('next'), /ready|pending/i);
  gate.resolve(); await reading; await segment.settle(f.base + 5000);
  assert.equal(f.waits.beginSegment('next').generation, segment.generation + 1);
});

test('COS97 only original native caller signals carry generation invalidation identity', async () => {
  const f = fixture(), segment = f.waits.beginSegment('segment'); let signal!: AbortSignal;
  assert.equal(typeof api.nativeCallerDisposition, 'function');
  await segment.runStage('prepare_authority', async (life: any) => { signal = life.signal; });
  assert.equal(api.nativeCallerDisposition(signal, f.waits, new Error('source changed')), 'active');
  const derived = api.associateNativeReadSignal(signal, AbortSignal.any([signal]));
  assert.equal(api.nativeCallerDisposition(derived, f.waits, new Error('source changed')), 'ordinary');
  segment.revoke(); await segment.settle(f.base + 5000); f.waits.beginSegment('next');
  assert.equal(api.nativeCallerDisposition(signal, f.waits, signal.reason), 'stale');
  assert.equal(api.nativeCallerDisposition(f.waits.readSignal, fixture().waits, new Error('old mount')), 'stale');
});

test('COS97 source lifetime check aborts with its exact frozen stage deadline reason', async t => {
  const f = fixture(), segment = f.waits.beginSegment('segment'); let signal!: AbortSignal, reason: unknown;
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: f.base }); t.after(() => t.mock.timers.reset());
  const pending = segment.runStage('prepare_authority', async (life: any) => {
    signal = life.signal; t.mock.timers.setTime(f.base + 60_000);
    try { life.check(); } catch (error) { reason = error; throw error; }
  });
  await assert.rejects(pending, (error: any) => error === reason && error.stage === 'prepare_authority');
  assert.equal(signal.aborted, true); assert.equal(signal.reason, reason);
});

test('COS97 request records an observed source first cause without changing caller or later generation', async () => {
  const f = fixture(), segment = f.waits.beginSegment('segment'), cause = new Error('actual payload changed'), cleanup = new Error('later close failed');
  await transportReady(segment); segment.beginNavigation(); let previous: any;
  const pending = segment.runStage('navigation', async () => f.waits.runRequest(async (request: any) => {
    previous = request;
    await request.runStage('http_pre_authority', async () => {}); await request.runStage('http_body', async () => {});
    await request.runStage('http_post_authority', async (life: any) => {
      request.recordFailure(cause); assert.equal(life.signal.aborted, false);
      assert.equal(segment.snapshot().firstCause.message, cause.message); throw cleanup;
    });
  }));
  await assert.rejects(pending, error => error === cause);
  assert.equal(segment.snapshot().firstCause.message, cause.message);
  segment.revoke(); await segment.settle(f.base + 5000); const next = f.waits.beginSegment('next'), before = next.snapshot();
  previous.recordFailure(new Error('late obsolete callback')); assert.deepEqual(next.snapshot(), before);
});

test('COS97 original phase caller records source failure before deferred invalidation closes', async t => {
  assert.equal(typeof api.recordNativeValidationFailure, 'function');
  const f = fixture(), segment = f.waits.beginSegment('segment'), cause = new Error('source observed before close'), cleanup = new Error('later close failure');
  const entered = deferred(), gate = deferred(); let previous!: AbortSignal;
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: f.base }); t.after(() => t.mock.timers.reset());
  const pending = segment.runStage('prepare_authority', async (life: any) => {
    previous = life.signal;
    const derived = api.associateNativeReadSignal(life.signal, AbortSignal.any([life.signal]));
    api.recordNativeValidationFailure(derived, new Error('derived has no invalidation authority')); assert.equal(segment.snapshot().firstCause, null);
    api.recordNativeValidationFailure(life.signal, cause); assert.equal(life.signal.aborted, false); entered.resolve();
    await gate.promise; throw cleanup;
  });
  const rejected = assert.rejects(pending, error => error === cause);
  await entered.promise; assert.equal(segment.snapshot().firstCause.message, cause.message);
  t.mock.timers.tick(60_000);
  try {
    await rejected; assert.equal(segment.snapshot().rawOperationsPending, 1);
    const failed = assert.rejects(segment.settle(f.base + 60_100), /settle|pending/i); t.mock.timers.tick(100); await failed;
  } finally { gate.resolve(); segment.revoke(); await segment.settle(f.base + 65_000); }
  const next = f.waits.beginSegment('next'), before = next.snapshot(); api.recordNativeValidationFailure(previous, new Error('old callback'));
  assert.deepEqual(next.snapshot(), before); let settled!: AbortSignal;
  await next.runStage('prepare_authority', async (life: any) => { settled = life.signal; });
  api.recordNativeValidationFailure(settled, new Error('settled phase')); assert.equal(next.snapshot().firstCause, null);
});

test('COS97 recorded undefined first cause retains presence through a later cleanup error', async () => {
  const f = fixture(), segment = f.waits.beginSegment('segment');
  const pending = segment.runStage('prepare_authority', async (life: any) => {
    api.recordNativeValidationFailure(life.signal, undefined); throw new Error('secondary cleanup failure');
  });
  await assert.rejects(pending, error => error === undefined); assert.equal(segment.snapshot().firstCause.message, 'undefined');
});

test('COS97 spawned registration remains pending when its next authority phase cannot dispatch', async t => {
  const f = fixture(), segment = f.waits.beginSegment('segment'), entered = deferred(), gate = deferred(); let calls = 0;
  assert.equal(typeof segment.trackRegistration, 'function');
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: f.base }); t.after(() => t.mock.timers.reset());
  await segment.runStage('prepare_authority', async () => {});
  const raw = segment.trackRegistration(async () => { entered.resolve(); await gate.promise; });
  await entered.promise; segment.revoke(new Error('cancelled immediately after spawn'));
  await assert.rejects(segment.runStage('register_authority', async () => { calls++; }), /cancelled immediately/);
  assert.equal(calls, 0); assert.equal(segment.snapshot().rawOperationsPending, 1);
  const failed = assert.rejects(segment.settle(f.base + 100), /settle|pending/i); t.mock.timers.tick(100); await failed;
  gate.resolve(); await raw; await segment.settle(f.base + 5000); assert.equal(segment.snapshot().rawOperationsPending, 0);
});

test('COS97 pre-mount lookup recognizes only original source callers and leaves generation checks separate', async () => {
  assert.equal(typeof api.nativeValidationWaitsForCaller, 'function');
  const f = fixture(), segment = f.waits.beginSegment('segment'); let phase!: AbortSignal;
  assert.equal(api.nativeValidationWaitsForCaller(f.waits.readSignal), f.waits);
  await segment.runStage('prepare_authority', async (life: any) => { phase = life.signal; });
  assert.equal(api.nativeValidationWaitsForCaller(phase), f.waits);
  const derived = api.associateNativeReadSignal(phase, AbortSignal.any([phase]));
  assert.equal(api.nativeValidationWaitsForCaller(derived), undefined); assert.equal(api.nativeValidationWaitsForCaller(new AbortController().signal), undefined);
  segment.revoke(); await segment.settle(f.base + 5000); f.waits.beginSegment('next');
  assert.equal(api.nativeValidationWaitsForCaller(phase), f.waits);
  assert.equal(api.nativeCallerDisposition(phase, f.waits, phase.reason), 'stale');
});

test('COS97 a recorded HTTP failure stops the next input before its deferred close settles', async () => {
  const f = fixture(), segment = f.waits.beginSegment('segment'), source = new Error('known source failure'), entered = deferred(), gate = deferred(); let inputs = 0;
  assert.equal(typeof segment.check, 'function'); await transportReady(segment); segment.beginNavigation();
  const pending = segment.runStage('navigation', async () => f.waits.runRequest(async (request: any) => {
    await request.runStage('http_pre_authority', async (life: any) => { api.recordNativeValidationFailure(life.signal, source);
      assert.equal(life.signal.aborted, false); entered.resolve(); await gate.promise; throw source; });
  }));
  const rejected = assert.rejects(pending, error => error === source); await entered.promise;
  try { assert.throws(() => { segment.check(); inputs++; }, error => error === source); assert.equal(inputs, 0); }
  finally { gate.resolve(); await rejected; }
});

test('COS97 original controller reason wins once it is effective after an earlier work abort', async t => {
  await t.test('phase boundary and exit', async () => {
    const controller = new AbortController(), f = fixture(controller.signal), segment = f.waits.beginSegment('segment');
    const source = new Error('earlier source failure'), work = new Error('work cancelled first'), reason = new Error('controller deadline became effective'); let checked: unknown;
    const pending = segment.runStage('prepare_authority', async (life: any) => {
      api.recordNativeValidationFailure(life.signal, source); f.owner.abort(work); controller.abort(reason);
      try { life.check(); } catch (error) { checked = error; throw error; }
    });
    await assert.rejects(pending, error => error === reason); assert.equal(checked, reason);
  });
  await t.test('raw reader precheck starts no thunk', async () => {
    const controller = new AbortController(), f = fixture(controller.signal), reason = new Error('controller original stop'); let calls = 0;
    f.owner.abort(new Error('earlier work cancellation')); controller.abort(reason);
    await assert.rejects(api.runNativeValidationRead(f.waits.readSignal, async () => { calls++; }), error => error === reason); assert.equal(calls, 0);
  });
  await t.test('next input check', async () => {
    const controller = new AbortController(), f = fixture(controller.signal), segment = f.waits.beginSegment('segment'), reason = new Error('controller original deadline');
    f.owner.abort(new Error('earlier work cancellation')); controller.abort(reason); assert.throws(() => segment.check(), error => error === reason);
  });
  await t.test('later cleanup work abort cannot replace a recorded source while controller is active', async () => {
    const controller = new AbortController(), f = fixture(controller.signal), segment = f.waits.beginSegment('segment'), source = new Error('original known source');
    const pending = segment.runStage('prepare_authority', async (life: any) => {
      api.recordNativeValidationFailure(life.signal, source); f.owner.abort(new Error('later work cleanup'));
      assert.throws(() => segment.check(), error => error === source); throw new Error('secondary cleanup');
    });
    await assert.rejects(pending, error => error === source);
  });
});

test('COS97 root reader catch preserves its captured canonical source including undefined', async t => {
  for (const source of [new Error('Captured source before root reader cleanup'), undefined]) await t.test(source ? 'Error object' : 'undefined presence', async () => {
    const controller = new AbortController(), f = fixture(controller.signal), segment = f.waits.beginSegment('reader-root'), cleanup = new Error('Later reader cleanup');
    const reading = api.runNativeValidationRead(f.waits.readSignal, async () => {
      await assert.rejects(segment.runStage('prepare_authority', async (life: any) => { api.recordNativeValidationFailure(life.signal, source); throw cleanup; }), error => error === source);
      f.owner.abort(cleanup); throw cleanup;
    });
    await assert.rejects(reading, error => error === source); assert.equal(f.waits.snapshot().rawReads.pending, 0);
  });
});

test('COS97 a derived old reader preserves only its captured source and cannot affect a new generation', async () => {
  const f = fixture(), segment = f.waits.beginSegment('old'), source = new Error('Old captured source'); let previous!: AbortSignal;
  await assert.rejects(segment.runStage('prepare_authority', async (life: any) => {
    previous = api.associateNativeReadSignal(life.signal, AbortSignal.any([life.signal])); api.recordNativeValidationFailure(life.signal, source); throw source;
  }), error => error === source); await segment.settle(f.base + 5000);
  const next = f.waits.beginSegment('new'), before = next.snapshot(); let calls = 0;
  await assert.rejects(api.runNativeValidationRead(previous, async () => { calls++; }), error => error === source);
  assert.equal(calls, 0); assert.equal(api.nativeCallerDisposition(previous, f.waits, source), 'ordinary');
  api.recordNativeValidationFailure(previous, new Error('Derived cannot invalidate')); f.waits.checkRead(); assert.deepEqual(next.snapshot(), before);
});
