import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { createRoleBudget } from '../../src/roles/provider-budget.ts';

const request = (requestId: string) => ({ requestId, modelId: 'deepseek-flash' as const, inputBytes: 20, hasImages: false, maxOutputTokens: 10, estimatedMaxCostMicroCny: 100 });
const response = (requestId: string) => ({ requestId, outcome: 'settled' as const, responseModel: 'deepseek-flash', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, elapsedMs: 1 });

for (const mode of ['settled', 'unknown', 'receipt-failure'] as const) test(`parallel accounting waits for the normal receipt window, retains real unknown: ${mode}`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-accounting-'));
  const controller = await RunController.create({ root: join(root, 'run'), runId: 'run', ledgerId: 'ledger', kind: 'runtime_generation', specVersion: 'spec', scope: 'validation', limitMicroCny: 1000, allocations: [{ taskId: 'a', amountMicroCny: 500 }, { taskId: 'b', amountMicroCny: 500 }] });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  const evidenceDirectory = join(root, 'a');
  if (mode === 'receipt-failure') await writeFile(evidenceDirectory, 'not a directory', 'utf8');
  const a = createRoleBudget({ controller, taskId: 'a', evidenceDirectory });
  const b = createRoleBudget({ controller, taskId: 'b', evidenceDirectory: join(root, 'b') });
  await Promise.all([a.beforeRequest(request('a1')), b.beforeRequest(request('b1'))]);
  assert.equal((await controller.read()).run.fees.reservedMicroCny, 200, 'network calls can coexist');
  let entered!: () => void, release!: () => void;
  const reached = new Promise<void>(r => { entered = r; }), gate = new Promise<void>(r => { release = r; });
  const mark = controller.markUnknown.bind(controller);
  controller.markUnknown = async (id, evidence) => { await mark(id, evidence); if (id === 'a1') { entered(); await gate; } };
  const closing = a.afterResponse(mode === 'unknown' ? { requestId: 'a1', outcome: 'unknown', elapsedMs: 1 } : response('a1')).then(() => 'closed', () => 'failed');
  await reached;
  let result: string | undefined;
  const next = b.beforeRequest(request('b2')).then(() => { result = 'admitted'; }, () => { result = 'rejected'; });
  await new Promise<void>(r => setImmediate(r));
  const during = result;
  release(); await closing; await next;
  assert.equal(during, undefined, 'new admission must wait for complete accounting, not fail on transient unknown');
  assert.equal(result, mode === 'settled' ? 'admitted' : 'rejected');
  assert.equal((await controller.read()).ledger.entries.find(e => e.requestId === 'a1')!.unknown, mode !== 'settled');
});
