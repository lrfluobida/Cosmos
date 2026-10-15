import { DeadlineError } from './deadline.ts';

export const NATIVE_VALIDATION_WAIT_CONTRACT = 'native-validation-waits/1' as const;
const caps = { prepare_authority: 60_000, register_authority: 60_000, browser_transport: 15_000,
  navigation: 300_000, http_pre_authority: 60_000, http_body: 15_000, http_post_authority: 60_000 } as const;
export type NativeWaitStage = keyof typeof caps;
export interface NativeReadLifetime { readonly signal: AbortSignal; readonly deadlineAt: number }
export interface NativeWaitInput {
  caseId: string; windowId: string; taskId: string; deadlineAt: number; signal: AbortSignal;
  trackRaw<T>(start: (ownedSignal: AbortSignal) => Promise<T>): Promise<T>;
}
interface StageRecord {
  stage: NativeWaitStage; capMs: number; startedAt: number; deadlineAt: number; endedAt: number | null;
  elapsedMs: number | null; outcome: 'pending' | 'passed' | 'failed'; rawPending: boolean;
}
export interface NativeSegmentSnapshot {
  reportId: string; generation: number; state: string; stages: StageRecord[]; rawReadsPending: number;
  firstCause: { stage: NativeWaitStage; name: string; message: string } | null;
}
export interface NativeSegmentWaits {
  readonly reportId: string; readonly generation: number;
  runStage<T>(stage: NativeWaitStage, operation: (life: NativeReadLifetime) => Promise<T>): Promise<T>;
  snapshot(): NativeSegmentSnapshot;
}
export interface NativeValidationWaits {
  readonly contractVersion: typeof NATIVE_VALIDATION_WAIT_CONTRACT;
  readonly caseId: string; readonly windowId: string; readonly taskId: string;
  readonly deadlineAt: number; readonly workDeadlineAt: number; readonly readSignal: AbortSignal;
  beginSegment(reportId: string): NativeSegmentWaits;
  snapshot(): { contractVersion: typeof NATIVE_VALIDATION_WAIT_CONTRACT; deadlineAt: number; workDeadlineAt: number;
    rawReads: { started: number; settled: number; pending: number }; segments: NativeSegmentSnapshot[] };
}
interface SegmentData {
  reportId: string; generation: number; state: string; abort: AbortController; raw: Set<Promise<unknown>>;
  records: StageRecord[]; firstCause: NativeSegmentSnapshot['firstCause'];
}
interface ReadOwner {
  input: NativeWaitInput; raw: Set<Promise<unknown>>; started: number; settled: number;
}
interface ReadAssociation { owner: ReadOwner; segment?: SegmentData }
const sources = new WeakSet<object>(), readers = new WeakMap<AbortSignal, ReadAssociation>();

export class NativeWaitDeadlineError extends DeadlineError {
  readonly stage: NativeWaitStage;
  constructor(stage: NativeWaitStage) { super(`Native validation ${stage}: deadline reached`); this.name = 'NativeWaitDeadlineError'; this.stage = stage; }
}
/** A derived reader signal inherits ownership, never authority or local-cancellation provenance. */
export function associateNativeReadSignal(parent: AbortSignal | undefined, combined: AbortSignal): AbortSignal {
  const association = parent && readers.get(parent);
  if (association) readers.set(combined, association);
  return combined;
}
/** Ownership is registered by the host before the thunk can start, including after an outer race rejects. */
export function runNativeValidationRead<T>(signal: AbortSignal, start: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const association = readers.get(signal);
  if (!association) return start(signal);
  const { owner, segment } = association;
  if (owner.input.signal.aborted) return Promise.reject(owner.input.signal.reason);
  if (signal.aborted) return Promise.reject(signal.reason);
  const operation = owner.input.trackRaw(async ownedSignal => {
    owner.input.signal.throwIfAborted(); signal.throwIfAborted(); ownedSignal.throwIfAborted();
    const active = associateNativeReadSignal(signal, AbortSignal.any([ownedSignal, signal]));
    owner.started++;
    return start(active);
  });
  owner.raw.add(operation); segment?.raw.add(operation);
  const settled = () => { owner.raw.delete(operation); segment?.raw.delete(operation); owner.settled++; };
  void operation.then(settled, settled);
  return operation;
}
export function isNativeValidationWaits(value: unknown): value is NativeValidationWaits {
  return !!value && typeof value === 'object' && sources.has(value);
}
function identifier(value: string) { return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value); }
/** Only the native validation host constructs this object; budgets are fixed source constants. */
export function createNativeValidationWaits(input: NativeWaitInput): NativeValidationWaits {
  if (Object.keys(input).some(key => !['caseId', 'windowId', 'taskId', 'deadlineAt', 'signal', 'trackRaw'].includes(key))
    || ![input.caseId, input.windowId, input.taskId].every(identifier) || !Number.isSafeInteger(input.deadlineAt)
    || input.deadlineAt <= Date.now() || input.deadlineAt - Date.now() > 43_200_000 || !(input.signal instanceof AbortSignal)
    || typeof input.trackRaw !== 'function') throw new Error('Invalid native wait source fields');
  const fixed = Object.freeze({ ...input }), owner: ReadOwner = { input: fixed, raw: new Set(), started: 0, settled: 0 };
  const readSignal = AbortSignal.any([fixed.signal]), workDeadlineAt = fixed.deadlineAt - 5000;
  readers.set(readSignal, { owner });
  const segments: SegmentData[] = [];
  let current: SegmentData | undefined;
  const view = (segment: SegmentData): NativeSegmentSnapshot => structuredClone({ reportId: segment.reportId,
    generation: segment.generation, state: segment.state, stages: segment.records, rawReadsPending: segment.raw.size, firstCause: segment.firstCause });
  const waits: NativeValidationWaits = {
    contractVersion: NATIVE_VALIDATION_WAIT_CONTRACT, caseId: fixed.caseId, windowId: fixed.windowId, taskId: fixed.taskId,
    deadlineAt: fixed.deadlineAt, workDeadlineAt, readSignal,
    beginSegment(reportId) {
      fixed.signal.throwIfAborted();
      if (!identifier(reportId) || current && current.state !== 'closed' || owner.raw.size) throw new Error('Native segment is not ready');
      const segment: SegmentData = { reportId, generation: segments.length + 1, state: 'preparing', abort: new AbortController(),
        raw: new Set(), records: [], firstCause: null };
      current = segment; segments.push(segment);
      const check = () => {
        fixed.signal.throwIfAborted(); segment.abort.signal.throwIfAborted();
        if (current !== segment || Date.now() >= workDeadlineAt) throw new DeadlineError('Native validation original work deadline reached');
      };
      return Object.freeze({ reportId, generation: segment.generation, snapshot: () => view(segment),
        async runStage<T>(stage: NativeWaitStage, operation: (life: NativeReadLifetime) => Promise<T>): Promise<T> {
          check();
          const expected = { prepare_authority: 'preparing', register_authority: 'registering', browser_transport: 'connecting' };
          if (!(stage in expected) || segment.state !== expected[stage as keyof typeof expected]) throw new Error('Native stage order changed');
          const startedAt = Date.now(), deadlineAt = Math.min(workDeadlineAt, startedAt + caps[stage]), clock = performance.now();
          const abort = new AbortController();
          const signal = associateNativeReadSignal(readSignal, AbortSignal.any([fixed.signal, segment.abort.signal, abort.signal]));
          readers.set(signal, { owner, segment });
          const record: StageRecord = { stage, capMs: caps[stage], startedAt, deadlineAt, endedAt: null, elapsedMs: null, outcome: 'pending', rawPending: true };
          segment.records.push(record);
          let onAbort!: () => void;
          const cancelled = new Promise<never>((_, reject) => { onAbort = () => reject(signal.reason); signal.addEventListener('abort', onAbort, { once: true }); });
          const timer = setTimeout(() => abort.abort(new NativeWaitDeadlineError(stage)), Math.max(0, deadlineAt - Date.now()));
          const raw = Promise.resolve().then(() => { check(); signal.throwIfAborted(); return operation({ signal, deadlineAt }); });
          void raw.then(() => { record.rawPending = false; }, () => { record.rawPending = false; });
          try {
            const result = await Promise.race([raw, cancelled]);
            check(); signal.throwIfAborted();
            if (Date.now() >= deadlineAt) throw new NativeWaitDeadlineError(stage);
            record.outcome = 'passed';
            segment.state = stage === 'prepare_authority' ? 'registering' : stage === 'register_authority' ? 'connecting' : 'transport_ready';
            return result;
          } catch (caught) {
            const error = fixed.signal.aborted ? fixed.signal.reason : caught;
            record.outcome = 'failed'; segment.state = 'closing';
            segment.firstCause ??= { stage, name: error instanceof Error ? error.name : 'Error', message: error instanceof Error ? error.message : String(error) };
            segment.abort.abort(error); throw error;
          } finally {
            clearTimeout(timer); signal.removeEventListener('abort', onAbort);
            record.endedAt = Date.now(); record.elapsedMs = performance.now() - clock;
          }
        } });
    },
    snapshot: () => ({ contractVersion: NATIVE_VALIDATION_WAIT_CONTRACT, deadlineAt: fixed.deadlineAt, workDeadlineAt,
      rawReads: { started: owner.started, settled: owner.settled, pending: owner.raw.size }, segments: segments.map(view) }),
  };
  sources.add(waits); return Object.freeze(waits);
}
