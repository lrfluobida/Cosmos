import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { conservedFixture } from '../runtime/ordinary-design-revision-budget.fixture.ts';
import { reserveEntry } from '../../src/budget/ledger.ts';
import { requestInputBytes } from '../../src/providers/request-input.ts';
import { requireAuthorReviewReserve } from '../../src/roles/provider-budget.ts';

test('counterfactual R25 money trace derives 1532831 through funded activation and preserves complete context quotes', async t => {
  let quote, metadataByteDelta;
  const f = await conservedFixture(t, async (config, fallback) => {
    const packet = JSON.parse(config.context), initial = packet.taskId === 'design-task', revision = packet.taskId === 'design-task-revision';
    if (!initial && !revision) return fallback;
    assert.equal(config.maxRequests, packet.role === 'design' ? 64 : 16);
    assert.equal(config.maxOutputTokens, packet.role === 'design' ? 32768 : 16384);
    const amount = initial ? packet.role === 'design' ? 366305 : 125864 : packet.role === 'design' ? 410600 : 183708;
    const charge = async () => {
      const requestId = `${packet.taskId}-${packet.role}-counterfactual`;
      await config.budget.beforeRequest({ requestId, modelId: 'deepseek-flash', inputBytes: 1, hasImages: false, maxOutputTokens: 1, estimatedMaxCostMicroCny: amount });
      await config.budget.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
        usage: { input: Math.floor(amount / 2), cacheWrite: 0, cacheRead: amount % 2 ? 25 : 0, output: 0 } });
    };
    if (revision) {
      const oldPacket = structuredClone(packet); oldPacket.budget.allocationMicroCny = 900000;
      metadataByteDelta = Buffer.byteLength(config.context) - Buffer.byteLength(JSON.stringify(oldPacket));
      assert.equal(packet.budget.allocationMicroCny, 1532831);
      quote = config.estimatedMaxCostMicroCny;
    }
    return { ...fallback, prompt: async (...args) => {
      await charge();
      if (revision && packet.role === 'design') {
        const edit = config.tools.find(tool => tool.name === 'edit');
        const result = await edit.execute('counterfactual-edit', { path: 'authors/design/design.json', edits: [{ oldText: '原创鼠标游戏', newText: '原创鼠标游戏，明确完成状态' }] }, undefined, undefined, undefined);
        assert.equal(result.isError ?? false, false);
        return { text: JSON.stringify({ summary: 'Synthetic changed design for budget trace', remaining: [], uncertainty: [] }) };
      }
      const reply = await fallback.prompt(...args);
      return packet.role === 'reviewer' ? { text: JSON.stringify({ ...JSON.parse(reply.text), verdict: 'changes_requested', findings: ['Synthetic unresolved requirement; no semantic pass.'] }) } : reply;
    } };
  });
  await f.execute();
  const state = await f.state(), receipt = state.ordinaryDesignRevisionBudgetActivation;
  assert.equal(receipt.budget.sourceGrantMicroCny, 1125000);
  assert.equal(receipt.budget.sourceSettledMicroCny, 492169);
  assert.equal(receipt.budget.unusedMicroCny, 632831);
  assert.equal(receipt.budget.baseMicroCny, 900000); assert.equal(receipt.budget.targetMicroCny, 1532831);
  const spent = state.ledger.entries.filter(row => row.taskId === 'design-task-revision').reduce((sum, row) => sum + row.settledMicroCny, 0);
  assert.equal(spent, 594308); assert.equal(1532831 - spent, 938523); assert.equal(metadataByteDelta, 1);
  const request = { requestId: 'never-dispatched-correction', taskId: 'design-task-revision', provider: 'deepseek', pricingVersion: 'counterfactual',
    estimatedMaxCostMicroCny: quote({ inputBytes: 211718, hasImages: false, maxOutputTokens: 4096 }) };
  assert.equal(request.estimatedMaxCostMicroCny, 456204);
  const legacy = structuredClone(state.ledger); legacy.contractVersion = '1.0.0'; delete legacy.allocationClosures;
  legacy.allocations.find(row => row.taskId === request.taskId).amountMicroCny = 900000;
  assert.throws(() => reserveEntry(legacy, request), /budget|allocation/i);
  assert.doesNotThrow(() => reserveEntry(structuredClone(state.ledger), request));
  const metadataOnlyQuote = quote({ inputBytes: 211718 + metadataByteDelta, hasImages: false, maxOutputTokens: 4096 });
  assert.equal(metadataOnlyQuote, 456206); assert.ok(metadataOnlyQuote <= 938523);
  assert.equal(state.tasks.find(row => row.taskId === request.taskId).review.verdict, 'changes_requested');
  const reserve = { runId: state.run.runId, ledgerId: state.ledger.ledgerId, allocationMicroCny: 1532831 };
  const beforeAuthor = { ...state, ledger: { ...state.ledger, entries: state.ledger.entries.filter(row => row.taskId !== request.taskId) } };
  const authorMaximum = 1532831 - Math.floor(1532831 / 3);
  assert.doesNotThrow(() => requireAuthorReviewReserve(beforeAuthor, request.taskId, reserve, authorMaximum));
  assert.throws(() => requireAuthorReviewReserve(beforeAuthor, request.taskId, reserve, authorMaximum + 1), /retain/);
  if (process.env.COSMOS_R25_CONTEXT_FIXTURE) {
    const bytes = await readFile(process.env.COSMOS_R25_CONTEXT_FIXTURE), context = JSON.parse(bytes.toString('utf8'));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), '26e82f5984fded53bc72a7acc838e7d4ac251ee7f44fd6323339ad43640c5c96');
    const original = structuredClone(context);
    assert.equal(requestInputBytes(context), 211718); assert.equal(context.messages.length, 13);
    assert.equal(quote({ inputBytes: requestInputBytes(context), hasImages: false, maxOutputTokens: 4096 }), 456204);
    assert.ok(JSON.stringify(context) === JSON.stringify(original), 'Historical context must remain unchanged');
    t.diagnostic('Private R25 original 13-message context retained byte-for-byte; quote only, never dispatched.');
  }
  t.diagnostic('Counterfactual money trace only. Fresh factory allocation metadata delta +1 byte; no claim of an actual new 211718B session or game approval.');
});
