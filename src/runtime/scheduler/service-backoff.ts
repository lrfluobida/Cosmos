import { setTimeout as delay } from 'node:timers/promises';
import type { RunController } from '../run.ts';
import { assessRepair } from '../repair/policy.ts';
import type { RepairOptions, RepairDecision } from '../repair/policy.ts';

/** A bounded quiet interval between completed task batches. This never sends a
 * request or creates a replacement task; callers still use createLinkedRepairTask
 * with the original complete history and the same controller after it returns. */
export async function waitForServiceRetry(options: Omit<RepairOptions, 'snapshot' | 'now' | 'cancelled'> & {
  controller: RunController; backoffMs: number; signal?: AbortSignal; now?: () => number;
  /** Deterministic clock adapter for offline tests; production uses an abortable timer. */
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}): Promise<RepairDecision> {
  if (!Number.isSafeInteger(options.backoffMs) || options.backoffMs < 1 || options.backoffMs > 60_000) throw new Error('Service backoff must be between 1 and 60000 milliseconds.');
  const signal = AbortSignal.any([options.controller.signal, ...(options.signal ? [options.signal] : [])]);
  const now = options.now ?? Date.now;
  const assess = async (includeWait: boolean) => assessRepair({ requirement: options.requirement, history: options.history, policy: options.policy,
    snapshot: await options.controller.read(), now: now(), cancelled: signal.aborted,
    estimate: { ...options.estimate, durationMs: options.estimate.durationMs + (includeWait ? options.backoffMs : 0) } });
  return options.controller.coordinateAccounting(async () => {
    const before = await assess(true);
    if (before.action !== 'retry_service') return before;
    try { await (options.wait ?? ((milliseconds, abort) => delay(milliseconds, undefined, { signal: abort })))(options.backoffMs, signal); }
    catch (error) { if (!signal.aborted) throw error; }
    return assess(false);
  });
}
