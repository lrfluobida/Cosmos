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
async function fixture(t: TestContext, verifyBinding: (callerSignal?: AbortSignal) => Promise<void> = async () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'cos92-launch-')), profile = join(root, 'profile'); await mkdir(profile);
  const controller = await RunController.create({ root, runId: 'fixture', ledgerId: 'fixture', kind: 'evaluation', scope: 'validation', specVersion: 'v1',
    allocations: [{ taskId: 'browser', amountMicroCny: 1 }], durationMs: 60000, now: () => Date.now() });
  const work = new OwnedWork(controller.signal), base = Date.now(), deadlineAt = base + 60000;
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
  t.mock.method(chromium, 'connectOverCDP', async () => { connections++; return { newBrowserCDPSession: async () => cdp,
    contexts: () => [{ pages: () => [], addInitScript: async () => {} }] } as any; });
  const options: any = { evidenceRoot: root, deadlineAt, verifyBinding, ownedChild };
  const lifecycle = () => ownedPersistentBrowserLifecycle({ url: 'http://127.0.0.1:32123/' } as any, options, { profile, deadlineAt, signal: work.signal });
  return { root, controller, work, base, options, lifecycle, child, counts: () => ({ spawns, registrations, connections }),
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
