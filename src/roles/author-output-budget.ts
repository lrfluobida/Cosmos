import { setTimeout as yieldToTimers } from 'node:timers/promises';
import { reserveEntry } from '../budget/ledger.ts';
import type { TaskContract } from '../contracts/index.ts';
import type { PiSessionOptions } from '../providers/pi.ts';
import type { RunController, RunSnapshot } from '../runtime/run.ts';
import type { ExecutionAuthority } from '../runtime/run-types.ts';
import { ROLE_PRICING_VERSION } from './provider-budget.ts';

/** Read-only quotes against the original grant. Real reserve/admit still decides dispatch. */
export function authorBudgetOutputLimit(input: {
  controller: RunController; original: RunSnapshot; task: TaskContract; authority: ExecutionAuthority;
  floor: number; maxOutputTokens: number; estimate: PiSessionOptions['estimatedMaxCostMicroCny'];
}): NonNullable<PiSessionOptions['requestOutputLimit']> {
  const { controller, original, task, authority, floor, maxOutputTokens, estimate } = input;
  return async (request, requestSignal) => {
    const signal = AbortSignal.any([controller.signal, ...(requestSignal ? [requestSignal] : [])]);
    const requireActive = () => {
      signal.throwIfAborted();
      const deadline = Date.parse(authority.deadlineAt);
      if (!Number.isFinite(deadline) || Date.now() >= deadline - 5000) throw new Error('Author output selection has no original deadline cleanup time.');
    };
    requireActive();
    const state = await controller.read(), current = await controller.executionAuthority(task.taskId);
    requireActive();
    const stableRunKeys = ['contractVersion', 'runId', 'kind', 'specVersion', 'ledgerId', 'originalStartedAt', 'originalDeadlineAt'] as const;
    if (state.stopReason || state.formatVersion !== original.formatVersion
      || stableRunKeys.some(key => state.run[key] !== original.run[key])
      || task.runId !== state.run.runId || task.specVersion !== state.run.specVersion || task.budget.ledgerId !== state.ledger.ledgerId
      || task.budget.originalDeadlineAt !== state.run.originalDeadlineAt
      || state.ledger.ledgerId !== original.ledger.ledgerId || state.ledger.scope !== original.ledger.scope
      || state.ledger.limitMicroCny !== original.ledger.limitMicroCny
      || state.ledger.allocations.find(item => item.taskId === task.taskId)?.amountMicroCny !== task.budget.allocationMicroCny
      || !current.admissionAllowed || current.windowId !== authority.windowId || current.deadlineAt !== authority.deadlineAt
      || current.effectiveLimitMicroCny !== authority.effectiveLimitMicroCny || current.taskGrantMicroCny !== authority.taskGrantMicroCny) {
      throw new Error('Author output limit has no current original run, grant or window authority.');
    }
    if (request.modelId !== 'deepseek-flash' || request.maxOutputTokens !== maxOutputTokens) throw new Error('Invalid author output cap.');
    // Injected estimates need not be monotone. A fresh clone makes each candidate independent.
    for (let cap = maxOutputTokens; cap >= floor; cap--) {
      const candidate = Object.freeze({ ...request, maxOutputTokens: cap });
      const cost = typeof estimate === 'function' ? estimate(candidate) : estimate;
      if (!Number.isSafeInteger(cost) || cost <= 0) throw new Error('Invalid author output cost estimate.');
      let affordable = false;
      try {
        reserveEntry(structuredClone(state.ledger), { requestId: request.requestId, taskId: task.taskId,
          provider: 'deepseek', pricingVersion: ROLE_PRICING_VERSION, estimatedMaxCostMicroCny: cost });
        affordable = true;
      } catch { /* A quote cannot grant authority or change the real ledger. */ }
      if (affordable) { requireActive(); return cap; }
      if ((maxOutputTokens - cap + 1) % 64 === 0) {
        requireActive(); await yieldToTimers(0, undefined, { signal }); requireActive();
      }
    }
    requireActive();
    throw new Error('Original task budget cannot afford the author output floor.');
  };
}
