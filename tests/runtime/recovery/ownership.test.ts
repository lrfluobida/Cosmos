import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SnapshotStore } from '../../../src/runtime/store.ts';

async function fixture(t: any) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-recovery-owner-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function child(t: any, root: string, ownedPid?: number) {
  const code = `import { SnapshotStore } from ${JSON.stringify(new URL('../../../src/runtime/store.ts', import.meta.url).href)};
const store = await SnapshotStore.acquire(process.argv[1]);
if (process.argv[2]) { const ticket = await store.prepareOwnedChild(); await store.registerOwnedChild(Number(process.argv[2]), ticket); }
process.send('ready'); setInterval(() => {}, 1000);`;
  const processChild = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', code, root, ...(ownedPid ? [String(ownedPid)] : [])], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true, env: { SYSTEMROOT: process.env.SYSTEMROOT } });
  const exited = once(processChild, 'exit');
  t.after(async () => { if (processChild.exitCode === null && processChild.signalCode === null) processChild.kill(); await exited; });
  await Promise.race([once(processChild, 'message'), exited.then(() => { throw new Error('Owner fixture exited before readiness'); })]);
  return { processChild, async stop() { processChild.kill(); await exited; } };
}

test('controller ownership records identity and refuses to remove a replacement lock', async t => {
  const root = await fixture(t), store = await SnapshotStore.acquire(root);
  const lockPath = join(root, '.controller.lock');
  const owner = JSON.parse(await readFile(lockPath, 'utf8'));
  assert.equal(owner.formatVersion, 1);
  assert.equal(owner.pid, process.pid);
  assert.match(owner.token, /^[\w-]+$/);
  assert.deepEqual(owner.children, []);
  await writeFile(lockPath, JSON.stringify({ ...owner, token: 'replacement' }), 'utf8');
  await assert.rejects(store.close(), /ownership|owner/i);
  assert.equal(JSON.parse(await readFile(lockPath, 'utf8')).token, 'replacement');
});

test('recovery preserves a dead owners snapshot and permits only one subsequent owner', async t => {
  const root = await fixture(t), owner = await child(t, root);
  await writeFile(join(root, 'snapshot.json'), '{"中文":"已提交"}\n', 'utf8');
  await assert.rejects(SnapshotStore.recover(root), /alive|running|owner/i);
  await owner.stop();
  const results = await Promise.allSettled([SnapshotStore.recover(root), SnapshotStore.recover(root)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(await readFile(join(root, 'snapshot.json'), 'utf8'), '{"中文":"已提交"}\n');
  const reopened = await SnapshotStore.acquire(root);
  await assert.rejects(SnapshotStore.acquire(root), /owner/i);
  await reopened.close();
});

test('an exited owner cannot be reclaimed while a registered writer PID is alive', async t => {
  const writer = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true, env: { SYSTEMROOT: process.env.SYSTEMROOT } });
  const exited = once(writer, 'exit');
  t.after(async () => { if (writer.exitCode === null && writer.signalCode === null) writer.kill(); await exited; });
  const root = await fixture(t), owner = await child(t, root, writer.pid!);
  await owner.stop();
  await assert.rejects(SnapshotStore.recover(root), /child|writer|alive|running/i);
  writer.kill(); await exited;
  await SnapshotStore.recover(root);
});

test('legacy, empty and corrupt owner records remain blocked', async t => {
  for (const value of ['', '{', JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })]) {
    const root = await fixture(t);
    await writeFile(join(root, '.controller.lock'), value, 'utf8');
    await assert.rejects(SnapshotStore.recover(root), /owner|ownership/i);
    assert.equal(await readFile(join(root, '.controller.lock'), 'utf8'), value);
  }
});

test('an unresolved durable spawn intent blocks recovery even when its owner exited', async t => {
  const root = await fixture(t), owner = await child(t, root);
  const lockPath = join(root, '.controller.lock'), record = JSON.parse(await readFile(lockPath, 'utf8'));
  await writeFile(lockPath, JSON.stringify({ ...record, children: [{ ticket: 'unresolved-spawn', pid: null }] }), 'utf8');
  await owner.stop();
  await assert.rejects(SnapshotStore.recover(root), /pending|unresolved|child/i);
});
