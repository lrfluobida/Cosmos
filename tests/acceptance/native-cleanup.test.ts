import assert from 'node:assert/strict';
import { mock, test, type TestContext } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { AcceptancePlan } from '../../src/acceptance/plan.ts';
import type { OwnedAcceptanceLifecycle, PersistentBrowserIdentity } from '../../src/acceptance/runner.ts';
import { createNativeSnapshotValidationWaits, createNativeValidationWaits } from '../../src/acceptance/native-validation-waits.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';

// Only the transport and OS exit boundary are synthetic; runner, wait source and raw owner are production code.
let processAbsent = true;
mock.module(new URL('../../src/acceptance/process.ts', import.meta.url).href, { namedExports: {
  browserProcessAbsent: () => processAbsent,
  stopBrowserProcess: (child: ChildProcess, timeoutMs: number) => (child as unknown as { terminate(ms: number): Promise<void> }).terminate(timeoutMs),
} });
const { runAcceptanceInOwnedSession } = await import('../../src/acceptance/runner.ts');
function deferred<T = void>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
async function fixture(t: TestContext, options: { version?: '1' | '2' | 'generic'; videoMs?: number; screenshotMs?: number;
  closeMs?: number; closeExits?: boolean; closeEvent?: boolean; processAbsent?: boolean; forceExits?: boolean;
  clientMs?: number; forceMs?: number; workMs?: number; timeoutMs?: number; deadlineMs?: number;
  videoGate?: ReturnType<typeof deferred<void>>; failure?: Error; cancel?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cos100-cleanup-')), base = Date.now(), controller = new AbortController(), work = new OwnedWork(controller.signal);
  processAbsent = options.processAbsent ?? true;
  const deadlineAt = base + (options.deadlineMs ?? 60_000), input = { caseId: 'case', windowId: 'window', taskId: 'browser', deadlineAt,
    signal: work.signal, controllerSignal: controller.signal, trackRaw: work.run.bind(work) };
  const waits = options.version === 'generic' ? undefined : options.version === '1' ? createNativeValidationWaits(input)
    : createNativeSnapshotValidationWaits({ ...input, requireExecution: async () => {} });
  waits?.startConsumer(); const segment = waits?.beginSegment('cleanup');
  const entered = { screenshot: deferred(), video: deferred(), close: deferred(), client: deferred(), force: deferred() };
  const order: string[] = [], closeLimits: number[] = [], forceLimits: number[] = [];
  const identity: PersistentBrowserIdentity = { browserPid: 12345, profile: join(root, 'profile'), commandLineProfile: join(root, 'profile'),
    origin: 'http://127.0.0.1:32123', closeEvent: false, exitConfirmed: false, exitCode: null, signalCode: null };
  const child = { pid: identity.browserPid, exitCode: null as number | null, signalCode: null,
    async terminate(ms: number) { forceLimits.push(ms); order.push('force'); entered.force.resolve(); await delay(options.forceMs ?? 0);
      if (options.forceExits !== false) { child.exitCode = 1; identity.closeEvent = true; } } };
  const delay = (ms: number) => ms ? new Promise<void>(done => setTimeout(done, ms)) : Promise.resolve();
  const page = { goto: async () => { if (options.workMs) t.mock.timers.tick(options.workMs);
      if (options.cancel) controller.abort(options.failure ?? new Error('controller stopped'));
      if (options.failure) throw options.failure; return { ok: () => true, status: () => 200 }; },
    url: () => identity.origin, video: () => null, setViewportSize: async () => {}, setDefaultTimeout() {}, on() {}, isClosed: () => false,
    locator: () => ({ isVisible: async () => true }),
    screenshot: async ({ path }: { path: string }) => { if (path.endsWith('final.png')) {
      order.push('screenshot'); entered.screenshot.resolve(); await delay(options.screenshotMs ?? 0);
    } return Buffer.alloc(0); },
    screencast: { start: async () => {}, stop: async () => { order.push('video'); entered.video.resolve();
      if (options.videoGate) await options.videoGate.promise; else await delay(options.videoMs ?? 0);
      if (options.version === 'generic') await writeFile(join(root, 'fixture/game/v1/fixture/cleanup/browser.webm'), 'synthetic video bytes', 'utf8'); } } };
  const context: any = { route: async () => {}, newPage: async () => page, newCDPSession: async () => ({ on() {}, send: async () => {} }) };
  const lifecycle: OwnedAcceptanceLifecycle = { deadlineAt, signal: work.signal,
    ...(waits ? { nativeValidationWaits: waits, nativeSegmentWaits: segment } : {}),
    open: async () => { if (segment) for (const stage of ['prepare_authority', 'register_authority', 'browser_transport'] as const)
      await segment.runStage(stage, async life => life.check());
      return { browser: { version: () => 'synthetic transport', close: async () => { order.push('client'); entered.client.resolve(); await delay(options.clientMs ?? 0); } } as any, context }; },
    process: () => child as unknown as ChildProcess, identity: () => identity,
    close: async ms => { closeLimits.push(ms); order.push('close'); entered.close.resolve(); await delay(options.closeMs ?? 0);
      if (options.closeExits !== false) { child.exitCode = 0; identity.closeEvent = options.closeEvent ?? true; } } };
  const plan: AcceptancePlan = { formatVersion: '1.0.0', projectId: 'fixture', taskId: 'browser', runId: 'fixture', reportId: 'cleanup', specVersion: 'v1',
    artifact: { artifactId: 'game', version: 'v1', location: 'game' }, url: identity.origin + '/', viewport: { width: 1280, height: 720 },
    acceptanceIds: ['visible'], steps: [{ id: 'visible', kind: 'assert', acceptanceId: 'visible', observation: { kind: 'visible', selector: '#game' }, expected: true, timeoutMs: 100 }] };
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: base });
  t.after(async () => { t.mock.timers.reset(); options.videoGate?.resolve(); await work.cancelAndDrain('fixture complete');
    assert.equal(dirname(resolve(root)), resolve(tmpdir())); assert.ok(basename(root).startsWith('cos100-cleanup-'));
    await rm(root, { recursive: true, force: true }); });
  const running = runAcceptanceInOwnedSession(plan, { evidenceRoot: root, timeoutMs: options.timeoutMs ?? 60_000 }, lifecycle);
  return { root, base, deadlineAt, waits, segment, work, controller, entered, order, closeLimits, forceLimits, running };
}

test('COS100 cleanup uses one frozen budget including screenshot and a 1500ms video stop', async t => {
  const f = await fixture(t, { screenshotMs: 4000, videoMs: 1500, closeMs: 1000, clientMs: 500 });
  await f.entered.screenshot.promise; t.mock.timers.tick(4000); await f.entered.video.promise;
  t.mock.timers.tick(1500); await flush();
  assert.ok(f.order.includes('close'), '1500ms stop must finish before the normal browser close');
  t.mock.timers.tick(1000); await f.entered.client.promise; t.mock.timers.tick(500);
  const report = await f.running, proof = (report.nativeWaits as any).cleanup;
  assert.equal(report.outcome, 'passed'); assert.deepEqual(f.order, ['screenshot', 'video', 'close', 'client']);
  assert.equal(report.cleanup.forced, false); assert.equal(report.cleanup.processExited, true);
  assert.equal(proof.startedAt, f.base); assert.equal(proof.deadlineAt, f.base + 30000); assert.equal(proof.gracefulDeadlineAt, f.base + 25000);
  assert.deepEqual(f.closeLimits, [19500]); assert.equal(proof.rawPending, 0);
  assert.equal(proof.steps.find((step: any) => step.step === 'video_stop').outcome, 'passed');
});

test('COS100 cleanup exhausts one graceful budget then shares the tail with force and raw settlement', async t => {
  const videoGate = deferred(), f = await fixture(t, { screenshotMs: 4000, videoGate, forceMs: 2000 });
  await f.entered.screenshot.promise; t.mock.timers.tick(4000); await f.entered.video.promise;
  t.mock.timers.tick(21000); await flush();
  assert.ok(f.order.includes('force'), 'video receives only the remaining 21000ms');
  assert.equal(f.order.includes('close'), false); assert.equal(f.order.includes('client'), false);
  t.mock.timers.tick(2000); await flush(); t.mock.timers.tick(3000);
  const report = await f.running, proof = (report.nativeWaits as any).cleanup;
  assert.equal(Date.parse(report.endedAt), f.base + 30000); assert.deepEqual(f.forceLimits, [5000]);
  assert.equal(proof.rawPending, 1); assert.equal(report.nativeWaits!.segment.rawOperationsPending, 1);
  assert.equal(proof.steps.find((step: any) => step.step === 'video_stop').outcome, 'failed');
  assert.equal(proof.steps.find((step: any) => step.step === 'video_stop').rawPending, true);
  assert.equal(report.files.some(file => file.endsWith('.webm')), false);
  videoGate.reject(new Error('late encoder rejection')); await flush();
  assert.equal(f.segment!.snapshot().rawOperationsPending, 0);
  assert.equal(proof.rawPending, 1, 'published proof remains a snapshot of the unfinished video');
});

test('COS100 cleanup preserves an ordinary engine first cause while closing work still runs', async t => {
  const failure = new Error('original engine failure'), f = await fixture(t, { videoMs: 1500, failure });
  await f.entered.video.promise; t.mock.timers.tick(1500); const report = await f.running;
  assert.equal(report.errors[0], 'Browser startup/execution: original engine failure');
  assert.equal(report.nativeWaits!.segment.firstCause!.message, failure.message);
  assert.deepEqual(f.order, ['screenshot', 'video', 'close', 'client']); assert.equal(report.cleanup.forced, false);
});

test('COS100 cleanup starts no new graceful work after controller cancellation', async t => {
  const f = await fixture(t, { cancel: true, failure: new Error('original controller stop') });
  const report = await f.running;
  assert.deepEqual(f.order, ['force']); assert.equal(report.cleanup.forced, true);
  assert.equal(report.nativeWaits!.segment.firstCause!.message, 'original controller stop');
});

test('COS100 cleanup cannot report success when normal close resolves but its owned process needs force', async t => {
  const f = await fixture(t, { closeExits: false }), report = await f.running;
  assert.equal(report.cleanup.forced, true); assert.equal(report.cleanup.processExited, true);
  assert.equal(report.outcome, 'failed', 'forced browser exit is not normal video cleanup success');
});

test('COS100 cleanup cancellation during video preserves raw and skips later graceful work', async t => {
  const videoGate = deferred(), f = await fixture(t, { videoGate }); await f.entered.video.promise;
  f.controller.abort(new Error('controller stopped during video')); await flush();
  assert.deepEqual(f.order, ['screenshot', 'video', 'force']);
  t.mock.timers.tick(30000); const report = await f.running;
  assert.equal(report.cleanup.forced, true); assert.equal(report.nativeWaits!.segment.rawOperationsPending, 1);
  assert.equal((report.nativeWaits as any).cleanup.steps[1].rawPending, true);
  videoGate.reject(new Error('encoder stopped late')); await flush(); assert.equal(f.segment!.snapshot().rawOperationsPending, 0);
});

test('COS100 cleanup clamps to the absolute outer reserve and dispatches nothing when already expired', async t => {
  const f = await fixture(t, { workMs: 60000 }), report = await f.running, proof = (report.nativeWaits as any).cleanup;
  assert.equal(proof.startedAt, f.base + 60000); assert.equal(proof.deadlineAt, f.deadlineAt - 5000);
  assert.equal(proof.gracefulDeadlineAt, f.deadlineAt - 10000); assert.deepEqual(f.order, []);
  assert.deepEqual(f.forceLimits, []); assert.equal(report.cleanup.processExited, false); assert.equal(report.outcome, 'failed');
});

test('COS100 final screenshot has its own five-second cap inside the frozen shared deadline', async t => {
  const f = await fixture(t, { screenshotMs: 6000 }); await f.entered.screenshot.promise;
  t.mock.timers.tick(5000); await flush(); assert.deepEqual(f.order, ['screenshot', 'force']);
  t.mock.timers.tick(1000); const report = await f.running, proof = (report.nativeWaits as any).cleanup;
  assert.equal(proof.deadlineAt, f.base + 30000); assert.equal(proof.steps[0].outcome, 'failed');
  assert.equal(proof.steps[0].endedAt - proof.steps[0].startedAt, 5000); assert.equal(proof.rawPending, 0);
  assert.equal(report.outcome, 'failed');
});

for (const version of ['1'] as const) test(`COS100 compatibility retains ${version} one-second video cap`, async t => {
  const f = await fixture(t, { version, videoMs: 1500 }); await f.entered.video.promise;
  t.mock.timers.tick(1000); await flush(); const report = await f.running;
  assert.equal(report.outcome, 'failed'); assert.ok(report.errors.some(error => error.includes('timed out after 1000 ms')));
  assert.equal((report.nativeWaits as any)?.cleanup, undefined); assert.equal(report.cleanup.forced, true);
  t.mock.timers.tick(500);
});

test('COS108 generic 1500ms video closes normally', async t => {
  const f = await fixture(t, { version: 'generic', videoMs: 1500 });
  await f.entered.video.promise; t.mock.timers.tick(1500);
  const report = await f.running;
  assert.equal(report.outcome, 'passed', report.errors.join('\n'));
  assert.equal(report.cleanup.forced, false); assert.equal(report.cleanup.processExited, true);
  assert.ok(report.files.some(file => file.endsWith('browser.webm')));
  assert.ok((await readFile(join(f.root, 'fixture/game/v1/fixture/cleanup/browser.webm'))).length);
  assert.deepEqual(f.order, ['screenshot', 'video', 'close', 'client']);
});

test('COS108 generic cleanup shares the screenshot video and close balance', async t => {
  const f = await fixture(t, { version: 'generic', screenshotMs: 1000, videoMs: 1500, closeMs: 1500 });
  await f.entered.screenshot.promise; t.mock.timers.tick(1000);
  await f.entered.video.promise; t.mock.timers.tick(1500); await f.entered.close.promise;
  assert.deepEqual(f.closeLimits, [1000]);
  t.mock.timers.tick(1000); await f.entered.force.promise;
  t.mock.timers.tick(1000); const report = await f.running;
  assert.equal(report.outcome, 'failed'); assert.equal(f.order.includes('client'), false);
  assert.deepEqual(f.forceLimits, [1000]);
  assert.ok(Date.parse(report.endedAt) <= f.base + 5000);
});

test('COS108 generic cancellation skips graceful work and retains its first cause', async t => {
  const f = await fixture(t, { version: 'generic', cancel: true, failure: new Error('original controller stop') });
  const report = await f.running;
  assert.deepEqual(f.order, ['force']); assert.equal(report.outcome, 'failed');
  assert.equal(report.errors[0], 'Browser startup/execution: original controller stop');
});

test('COS108 generic cancellation during pending video cannot publish success', async t => {
  const videoGate = deferred(), f = await fixture(t, { version: 'generic', videoGate });
  await f.entered.video.promise; f.controller.abort(new Error('stop during video')); await flush();
  assert.deepEqual(f.order, ['screenshot', 'video', 'force']);
  videoGate.reject(new Error('late video failure')); await flush();
  const report = await f.running;
  assert.equal(report.outcome, 'failed'); assert.equal(report.files.some(file => file.endsWith('.webm')), false);
});

test('COS108 generic hung video consumes the shared budget then forces within its tail', async t => {
  const videoGate = deferred(), f = await fixture(t, { version: 'generic', videoGate });
  await f.entered.video.promise; t.mock.timers.tick(3500); await f.entered.force.promise;
  assert.deepEqual(f.forceLimits, [1000]); t.mock.timers.tick(1000);
  const report = await f.running;
  assert.equal(report.outcome, 'failed'); assert.equal(report.files.some(file => file.endsWith('.webm')), false);
  videoGate.reject(new Error('late stopped encoder')); await flush();
  assert.equal(report.outcome, 'failed');
});

for (const fault of ['closeExits', 'closeEvent', 'processAbsent'] as const)
  test(`COS108 generic rejects missing ${fault} evidence`, async t => {
    const f = await fixture(t, { version: 'generic', [fault]: false });
    const report = await f.running; assert.equal(report.outcome, 'failed');
    if (fault === 'closeExits') assert.equal(report.cleanup.forced, true);
    else assert.equal(report.cleanup.processExited, false);
  });

test('COS108 generic force that does not exit remains unconfirmed', async t => {
  const f = await fixture(t, { version: 'generic', closeExits: false, forceExits: false });
  const report = await f.running;
  assert.equal(report.outcome, 'failed'); assert.equal(report.cleanup.processExited, false);
});

for (const limit of ['deadlineMs', 'timeoutMs'] as const) test(`COS108 generic respects the earlier ${limit}`, async t => {
  const f = await fixture(t, { version: 'generic', [limit]: 10_000, workMs: 10_000 });
  await assert.rejects(f.running, /Publish browser.log: run deadline reached/);
  assert.deepEqual(f.order, []); assert.deepEqual(f.forceLimits, []);
});
