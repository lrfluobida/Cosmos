import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { createRoleBudget, usageCostMicroCny } from '../../src/roles/provider-budget.ts';
import { roleToolEnvironment } from '../../src/roles/factory.ts';

test('host child environment never inherits provider credentials', () => {
  assert.deepEqual(roleToolEnvironment({ PATH: 'bin', SYSTEMROOT: 'Windows', DEEPSEEK_API_KEY: 'secret', OPENAI_API_KEY: 'secret2', HOME: 'home', CUSTOM_MODEL_CREDENTIAL: 'secret3' }), { PATH: 'bin', SYSTEMROOT: 'Windows', HOME: 'home' });
});

for (const outcome of ['settled', 'unknown', 'not_sent', 'receipt_failure'] as const) {
  test(`native budget hook preserves ${outcome} accounting in the shared ledger`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'cosmos-role-billing-'));
    const controller = await RunController.create({ root: join(root, 'run'), runId: 'run', ledgerId: 'ledger', kind: 'evaluation', specVersion: 'v1', scope: 'validation', limitMicroCny: 1000, allocations: [{ taskId: 'task', amountMicroCny: 1000 }] });
    try {
      const evidenceDirectory = join(root, 'receipts');
      const budget = createRoleBudget({ controller, taskId: 'task', evidenceDirectory });
      await budget.beforeRequest({ requestId: 'request', modelId: 'deepseek-flash', maxOutputTokens: 10, inputBytes: 100, hasImages: false, estimatedMaxCostMicroCny: 200 });
      const usage = { input: 25, output: 10, cacheRead: 5, cacheWrite: 0, totalTokens: 40, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
      assert.equal(usageCostMicroCny(usage), 131);
      if (outcome === 'receipt_failure') {
        await writeFile(evidenceDirectory, 'file blocks directory', 'utf8');
        await assert.rejects(budget.afterResponse({ requestId: 'request', outcome: 'settled', usage, responseModel: 'deepseek-flash', elapsedMs: 1 }));
      } else await budget.afterResponse({ requestId: 'request', outcome, usage, responseModel: 'deepseek-flash', elapsedMs: 1 });
      const snapshot = await controller.read(), entry = snapshot.ledger.entries[0];
      assert.equal(entry.status, outcome === 'receipt_failure' ? 'unknown' : outcome === 'not_sent' ? 'cancelled' : outcome);
      assert.equal(entry.settledMicroCny, outcome === 'settled' ? 131 : 0);
      assert.equal(entry.reservedMicroCny, ['unknown', 'receipt_failure'].includes(outcome) ? 200 : 0);
      if (entry.status === 'unknown') await assert.rejects(controller.reserve({ requestId: 'retry', taskId: 'task', provider: 'deepseek', pricingVersion: 'v1', estimatedMaxCostMicroCny: 1 }), /reconcil/i);
      else assert.ok((await readFile(join(evidenceDirectory, 'billing-request.json'), 'utf8')).includes('deepseek-flash'));
    } finally { await controller.close(); await rm(root, { recursive: true, force: true }); }
  });
}
