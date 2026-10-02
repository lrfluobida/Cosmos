import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { startControl, requestStop, readRunStatus } from '../../src/cli/control.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { buildContinuationQuote } from '../../src/runtime/continuation-quote.ts';
import { task as taskFixture } from '../contracts/fixtures.ts';

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-window-control-'));
  const original = await RunController.create({ root, runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation', specVersion: 'spec-v1', scope: 'generation', limitMicroCny: 10_000, allocations: [{ taskId: 'source', amountMicroCny: 10_000 }] });
  const task = taskFixture();
  Object.assign(task, { taskId: 'source', dependsOn: [], state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [] });
  task.budget = { ...task.budget, allocationMicroCny: 10_000, originalDeadlineAt: (await original.read()).run.originalDeadlineAt };
  await original.registerTasks([task as any]); await original.stop('Original stop is retained');
  const old = await original.read(); await original.close();
  const quote = await buildContinuationQuote({ root, additionalMicroCny: 0, additionalDurationMs: 60_000 });
  const confirmation = { decisionId: 'offline-control-decision', actorId: 'offline-user', decidedAt: new Date().toISOString(), source: { artifactId: 'confirmation', version: 'v1', location: 'confirmation.json' } };
  await writeFile(join(root, confirmation.source.location), JSON.stringify({ formatVersion: 'continuation-confirmation-1', decisionId: confirmation.decisionId, actorId: confirmation.actorId, decidedAt: confirmation.decidedAt, confirmed: true, quote }), 'utf8');
  const window = await RunController.activateContinuation({ root, quote, confirmation }), controller = await RunController.open({ root, windowId: window.windowId });
  t.after(async () => { await controller.close().catch(() => {}); await rm(root, { recursive: true, force: true }); });
  return { root, old, controller, windowId: window.windowId };
}
async function send(endpoint: string, message: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(endpoint); let text = '';
    socket.setEncoding('utf8'); socket.setTimeout(1000, () => socket.destroy(new Error('Fixture control response timed out')));
    socket.on('error', reject); socket.on('connect', () => socket.write(JSON.stringify(message) + '\n'));
    socket.on('data', part => { text += part; }); socket.on('end', () => { try { resolve(JSON.parse(text)); } catch (error) { reject(error); } });
  });
}

test('window stop binds its record/request/ack and waits for drain even after the window stop is durable', async t => {
  const f = await fixture(t); let release!: () => void, entered!: () => void;
  const draining = new Promise<void>(done => { release = done; }), stopped = new Promise<void>(done => { entered = done; });
  const owner = await startControl(f.root, 'run-1', async () => { await f.controller.stop('Window user stop'); entered(); await draining; }, f.windowId);
  try {
    const record = JSON.parse(await readFile(join(f.root, 'cli-control.json'), 'utf8'));
    assert.equal(record.formatVersion, 2); assert.equal(record.windowId, f.windowId);
    let acknowledged = false;
    const requested = requestStop(f.root, f.windowId).then(result => { acknowledged = true; return result; });
    await stopped; await delay(15);
    assert.equal((await readRunStatus(f.root)).stopped, true); assert.equal(acknowledged, false);
    release(); assert.deepEqual(await requested, { runId: 'run-1', windowId: f.windowId, stopped: true });
    assert.deepEqual((await f.controller.read()).stopReason, f.old.stopReason);
  } finally { release(); await owner.close(); }
});

test('wrong or missing window fails before channel writes or invoking its owner', async t => {
  const f = await fixture(t), before = await readFile(join(f.root, 'snapshot.json'));
  for (const windowId of [undefined, 'wrong']) {
    let accidental: Awaited<ReturnType<typeof startControl>> | undefined;
    try { await assert.rejects(async () => { accidental = await startControl(f.root, 'run-1', async () => {}, windowId); }, /window/i); }
    finally { await accidental?.close(); }
  }
  await assert.rejects(readFile(join(f.root, 'cli-control.json')), /ENOENT/);
  let calls = 0;
  const owner = await startControl(f.root, 'run-1', async () => { calls++; await f.controller.stop('called'); }, f.windowId);
  try {
    const control = await readFile(join(f.root, 'cli-control.json'));
    await assert.rejects(requestStop(f.root), /window/i);
    await assert.rejects(requestStop(f.root, 'wrong'), /window/i);
    const record = JSON.parse(control.toString('utf8'));
    const result = await send(record.endpoint, { command: 'stop', runId: 'run-1', token: record.token, windowId: 'wrong' });
    assert.equal(result.stopped, undefined); assert.equal(calls, 0);
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
    assert.deepEqual(await readFile(join(f.root, 'cli-control.json')), control);
  } finally { await owner.close(); }
});

test('a failed window drain cannot acknowledge its durable stop', async t => {
  const f = await fixture(t);
  const owner = await startControl(f.root, 'run-1', async () => { await f.controller.stop('Stopped while drain remains unknown'); throw new Error('Fixture drain failure'); }, f.windowId);
  try { await assert.rejects(requestStop(f.root, f.windowId), /unconfirmed|drain/i); }
  finally { await owner.close(); }
  assert.equal((await readRunStatus(f.root)).stopped, true);
  assert.deepEqual((await f.controller.read()).stopReason, f.old.stopReason);
});

test('an acknowledgement for a different window is rejected', async t => {
  const f = await fixture(t), token = randomUUID();
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\cosmos-${token}` : join(tmpdir(), `cosmos-${token}.sock`);
  const server = createServer(socket => socket.once('data', () => socket.end(JSON.stringify({ runId: 'run-1', windowId: 'other-window', stopped: true }) + '\n')));
  server.listen(endpoint); await once(server, 'listening');
  await writeFile(join(f.root, 'cli-control.json'), JSON.stringify({ formatVersion: 2, runId: 'run-1', windowId: f.windowId, token, endpoint }), 'utf8');
  try { await assert.rejects(requestStop(f.root, f.windowId), /unconfirmed|window|control/i); }
  finally { await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); }
  assert.equal((await readRunStatus(f.root)).stopped, false);
});

test('missing owner marker alone cannot prove a closed window is drained', async t => {
  const f = await fixture(t); await f.controller.close();
  const before = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(requestStop(f.root, f.windowId), /owner|quiescence|unconfirmed|idle|proof/i);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
});

test('live owner without a channel remains unconfirmed instead of being forcibly stopped', async t => {
  const f = await fixture(t), before = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(requestStop(f.root, f.windowId), /alive|owner|unconfirmed/i);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
});

test('normal drained close permits the explicit idle window stop without an owner marker', async t => {
  const f = await fixture(t);
  const before = await f.controller.read();
  await f.controller.closeAfterDrain(new OwnedWork(f.controller.signal));
  await assert.rejects(readFile(join(f.root, '.controller.lock')), /ENOENT/);
  assert.deepEqual(await requestStop(f.root, f.windowId), { runId: 'run-1', windowId: f.windowId, stopped: true });
  const after = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.deepEqual(after.ledger, before.ledger); assert.deepEqual(after.tasks, before.tasks);
  assert.deepEqual(after.stopReason, before.stopReason);
  assert.equal(after.run.originalDeadlineAt, before.run.originalDeadlineAt);
  assert.equal(after.continuation.windows[0].stopReason.code, 'manual');
  await assert.rejects(readFile(join(f.root, '.controller.lock')), /ENOENT/);
});

for (const changed of ['forged-receipt', 'changed-bytes', 'consumed-anchor', 'wrong-window'] as const) test(`idle control rejects ${changed} without snapshot or receipt changes`, async t => {
  const f = await fixture(t); await f.controller.closeAfterDrain(new OwnedWork(f.controller.signal));
  const file = join(f.root, 'snapshot.json'), state = JSON.parse(await readFile(file, 'utf8'));
  const receiptPath = join(f.root, 'idle-receipts', f.windowId, `revision-${state.revision}.json`);
  if (changed === 'forged-receipt') await writeFile(receiptPath, '{}', 'utf8');
  if (changed === 'changed-bytes') await writeFile(file, Buffer.concat([await readFile(file), Buffer.from('\n')]));
  if (changed === 'consumed-anchor') {
    const reopened = await RunController.open({ root: f.root, windowId: f.windowId }); await reopened.close();
  }
  const before = await readFile(file), receipt = await readFile(receiptPath);
  await assert.rejects(requestStop(f.root, changed === 'wrong-window' ? 'wrong-window' : f.windowId), /window|idle|receipt|proof|unconfirmed/i);
  assert.deepEqual(await readFile(file), before); assert.deepEqual(await readFile(receiptPath), receipt);
  await assert.rejects(readFile(join(f.root, '.controller.lock')), /ENOENT/);
});

async function crashedOwner(root: string, mode: 'plain' | 'unresolved' | 'untracked' | 'child' = 'plain', childPid?: number) {
  const source = `import {OwnerLock} from ${JSON.stringify(new URL('../../src/runtime/recovery/ownership.ts', import.meta.url).href)};
const lock=await OwnerLock.acquire(process.argv[1],'.controller.lock',process.argv[2]==='untracked');
if(['unresolved','child'].includes(process.argv[2])){const ticket=await lock.prepareOwnedChild();if(process.argv[2]==='child')await lock.registerOwnedChild(Number(process.argv[3]),ticket);}
process.exit(23);`;
  const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source, root, mode, ...(childPid ? [String(childPid)] : [])], { stdio: 'ignore', windowsHide: true, env: { SYSTEMROOT: process.env.SYSTEMROOT } });
  assert.equal((await once(child, 'close'))[0], 23);
}

test('a crashed owner with no surviving children permits a bound stop after stale channel connection fails', async t => {
  const f = await fixture(t);
  const channel = await startControl(f.root, 'run-1', async () => {}, f.windowId);
  const stale = await readFile(join(f.root, 'cli-control.json')); await channel.close();
  await writeFile(join(f.root, 'cli-control.json'), stale);
  await f.controller.close(); await crashedOwner(f.root);
  const before = await readFile(join(f.root, 'snapshot.json')), owner = await readFile(join(f.root, '.controller.lock'));
  await assert.rejects(requestStop(f.root, 'wrong-window'), /window/i);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  assert.deepEqual(await readFile(join(f.root, '.controller.lock')), owner);
  assert.deepEqual(await requestStop(f.root, f.windowId), { runId: 'run-1', windowId: f.windowId, stopped: true });
  const status = await readRunStatus(f.root);
  assert.equal(status.stopReason?.code, 'manual'); assert.deepEqual(status.original?.stopReason, f.old.stopReason);
  assert.equal(status.originalStartedAt, f.old.run.originalStartedAt); assert.equal(status.settledMicroCny, 0);
  await assert.rejects(readFile(join(f.root, '.controller.lock')), /ENOENT/);
});

for (const mode of ['unresolved', 'untracked', 'registry'] as const) test(`owner recovery refuses ${mode} writer evidence without changing the snapshot`, async t => {
  const f = await fixture(t); await f.controller.close(); await crashedOwner(f.root, mode === 'registry' ? 'plain' : mode);
  if (mode === 'registry') { await mkdir(join(f.root, 'registry')); await writeFile(join(f.root, 'registry/.commit.lock'), 'unresolved-registry-writer', 'utf8'); }
  const before = await readFile(join(f.root, 'snapshot.json')), owner = await readFile(join(f.root, '.controller.lock'));
  await assert.rejects(requestStop(f.root, f.windowId), /unresolved|untracked|unconfirmed/i);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  assert.deepEqual(await readFile(join(f.root, '.controller.lock')), owner);
});

test('a surviving owned child prevents fallback until that exact child exits', async t => {
  const f = await fixture(t); await f.controller.close();
  const writer = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true, env: { SYSTEMROOT: process.env.SYSTEMROOT } });
  const exited = once(writer, 'close');
  try {
    await crashedOwner(f.root, 'child', writer.pid!);
    const before = await readFile(join(f.root, 'snapshot.json'));
    await assert.rejects(requestStop(f.root, f.windowId), /alive|child/i);
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  } finally { writer.kill(); await exited; }
  assert.deepEqual(await requestStop(f.root, f.windowId), { runId: 'run-1', windowId: f.windowId, stopped: true });
  await assert.rejects(readFile(join(f.root, '.controller.lock')), /ENOENT/);
});
