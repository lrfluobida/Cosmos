import { bounded, DeadlineError } from './deadline.ts';

export const NATIVE_VALIDATION_WAIT_CONTRACT = 'native-validation-waits/1' as const;
export const NATIVE_SNAPSHOT_VALIDATION_WAIT_CONTRACT = 'native-validation-waits/2' as const;
export type NativeValidationWaitContract = typeof NATIVE_VALIDATION_WAIT_CONTRACT | typeof NATIVE_SNAPSHOT_VALIDATION_WAIT_CONTRACT;
const legacyCaps = { prepare_authority: 60_000, register_authority: 60_000, browser_transport: 15_000,
  navigation: 300_000, http_pre_authority: 60_000, http_body: 15_000, http_post_authority: 60_000 } as const;
export type NativeWaitStage = keyof typeof legacyCaps;
type NativeHttpStage = Extract<NativeWaitStage, `http_${string}`>;
export interface NativeReadLifetime { readonly signal: AbortSignal; readonly deadlineAt: number; check(): void }
export interface NativeWaitInput {
  caseId: string; windowId: string; taskId: string; deadlineAt: number; signal: AbortSignal;
  controllerSignal?: AbortSignal;
  trackRaw<T>(start: (ownedSignal: AbortSignal) => Promise<T>): Promise<T>;
}
interface StageRecord {
  stage: NativeWaitStage; capMs: number; startedAt: number | null; deadlineAt: number | null; endedAt: number | null;
  elapsedMs: number | null; outcome: 'skipped' | 'pending' | 'passed' | 'failed'; rawPending: boolean;
}
export interface NativeSegmentSnapshot {
  reportId: string; generation: number; state: string; stages: StageRecord[]; rawReadsPending: number;
  rawOperationsPending: number;
  http: { started: number; settled: number; rejected: number; pending: number; stages: HttpStageRecord[] };
  firstCause: { stage: NativeWaitStage; name: string; message: string } | null;
}
export interface NativeSegmentWaits {
  readonly reportId: string; readonly generation: number;
  check(): void;
  runStage<T>(stage: NativeWaitStage, operation: (life: NativeReadLifetime) => Promise<T>): Promise<T>;
  /** The original owned prepare owns the write; this subset retains an already-spawned PID's raw settlement. */
  trackRegistration<T>(start: () => Promise<T>): Promise<T>;
  /** Closing-only raw work; owner registration precedes dispatch and lasts until actual settlement. */
  trackCleanup<T>(start: () => Promise<T>): Promise<T>;
  beginNavigation(): void;
  finishNavigation(): void;
  revoke(reason?: unknown): void;
  settle(deadlineAt: number): Promise<void>;
  snapshot(): NativeSegmentSnapshot;
}
export interface NativeRequestWaits {
  runStage<T>(stage: NativeHttpStage, operation: (life: NativeReadLifetime) => Promise<T>): Promise<T>;
  check(): void;
  recordFailure(error: unknown): void;
}
export interface NativeValidationWaits {
  readonly contractVersion: NativeValidationWaitContract;
  readonly caseId: string; readonly windowId: string; readonly taskId: string;
  readonly deadlineAt: number; readonly workDeadlineAt: number; readonly readSignal: AbortSignal;
  checkRead(): void;
  requireExecution?(callerSignal: AbortSignal): Promise<void>;
  startConsumer(): number;
  beginSegment(reportId: string): NativeSegmentWaits;
  runRequest<T>(operation: (request: NativeRequestWaits) => Promise<T>): Promise<T>;
  snapshot(): { contractVersion: NativeValidationWaitContract; deadlineAt: number; workDeadlineAt: number;
    consumerStartedAt: number | null; rawReads: { started: number; settled: number; pending: number }; segments: NativeSegmentSnapshot[] };
}
interface SegmentData {
  reportId: string; generation: number; state: string; abort: AbortController; raw: Set<Promise<unknown>>;
  records: StageRecord[]; firstCause: NativeSegmentSnapshot['firstCause'];
  firstCauseRaw?: { error: unknown };
  operations: Set<Promise<unknown>>; requests: Set<Promise<unknown>>;
  navigation?: { startedAt: number; deadlineAt: number; clock: number };
  http: { started: number; settled: number; rejected: number; stages: HttpStageRecord[] };
  registrationTracked?: boolean;
}
interface HttpStageRecord { stage: NativeHttpStage; capMs: number; count: number; totalMs: number; maxMs: number }
interface ReadOwner {
  input: NativeWaitInput; raw: Set<Promise<unknown>>; started: number; settled: number;
  current?: SegmentData; waits?: NativeValidationWaits;
}
interface ReadAssociation { owner: ReadOwner; segment?: SegmentData }
interface CallerAssociation extends ReadAssociation { stage?: NativeWaitStage; active?(): boolean }
const sources = new WeakSet<object>(), readers = new WeakMap<AbortSignal, ReadAssociation>();
const callers = new WeakMap<AbortSignal, CallerAssociation>();
function nextCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value === Number.MAX_SAFE_INTEGER) throw new Error('Native wait counter overflow');
  return value + 1;
}
function nativeRecordedCause(owner: ReadOwner, segment: SegmentData | undefined): { error: unknown } | undefined {
  if (owner.input.controllerSignal?.aborted) return { error: owner.input.controllerSignal.reason };
  return segment?.firstCauseRaw;
}
function nativeError(owner: ReadOwner, segment: SegmentData | undefined, fallback: unknown): unknown {
  const cause = nativeRecordedCause(owner, segment); return cause ? cause.error : fallback;
}
function checkNativeRead(owner: ReadOwner, segment: SegmentData | undefined, ...signals: AbortSignal[]): void {
  const cause = nativeRecordedCause(owner, segment); if (cause) throw cause.error;
  owner.input.signal.throwIfAborted(); for (const signal of signals) signal.throwIfAborted();
  if (owner.waits?.contractVersion === NATIVE_SNAPSHOT_VALIDATION_WAIT_CONTRACT && Date.now() >= owner.waits.workDeadlineAt)
    throw new DeadlineError('Native validation work deadline reached');
}

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
  const captured = segment ?? owner.current; // A root reader keeps its entry generation for late error selection.
  try { checkNativeRead(owner, captured, signal); } catch (error) { return Promise.reject(error); }
  const startedCount = nextCount(owner.started);
  const started = owner.input.trackRaw(async ownedSignal => {
    checkNativeRead(owner, captured, signal, ownedSignal);
    const active = associateNativeReadSignal(signal, AbortSignal.any([ownedSignal, signal]));
    if (owner.waits?.contractVersion !== NATIVE_SNAPSHOT_VALIDATION_WAIT_CONTRACT) return start(active);
    const result = await start(active);
    checkNativeRead(owner, captured, active);
    return result;
  });
  const operation = started.catch(error => { throw nativeError(owner, captured, error); });
  owner.started = startedCount; // Count owned operations, including cancellation before the reader thunk starts.
  owner.raw.add(operation); segment?.raw.add(operation);
  const settled = () => { owner.raw.delete(operation); segment?.raw.delete(operation); owner.settled = nextCount(owner.settled); };
  void operation.then(settled, settled);
  if (owner.waits?.contractVersion !== NATIVE_SNAPSHOT_VALIDATION_WAIT_CONTRACT) return operation;
  return bounded(() => operation, owner.waits.workDeadlineAt - Date.now(), 'Native validation read', signal).catch(error => {
    checkNativeRead(owner, captured, signal); throw error;
  });
}
export function isNativeValidationWaits(value: unknown): value is NativeValidationWaits {
  return !!value && typeof value === 'object' && sources.has(value);
}
/** Pre-mount guards recover only the immutable source owner; callers still require a generation check. */
export function nativeValidationWaitsForCaller(signal: AbortSignal | undefined): NativeValidationWaits | undefined {
  return signal ? callers.get(signal)?.owner.waits : undefined;
}
/** Only original source lifetimes qualify; derived read signals carry ownership alone. */
export function nativeCallerDisposition(signal: AbortSignal | undefined, waits: NativeValidationWaits | undefined, error: unknown): 'ordinary' | 'active' | 'stale' | 'local_abort' {
  const association = signal && callers.get(signal);
  if (!association) return 'ordinary';
  if (association.owner.waits !== waits || association.segment && (association.owner.current !== association.segment
    || ['closing', 'closed'].includes(association.segment.state))) return 'stale';
  return association.segment && signal!.aborted && signal!.reason === error ? 'local_abort' : 'active';
}
/** Record before a source guard awaits invalidation; only its still-active original phase has authority. */
export function recordNativeValidationFailure(signal: AbortSignal | undefined, error: unknown): void {
  const association = signal && callers.get(signal);
  if (!association?.segment || !association.stage || !association.active?.() || association.owner.current !== association.segment
    || ['closing', 'closed'].includes(association.segment.state)) return;
  rememberNativeFailure(association.segment, association.stage, error);
}
function rememberNativeFailure(segment: SegmentData, stage: NativeWaitStage, error: unknown): void {
  if (segment.firstCauseRaw) return;
  segment.firstCauseRaw = { error };
  segment.firstCause = { stage, name: error instanceof Error ? error.name : 'Error', message: error instanceof Error ? error.message : String(error) };
}
function identifier(value: string) { return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value); }
/** Only the native validation host constructs this object; budgets are fixed source constants. */
export function createNativeValidationWaits(input: NativeWaitInput): NativeValidationWaits {
  return createWaits(input);
}
/** Trusted host only: execute the already fixed candidate, with current controller authority per HTTP request. */
export function createNativeSnapshotValidationWaits(input: NativeWaitInput & { requireExecution(callerSignal: AbortSignal): Promise<void> }): NativeValidationWaits {
  if (typeof input.requireExecution !== 'function') throw new Error('Invalid native execution callback');
  return createWaits(input, input.requireExecution);
}
function createWaits(input: NativeWaitInput, requireExecution?: (callerSignal: AbortSignal) => Promise<void>): NativeValidationWaits {
  const contractVersion = requireExecution ? NATIVE_SNAPSHOT_VALIDATION_WAIT_CONTRACT : NATIVE_VALIDATION_WAIT_CONTRACT;
  const caps = requireExecution ? { ...legacyCaps, http_pre_authority: 5000, http_post_authority: 5000 } : legacyCaps;
  if (Object.keys(input).some(key => !['caseId', 'windowId', 'taskId', 'deadlineAt', 'signal', 'controllerSignal', 'trackRaw', ...(requireExecution ? ['requireExecution'] : [])].includes(key))
    || ![input.caseId, input.windowId, input.taskId].every(identifier) || !Number.isSafeInteger(input.deadlineAt)
    || input.deadlineAt <= Date.now() || input.deadlineAt - Date.now() > 43_200_000 || !(input.signal instanceof AbortSignal)
    || input.controllerSignal !== undefined && !(input.controllerSignal instanceof AbortSignal)
    || typeof input.trackRaw !== 'function') throw new Error('Invalid native wait source fields');
  const fixed = Object.freeze({ ...input }), owner: ReadOwner = { input: fixed, raw: new Set(), started: 0, settled: 0 };
  const readSignal = AbortSignal.any([...(fixed.controllerSignal ? [fixed.controllerSignal] : []), fixed.signal]),
    workDeadlineAt = fixed.deadlineAt - (requireExecution ? 35000 : 5000);
  readers.set(readSignal, { owner });
  callers.set(readSignal, { owner });
  const segments: SegmentData[] = [];
  let current: SegmentData | undefined, consumerStartedAt: number | null = null;
  const view = (segment: SegmentData): NativeSegmentSnapshot => structuredClone({ reportId: segment.reportId,
    generation: segment.generation, state: segment.state, stages: (['prepare_authority', 'register_authority', 'browser_transport', 'navigation'] as const)
      .map(stage => segment.records.find(row => row.stage === stage) ?? { stage, capMs: caps[stage], startedAt: null, deadlineAt: null,
        endedAt: null, elapsedMs: null, outcome: 'skipped', rawPending: false }), rawReadsPending: segment.raw.size,
    rawOperationsPending: segment.operations.size, http: { ...segment.http, pending: segment.requests.size }, firstCause: segment.firstCause });
  const check = (segment: SegmentData, deadlineAt = workDeadlineAt) => {
    fixed.controllerSignal?.throwIfAborted();
    fixed.signal.throwIfAborted();
    if (current !== segment) throw new Error('Native stale segment');
    segment.abort.signal.throwIfAborted();
    if (Date.now() >= deadlineAt) throw new DeadlineError('Native validation deadline reached');
  };
  const executeStage = async <T>(segment: SegmentData, stage: NativeWaitStage,
    operation: (life: NativeReadLifetime) => Promise<T>, limit = workDeadlineAt): Promise<T> => {
    check(segment, limit);
    const navigation = stage === 'navigation' ? segment.navigation : undefined;
    const startedAt = navigation?.startedAt ?? Date.now(), clock = navigation?.clock ?? performance.now();
    const deadlineAt = Math.min(workDeadlineAt, limit, navigation?.deadlineAt ?? startedAt + caps[stage]);
    const abort = new AbortController(), signal = AbortSignal.any([...(fixed.controllerSignal ? [fixed.controllerSignal] : []), fixed.signal, segment.abort.signal, abort.signal]);
    readers.set(signal, { owner, segment });
    const record: StageRecord = { stage, capMs: caps[stage], startedAt, deadlineAt, endedAt: null, elapsedMs: null, outcome: 'pending', rawPending: true };
    callers.set(signal, { owner, segment, stage, active: () => record.endedAt === null && record.rawPending });
    const http = segment.http.stages.find(row => row.stage === stage);
    if (!http) segment.records.push(record);
    let onAbort!: () => void;
    const cancelled = new Promise<never>((_, reject) => { onAbort = () => reject(signal.reason); signal.addEventListener('abort', onAbort, { once: true }); });
    const timer = setTimeout(() => abort.abort(new NativeWaitDeadlineError(stage)), Math.max(0, deadlineAt - Date.now()));
    const life: NativeReadLifetime = Object.freeze({ signal, deadlineAt, check() {
      fixed.controllerSignal?.throwIfAborted();
      fixed.signal.throwIfAborted(); signal.throwIfAborted();
      if (Date.now() >= deadlineAt) { abort.abort(new NativeWaitDeadlineError(stage)); signal.throwIfAborted(); }
      check(segment); signal.throwIfAborted();
    } });
    const raw = Promise.resolve().then(() => {
      life.check(); return operation(life);
    });
    segment.operations.add(raw);
    const rawSettled = () => { record.rawPending = false; segment.operations.delete(raw); };
    void raw.then(rawSettled, rawSettled);
    try {
      const result = await Promise.race([raw, cancelled]);
      life.check();
      record.outcome = 'passed'; return result;
    } catch (caught) {
      const error = nativeError(owner, segment, fixed.signal.aborted ? fixed.signal.reason : caught);
      record.outcome = 'failed'; segment.state = 'closing';
      rememberNativeFailure(segment, stage, error);
      segment.abort.abort(error); throw error;
    } finally {
      clearTimeout(timer); signal.removeEventListener('abort', onAbort);
      record.endedAt = Date.now(); record.elapsedMs = performance.now() - clock;
      if (http) { http.count = nextCount(http.count); http.totalMs += record.elapsedMs; http.maxMs = Math.max(http.maxMs, record.elapsedMs); }
    }
  };
  const waits: NativeValidationWaits = {
    contractVersion, caseId: fixed.caseId, windowId: fixed.windowId, taskId: fixed.taskId,
    deadlineAt: fixed.deadlineAt, workDeadlineAt, readSignal,
    ...(requireExecution ? { async requireExecution(callerSignal: AbortSignal) {
      const association = callers.get(callerSignal);
      if (association?.owner !== owner || !association.segment || association.segment !== current || !association.active?.()
        || !['http_pre_authority', 'http_post_authority'].includes(association.stage ?? '')) throw new Error('Native execution caller has no current HTTP authority.');
      checkNativeRead(owner, association.segment, callerSignal); check(association.segment);
      await requireExecution(callerSignal);
      checkNativeRead(owner, association.segment, callerSignal); check(association.segment);
    } } : {}),
    checkRead() { checkNativeRead(owner, current); },
    startConsumer() {
      fixed.controllerSignal?.throwIfAborted(); fixed.signal.throwIfAborted();
      if (requireExecution) checkNativeRead(owner, current);
      if (consumerStartedAt !== null) throw new Error('Native consumer already started');
      return consumerStartedAt = Date.now();
    },
    beginSegment(reportId) {
      fixed.controllerSignal?.throwIfAborted();
      fixed.signal.throwIfAborted();
      if (requireExecution && Date.now() >= workDeadlineAt) throw new DeadlineError('Native validation work deadline reached');
      if (!identifier(reportId) || current && current.state !== 'closed' || owner.raw.size) throw new Error('Native segment is not ready');
      const segment: SegmentData = { reportId, generation: segments.length + 1, state: 'preparing', abort: new AbortController(),
        raw: new Set(), operations: new Set(), requests: new Set(), records: [], firstCause: null,
        http: { started: 0, settled: 0, rejected: 0, stages: (['http_pre_authority', 'http_body', 'http_post_authority'] as const)
          .map(stage => ({ stage, capMs: caps[stage], count: 0, totalMs: 0, maxMs: 0 })) } };
      current = owner.current = segment; segments.push(segment);
      return Object.freeze({ reportId, generation: segment.generation, snapshot: () => view(segment),
        check() {
          checkNativeRead(owner, segment); check(segment);
        },
        trackRegistration<T>(start: () => Promise<T>): Promise<T> {
          if (current !== segment || segment.registrationTracked || !['registering', 'closing'].includes(segment.state)
            || !segment.records.some(row => row.stage === 'prepare_authority' && row.outcome === 'passed')) throw new Error('Native registration ownership is not ready');
          segment.registrationTracked = true;
          const raw = Promise.resolve().then(start); segment.operations.add(raw);
          const settled = () => { segment.operations.delete(raw); };
          void raw.then(settled, settled); return raw;
        },
        trackCleanup<T>(start: () => Promise<T>): Promise<T> {
          const checkCleanup = () => {
            fixed.controllerSignal?.throwIfAborted(); fixed.signal.throwIfAborted();
            if (!requireExecution || current !== segment || segment.state !== 'closing') throw new Error('Native cleanup requires its current closing segment');
            if (Date.now() >= fixed.deadlineAt - 5000) throw new DeadlineError('Native cleanup deadline reached');
          };
          checkCleanup();
          const raw = fixed.trackRaw(ownedSignal => Promise.resolve().then(() => { checkCleanup(); ownedSignal.throwIfAborted(); return start(); }));
          segment.operations.add(raw);
          const settled = () => { segment.operations.delete(raw); };
          void raw.then(settled, settled); return raw;
        },
        async runStage<T>(stage: NativeWaitStage, operation: (life: NativeReadLifetime) => Promise<T>): Promise<T> {
          check(segment);
          const expected = { prepare_authority: 'preparing', register_authority: 'registering', browser_transport: 'connecting', navigation: 'navigating' };
          if (!(stage in expected) || segment.state !== expected[stage as keyof typeof expected]) throw new Error('Native stage order changed');
          if (segment.records.some(row => row.stage === stage)) throw new Error('Native stage was already started');
          const result = await executeStage(segment, stage, operation);
          segment.state = stage === 'prepare_authority' ? 'registering' : stage === 'register_authority' ? 'connecting'
            : stage === 'browser_transport' ? 'transport_ready' : 'navigating';
          return result;
        },
        beginNavigation() {
          check(segment);
          if (segment.state !== 'transport_ready' || segment.navigation) throw new Error('Native navigation is not ready');
          const startedAt = Date.now();
          segment.navigation = { startedAt, deadlineAt: Math.min(workDeadlineAt, startedAt + caps.navigation), clock: performance.now() };
          segment.state = 'navigating';
        },
        finishNavigation() {
          check(segment, segment.navigation?.deadlineAt);
          if (segment.state !== 'navigating' || !segment.records.some(row => row.stage === 'navigation' && row.outcome === 'passed')) throw new Error('Native navigation did not complete');
          segment.state = 'input';
        },
        revoke(reason: unknown = new Error('Native segment closed')) {
          if (current !== segment || segment.state === 'closed') return;
          segment.state = 'closing'; segment.abort.abort(reason);
        },
        async settle(deadlineAt: number) {
          if (segment.state !== 'closing' && segment.state !== 'closed') throw new Error('Native segment must close before settlement');
          await bounded(() => Promise.allSettled([...segment.operations, ...segment.requests, ...segment.raw]),
            Math.min(fixed.deadlineAt, deadlineAt) - Date.now(), 'Native segment settle');
          if (current === segment) segment.state = 'closed';
        } });
    },
    runRequest<T>(operation: (request: NativeRequestWaits) => Promise<T>): Promise<T> {
      if (fixed.controllerSignal?.aborted) return Promise.reject(fixed.controllerSignal.reason);
      if (fixed.signal.aborted) return Promise.reject(fixed.signal.reason);
      const segment = current;
      if (!segment || !['navigating', 'input'].includes(segment.state)) return Promise.reject(new Error('Native traffic is closed'));
      const deadlineAt = segment.state === 'navigating' ? segment.navigation!.deadlineAt : workDeadlineAt;
      const started = nextCount(segment.http.started);
      let closed = false, step = 0, activeCaller: AbortSignal | undefined;
      const request: NativeRequestWaits = Object.freeze({
        check() { if (closed) throw new Error('Native request closed'); check(segment, deadlineAt); },
        recordFailure(error: unknown) {
          if (closed || current !== segment || !['navigating', 'input'].includes(segment.state)) return;
          recordNativeValidationFailure(activeCaller, error);
        },
        async runStage<T>(stage: NativeHttpStage, action: (life: NativeReadLifetime) => Promise<T>): Promise<T> {
          request.check();
          if (stage !== segment.http.stages[step]?.stage) throw new Error('Native HTTP stage order changed');
          const result = await executeStage(segment, stage, life => { activeCaller = life.signal; return action(life); }, deadlineAt); step++; return result;
        },
      });
      const raw = fixed.trackRaw(async () => { try { request.check(); return await operation(request); } finally { closed = true; } });
      segment.http.started = started; segment.requests.add(raw);
      const settled = () => { segment.requests.delete(raw); segment.http.settled = nextCount(segment.http.settled); };
      void raw.then(settled, () => { segment.http.rejected = nextCount(segment.http.rejected); settled(); }); return raw;
    },
    snapshot: () => ({ contractVersion, deadlineAt: fixed.deadlineAt, workDeadlineAt, consumerStartedAt,
      rawReads: { started: owner.started, settled: owner.settled, pending: owner.raw.size }, segments: segments.map(view) }),
  };
  owner.waits = waits; sources.add(waits); return Object.freeze(waits);
}
