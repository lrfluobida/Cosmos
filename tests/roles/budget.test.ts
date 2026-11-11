import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { createRoleBudget, usageCostMicroCny } from '../../src/roles/provider-budget.ts';
import { roleToolEnvironment } from '../../src/roles/factory.ts';
import { createPiSession } from '../../src/providers/pi.ts';
import { validationReservation } from '../../src/runtime/validation-validation.ts';

test('host child environment never inherits provider credentials', () => {
  assert.deepEqual(roleToolEnvironment({ PATH: 'bin', SYSTEMROOT: 'Windows', DEEPSEEK_API_KEY: 'secret', OPENAI_API_KEY: 'secret2', HOME: 'home', CUSTOM_MODEL_CREDENTIAL: 'secret3' }), { PATH: 'bin', SYSTEMROOT: 'Windows', HOME: 'home' });
});

for (const persistIntent of [false, true]) test(`unsent screenshot releases its reservation when admission fails (dispatch intent ${persistIntent})`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-review-admission-'));
  const controller = await RunController.create({ root, runId: 'run', ledgerId: 'ledger', kind: 'runtime_generation', specVersion: 'v1', scope: 'validation',
    limitMicroCny: 100000, allocations: [{ taskId: 'coding', amountMicroCny: 100000 }] });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  const admit = controller.admit.bind(controller);
  t.mock.method(controller, 'admit', async (requestId: string) => {
    if (persistIntent) await admit(requestId);
    throw Error('Window closed during admission');
  });
  const evidenceDirectory = join(root, 'receipts');
  const budget = createRoleBudget({ controller, taskId: 'coding', evidenceDirectory, cancelUnsentImageAdmission: true });
  await assert.rejects(budget.beforeRequest({ requestId: 'screenshot', modelId: 'deepseek-flash', maxOutputTokens: 8192, inputBytes: 800000,
    hasImages: true, estimatedMaxCostMicroCny: 98000 }), /Window closed/);
  const snapshot = await controller.read(), entry = snapshot.ledger.entries[0];
  assert.equal(entry.status, 'cancelled');
  assert.equal(entry.reservedMicroCny + entry.settledMicroCny, 0);
  assert.equal(entry.unknown, false);
  const receipt = JSON.parse(await readFile(entry.evidence.at(-1)!.location, 'utf8'));
  assert.equal(receipt.outcome, 'not_sent');
  assert.equal(receipt.admittedAt !== null, persistIntent);
  assert.equal(receipt.admittedAt, snapshot.requests[0].admittedAt);
});

for (const limit of [65_536, 100_000]) test(`actual screenshot admission and settlement under a ${limit} micro-CNY grant`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-screenshot-grant-')), taskId = 'coding';
  const controller = await RunController.create({ root, runId: 'run', ledgerId: 'ledger', kind: 'runtime_generation', specVersion: 'v1', scope: 'validation',
    limitMicroCny: limit, allocations: [{ taskId, amountMicroCny: limit }] });
  const session = await createPiSession({ workspace: root, stateDirectory: join(root, 'pi'), tools: [], systemPrompt: 'Review', context: 'Fixed candidate',
    ordinaryCodingReviewImageQuote: true, maxOutputTokens: 8192, maxRequests: 1, requestTimeoutMs: 10000, env: { DEEPSEEK_API_KEY: 'offline' },
    estimatedMaxCostMicroCny: validationReservation, budget: createRoleBudget({ controller, taskId, evidenceDirectory: join(root, 'receipts'), cancelUnsentImageAdmission: true }) });
  t.after(async () => { await session.close(); await controller.close(); await rm(root, { recursive: true, force: true }); });
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    const state = await controller.read();
    assert.ok(state.requests[0].admittedAt);
    assert.ok(state.ledger.entries[0].reservedMicroCny > 65536 && state.ledger.entries[0].reservedMicroCny <= limit);
    const chunk = { model: 'deepseek-flash', choices: [{ index: 0, delta: { content: 'done' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 } };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  const screenshot = await readFile(new URL('../../docs/research/assets/c14-independent-gameplay.png', import.meta.url));
  const prompt = session.prompt('Review frame', { images: [{ type: 'image', mimeType: 'image/png', data: screenshot.toString('base64') }] });
  if (limit === 65536) {
    await assert.rejects(prompt, { code: 'admission_rejected' });
    assert.equal(fetch.mock.callCount(), 0);
    assert.deepEqual((await controller.read()).ledger.entries, []);
  } else {
    await prompt;
    assert.equal(fetch.mock.callCount(), 1);
    const entry = (await controller.read()).ledger.entries[0];
    assert.equal(entry.status, 'settled');
    assert.equal(entry.reservedMicroCny, 0);
    assert.equal(entry.settledMicroCny, 140);
  }
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
