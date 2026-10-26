import assert from 'node:assert/strict';
import test from 'node:test';
import { ordinaryDraftOutputLimit } from '../../src/roles/interview-budget.ts';
import { reserveEntry } from '../../src/budget/ledger.ts';
import { ROLE_PRICING_VERSION } from '../../src/roles/provider-budget.ts';
import { budgetFixture } from './interview-budget.fixture.ts';

/** Synthetic historical boundaries, not a replay of private native transcripts. */
test('public offline replay preserves settled intake costs at room10 and room13 boundaries', async t => {
  for (const row of [
    { caseId: 'room10', spent: 128821, inputBytes: 58649, quote: 182834 },
    { caseId: 'room13', spent: 53997, inputBytes: 66697, quote: 198930 },
  ]) {
    const fixture = await budgetFixture(t);
    await fixture.spend(row.spent);
    const before = await fixture.controller.read();
    const request = { requestId: row.caseId, modelId: 'deepseek-flash' as const, inputBytes: row.inputBytes, maxOutputTokens: 8192, hasImages: false };
    assert.equal(fixture.options.estimatedMaxCostMicroCny(request), row.quote);
    const limit = ordinaryDraftOutputLimit(fixture.controller, before, fixture.options.estimatedMaxCostMicroCny);
    await assert.rejects(limit(request), /Original intake budget cannot afford/, row.caseId);
    const ledger = structuredClone(before.ledger);
    assert.throws(() => reserveEntry(ledger, { requestId: row.caseId, taskId: 'intake', provider: 'deepseek',
      pricingVersion: ROLE_PRICING_VERSION, estimatedMaxCostMicroCny: row.quote }), /Task budget allocation is insufficient/, row.caseId);
    assert.deepEqual(ledger, before.ledger);
    assert.equal(before.ledger.allocations.find(item => item.taskId === 'intake')!.amountMicroCny, 250000);
    const settled = before.ledger.entries.reduce((sum, entry) => sum + entry.settledMicroCny, 0);
    assert.equal(settled, row.spent);
    assert.ok(row.quote > 250000 - settled);
    assert.equal(fixture.bodies.length, 0);
    assert.deepEqual(await fixture.controller.read(), before);
  }
});
