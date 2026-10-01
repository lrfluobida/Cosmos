export class DeadlineError extends Error {}

/** A rejected race must be followed by terminating the owned browser, which cancels pending protocol calls. */
export async function bounded<T>(operation: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (timeoutMs <= 0) throw new DeadlineError(`${label}: run deadline reached`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DeadlineError(`${label}: timed out after ${timeoutMs} ms`)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}
