import type { RunController } from '../run.ts';

/** Tracks explicitly owned host operations until their writes and children have settled. */
export class OwnedWork {
  private abort = new AbortController();
  private operations = new Set<Promise<unknown>>();
  private cleanupFailures: unknown[] = [];
  private operationTokens = new WeakMap<object, { settled: boolean }>();
  readonly signal: AbortSignal;
  constructor(signal?: AbortSignal) { this.signal = signal ? AbortSignal.any([this.abort.signal, signal]) : this.abort.signal; }

  run<T>(action: (signal: AbortSignal, operation: object) => Promise<T>): Promise<T> {
    if (this.signal.aborted) return Promise.reject(new Error('Owned work was cancelled; dispatch is stopped.'));
    const token = Object.freeze({}), state = { settled: false };
    const operation = Promise.resolve().then(() => { this.signal.throwIfAborted(); this.operationTokens.set(token, state); return action(this.signal, token); });
    this.operations.add(operation);
    const ended = () => { state.settled = true; this.operations.delete(operation); };
    void operation.then(ended, ended);
    return operation;
  }

  /** Identity comes only from this instance's actual callback, never a caller flag. */
  operationState(token: object): 'unknown' | 'active' | 'cancelled' | 'settled' {
    const state = this.operationTokens.get(token);
    return !state ? 'unknown' : state.settled ? 'settled' : this.signal.aborted ? 'cancelled' : 'active';
  }

  /** Explicit cleanup failures survive operation removal; ordinary cancellation stays unchanged. */
  retainCleanupFailure(error: unknown): void { this.cleanupFailures.push(error); }

  async cancelAndDrain(reason: string, timeoutMs = 5000): Promise<void> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Drain timeout must be positive.');
    this.abort.abort(new Error(reason));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled([...this.operations]),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Owned work did not quiesce before the drain deadline; stopped state is unconfirmed.')), timeoutMs); }),
      ]);
      if (this.cleanupFailures.length) throw new AggregateError([...this.cleanupFailures], `Owned cleanup failed: ${this.cleanupFailures.map(String).join('; ')}`);
    } finally { clearTimeout(timer); }
  }
}

/** A successful return acknowledges both durable stop and completion of owned writes. */
export async function cancelAndDrain(controller: RunController, work: OwnedWork, reason: string, timeoutMs?: number): Promise<void> {
  const results = await Promise.allSettled([controller.stop(reason), work.cancelAndDrain(reason, timeoutMs)]);
  const failure = results.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}
