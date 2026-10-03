import assert from 'node:assert/strict';
import test from 'node:test';
import { budgetCapacity, budgetSummary, validateLedger, validateLedgerUpdate } from '../../src/contracts/index.ts';
import { reserveEntry } from '../../src/budget/ledger.ts';

function ledger() {
  return {
    contractVersion: '3.0.0', ledgerId: 'same-validation-ledger', scope: 'validation', limitMicroCny: 150_000_000, warningThresholdPercent: 80,
    allocations: [{ taskId: 'legacy', amountMicroCny: 84_596_040 }, { taskId: 'closed-case', amountMicroCny: 21_000_000 }],
    entries: [{ requestId: 'spent', taskId: 'closed-case', provider: 'fixture', pricingVersion: 'v1', reservedMicroCny: 0, settledMicroCny: 926_626,
      unknown: false, status: 'settled', evidence: [{ artifactId: 'receipt', version: 'v1', location: 'receipt.json' }] }],
    allocationClosures: [{ taskId: 'closed-case', decisionId: 'closure-decision', releasedMicroCny: 20_073_374 }],
  };
}

test('validation v3 releases exact unused allocation while preserving the original hard limit and fees', () => {
  const value = ledger();
  assert.deepEqual(validateLedger(value), []);
  assert.deepEqual(budgetCapacity(value as any), { effectiveLimitMicroCny: 150_000_000, allocatedMicroCny: 85_522_666 });
  assert.equal(budgetSummary(value as any).committedMicroCny, 926_626);
  assert.throws(() => reserveEntry(value as any, { requestId: 'closed-again', taskId: 'closed-case', provider: 'fixture', pricingVersion: 'v1', estimatedMaxCostMicroCny: 1 }), /closed/i);
});

test('validation v3 rejects extra money, generation scope, unresolved costs and inexact or duplicate closures', () => {
  for (const change of [
    (v: any) => { v.authorizations = [{ decisionId: 'extra', windowId: 'window', additionalMicroCny: 1 }]; },
    (v: any) => { v.scope = 'generation'; },
    (v: any) => { v.limitMicroCny++; },
    (v: any) => { v.allocationClosures[0].releasedMicroCny++; },
    (v: any) => { v.allocationClosures[0].taskId = 'unknown'; },
    (v: any) => { v.allocationClosures.push({ ...v.allocationClosures[0] }); },
    (v: any) => { v.entries[0].status = 'unknown'; v.entries[0].unknown = true; v.entries[0].reservedMicroCny = 1; },
  ]) { const value = ledger(); change(value); assert.ok(validateLedger(value).length); }
});

test('explicit validation closure upgrade keeps grants and closed request facts immutable', () => {
  const next = ledger(), { allocationClosures: _closures, ...original } = structuredClone(next);
  original.contractVersion = '1.0.0';
  assert.deepEqual(validateLedger(original), []);
  assert.ok(validateLedgerUpdate(original, next, { role: 'system', actorId: 'validation' }).length);
  assert.deepEqual(validateLedgerUpdate(original, next, { role: 'system', actorId: 'validation' }, { validationClosureUpgrade: true } as any), []);
  const changed = structuredClone(next); changed.allocations[0].amountMicroCny--;
  assert.ok(validateLedgerUpdate(next, changed, { role: 'system', actorId: 'validation' }).length);
  const refund = structuredClone(next); refund.entries[0].settledMicroCny--;
  assert.ok(validateLedgerUpdate(next, refund, { role: 'system', actorId: 'validation' }).length);
  assert.ok(validateLedger({ ...next, contractVersion: '1.0.0' }).length);
  assert.ok(validateLedger({ ...next, contractVersion: '2.0.0', authorizations: [{ decisionId: 'closure-decision', windowId: 'window', additionalMicroCny: 0 }] }).length);
});

test('zero and fully spent stopped grants retain exact permanent closures', () => {
  for (const amountMicroCny of [0, 926_626]) {
    const value = ledger(); value.allocations[1].amountMicroCny = amountMicroCny; value.entries = amountMicroCny ? value.entries : [];
    value.allocationClosures[0].releasedMicroCny = 0;
    assert.deepEqual(validateLedger(value), []);
  }
});
