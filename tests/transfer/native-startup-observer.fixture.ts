import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { lstat, open, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

type Scalar = string | number | boolean | null;
export interface DiagnosticSpan {
  id: number; parentId: number | null; name: string; startMs: number; endMs: number | null; durationMs: number | null;
  outcome: 'pending' | 'returned' | 'threw'; error?: { name: string; message: string };
}
const maximum = { maxSpans: 8192, maxEvents: 16384, maxBytes: 8 * 1024 * 1024 };
function lowerLimit(value: number | undefined, ceiling: number) {
  if (value === undefined) return ceiling;
  assert.ok(Number.isSafeInteger(value) && value > 0 && value <= ceiling, 'Diagnostic test limits may only lower the fixed ceiling'); return value;
}
// Copy the bounded text; a sliced large message must not retain its original backing string.
function text(value: string) {
  let end = Math.min(2048, value.length); if (end && /[\uD800-\uDBFF]/.test(value[end - 1])) end--;
  return Buffer.from(value.slice(0, end), 'utf8').toString('utf8');
}
function brief(error: unknown) {
  try { return error instanceof Error ? { name: text(error.name), message: text(error.message) }
    : { name: typeof error, message: typeof error === 'string' ? text(error) : 'Non-Error rejection' }; }
  catch { return { name: 'UninspectableError', message: 'Error metadata could not be read' }; }
}

/** No arguments, result objects, Promises or Error objects enter the observation records. */
export function createDiagnosticObserver(options: Partial<typeof maximum> & { now?: () => number } = {}) {
  const limits = { maxSpans: lowerLimit(options.maxSpans, maximum.maxSpans), maxEvents: lowerLimit(options.maxEvents, maximum.maxEvents), maxBytes: lowerLimit(options.maxBytes, maximum.maxBytes) };
  const now = options.now ?? (() => performance.now()), clock = { kind: 'performance.now', originUtc: new Date().toISOString(), originMonotonicMs: now() };
  const parents = new AsyncLocalStorage<number>(), spans: DiagnosticSpan[] = [], events: { name: string; atMs: number; data?: Record<string, Scalar> }[] = [];
  let bytes = 0, dropped = 0, firstFailure: { kind: string; message: string } | null = null, phaseWriter: ((phase: string) => void) | undefined;
  const fail = (kind: string, error: unknown = kind) => { firstFailure ??= { kind: text(kind), message: brief(error).message }; };
  const reserve = (amount: number) => { if (bytes + amount > limits.maxBytes) { dropped++; fail('trace_bytes'); return false; } bytes += amount; return true; };
  const status = () => ({ incomplete: firstFailure !== null, firstFailure: firstFailure && { ...firstFailure }, spanCount: spans.length, eventCount: events.length, serializedBytes: bytes, dropped });
  function event(name: string, input?: Record<string, unknown>) {
    try {
      if (events.length >= limits.maxEvents) { dropped++; fail('trace_events'); return; }
      let data: Record<string, Scalar> | undefined;
      if (input !== undefined) {
        if (!input || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) { fail('non_scalar'); dropped++; return; }
        data = Object.create(null);
        for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(input))) {
          if (!descriptor.enumerable) continue;
          if (!('value' in descriptor)) { fail('non_scalar'); dropped++; return; }
          const value: unknown = descriptor.value;
          if (value === undefined) continue;
          if (!(value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value))) { fail('non_scalar'); dropped++; return; }
          data![text(key)] = typeof value === 'string' ? text(value) : value;
        }
      }
      const row = { name: text(name), atMs: now(), ...(data === undefined ? {} : { data }) };
      if (reserve(Buffer.byteLength(JSON.stringify(row)))) events.push(row);
    } catch (error) { fail('observation', error); }
  }
  function span<T>(name: string, operation: () => T): T {
    let row: DiagnosticSpan | undefined, initialBytes = 0;
    try {
      if (spans.length >= limits.maxSpans) { dropped++; fail('trace_spans'); }
      else {
        const candidate: DiagnosticSpan = { id: spans.length + 1, parentId: parents.getStore() ?? null, name: text(name), startMs: now(), endMs: null, durationMs: null, outcome: 'pending' };
        initialBytes = Buffer.byteLength(JSON.stringify(candidate)); if (reserve(initialBytes)) { row = candidate; spans.push(row); }
      }
    } catch (error) { fail('observation', error); }
    const finish = (outcome: 'returned' | 'threw', error?: unknown) => {
      if (!row) return;
      try {
        const endMs = now(), completed = { ...row, endMs, durationMs: endMs - row.startMs, outcome, ...(outcome === 'threw' ? { error: brief(error) } : {}) };
        if (reserve(Buffer.byteLength(JSON.stringify(completed)) - initialBytes)) Object.assign(row, completed);
      } catch (error) { fail('observation', error); }
    };
    return parents.run(row?.id ?? parents.getStore() ?? 0, () => {
      let result: T;
      try { result = operation(); } catch (error) { finish('threw', error); throw error; }
      if (result instanceof Promise) void result.then(() => finish('returned'), error => finish('threw', error));
      else finish('returned');
      return result;
    });
  }
  return { span, event, fail, status,
    phase(name: string) { event('phase', { phase: name }); try { phaseWriter?.(text(name)); } catch (error) { fail('progress', error); } },
    setPhaseWriter(writer?: (phase: string) => void) { phaseWriter = writer; },
    snapshot() { return structuredClone({ clock, spans, events, observation: status(), limits }); } };
}
export type DiagnosticObserver = ReturnType<typeof createDiagnosticObserver>;

type Method = (this: any, ...args: any[]) => any;
/** One restoration entry per installed method; no per-call history exists. */
export function createMethodPatches(observer: DiagnosticObserver) {
  const installed: { target: object; key: PropertyKey; own: PropertyDescriptor | undefined }[] = [];
  function restore() {
    let complete = true;
    while (installed.length) {
      const { target, key, own } = installed.pop()!;
      try { if (own) Object.defineProperty(target, key, own); else if (!Reflect.deleteProperty(target, key)) throw new Error('Inherited override could not be removed'); }
      catch (error) { complete = false; observer.fail('restore', error); }
    }
    return complete;
  }
  return { restore,
    replace(target: object, key: PropertyKey, factory: (original: Method) => Method) {
      try {
        const own = Object.getOwnPropertyDescriptor(target, key), original: unknown = Reflect.get(target, key);
        assert.equal(typeof original, 'function', 'An observed method must be a function');
        const replacement = factory(original as Method); assert.equal(typeof replacement, 'function');
        Object.defineProperty(target, key, own ? { ...own, value: replacement } : { configurable: true, enumerable: false, writable: true, value: replacement });
        installed.push({ target, key, own });
      } catch (error) { observer.fail('installation', error); restore(); throw error; }
    } };
}
export type DiagnosticPatches = ReturnType<typeof createMethodPatches>;

const within = (root: string, target: string) => { const part = relative(resolve(root), resolve(target)); return part === '' || !isAbsolute(part) && part !== '..' && !part.startsWith('..' + sep); };
async function outputPath(root: string, sourceRepository: string, name: string) {
  assert.ok(isAbsolute(root) && isAbsolute(sourceRepository) && within(tmpdir(), root) && basename(root).startsWith('cos93-native-startup-'), 'New explicit COS93 TEMP root required');
  assert.ok(!within(root, sourceRepository) && !within(sourceRepository, root), 'Diagnostic output must be separate from original source');
  assert.equal(await realpath(root), resolve(root));
  for (let path = resolve(root); ; path = dirname(path)) { const info = await lstat(path); assert.ok(info.isDirectory() && !info.isSymbolicLink(), 'Output ancestors must be independent directories'); if (dirname(path) === path) break; }
  return join(root, name);
}
export async function writeProtectedBefore(root: string, sourceRepository: string, manifest: unknown, maxBytes = 2 * 1024 * 1024) {
  const limit = lowerLimit(maxBytes, 2 * 1024 * 1024), path = await outputPath(root, sourceRepository, 'protected-before.json');
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n'); assert.ok(bytes.length <= limit, 'Protected before manifest exceeds its fixed size limit');
  const file = await open(path, 'wx'); try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); } return path;
}
export async function openDiagnosticProgress(root: string, sourceRepository: string, observer: DiagnosticObserver,
  options: { maxRecords?: number; maxRecordBytes?: number; maxBytes?: number } = {}) {
  const limits = { maxRecords: lowerLimit(options.maxRecords, 64), maxRecordBytes: lowerLimit(options.maxRecordBytes, 2048), maxBytes: lowerLimit(options.maxBytes, 128 * 1024) };
  const file = await open(await outputPath(root, sourceRepository, 'progress.ndjson'), 'wx');
  let queued = 0, written = 0, bytes = 0, enqueueMs = 0, failed = false, closed = false, pending = Promise.resolve();
  function record(phase: string) {
    const started = performance.now();
    try {
      if (closed || failed) { observer.fail(closed ? 'progress_closed' : 'progress_write'); return; }
      const status = observer.status(), memory = process.memoryUsage();
      const row = JSON.stringify({ phase: text(phase), utc: new Date().toISOString(), monotonicMs: performance.now(), spans: status.spanCount,
        events: status.eventCount, traceBytes: status.serializedBytes, dropped: status.dropped, observationIncomplete: status.incomplete,
        observationFailure: status.firstFailure?.kind ?? null, enqueueMs, heapUsed: memory.heapUsed, heapTotal: memory.heapTotal, rss: memory.rss, external: memory.external }) + '\n';
      const buffer = Buffer.from(row);
      if (queued >= limits.maxRecords || buffer.length > limits.maxRecordBytes || bytes + buffer.length > limits.maxBytes) { observer.fail('progress_limit'); return; }
      queued++; bytes += buffer.length;
      pending = pending.then(async () => {
        if (failed) return;
        let offset = 0;
        while (offset < buffer.length) { const result = await file.write(buffer, offset, buffer.length - offset); if (!result.bytesWritten) throw new Error('Progress write made no progress'); offset += result.bytesWritten; }
        written++;
      }).catch(error => { failed = true; observer.fail('progress_write', error); });
    } finally { enqueueMs += performance.now() - started; }
  }
  observer.setPhaseWriter(record);
  const flush = () => observer.span('observer.progress.flush', async () => { await pending; if (!failed) try { await file.sync(); } catch (error) { failed = true; observer.fail('progress_sync', error); } });
  return { record, flush, status: () => ({ queued, written, bytes, enqueueMs, failed, closed, limits }),
    async close() { if (closed) return; closed = true; observer.setPhaseWriter(); await flush(); try { await file.close(); } catch (error) { failed = true; observer.fail('progress_close', error); } } };
}
