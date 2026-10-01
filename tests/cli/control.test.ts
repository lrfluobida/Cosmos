import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { RunController } from '../../src/runtime/run.ts';
import { runCli } from '../../src/cli/index.ts';
import * as control from '../../src/cli/control.ts';
async function fixture(t: test.TestContext) {
  assert.equal(typeof control.startControl, 'function', 'Run identity control API is required');
  const root = await mkdtemp(join(tmpdir(), 'cosmos-control-'));
  const controller = await RunController.create({ root, runId: 'game', ledgerId: 'game-budget', kind: 'runtime_generation', specVersion: '1.0', scope: 'generation', allocations: [{ taskId: 'planning', amountMicroCny: 100 }] });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  return { root, controller };
}
test('status reads the original committed snapshot while its writer is live without changing it', async t => {
  const { root } = await fixture(t), before = await readFile(join(root, 'snapshot.json'), 'utf8');
  const status = await control.readRunStatus(root);
  assert.equal(status.runId, 'game'); assert.equal(status.ledgerId, 'game-budget'); assert.equal(status.phase, 'generation');
  assert.equal(status.confirmed, false, 'A legacy run with no requirement decision must not invent confirmation');
  assert.equal(status.stopped, false); assert.equal(await readFile(join(root, 'snapshot.json'), 'utf8'), before);
});
test('stop addresses the current run and acknowledges only after durable stop and drain', async t => {
  const { root, controller } = await fixture(t); let drained = false;
  const owner = await control.startControl(root, 'game', async () => { await controller.stop('CLI user stop'); await new Promise(resolve => setTimeout(resolve, 25)); drained = true; });
  try {
    const result = await control.requestStop(root);
    assert.equal(result.runId, 'game'); assert.equal(result.stopped, true); assert.equal(drained, true);
    assert.equal((await control.readRunStatus(root)).stopReason.code, 'manual');
  } finally { await owner.close(); }
});
test('a vanished control owner is reported and never impersonates a successful stop', async t => {
  const { root } = await fixture(t);
  const owner = await control.startControl(root, 'game', async () => {}); await owner.close();
  await assert.rejects(control.requestStop(root), /active owner|control/i);
  assert.equal((await control.readRunStatus(root)).stopped, false);
});
test('failed drain cannot be acknowledged as a stopped run', async t => {
  const { root, controller } = await fixture(t);
  const owner = await control.startControl(root, 'game', async () => { await controller.stop('CLI user stop'); throw new Error('Unconfirmed drain'); });
  try { await assert.rejects(control.requestStop(root), /unconfirmed|drain/i); }
  finally { await owner.close(); }
});

test('the running terminal displays a durable 80 percent warning once and resume does not renew it', async t => {
  assert.equal(typeof control.startBudgetWarnings, 'function', 'CLI must connect the durable budget warning');
  const root = await mkdtemp(join(tmpdir(), 'cosmos-warning-'));
  const controller = await RunController.create({ root, runId: 'warn', ledgerId: 'budget', kind: 'runtime_generation', specVersion: '1.0', scope: 'generation', limitMicroCny: 100, allocations: [{ taskId: 'planning', amountMicroCny: 100 }] });
  const output: string[] = []; let seen!: () => void; const received = new Promise<void>(resolve => { seen = resolve; });
  const warnings = await control.startBudgetWarnings(root, message => { output.push(message); seen(); }, 10);
  try {
    await controller.reserve({ requestId: 'threshold', taskId: 'planning', provider: 'fake', pricingVersion: 'v1', estimatedMaxCostMicroCny: 80 });
    await Promise.race([received, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('No live warning')), 1000))]);
    await warnings.close();
    const again = await control.startBudgetWarnings(root, message => output.push(message), 10); await again.close();
    assert.equal(output.length, 1); assert.match(output[0], /80%/); assert.match(output[0], /剩余/);
    assert.equal((await controller.read()).ledger.entries.length, 1);
  } finally { await warnings.close(); await controller.close(); await rm(root, { recursive: true, force: true }); }
});

test('public status and stop command arguments address the original owner channel', async t => {
  const { root, controller } = await fixture(t), output = new PassThrough(); let text = ''; output.on('data', chunk => { text += chunk; });
  const owner = await control.startControl(root, 'game', () => controller.stop('CLI command test'));
  try {
    await runCli(['status', root], { output }); assert.match(text, /game-budget/);
    await runCli(['stop', root], { output }); assert.equal((await controller.read()).stopReason?.code, 'manual');
    await assert.rejects(runCli(['stop', root, '--force'], { output }), /Usage/);
  } finally { await owner.close(); }
});
