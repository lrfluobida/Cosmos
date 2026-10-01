import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { RunController } from '../../../src/runtime/run.ts';
import * as budgetApi from '../../../src/roles/provider-budget.ts';

const usage = { input: 25, output: 10, cacheRead: 5, cacheWrite: 0, totalTokens: 40, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
async function fixture(t: any) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-recovery-receipt-'));
  const controller = await RunController.create({ root: join(root, 'run'), runId: 'original', ledgerId: 'original-ledger', kind: 'evaluation', specVersion: 'v1', scope: 'validation', limitMicroCny: 1000, allocations: [{ taskId: 'task', amountMicroCny: 1000 }] });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  const evidenceDirectory = join(root, 'receipts');
  // Simulates a process ending after durable receipt publication, before snapshot settlement.
  const interrupted = new Proxy(controller, { get(target, key) { if (key === 'settle' || key === 'cancel') return async () => { throw new Error('Injected exit before settlement'); }; const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; } });
  const budget = budgetApi.createRoleBudget({ controller: interrupted, taskId: 'task', evidenceDirectory });
  await budget.beforeRequest({ requestId: 'request', modelId: 'deepseek-flash', maxOutputTokens: 10, inputBytes: 10, hasImages: false, estimatedMaxCostMicroCny: 200 });
  return { root, controller, budget, evidenceDirectory, path: join(evidenceDirectory, 'billing-request.json') };
}
test('receipt publication binds exact admitted identity before settlement and leaves no temporary payload', async t => {
  const f = await fixture(t);
  await assert.rejects(f.budget.afterResponse({ requestId: 'request', outcome: 'settled', responseModel: 'deepseek-flash', usage, elapsedMs: 5 }), /Injected/);
  const receipt = JSON.parse(await readFile(f.path, 'utf8'));
  assert.equal(receipt.formatVersion, 1);
  assert.equal(receipt.runId, 'original'); assert.equal(receipt.ledgerId, 'original-ledger'); assert.equal(receipt.taskId, 'task');
  assert.deepEqual(await readdir(f.evidenceDirectory), ['billing-request.json']);
  assert.equal((await f.controller.read()).ledger.entries[0].status, 'unknown');
});
test('an interrupted receipt reconciles once against the original request and deadline', async t => {
  const f = await fixture(t);
  await assert.rejects(f.budget.afterResponse({ requestId: 'request', outcome: 'settled', responseModel: 'deepseek-flash', usage, elapsedMs: 5 }), /Injected/);
  assert.equal(typeof budgetApi.reconcileRoleReceipt, 'function');
  const before = await f.controller.read();
  assert.equal((await budgetApi.reconcileRoleReceipt({ ...f, requestId: 'request' })).status, 'settled');
  const settled = await f.controller.read();
  assert.equal(settled.ledger.entries[0].settledMicroCny, 131);
  assert.equal(settled.run.originalDeadlineAt, before.run.originalDeadlineAt);
  assert.equal((await budgetApi.reconcileRoleReceipt({ ...f, requestId: 'request' })).status, 'already_closed');
  assert.deepEqual(await f.controller.read(), settled);
});
test('missing, partial and conflicting receipts never release uncertain exposure or retry', async t => {
  const f = await fixture(t);
  assert.equal(typeof budgetApi.reconcileRoleReceipt, 'function');
  assert.equal((await budgetApi.reconcileRoleReceipt({ ...f, requestId: 'request' })).status, 'pending');
  await assert.rejects(f.budget.afterResponse({ requestId: 'request', outcome: 'settled', responseModel: 'deepseek-flash', usage, elapsedMs: 5 }), /Injected/);
  const original = JSON.parse(await readFile(f.path, 'utf8'));
  for (const data of ['{', { ...original, runId: 'other' }, { ...original, taskId: 'other' }, { ...original, pricingVersion: 'other' }, { ...original, responseModel: 'other' }, { ...original, usage: { ...usage, output: -1 } }]) {
    await writeFile(f.path, typeof data === 'string' ? data : JSON.stringify(data), 'utf8');
    assert.equal((await budgetApi.reconcileRoleReceipt({ ...f, requestId: 'request' })).status, 'pending');
    const snapshot = await f.controller.read();
    assert.equal(snapshot.ledger.entries.length, 1); assert.equal(snapshot.ledger.entries[0].reservedMicroCny, 200);
    await assert.rejects(f.controller.reserve({ requestId: 'blind-retry', taskId: 'task', provider: 'deepseek', pricingVersion: 'v1', estimatedMaxCostMicroCny: 1 }), /reconciliation/i);
  }
});
test('proven not-sent receipt closes the original reservation without a charge', async t => {
  const f = await fixture(t);
  await assert.rejects(f.budget.afterResponse({ requestId: 'request', outcome: 'not_sent', elapsedMs: 1 }));
  assert.equal(typeof budgetApi.reconcileRoleReceipt, 'function');
  assert.equal((await budgetApi.reconcileRoleReceipt({ ...f, requestId: 'request' })).status, 'cancelled');
  assert.equal((await f.controller.read()).run.fees.reservedMicroCny, 0);
});
