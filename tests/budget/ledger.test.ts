import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as ledgerApi from '../../src/budget/ledger.ts';
import { RunController } from '../../src/runtime/run.ts';

const evidence = [{ artifactId: 'bill', version: 'v1', location: 'evidence/bill.json' }];
const input = (requestId: string, taskId: string, amount: number) => ({ requestId, taskId, estimatedMaxCostMicroCny: amount, provider: 'fixture', pricingVersion: 'v1' });

test('model and assets receive allocations within one total and cannot create independent budgets', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-shared-budget-'));
  const controller = await RunController.create({ root, runId: 'run', ledgerId: 'shared', kind: 'evaluation', specVersion: 'v1', scope: 'validation', limitMicroCny: 100, allocations: [{ taskId: 'model', amountMicroCny: 60 }, { taskId: 'art', amountMicroCny: 40 }] });
  try {
    await Promise.all([controller.reserve(input('model-1', 'model', 60)), controller.reserve(input('art-1', 'art', 40))]);
    await assert.rejects(controller.reserve(input('art-retry', 'art', 1)), /budget/i);
    const summary = await controller.summary();
    assert.equal(summary.committedMicroCny, 100);
    assert.equal(summary.availableMicroCny, 0);
    assert.equal(summary.exhausted, true);
    await controller.admit('model-1'); // Existing reservations still authorize their funded request.
    await controller.settle('model-1', 50, evidence);
    await controller.reserve(input('model-retry', 'model', 10));
  } finally { await controller.close(); await rm(root, { recursive: true, force: true }); }
});

test('any charge above its estimate halts even when below the shared monetary cap', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-overrun-'));
  const controller = await RunController.create({ root, runId: 'run', ledgerId: 'shared', kind: 'evaluation', specVersion: 'v1', scope: 'validation', limitMicroCny: 100, allocations: [{ taskId: 'model', amountMicroCny: 100 }] });
  try {
    await controller.reserve(input('one', 'model', 60));
    await controller.admit('one');
    assert.deepEqual(await controller.settle('one', 70, evidence), { halted: true });
    const summary = await controller.summary();
    assert.equal(summary.settledMicroCny, 70);
    assert.equal(summary.stopReason?.code, 'charge_overrun');
    await assert.rejects(controller.reserve(input('two', 'model', 1)), /stopped/i);
  } finally { await controller.close(); await rm(root, { recursive: true, force: true }); }
});

test('creation rejects increased hard limits and overallocated task totals', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-budget-cap-'));
  const options = { root, runId: 'run', ledgerId: 'shared', kind: 'evaluation' as const, specVersion: 'v1', scope: 'validation' as const, allocations: [{ taskId: 'model', amountMicroCny: 150_000_000 }] };
  try {
    await assert.rejects(RunController.create({ ...options, limitMicroCny: 150_000_001 }), /limit/i);
    await assert.rejects(RunController.create({ ...options, scope: 'generation', limitMicroCny: 200_000_001 }), /limit/i);
    await assert.rejects(RunController.create({ ...options, allocations: [...options.allocations, { taskId: 'art', amountMicroCny: 1 }] }), /allocation/i);
    await assert.rejects(RunController.create({ ...options, durationMs: 12 * 60 * 60 * 1000 + 1 }), /deadline/i);
    const controller = await RunController.create(options);
    try { assert.equal((await controller.read()).ledger.limitMicroCny, 150_000_000); } finally { await controller.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('COS125 only shared and task insufficiency have a narrow read-only quote classification', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-quote-errors-'));
  const controller = await RunController.create({ root, runId: 'run', ledgerId: 'shared', kind: 'evaluation', specVersion: 'v1', scope: 'validation', limitMicroCny: 100, allocations: [{ taskId: 'model', amountMicroCny: 60 }] });
  try {
    const original = (await controller.read()).ledger;
    const ErrorType = (ledgerApi as any).InsufficientReservationBudgetError;
    assert.equal(typeof ErrorType, 'function', 'Budget insufficiency must be distinct from authority failures.');
    for (const [scope, amount, message] of [['shared', 101, 'Shared budget is insufficient.'], ['task', 61, 'Task budget allocation is insufficient.']] as const) {
      const ledger = structuredClone(original);
      assert.throws(() => ledgerApi.reserveEntry(ledger, input('quote', 'model', amount)), error => {
        assert.ok(error instanceof ErrorType); assert.equal((error as any).scope, scope);
        assert.equal((error as Error).name, 'Error'); assert.equal((error as Error).message, message); return true;
      });
      assert.deepEqual(ledger, original);
    }
    for (const failure of ['unknown', 'closed', 'missing', 'duplicate', 'invalid']) {
      const ledger = structuredClone(original), candidate = input('quote', failure === 'missing' ? 'absent' : 'model', failure === 'invalid' ? 0 : 1);
      if (failure === 'unknown' || failure === 'duplicate') {
        const entry = ledgerApi.reserveEntry(ledger, input(failure === 'duplicate' ? 'quote' : 'earlier', 'model', 1));
        if (failure === 'unknown') { entry.unknown = true; entry.status = 'unknown'; }
      }
      if (failure === 'closed') ledger.allocationClosures = [{ taskId: 'model' } as any];
      const before = structuredClone(ledger);
      assert.throws(() => ledgerApi.reserveEntry(ledger, candidate), error => !(error instanceof ErrorType));
      assert.deepEqual(ledger, before);
    }
  } finally { await controller.close(); await rm(root, { recursive: true, force: true }); }
});
