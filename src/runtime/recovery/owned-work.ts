import type { RunController } from '../run.ts';

/** Tracks explicitly owned host operations until their writes and children have settled. */
export class OwnedWork {
  private abort = new AbortController();
  private operations = new Set<Promise<unknown>>();
  readonly signal: AbortSignal;
  constructor(signal?: AbortSignal) { this.signal = signal ? AbortSignal.any([this.abort.signal, signal]) : this.abort.signal; }

  run<T>(action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.signal.aborted) return Promise.reject(new Error('Owned work was cancelled; dispatch is stopped.'));
    const operation = Promise.resolve().then(() => { this.signal.throwIfAborted(); return action(this.signal); });
    this.operations.add(operation);
    void operation.then(() => this.operations.delete(operation), () => this.operations.delete(operation));
    return operation;
  }

  async cancelAndDrain(reason: string, timeoutMs = 5000): Promise<void> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Drain timeout must be positive.');
    this.abort.abort(new Error(reason));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled([...this.operations]),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Owned work did not quiesce before the drain deadline; stopped state is unconfirmed.')), timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
  }
}

/** A successful return acknowledges both durable stop and completion of owned writes. */
export async function cancelAndDrain(controller: RunController, work: OwnedWork, reason: string, timeoutMs?: number): Promise<void> {
  const results = await Promise.allSettled([controller.stop(reason), work.cancelAndDrain(reason, timeoutMs)]);
  const failure = results.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}
