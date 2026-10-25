import { setTimeout as yieldToTimers } from 'node:timers/promises';
import { InsufficientReservationBudgetError, reserveEntry } from '../budget/ledger.ts';
import type { TaskContract } from '../contracts/index.ts';
import type { PiRequest, PiSessionOptions } from '../providers/pi.ts';
import type { RunController, RunSnapshot } from '../runtime/run.ts';
import type { ExecutionAuthority } from '../runtime/run-types.ts';
import { ROLE_PRICING_VERSION } from './provider-budget.ts';

interface AuthorBudgetInput {
  controller: RunController; original: RunSnapshot; task: TaskContract; authority: ExecutionAuthority;
  floor: number; maxOutputTokens: number; estimate: PiSessionOptions['estimatedMaxCostMicroCny'];
}
type QuoteRequest = Omit<PiRequest, 'estimatedMaxCostMicroCny'>;

async function originalQuotes(input: AuthorBudgetInput, requestSignal?: AbortSignal) {
  const { controller, original, task, authority, estimate } = input;
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
  const quote = (request: QuoteRequest) => {
    const cost = typeof estimate === 'function' ? estimate(Object.freeze({ ...request })) : estimate;
    if (!Number.isSafeInteger(cost) || cost <= 0) throw new Error('Invalid author output cost estimate.');
    let affordable = false;
    try {
      reserveEntry(structuredClone(state.ledger), { requestId: request.requestId, taskId: task.taskId,
        provider: 'deepseek', pricingVersion: ROLE_PRICING_VERSION, estimatedMaxCostMicroCny: cost });
      affordable = true;
    } catch (error) {
      if (!(error instanceof InsufficientReservationBudgetError)) throw error;
    }
    requireActive();
    return affordable;
  };
  return { quote, requireActive, signal };
}

function requireCap(request: QuoteRequest, input: AuthorBudgetInput) {
  if (request.modelId !== 'deepseek-flash' || !Number.isSafeInteger(request.maxOutputTokens)
    || request.maxOutputTokens <= 0 || request.maxOutputTokens > input.maxOutputTokens) throw new Error('Invalid author output cap.');
}

/** Read-only quotes against the original grant. Real reserve/admit still decides dispatch. */
export function authorBudgetOutputLimit(input: AuthorBudgetInput): NonNullable<PiSessionOptions['requestOutputLimit']> {
  return async (request, requestSignal) => {
    const { quote, requireActive, signal } = await originalQuotes(input, requestSignal);
    requireCap(request, input);
    // Injected estimates need not be monotone. A fresh clone makes each candidate independent.
    for (let cap = request.maxOutputTokens; cap >= Math.min(input.floor, request.maxOutputTokens); cap--) {
      if (quote({ ...request, maxOutputTokens: cap })) return cap;
      if ((request.maxOutputTokens - cap + 1) % 64 === 0) {
        requireActive(); await yieldToTimers(0, undefined, { signal }); requireActive();
      }
    }
    requireActive();
    throw new Error('Original task budget cannot afford the author output floor.');
  };
}

/** Optional summaries never borrow authority or reserve funds during their read-only preflight. */
export function authorBudgetCompaction(input: AuthorBudgetInput): Pick<PiSessionOptions, 'requestCompaction' | 'requestCompactionAdmission'> {
  return {
    requestCompaction: async bounds => {
      const { quote } = await originalQuotes(input);
      const request = { ...bounds, requestId: 'ordinary-compaction-quote', modelId: 'deepseek-flash' as const };
      requireCap(request, input);
      if (request.maxOutputTokens !== input.maxOutputTokens) throw new Error('Invalid ordinary compaction cap.');
      return !quote(request) && quote({ ...request, maxOutputTokens: input.floor });
    },
    requestCompactionAdmission: async ({ summary, ordinary }, signal) => {
      const { quote } = await originalQuotes(input, signal);
      requireCap(summary, input);
      if (quote(summary)) return 'admit';
      const request = { ...ordinary, requestId: summary.requestId, modelId: 'deepseek-flash' as const };
      requireCap(request, input);
      if (request.maxOutputTokens !== input.maxOutputTokens) throw new Error('Invalid ordinary compaction cap.');
      if (quote({ ...request, maxOutputTokens: input.floor })) return 'skip';
      throw new Error('Original task budget cannot afford the author output floor.');
    },
  };
}
