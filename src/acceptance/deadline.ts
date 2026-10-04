export class DeadlineError extends Error {}
export class AcceptanceCancelledError extends Error {}

/** A rejected race must be followed by terminating the owned browser, which cancels pending protocol calls. */
export async function bounded<T>(operation: () => Promise<T>, timeoutMs: number, label: string, signal?: AbortSignal): Promise<T> {
  if (timeoutMs <= 0) throw new DeadlineError(`${label}: run deadline reached`);
  if (signal?.aborted) throw new AcceptanceCancelledError(`${label}: acceptance cancelled`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DeadlineError(`${label}: timed out after ${timeoutMs} ms`)), timeoutMs);
    });
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(new AcceptanceCancelledError(`${label}: acceptance cancelled`));
      signal?.addEventListener('abort', abort, { once: true });
    });
    return await Promise.race([operation(), timeout, cancelled]);
  } finally { clearTimeout(timer); if (abort) signal?.removeEventListener('abort', abort); }
}
