import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { withCleanDelivery } from '../../src/runtime/entrypoint-delivery.ts';

const html = '<p>就绪握手测试</p>';
const exited = (pid: number) => { try { process.kill(pid, 0); return false; } catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; } };
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve }; }
function beforeExit<T>(progress: Promise<T>, settled: Promise<unknown>): Promise<T> {
  return Promise.race([progress, settled.then(value => { throw (value as { error?: unknown })?.error ?? value ?? new Error('Delivery ended before the test barrier'); })]);
}

async function fixture(t: test.TestContext, durationMs = 60000) {
  const root = await fs.mkdtemp(join(tmpdir(), 'cos131-ready-'));
  const controller = await RunController.create({ root, runId: 'offline', ledgerId: 'synthetic-ledger', kind: 'evaluation', scope: 'validation', specVersion: '1', durationMs,
    allocations: [{ taskId: 'host', amountMicroCny: 1 }] }), work = new OwnedWork(controller.signal);
  t.after(async () => { await work.cancelAndDrain('fixture cleanup'); await controller.close(); await fs.rm(root, { recursive: true, force: true }); });
  const candidate = { artifactId: 'game', version: 'v1', location: 'candidate' }, project = join(root, candidate.location);
  await fs.mkdir(join(project, '_cosmos'), { recursive: true }); await fs.mkdir(join(project, 'dist'));
  await fs.writeFile(join(project, 'dist/index.html'), html, 'utf8');
  await fs.writeFile(join(project, '_cosmos/delivery.json'), JSON.stringify({ candidate }), 'utf8');
  await fs.copyFile(fileURLToPath(new URL('../../src/runtime/standalone-launcher.mjs', import.meta.url)), join(project, 'standalone-launcher.mjs'));
  await fs.mkdir(join(root, 'evidence/host'), { recursive: true });
  const authority = { taskId: 'host', windowId: null, deadlineAt: (await controller.read()).run.originalDeadlineAt };
  return { root, project, candidate, controller, work, authority, signal: AbortSignal.any([controller.signal, t.signal]), requireCurrent: async () => { controller.signal.throwIfAborted(); await controller.read(); } };
}

interface Publication { temporary: string; receipt: { project: string; pid: number; url: string } }
async function holdPublication(t: test.TestContext, input: Awaited<ReturnType<typeof fixture>>, prepare?: (publication: Publication, ready: string) => Promise<void>) {
  const linked = deferred<Publication>(), unlinked = deferred<void>(), waiting = deferred<void>(), prepared = deferred<void>();
  const hooks: { beforeStat?: (path: string, bigint: boolean) => Promise<void>; afterRead?: () => void } = {};
  let release = () => {}, observedTwoLinks = false, waits = 0;
  const server = createServer(async (request, response) => {
    if (request.url === '/linked') {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      release = () => response.end(); linked.resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (prepare) release();
    } else {
      if (prepare) await prepare(await linked.promise, ready);
      prepared.resolve(); unlinked.resolve(); response.end();
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const ready = join(input.root, 'delivery-work/host/ready.json');
  const spawn = childProcess.spawn, stat = fs.lstat, read = fs.readFile, timer = globalThis.setTimeout;
  t.mock.method(childProcess, 'spawn', (command: any, args: string[], options: any) => {
    if (args.includes('--input-type=module') && args.at(-1)?.includes('entrypoint-delivery-worker.ts')) {
      const worker = JSON.parse(args.at(-1)!); const value = JSON.parse(worker.at(-1));
      value.readyBarrier = `http://127.0.0.1:${address.port}`;
      worker[worker.length - 1] = JSON.stringify(value);
      worker.unshift('--import', new URL('./entrypoint-delivery-ready.fixture.mjs', import.meta.url).href);
      args = [...args.slice(0, -1), JSON.stringify(worker)];
    }
    return spawn(command, args, options);
  });
  t.mock.method(fs, 'lstat', async (...args: Parameters<typeof fs.lstat>) => {
    await hooks.beforeStat?.(String(args[0]), Boolean((args[1] as any)?.bigint));
    let value = await stat(...args);
    if (String(args[0]) === ready && prepare) { await prepared.promise; value = await stat(...args); }
    // Ignore safePath's preliminary stat: only observe readReady's own bigint probe.
    if (String(args[0]) === ready && (args[1] as any)?.bigint && value.nlink === 2n) observedTwoLinks = true;
    return value;
  });
  t.mock.method(fs, 'readFile', async (...args: Parameters<typeof fs.readFile>) => {
    const bytes = await read(...args); if (String(args[0]) === ready) hooks.afterRead?.(); return bytes;
  });
  t.mock.method(globalThis, 'setTimeout', (callback: any, delay?: number, ...args: any[]) => {
    if (delay === 25 && observedTwoLinks) { waits++; waiting.resolve(); }
    return timer(callback, delay, ...args);
  });
  syncBuiltinESMExports();
  t.after(async () => { release(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); t.mock.restoreAll(); syncBuiltinESMExports(); });
  return { ready, linked: linked.promise, unlinked: unlinked.promise, waiting: waiting.promise, release: () => release(), waits: () => waits, hooks };
}

async function cleaned(input: Awaited<ReturnType<typeof fixture>>, publication: Publication, accepted: boolean) {
  assert.ok(exited(publication.receipt.pid));
  await assert.rejects(fetch(publication.receipt.url));
  await assert.rejects(fs.stat(publication.receipt.project), { code: 'ENOENT' });
  const report = JSON.parse(await fs.readFile(join(input.root, 'evidence/host/delivery-check.json'), 'utf8'));
  assert.equal(report.outcome, accepted ? 'passed' : 'failed');
  assert.equal(report.deadlineAt, input.authority.deadlineAt);
  const owner = JSON.parse(await fs.readFile(join(input.root, '.controller.lock'), 'utf8'));
  assert.ok(owner.children.every((child: any) => exited(child.pid)));
  assert.equal((await input.controller.read()).ledger.entries.length, 0);
  return report;
}

test('ready waits for the real publisher to remove its matching temporary hard link', async t => {
  const input = await fixture(t), barrier = await holdPublication(t, input); let actions = 0;
  const result = withCleanDelivery(input, async clean => {
    actions++; assert.equal((await fs.lstat(barrier.ready)).nlink, 1);
    assert.equal(await (await fetch(clean.url)).text(), html); return { passed: true };
  });
  const settled = result.then(value => ({ value }), error => ({ error }));
  try {
    const publication = await beforeExit(barrier.linked, settled);
    const observation = await Promise.race([barrier.waiting.then(() => 'waiting'), settled]);
    if (observation !== 'waiting') throw (observation as any).error ?? new Error('Delivery finished before the publication wait');
    assert.equal(actions, 0); assert.ok(barrier.waits() >= 1); assert.equal((await fs.lstat(barrier.ready)).nlink, 2);
    barrier.release(); assert.deepEqual(await result, { passed: true }); assert.equal(actions, 1);
    const report = await cleaned(input, publication, true); assert.equal(report.helperPid, publication.receipt.pid); assert.equal(report.helperExited, true);
  } finally { barrier.release(); await settled; }
});

test('cancellation in the publication window drains the actual helper and never accepts its pid', async t => {
  const input = await fixture(t), barrier = await holdPublication(t, input), abort = new AbortController(); let actions = 0;
  const result = withCleanDelivery({ ...input, signal: AbortSignal.any([input.signal, abort.signal]) }, async () => { actions++; });
  const settled = result.then(() => null, error => error);
  try {
    const publication = await beforeExit(barrier.linked, settled);
    await Promise.race([barrier.waiting, settled.then(error => { throw error; })]);
    const reason = new Error('Cancelled in the confirmed publication window'); abort.abort(reason); barrier.release();
    assert.equal(await settled, reason); assert.equal(actions, 0);
    const report = await cleaned(input, publication, false); assert.equal(report.helperPid, null); assert.equal(report.helperExited, false);
  } finally { barrier.release(); await settled; }
});

test('a permanent publication alias times out under the original ten second readiness limit', { timeout: 20000 }, async t => {
  const input = await fixture(t), barrier = await holdPublication(t, input); let actions = 0;
  const started = Date.now(), result = withCleanDelivery(input, async () => { actions++; });
  const settled = result.then(() => null, error => error);
  try {
    const publication = await beforeExit(barrier.linked, settled);
    await Promise.race([barrier.waiting, settled.then(error => { throw error; })]);
    assert.match(String(await settled), /readiness timed out/); assert.equal(actions, 0);
    assert.ok(Date.now() - started >= 10000);
    const report = await cleaned(input, publication, false); assert.equal(report.helperPid, null); assert.equal(report.helperExited, false);
  } finally { barrier.release(); await settled; }
});

test('publication finishing during temporary metadata probing falls back to strict independent reading', async t => {
  const input = await fixture(t), barrier = await holdPublication(t, input); let actions = 0, finishedDuringProbe = false;
  barrier.hooks.beforeStat = async (path, bigint) => {
    if (bigint && path.startsWith(`${barrier.ready}.`)) {
      finishedDuringProbe = true; barrier.release(); await barrier.unlinked;
    }
  };
  const result = withCleanDelivery(input, async clean => {
    actions++; assert.equal((await fs.lstat(barrier.ready)).nlink, 1); assert.equal(await (await fetch(clean.url)).text(), html); return { passed: true };
  });
  const settled = result.then(value => ({ value }), error => ({ error }));
  try {
    const publication = await beforeExit(barrier.linked, settled); assert.deepEqual(await result, { passed: true });
    assert.equal(finishedDuringProbe, true); assert.equal(barrier.waits(), 0); assert.equal(actions, 1); await cleaned(input, publication, true);
  } finally { barrier.release(); await settled; }
});

for (const kind of ['cancel', 'deadline'] as const) test(`a receipt read across ${kind} is not accepted`, async t => {
  const input = await fixture(t), barrier = await holdPublication(t, input), abort = new AbortController(); let actions = 0, crossed = false;
  const now = Date.now, reason = new Error('Cancelled after ready bytes were read');
  barrier.hooks.afterRead = () => {
    crossed = true;
    if (kind === 'cancel') abort.abort(reason);
    else t.mock.method(Date, 'now', () => now() + 10001);
  };
  const result = withCleanDelivery({ ...input, signal: AbortSignal.any([input.signal, abort.signal]) }, async () => { actions++; });
  const settled = result.then(() => null, error => error);
  try {
    const publication = await beforeExit(barrier.linked, settled);
    await Promise.race([barrier.waiting, settled.then(error => { throw error; })]); barrier.release();
    const error = await settled;
    if (kind === 'cancel') assert.equal(error, reason); else assert.match(String(error), /readiness timed out/);
    assert.equal(crossed, true); assert.equal(actions, 0); await cleaned(input, publication, false);
  } finally { barrier.release(); await settled; }
});

const alias = 'ready.json.12345678-1234-1234-1234-123456789abc.tmp';
const rejectionCases: { name: string; error: RegExp; change: (publication: Publication, ready: string) => Promise<void> }[] = [
  { name: 'hard link with no publisher name', error: /independent regular file/, change: async (_, ready) => { await fs.link(ready, `${ready}.unrelated`); } },
  { name: 'publisher name on a different inode', error: /independent regular file/, change: async (_, ready) => { await fs.link(ready, `${ready}.unrelated`); await fs.writeFile(join(ready, '..', alias), '{}'); } },
  { name: 'more than two links', error: /independent regular file/, change: async (_, ready) => { await fs.link(ready, join(ready, '..', alias)); await fs.link(ready, `${ready}.third`); } },
  { name: 'directory', error: /independent regular file/, change: async (_, ready) => { await fs.unlink(ready); await fs.mkdir(ready); } },
  { name: 'junction', error: /Symbolic link or junction/, change: async (_, ready) => { await fs.unlink(ready); await fs.mkdir(`${ready}.target`); await fs.symlink(`${ready}.target`, ready, 'junction'); } },
  { name: 'invalid UTF-8', error: /encoded data/, change: async (_, ready) => { await fs.writeFile(ready, Buffer.from([0xff])); } },
  { name: 'invalid JSON', error: /JSON/, change: async (_, ready) => { await fs.writeFile(ready, '{', 'utf8'); } },
  ...Object.entries({ formatVersion: 'wrong', candidate: { version: 'wrong' }, project: 'wrong', url: 'http://localhost:1234', pid: 1.5 }).map(([name, value]) => ({
    name: `wrong ${name}`, error: /ready binding differs/, change: async (publication: Publication, ready: string) => { await fs.writeFile(ready, JSON.stringify({ ...publication.receipt, [name]: value }), 'utf8'); },
  })),
];
for (const row of rejectionCases) test(`ready rejects ${row.name} before action`, async t => {
  const input = await fixture(t), barrier = await holdPublication(t, input, row.change); let actions = 0;
  const result = withCleanDelivery(input, async () => { actions++; }), settled = result.then(() => null, error => error);
  try {
    const publication = await beforeExit(barrier.linked, settled); assert.match(String(await settled), row.error); assert.equal(actions, 0);
    assert.equal(barrier.waits(), 0); const report = await cleaned(input, publication, false); assert.equal(report.helperPid, null);
  } finally { barrier.release(); await settled; }
});

test('a helper exiting without a ready receipt still fails and cleans its package', async t => {
  const input = await fixture(t); let actions = 0;
  await fs.writeFile(join(input.project, 'standalone-launcher.mjs'), 'throw new Error("controlled worker startup failure");\n', 'utf8');
  await assert.rejects(withCleanDelivery(input, async () => { actions++; }), /exited before readiness/); assert.equal(actions, 0);
  const report = JSON.parse(await fs.readFile(join(input.root, 'evidence/host/delivery-check.json'), 'utf8'));
  assert.equal(report.outcome, 'failed'); await assert.rejects(fs.stat(report.project), { code: 'ENOENT' });
  const owner = JSON.parse(await fs.readFile(join(input.root, '.controller.lock'), 'utf8'));
  assert.ok(owner.children.every((child: any) => exited(child.pid)));
});
