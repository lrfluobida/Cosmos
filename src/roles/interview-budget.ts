import { sameValue } from '../contracts/validation.ts';
import { reserveEntry } from '../budget/ledger.ts';
import type { PiSessionOptions } from '../providers/pi.ts';
import type { IntakeController, IntakeSnapshot } from '../runtime/intake.ts';
import { verifyPublicValidationFunding } from '../runtime/public-validation-funding.ts';
import { ROLE_PRICING_VERSION } from './provider-budget.ts';

/** Selection is a read-only quote. The real reserve/admit remains the dispatch authority. */
export function ordinaryDraftOutputLimit(controller: IntakeController, original: IntakeSnapshot,
  estimate: PiSessionOptions['estimatedMaxCostMicroCny']): NonNullable<PiSessionOptions['requestOutputLimit']> {
  return async request => {
    controller.signal.throwIfAborted();
    const state = await controller.read();
    if (state.stopReason || state.confirmation || state.ordinaryProfile !== 'ordinary-design/1' || state.draftMode
      || !sameValue(state.run, original.run) || state.ledger.ledgerId !== original.ledger.ledgerId
      || state.interviewTaskId !== original.interviewTaskId || state.maxRequests !== original.maxRequests
      || state.durationMs !== original.durationMs || state.ledger.limitMicroCny !== original.ledger.limitMicroCny
      || !sameValue(state.ledger.allocations, original.ledger.allocations)
      || state.requests.length >= state.maxRequests || !sameValue(state.validationFunding, original.validationFunding)) {
      throw new Error('Ordinary draft output limit has no current original intake authority.');
    }
    await verifyPublicValidationFunding({ root: controller.root, snapshot: state, dispatch: true });
    if (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens < 1 || request.maxOutputTokens > 16384
      || request.modelId !== 'deepseek-flash') throw new Error('Invalid ordinary draft output cap.');
    // An injected estimator need not be monotone. Descend through the fixed ordinary interval.
    for (let cap = request.maxOutputTokens; cap >= Math.min(8192, request.maxOutputTokens); cap--) {
      const candidate = { ...request, maxOutputTokens: cap };
      const cost = typeof estimate === 'function' ? estimate(candidate) : estimate;
      if (!Number.isSafeInteger(cost) || cost <= 0) throw new Error('Invalid ordinary draft cost estimate.');
      try {
        reserveEntry(structuredClone(state.ledger), { requestId: request.requestId, taskId: state.interviewTaskId,
          provider: 'deepseek', pricingVersion: ROLE_PRICING_VERSION, estimatedMaxCostMicroCny: cost });
        return cap;
      } catch { /* Try the next bounded candidate using a fresh copy of the original ledger. */ }
    }
    throw new Error('Original intake budget cannot afford an ordinary draft output cap.');
  };
}
