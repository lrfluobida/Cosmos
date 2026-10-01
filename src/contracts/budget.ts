import type { BudgetLedger } from './types.ts';

export const DEFAULT_BUDGETS = Object.freeze({
  validationMicroCny: 150_000_000,
  generationMicroCny: 200_000_000,
  warningThresholdPercent: 80,
  hardDurationMs: 12 * 60 * 60 * 1000,
  optimizationMicroCny: 100_000_000,
  optimizationDurationMs: 6 * 60 * 60 * 1000,
});

/** Call after validateLedger. This summary does not reserve funds or authorize dispatch. */
export function budgetCapacity(ledger: BudgetLedger) {
  const effectiveLimitMicroCny = ledger.limitMicroCny + (ledger.authorizations ?? []).reduce((sum, item) => sum + item.additionalMicroCny, 0);
  const allocatedMicroCny = ledger.allocations.reduce((sum, item) => sum + item.amountMicroCny, 0) - (ledger.allocationClosures ?? []).reduce((sum, item) => sum + item.releasedMicroCny, 0);
  return { effectiveLimitMicroCny, allocatedMicroCny };
}

export function budgetSummary(ledger: BudgetLedger) {
  const committedMicroCny = ledger.entries.reduce((sum, entry) => sum + entry.reservedMicroCny + entry.settledMicroCny, 0);
  const { effectiveLimitMicroCny } = budgetCapacity(ledger);
  return {
    committedMicroCny,
    availableMicroCny: effectiveLimitMicroCny - committedMicroCny,
    warning: committedMicroCny >= effectiveLimitMicroCny * ledger.warningThresholdPercent / 100,
    exhausted: committedMicroCny >= effectiveLimitMicroCny,
    reconciliationRequired: ledger.entries.some(entry => entry.unknown),
  };
}
