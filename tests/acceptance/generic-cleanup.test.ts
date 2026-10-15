import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { chromium } from '@playwright/test';
import type { Browser, BrowserContext, BrowserServer } from '@playwright/test';
import { runAcceptance, runAcceptanceInOwnedSession } from '../../src/acceptance/runner.ts';
import type { OwnedAcceptanceLifecycle } from '../../src/acceptance/runner.ts';
import type { AcceptancePlan } from '../../src/acceptance/plan.ts';

function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
interface FixtureOptions {
  server?: 'normal' | 'slow' | 'hung' | 'error'; videoError?: boolean; forcedExit?: boolean;
  timeoutMs?: number; beforeServer?: (base: number) => void;
}
async function fixture(t: TestContext, options: FixtureOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cos94-cleanup-test-')), base = Date.now();
  const enteringServer = deferred(), pendingClose = deferred(), order: string[] = [];
  const child = Object.assign(new EventEmitter(), { pid: 2147483647, exitCode: null as number | null, signalCode: null as NodeJS.Signals | null });
  const forced: { pid: number; at: number; timeoutMs?: number }[] = [];
  const exit = (code: number) => { child.exitCode = code; child.emit('exit', code, null); child.emit('close', code, null); };
  t.mock.method(childProcess, 'execFile', ((file: string, args: string[], settings: { timeout: number }, callback: (error: Error | null) => void) => {
    assert.equal(file, 'taskkill.exe'); assert.deepEqual(args, ['/pid', String(child.pid), '/T', '/F']);
    forced.push({ pid: child.pid, at: Date.now(), timeoutMs: settings.timeout });
    if (options.forcedExit === false) callback(new Error('Synthetic termination not confirmed'));
    else { exit(1); callback(null); }
  }) as typeof childProcess.execFile);
  t.mock.method(process, 'kill', ((pid: number, signal: string | number) => {
    assert.equal(pid, -child.pid); assert.equal(signal, 'SIGKILL'); forced.push({ pid: child.pid, at: Date.now() });
    if (options.forcedExit === false) throw new Error('Synthetic termination not confirmed');
    exit(1); return true;
  }) as typeof process.kill);
  syncBuiltinESMExports();
  t.after(async () => { pendingClose.resolve(); t.mock.timers.reset(); t.mock.restoreAll(); syncBuiltinESMExports(); await rm(root, { recursive: true, force: true }); });
  const video = { saveAs: async (path: string) => {
    order.push('video');
    // File existence cannot prove successful saveAs, and these bytes are not playback evidence.
    await writeFile(path, 'synthetic video placeholder', 'utf8');
    if (options.videoError) throw new Error('Synthetic video save failed');
  } };
  const page = { video: () => video, isClosed: () => false,
    screenshot: async ({ path }: { path: string }) => writeFile(path, 'synthetic screenshot', 'utf8'),
    setDefaultTimeout() {}, on() {}, goto: async () => ({ ok: () => true }), url: () => 'http://127.0.0.1:32123/',
    locator: () => ({ isVisible: async () => true }), setViewportSize: async () => {}, screencast: { start: async () => {}, stop: async () => {} } };
  const context = { route: async () => {}, newPage: async () => page,
    newCDPSession: async () => ({ on() {}, send: async () => ({}) }), close: async () => { order.push('context'); } } as unknown as BrowserContext;
  const browser = { version: () => 'synthetic', newContext: async () => context,
    close: async () => { order.push('client'); options.beforeServer?.(base); } } as unknown as Browser;
  const server = { process: () => child as unknown as ChildProcess, wsEndpoint: () => 'ws://127.0.0.1/synthetic', close: async () => {
    order.push('server'); enteringServer.resolve();
    if (options.server === 'error') throw new Error('Synthetic server cleanup failure');
    if (options.server === 'slow') await new Promise<void>(resolve => setTimeout(resolve, 1200));
    if (options.server === 'hung') await pendingClose.promise;
    if (child.exitCode === null) exit(0);
  } } as unknown as BrowserServer;
  t.mock.method(chromium, 'launchServer', async () => server); t.mock.method(chromium, 'connect', async () => browser);
  const plan: AcceptancePlan = { formatVersion: '1.0.0', projectId: 'cos94-synthetic', taskId: 'COS-94', runId: 'deterministic', reportId: 'cleanup', specVersion: 'synthetic-v1',
    artifact: { artifactId: 'inline', version: 'v1', location: 'synthetic/inline' }, url: 'http://127.0.0.1:32123/', viewport: { width: 1280, height: 720 }, acceptanceIds: ['ready'],
    steps: [{ id: 'ready', kind: 'assert', acceptanceId: 'ready', observation: { kind: 'visible', selector: '#ok' }, expected: true, timeoutMs: 1000 }] };
  const acceptanceOptions = { evidenceRoot: root, timeoutMs: options.timeoutMs ?? 15000 };
  return { root, base, child, forced, order, enteringServer, pendingClose, browser, context, plan, acceptanceOptions,
    run: () => runAcceptance(plan, acceptanceOptions), clock: () => t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: base }) };
}

test('COS94 normal generic cleanup preserves order, saved evidence and confirmed exit', async t => {
  const f = await fixture(t), report = await f.run();
  assert.equal(report.outcome, 'passed'); assert.deepEqual(report.errors, []);
  assert.deepEqual(f.order, ['context', 'video', 'client', 'server']); assert.deepEqual(f.forced, []);
  assert.deepEqual(report.cleanup, { browserPid: f.child.pid, forced: false, processExited: true });
  assert.ok(report.files.some(file => file.endsWith('browser.webm')));
  assert.deepEqual(JSON.parse(await readFile(join(f.root, report.reportPath), 'utf8')), report);
});

test('COS94 normal server close after 1200 ms uses the existing cleanup reserve', async t => {
  const f = await fixture(t, { server: 'slow' }); f.clock();
  const running = f.run(); await f.enteringServer.promise; t.mock.timers.tick(1200); const report = await running;
  assert.equal(report.outcome, 'passed', JSON.stringify(report.errors)); assert.deepEqual(f.forced, []);
  assert.equal(report.cleanup.processExited, true); assert.equal(Date.now(), f.base + 1200);
});

test('COS94 hung server close has a 2000 ms local cap even with a long run remainder', async t => {
  const f = await fixture(t, { server: 'hung', timeoutMs: 60000 }); f.clock();
  const running = f.run(); await f.enteringServer.promise; t.mock.timers.tick(2000); const report = await running;
  assert.equal(report.outcome, 'failed'); assert.match(report.errors[0], /Server cleanup: timed out after 2000 ms/);
  assert.equal(report.failureFacts?.termination?.kind, 'lifecycle'); assert.equal(f.forced.length, 1);
  assert.equal(f.forced[0].at, f.base + 2000); assert.equal(report.cleanup.processExited, true);
  if (process.platform === 'win32') assert.equal(f.forced[0].timeoutMs, 2000);
  assert.ok(report.files.some(file => file.endsWith('browser.webm'))); assert.ok(report.errors.every(error => !error.includes('Video unavailable')));
});

test('COS94 original graceful deadline shortens server close and preserves the force reserve', async t => {
  const f = await fixture(t, { server: 'hung', beforeServer: base => t.mock.timers.setTime(base + 13800) }); f.clock();
  const running = f.run(); await f.enteringServer.promise; t.mock.timers.tick(200); const report = await running;
  assert.equal(report.outcome, 'failed'); assert.match(report.errors[0], /Server cleanup: timed out after 200 ms/);
  assert.equal(f.forced.length, 1); assert.equal(f.forced[0].at, f.base + 14000);
  if (process.platform === 'win32') assert.equal(f.forced[0].timeoutMs, 1000);
});

for (const options of [{ timeoutMs: 3000 }, { beforeServer: (base: number, t: TestContext) => t.mock.timers.setTime(base + 15000) }]) {
  test(`COS94 ${'timeoutMs' in options ? 'empty local reserve' : 'expired original deadline'} does not start a server close wait`, async t => {
    const f = await fixture(t, { timeoutMs: options.timeoutMs, beforeServer: base => options.beforeServer?.(base, t) }); f.clock();
    const report = await f.run();
    assert.equal(report.outcome, 'failed'); assert.match(report.errors[0], /Server cleanup: run deadline reached/);
    assert.equal(f.order.includes('server'), false); assert.equal(f.forced.length, 1);
    if (!('timeoutMs' in options) && process.platform === 'win32') assert.equal(f.forced[0].timeoutMs, 1);
  });
}

test('COS94 server failure retains successfully saved video without claiming it unavailable', async t => {
  const f = await fixture(t, { server: 'error' }), report = await f.run();
  assert.equal(report.outcome, 'failed'); assert.equal(report.failureFacts?.termination?.kind, 'lifecycle');
  assert.ok(report.errors.some(error => error.includes('Synthetic server cleanup failure')));
  assert.ok(report.files.some(file => file.endsWith('browser.webm'))); assert.ok(report.errors.every(error => !error.includes('Video unavailable')));
  assert.ok(report.evidence.some(item => item.kind === 'video' && item.outcome === 'observed'));
});

test('COS94 partial video file does not count as successful collection', async t => {
  const f = await fixture(t, { videoError: true }), report = await f.run();
  assert.equal(report.outcome, 'failed'); assert.ok(report.errors.some(error => error.includes('Synthetic video save failed')));
  assert.ok(report.errors.some(error => error.includes('Video unavailable'))); assert.ok(report.files.every(file => !file.endsWith('browser.webm')));
  assert.equal(await readFile(join(f.root, report.reportPath, '..', 'browser.webm'), 'utf8'), 'synthetic video placeholder');
});

test('COS94 unsuccessful forced termination cannot turn an unproven exit into success', async t => {
  const f = await fixture(t, { server: 'error', forcedExit: false }), report = await f.run();
  assert.equal(report.outcome, 'failed'); assert.equal(report.cleanup.forced, true); assert.equal(report.cleanup.processExited, false);
  assert.ok(report.errors.includes('Owned browser process did not exit'));
  assert.ok(report.errors.some(error => error.includes('Synthetic termination not confirmed')));
});

test('COS94 persistent cancellation and its 1000 ms cleanup limit remain unchanged', async t => {
  const f = await fixture(t), controller = new AbortController(), closing = deferred(), finish = deferred(); f.clock();
  const lifecycle: OwnedAcceptanceLifecycle = { deadlineAt: f.base + 15000, signal: controller.signal,
    open: async () => ({ browser: f.browser, context: f.context }), process: () => f.child as unknown as ChildProcess,
    close: async () => { closing.resolve(); await finish.promise; }, identity: () => undefined };
  t.after(() => finish.resolve());
  const running = runAcceptanceInOwnedSession(f.plan, f.acceptanceOptions, lifecycle);
  await closing.promise; controller.abort(); t.mock.timers.tick(1000); const report = await running;
  assert.equal(report.outcome, 'failed'); assert.match(report.errors[0], /Persistent browser close: timed out after 1000 ms/);
  assert.ok(report.errors.includes('Acceptance cancelled')); assert.ok(report.errors.some(error => error.includes('Video unavailable')));
  assert.equal(f.order.includes('server'), false); assert.equal(report.cleanup.processExited, false);
});
