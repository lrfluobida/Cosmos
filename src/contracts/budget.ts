import type { BudgetLedger } from './types.ts';

export const DEFAULT_BUDGETS = Object.freeze({
  validationMicroCny: 150_000_000,
  generationMicroCny: 200_000_000,
  warningThresholdPercent: 80,
  hardDurationMs: 12 * 60 * 60 * 1000,
  optimizationMicroCny: 100_000_000,
  optimizationDurationMs: 6 * 60 * 60 * 1000,
});

export const COS16_GROUP_GRANTS = Object.freeze({ planning: 400_000, design: 1_200_000, art: 2_800_000, coding: 2_800_000, repair: 2_800_000 });

/** Read only after validation. Membership comes from authenticated delegation records. */
export function validationBudgetGroup(ledger: BudgetLedger) {
  if (ledger.contractVersion !== '4.0.0') return undefined;
  const taskIds = (ledger.allocationDelegations ?? []).flatMap(item => item.taskIds), members = new Set(taskIds);
  const parentCommitted = ledger.entries.filter(entry => entry.taskId === 'COS-16').reduce((sum, entry) => sum + entry.settledMicroCny + entry.reservedMicroCny, 0);
  const derivedNetMicroCny = ledger.allocations.filter(item => members.has(item.taskId)).reduce((sum, item) => sum + item.amountMicroCny, 0)
    - (ledger.allocationClosures ?? []).filter(item => members.has(item.taskId)).reduce((sum, item) => sum + item.releasedMicroCny, 0);
  const committedMicroCny = ledger.entries.filter(entry => entry.taskId === 'COS-16' || members.has(entry.taskId)).reduce((sum, entry) => sum + entry.settledMicroCny + entry.reservedMicroCny, 0);
  return { parentTaskId: 'COS-16' as const, limitMicroCny: 10_000_000, taskIds, derivedNetMicroCny, committedMicroCny,
    allocatedMicroCny: parentCommitted + derivedNetMicroCny, remainingMicroCny: Math.max(0, 10_000_000 - committedMicroCny) };
}

/** Call after validateLedger. This summary does not reserve funds or authorize dispatch. */
export function budgetCapacity(ledger: BudgetLedger) {
  const effectiveLimitMicroCny = ledger.limitMicroCny + (ledger.authorizations ?? []).reduce((sum, item) => sum + item.additionalMicroCny, 0);
  const allocatedMicroCny = ledger.allocations.reduce((sum, item) => sum + item.amountMicroCny, 0) - (ledger.allocationClosures ?? []).reduce((sum, item) => sum + item.releasedMicroCny, 0)
    - (validationBudgetGroup(ledger)?.derivedNetMicroCny ?? 0);
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
