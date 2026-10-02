import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { runtimeFixture } from './continuation-runtime.fixture.ts';

const bytes = (root: string) => readFile(join(root, 'snapshot.json'));
const state = async (root: string) => JSON.parse((await bytes(root)).toString('utf8'));
const receiptPath = (root: string, value: any) => join(root, 'idle-receipts', value.continuation.currentWindowId, `revision-${value.revision}.json`);
const stop = (f: Awaited<ReturnType<typeof runtimeFixture>>) => RunController.stopIdleWindow({ root: f.root, windowId: f.window.windowId, now: f.options().now });
const idle = (f: Awaited<ReturnType<typeof runtimeFixture>>, work = new OwnedWork(f.controller.signal)) => f.controller.closeAfterDrain(work);

test('normal close after real drain publishes anchored proof and permits an offline window stop', async t => {
  const f = await runtimeFixture(t), original = await f.state(), work = new OwnedWork(f.controller.signal);
  let release!: () => void, entered!: () => void;
  const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
  const operation = work.run(async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); });
  await enteredPromise;
  const closing = idle(f, work);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await state(f.root)).events.some((event: any) => event.type === 'window_owner_drained'), false);
  await assert.rejects(readdir(join(f.root, 'idle-receipts')), /ENOENT/);
  release(); await operation; await closing;
  const drained = await state(f.root), receipt = JSON.parse(await readFile(receiptPath(f.root, drained), 'utf8'));
  assert.equal(receipt.revision, drained.revision); assert.equal(receipt.windowId, f.window.windowId);
  assert.equal(JSON.stringify(drained).includes(receipt.nonce), false);
  assert.equal(drained.events.at(-1).type, 'window_owner_drained');
  assert.deepEqual(drained.ledger, original.ledger); assert.deepEqual(drained.tasks, original.tasks);
  await assert.rejects(f.controller.read(), /closed/);
  assert.deepEqual(await stop(f), { runId: original.run.runId, windowId: f.window.windowId, stopped: true });
  const stopped = await state(f.root);
  assert.equal(stopped.continuation.windows[0].stopReason.code, 'manual');
  assert.deepEqual(stopped.stopReason, original.stopReason); assert.deepEqual(stopped.ledger, original.ledger);
  assert.equal(stopped.run.originalDeadlineAt, original.run.originalDeadlineAt);
  assert.equal(stopped.continuation.windows[0].deadlineAt, f.window.deadlineAt);
});

for (const changed of ['nonce', 'revision', 'windowId', 'snapshotSha256'] as const) test(`forged idle ${changed} is rejected before an expired window can be mutated`, async t => {
  const f = await runtimeFixture(t); await idle(f);
  const original = await bytes(f.root), snapshot = await state(f.root), path = receiptPath(f.root, snapshot), receipt = JSON.parse(await readFile(path, 'utf8'));
  receipt[changed] = changed === 'revision' ? receipt.revision + 1 : '0'.repeat(64);
  await writeFile(path, JSON.stringify(receipt), 'utf8'); f.advance(60_000);
  await assert.rejects(stop(f), /idle|receipt|proof|anchor/i);
  assert.deepEqual(await bytes(f.root), original);
  await assert.rejects(readFile(join(f.root, '.controller.lock')), /ENOENT/);
});

test('opening a drained window consumes its proof even without starting a task', async t => {
  const f = await runtimeFixture(t); await idle(f);
  const prior = await state(f.root), active = await RunController.open({ root: f.root, windowId: f.window.windowId, now: f.options().now });
  await active.close();
  const resumed = await state(f.root);
  assert.equal(resumed.revision, prior.revision + 1); assert.equal(resumed.events.at(-1).type, 'window_owner_resumed');
  const unchanged = await bytes(f.root); await assert.rejects(stop(f), /idle|receipt|proof|anchor/i);
  assert.deepEqual(await bytes(f.root), unchanged);
});

test('ordinary close and missing owner marker are insufficient idle proof', async t => {
  const f = await runtimeFixture(t); await f.controller.close(); const before = await bytes(f.root);
  await assert.rejects(stop(f), /idle|receipt|proof|anchor/i);
  assert.deepEqual(await bytes(f.root), before);
});

test('unresolved owned child prevents publication even after the work tracker drains', async t => {
  const f = await runtimeFixture(t);
  await f.controller.prepareOwnedChild({ taskId: f.next.task.taskId, windowId: f.window.windowId });
  await assert.rejects(idle(f), /unresolved/i);
  await assert.rejects(readdir(join(f.root, 'idle-receipts')), /ENOENT/);
  assert.ok(await readFile(join(f.root, '.controller.lock')));
});

test('registry writer blocks both publication and later idle stop', async t => {
  const f = await runtimeFixture(t), path = join(f.root, 'registry/.commit.lock'); await mkdir(join(f.root, 'registry'), { recursive: true });
  await writeFile(path, 'offline active writer', 'utf8');
  const original = await bytes(f.root); await assert.rejects(idle(f), /registry|writer/i); assert.deepEqual(await bytes(f.root), original);
  await unlink(path); await idle(f); const drained = await bytes(f.root);
  await writeFile(path, 'offline active writer', 'utf8'); await assert.rejects(stop(f), /registry|writer/i);
  assert.deepEqual(await bytes(f.root), drained); await unlink(path);
});

test('failed owner close never publishes the nonce or an idle receipt', async t => {
  const f = await runtimeFixture(t), originalClose = SnapshotStore.prototype.close;
  const mocked = t.mock.method(SnapshotStore.prototype, 'close', async function (this: SnapshotStore) {
    if (this.root === f.root) throw new Error('Offline close failure');
    return originalClose.call(this);
  });
  await assert.rejects(idle(f), /close failure/i);
  await assert.rejects(readdir(join(f.root, 'idle-receipts')), /ENOENT/);
  assert.ok(await readFile(join(f.root, '.controller.lock'))); mocked.mock.restore(); await f.controller.close();
  const before = await bytes(f.root); await assert.rejects(stop(f), /idle|receipt|proof|anchor/i); assert.deepEqual(await bytes(f.root), before);
});

test('drain timeout preserves ownership and cannot publish proof for an unfinished write', async t => {
  const f = await runtimeFixture(t), work = new OwnedWork(f.controller.signal), before = await bytes(f.root);
  let release!: () => void;
  const pending = work.run(() => new Promise<void>(resolve => { release = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  const drain = work.cancelAndDrain.bind(work); t.mock.method(work, 'cancelAndDrain', (reason: string) => drain(reason, 1));
  try {
    await assert.rejects(idle(f, work), /drain deadline/i);
    assert.deepEqual(await bytes(f.root), before); assert.ok(await readFile(join(f.root, '.controller.lock')));
    await assert.rejects(readdir(join(f.root, 'idle-receipts')), /ENOENT/);
  } finally { release(); await pending; }
});

test('changed snapshot bytes cannot reuse an authentic receipt at the same revision', async t => {
  const f = await runtimeFixture(t); await idle(f);
  const path = join(f.root, 'snapshot.json'), changed = Buffer.concat([await bytes(f.root), Buffer.from('\n')]);
  await writeFile(path, changed); f.advance(60_000);
  await assert.rejects(stop(f), /idle|receipt|proof|anchor/i); assert.deepEqual(await bytes(f.root), changed);
});
