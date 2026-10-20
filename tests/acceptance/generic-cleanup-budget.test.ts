import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { mock, test, type TestContext } from 'node:test';
import type { ChildProcess } from 'node:child_process';
import type { AcceptancePlan } from '../../src/acceptance/plan.ts';

// Browser transport and selected disk delays fail beneath the actual ordinary public runner.
let browser: any, server: any;
let writeHook: ((path: string) => Promise<void>) | undefined;
mock.module('@playwright/test', { namedExports: { chromium: {
  launchServer: async () => server, connect: async () => browser,
} } });
mock.module('node:fs/promises', { namedExports: { ...fs,
  writeFile: async (...args: Parameters<typeof fs.writeFile>) => { await writeHook?.(String(args[0])); await fs.writeFile(...args); },
} });
mock.module(new URL('../../src/acceptance/process.ts', import.meta.url).href, { namedExports: {
  browserProcessAbsent: () => true,
  stopBrowserProcess: async (child: ChildProcess, ms: number) => (child as any).terminate(ms),
} });
const { runAcceptance } = await import('../../src/acceptance/runner.ts');
function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
async function fixture(t: TestContext, options: { videoMs?: number; missingVideo?: boolean; closeExits?: boolean;
  writeFault?: 'log' | 'report'; writeGate?: ReturnType<typeof deferred>; writeDelayMs?: number; writeFails?: boolean } = {}) {
  const root = await fs.mkdtemp(join(tmpdir(), 'cos108-generic-')), base = Date.now();
  const entered = { video: deferred(), publication: deferred() }, order: string[] = [];
  const child = { pid: 54321, exitCode: null as number | null, signalCode: null,
    terminate: async (ms: number) => { assert.ok(ms > 0); order.push('force'); child.exitCode = 1; } };
  const delay = async (ms: number) => { if (ms) await new Promise<void>(done => setTimeout(done, ms)); };
  const video = { saveAs: async (path: string) => {
    order.push('video'); entered.video.resolve(); await delay(options.videoMs ?? 0);
    if (!options.missingVideo) await fs.writeFile(path, 'synthetic video bytes', 'utf8');
  } };
  const page = { goto: async () => ({ ok: () => true, status: () => 200 }), url: () => 'http://127.0.0.1:32123/',
    video: () => video, setViewportSize: async () => {}, setDefaultTimeout() {}, on() {}, isClosed: () => false,
    locator: () => ({ isVisible: async () => true }), screenshot: async ({ path }: { path: string }) => fs.writeFile(path, 'synthetic screenshot', 'utf8') };
  const context = { route: async () => {}, newPage: async () => page,
    newCDPSession: async () => ({ on() {}, send: async () => {} }), close: async () => { order.push('context'); } };
  browser = { version: () => 'synthetic standalone transport', newContext: async () => context, close: async () => { order.push('client'); } };
  server = { wsEndpoint: () => 'ws://fixture', process: () => child,
    close: async () => { order.push('server'); if (options.closeExits !== false) child.exitCode = 0; } };
  let delayed = false;
  writeHook = async path => {
    if (delayed || !path.endsWith(options.writeFault === 'log' ? 'browser.log' : options.writeFault === 'report' ? 'report.json' : '/unused')) return;
    delayed = true; entered.publication.resolve();
    if (options.writeGate) await options.writeGate.promise;
    if (options.writeDelayMs) t.mock.timers.tick(options.writeDelayMs);
    if (options.writeFails) throw new Error('injected evidence disk failure');
  };
  const plan: AcceptancePlan = { formatVersion: '1.0.0', projectId: 'fixture', taskId: 'browser', runId: 'fixture', reportId: 'cleanup', specVersion: 'v1',
    artifact: { artifactId: 'game', version: 'v1', location: 'game' }, url: 'http://127.0.0.1:32123/', viewport: { width: 1280, height: 720 },
    acceptanceIds: ['visible'], steps: [{ id: 'visible', kind: 'assert', acceptanceId: 'visible', observation: { kind: 'visible', selector: '#game' }, expected: true, timeoutMs: 100 }] };
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: base });
  t.after(async () => {
    t.mock.timers.reset(); options.writeGate?.resolve(); writeHook = undefined;
    assert.equal(dirname(resolve(root)), resolve(tmpdir())); assert.ok(basename(root).startsWith('cos108-generic-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const running = runAcceptance(plan, { evidenceRoot: root, timeoutMs: 60_000 });
  // Retain a rejection handler immediately; a simulated publication timeout can reject before a test awaits it.
  const result = running.then(report => ({ report, error: undefined }), error => ({ report: undefined, error }));
  return { root, base, order, entered, running, result };
}

test('COS108 ordinary public runner allows a 1500ms saved video', async t => {
  const f = await fixture(t, { videoMs: 1500 });
  await f.entered.video.promise; t.mock.timers.tick(1500);
  const report = await f.running;
  assert.equal(report.outcome, 'passed', report.errors.join('\n')); assert.equal(report.cleanup.forced, false);
  assert.equal(report.cleanup.processExited, true);
  assert.deepEqual(JSON.parse(await fs.readFile(join(f.root, report.reportPath), 'utf8')), report);
});

test('COS108 ordinary runner rejects a video API that produced no file', async t => {
  const f = await fixture(t, { missingVideo: true }), { report, error } = await f.result;
  assert.ok(error || report?.outcome === 'failed');
});

test('COS108 ordinary runner cannot accept forced exit after normal close resolves', async t => {
  const f = await fixture(t, { closeExits: false }), report = await f.running;
  assert.equal(report.cleanup.forced, true); assert.equal(report.cleanup.processExited, true);
  assert.equal(report.outcome, 'failed');
});

for (const writeFault of ['log', 'report'] as const) {
  test(`COS108 ordinary runner rejects failed ${writeFault} publication`, async t => {
    const f = await fixture(t, { writeFault, writeFails: true }), result = await f.result;
    assert.match(String(result.error), /evidence disk failure/); assert.equal(result.report, undefined);
  });
  test(`COS108 ordinary runner rejects ${writeFault} publication beyond its frozen cleanup deadline`, async t => {
    const f = await fixture(t, { writeFault, writeDelayMs: 5000 }), { report, error } = await f.result;
    assert.ok(error || report?.outcome === 'failed', 'late disk completion must not produce passing host proof');
  });
}

test('COS108 ordinary runner awaits the actual report write before returning proof', async t => {
  const writeGate = deferred(), f = await fixture(t, { writeFault: 'report', writeGate });
  let settled = false; void f.result.then(() => { settled = true; });
  await f.entered.publication.promise; await flush(); assert.equal(settled, false);
  writeGate.resolve(); const report = await f.running; assert.equal(report.outcome, 'passed');
  assert.deepEqual(JSON.parse(await fs.readFile(join(f.root, report.reportPath), 'utf8')), report);
});

test('COS108 ordinary runner rejects an unsettled report at the fixed publication deadline', async t => {
  const writeGate = deferred(), f = await fixture(t, { writeFault: 'report', writeGate });
  await f.entered.publication.promise; t.mock.timers.tick(5000);
  const result = await f.result;
  assert.equal(result.report, undefined); assert.match(String(result.error), /Publish report.json: timed out/);
  writeGate.reject(new Error('late disk rejection')); await flush();
  assert.equal(result.report, undefined);
});
