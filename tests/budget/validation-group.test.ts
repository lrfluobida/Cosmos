import assert from 'node:assert/strict';
import test from 'node:test';
import { budgetCapacity, validateLedger, validateLedgerUpdate } from '../../src/contracts/index.ts';
import { reserveEntry } from '../../src/budget/ledger.ts';
import { vector } from '../runtime/validation-group.fixture.ts';

function ledger(): any {
  const caseId = 'cos20-group-ledger', taskIds = Object.keys(vector).map(role => `${caseId}-${role}`);
  return { contractVersion: '4.0.0', ledgerId: 'offline-shared', scope: 'validation', limitMicroCny: 150_000_000, warningThresholdPercent: 80,
    allocations: [{ taskId: 'COS-16', amountMicroCny: 10_000_000 }, { taskId: 'legacy', amountMicroCny: 74_596_040 },
      ...Object.entries(vector).map(([role, amountMicroCny]) => ({ taskId: `${caseId}-${role}`, amountMicroCny }))], entries: [], allocationClosures: [],
    allocationDelegations: [{ parentTaskId: 'COS-16', authorizationDecisionId: 'operator', caseId, decisionId: 'operator', taskIds }] };
}

test('ledger4 derived capacity counts its authenticated parent bucket once and forbids direct parent reservation', () => {
  const value = ledger(); assert.deepEqual(validateLedger(value), []);
  assert.deepEqual(budgetCapacity(value), { effectiveLimitMicroCny: 150_000_000, allocatedMicroCny: 84_596_040 });
  assert.throws(() => reserveEntry(value, { requestId: 'parent', taskId: 'COS-16', provider: 'fixture', pricingVersion: 'v1', estimatedMaxCostMicroCny: 1 }), /parent|delegat/i);
  const original = structuredClone(value), next = structuredClone(value); next.allocationDelegations[0].taskIds.reverse();
  assert.ok(validateLedgerUpdate(original, next, { role: 'system', actorId: 'fixture' }).length);
});

test('ledger4 rejects invented parents, duplicated membership, overdelegation and extra authorization money', () => {
  for (const alter of [(v: any) => { v.allocationDelegations[0].parentTaskId = 'legacy'; }, (v: any) => { v.allocations[0].amountMicroCny--; },
    (v: any) => { v.allocationDelegations[0].taskIds.pop(); }, (v: any) => { v.allocationDelegations.push({ ...v.allocationDelegations[0] }); },
    (v: any) => { v.allocations.at(-1).amountMicroCny++; }, (v: any) => { v.authorizations = []; }]) {
    const value = ledger(); alter(value); assert.ok(validateLedger(value).length);
  }
});
