import { constants } from 'node:os';

/** The CLI and model session may print this message. Keep payloads and paths out. */
export class SnapshotPersistenceError extends Error {
  constructor(operation: string, cause: unknown) {
    const code = (cause as NodeJS.ErrnoException | null)?.code;
    const detail = typeof code === 'string' && Object.hasOwn(constants.errno, code) ? ` (${code})` : '';
    super(`Snapshot persistence failed during ${operation}${detail}.`, { cause });
  }
}

/** Cleanup still fails and retains ownership when required. Keep both causes for inspection. */
export function ownerCloseError(cleanup: unknown, persistence?: Error): unknown {
  if (!persistence || cleanup === persistence) return cleanup;
  return new AggregateError([persistence, cleanup], `${persistence.message} Closing the controller also failed.`, { cause: persistence });
}
