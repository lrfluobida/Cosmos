import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTaskUpdate, validateLedgerUpdate, validateRunUpdate, budgetSummary, DEFAULT_BUDGETS } from '../../src/contracts/index.ts';
import { artifact, ledger, passedTask, run, task } from './fixtures.ts';

const author = { actorId: 'author-1', role: 'author' };
const reviewer = { actorId: 'reviewer-1', role: 'reviewer' };
const system = { actorId: 'runtime', role: 'system' };
function rejected(issues: unknown[]) { assert.ok(issues.length > 0, 'invalid update must have validation issues'); }

test('independent reviewer can approve an evidenced awaiting-review task', () => {
  assert.deepEqual(validateTaskUpdate(task(), passedTask(), reviewer), []);
});

test('author cannot approve own work by writing a different reviewer ID', () => {
  rejected(validateTaskUpdate(task(), passedTask(), author));
});

test('rejects illegal state jumps and terminal-state reopening', () => {
  const before = task(); before.state = 'running'; rejected(validateTaskUpdate(before, passedTask(), reviewer));
  rejected(validateTaskUpdate(passedTask(), task(), system));
});

test('fixed acceptance steps, IDs and inputs cannot be altered during an attempt', () => {
  const before = task();
  const after = task(); after.acceptance[0].expected = 'easier'; rejected(validateTaskUpdate(before, after, author));
  const changed = task(); changed.inputs[0].version = 'v2'; rejected(validateTaskUpdate(before, changed, author));
  const fewer = task(); fewer.acceptanceIds = []; fewer.acceptance = []; rejected(validateTaskUpdate(before, fewer, author));
});

test('attempt and evidence history cannot be dropped or rewritten on recovery', () => {
  const before = task();
  const after = task(); after.attempts = []; rejected(validateTaskUpdate(before, after, system));
  const rewritten = task(); rewritten.attempts[0].sessionRef = 'fresh-session'; rejected(validateTaskUpdate(before, rewritten, system));
  const lessEvidence = task(); lessEvidence.evidence = []; rejected(validateTaskUpdate(before, lessEvidence, author));
});

test('run ID, budget allocation and original deadline cannot reset on task resume', () => {
  for (const after of [
    { ...task(), runId: 'fresh-run' },
    { ...task(), budget: { ...task().budget, ledgerId: 'fresh-ledger' } },
    { ...task(), budget: { ...task().budget, allocationMicroCny: 60_000_000 } },
    { ...task(), budget: { ...task().budget, originalDeadlineAt: '2026-10-02T12:00:00.000Z' } },
  ]) rejected(validateTaskUpdate(task(), after, system));
});

test('ledger settlement retains request provenance and can release unused reservation', () => {
  const after = ledger(); Object.assign(after.entries[0], { status: 'settled', reservedMicroCny: 0, settledMicroCny: 800_000, evidence: [artifact('receipt')] });
  assert.deepEqual(validateLedgerUpdate(ledger(), after, system), []);
});

test('author cannot mutate ledger, and no actor can remove requests or reset settled costs', () => {
  const after = ledger(); after.entries = []; rejected(validateLedgerUpdate(ledger(), after, author));
  rejected(validateLedgerUpdate(ledger(), after, system));
  const settled = ledger(); Object.assign(settled.entries[0], { status: 'settled', reservedMicroCny: 0, settledMicroCny: 800_000, evidence: [artifact('receipt')] });
  const reset = structuredClone(settled); reset.entries[0].settledMicroCny = 0; rejected(validateLedgerUpdate(settled, reset, system));
});

test('ledger cannot increase limits, rename or change settled request pricing', () => {
  rejected(validateLedgerUpdate(ledger(), { ...ledger(), ledgerId: 'new' }, system));
  const cheaper = ledger(); cheaper.limitMicroCny = 150_000_000; rejected(validateLedgerUpdate(ledger(), cheaper, system));
  const changed = ledger(); changed.entries[0].pricingVersion = 'free'; rejected(validateLedgerUpdate(ledger(), changed, system));
});

test('run recovery preserves start, deadline, settled fees, artifacts and human decisions', () => {
  assert.deepEqual(validateRunUpdate(run(), run(), system), []);
  for (const changed of [
    { ...run(), runId: 'renamed' }, { ...run(), ledgerId: 'fresh' },
    { ...run(), originalStartedAt: '2026-10-01T01:00:00.000Z' },
    { ...run(), originalDeadlineAt: '2026-10-01T11:00:00.000Z' }, { ...run(), artifacts: [] },
  ]) rejected(validateRunUpdate(run(), changed, system));
});

test('budget policy preserves unknown reservations and warns at 80 percent', () => {
  const value = ledger(); value.allocations[0].amountMicroCny = 200_000_000; value.entries[0].reservedMicroCny = 160_000_000;
  assert.deepEqual(budgetSummary(value), { committedMicroCny: 160_000_000, availableMicroCny: 40_000_000, warning: true, exhausted: false, reconciliationRequired: false });
  Object.assign(value.entries[0], { status: 'unknown', unknown: true }); assert.equal(budgetSummary(value).reconciliationRequired, true);
  value.entries[0].reservedMicroCny = 200_000_000; assert.equal(budgetSummary(value).exhausted, true);
});

test('optimization targets do not replace formal hard limits', () => {
  assert.equal(DEFAULT_BUDGETS.validationMicroCny, 150_000_000);
  assert.equal(DEFAULT_BUDGETS.generationMicroCny, 200_000_000);
  assert.equal(DEFAULT_BUDGETS.hardDurationMs, 12 * 60 * 60 * 1000);
  assert.equal(DEFAULT_BUDGETS.optimizationMicroCny, 100_000_000);
  assert.equal(DEFAULT_BUDGETS.optimizationDurationMs, 6 * 60 * 60 * 1000);
  const value = ledger(); value.allocations[0].amountMicroCny = 200_000_000; value.entries[0].reservedMicroCny = 100_000_000;
  assert.equal(budgetSummary(value).exhausted, false);
});
