import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';
import { ownedPersistentBrowserLifecycle } from '../../src/acceptance/persistent.ts';
import { runAcceptanceInOwnedSession } from '../../src/acceptance/runner.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork, cancelAndDrain } from '../../src/runtime/recovery/owned-work.ts';
import * as host from '../../src/runtime/entrypoint-host.ts';
import { createNativeValidationWaits } from '../../src/acceptance/native-validation-waits.ts';

function deferred<T = void>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function fixture(t: TestContext, verifyBinding: (callerSignal?: AbortSignal) => Promise<void> = async () => {}, durationMs = 60000) {
  const root = await mkdtemp(join(tmpdir(), 'cos92-launch-')), profile = join(root, 'profile'); await mkdir(profile);
  const controller = await RunController.create({ root, runId: 'fixture', ledgerId: 'fixture', kind: 'evaluation', scope: 'validation', specVersion: 'v1',
    allocations: [{ taskId: 'browser', amountMicroCny: 1 }], durationMs, now: () => Date.now() });
  const work = new OwnedWork(controller.signal), base = Date.now(), deadlineAt = base + durationMs;
  t.after(async () => { t.mock.timers.reset(); t.mock.restoreAll(); syncBuiltinESMExports(); await controller.close().catch(() => {}); assert.ok(root.startsWith(join(tmpdir(), 'cos92-launch-'))); await rm(root, { recursive: true, force: true }); });
  const factory = (host as any).createPersistentOwnedChild;
  assert.equal(typeof factory, 'function', 'Native persistent ownership must expose its production prepare/settlement seam');
  const ownedChild = factory({ controller, work }, { taskId: 'browser', windowId: null, deadlineAt: new Date(deadlineAt).toISOString() }, verifyBinding);
  let spawns = 0, registrations = 0, connections = 0;
  // Synthetic process/CDP transport; the separate Edge representative records real PID/profile/exit evidence.
  const child: any = new EventEmitter(); Object.assign(child, { pid: 424242, exitCode: null, signalCode: null });
  const register = controller.registerOwnedChild.bind(controller);
  t.mock.method(controller, 'registerOwnedChild', async (pid: number, ticket: string) => { registrations++; assert.equal(connections, 0); await register(pid, ticket); });
  t.mock.method(childProcess, 'spawn', () => { spawns++; writeFileSync(join(profile, 'DevToolsActivePort'), '12345\n/devtools/browser/mock\n', 'utf8'); return child; });
  syncBuiltinESMExports();
  const cdp: any = { send: async (method: string) => {
    if (method === 'SystemInfo.getProcessInfo') return { processInfo: [{ type: 'browser', id: child.pid }] };
    if (method === 'Browser.getBrowserCommandLine') return { arguments: ['--user-data-dir=' + profile] };
    if (method === 'Browser.close') { child.exitCode = 0; child.emit('close'); return {}; }
    throw new Error('Unexpected CDP ' + method);
  } };
  const context: any = { pages: () => [], addInitScript: async () => {} };
  const browser: any = { newBrowserCDPSession: async () => cdp, contexts: () => [context], version: () => 'fixture', close: async () => {} };
  t.mock.method(chromium, 'connectOverCDP', async () => { connections++; return browser; });
  const options: any = { evidenceRoot: root, deadlineAt, verifyBinding, ownedChild };
  const lifecycle = () => ownedPersistentBrowserLifecycle({ taskId: 'browser', reportId: 'fixture-report', url: 'http://127.0.0.1:32123/' } as any, options, { profile, deadlineAt, signal: work.signal });
  return { root, controller, work, base, options, lifecycle, child, context, counts: () => ({ spawns, registrations, connections }),
    children: async () => JSON.parse(await readFile(join(root, '.controller.lock'), 'utf8')).children };
}

test('COS92 late binding after local timeout cannot create a ticket or spawn', async t => {
  const entered = deferred(), gate = deferred(), f = await fixture(t, async () => { entered.resolve(); await gate.promise; });
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: f.base });
  const opening = f.lifecycle().open(f.root, 15000), rejection = assert.rejects(opening, /timed out|expired|deadline/i);
  await entered.promise; t.mock.timers.tick(15001); await rejection;
  const draining = f.work.cancelAndDrain('fixture cancellation'); gate.resolve(); await draining;
  assert.deepEqual(f.counts(), { spawns: 0, registrations: 0, connections: 0 }); assert.deepEqual(await f.children(), []); await f.controller.close();
});

test('COS92 drain owns a persisted ticket while raw prepare handle delivery is blocked', async t => {
  const f = await fixture(t), entered = deferred(), gate = deferred(), original = f.options.ownedChild.prepare;
  f.options.ownedChild.prepare = async (launch: any) => { const handle = await original(launch); entered.resolve(); await gate.promise; return handle; };
  const opening = f.lifecycle().open(f.root, 15000), rejection = assert.rejects(opening, /cancel/i);
  await entered.promise; assert.equal((await f.children()).length, 1);
  let drained = false; const draining = f.work.cancelAndDrain('fixture cancellation').then(() => { drained = true; });
  await rejection; assert.equal(drained, false, 'Handle return must not end tracked ownership');
  gate.resolve(); await draining;
  assert.deepEqual(f.counts(), { spawns: 0, registrations: 0, connections: 0 }); assert.deepEqual(await f.children(), []); await f.controller.close();
});

test('COS92 exact local deadline after persistence releases intent before spawn', async t => {
  const f = await fixture(t), original = f.options.ownedChild.prepare;
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: f.base });
  f.options.ownedChild.prepare = async (launch: any) => { const handle = await original(launch); t.mock.timers.setTime(f.base + 15000); return handle; };
  await assert.rejects(f.lifecycle().open(f.root, 15000), /expired|deadline/i);
  await f.work.cancelAndDrain('fixture done'); assert.deepEqual(f.counts(), { spawns: 0, registrations: 0, connections: 0 });
  assert.deepEqual(await f.children(), []); await f.controller.close();
});

test('COS92 runner timeout cancels a blocked handle handoff while drain retains release responsibility', async t => {
  const f = await fixture(t), entered = deferred(), gate = deferred(), original = f.options.ownedChild.prepare;
  f.options.ownedChild.prepare = async (launch: any) => { const handle = await original(launch); entered.resolve(); await gate.promise; return handle; };
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: f.base });
  const plan: any = { formatVersion: '1.0.0', projectId: 'fixture', taskId: 'browser', runId: 'fixture', reportId: 'outer', specVersion: 'v1',
    artifact: { artifactId: 'game', version: 'v1', location: 'game' }, url: 'http://127.0.0.1:32123/', viewport: { width: 1280, height: 720 },
    acceptanceIds: ['visible'], steps: [{ id: 'visible', kind: 'assert', acceptanceId: 'visible', observation: { kind: 'visible', selector: '#game' }, expected: true, timeoutMs: 100 }] };
  const running = runAcceptanceInOwnedSession(plan, { evidenceRoot: f.root, timeoutMs: 60000 }, f.lifecycle());
  await entered.promise; t.mock.timers.tick(15001); const report = await running;
  assert.equal(report.outcome, 'failed'); assert.ok(report.errors.some(error => /deadline|timed out/i.test(error)));
  assert.equal(report.steps[0].outcome, 'skipped'); assert.equal(report.cleanup.browserPid, null);
  let drained = false; const draining = f.work.cancelAndDrain('fixture done').then(() => { drained = true; });
  await Promise.resolve(); assert.equal(drained, false); gate.resolve(); await draining;
  assert.deepEqual(await f.children(), []); assert.equal(f.counts().spawns, 0); await f.controller.close();
});

for (const stop of ['cancel', 'deadline'] as const) test(`COS92 original run ${stop} still stops a pending browser prepare`, async t => {
  const entered = deferred(), gate = deferred(), f = await fixture(t, async () => { entered.resolve(); await gate.promise; });
  if (stop === 'deadline') t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: f.base });
  const opening = f.lifecycle().open(f.root, 15000), rejection = assert.rejects(opening, /cancel|expired|deadline/i);
  await entered.promise;
  if (stop === 'cancel') await f.controller.stop('Original run cancelled');
  else { t.mock.timers.setTime(f.base + 60001); await f.controller.read(); }
  assert.equal(f.controller.signal.aborted, true); await rejection;
  const draining = f.work.cancelAndDrain('fixture done'); gate.resolve(); await draining;
  assert.deepEqual(await f.children(), []); assert.equal(f.counts().spawns, 0); await f.controller.close();
});

test('COS92 timely prepare spawns once, registers before CDP and retains the PID until exit', async t => {
  const f = await fixture(t), lifecycle = f.lifecycle(); await lifecycle.open(f.root, 15000);
  assert.deepEqual(f.counts(), { spawns: 1, registrations: 1, connections: 1 });
  const [record] = await f.children(); assert.equal(record.pid, f.child.pid);
  await assert.rejects(f.controller.releaseUnspawnedChild(record.ticket), /unresolved|intent/i);
  assert.equal(lifecycle.identity()!.commandLineProfile, lifecycle.identity()!.profile);
  await lifecycle.close(1000); assert.equal(lifecycle.identity()!.closeEvent, true); await f.work.cancelAndDrain('fixture done');
});

test('COS92 source rejection without a ticket completes tracking and cannot spawn', async t => {
  const f = await fixture(t, async () => { throw new Error('Current source changed'); });
  await assert.rejects(f.lifecycle().open(f.root, 15000), /source changed/); await f.work.cancelAndDrain('fixture done');
  assert.deepEqual(await f.children(), []); assert.equal(f.counts().spawns, 0); await f.controller.close();
});

test('COS92 failed late release reaches public drain and retains the exact unresolved intent', async t => {
  const f = await fixture(t), entered = deferred(), gate = deferred(), original = f.options.ownedChild.prepare;
  let completion!: Promise<void>;
  f.options.ownedChild.prepare = async (launch: any) => { completion = launch.completion; const handle = await original(launch); entered.resolve(); await gate.promise; return handle; };
  const releaseError = new Error('Fixture release persistence failed');
  t.mock.method(f.controller, 'releaseUnspawnedChild', async () => { throw releaseError; });
  const opening = f.lifecycle().open(f.root, 15000), rejection = assert.rejects(opening, /cancel/i);
  const drainFailure = (error: unknown) => { assert.ok(error instanceof AggregateError); assert.ok(error.errors.includes(releaseError)); assert.match(error.message, /Fixture release persistence failed/); return true; };
  await entered.promise; const before = await f.children(), draining = assert.rejects(cancelAndDrain(f.controller, f.work, 'fixture cancellation'), drainFailure); await rejection;
  const cleanup = assert.rejects(completion, /release|cleanup/i); gate.resolve(); await cleanup; await draining;
  assert.deepEqual(await f.children(), before); assert.equal(f.counts().spawns, 0);
  await assert.rejects(f.work.cancelAndDrain('later drain after completed work'), drainFailure);
  await assert.rejects(f.controller.close(), /Unresolved child spawn intent/);
});

test('COS92 rollback failure before handle delivery also reaches public drain with its causes', async t => {
  const f = await fixture(t), owner = (f.controller as any).store.lock, save = owner.save.bind(owner);
  const rollbackError = new Error('Fixture rollback persistence failed'); let written = false, draining!: Promise<void>;
  t.mock.method(owner, 'save', async (next: any) => {
    if (written) throw rollbackError;
    await save(next); written = true;
    draining = assert.rejects(cancelAndDrain(f.controller, f.work, 'fixture cancellation during persistence'), error => {
      assert.ok(error instanceof AggregateError); const failure = error.errors[0];
      assert.ok(failure instanceof AggregateError); assert.ok(failure.errors.includes(rollbackError));
      assert.match(failure.message, /Persistent launch cancelled/); assert.match(failure.message, /Fixture rollback persistence failed/); return true;
    });
  });
  await assert.rejects(f.lifecycle().open(f.root, 15000), /cancel/i); await draining;
  assert.equal((await f.children())[0].pid, null); assert.equal(f.counts().spawns, 0);
  await assert.rejects(f.controller.close(), /Unresolved child spawn intent/);
});

test('COS92 an unresolved prepare makes bounded drain fail without clearing ownership', async t => {
  const entered = deferred(), gate = deferred(), f = await fixture(t, async () => { entered.resolve(); await gate.promise; });
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: f.base });
  const opening = f.lifecycle().open(f.root, 15000), rejection = assert.rejects(opening, /cancel/i);
  await entered.promise; const draining = assert.rejects(f.work.cancelAndDrain('fixture cancellation', 100), /did not quiesce/);
  await rejection; t.mock.timers.tick(101); await draining; assert.deepEqual(await f.children(), []);
  gate.resolve(); await f.work.cancelAndDrain('fixture finally'); assert.equal(f.counts().spawns, 0);
});

test('COS97 owned prepare forwards its original native phase caller', async t => {
  let received: AbortSignal | undefined;
  const f = await fixture(t, async caller => { received = caller; });
  const waits = createNativeValidationWaits({ caseId: 'fixture', windowId: 'window', taskId: 'browser', deadlineAt: f.options.deadlineAt,
    signal: f.work.signal, trackRaw: start => f.work.run(start) }), segment = waits.beginSegment('native-prepare'), completion = deferred();
  const ownedChild = host.createPersistentOwnedChild({ controller: f.controller, work: f.work },
    { taskId: 'browser', windowId: null, deadlineAt: new Date(f.options.deadlineAt).toISOString() }, f.options.verifyBinding, waits);
  let expected: AbortSignal | undefined;
  const handle = await segment.runStage('prepare_authority', life => { expected = life.signal; return ownedChild.prepare({ ...life, completion: completion.promise }); });
  try { assert.equal(received, expected); }
  finally { await handle.releaseUnspawned(); completion.resolve(); segment.revoke(); await segment.settle(f.options.deadlineAt); await f.work.cancelAndDrain('fixture complete'); }
});

test('COS97 raw PID registration stays owned after completion and a rejected pending lifetime', async t => {
  let bindings = 0; const f = await fixture(t, async () => { bindings++; }), completion = deferred(), entered = deferred(), gate = deferred();
  const handle = await f.options.ownedChild.prepare({ signal: f.work.signal, deadlineAt: f.options.deadlineAt, completion: completion.promise });
  const persist = f.controller.registerOwnedChild.bind(f.controller), reason = new Error('Native registration phase expired');
  t.mock.method(f.controller, 'registerOwnedChild', async (pid: number, ticket: string) => { entered.resolve(); await gate.promise; return persist(pid, ticket); });
  let rejectLifetime!: (error: unknown) => void;
  const lifetime = new Promise<never>((_done, reject) => { rejectLifetime = reject; });
  void lifetime.catch(() => {}); // The source must also observe it immediately while its PID write is pending.
  const registration = handle.register(f.child.pid, lifetime), rejected = assert.rejects(registration, error => error === reason);
  await entered.promise; rejectLifetime(reason); completion.resolve();
  try {
    await assert.rejects(f.work.cancelAndDrain('fixture stop', 100), /did not quiesce/);
    assert.equal(bindings, 1, 'Fresh registration binding must not start after its native lifetime rejects');
  } finally { gate.resolve(); await rejected; }
  assert.equal((await f.children())[0].pid, f.child.pid, 'The original PID write still completes after phase expiry');
  await assert.rejects(f.work.cancelAndDrain('fixture settled'), error => error instanceof AggregateError && error.errors.includes(reason));
  assert.equal(f.counts().connections, 0);
});

function native(f: Awaited<ReturnType<typeof fixture>>) {
  const waits = createNativeValidationWaits({ caseId: 'fixture', windowId: 'window', taskId: 'browser', deadlineAt: f.options.deadlineAt,
    signal: f.work.signal, trackRaw: start => f.work.run(start) }); f.options.nativeValidationWaits = waits;
  f.options.ownedChild = host.createPersistentOwnedChild({ controller: f.controller, work: f.work },
    { taskId: 'browser', windowId: null, deadlineAt: new Date(f.options.deadlineAt).toISOString() }, f.options.verifyBinding, waits);
  return waits;
}

test('COS97 native lifecycle keeps two full authority waits before its independent CDP budget', async t => {
  const prepareEntered = deferred(), prepareGate = deferred(), registerEntered = deferred(), registerGate = deferred(); let bindings = 0;
  const f = await fixture(t, async caller => { assert.ok(caller); if (++bindings === 1) { prepareEntered.resolve(); await prepareGate.promise; }
    else { registerEntered.resolve(); await registerGate.promise; } }), waits = native(f), lifecycle = f.lifecycle();
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: f.base }); let settled: string | undefined;
  const opening = lifecycle.open(f.root, 15000); void opening.then(() => { settled = 'passed'; }, () => { settled = 'failed'; });
  try {
    await prepareEntered.promise; t.mock.timers.tick(25000); await new Promise(setImmediate);
    assert.equal(settled, undefined, 'Native preparation is still legal after the old whole-open 15 seconds'); prepareGate.resolve();
    await registerEntered.promise; t.mock.timers.tick(20000); await new Promise(setImmediate);
    assert.equal(settled, undefined); assert.equal(f.counts().connections, 0); registerGate.resolve(); await opening;
    assert.deepEqual(waits.snapshot().segments[0].stages.map(row => [row.stage, row.capMs, row.outcome]),
      [['prepare_authority', 60000, 'passed'], ['register_authority', 60000, 'passed'], ['browser_transport', 15000, 'passed']]);
    assert.deepEqual(f.counts(), { spawns: 1, registrations: 1, connections: 1 }); await lifecycle.close(1000);
  } finally {
    prepareGate.resolve(); registerGate.resolve(); await opening.catch(() => {});
    if (f.child.exitCode === null) { f.child.exitCode = 0; f.child.emit('close'); }
    lifecycle.nativeSegmentWaits?.revoke(); await lifecycle.nativeSegmentWaits?.settle(f.options.deadlineAt);
    await f.work.cancelAndDrain('fixture complete');
  }
});

test('COS97 native registration expiry keeps raw PID ownership and never dispatches CDP', async t => {
  const f = await fixture(t), waits = native(f), lifecycle = f.lifecycle(), entered = deferred(), gate = deferred();
  const persist = f.controller.registerOwnedChild.bind(f.controller);
  t.mock.method(f.controller, 'registerOwnedChild', async (pid: number, ticket: string) => { entered.resolve(); await gate.promise; return persist(pid, ticket); });
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: f.base });
  const opening = lifecycle.open(f.root, 15000), rejected = assert.rejects(opening, (error: any) => error.stage === 'register_authority');
  try {
    await entered.promise; t.mock.timers.tick(55000); await rejected;
    assert.ok(waits.snapshot().segments[0].rawOperationsPending > 0);
    const draining = assert.rejects(f.work.cancelAndDrain('fixture stop', 100), /did not quiesce/); t.mock.timers.tick(100); await draining;
  } finally {
    gate.resolve(); f.child.exitCode = 0; f.child.emit('close'); await opening.catch(() => {});
    lifecycle.nativeSegmentWaits?.revoke(); await lifecycle.nativeSegmentWaits?.settle(f.options.deadlineAt);
  }
  assert.equal(f.counts().connections, 0); assert.equal((await f.children())[0].pid, f.child.pid);
  assert.equal(waits.snapshot().segments[0].rawOperationsPending, 0);
  await assert.rejects(f.work.cancelAndDrain('fixture settled'), error => error instanceof AggregateError);
});

function mockRunner(t: TestContext, f: Awaited<ReturnType<typeof fixture>>, goto: (options: { timeout: number }) => Promise<unknown>) {
  const events: string[] = []; let video = '';
  const page: any = { video: () => null, setViewportSize: async () => {}, setDefaultTimeout: (timeout: number) => { assert.equal(timeout, 2000); }, on: () => {},
    isClosed: () => false, url: () => 'http://127.0.0.1:32123/', locator: () => ({ isVisible: async () => true }),
    screenshot: async ({ path }: { path: string }) => { writeFileSync(path, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])); },
    screencast: { start: async ({ path }: { path: string }) => { video = path; }, stop: async () => { writeFileSync(video, 'fixture webm'); } },
    goto: async (_url: string, options: { timeout: number }) => { events.push('goto'); return goto(options); } };
  Object.assign(f.context, { route: async () => { events.push('route'); }, newPage: async () => {
    if (f.options.nativeValidationWaits) await assert.rejects(f.options.nativeValidationWaits.runRequest(async () => {}), /closed/);
    events.push('page'); return page;
  }, newCDPSession: async () => ({ on: () => {}, send: async () => { events.push('driver-ready'); } }) });
  const kill = process.kill;
  t.mock.method(process, 'kill', (pid: number, signal?: number | NodeJS.Signals) => {
    if (pid === f.child.pid && signal === 0) throw Object.assign(new Error('Synthetic child absent'), { code: 'ESRCH' }); return kill(pid, signal);
  });
  t.mock.method(childProcess, 'execFile', ((file: string, args: string[], _options: unknown, done: (error: null) => void) => {
    assert.equal(file, 'taskkill.exe'); assert.deepEqual(args, ['/pid', String(f.child.pid), '/T', '/F']); f.child.exitCode = 0; f.child.emit('close'); done(null);
    return new EventEmitter();
  }) as any); syncBuiltinESMExports();
  const plan: any = { formatVersion: '1.0.0', projectId: 'fixture', taskId: 'browser', runId: 'fixture', reportId: 'fixture-report', specVersion: 'v1',
    artifact: { artifactId: 'game', version: 'v1', location: 'game' }, url: 'http://127.0.0.1:32123/', viewport: { width: 1280, height: 720 },
    acceptanceIds: ['visible'], steps: [{ id: 'visible', kind: 'assert', acceptanceId: 'visible', observation: { kind: 'visible', selector: '#game' }, expected: true, timeoutMs: 100 }] };
  return { plan, events, page };
}

test('COS97 native runner waits through authority and navigation before normal input and cleanup', async t => {
  const prepareEntered = deferred(), prepareGate = deferred(), navEntered = deferred(), navGate = deferred(); let checks = 0;
  const f = await fixture(t, async () => { if (++checks === 1) { prepareEntered.resolve(); await prepareGate.promise; } }, 900000), waits = native(f), lifecycle = f.lifecycle();
  const driver = mockRunner(t, f, async options => {
    assert.equal(options.timeout, 300000); assert.equal(waits.snapshot().segments[0].state, 'navigating');
    navEntered.resolve(); await navGate.promise; return { ok: () => true, status: () => 200 };
  });
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: f.base }); let settled = false;
  const running = runAcceptanceInOwnedSession(driver.plan, { evidenceRoot: f.root, timeoutMs: 900000 }, lifecycle); void running.then(() => { settled = true; });
  try {
    await prepareEntered.promise; t.mock.timers.tick(25000); await new Promise(setImmediate); assert.equal(settled, false); prepareGate.resolve();
    assert.equal(await Promise.race([navEntered.promise.then(() => 'navigation'), running.then(() => 'ended')]), 'navigation');
    t.mock.timers.tick(25000); await new Promise(setImmediate); assert.equal(settled, false); navGate.resolve();
    const report = await running; assert.equal(report.outcome, 'passed', report.errors.join('; ')); assert.equal(report.cleanup.processExited, true);
    assert.deepEqual(driver.events, ['route', 'page', 'driver-ready', 'goto']); assert.equal(waits.snapshot().segments[0].state, 'closed');
    assert.equal(waits.snapshot().segments[0].rawOperationsPending, 0); assert.equal(report.steps[0].outcome, 'passed');
  } finally { prepareGate.resolve(); navGate.resolve(); await running; f.child.exitCode = 0; f.child.emit('close');
    lifecycle.nativeSegmentWaits?.revoke(); await lifecycle.nativeSegmentWaits?.settle(f.options.deadlineAt); await f.work.cancelAndDrain('fixture complete'); }
});

test('COS97 legacy runner retains its original 15 second navigation limit', async t => {
  const f = await fixture(t), navEntered = deferred(), gate = deferred(), lifecycle = f.lifecycle();
  const driver = mockRunner(t, f, async options => { assert.equal(options.timeout, 15000); navEntered.resolve(); await gate.promise; return { ok: () => true }; });
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: f.base });
  const running = runAcceptanceInOwnedSession(driver.plan, { evidenceRoot: f.root, timeoutMs: 60000 }, lifecycle);
  try { await navEntered.promise; t.mock.timers.tick(15001); const report = await running; assert.equal(report.outcome, 'failed'); assert.ok(report.errors.some(error => /timed out/i.test(error))); }
  finally { gate.resolve(); await running; await f.work.cancelAndDrain('fixture complete'); }
});

test('COS97 native runner dispatches no next input after an HTTP source failure awaiting close', async t => {
  const f = await fixture(t, async () => {}, 900000), waits = native(f), lifecycle = f.lifecycle(), source = new Error('Observed source drift before close');
  const entered = deferred(), gate = deferred(), checked = deferred<{ inputs: number; pending: number }>(); let inputs = 0, failed: Promise<void> | undefined;
  const driver = mockRunner(t, f, async () => ({ ok: () => true, status: () => 200 }));
  driver.plan.steps.push({ id: 'next-input', kind: 'locator-click', selector: '#next', timeoutMs: 100 });
  driver.page.locator = () => ({ click: async () => { inputs++; }, isVisible: async () => {
    const request = waits.runRequest(async current => current.runStage('http_pre_authority', async life => {
      const { recordNativeValidationFailure } = await import('../../src/acceptance/native-validation-waits.ts');
      recordNativeValidationFailure(life.signal, source); entered.resolve(); await gate.promise; throw source;
    }));
    failed = assert.rejects(request, error => error === source); await entered.promise;
    setImmediate(() => { checked.resolve({ inputs, pending: waits.snapshot().segments[0].rawOperationsPending }); gate.resolve(); }); return true;
  } });
  try {
    const report = await runAcceptanceInOwnedSession(driver.plan, { evidenceRoot: f.root, timeoutMs: 900000 }, lifecycle);
    assert.deepEqual(await checked.promise, { inputs: 0, pending: 1 }); assert.equal(inputs, 0); assert.equal(report.outcome, 'failed');
    assert.ok(report.errors.some(error => error.includes(source.message))); assert.equal(report.nativeWaits?.segment.firstCause?.message, source.message);
  } finally { gate.resolve(); await failed; await f.work.cancelAndDrain('fixture complete'); }
});
