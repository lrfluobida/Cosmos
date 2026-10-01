import assert from 'node:assert/strict';
import test from 'node:test';
import { budgetCapacity, budgetSummary, validateLedger, validateLedgerUpdate } from '../../src/contracts/index.ts';
import { reserveEntry } from '../../src/budget/ledger.ts';

function ledger() {
  return {
    contractVersion: '2.0.0' as const, ledgerId: 'same-ledger', scope: 'generation' as const,
    limitMicroCny: 100, warningThresholdPercent: 80 as const,
    allocations: [{ taskId: 'old', amountMicroCny: 100 }, { taskId: 'new', amountMicroCny: 120 }],
    entries: [{ requestId: 'spent', taskId: 'old', provider: 'fake', pricingVersion: 'v1', reservedMicroCny: 0, settledMicroCny: 30, unknown: false, status: 'settled' as const, evidence: [{ artifactId: 'receipt', version: '1', location: 'receipt.json' }] }],
    authorizations: [{ decisionId: 'decision', windowId: 'window', additionalMicroCny: 50 }],
    allocationClosures: [{ taskId: 'old', decisionId: 'decision', releasedMicroCny: 70 }],
  };
}

test('continuation counts historical costs and releases only the reconciled unused grant', () => {
  const value = ledger();
  assert.deepEqual(validateLedger(value), []);
  assert.equal(budgetCapacity(value).effectiveLimitMicroCny, 150);
  assert.equal(budgetSummary(value).availableMicroCny, 120);
  assert.throws(() => reserveEntry(value, { requestId: 'stale', taskId: 'old', provider: 'fake', pricingVersion: 'v1', estimatedMaxCostMicroCny: 1 }), /closed/i);
  reserveEntry(value, { requestId: 'new-request', taskId: 'new', provider: 'fake', pricingVersion: 'v1', estimatedMaxCostMicroCny: 120 });
  assert.equal(budgetSummary(value).availableMicroCny, 0);
  assert.deepEqual(validateLedger(value), []);
});

test('closure, authorization and historical allocations cannot be removed, duplicated or overspent', () => {
  for (const change of [
    (v: ReturnType<typeof ledger>) => { v.allocationClosures[0].releasedMicroCny = 71; },
    (v: ReturnType<typeof ledger>) => { v.allocationClosures.push({ ...v.allocationClosures[0] }); },
    (v: ReturnType<typeof ledger>) => { v.entries[0].reservedMicroCny = 1; },
    (v: ReturnType<typeof ledger>) => { v.authorizations[0].additionalMicroCny = Number.MAX_SAFE_INTEGER; },
    (v: ReturnType<typeof ledger>) => { v.scope = 'validation' as any; },
  ]) {
    const value = ledger(); change(value); assert.notEqual(validateLedger(value).length, 0);
  }
  const previous = ledger(), next = structuredClone(previous);
  next.allocationClosures = [];
  assert.notEqual(validateLedgerUpdate(previous, next, { role: 'system', actorId: 'runtime' }).length, 0);
});
