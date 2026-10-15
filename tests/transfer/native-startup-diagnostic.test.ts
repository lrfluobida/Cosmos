import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { OwnedAcceptanceLifecycle } from '../../src/acceptance/runner.ts';
import { createDiagnosticObserver, createMethodPatches, recordedProcessesExited } from './native-startup-observer.fixture.ts';
import type { DiagnosticObserver, DiagnosticPatches } from './native-startup-observer.fixture.ts';

const actualSelected = process.env.COS93_DIAGNOSTIC_SOURCE !== undefined || process.env.COS93_DIAGNOSTIC_HISTORY !== undefined;
const stopMessage = 'DiagnosticStartupComplete: verified native startup reached context.newPage';

const observer = (now?: () => number) => createDiagnosticObserver({ now });
type Observer = DiagnosticObserver;

class DiagnosticStartupComplete extends Error {
  constructor() { super(stopMessage); this.name = 'DiagnosticStartupComplete'; }
}

function observedLifecycle(t: TestContext, lifecycle: OwnedAcceptanceLifecycle, trace: Observer, patches = createMethodPatches(trace)): OwnedAcceptanceLifecycle {
  t.after(() => { patches.restore(); });
  return {
    ...lifecycle,
    async open(...args) {
      trace.event('lifecycle.open.arguments', { timeoutMs: args[1], deadlineAt: args[2]?.deadlineAt });
      trace.phase('open.started');
      const result = await trace.span('lifecycle.open', () => lifecycle.open(...args));
      trace.phase('open.returned');
      const identity = lifecycle.identity();
      assert.ok(identity, 'The stop seam requires the completed native identity');
      assert.deepEqual(identity.cdp?.browserProcessIds, [identity.browserPid]);
      assert.deepEqual(identity.cdp?.profileArguments, ['--user-data-dir=' + identity.profile]);
      assert.equal(identity.commandLineProfile, identity.profile);
      trace.event('lifecycle.identity', { browserPid: identity.browserPid, profile: identity.profile, commandLineProfile: identity.commandLineProfile,
        origin: identity.origin, cdpBrowserPid: identity.cdp?.browserProcessIds[0] ?? null });
      patches.replace(result.context, 'route', original => function (this: unknown, ...routeArgs: unknown[]) { return trace.span('context.route', () => Reflect.apply(original, this, routeArgs)); });
      patches.replace(result.context, 'newPage', () => async () => {
        trace.event('diagnostic.stop', { point: 'context.newPage', browserPid: lifecycle.identity()?.browserPid ?? null });
        throw new DiagnosticStartupComplete();
      });
      return result;
    },
    close(...args) { trace.phase('close.started'); return trace.span('lifecycle.close', () => lifecycle.close(...args)); },
  };
}

async function installActualLifecycleObserver(t: TestContext, trace: Observer, patches: DiagnosticPatches,
  navigation?: () => ReturnType<typeof import('./native-startup-diagnostic.fixture.ts')['createNavigationDiagnosticMode']> | undefined) {
  assert.ok(process.execArgv.includes('--experimental-test-module-mocks'), 'Actual diagnosis requires --experimental-test-module-mocks to observe the literal lifecycle.open call');
  const runnerUrl = new URL('../../src/acceptance/runner.ts', import.meta.url);
  const runner = await import(runnerUrl.href);
  t.mock.module(runnerUrl, { namedExports: {
    ...runner,
    runAcceptanceInOwnedSession: (plan: unknown, options: unknown, lifecycle: OwnedAcceptanceLifecycle) => {
      const mode = navigation?.();
      if (!mode) return runner.runAcceptanceInOwnedSession(plan, options, observedLifecycle(t, lifecycle, trace, patches));
      return (async () => {
        const { observeNavigationDiagnosticLifecycle } = await import('./native-startup-diagnostic.fixture.ts');
        const observed = observeNavigationDiagnosticLifecycle(lifecycle, mode, trace, mode.readyExpectation());
        try { return await mode.run(plan, () => runner.runAcceptanceInOwnedSession(plan, options, observed.lifecycle), observed.navigationSucceeded); }
        finally { observed.restore(); }
      })();
    },
  } });
}

async function temporary(t: TestContext, beforeRemove: () => Promise<void> = async () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'cos93-native-startup-'));
  t.after(async () => {
    await beforeRemove();
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
    assert.ok(root.includes('cos93-native-startup-'));
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

test('COS93 native factory exposes the existing production browser IO', { skip: actualSelected }, async () => {
  const host = await import('../../src/runtime/entrypoint-host.ts');
  assert.equal(typeof (host as Record<string, unknown>).createNativeBrowserHostIO, 'function',
    'The production native IO factory must be exported for transparent diagnostic decoration');
});

test('COS93 timing preserves results, errors, nesting and independent open boundaries', { skip: actualSelected }, async () => {
  let now = 100; const trace = observer(() => now), value = {}, failure = new Error('source changed');
  assert.equal(await trace.span('nativeIO.playPersistent', async () => {
    now = 110;
    const result = await trace.span('lifecycle.open', async () => { now = 125; return value; });
    now = 140;
    await trace.span('context.route', async () => { now = 150; });
    return result;
  }), value);
  await assert.rejects(trace.span('source', async () => { throw failure; }), error => error === failure);
  const { spans } = trace.snapshot();
  assert.deepEqual(spans.slice(0, 3).map(row => [row.name, row.durationMs, row.parentId]), [
    ['nativeIO.playPersistent', 50, null], ['lifecycle.open', 15, 1], ['context.route', 10, 1],
  ]);
  assert.equal(spans[3].outcome, 'threw');
  assert.deepEqual(spans[3].error, { name: 'Error', message: 'source changed' });
});

test('COS93 diagnostic stop follows native CDP identity and closes normally before drain', { skip: actualSelected }, async t => {
  let cleanup = async () => {};
  const root = await temporary(t, () => cleanup()), profile = join(root, 'profile'); await mkdir(profile);
  const [{ chromium }, { ownedPersistentBrowserLifecycle }, { runAcceptanceInOwnedSession }, { RunController }, { OwnedWork }, host] = await Promise.all([
    import('@playwright/test'), import('../../src/acceptance/persistent.ts'), import('../../src/acceptance/runner.ts'),
    import('../../src/runtime/run.ts'), import('../../src/runtime/recovery/owned-work.ts'), import('../../src/runtime/entrypoint-host.ts'),
  ]);
  const controller = await RunController.create({ root: join(root, 'ledger'), runId: 'fixture', ledgerId: 'fixture', kind: 'evaluation', scope: 'validation',
    specVersion: 'v1', allocations: [{ taskId: 'browser', amountMicroCny: 1 }], durationMs: 60_000 });
  const work = new OwnedWork(controller.signal), deadlineAt = Date.now() + 60_000, trace = observer();
  cleanup = async () => { t.mock.restoreAll(); syncBuiltinESMExports(); await work.cancelAndDrain('fixture finally'); await controller.close(); };
  const child: any = Object.assign(new EventEmitter(), { pid: 424242, exitCode: null, signalCode: null });
  let spawns = 0, registrations = 0, connections = 0, routes = 0, pageCreations = 0;
  const register = controller.registerOwnedChild.bind(controller);
  t.mock.method(controller, 'registerOwnedChild', async (pid: number, ticket: string) => { registrations++; assert.equal(connections, 0); await register(pid, ticket);
    trace.event('controller.registerOwnedChild.done', { pid, ticket, taskId: null, windowId: null }); });
  // This is a deterministic transport seam; no browser process or CDP server starts.
  t.mock.method(childProcess, 'spawn', () => { spawns++; writeFileSync(join(profile, 'DevToolsActivePort'), '12345\n/devtools/browser/mock\n', 'utf8'); return child; });
  syncBuiltinESMExports();
  const context: any = { pages: () => [], addInitScript: async () => {}, route: async () => { routes++; }, newPage: async () => { pageCreations++; throw new Error('No gameplay page may be created'); } };
  const cdp: any = { send: async (method: string) => {
    if (method === 'SystemInfo.getProcessInfo') return { processInfo: [{ type: 'browser', id: child.pid }] };
    if (method === 'Browser.getBrowserCommandLine') return { arguments: ['--user-data-dir=' + profile] };
    if (method === 'Browser.close') { child.exitCode = 0; child.emit('close'); return {}; }
    throw new Error('Unexpected CDP method: ' + method);
  } };
  t.mock.method(chromium, 'connectOverCDP', () => trace.span('cdp.connect', async () => { connections++; return { version: () => 'synthetic-transport', close: async () => {},
    newBrowserCDPSession: async () => cdp, contexts: () => [context] } as any; }));
  const plan: any = { formatVersion: '1.0.0', projectId: 'fixture', taskId: 'browser', runId: 'fixture', reportId: 'diagnostic', specVersion: 'v1',
    artifact: { artifactId: 'game', version: 'v1', location: 'game' }, url: 'http://127.0.0.1:32123/', viewport: { width: 1280, height: 720 },
    acceptanceIds: ['visible'], steps: [{ id: 'visible', kind: 'assert', acceptanceId: 'visible', observation: { kind: 'visible', selector: '#game' }, expected: true, timeoutMs: 100 }] };
  const verifyBinding = async () => trace.event('binding');
  const options = { evidenceRoot: root, deadlineAt, verifyBinding, ownedChild: host.createPersistentOwnedChild({ controller, work },
    { taskId: 'browser', windowId: null, deadlineAt: new Date(deadlineAt).toISOString() }, verifyBinding) };
  const lifecycle = ownedPersistentBrowserLifecycle(plan, options, { profile, deadlineAt, signal: work.signal });
  const report = await runAcceptanceInOwnedSession(plan, { evidenceRoot: root, timeoutMs: 60_000 }, observedLifecycle(t, lifecycle, trace));
  await trace.span('ownedWork.drain', () => work.cancelAndDrain('diagnostic complete'));
  assert.deepEqual({ spawns, registrations, connections, routes, pageCreations }, { spawns: 1, registrations: 1, connections: 1, routes: 1, pageCreations: 0 });
  assert.equal(report.outcome, 'failed'); assert.deepEqual(report.errors, ['Browser startup/execution: ' + stopMessage]);
  assert.ok(report.steps.every(step => step.outcome === 'skipped'));
  assert.equal(report.cleanup.forced, false); assert.equal(report.cleanup.processExited, true);
  assert.equal(report.session?.closeEvent, true); assert.equal(report.session?.exitConfirmed, true);
  const snapshot = trace.snapshot(), open = snapshot.spans.find(row => row.name === 'lifecycle.open')!;
  const route = snapshot.spans.find(row => row.name === 'context.route')!, close = snapshot.spans.find(row => row.name === 'lifecycle.close')!;
  const stops = snapshot.events.filter(row => row.name === 'diagnostic.stop');
  assert.equal(stops.length, 1); assert.equal(open.outcome, 'returned'); assert.equal(close.outcome, 'returned');
  assert.ok(open.endMs! <= route.startMs && route.endMs! <= stops[0].atMs && stops[0].atMs <= close.startMs);
  assert.equal((snapshot.events.find(row => row.name === 'lifecycle.open.arguments')!.data as any).timeoutMs, 15_000);
  const { registeredBrowserBeforeCdp } = await import('./native-startup-diagnostic.fixture.ts');
  assert.equal(registeredBrowserBeforeCdp(snapshot, report.session!.browserPid), true, 'The actual scalar PID event feeds the startup success condition');
  assert.equal(registeredBrowserBeforeCdp(snapshot, report.session!.browserPid + 1), false);
  assert.equal(registeredBrowserBeforeCdp({ ...snapshot, events: snapshot.events.filter(event => event.name !== 'controller.registerOwnedChild.done') }, report.session!.browserPid), false);
  assert.deepEqual(JSON.parse(await readFile(join(root, report.reportPath), 'utf8')), report);
});

test('COS93 diagnostic stop cannot classify deadline, cancellation or source rejection as completed startup', { skip: actualSelected }, async t => {
  const { DeadlineError, AcceptanceCancelledError } = await import('../../src/acceptance/deadline.ts');
  for (const failure of [new DeadlineError('launch timed out'), new AcceptanceCancelledError('launch cancelled'), new Error('source changed')]) {
    const trace = observer(); let identityCalls = 0, closes = 0;
    const lifecycle: OwnedAcceptanceLifecycle = { deadlineAt: Date.now() + 60_000, open: async () => { throw failure; },
      identity: () => { identityCalls++; return undefined; }, process: () => undefined, close: async () => { closes++; } };
    await assert.rejects(observedLifecycle(t, lifecycle, trace).open('unused', 15_000), error => error === failure);
    assert.equal(identityCalls, 0); assert.equal(closes, 0);
    assert.deepEqual(trace.snapshot().events.filter(row => row.name === 'diagnostic.stop'), []);
    assert.equal(trace.snapshot().spans[0].outcome, 'threw');
    assert.equal(failure instanceof DiagnosticStartupComplete, false);
  }
});

test('COS93 fixture refuses original write roots and missing or misplaced history material', { skip: actualSelected }, async t => {
  const root = await temporary(t), source = join(root, 'source'); await mkdir(source);
  const fixture = await import('./native-startup-diagnostic.fixture.ts');
  await assert.rejects(fixture.assertDiagnosticWriteRoot(source, source));
  await assert.rejects(fixture.assertDiagnosticWriteRoot(join(source, 'output'), source));
  await assert.rejects(fixture.requireDiagnosticInputs(source, join(source, '.cosmos/reconciliation/snapshot-after-case14-supplement.json')));
  const misplaced = join(source, 'snapshot-after-case14-supplement.json'); await writeFile(misplaced, '{}\n', 'utf8');
  await assert.rejects(fixture.requireDiagnosticInputs(source, misplaced));
});

test('COS93 fixture invalid preclaim fails before controller or browser and preserves its source', { skip: actualSelected }, async t => {
  const root = await temporary(t), sourceRepository = join(root, 'source'), folder = join(sourceRepository, '.cosmos/reconciliation');
  await mkdir(folder, { recursive: true }); const historySnapshot = join(folder, 'snapshot-after-case14-supplement.json');
  await writeFile(historySnapshot, '{}\n', 'utf8'); const before = await readFile(historySnapshot);
  const { diagnoseNativeStartup } = await import('./native-startup-diagnostic.fixture.ts');
  const result = await diagnoseNativeStartup({ sourceRepository, historySnapshot, observer: observer() }, t);
  assert.equal(result.outcome, 'diagnostic_incomplete'); assert.equal(result.phase, 'preparation'); assert.equal(result.nativeCalls, 0);
  assert.equal(result.startup.outcome, 'not_reached'); assert.equal(result.startup.failingGate?.operation, 'preparation');
  assert.deepEqual(result.hostVerification, { returned: false, evidence: null });
  assert.equal(result.cleanup.controllerClosed, false); assert.deepEqual(result.spawned, []); assert.equal(result.report, null);
  assert.equal(result.preservation.unchanged, true); assert.deepEqual(await readFile(historySnapshot), before);
});

test('COS93 fixture preserves returned verification failure and distinguishes an unreached startup', { skip: actualSelected }, async () => {
  const fixture = await import('./native-startup-diagnostic.fixture.ts');
  const classify = (fixture as Record<string, any>).classifyDiagnosticStartup;
  assert.equal(typeof classify, 'function', 'Returned failed host evidence must become a visible diagnostic cause');
  const failed: any = { outcome: 'failed', summary: 'Validation scope check timed out.',
    source: { artifactId: 'fixture-host-report', version: 'v1', location: 'evidence/coding/host-report.json' } };
  const trace: any = { spans: [{ id: 2197, name: 'scope.read', outcome: 'threw', durationMs: 5014.7298,
    error: { name: 'ValidationScopeTimeoutError', message: failed.summary } }], events: [] };
  const result = classify({ nativeCalls: 0, startupPassed: false, hostEvidence: [failed], trace, phase: 'cleanup' });
  assert.equal(result.outcome, 'not_reached'); assert.equal(result.reason, failed.summary);
  assert.deepEqual(result.failingGate, { operation: 'scope.read', summary: failed.summary, source: failed.source, traceSpanId: 2197, durationMs: 5014.7298 });
  assert.equal(classify({ nativeCalls: 0, startupPassed: true, hostEvidence: [], trace: { spans: [], events: [] }, phase: 'cleanup' }).outcome, 'not_reached');
  const expectedStop = classify({ nativeCalls: 1, startupPassed: true, hostEvidence: [{ ...failed, summary: stopMessage }], trace, phase: 'cleanup' });
  assert.equal(expectedStop.outcome, 'passed'); assert.equal(expectedStop.failingGate, null);
  const rejection = classify({ nativeCalls: 0, startupPassed: false, hostEvidence: undefined, trace: { spans: [], events: [] },
    phase: 'preparation', error: { name: 'Error', message: 'Actual source bytes changed' } });
  assert.equal(rejection.outcome, 'not_reached'); assert.equal(rejection.reason, 'Actual source bytes changed');
  assert.equal(rejection.failingGate.operation, 'preparation');
});

test('COS93 actual history native startup', { skip: !actualSelected }, async t => {
  const sourceRepository = process.env.COS93_DIAGNOSTIC_SOURCE, historySnapshot = process.env.COS93_DIAGNOSTIC_HISTORY;
  assert.ok(sourceRepository && sourceRepository.trim(), 'COS93_DIAGNOSTIC_SOURCE is required when actual history diagnosis is selected');
  assert.ok(historySnapshot && historySnapshot.trim(), 'COS93_DIAGNOSTIC_HISTORY is required when actual history diagnosis is selected');
  const trace = observer(), patches = createMethodPatches(trace);
  let navigation: ReturnType<typeof import('./native-startup-diagnostic.fixture.ts')['createNavigationDiagnosticMode']> | undefined;
  const selectedMode = process.env.COS93_DIAGNOSTIC_MODE;
  assert.ok(selectedMode === undefined || selectedMode === 'navigation', 'Only the explicit navigation diagnostic mode is supported');
  await installActualLifecycleObserver(t, trace, patches, () => navigation);
  const { diagnoseNativeStartup, createNavigationDiagnosticMode } = await import('./native-startup-diagnostic.fixture.ts');
  if (selectedMode) navigation = createNavigationDiagnosticMode(trace);
  const result = await diagnoseNativeStartup({ sourceRepository, historySnapshot, observer: trace, patches,
    ...(navigation ? { mode: 'navigation', navigation } : {}) }, t);
  assert.equal(result.outcome, 'diagnostic_completed', JSON.stringify(result.startup));
  assert.equal(result.preservation.unchanged, true, 'Original input bytes, metadata and directory lists must remain unchanged');
  if (result.report) { assert.equal(result.report.outcome, 'failed'); assert.equal(result.report.series.segments.length, 8); }
  if (navigation) {
    assert.equal(result.formatVersion, 'cos93-native-startup-diagnostic/2');
    assert.ok('navigation' in result);
    if (result.navigation.outcome === 'passed') {
      assert.equal(result.report?.segments.length, 1); assert.equal(navigation.snapshot().stopCount, 1);
      assert.ok(result.report?.segments[0].report.steps.every(step => step.outcome === 'skipped'));
      assert.equal(result.report?.segments[0].report.cleanup.forced, false);
      assert.equal(result.startup.outcome, 'failed', 'The old whole-open contract is not retrospectively passed');
    }
    return;
  }
  if (result.startup.outcome === 'passed') {
    assert.ok(result.report); assert.equal(result.report.segments.length, 1);
    const report = result.report.segments[0].report, snapshot = trace.snapshot();
    const opens = snapshot.spans.filter(row => row.name === 'lifecycle.open');
    assert.equal(opens.length, 1); assert.equal(opens[0].outcome, 'returned'); assert.ok(opens[0].durationMs! <= 15_000);
    assert.equal(snapshot.events.filter(row => row.name === 'diagnostic.stop').length, 1);
    assert.ok(report.steps.every((step: { outcome: string }) => step.outcome === 'skipped'));
    assert.equal(report.cleanup.forced, false); assert.equal(report.session?.exitConfirmed, true); assert.equal(report.session?.closeEvent, true);
  } else assert.ok(result.startup.reason, 'An unsuccessful or unreached startup must preserve its reason');
});

test('COS93 process exit observation accepts closed records with reused or duplicate PIDs', { skip: actualSelected }, t => {
  const kill = t.mock.method(process, 'kill', (pid: number) => {
    if (pid === process.pid) return true;
    throw Object.assign(new Error('Synthetic missing PID'), { code: 'ESRCH' });
  });
  assert.equal(recordedProcessesExited([{ pid: process.pid, exit: true }, { pid: process.pid, exit: true }]), true);
  assert.equal(kill.mock.callCount(), 0, 'Exit observation must not query the current PID owner');
});

test('COS93 process exit observation rejects every unclosed record regardless of PID state', { skip: actualSelected }, t => {
  const kill = t.mock.method(process, 'kill', (pid: number) => {
    if (pid === process.pid) return true;
    throw Object.assign(new Error('Synthetic missing PID'), { code: 'ESRCH' });
  });
  const closed = { pid: process.pid, exit: true }, pending = { pid: process.pid, exit: false };
  assert.equal(recordedProcessesExited([closed, pending]), false);
  assert.equal(recordedProcessesExited([pending, closed]), false);
  assert.equal(recordedProcessesExited([{ pid: process.pid + 1, exit: false }]), false);
  assert.equal(kill.mock.callCount(), 0, 'A missing PID cannot substitute for an original close event');
});

test('COS93 observer preserves this, exact Promise and errors and restores own or inherited methods', { skip: actualSelected }, async () => {
  const api: any = await import('./native-startup-observer.fixture.ts');
  assert.equal(typeof api.createDiagnosticObserver, 'function', 'Bounded observer is missing');
  const trace = api.createDiagnosticObserver(), patches = api.createMethodPatches(trace), value = {}, promise = Promise.resolve(value);
  const syncError = new Error('exact synchronous error'), asyncError = new Error('exact rejection');
  const base = { read(this: any, input: unknown) { assert.equal(input, value); assert.equal(this.tag, 'receiver'); return promise; } };
  const target = Object.assign(Object.create(base), { tag: 'receiver', fail() { throw syncError; } });
  const own = Object.getOwnPropertyDescriptor(target, 'fail'); let calls = 0;
  patches.replace(target, 'read', (original: Function) => function (this: unknown, ...args: unknown[]) { calls++; return trace.span('read', () => Reflect.apply(original, this, args)); });
  patches.replace(target, 'fail', (original: Function) => function (this: unknown) { return trace.span('fail', () => Reflect.apply(original, this, [])); });
  assert.equal(target.read(value), promise); assert.equal(await promise, value); assert.equal(calls, 1);
  assert.throws(() => target.fail(), error => error === syncError);
  const rejected = Promise.reject(asyncError); assert.equal(trace.span('reject', () => rejected), rejected);
  await assert.rejects(rejected, error => error === asyncError);
  assert.equal(patches.restore(), true); assert.equal(Object.hasOwn(target, 'read'), false);
  assert.deepEqual(Object.getOwnPropertyDescriptor(target, 'fail'), own);
  patches.replace(target, 'read', (original: Function) => original);
  const fixed = Object.freeze({ method() {} });
  assert.throws(() => patches.replace(fixed, 'method', () => () => {}));
  assert.equal(Object.hasOwn(target, 'read'), false, 'A failed installation rolls prior replacements back');
  assert.equal(trace.status().incomplete, true);
});

test('COS93 observer retains no per-call real controller snapshots', { skip: actualSelected }, async t => {
  assert.equal(typeof global.gc, 'function', 'Use --expose-gc for the bounded reference test');
  const api: any = await import('./native-startup-observer.fixture.ts');
  assert.equal(typeof api.createMethodPatches, 'function', 'Non-recording method wrapper is missing');
  const { RunController } = await import('../../src/runtime/run.ts');
  let cleanup = async () => {}; const root = await temporary(t, () => cleanup());
  const controller = await RunController.create({ root: join(root, 'ledger'), runId: 'small-retention', ledgerId: 'small-retention',
    kind: 'evaluation', scope: 'validation', specVersion: '1.0', durationMs: 60000, allocations: [{ taskId: 'tiny', amountMicroCny: 1 }] });
  const trace = api.createDiagnosticObserver(), patches = api.createMethodPatches(trace), before = Object.getOwnPropertyDescriptor(RunController.prototype, 'serial');
  cleanup = async () => { patches.restore(); await controller.close(); };
  patches.replace(RunController.prototype, 'serial', (original: Function) => function (this: unknown, action: (...args: unknown[]) => unknown) {
    return trace.span('controller.queue', () => Reflect.apply(original, this, [function (this: unknown, ...args: unknown[]) {
      return trace.span('controller.execute', () => Reflect.apply(action, this, args));
    }]));
  });
  const refs: WeakRef<object>[] = [];
  async function reads() { for (let index = 0; index < 8; index++) refs.push(new WeakRef(await controller.read())); }
  async function collect() { for (let index = 0; index < 4; index++) { await new Promise<void>(resolve => setImmediate(resolve)); global.gc!(); } await new Promise<void>(resolve => setImmediate(resolve)); }
  await reads(); await collect(); assert.ok(refs.filter(ref => ref.deref()).length <= 1, 'Only the original pending Promise may retain the last result');
  await controller.stop('Bounded small observer fixture'); await collect(); assert.equal(refs.filter(ref => ref.deref()).length, 0);
  assert.equal(patches.restore(), true); assert.deepEqual(Object.getOwnPropertyDescriptor(RunController.prototype, 'serial'), before);
  assert.equal(trace.status().incomplete, false); assert.equal(trace.snapshot().spans.length, 18);
  assert.equal(trace.snapshot().spans.filter((span: any) => span.name === 'controller.queue').length, 9);
});

test('COS93 observer pending and over-limit promises do not retain operation closures', { skip: actualSelected }, async () => {
  assert.equal(typeof global.gc, 'function', 'Use --expose-gc for the small pending Promise contrast');
  const trace = createDiagnosticObserver({ maxSpans: 1 });
  const directPromise = new Promise(() => {}), observedPromise = new Promise(() => {}), droppedPromise = new Promise(() => {});
  let droppedThenCalls = 0; const originalThen = droppedPromise.then;
  Object.defineProperty(droppedPromise, 'then', { value: function (this: Promise<unknown>, ...args: Parameters<typeof originalThen>) {
    droppedThenCalls++; return Reflect.apply(originalThen, this, args);
  } });
  function attach(promise: Promise<unknown>, mode: string) {
    const payload = { tag: mode, bytes: 'x'.repeat(1024) };
    const operation = () => { assert.equal(payload.tag, mode); return promise; };
    const refs = [new WeakRef(payload), new WeakRef(operation)];
    assert.equal(mode === 'direct' ? operation() : trace.span(mode, operation), promise);
    return refs;
  }
  const direct = attach(directPromise, 'direct'), observed = attach(observedPromise, 'observed'), dropped = attach(droppedPromise, 'dropped');
  for (let index = 0; index < 6; index++) { await new Promise<void>(resolve => setImmediate(resolve)); global.gc!(); }
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.ok([directPromise, observedPromise, droppedPromise].every(promise => promise instanceof Promise));
  const retained = { direct: direct.map(ref => !!ref.deref()), observed: observed.map(ref => !!ref.deref()), overLimit: dropped.map(ref => !!ref.deref()) };
  assert.deepEqual(retained, { direct: [false, false], observed: [false, false], overLimit: [false, false] });
  assert.equal(droppedThenCalls, 0, 'An unrecorded row must not install Promise settlement handlers');
  assert.equal(trace.status().spanCount, 1); assert.equal(trace.status().dropped, 1);
});

test('COS93 observer bounds scalar records and does not retain object arguments', { skip: actualSelected }, async () => {
  const api: any = await import('./native-startup-observer.fixture.ts');
  assert.equal(typeof api.createDiagnosticObserver, 'function');
  const trace = api.createDiagnosticObserver({ maxSpans: 1, maxEvents: 2, maxBytes: 1024 });
  const value = {}; assert.equal(trace.span('first', () => value), value); assert.equal(trace.span('overflow', () => value), value);
  trace.event('one', { pid: 1 }); trace.event('two', { pid: 2 }); trace.event('three', { pid: 3 });
  assert.equal(trace.snapshot().spans.length, 1); assert.equal(trace.snapshot().events.length, 2); assert.equal(trace.status().incomplete, true);
  const objectTrace = api.createDiagnosticObserver(); objectTrace.event('bad', { value, callback() {} });
  assert.deepEqual(objectTrace.snapshot().events, []); assert.equal(objectTrace.status().firstFailure.kind, 'non_scalar');
  const byteTrace = api.createDiagnosticObserver({ maxBytes: 80 }); byteTrace.event('oversized', { message: 'x'.repeat(100) });
  assert.equal(byteTrace.snapshot().events.length, 0); assert.equal(byteTrace.status().incomplete, true);
  const stringTrace = api.createDiagnosticObserver(), originalError = new Error('x'.repeat(3000));
  stringTrace.event('bounded-text', { message: '中'.repeat(3000) });
  assert.equal(stringTrace.snapshot().events[0].data.message, '中'.repeat(2048));
  assert.throws(() => stringTrace.span('bounded-error', () => { throw originalError; }), error => error === originalError);
  assert.equal(stringTrace.snapshot().spans[0].error.message.length, 2048); assert.equal(originalError.message.length, 3000);
});

test('COS93 observer publishes before evidence once and writes bounded stage progress', { skip: actualSelected }, async t => {
  const api: any = await import('./native-startup-observer.fixture.ts');
  assert.equal(typeof api.writeProtectedBefore, 'function', 'Fatal-before evidence is missing');
  const root = await temporary(t), source = join(root, 'source'); await mkdir(source);
  await assert.rejects(api.writeProtectedBefore(source, source, {}));
  const protectedRoot = join(tmpdir(), 'cos93-protected-source');
  await api.writeProtectedBefore(root, protectedRoot, { files: [{ path: 'fixture', sha256: 'a'.repeat(64) }], directories: [] });
  const before = await readFile(join(root, 'protected-before.json'));
  await assert.rejects(api.writeProtectedBefore(root, protectedRoot, {})); assert.deepEqual(await readFile(join(root, 'protected-before.json')), before);
  const trace = api.createDiagnosticObserver(), progress = await api.openDiagnosticProgress(root, protectedRoot, trace, { maxRecords: 2 });
  trace.phase('prepared'); await progress.flush();
  assert.equal((await readFile(join(root, 'progress.ndjson'), 'utf8')).trim().split('\n').length, 1, 'Evidence exists before finally');
  trace.phase('host.verify'); trace.phase('overflow'); await progress.close();
  const lines = (await readFile(join(root, 'progress.ndjson'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(lines.map(line => line.phase), ['prepared', 'host.verify']); assert.equal(trace.status().incomplete, true);
  assert.ok(progress.status().enqueueMs >= 0); assert.ok(trace.snapshot().spans.some((span: any) => span.name === 'observer.progress.flush' && span.durationMs >= 0));
  assert.ok(lines.every(line => !Object.hasOwn(line, 'cleanupPassed')));
  await assert.rejects(api.openDiagnosticProgress(root, protectedRoot, trace));
});

test('COS93 observer reports restoration and progress I/O failure without replacing operation errors', { skip: actualSelected }, async t => {
  const api = await import('./native-startup-observer.fixture.ts'), trace = api.createDiagnosticObserver(), patches = api.createMethodPatches(trace);
  const subject = { method() {} }, descriptor = Object.getOwnPropertyDescriptor(subject, 'method')!, restoreError = new Error('synthetic restore failure');
  let blocked = false;
  const proxy = new Proxy(subject, { defineProperty(target, key, value) { if (blocked) throw restoreError; return Reflect.defineProperty(target, key, value); } });
  patches.replace(proxy, 'method', original => original); blocked = true;
  assert.equal(patches.restore(), false); assert.equal(trace.status().firstFailure?.kind, 'restore');
  blocked = false; Object.defineProperty(subject, 'method', descriptor);
  const root = await temporary(t), ioTrace = api.createDiagnosticObserver(), fs = (await import('node:fs/promises')).default;
  const original = fs.open, ioError = new Error('synthetic progress write failure'); let opens = 0;
  t.mock.method(fs, 'open', async (...args: Parameters<typeof original>) => {
    opens++; const file = await Reflect.apply(original, fs, args);
    t.mock.method(file, 'write', async () => { throw ioError; }); return file;
  }); syncBuiltinESMExports();
  try {
    const progress = await api.openDiagnosticProgress(root, join(tmpdir(), 'cos93-protected-source'), ioTrace);
    ioTrace.phase('prepared'); ioTrace.phase('host.verify'); await progress.flush(); await progress.close();
    assert.equal(opens, 1); assert.equal(progress.status().failed, true); assert.equal(progress.status().written, 0);
    assert.equal(ioTrace.status().firstFailure?.kind, 'progress_write'); assert.equal(ioTrace.status().firstFailure?.message, ioError.message);
    const actualError = new Error('original operation failed'); assert.throws(() => ioTrace.span('actual', () => { throw actualError; }), error => error === actualError);
    const { classifyDiagnosticStartup } = await import('./native-startup-diagnostic.fixture.ts');
    const result = classifyDiagnosticStartup({ nativeCalls: 1, startupPassed: true, trace: ioTrace.snapshot(), phase: 'cleanup' });
    assert.equal(result.outcome, 'failed', 'Incomplete observation cannot become a completed startup');
    assert.equal(result.failingGate?.operation, 'observer');
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
});

test('COS93 observer enforces before, progress record and total byte ceilings', { skip: actualSelected }, async t => {
  const api = await import('./native-startup-observer.fixture.ts'), source = join(tmpdir(), 'cos93-protected-source');
  const root = await temporary(t); let dangerousCalls = 0;
  await assert.rejects(async () => { await api.writeProtectedBefore(root, source, { files: ['too long'] }, 8); dangerousCalls++; }, /size limit/);
  assert.equal(dangerousCalls, 0); await assert.rejects(readFile(join(root, 'protected-before.json')), (error: NodeJS.ErrnoException) => error.code === 'ENOENT');
  for (const limit of [{ maxRecordBytes: 8 }, { maxBytes: 8 }]) {
    const output = await temporary(t), trace = api.createDiagnosticObserver(), progress = await api.openDiagnosticProgress(output, source, trace, limit);
    trace.phase('prepared'); await progress.close(); assert.equal(progress.status().queued, 0); assert.equal(progress.status().written, 0);
    assert.equal((await readFile(join(output, 'progress.ndjson'))).length, 0); assert.equal(trace.status().firstFailure?.kind, 'progress_limit');
  }
});

test('COS93 observer module seam keeps a plain function without automatic call records', { skip: actualSelected }, async t => {
  assert.ok(process.execArgv.includes('--experimental-test-module-mocks'));
  const root = await temporary(t), file = join(root, 'module.mjs'); await writeFile(file, 'export function call(value) { return value; }\n', 'utf8');
  const url = pathToFileURL(file), expected = {}, rejected = new Error('module original error'); let calls = 0;
  const implementation = (value: unknown) => { calls++; if (value === rejected) throw rejected; return value; };
  const context = t.mock.module(url, { namedExports: { call: implementation } });
  const module = await import(url.href); assert.equal(module.call, implementation); assert.equal(module.call(expected), expected);
  assert.throws(() => module.call(rejected), error => error === rejected); assert.equal(calls, 2);
  assert.equal(Object.hasOwn(module.call, 'mock'), false); context.restore();
});

test('COS93 observer preserves only written before and stage evidence after a small process exit', { skip: actualSelected }, async t => {
  const root = await temporary(t), source = join(tmpdir(), 'cos93-protected-source'), helper = new URL('./native-startup-observer.fixture.ts', import.meta.url).href;
  const script = `import {createDiagnosticObserver,writeProtectedBefore,openDiagnosticProgress} from ${JSON.stringify(helper)};
    const root=${JSON.stringify(root)}, source=${JSON.stringify(source)}, observer=createDiagnosticObserver();
    await writeProtectedBefore(root,source,{formatVersion:'small-fatal-fixture',files:[],directories:[]});
    const progress=await openDiagnosticProgress(root,source,observer);observer.phase('prepared');await progress.flush();process.exit(23);`;
  const child = childProcess.spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], { windowsHide: true, stdio: 'ignore' });
  const timer = setTimeout(() => child.kill(), 5000);
  let code: number | null;
  try { code = await new Promise<number | null>((done, reject) => { child.once('error', reject); child.once('close', done); }); } finally { clearTimeout(timer); }
  assert.equal(code, 23); assert.equal(JSON.parse(await readFile(join(root, 'protected-before.json'), 'utf8')).formatVersion, 'small-fatal-fixture');
  const lines = (await readFile(join(root, 'progress.ndjson'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(lines.map(line => line.phase), ['prepared']); assert.ok(lines.every(line => !Object.hasOwn(line, 'cleanupPassed')));
  await assert.rejects(readFile(join(root, 'result.json')), (error: NodeJS.ErrnoException) => error.code === 'ENOENT');
});

function navigationReadyPage(values: unknown[] = ['player', 'idle', true]) {
  const reads: string[] = [];
  const page: any = { locator(selector: string) { return {
    async isVisible() { reads.push(selector); return true; }, async innerText() { reads.push(selector); return '开始'; },
  }; }, async evaluate() { reads.push('debug'); return values; } };
  return { page, reads };
}

test('COS93 navigation diagnostic ready reads existing engine and dynamic board without input', async () => {
  const api: any = await import('./native-startup-diagnostic.fixture.ts');
  assert.equal(typeof api.readNavigationDiagnosticReady, 'function');
  const { page, reads } = navigationReadyPage();
  await api.readNavigationDiagnosticReady(page, { player: [4, 4], playerIndex: 0, idleIndex: 0 },
    { signal: new AbortController().signal, deadlineAt: Date.now() + 3000 });
  assert.deepEqual(reads, ['[data-testid="start"]', '[data-testid="start"]', '[data-testid="board"]',
    '[data-testid="cell-4-4"][data-player="true"]', 'debug']);
  await assert.rejects(api.readNavigationDiagnosticReady(navigationReadyPage(['player', 'idle', false]).page,
    { player: [4, 4], playerIndex: 0, idleIndex: 0 }, { signal: new AbortController().signal, deadlineAt: Date.now() + 3000 }), /engine is not ready/);
});

test('COS93 navigation diagnostic ready cancellation preserves cause and starts no next read', async () => {
  const api: any = await import('./native-startup-diagnostic.fixture.ts');
  assert.equal(typeof api.readNavigationDiagnosticReady, 'function');
  const controller = new AbortController(), reason = new Error('read cancelled'), { page, reads } = navigationReadyPage();
  let release!: (visible: boolean) => void, settled = false;
  page.locator = (selector: string) => ({ isVisible() { reads.push(selector); return new Promise<boolean>(resolve => { release = resolve; }); } });
  const pending = api.readNavigationDiagnosticReady(page, { player: [4, 4], playerIndex: 0, idleIndex: 0 },
    { signal: controller.signal, deadlineAt: Date.now() + 3000 });
  void pending.then(() => { settled = true; }, () => { settled = true; });
  controller.abort(reason); await Promise.resolve(); assert.equal(settled, false, 'The raw read remains observed until its leaf settles');
  release(true); await assert.rejects(pending, error => error === reason);
  assert.deepEqual(reads, ['[data-testid="start"]']);
});

for (const [name, response, url, expected] of [
  ['null', null, 'http://127.0.0.1:32123/', 'Startup HTTP no response'],
  ['404', { ok: () => false, status: () => 404 }, 'http://127.0.0.1:32123/', 'Startup HTTP 404'],
  ['foreign-origin', { ok: () => true, status: () => 200 }, 'http://127.0.0.1:32124/', 'Startup left the project origin'],
] as const) test(`COS93 navigation diagnostic ready preserves legacy runner ${name} failure`, async t => {
  const api: any = await import('./native-startup-diagnostic.fixture.ts');
  assert.equal(typeof api.createNavigationDiagnosticMode, 'function');
  const { runAcceptanceInOwnedSession } = await import('../../src/acceptance/runner.ts');
  const root = await temporary(t), trace = observer(), mode = api.createNavigationDiagnosticMode(trace);
  let ready = 0, closes = 0;
  const page: any = { goto: async () => response, url: () => url, video: () => null, setViewportSize: async () => {},
    screencast: { start: async () => {}, stop: async () => {} }, setDefaultTimeout() {}, on() {}, isClosed: () => false,
    screenshot: async () => Buffer.alloc(0), close: async () => {} };
  const restore = mode.observeGoto(page, { origin: 'http://127.0.0.1:32123', ready: async () => { ready++; throw new Error('No debug'); } });
  t.after(restore);
  const context: any = { route: async () => {}, newPage: async () => page, newCDPSession: async () => ({ on() {}, send: async () => {} }) };
  const lifecycle: OwnedAcceptanceLifecycle = { deadlineAt: Date.now() + 60_000, open: async () => ({ browser: { version: () => 'synthetic', close: async () => {} } as any, context }),
    identity: () => undefined, process: () => undefined, close: async () => { closes++; } };
  const plan: any = { formatVersion: '1.0.0', projectId: 'fixture', taskId: 'browser', runId: 'fixture', reportId: name, specVersion: 'v1',
    artifact: { artifactId: 'game', version: 'v1', location: 'game' }, url: 'http://127.0.0.1:32123/', viewport: { width: 1280, height: 720 },
    acceptanceIds: ['visible'], steps: [{ id: 'visible', kind: 'assert', acceptanceId: 'visible', observation: { kind: 'visible', selector: '#game' }, expected: true, timeoutMs: 100 }] };
  const report = await mode.run(plan, () => runAcceptanceInOwnedSession(plan, { evidenceRoot: root, timeoutMs: 60_000 }, lifecycle), () => false);
  assert.equal(report.outcome, 'failed'); assert.ok(report.errors.includes('Browser startup/execution: ' + expected));
  assert.equal(ready, 0); assert.equal(mode.snapshot().stopCount, 0); assert.equal(closes, 1);
  assert.ok(report.steps.every((step: any) => step.outcome === 'skipped'));
});

test('COS93 navigation diagnostic clone-stop targets the real clone once and restores descriptors', async () => {
  const api: any = await import('./native-startup-diagnostic.fixture.ts');
  assert.equal(typeof api.createNavigationDiagnosticMode, 'function');
  const trace = observer(), mode = api.createNavigationDiagnosticMode(trace), order: string[] = [];
  const value = { steps: [{ id: 'first' }, { id: 'second' }] }, before = structuredClone(value);
  const cloneDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'structuredClone'), entriesDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'entries');
  const response = { ok: () => true, status: () => 200 }, page = { goto: async () => { order.push('load'); return response; }, url: () => 'http://127.0.0.1:32123/' };
  const restore = mode.observeGoto(page, { origin: 'http://127.0.0.1:32123', ready: async () => { order.push('ready'); } });
  let navigationFinished = false, inputs = 0;
  try {
    const failure = await mode.run(value, () => {
      const clone = structuredClone(value);
      assert.deepEqual([...value.steps.entries()], [...before.steps.entries()]);
      assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'structuredClone'), cloneDescriptor);
      return (async () => { try {
        assert.equal(await page.goto(), response); navigationFinished = true; order.push('finishNavigation');
        for (const _step of clone.steps.entries()) inputs++;
        throw new Error('Expected stop');
      } catch (error) { return error; } finally { assert.throws(() => Array.prototype.entries.call(undefined), TypeError); order.push('close'); } })();
    }, () => navigationFinished);
    assert.equal(mode.isIntentionalStop(failure), true); assert.equal(mode.isIntentionalStop(new Error((failure as Error).message)), false);
    assert.equal(inputs, 0); assert.equal(mode.snapshot().stopCount, 1); assert.deepEqual(value, before);
    assert.deepEqual(order, ['load', 'ready', 'finishNavigation', 'close']);
    assert.deepEqual(Object.getOwnPropertyDescriptor(Array.prototype, 'entries'), entriesDescriptor);
  } finally { restore(); }
});

test('COS93 navigation diagnostic descriptor rejects incomplete gate and preserves original ready error', async () => {
  const api: any = await import('./native-startup-diagnostic.fixture.ts');
  assert.equal(typeof api.createNavigationDiagnosticMode, 'function');
  const mode = api.createNavigationDiagnosticMode(observer()), reason = new Error('scope rejected');
  const page = { goto: async () => ({ ok: () => true }), url: () => 'http://127.0.0.1:32123/' };
  const restore = mode.observeGoto(page, { origin: 'http://127.0.0.1:32123', ready: async () => { throw reason; } });
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'entries');
  try {
    await assert.rejects(page.goto(), error => error === reason);
    const value = { steps: [1] };
    await assert.rejects(mode.run(value, () => { const clone = structuredClone(value); return Promise.resolve().then(() => [...clone.steps.entries()]); }, () => true), error => error === reason);
    assert.equal(mode.snapshot().stopCount, 0); assert.deepEqual(Object.getOwnPropertyDescriptor(Array.prototype, 'entries'), descriptor);
  } finally { restore(); }
});

test('COS93 navigation diagnostic result requires verified native contract and separates old limits', async () => {
  const api: any = await import('./native-startup-diagnostic.fixture.ts');
  assert.equal(typeof api.summarizeNavigationDiagnostic, 'function');
  const state = { loadPassed: true, readyPassed: true, navigationPassed: true, stopCount: 1, failed: false };
  const input = { state, nativeContractVerified: false, normalCleanup: true, preservation: true, observationIncomplete: false, openMs: 25_000, navigationMs: 20_000 };
  assert.equal(api.summarizeNavigationDiagnostic(input).navigation.outcome, 'failed');
  const result = api.summarizeNavigationDiagnostic({ ...input, nativeContractVerified: true });
  assert.equal(result.formatVersion, 'cos93-native-startup-diagnostic/2'); assert.equal(result.navigation.outcome, 'passed');
  assert.deepEqual(result.oldLimits, { wholeOpen: { limitMs: 15_000, measuredMs: 25_000, withinLimit: false }, navigation: { limitMs: 15_000, measuredMs: 20_000, withinLimit: false } });
  for (const changed of [{ normalCleanup: false }, { preservation: false }, { observationIncomplete: true }, { state: { ...state, failed: true } }]) {
    assert.equal(api.summarizeNavigationDiagnostic({ ...input, nativeContractVerified: true, ...changed }).navigation.outcome, 'failed');
  }
});

test('COS93 navigation diagnostic signal wrapper forwards original caller and exact Promise', async () => {
  const api: any = await import('./native-startup-diagnostic.fixture.ts');
  assert.equal(typeof api.observeDiagnosticBinding, 'function');
  const caller = new AbortController().signal, trace = observer(), reason = new Error('original binding reason');
  let received: AbortSignal | undefined;
  const promise = Promise.reject(reason); void promise.catch(() => {});
  const binding = api.observeDiagnosticBinding(trace, (signal?: AbortSignal) => { received = signal; return promise; });
  assert.equal(binding(caller), promise); assert.equal(received, caller); await assert.rejects(promise, error => error === reason);
});

test('COS93 navigation diagnostic descriptor records synchronous failure and refuses an incomplete gate', async () => {
  const api: any = await import('./native-startup-diagnostic.fixture.ts');
  const reason = new Error('runner synchronous failure'), mode = api.createNavigationDiagnosticMode(observer()), value = { steps: [1] };
  const cloneDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'structuredClone'), entriesDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'entries');
  assert.throws(() => mode.run(value, () => { structuredClone(value); throw reason; }, () => false), error => error === reason);
  assert.equal(mode.snapshot().failed, true);
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'structuredClone'), cloneDescriptor);
  assert.deepEqual(Object.getOwnPropertyDescriptor(Array.prototype, 'entries'), entriesDescriptor);
  const incomplete = api.createNavigationDiagnosticMode(observer());
  await assert.rejects(incomplete.run(value, () => { const clone = structuredClone(value); return Promise.resolve().then(() => [...clone.steps.entries()]); }, () => false), /stop gate incomplete/);
  assert.equal(incomplete.snapshot().stopCount, 0);
  assert.deepEqual(Object.getOwnPropertyDescriptor(Array.prototype, 'entries'), entriesDescriptor);
});

function navigationDeferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve };
}
async function navigationNativeFixture(deadlineMs = 60_000) {
  const { createNativeValidationWaits } = await import('../../src/acceptance/native-validation-waits.ts');
  const { OwnedWork } = await import('../../src/runtime/recovery/owned-work.ts');
  const controller = new AbortController(), work = new OwnedWork(controller.signal), deadlineAt = Date.now() + deadlineMs;
  const waits = createNativeValidationWaits({ caseId: 'case', windowId: 'window', taskId: 'browser', deadlineAt,
    signal: work.signal, controllerSignal: controller.signal, trackRaw: start => work.run(start) });
  waits.startConsumer(); return { waits, work, controller, deadlineAt };
}

test('COS93 navigation diagnostic production lifecycle reaches ready then finish before ordinary stop', async t => {
  const api: any = await import('./native-startup-diagnostic.fixture.ts');
  assert.equal(typeof api.observeNavigationDiagnosticLifecycle, 'function');
  const { runAcceptanceInOwnedSession } = await import('../../src/acceptance/runner.ts'), f = await navigationNativeFixture();
  const root = await temporary(t), trace = observer(), mode = api.createNavigationDiagnosticMode(trace), segment = f.waits.beginSegment('navigation');
  mode.bindNativeWaits(f.waits);
  const order: string[] = [], readyPage = navigationReadyPage(), page: any = { ...readyPage.page,
    goto: async () => { order.push('load'); return { ok: () => true, status: () => 200 }; }, url: () => 'http://127.0.0.1:32123/',
    video: () => null, setViewportSize: async () => {}, screencast: { start: async () => {}, stop: async () => {} },
    setDefaultTimeout() {}, on() {}, isClosed: () => false, screenshot: async () => Buffer.alloc(0), close: async () => {} };
  const context: any = { route: async () => {}, newPage: async () => page, newCDPSession: async () => ({ on() {}, send: async () => {} }) };
  const lifecycle: OwnedAcceptanceLifecycle = { deadlineAt: f.deadlineAt, signal: f.work.signal, nativeValidationWaits: f.waits, nativeSegmentWaits: segment,
    open: async () => { for (const stage of ['prepare_authority', 'register_authority', 'browser_transport'] as const) await segment.runStage(stage, async life => { life.check(); });
      return { browser: { version: () => 'synthetic', close: async () => {} } as any, context }; },
    identity: () => undefined, process: () => undefined, close: async () => { order.push('close'); } };
  const observed = api.observeNavigationDiagnosticLifecycle(lifecycle, mode, trace, { player: [4, 4], playerIndex: 0, idleIndex: 0 }, false);
  assert.equal(observed.lifecycle.nativeValidationWaits, f.waits);
  const plan: any = { formatVersion: '1.0.0', projectId: 'fixture', taskId: 'browser', runId: 'fixture', reportId: 'navigation', specVersion: 'v1',
    artifact: { artifactId: 'game', version: 'v1', location: 'game' }, url: 'http://127.0.0.1:32123/', viewport: { width: 1280, height: 720 },
    acceptanceIds: ['visible'], steps: [{ id: 'first', kind: 'locator-click', selector: '#start', timeoutMs: 100 },
      { id: 'visible', kind: 'assert', acceptanceId: 'visible', observation: { kind: 'visible', selector: '#game' }, expected: true, timeoutMs: 100 }] };
  const original = structuredClone(plan);
  const report = await mode.run(plan, () => runAcceptanceInOwnedSession(plan, { evidenceRoot: root, timeoutMs: 60_000 }, observed.lifecycle), observed.navigationSucceeded);
  observed.restore();
  assert.deepEqual(plan, original); assert.ok(report.steps.every((step: { outcome: string }) => step.outcome === 'skipped'));
  assert.deepEqual(order, ['load', 'close']); assert.equal(report.cleanup.forced, false);
  assert.ok(report.errors.some((error: string) => error.includes('DiagnosticNavigationComplete')));
  assert.deepEqual(mode.snapshot(), { loadPassed: true, readyPassed: true, navigationPassed: true, stopCount: 1, failed: false });
  assert.equal(report.nativeWaits?.segment.stages[3].outcome, 'passed'); assert.equal(report.nativeWaits?.segment.state, 'closed');
  assert.deepEqual(f.waits.snapshot().rawReads, { started: 1, settled: 1, pending: 0 });
  await f.work.cancelAndDrain('unit complete');
});

for (const cause of ['timeout', 'controller'] as const) test(`COS93 navigation diagnostic production ready ${cause} owns late raw and preserves cause`, async t => {
  const api: any = await import('./native-startup-diagnostic.fixture.ts');
  assert.equal(typeof api.runNavigationDiagnosticReady, 'function');
  const f = await navigationNativeFixture(), segment = f.waits.beginSegment('late'), entered = navigationDeferred(), release = navigationDeferred();
  for (const stage of ['prepare_authority', 'register_authority', 'browser_transport'] as const) await segment.runStage(stage, async () => {});
  segment.beginNavigation();
  const base = Date.now(), reason = new Error('original controller reason');
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: base }); t.after(() => t.mock.timers.reset());
  let nextRead = 0, originalCaller: AbortSignal | undefined;
  const pending = segment.runStage('navigation', life => api.runNavigationDiagnosticReady(life, f.waits, async (active: any) => {
    originalCaller = life.signal; assert.ok(active.deadlineAt <= base + 3000); assert.notEqual(active.signal, life.signal);
    entered.resolve(); await release.promise; active.check(); nextRead++;
  }));
  const rejected = assert.rejects(pending, error => cause === 'controller' ? error === reason : /ready deadline/.test((error as Error).message));
  await entered.promise;
  if (cause === 'controller') f.controller.abort(reason); else t.mock.timers.tick(3000);
  await rejected; assert.ok(originalCaller); assert.equal(f.waits.snapshot().rawReads.pending, 1);
  assert.equal(segment.snapshot().rawReadsPending, 1); release.resolve();
  await Promise.resolve(); await Promise.resolve(); segment.revoke(); await segment.settle(f.deadlineAt);
  assert.equal(f.waits.snapshot().rawReads.pending, 0); assert.equal(nextRead, 0);
  await f.work.cancelAndDrain('unit complete');
});

test('COS93 navigation diagnostic production reads stop between awaited leaves and retain same caller', async () => {
  const api: any = await import('./native-startup-diagnostic.fixture.ts');
  assert.equal(typeof api.diagnosticReadCheckpoint, 'function');
  const controller = new AbortController(), reason = new Error('leaf cancelled'), gate = navigationDeferred(); let next = 0;
  const read = api.diagnosticReadCheckpoint('navigation', controller.signal);
  const pending = (async () => { await read(() => gate.promise); await read(async () => { next++; }); })();
  const rejected = assert.rejects(pending, error => error === reason); controller.abort(reason); gate.resolve(); await rejected; assert.equal(next, 0);
});

test('COS93 navigation diagnostic production ready expectation binds sealed world design and media', async () => {
  const api: any = await import('./native-startup-diagnostic.fixture.ts');
  assert.equal(typeof api.deriveNavigationReadyExpectation, 'function');
  const world = 'export const INITIAL_PLAYER: Pos = [4, 4];', design = { map: { player: [4, 4] } }, media = { characters: [{ directory: 'public/assets/player', manifest: { id: 'player', states: [{ name: 'idle' }] } }] };
  assert.deepEqual(api.deriveNavigationReadyExpectation(world, design, media), { player: [4, 4], playerIndex: 0, idleIndex: 0 });
  assert.throws(() => api.deriveNavigationReadyExpectation(world, { map: { player: [1, 1] } }, media));
  assert.throws(() => api.deriveNavigationReadyExpectation(world + world, design, media));
  assert.throws(() => api.deriveNavigationReadyExpectation(world, design, { characters: [] }));
});

test('COS93 navigation diagnostic production result refuses invented native proof and keeps v1 default', async () => {
  const api: any = await import('./native-startup-diagnostic.fixture.ts');
  assert.equal(typeof api.navigationReportVerified, 'function');
  assert.equal(await api.navigationReportVerified(undefined, undefined, undefined), false);
  const f = await navigationNativeFixture();
  assert.equal(await api.navigationReportVerified({ nativeWaits: { ...f.waits.snapshot(), taskId: 'browser' } }, f.waits,
    { diagnostics: { reportValid: true } }), false);
  const state = { loadPassed: true, readyPassed: true, navigationPassed: true, stopCount: 1, failed: false };
  for (const timing of [null, -1, Number.NaN]) assert.equal(api.summarizeNavigationDiagnostic({ state, nativeContractVerified: true,
    normalCleanup: true, preservation: true, observationIncomplete: false, openMs: timing, navigationMs: 1 }).navigation.outcome, 'failed');
  const legacy = api.classifyDiagnosticStartup({ nativeCalls: 1, startupPassed: true, trace: { spans: [], events: [] }, phase: 'cleanup' });
  assert.equal(legacy.outcome, 'passed'); await f.work.cancelAndDrain('unit complete');
});

test('COS93 navigation diagnostic production lifetime keeps original phase and clamps readiness to work deadline', async () => {
  const api: any = await import('./native-startup-diagnostic.fixture.ts');
  const { nativeCallerDisposition } = await import('../../src/acceptance/native-validation-waits.ts');
  const f = await navigationNativeFixture(7000), segment = f.waits.beginSegment('clamped');
  for (const stage of ['prepare_authority', 'register_authority', 'browser_transport'] as const) await segment.runStage(stage, async () => {});
  segment.beginNavigation();
  await segment.runStage('navigation', life => api.runNavigationDiagnosticReady(life, f.waits, async (active: any) => {
    assert.equal(active.deadlineAt, f.waits.workDeadlineAt); assert.equal(life.deadlineAt, f.waits.workDeadlineAt);
    assert.equal(nativeCallerDisposition(life.signal, f.waits, new Error()), 'active');
    assert.equal(nativeCallerDisposition(active.signal, f.waits, new Error()), 'ordinary'); active.check();
  }));
  segment.finishNavigation(); segment.revoke(); await segment.settle(f.deadlineAt); await f.work.cancelAndDrain('unit complete');
});

async function stoppedNavigationSeries(t: TestContext) {
  const api = await import('./native-startup-diagnostic.fixture.ts'), { executePersistentSeries } = await import('../../src/acceptance/persistent.ts');
  const { runAcceptanceInOwnedSession } = await import('../../src/acceptance/runner.ts');
  const { diagnosePersistentBrowser } = await import('../../src/runtime/adapters/transfer/persistent-diagnostics.ts');
  const f = await navigationNativeFixture(), root = await temporary(t), mode = api.createNavigationDiagnosticMode(observer()); mode.bindNativeWaits(f.waits);
  // Deterministic absence seam; no OS query, browser process or server starts.
  t.mock.method(process, 'kill', () => { throw Object.assign(new Error('Synthetic absent PID'), { code: 'ESRCH' }); });
  const artifact = { artifactId: 'game', version: 'v1', location: 'registry/game/v1/project' };
  const plan = (id: string): any => ({ formatVersion: '1.0.0', projectId: 'fixture', taskId: 'browser', runId: 'fixture', reportId: id, specVersion: 'v1',
    artifact, url: 'http://127.0.0.1:32123/', viewport: { width: 1280, height: 720 }, acceptanceIds: ['visible'], steps: [
      { id: 'click', kind: 'locator-click', selector: '#start', timeoutMs: 100 },
      { id: 'visible', kind: 'assert', acceptanceId: 'visible', observation: { kind: 'visible', selector: '#game' }, expected: true, timeoutMs: 100 },
      { id: 'snapshot', kind: 'assert', acceptanceId: 'visible', observation: { kind: 'debug', path: ['transfer', 'snapshot'] }, expected: 'saved', timeoutMs: 100 },
      { id: 'saved', kind: 'assert', acceptanceId: 'visible', observation: { kind: 'debug', path: ['transfer', 'saveSnapshot'] }, expected: 'saved', timeoutMs: 100 }] });
  const series: any = { formatVersion: 'persistent-acceptance/1', reportId: 'stopped-series', sourceVersion: 'a'.repeat(40), bindingSha256: 'b'.repeat(64),
    scope: { requirement: { artifactId: 'requirement', version: 'v1', location: 'requirement.json' }, design: { artifactId: 'design', version: 'v1', location: 'design.json' },
      plan: { artifactId: 'plan', version: 'v1', location: 'plan.json' }, designSha256: 'd'.repeat(64), mapVersion: 'map', acceptanceIds: ['visible'] },
    segments: ['start', 'restore', 'victory'].map(id => ({ id, prerequisite: id === 'victory' ? 'same-profile-reopened' : 'fresh-profile', plan: plan(id) })),
    checkpoint: { kind: 'close-process-reopen', afterSegment: 'restore', beforeSegment: 'victory', sameProfile: true, sameOrigin: true,
      origin: 'http://127.0.0.1:32123', expected: 'saved', snapshot: { kind: 'debug', path: ['transfer', 'snapshot'] }, savedSnapshot: { kind: 'debug', path: ['transfer', 'saveSnapshot'] } } };
  const report = await executePersistentSeries(series, { evidenceRoot: root, deadlineAt: f.deadlineAt, nativeValidationWaits: f.waits,
    signal: f.work.signal, verifyBinding: async () => {} }, async (p, session) => {
    const segment = f.waits.beginSegment(p.reportId), identity = { browserPid: 424242, profile: session.profile, commandLineProfile: session.profile,
      origin: new URL(p.url).origin, closeEvent: false, exitConfirmed: false, exitCode: null as number | null, signalCode: null,
      cdp: { browserProcessIds: [424242], profileArguments: ['--user-data-dir=' + session.profile] } };
    const process = { pid: identity.browserPid, exitCode: null as number | null, signalCode: null };
    const page: any = { ...navigationReadyPage().page, goto: async () => { await f.waits.runRequest(async request => {
      for (const stage of ['http_pre_authority', 'http_body', 'http_post_authority'] as const) await request.runStage(stage, async life => { life.check(); });
    }); return { ok: () => true, status: () => 200 }; }, url: () => p.url, video: () => null, setViewportSize: async () => {},
      screencast: { start: async (options: { path: string }) => writeFile(options.path, 'synthetic recording', 'utf8'), stop: async () => {} },
      setDefaultTimeout() {}, on() {}, isClosed: () => false, screenshot: async (options: { path: string }) => writeFile(options.path, 'synthetic frame', 'utf8') };
    const context: any = { route: async () => {}, newPage: async () => page, newCDPSession: async () => ({ on() {}, send: async () => {} }) };
    const lifecycle: OwnedAcceptanceLifecycle = { deadlineAt: f.deadlineAt, signal: f.work.signal, nativeValidationWaits: f.waits, nativeSegmentWaits: segment,
      open: async () => { for (const stage of ['prepare_authority', 'register_authority', 'browser_transport'] as const) await segment.runStage(stage, async life => { life.check(); });
        return { browser: { version: () => 'synthetic', close: async () => {} } as any, context }; },
      identity: () => identity, process: () => process as any, close: async () => { process.exitCode = 0; identity.closeEvent = true; } };
    const observed = api.observeNavigationDiagnosticLifecycle(lifecycle, mode, observer(), { player: [4, 4], playerIndex: 0, idleIndex: 0 });
    try { return await mode.run(p, () => runAcceptanceInOwnedSession(p, { evidenceRoot: root, timeoutMs: 60_000 }, observed.lifecycle), observed.navigationSucceeded); }
    finally { observed.restore(); }
  });
  t.after(async () => { await f.work.cancelAndDrain('unit complete'); assert.ok(report.profileRoot.startsWith(resolve(tmpdir()) + sep));
    assert.ok(report.profileRoot.includes('cosmos-browser-')); await rm(report.profileRoot, { recursive: true, force: true }); });
  const task: any = { taskId: 'browser', runId: 'fixture', specVersion: 'v1', acceptanceIds: ['visible'], artifacts: [artifact] };
  const diagnostics = await diagnosePersistentBrowser(task, report, { series, deadlineAt: f.deadlineAt, sourceVersion: series.sourceVersion,
    reportPath: report.reportPath, nativeWaitContract: f.waits.contractVersion }, { evidenceRoot: root, verifyBinding: async () => {}, signal: f.work.signal });
  const consumerEndedAt = Date.now(), consumerStartedAt = f.waits.snapshot().consumerStartedAt!;
  const envelope = { diagnostics, nativeWaits: { contractVersion: f.waits.contractVersion, consumerStartedAt, consumerEndedAt,
    consumerElapsedMs: consumerEndedAt - consumerStartedAt } };
  return { ...f, api, mode, root, report, envelope, proof: { mode, evidenceRoot: root, series } };
}

test('COS93 navigation diagnostic planned stop accepts real production false diagnosis without promoting game outcome', async t => {
  const f = await stoppedNavigationSeries(t);
  assert.equal(f.report.outcome, 'failed'); assert.equal(f.envelope.diagnostics.reportValid, false);
  assert.deepEqual(f.envelope.diagnostics.passedChecks, []);
  assert.ok(f.envelope.diagnostics.issues.every(issue => issue.classification === 'insufficient_evidence'));
  const original = structuredClone({ report: f.report, envelope: f.envelope });
  const verified = await f.api.navigationReportVerified(f.report, f.waits, f.envelope, f.proof);
  assert.equal(verified, true);
  assert.deepEqual({ report: f.report, envelope: f.envelope }, original);
  await f.work.cancelAndDrain('proof is fixed before cleanup');
  assert.equal(f.api.summarizeNavigationDiagnostic({ state: f.mode.snapshot(), nativeContractVerified: verified, normalCleanup: true,
    preservation: true, observationIncomplete: false, openMs: 1, navigationMs: 1 }).navigation.outcome, 'passed');
  assert.equal(f.envelope.diagnostics.reportValid, false, 'Final diagnosis never promotes the production game classification');
});

test('COS93 navigation diagnostic planned stop rejects added source HTTP cleanup and durable raw failures', async t => {
  const f = await stoppedNavigationSeries(t), row = f.report.segments[0].report;
  const original = structuredClone(f.report);
  row.cleanup.forced = true;
  assert.equal(await (f.api.navigationReportVerified as any)(f.report, f.waits, f.envelope, f.proof), false); row.cleanup.forced = false;
  f.report.nativeWaits!.segments[0].firstCause = { stage: 'http_post_authority', name: 'Error', message: 'Original source changed' };
  assert.equal(await (f.api.navigationReportVerified as any)(f.report, f.waits, f.envelope, f.proof), false);
  f.report.nativeWaits!.segments[0].firstCause = null;
  f.report.nativeWaits!.segments[0].http.rejected = 1;
  assert.equal(await (f.api.navigationReportVerified as any)(f.report, f.waits, f.envelope, f.proof), false);
  f.report.nativeWaits!.segments[0].http.rejected = 0;
  await writeFile(join(f.root, row.reportPath), JSON.stringify({ ...row, errors: ['extra raw failure'] }), 'utf8');
  assert.equal(await (f.api.navigationReportVerified as any)(f.report, f.waits, f.envelope, f.proof), false);
  await writeFile(join(f.root, row.reportPath), JSON.stringify(row) + '\n', 'utf8');
  const extra = { ...f.envelope, diagnostics: { ...f.envelope.diagnostics, issues: [...f.envelope.diagnostics.issues, { ...f.envelope.diagnostics.issues[0], checkId: 'HTTP/source' }] } };
  assert.equal(await (f.api.navigationReportVerified as any)(f.report, f.waits, extra, f.proof), false);
  assert.deepEqual(f.report, original);
});
