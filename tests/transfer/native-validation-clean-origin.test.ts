import assert from 'node:assert/strict';
import { createServer, Server } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { associateNativeReadSignal, createNativeValidationWaits, runNativeValidationRead, type NativeSegmentWaits } from '../../src/acceptance/native-validation-waits.ts';
import { reserveTransferOrigin } from '../../src/runtime/adapters/transfer/loopback-origin.ts';
import { withCleanDelivery, type CleanDelivery } from '../../src/runtime/entrypoint-delivery.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { RunController } from '../../src/runtime/run.ts';

const html = '<p>独立干净交付</p>', binding = { caseId: 'case', windowId: 'window', sourceVersion: 'a'.repeat(40),
  requirementSha256: 'b'.repeat(64), runId: 'run', specVersion: '1' };
const candidate = { artifactId: 'game', version: 'v1', location: 'registry/candidates/game/v1/project' };
function deferred<T = void>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function navigation(segment: NativeSegmentWaits) {
  for (const stage of ['prepare_authority', 'register_authority', 'browser_transport'] as const) await segment.runStage(stage, async () => {});
  segment.beginNavigation();
}
async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cos97-clean-origin-')), project = join(root, candidate.location), owner = new AbortController(), work = new OwnedWork(owner.signal);
  await mkdir(join(project, 'dist'), { recursive: true }); await writeFile(join(project, 'dist/index.html'), html, 'utf8');
  const rawFailures: unknown[] = [];
  const waits = createNativeValidationWaits({ caseId: 'case', windowId: 'window', taskId: 'host', deadlineAt: Date.now() + 600000,
    signal: work.signal, controllerSignal: owner.signal, trackRaw: start => { const raw = work.run(start); void raw.then(() => {}, error => rawFailures.push(error)); return raw; } });
  const cleanupFailures: unknown[] = [], retainCleanupFailure = (error: unknown) => { cleanupFailures.push(error); work.retainCleanupFailure(error); };
  let scope: (signal?: AbortSignal) => Promise<void> = async () => {}, bindingGuard: (signal?: AbortSignal) => Promise<void> = async () => {};
  const origin = await reserveTransferOrigin({ root, binding, resume: false, signal: work.signal, controllerSignal: owner.signal, retainCleanupFailure, requireScope: signal => scope(signal) });
  const upstream = createServer((_request, response) => { response.writeHead(200); response.end(html); });
  await new Promise<void>(done => upstream.listen(0, '127.0.0.1', done));
  const address = upstream.address(); assert.ok(address && typeof address === 'object');
  const payloads: Buffer[] = [];
  const clean: CleanDelivery = { project, url: `http://127.0.0.1:${address.port}`, async requireCurrent() {},
    async verifyPayload(_name, value) { payloads.push(Buffer.from(value.bytes)); assert.equal(Buffer.from(value.bytes).toString(), html); return 'content'; } };
  const mount = (native = true) => origin.mountCandidate({ candidate, project, cleanDelivery: clean,
    ...(native ? { nativeValidationWaits: waits, retainCleanupFailure } : {}), verifyBinding: signal => bindingGuard(signal) });
  t.after(async () => {
    const closeError = await origin.close().then(() => undefined, error => error);
    upstream.closeAllConnections(); await new Promise<void>(done => upstream.close(() => done()));
    await work.cancelAndDrain('fixture cleanup').catch(error => { assert.ok(error instanceof AggregateError && cleanupFailures.every(failure => error.errors.includes(failure))); });
    assert.ok(root.startsWith(join(tmpdir(), 'cos97-clean-origin-'))); await rm(root, { recursive: true, force: true });
    if (closeError) assert.ok(cleanupFailures.includes(closeError));
  });
  return { root, project, owner, work, waits, origin, upstream, clean, payloads, rawFailures, cleanupFailures, retainCleanupFailure, mount,
    setScope(value: typeof scope) { scope = value; }, setBinding(value: typeof bindingGuard) { bindingGuard = value; } };
}

test('COS97 native clean traffic is 404 before navigation and uses complete pre body post stages', async t => {
  const f = await fixture(t); await f.mount();
  const segment = f.waits.beginSegment('first'); let upstreamReads = 0; f.upstream.on('request', () => upstreamReads++);
  assert.equal((await fetch(f.origin.url)).status, 404); assert.equal(f.payloads.length, 0);
  assert.equal(segment.snapshot().http.started, 0); assert.equal(upstreamReads, 0);
  await navigation(segment);
  const signals: AbortSignal[] = [], scopeSignals: AbortSignal[] = [], cleanSignals: AbortSignal[] = [];
  f.setBinding(async signal => { assert.ok(signal); signals.push(signal); });
  f.setScope(async signal => { assert.ok(signal); scopeSignals.push(signal); });
  f.clean.requireCurrent = async function (signal) { assert.equal(this, f.clean); assert.ok(signal); cleanSignals.push(signal); };
  const response = await fetch(f.origin.url); assert.equal(response.status, 200); assert.equal(await response.text(), html);
  assert.equal(signals.length, 2); assert.notEqual(signals[0], signals[1]);
  assert.deepEqual(scopeSignals, signals); assert.deepEqual(cleanSignals, signals); assert.equal(upstreamReads, 1);
  assert.equal(f.payloads.length, 1);
  assert.deepEqual(segment.snapshot().http.stages.map(row => [row.stage, row.count]), [
    ['http_pre_authority', 1], ['http_body', 1], ['http_post_authority', 1]]);
  segment.revoke(); await segment.settle(Date.now() + 1000);
});

test('COS97 native mount rejects a copied wait object or a clean service without its payload verifier', async t => {
  const f = await fixture(t);
  await assert.rejects(f.origin.mountCandidate({ candidate, project: f.project, cleanDelivery: f.clean,
    nativeValidationWaits: { ...f.waits }, verifyBinding: async () => {} }), /native|trusted/i);
  await assert.rejects(f.origin.mountCandidate({ candidate, project: f.project, nativeValidationWaits: f.waits, verifyBinding: async () => {} }), /clean|payload/i);
  const clean = { project: f.project, url: f.clean.url, requireCurrent: async () => {} };
  await assert.rejects(f.origin.mountCandidate({ candidate, project: f.project, cleanDelivery: clean,
    nativeValidationWaits: f.waits, verifyBinding: async () => {} }), /payload/i);
  await assert.rejects(f.origin.mountCandidate({ candidate, project: f.project, cleanDelivery: f.clean,
    nativeValidationWaits: f.waits, verifyBinding: async () => {} }), /cleanup/i);
});

test('COS97 original native cancellation preserves the origin and old generation failure cannot close a later mount', async t => {
  const f = await fixture(t); const unmount = await f.mount(), first = f.waits.beginSegment('first');
  let oldCaller!: AbortSignal;
  const reason = new Error('exact segment cancellation');
  const pending = first.runStage('prepare_authority', async life => { oldCaller = life.signal; first.revoke(reason); await f.origin.verify(life.signal); });
  await assert.rejects(pending, error => error === reason);
  await first.settle(Date.now() + 1000); await unmount(); await f.mount();
  const second = f.waits.beginSegment('second'); await navigation(second);
  assert.equal(await f.origin.failCurrent(new Error('late old source rejection'), oldCaller), 'retained');
  const response = await fetch(f.origin.url); assert.equal(response.status, 200); assert.equal(await response.text(), html);
  second.revoke(); await second.settle(Date.now() + 1000);
});

test('COS97 a derived read signal cannot claim local cancellation while controller reason retains priority', async t => {
  const f = await fixture(t); await f.mount(); const segment = f.waits.beginSegment('first'), reason = new Error('derived cancellation');
  await segment.runStage('prepare_authority', async life => {
    const abort = new AbortController(), derived = associateNativeReadSignal(life.signal, AbortSignal.any([life.signal, abort.signal]));
    abort.abort(reason); assert.equal(await f.origin.failCurrent(reason, derived), 'closed');
  });
  await assert.rejects(fetch(f.origin.url)); segment.revoke(); await segment.settle(Date.now() + 1000);
  const other = await fixture(t); await other.mount(); const next = other.waits.beginSegment('next'), stopped = new Error('original controller stop');
  await assert.rejects(next.runStage('prepare_authority', async life => {
    next.revoke(reason); other.owner.abort(stopped); await other.origin.failCurrent(reason, life.signal);
  }), error => error === stopped);
  await assert.rejects(fetch(other.origin.url)); await next.settle(Date.now() + 1000);
});

test('COS97 source rejection closes the current origin only after tracked raw invalidation cleanup', async t => {
  const f = await fixture(t); await f.mount(); const segment = f.waits.beginSegment('first'); await navigation(segment);
  const entered = deferred(), release = deferred(), changed = new Error('fresh source changed'), close = Server.prototype.close;
  t.mock.method(Server.prototype, 'close', function (this: Server, callback?: (error?: Error) => void) {
    if (this.address() && (this.address() as { port: number }).port === Number(new URL(f.origin.url).port)) {
      entered.resolve(); void release.promise.then(() => close.call(this, callback)); return this;
    }
    return close.call(this, callback);
  });
  f.setBinding(async () => { throw changed; });
  const response = fetch(f.origin.url).catch(error => error);
  try {
    assert.equal(await Promise.race([entered.promise.then(() => true), new Promise<boolean>(done => setTimeout(() => done(false), 1000))]), true, 'Raw failure must enter its invalidation close chain');
    assert.equal(segment.snapshot().http.pending, 1); assert.ok(segment.snapshot().rawOperationsPending > 0);
    assert.equal(segment.snapshot().firstCause?.message, changed.message, 'Observed source cause precedes asynchronous invalidation cleanup');
    segment.revoke(changed); await assert.rejects(segment.settle(Date.now() + 30), /settle|deadline/i);
    await assert.rejects(f.work.cancelAndDrain('external drain', 30), /quiesce/);
  } finally { release.resolve(); }
  await response; await segment.settle(Date.now() + 1000);
  assert.equal(segment.snapshot().http.pending, 0); assert.equal(segment.snapshot().rawOperationsPending, 0);
});

for (const phase of ['pre', 'post'] as const) test(`COS97 ${phase} cancellation stops the next HTTP step and keeps the shared listener`, async t => {
  const f = await fixture(t); await f.mount(); const first = f.waits.beginSegment('first'); await navigation(first);
  let calls = 0, bodies = 0; const reason = new Error(`exact ${phase} cancellation`);
  f.upstream.on('request', () => bodies++);
  f.setBinding(async caller => {
    calls++; assert.ok(caller);
    if (calls === (phase === 'pre' ? 1 : 2)) first.revoke(reason);
  });
  const response = await fetch(f.origin.url); assert.equal(response.status, 404); assert.equal(await response.text(), 'Not found');
  await first.settle(Date.now() + 1000);
  assert.equal(calls, phase === 'pre' ? 1 : 2); assert.equal(bodies, phase === 'pre' ? 0 : 1); assert.equal(f.payloads.length, 0);
  assert.equal(first.snapshot().firstCause?.message, reason.message);
  f.setBinding(async () => {}); const second = f.waits.beginSegment('second'); await navigation(second);
  assert.equal((await fetch(f.origin.url)).status, 200); second.revoke(); await second.settle(Date.now() + 1000);
});

test('COS97 cancelled late body stays owned, cannot start post verification, and cannot affect the next generation', async t => {
  const f = await fixture(t); await f.mount(); const first = f.waits.beginSegment('first'); await navigation(first);
  const entered = deferred(), release = deferred(), originalFetch = globalThis.fetch;
  let bodySignal!: AbortSignal, guards = 0;
  f.setBinding(async () => { guards++; });
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], options?: Parameters<typeof fetch>[1]) => {
    const actual = await originalFetch(input, options);
    if (String(input).startsWith(f.clean.url)) {
      bodySignal = options!.signal!;
      const bytes = await actual.arrayBuffer();
      return { ...actual, status: actual.status, headers: actual.headers, async arrayBuffer() { entered.resolve(); await release.promise; return bytes; } } as Response;
    }
    return actual;
  });
  const pending = fetch(f.origin.url); await entered.promise;
  const reason = new Error('cancel late body'); first.revoke(reason);
  const response = await pending; assert.equal(response.status, 404); assert.equal(bodySignal.aborted, true);
  assert.equal(guards, 1); assert.equal(f.payloads.length, 0); assert.ok(f.waits.snapshot().rawReads.pending > 0);
  await assert.rejects(first.settle(Date.now() + 30), /settle|deadline/i);
  assert.throws(() => f.waits.beginSegment('too-early'), /not ready/);
  release.resolve(); await first.settle(Date.now() + 1000);
  const second = f.waits.beginSegment('second'); await navigation(second);
  assert.equal((await fetch(f.origin.url)).status, 200); second.revoke(); await second.settle(Date.now() + 1000);
});

test('COS97 post payload expiry rejects before headers even if the timer callback has not fired', async t => {
  const f = await fixture(t); await f.mount(); const segment = f.waits.beginSegment('first'); await navigation(segment);
  const now = Date.now.bind(Date); let offset = 0;
  t.mock.method(Date, 'now', () => now() + offset);
  f.clean.verifyPayload = async () => { offset = 60001; return 'content'; };
  const response = await fetch(f.origin.url).catch(error => error);
  assert.ok(response instanceof Error || response.status === 404);
  assert.equal(segment.snapshot().firstCause?.name, 'NativeWaitDeadlineError');
  offset = 0; segment.revoke(); await segment.settle(Date.now() + 1000);
  f.clean.verifyPayload = async () => 'content'; const second = f.waits.beginSegment('second'); await navigation(second);
  assert.equal((await fetch(f.origin.url)).status, 200); second.revoke(); await second.settle(Date.now() + 1000);
});

test('COS97 repeated host failure retains the completed shared invalidation disposition', async t => {
  const f = await fixture(t); await f.mount(); const first = f.waits.beginSegment('first'), changed = new Error('current receipt changed');
  f.setScope(async () => { throw changed; });
  await first.runStage('prepare_authority', async life => {
    await assert.rejects(f.origin.verify(life.signal), error => error === changed);
    assert.equal(await f.origin.failCurrent(changed, life.signal), 'closed');
  });
  first.revoke(); await first.settle(Date.now() + 1000);
});

test('COS97 origin cleanup failure is retained without replacing the current source error', async t => {
  const f = await fixture(t); await f.mount(); const segment = f.waits.beginSegment('first'), source = new Error('exact source failure'), cleanup = new Error('exact close failure');
  const close = Server.prototype.close;
  t.mock.method(Server.prototype, 'close', function (this: Server, callback?: (error?: Error) => void) {
    if (this.address() && (this.address() as { port: number }).port === Number(new URL(f.origin.url).port)) return close.call(this, error => callback?.(error ?? cleanup));
    return close.call(this, callback);
  });
  f.setScope(async () => { throw source; });
  await segment.runStage('prepare_authority', async life => {
    await assert.rejects(f.origin.verify(life.signal), error => error === source);
    assert.equal(await f.origin.failCurrent(source, life.signal), 'closed');
  });
  assert.deepEqual(f.cleanupFailures, [cleanup]);
  await assert.rejects(f.origin.close(), error => error === cleanup);
  segment.revoke(); await segment.settle(Date.now() + 1000);
  await assert.rejects(f.work.cancelAndDrain('cleanup check'), error => error instanceof AggregateError && error.errors.includes(cleanup));
});

for (const failsClose of [false, true]) test(`COS97 public pre-mount native caller closes on a genuine source error (cleanup failure: ${failsClose})`, async t => {
  const f = await fixture(t), source = new Error('pre-mount source failure'), cleanup = new Error('pre-mount close failure');
  const close = Server.prototype.close;
  if (failsClose) t.mock.method(Server.prototype, 'close', function (this: Server, callback?: (error?: Error) => void) {
    if (this.address() && (this.address() as { port: number }).port === Number(new URL(f.origin.url).port)) return close.call(this, error => callback?.(error ?? cleanup));
    return close.call(this, callback);
  });
  f.setScope(async () => { throw source; });
  await assert.rejects(f.origin.verify(f.waits.readSignal), error => error === source);
  assert.equal(await f.origin.failCurrent(source, f.waits.readSignal), 'closed');
  await assert.rejects(fetch(f.origin.url)); assert.deepEqual(f.cleanupFailures, failsClose ? [cleanup] : []);
});

test('COS97 a mount delayed in its final clean guard cannot publish after origin invalidation', async t => {
  const f = await fixture(t), entered = deferred(), release = deferred(), changed = new Error('source invalidated during final mount guard');
  f.clean.requireCurrent = async () => { entered.resolve(); await release.promise; };
  const mounting = f.mount(); await entered.promise;
  try {
    f.setScope(async () => { throw changed; });
    await assert.rejects(f.origin.verify(), error => error === changed);
    assert.equal(f.owner.signal.aborted, false); await assert.rejects(fetch(f.origin.url));
  } finally { release.resolve(); }
  await assert.rejects(mounting, /mount|closed|listener/i);
});

test('COS97 source Error identity survives a later segment cancellation while invalidation is pending', async t => {
  const f = await fixture(t); await f.mount(); const segment = f.waits.beginSegment('first'); await navigation(segment);
  const entered = deferred(), release = deferred(), source = new Error('original source object'), later = new Error('later local cancellation'), close = Server.prototype.close;
  t.mock.method(Server.prototype, 'close', function (this: Server, callback?: (error?: Error) => void) {
    if (this.address() && (this.address() as { port: number }).port === Number(new URL(f.origin.url).port)) {
      entered.resolve(); void release.promise.then(() => close.call(this, callback)); return this;
    }
    return close.call(this, callback);
  });
  f.setBinding(async () => { throw source; });
  const pending = fetch(f.origin.url).catch(error => error); await entered.promise;
  try {
    assert.equal(segment.snapshot().firstCause?.message, source.message); segment.revoke(later);
    await assert.rejects(segment.settle(Date.now() + 30), /settle|deadline/i);
  } finally { release.resolve(); }
  await pending; await segment.settle(Date.now() + 1000);
  assert.ok(f.rawFailures.length > 0); assert.ok(f.rawFailures.every(error => error === source), 'Every actual owned rejection must preserve the original source object');
  assert.equal(segment.snapshot().firstCause?.message, source.message); assert.equal(f.owner.signal.aborted, false);
});

test('COS97 the original controller reason wins after work was already cancelled', async t => {
  const f = await fixture(t), controllerReason = new Error('later original controller reason');
  await f.work.cancelAndDrain('earlier owned work cancellation'); const workReason = f.work.signal.reason;
  f.owner.abort(controllerReason); assert.notEqual(workReason, controllerReason);
  await assert.rejects(f.origin.verify(f.waits.readSignal), error => error === controllerReason);
  await assert.rejects(fetch(f.origin.url));
});

for (const controllerLater of [false, true]) test(`COS97 native source survives later owned work cancellation (controller later: ${controllerLater})`, async t => {
  const f = await fixture(t); await f.mount(); const segment = f.waits.beginSegment('first');
  const entered = deferred(), release = deferred(), source = new Error('observed source before work cancellation'), controllerReason = new Error('later raw controller reason'), close = Server.prototype.close;
  let rawOriginError: unknown;
  t.mock.method(Server.prototype, 'close', function (this: Server, callback?: (error?: Error) => void) {
    if (this.address() && (this.address() as { port: number }).port === Number(new URL(f.origin.url).port)) {
      entered.resolve(); void release.promise.then(() => close.call(this, callback)); return this;
    }
    return close.call(this, callback);
  });
  f.setScope(async () => { throw source; });
  const phase = segment.runStage('prepare_authority', life => runNativeValidationRead(life.signal, async () => {
    try { await f.origin.verify(life.signal); } catch (error) { rawOriginError = error; throw error; }
  })).then(() => assert.fail('Expected source failure'), error => error);
  await entered.promise;
  try {
    assert.equal(segment.snapshot().firstCause?.message, source.message);
    await assert.rejects(f.work.cancelAndDrain('later owned work cancellation', 30), /quiesce/);
    assert.equal(await phase, source, 'The stage must return its actual canonical source Error');
    assert.ok(f.waits.snapshot().rawReads.pending > 0); await assert.rejects(segment.settle(Date.now() + 30), /settle|deadline/i);
    assert.throws(() => f.waits.beginSegment('too-early'), error => error === f.work.signal.reason);
    if (controllerLater) f.owner.abort(controllerReason);
  } finally { release.resolve(); }
  await segment.settle(Date.now() + 1000);
  const expected = controllerLater ? controllerReason : source;
  assert.equal(rawOriginError, expected); assert.ok(f.rawFailures.length > 0); assert.ok(f.rawFailures.every(error => error === expected));
  assert.equal(f.waits.snapshot().rawReads.pending, 0); assert.equal(f.owner.signal.aborted, controllerLater);
});

test('COS97 clean delivery verifies actual fixed bytes with exact mapping and preserves optional caller reason', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos97-delivery-payload-')), project = join(root, candidate.location);
  const controller = await RunController.create({ root, runId: 'run', ledgerId: 'synthetic', kind: 'evaluation', scope: 'validation', specVersion: '1',
    durationMs: 60000, allocations: [{ taskId: 'host', amountMicroCny: 1 }] }), work = new OwnedWork(controller.signal);
  t.after(async () => { await work.cancelAndDrain('fixture cleanup'); await controller.close(); assert.ok(root.startsWith(join(tmpdir(), 'cos97-delivery-payload-'))); await rm(root, { recursive: true, force: true }); });
  await mkdir(join(project, 'dist'), { recursive: true }); await mkdir(join(project, '_cosmos')); await mkdir(join(root, 'evidence/host'), { recursive: true });
  await writeFile(join(project, 'dist/index.html'), html, 'utf8'); await writeFile(join(project, 'dist/中文.txt'), '中文资源', 'utf8');
  await mkdir(join(project, 'dist/nested')); await writeFile(join(project, 'dist/nested/file.txt'), 'encoded slash', 'utf8');
  await writeFile(join(project, 'dist/100%.txt'), 'literal percent', 'utf8');
  await writeFile(join(project, '_cosmos/delivery.json'), JSON.stringify({ candidate }), 'utf8');
  await writeFile(join(project, 'standalone-launcher.mjs'), await readFile(new URL('../../src/runtime/standalone-launcher.mjs', import.meta.url)));
  const authority = { taskId: 'host', windowId: null, deadlineAt: (await controller.read()).run.originalDeadlineAt }, callers: (AbortSignal | undefined)[] = [];
  await withCleanDelivery({ root, project, candidate, controller, work, authority, signal: controller.signal,
    async requireCurrent(caller?: AbortSignal) { callers.push(caller); caller?.throwIfAborted(); } }, async clean => {
    assert.equal(typeof clean.verifyPayload, 'function');
    const payload = clean.verifyPayload!.bind(clean), actual = Buffer.from(await (await fetch(clean.url)).arrayBuffer());
    assert.equal(await payload('index.html', { status: 200, bytes: actual }), 'content');
    assert.equal(await payload('中文.txt', { status: 200, bytes: Buffer.from('中文资源') }), 'content');
    assert.equal(await payload('missing', { status: 404, bytes: Buffer.from(html) }), 'not_found');
    for (const [name, status, bytes] of [['index.html', 404, actual], ['index.html', 500, actual], ['INDEX.HTML', 200, actual], ['missing', 200, actual], ['missing', 500, actual], ['index.html', 200, Buffer.from('wrong actual bytes')]] as const)
      await assert.rejects(payload(name, { status, bytes }), /payload|bytes|response/i);
    await writeFile(join(clean.project, 'dist/index.html'), 'temporary wrong bytes', 'utf8');
    const changedBody = Buffer.from(await (await fetch(clean.url)).arrayBuffer());
    await writeFile(join(clean.project, 'dist/index.html'), html, 'utf8');
    await assert.rejects(payload('index.html', { status: 200, bytes: changedBody }), /payload|bytes|response/i);
    const abort = new AbortController(), reason = new Error('exact payload caller reason'); abort.abort(reason);
    await assert.rejects(clean.requireCurrent(abort.signal), error => error === reason);
    await assert.rejects(payload('index.html', { status: 200, bytes: actual }, abort.signal), error => error === reason);
    const active = new AbortController(); await clean.requireCurrent(active.signal); assert.equal(callers.at(-1), active.signal);
    await payload('index.html', { status: 200, bytes: actual });
    const waits = createNativeValidationWaits({ caseId: 'case', windowId: 'window', taskId: 'host', deadlineAt: Date.parse(authority.deadlineAt),
      signal: work.signal, trackRaw: start => work.run(start) });
    let guards = 0, transient = false;
    const origin = await reserveTransferOrigin({ root, binding, resume: false, signal: work.signal, requireScope: async caller => { caller?.throwIfAborted(); } });
    try {
      await origin.mountCandidate({ candidate, project, cleanDelivery: clean, nativeValidationWaits: waits, retainCleanupFailure: error => work.retainCleanupFailure(error), async verifyBinding(caller) {
        caller?.throwIfAborted();
        if (transient) await writeFile(join(clean.project, 'dist/index.html'), ++guards === 1 ? 'transient upstream bytes' : html, 'utf8');
      } });
      const segment = waits.beginSegment('payload'); await navigation(segment);
      assert.equal(await (await fetch(origin.url + '/?query=1')).text(), html);
      assert.equal(await (await fetch(origin.url + '/%E4%B8%AD%E6%96%87.txt?query=1')).text(), '中文资源');
      assert.equal(await (await fetch(origin.url + '/nested%2Ffile.txt?query=1')).text(), 'encoded slash');
      assert.equal(await (await fetch(origin.url + '/100%25.txt')).text(), 'literal percent');
      const missing = await fetch(origin.url + '/missing'); assert.equal(missing.status, 404); assert.equal(await missing.text(), 'Not found');
      const originalFetch = globalThis.fetch;
      t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], options?: Parameters<typeof fetch>[1]) => {
        if (String(input) === clean.url + '/missing-error-body') return new Response(html, { status: 404 });
        return originalFetch(input, options);
      });
      const missingError = await fetch(origin.url + '/missing-error-body'); assert.equal(missingError.status, 404); assert.equal(await missingError.text(), 'Not found');
      transient = true;
      const rejected = await fetch(origin.url).catch(error => error);
      assert.ok(rejected instanceof Error || rejected.status === 404, 'Changed actual body must never become a valid 200');
      assert.equal(await readFile(join(clean.project, 'dist/index.html'), 'utf8'), html, 'The disk was restored before actual payload verification');
      assert.match(segment.snapshot().firstCause?.message ?? '', /payload.*bytes/i);
      segment.revoke(); await segment.settle(Date.now() + 1000);
    } finally { await origin.close(); }
  });
});

test('COS97 legacy clean mount retains its direct serving behavior without native stages', async t => {
  const f = await fixture(t); await f.mount(false);
  const response = await fetch(f.origin.url); assert.equal(response.status, 200); assert.equal(await response.text(), html);
  assert.equal(f.payloads.length, 0); assert.equal(f.waits.snapshot().segments.length, 0);
});

test('COS97 legacy non-clean dist mount keeps the existing direct file path', async t => {
  const f = await fixture(t); await f.origin.mountCandidate({ candidate, project: f.project, verifyBinding: async () => {} });
  const response = await fetch(f.origin.url); assert.equal(response.status, 200); assert.equal(await response.text(), html);
  assert.equal(f.waits.snapshot().segments.length, 0);
});
