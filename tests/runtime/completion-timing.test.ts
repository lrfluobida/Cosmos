import assert from 'node:assert/strict';
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { completionFixture } from './completion-timing.fixture.ts';
import { readCompletionTiming } from '../../src/runtime/completion-timing.ts';
import { runOwnedNode } from '../../src/runtime/recovery/owned-command.ts';
import { OwnerLock } from '../../src/runtime/recovery/ownership.ts';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { roleToolEnvironment } from '../../src/roles/factory.ts';
import { stopBrowserProcess } from '../../src/acceptance/process.ts';

const sleep = (ms: number) => new Promise(done => setTimeout(done, ms));
test('initial completion waits for owned work and publishes timing only after owner release', async t => {
  let release!: () => void, entered!: () => void, pending: Promise<unknown> | undefined;
  const gate = new Promise<void>(done => { release = done; }), closing = new Promise<void>(done => { entered = done; });
  const f = await completionFixture(t, async input => async () => {
    pending = input.work.run(async () => { entered(); await gate; await writeFile(join(f.root, 'evidence/last-owned-write.txt'), 'settled', 'utf8'); });
  });
  let settled = false;
  const running = executeGeneration({ ...f, resume: false }).finally(() => { settled = true; });
  await closing;
  try {
    await sleep(80); assert.equal(settled, false, 'Initial owner must wait for the outstanding owned operation');
    assert.ok(await readFile(join(f.root, '.controller.lock')));
    assert.ok(!(await readdir(join(f.root, 'delivery'))).some(name => name.startsWith('completion-')));
  } finally { release(); await pending; }
  const result: any = await running;
  assert.equal(result.completionTiming.current.status, 'in_time');
  await assert.rejects(readFile(join(f.root, '.controller.lock')), { code: 'ENOENT' });
  assert.ok(result.completionTiming.current.elapsedMs >= 80);
});

test('a failed preparation close still drains and releases the original owner', async t => {
  let ownerAttempted = false;
  const f = await completionFixture(t, async input => {
    const close = input.controller.closeForCompletion.bind(input.controller);
    t.mock.method(input.controller, 'closeForCompletion', async (...args: Parameters<typeof close>) => { ownerAttempted = true; return close(...args); });
    return async () => { throw new Error('Injected preparation cleanup failure'); };
  });
  const result: any = await executeGeneration({ ...f, resume: false });
  assert.equal(ownerAttempted, true); assert.equal(result.outcome, 'incomplete'); assert.equal(result.completionTiming.current.status, 'unconfirmed');
  assert.ok(result.completionTiming.cleanup.some((item: any) => item.name === 'preparation' && item.outcome === 'failed'));
  await assert.rejects(readFile(join(f.root, '.controller.lock')), { code: 'ENOENT' });
  assert.equal((await readCompletionTiming(f.root)).current.status, 'unconfirmed');
});

for (const clock of ['late', 'backwards', 'invalid']) test(`simulated ${clock} wall clock cannot claim an in-time completion`, async t => {
  const f = await completionFixture(t, async () => async () => {
    const value = clock === 'late' ? Date.parse(f.original.run.originalDeadlineAt) + 1 : clock === 'backwards' ? Date.parse(f.original.run.originalStartedAt) - 1 : NaN;
    t.mock.method(Date, 'now', () => value);
  });
  const result: any = await executeGeneration({ ...f, resume: false });
  assert.equal(result.outcome, 'incomplete'); assert.equal(result.completionTiming.current.status, clock === 'late' ? 'late' : 'unconfirmed');
  assert.equal((await readCompletionTiming(f.root)).current.status, clock === 'late' ? 'late' : 'unconfirmed');
  const report = JSON.parse(await readFile(join(f.root, result.report), 'utf8'));
  assert.equal(report.requiresCompletionTiming, true); assert.equal(report.automaticAcceptance, 'passed');
});

test('unknown fixture charges remain separate from a confirmed cleanup endpoint', async t => {
  const f = await completionFixture(t, async input => async () => {
    await input.controller.reserve({ requestId: 'unknown-fixture', taskId: 'planning', provider: 'offline', pricingVersion: 'fixture', estimatedMaxCostMicroCny: 1 });
    await input.controller.admit('unknown-fixture'); await input.controller.markUnknown('unknown-fixture', [{ artifactId: 'fixture-receipt', version: 'v1', location: 'fixture-only.json' }]);
  });
  const result: any = await executeGeneration({ ...f, resume: false });
  assert.equal(result.outcome, 'incomplete'); assert.equal(result.completionTiming.current.status, 'in_time'); assert.equal(result.completionTiming.charges, 'unreconciled');
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')); assert.equal(state.ledger.entries[0].unknown, true); assert.equal(state.ledger.entries[0].reservedMicroCny, 1);
});

test('a durable stop during cleanup remains separate from elapsed time and blocks final eligibility', async t => {
  const f = await completionFixture(t, async input => async () => { await input.controller.stop('Fixture stop during cleanup'); });
  const result: any = await executeGeneration({ ...f, resume: false });
  assert.equal(result.completionTiming.current.status, 'in_time'); assert.equal(result.completionTiming.stopReason.code, 'manual');
  assert.equal(result.completionTiming.eligible, false); assert.equal(result.outcome, 'incomplete');
});

test('original entrypoint drains an actual owned Node tree before publishing completion', async t => {
  let child: Promise<unknown> | undefined;
  const f = await completionFixture(t, async input => {
    child = input.work.run(signal => runOwnedNode({ controller: input.controller, authority: { taskId: 'planning', windowId: null, deadlineAt: f.original.run.originalDeadlineAt },
      signal, cwd: f.root, timeoutMs: 10000, args: ['-e', "require('node:fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)", join(f.root, 'node-pid.txt')] })).catch(() => {});
    const limit = Date.now() + 5000;
    while (true) { try { await readFile(join(f.root, 'node-pid.txt')); break; } catch { if (Date.now() >= limit) throw new Error('Node fixture did not start'); await sleep(25); } }
    return undefined;
  });
  const result: any = await executeGeneration({ ...f, resume: false }); await child;
  const pid = Number(await readFile(join(f.root, 'node-pid.txt'), 'utf8')); assert.throws(() => process.kill(pid, 0));
  assert.equal(result.completionTiming.current.status, 'in_time'); await assert.rejects(readFile(join(f.root, '.controller.lock')), { code: 'ENOENT' });
});

test('missing report still attempts cleanup and records an unconfirmed endpoint', async t => {
  const f = await completionFixture(t);
  await assert.rejects(executeGeneration({ ...f, resume: false, createHost: async () => { throw new Error('Injected before-report failure'); } }), /before-report/);
  const file = (await readdir(join(f.root, 'delivery'))).find(name => /^completion-unreported-\d+\.json$/.test(name))!;
  const value = JSON.parse(await readFile(join(f.root, 'delivery', file), 'utf8')); assert.equal(value.binding.report, null); assert.equal(value.current.status, 'unconfirmed');
  await assert.rejects(readFile(join(f.root, '.controller.lock')), { code: 'ENOENT' });
});

test('unresolved child intent cannot publish a confirmed owner release', async t => {
  const f = await completionFixture(t, async input => { await input.controller.prepareOwnedChild(); return undefined; });
  const result: any = await executeGeneration({ ...f, resume: false });
  try { assert.equal(result.completionTiming.current.status, 'unconfirmed'); assert.equal(result.outcome, 'incomplete'); assert.ok(await readFile(join(f.root, '.controller.lock'))); }
  finally { await unlink(join(f.root, '.controller.lock')); }
});

test('a new owner racing post-close publication cannot borrow the old completion', async t => {
  let newer: OwnerLock | undefined;
  const f = await completionFixture(t, async input => {
    const close = input.controller.closeForCompletion.bind(input.controller);
    t.mock.method(input.controller, 'closeForCompletion', async (...args: Parameters<typeof close>) => { const proof = await close(...args); newer = await OwnerLock.acquire(f.root, '.controller.lock'); return proof; });
    return undefined;
  });
  try { const result: any = await executeGeneration({ ...f, resume: false }); assert.equal(result.outcome, 'incomplete'); assert.equal(result.completionTiming.current.status, 'unconfirmed'); }
  finally { await newer?.close(); }
  assert.equal((await readCompletionTiming(f.root)).current.status, 'unconfirmed');
});

test('an actual still-live owned child keeps completion unconfirmed even after later manual cleanup', async t => {
  let child: ReturnType<typeof spawn> | undefined, closed: Promise<unknown> | undefined;
  const f = await completionFixture(t, async input => {
    const ticket = await input.controller.prepareOwnedChild();
    child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { env: roleToolEnvironment(), windowsHide: true, stdio: 'ignore' });
    closed = once(child, 'close'); await input.controller.registerOwnedChild(child.pid!, ticket); return undefined;
  });
  try {
    const result: any = await executeGeneration({ ...f, resume: false }); assert.equal(result.outcome, 'incomplete'); assert.equal(result.completionTiming.current.status, 'unconfirmed');
    assert.ok(await readFile(join(f.root, '.controller.lock'))); assert.doesNotThrow(() => process.kill(child!.pid!, 0));
  } finally { await stopBrowserProcess(child!, 3000); await closed; await f.active().controller.close(); }
  assert.equal((await readCompletionTiming(f.root)).current.status, 'unconfirmed');
});

test('a registry writer blocks confirmed timing while other cleanup still releases the run owner', async t => {
  let writer: OwnerLock | undefined;
  const f = await completionFixture(t, async () => async () => { writer = await OwnerLock.acquire(f.root, 'registry/.commit.lock'); });
  try {
    const result: any = await executeGeneration({ ...f, resume: false }); assert.equal(result.completionTiming.current.status, 'unconfirmed');
    await assert.rejects(readFile(join(f.root, '.controller.lock')), { code: 'ENOENT' });
  } finally { await writer?.close(); }
});
