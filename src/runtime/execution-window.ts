import { budgetCapacity } from '../contracts/budget.ts';
import type { RunSnapshot } from './run-types.ts';

export interface ExecutionWindowBinding {
  windowId: string; decisionId: string; quoteId: string; startedAt: string; deadlineAt: string; effectiveLimitMicroCny: number;
}

/** Read-only display/clock view. It grants no task, request or child-process authority. */
export function executionWindowView(snapshot: RunSnapshot) {
  const { run, ledger } = snapshot;
  const window = snapshot.formatVersion === 2 ? snapshot.continuation?.windows.find(item => item.windowId === snapshot.continuation?.currentWindowId) : undefined;
  if (snapshot.formatVersion === 2 && !window) throw new Error('Current execution window is missing.');
  return {
    original: { runId: run.runId, ledgerId: ledger.ledgerId, state: run.state, originalStartedAt: run.originalStartedAt,
      originalDeadlineAt: run.originalDeadlineAt, limitMicroCny: ledger.limitMicroCny, stopReason: structuredClone(snapshot.stopReason) },
    executionWindow: { windowId: window?.windowId ?? null, decisionId: window?.decisionId ?? null,
      startedAt: window?.startedAt ?? run.originalStartedAt, deadlineAt: window?.deadlineAt ?? run.originalDeadlineAt,
      state: window ? window.stopReason ? 'waiting_user' : 'running' : run.state,
      stopReason: structuredClone(window?.stopReason ?? (window ? null : snapshot.stopReason)), effectiveLimitMicroCny: budgetCapacity(ledger).effectiveLimitMicroCny },
  };
}

/** New origins bind their actual authorization. Historical tasks retain their v1 origins. */
export function taskWindowBinding(snapshot: RunSnapshot, taskId: string): ExecutionWindowBinding | undefined {
  if (snapshot.formatVersion !== 2) return undefined;
  const window = snapshot.continuation?.windows.find(item => item.windowId === snapshot.continuation?.currentWindowId);
  if (!window) throw new Error('Current execution window is missing.');
  if (!window.grants.some(grant => grant.taskId === taskId)) return undefined;
  return { windowId: window.windowId, decisionId: window.decisionId, quoteId: window.quote.quoteId,
    startedAt: window.startedAt, deadlineAt: window.deadlineAt, effectiveLimitMicroCny: window.quote.proposed.totalLimitMicroCny };
}
