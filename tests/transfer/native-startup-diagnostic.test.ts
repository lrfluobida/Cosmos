import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import type { OwnedAcceptanceLifecycle } from '../../src/acceptance/runner.ts';

const actualSelected = process.env.COS93_DIAGNOSTIC_SOURCE !== undefined || process.env.COS93_DIAGNOSTIC_HISTORY !== undefined;
const stopMessage = 'DiagnosticStartupComplete: verified native startup reached context.newPage';

interface Span {
  id: number; parentId: number | null; name: string; startMs: number; endMs: number | null; durationMs: number | null;
  outcome: 'pending' | 'returned' | 'threw'; error?: { name: string; message: string };
}
function observer(clock: () => number = () => performance.now()) {
  const clockOrigin = { kind: 'performance.now', originUtc: new Date().toISOString(), originMonotonicMs: clock() };
  const parents = new AsyncLocalStorage<number>(), spans: Span[] = [], events: { name: string; atMs: number; data?: unknown }[] = [];
  return {
    async span<T>(name: string, operation: () => Promise<T>): Promise<T> {
      const row: Span = { id: spans.length + 1, parentId: parents.getStore() ?? null, name, startMs: clock(), endMs: null, durationMs: null, outcome: 'pending' };
      spans.push(row);
      return parents.run(row.id, async () => {
        try { const result = await operation(); row.outcome = 'returned'; return result; }
        catch (error) { row.outcome = 'threw'; row.error = error instanceof Error ? { name: error.name, message: error.message } : { name: typeof error, message: String(error) }; throw error; }
        finally { row.endMs = clock(); row.durationMs = row.endMs - row.startMs; }
      });
    },
    event(name: string, data?: unknown) { events.push({ name, atMs: clock(), ...(data === undefined ? {} : { data }) }); },
    snapshot() { return structuredClone({ clock: clockOrigin, spans, events }); },
  };
}
type Observer = ReturnType<typeof observer>;

class DiagnosticStartupComplete extends Error {
  constructor() { super(stopMessage); this.name = 'DiagnosticStartupComplete'; }
}

function observedLifecycle(t: TestContext, lifecycle: OwnedAcceptanceLifecycle, trace: Observer): OwnedAcceptanceLifecycle {
  return {
    ...lifecycle,
    async open(...args) {
      trace.event('lifecycle.open.arguments', { timeoutMs: args[1], deadlineAt: args[2]?.deadlineAt });
      const result = await trace.span('lifecycle.open', () => lifecycle.open(...args));
      const identity = lifecycle.identity();
      assert.ok(identity, 'The stop seam requires the completed native identity');
      assert.deepEqual(identity.cdp?.browserProcessIds, [identity.browserPid]);
      assert.deepEqual(identity.cdp?.profileArguments, ['--user-data-dir=' + identity.profile]);
      assert.equal(identity.commandLineProfile, identity.profile);
      trace.event('lifecycle.identity', structuredClone(identity));
      const route = result.context.route.bind(result.context);
      t.mock.method(result.context, 'route', (...routeArgs: Parameters<typeof route>) => trace.span('context.route', () => route(...routeArgs)));
      t.mock.method(result.context, 'newPage', async () => {
        trace.event('diagnostic.stop', { point: 'context.newPage', identity: structuredClone(lifecycle.identity()) });
        throw new DiagnosticStartupComplete();
      });
      return result;
    },
    close(...args) { return trace.span('lifecycle.close', () => lifecycle.close(...args)); },
  };
}

async function installActualLifecycleObserver(t: TestContext, trace: Observer) {
  assert.ok(process.execArgv.includes('--experimental-test-module-mocks'), 'Actual diagnosis requires --experimental-test-module-mocks to observe the literal lifecycle.open call');
  const runnerUrl = new URL('../../src/acceptance/runner.ts', import.meta.url);
  const runner = await import(runnerUrl.href);
  t.mock.module(runnerUrl, { namedExports: {
    ...runner,
    runAcceptanceInOwnedSession: (plan: unknown, options: unknown, lifecycle: OwnedAcceptanceLifecycle) =>
      runner.runAcceptanceInOwnedSession(plan, options, observedLifecycle(t, lifecycle, trace)),
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
  t.mock.method(controller, 'registerOwnedChild', async (pid: number, ticket: string) => { registrations++; assert.equal(connections, 0); await register(pid, ticket); });
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
  t.mock.method(chromium, 'connectOverCDP', async () => { connections++; return { version: () => 'synthetic-transport', close: async () => {},
    newBrowserCDPSession: async () => cdp, contexts: () => [context] } as any; });
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
  const trace = observer();
  await installActualLifecycleObserver(t, trace);
  const { diagnoseNativeStartup } = await import('./native-startup-diagnostic.fixture.ts');
  const result = await diagnoseNativeStartup({ sourceRepository, historySnapshot, observer: trace }, t);
  assert.equal(result.outcome, 'diagnostic_completed', JSON.stringify(result.startup));
  assert.equal(result.preservation.unchanged, true, 'Original input bytes, metadata and directory lists must remain unchanged');
  if (result.report) { assert.equal(result.report.outcome, 'failed'); assert.equal(result.report.series.segments.length, 8); }
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
