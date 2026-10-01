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
export function budgetSummary(ledger: BudgetLedger) {
  const committedMicroCny = ledger.entries.reduce((sum, entry) => sum + entry.reservedMicroCny + entry.settledMicroCny, 0);
  return {
    committedMicroCny,
    availableMicroCny: ledger.limitMicroCny - committedMicroCny,
    warning: committedMicroCny >= ledger.limitMicroCny * ledger.warningThresholdPercent / 100,
    exhausted: committedMicroCny >= ledger.limitMicroCny,
    reconciliationRequired: ledger.entries.some(entry => entry.unknown),
  };
}
