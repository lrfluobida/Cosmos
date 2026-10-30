import assert from 'node:assert/strict';
import test from 'node:test';
import { budgetCapacity, validateLedger, validateLedgerUpdate } from '../../src/contracts/index.ts';

const system = { role: 'system' as const, actorId: 'runtime' };
function original(spent = 492169): any {
  return { contractVersion: '1.0.0', ledgerId: 'budget', scope: 'generation', limitMicroCny: 5000000, warningThresholdPercent: 80,
    allocations: [{ taskId: 'planning', amountMicroCny: 500000 }, { taskId: 'design', amountMicroCny: 1125000 }],
    entries: [{ requestId: 'source-charge', taskId: 'design', provider: 'fixture', pricingVersion: '1', status: 'settled',
      settledMicroCny: spent, reservedMicroCny: 0, unknown: false, evidence: [{ artifactId: 'receipt', version: 'v1', location: 'receipt.json' }] }] };
}
function activated(spent = 492169): any {
  const value = original(spent), unused = 1125000 - spent;
  return { ...value, contractVersion: '6.0.0', allocations: [...value.allocations, { taskId: 'design-revision', amountMicroCny: 900000 + unused }],
    allocationClosures: [{ taskId: 'design', decisionId: 'design-budget-activation', releasedMicroCny: unused }] };
}
test('ordinary ledger6 conserves the two design grants without authorizations', () => {
  const value = activated();
  assert.deepEqual(validateLedger(value), []);
  assert.equal(budgetCapacity(value).allocatedMicroCny - 500000, 2025000);
  assert.deepEqual(validateLedgerUpdate(original(), value, system, { ordinaryDesignRevisionUpgrade: true } as any), []);
  assert.ok(validateLedgerUpdate(original(), value, system).length);
  assert.ok(validateLedgerUpdate(original(), value, { role: 'author', actorId: 'author' }, { ordinaryDesignRevisionUpgrade: true } as any).length);
});
test('ordinary closure permits zero unused but rejects extra authorities and unreconciled sources', () => {
  assert.deepEqual(validateLedger(activated(1125000)), []);
  for (const change of [
    (v: any) => { v.scope = 'validation'; },
    (v: any) => { v.allocationClosures = []; },
    (v: any) => { v.allocationClosures.push({ ...v.allocationClosures[0] }); },
    (v: any) => { v.allocationClosures[0].releasedMicroCny++; },
    (v: any) => { v.authorizations = [{ decisionId: 'fake', windowId: 'fake', additionalMicroCny: 0 }]; },
    (v: any) => { Object.assign(v.entries[0], { status: 'unknown', unknown: true, reservedMicroCny: 1 }); },
  ]) { const value = activated(); change(value); assert.ok(validateLedger(value).length); }
  const legacy = original(); legacy.allocationClosures = activated().allocationClosures;
  assert.ok(validateLedger(legacy).length);
});
test('closed design cannot append even a zero-cost cancelled historical request', () => {
  const before = activated(), after = structuredClone(before);
  after.entries.push({ ...after.entries[0], requestId: 'late', status: 'cancelled', settledMicroCny: 0 });
  assert.ok(validateLedgerUpdate(before, after, system).some(item => item.code === 'closed_grant'));
});
