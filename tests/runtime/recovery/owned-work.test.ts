import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import * as recovery from '../../../src/runtime/recovery/index.ts';
import { RunController } from '../../../src/runtime/run.ts';

test('cancel and drain waits for a registered gated writer and prevents later writes or work', async t => {
  assert.equal(typeof recovery.OwnedWork, 'function');
  const root = await mkdtemp(join(tmpdir(), 'cosmos-recovery-writer-'));
  const controller = await RunController.create({ root: join(root, 'run'), runId: 'run', ledgerId: 'ledger', kind: 'evaluation', specVersion: 'v1', scope: 'validation', allocations: [{ taskId: 'writer', amountMicroCny: 1 }] });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  const work = new recovery.OwnedWork(controller.signal), output = join(root, 'writer.txt');
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const operation = work.run(async signal => {
    const ticket = await controller.prepareOwnedChild();
    const code = `const fs=require('fs'); process.on('message',m=>{ if(m==='start') {fs.appendFileSync(process.argv[1], '写入\\n');process.send('wrote');setInterval(()=>fs.appendFileSync(process.argv[1], '写入\\n'),5);}});`;
    const child = spawn(process.execPath, ['-e', code, output], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true, env: { SYSTEMROOT: process.env.SYSTEMROOT } });
    const exited = once(child, 'close');
    const stop = () => { child.kill(); };
    signal.addEventListener('abort', stop, { once: true });
    try {
      await controller.registerOwnedChild(child.pid!, ticket);
      const owner = JSON.parse(await readFile(join(root, 'run/.controller.lock'), 'utf8'));
      assert.equal(owner.children[0].pid, child.pid);
      if (signal.aborted) stop();
      else { child.send('start'); await once(child, 'message'); started(); }
      await exited;
    } finally { signal.removeEventListener('abort', stop); if (child.exitCode === null && child.signalCode === null) child.kill(); await exited; }
  });
  await ready;
  await recovery.cancelAndDrain(controller, work, 'Stop the owned writer');
  await operation;
  const bytes = await readFile(output); await delay(25);
  assert.deepEqual(await readFile(output), bytes);
  await assert.rejects(work.run(async () => { throw new Error('must not dispatch'); }), /cancel|stop/i);
  assert.equal((await controller.read()).stopReason?.code, 'manual');
});
test('an operation that has not quiesced produces a bounded failure, never a stopped acknowledgement', async () => {
  assert.equal(typeof recovery.OwnedWork, 'function');
  const work = new recovery.OwnedWork();
  let release!: () => void;
  const operation = work.run(() => new Promise<void>(resolve => { release = resolve; }));
  await Promise.resolve();
  await assert.rejects(work.cancelAndDrain('cancel', 10), /drain|quiesce/i);
  release(); await operation; await work.cancelAndDrain('cancel');
});
