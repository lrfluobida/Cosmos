import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import childProcess from 'node:child_process';
import { createConnection } from 'node:net';
import { chromium } from '@playwright/test';
import type { TestContext } from 'node:test';
import { regularFile, safePath, snapshot, within } from '../../src/artifacts/paths.ts';
import { sameValue } from '../../src/contracts/validation.ts';
import type { EvidenceContract } from '../../src/contracts/types.ts';
import { createValidationRequirement } from '../../src/roles/execution-input.ts';
import { RunController } from '../../src/runtime/run.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import { prepareValidationCase, verifyOperatorDecision } from '../../src/runtime/validation-window.ts';
import { verifyValidationBudgetSources } from '../../src/runtime/validation-budget.ts';
import { validationJournalBinding } from '../../src/runtime/validation-scope.ts';
import type { ValidationExecutionBinding } from '../../src/runtime/validation-scope.ts';
import { createHistoricalPassedStages } from '../../src/runtime/historical-passed-stages.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { OwnerLock } from '../../src/runtime/recovery/ownership.ts';
import { TaskJournal } from '../../src/runtime/recovery/task-journal.ts';
import { publishReceipt } from '../../src/runtime/recovery/receipt-file.ts';
import { createNativeBrowserHostIO } from '../../src/runtime/entrypoint-host.ts';
import type { BrowserHostIO } from '../../src/runtime/entrypoint-host.ts';
import { createTransferReusedConsumerHost } from '../../src/runtime/adapters/transfer/runtime-host.ts';
import { deriveTransferValidationCaseFourteenDeclaration } from '../../probes/transfer/validation-case-fourteen-declaration.ts';
import { createTransferCaseFourteenAdmissionQuote, transferCaseFourteenHistoricalAccountingHash, requireTransferCaseFourteenAccountingSources } from '../../probes/transfer/validation-case-fourteen-entry.ts';
import { captureTransferCaseFourteenSource, requireTransferCaseFourteenSource, requireTransferCaseFourteenTemplate, requireTransferCaseFourteenToolchain } from '../../probes/transfer/validation-case-fourteen-source.ts';
import { prepareTransferValidationCaseFourteenExecution } from '../../probes/transfer/validation-case-fourteen-task.ts';
import { fixedTransferValidationInput } from '../../probes/transfer/validation-input.ts';
import { runChild } from '../../probes/e2e/host.ts';
import type { PersistentAcceptanceReport } from '../../src/acceptance/persistent.ts';
import { PERSISTENT_PROFILE_CAPABILITY, validatePersistentSeries } from '../../src/acceptance/persistent.ts';
import type { PersistentAcceptanceSeries } from '../../src/acceptance/persistent.ts';
import type { OwnedAcceptanceLifecycle } from '../../src/acceptance/runner.ts';
import { associateNativeReadSignal, isNativeValidationWaits, runNativeValidationRead } from '../../src/acceptance/native-validation-waits.ts';
import type { NativeReadLifetime, NativeValidationWaits } from '../../src/acceptance/native-validation-waits.ts';
import { createMethodPatches, openDiagnosticProgress, recordedProcessesExited, writeProtectedBefore } from './native-startup-observer.fixture.ts';
import type { DiagnosticObserver, DiagnosticPatches } from './native-startup-observer.fixture.ts';

const CASE = 'cos20-transfer-validation-14', OLD = 'cos20-transfer-validation-5';
const platform = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const failure = (error: unknown) => ({ name: error instanceof Error ? error.name : 'Unknown', message: error instanceof Error ? error.message : String(error) });
const diagnosticStopMessage = 'Browser startup/execution: DiagnosticStartupComplete: verified native startup reached context.newPage';

/** A returned failed evidence contract is a failure even when host.verify did not throw. */
export function classifyDiagnosticStartup(input: { nativeCalls: number; startupPassed: boolean; hostEvidence?: readonly EvidenceContract[];
  trace: ReturnType<DiagnosticObserver['snapshot']>; phase: string; error?: ReturnType<typeof failure> }) {
  const observationFailure = input.trace.observation?.incomplete ? input.trace.observation.firstFailure : null;
  if (input.nativeCalls === 1 && input.startupPassed && !input.trace.observation?.incomplete) return { outcome: 'passed' as const,
    reason: 'Single original-limit open, exact diagnostic stop, PID/CDP identity and normal cleanup proved', failingGate: null };
  const first = input.hostEvidence?.find(evidence => evidence.outcome === 'failed');
  const scope = first && input.trace.spans.find(span => span.name === 'scope.read' && span.outcome === 'threw'
    && span.error?.name === 'ValidationScopeTimeoutError' && span.error.message === first.summary);
  const failingGate = first ? { operation: scope ? 'scope.read' : 'host.verify', summary: first.summary, source: structuredClone(first.source),
    traceSpanId: scope?.id ?? null, durationMs: scope?.durationMs ?? null }
    : input.error ? { operation: input.phase, summary: input.error.message, source: null, traceSpanId: null, durationMs: null }
      : observationFailure ? { operation: 'observer', summary: observationFailure.message, source: null, traceSpanId: null, durationMs: null } : null;
  return { outcome: input.nativeCalls === 0 ? 'not_reached' as const : 'failed' as const,
    reason: first?.summary ?? input.error?.message ?? observationFailure?.message ?? (input.nativeCalls === 0 ? 'Native IO was not reached; inspect host verification and preparation evidence'
      : 'Startup or cleanup was not fully proved; inspect trace and failed report'), failingGate };
}

export function registeredBrowserBeforeCdp(trace: ReturnType<DiagnosticObserver['snapshot']>, browserPid: number | undefined) {
  if (!Number.isSafeInteger(browserPid) || browserPid! <= 0) return false;
  const registration = trace.events.find(event => event.name === 'controller.registerOwnedChild.done' && event.data?.pid === browserPid);
  const cdp = trace.spans.find(span => span.name === 'cdp.connect');
  return !!registration && !!cdp && registration.atMs <= cdp.startMs;
}

export async function assertDiagnosticWriteRoot(target: string, sourceRepository: string): Promise<void> {
  assert.ok(isAbsolute(target) && isAbsolute(sourceRepository), 'Explicit absolute diagnostic roots required');
  assert.ok(!within(sourceRepository, target) && !within(target, sourceRepository), 'Diagnostic writes must be separate from original source');
  assert.ok(within(tmpdir(), target) && /^cos93-native-startup-/.test(basename(target)), 'Diagnostic writes require a new COS93 TEMP root');
  assert.equal(await realpath(await safePath(target)), resolve(target));
  assert.ok((await lstat(target)).isDirectory());
}
export async function requireDiagnosticInputs(sourceRepository: string, historySnapshot: string) {
  assert.ok(isAbsolute(sourceRepository) && isAbsolute(historySnapshot), 'Explicit private source and history paths required');
  const root = await realpath(await safePath(sourceRepository));
  assert.ok(within(join(root, '.cosmos/reconciliation'), historySnapshot)
    && basename(historySnapshot) === 'snapshot-after-case14-supplement.json', 'Exact preclaim history snapshot required');
  await regularFile(root, relative(root, historySnapshot).split(sep).join('/'));
  return { sourceRepository: root, historySnapshot: await realpath(historySnapshot) };
}

/** An allowlist of immutable source bytes. No original restoration or timestamp writes exist. */
class ProtectedInputs {
  files = new Map<string, { sha256: string; bytes: number; mtimeNs: string }>();
  directories = new Map<string, string[]>();
  manifest() { return { files: [...this.files].map(([path, info]) => ({ path, ...info })), directories: [...this.directories].map(([path, names]) => ({ path, names: [...names] })) }; }
  async file(path: string) {
    path = resolve(path); const bytes = await regularFile(dirname(path), basename(path)), info = await stat(path, { bigint: true });
    const value = { sha256: sha(bytes), bytes: bytes.length, mtimeNs: String(info.mtimeNs) };
    if (this.files.has(path)) assert.deepEqual(value, this.files.get(path), 'Original source changed during fixture preparation');
    else this.files.set(path, value);
    return bytes;
  }
  async tree(path: string): Promise<void> {
    const info = await lstat(path);
    if (info.isFile()) { await this.file(path); return; }
    assert.ok(info.isDirectory() && !info.isSymbolicLink(), 'Only independent source directories are read');
    const names = (await readdir(path)).sort(); this.directories.set(resolve(path), names);
    for (const name of names) await this.tree(join(path, name));
  }
  async check() {
    const changed: string[] = [];
    for (const [path, before] of this.files) {
      try { const bytes = await regularFile(dirname(path), basename(path)), info = await stat(path, { bigint: true });
        if (sha(bytes) !== before.sha256 || bytes.length !== before.bytes || String(info.mtimeNs) !== before.mtimeNs) changed.push(path);
      } catch { changed.push(path); }
    }
    for (const [path, names] of this.directories) try { if (!sameValue((await readdir(path)).sort(), names)) changed.push(path); } catch { changed.push(path); }
    return { unchanged: changed.length === 0, changed, files: [...this.files].map(([path, info]) => ({ path, ...info })), directories: [...this.directories].map(([path, names]) => ({ path, names })) };
  }
}
const counts = (state: RunSnapshot) => ({ revision: state.revision, cases: state.validation!.cases.length,
  delegations: state.ledger.allocationDelegations!.length, closures: state.ledger.allocationClosures!.length,
  audits: state.allocationClosureDecisions!.length, requests: state.requests.length, entries: state.ledger.entries.length,
  tasks: state.tasks.length, events: state.events.length, settledMicroCny: state.ledger.entries.reduce((sum, entry) => sum + entry.settledMicroCny, 0),
  reservedMicroCny: state.ledger.entries.reduce((sum, entry) => sum + entry.reservedMicroCny, 0), unknown: state.ledger.entries.filter(entry => entry.unknown).length });
async function closedLoopbackPort(url: string) {
  const target = new URL(url); assert.equal(target.hostname, '127.0.0.1'); assert.ok(Number(target.port) > 0);
  return new Promise<{ url: string; closed: boolean; observation: string }>(done => {
    const socket = createConnection({ host: '127.0.0.1', port: Number(target.port) }); let finished = false;
    const finish = (closed: boolean, observation: string) => { if (finished) return; finished = true; socket.destroy(); done({ url, closed, observation }); };
    socket.setTimeout(500, () => finish(false, 'timeout-unproven')); socket.once('connect', () => finish(false, 'still-accepting'));
    socket.once('error', (error: NodeJS.ErrnoException) => finish(error.code === 'ECONNREFUSED', error.code ?? 'unproved-error'));
  });
}

type DiagnosticMode = 'navigation' | undefined;
type ReadyExpectation = { player: readonly [number, number]; playerIndex: number; idleIndex: number };
export function deriveNavigationReadyExpectation(world: string, design: { map: { player: number[] } }, media: { characters: { manifest: { id: string; states: { name: string }[] } }[] }): ReadyExpectation {
  const declarations = [...world.matchAll(/export const INITIAL_PLAYER: Pos = \[(\d+),\s*(\d+)\];/g)];
  assert.equal(declarations.length, 1, 'Sealed source must have one explicit initial player');
  const player: [number, number] = [Number(declarations[0][1]), Number(declarations[0][2])];
  assert.deepEqual(player, design.map.player, 'Sealed initial state differs from the bound design');
  const players = media.characters.map(({ manifest: character }, index) => ({ character, index })).filter(row => row.character.id === 'player');
  assert.equal(players.length, 1); const idle = players[0].character.states.map((state, index) => ({ state, index })).filter(row => row.state.name === 'idle');
  assert.equal(idle.length, 1); return { player, playerIndex: players[0].index, idleIndex: idle[0].index };
}
export function diagnosticReadCheckpoint(mode: DiagnosticMode, caller?: AbortSignal) {
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    if (mode) caller?.throwIfAborted();
    try { const result = await operation(); if (mode) caller?.throwIfAborted(); return result; }
    catch (error) { if (mode) caller?.throwIfAborted(); throw error; }
  };
}

export async function readNavigationDiagnosticReady(page: Pick<import('@playwright/test').Page, 'locator' | 'evaluate'>,
  expected: ReadyExpectation, lifetime: { signal: AbortSignal; deadlineAt: number; check?(): void }) {
  let pending = 'initial observation';
  const checkpoint = () => {
    lifetime.check?.();
    lifetime.signal.throwIfAborted();
    if (Date.now() >= lifetime.deadlineAt) throw new Error('Diagnostic ready deadline reached; pending: ' + pending);
  };
  const read = async <T>(operation: () => Promise<T>) => {
    checkpoint(); let value: T;
    try { value = await operation(); } catch (error) { checkpoint(); throw error; }
    checkpoint(); return value;
  };
  assert.ok([...expected.player, expected.playerIndex, expected.idleIndex].every(value => Number.isSafeInteger(value) && value >= 0));
  const player = ['media', 'characters', String(expected.playerIndex)], idle = [...player, 'states', String(expected.idleIndex)];
  for (;;) {
    checkpoint(); const missing: string[] = [];
    if (!await read(() => page.locator('[data-testid="start"]').isVisible())) missing.push('start button');
    else if (await read(() => page.locator('[data-testid="start"]').innerText({ timeout: lifetime.deadlineAt - Date.now() })) !== '开始') {
      throw new Error('Diagnostic start button text differs from the sealed game');
    }
    if (!await read(() => page.locator('[data-testid="board"]').isVisible())) missing.push('board');
    if (!await read(() => page.locator('[data-testid="cell-' + expected.player.join('-') + '"][data-player="true"]').isVisible())) missing.push('initial player cell');
    const values = await read(() => page.evaluate((paths: string[][]) => {
      const descriptor = Object.getOwnPropertyDescriptor(window, 'cosmosDebug');
      if (!descriptor) return paths.map(() => null);
      if (descriptor.set || descriptor.writable === true || descriptor.configurable) throw new Error('Malformed diagnostic cosmosDebug descriptor');
      const snapshot: unknown = descriptor.get ? descriptor.get.call(window) : descriptor.value;
      return paths.map(path => {
        let value: unknown = snapshot;
        for (const key of path) {
          if (value === null || typeof value !== 'object') throw new Error('Malformed diagnostic debug structure: ' + key);
          const field = Object.getOwnPropertyDescriptor(value, key);
          if (!field) return null;
          if (field.get || field.set) throw new Error('Malformed diagnostic debug data property: ' + key);
          value = field.value;
        }
        if (typeof value !== 'string' && typeof value !== 'boolean') throw new Error('Malformed diagnostic debug scalar');
        return value;
      });
    }, [[...player, 'id'], [...idle, 'name'], [...idle, 'seen']]));
    assert.ok(Array.isArray(values) && values.length === 3, 'Malformed diagnostic debug observation');
    const [id, name, seen] = values;
    if (id !== null && id !== 'player') throw new Error('Diagnostic player id differs from the sealed media');
    if (name !== null && name !== 'idle') throw new Error('Diagnostic idle name differs from the sealed media');
    if (seen !== null && typeof seen !== 'boolean') throw new Error('Malformed diagnostic idle seen');
    if (id === null) missing.push('player id'); if (name === null) missing.push('idle name');
    if (seen !== true) missing.push(seen === null ? 'idle seen missing' : 'idle seen=false');
    if (!missing.length) return;
    pending = missing.join(', ');
    await read(() => new Promise<void>((resolve, reject) => {
      const onAbort = () => { clearTimeout(timer); reject(lifetime.signal.reason); };
      const timer = setTimeout(() => { lifetime.signal.removeEventListener('abort', onAbort); resolve(); },
        Math.min(100, lifetime.deadlineAt - Date.now()));
      lifetime.signal.addEventListener('abort', onAbort, { once: true });
    }));
  }
}

/** The original phase caller registers the raw read; only reading receives the derived timeout signal. */
export async function runNavigationDiagnosticReady(life: NativeReadLifetime, native: NativeValidationWaits,
  ready: (active: NativeReadLifetime) => Promise<void>): Promise<void> {
  life.check(); native.checkRead();
  const deadlineAt = Math.min(life.deadlineAt, native.workDeadlineAt), stop = new AbortController();
  const check = () => { life.check(); native.checkRead(); stop.signal.throwIfAborted();
    if (Date.now() >= deadlineAt) { stop.abort(new Error('Diagnostic ready deadline reached')); stop.signal.throwIfAborted(); } };
  let onAbort!: () => void;
  const signal = associateNativeReadSignal(life.signal, AbortSignal.any([life.signal, stop.signal]));
  const cancelled = new Promise<never>((_, reject) => { onAbort = () => { try { check(); } catch (error) { reject(error); } };
    signal.addEventListener('abort', onAbort, { once: true }); });
  const timer = setTimeout(() => stop.abort(new Error('Diagnostic ready deadline reached')), Math.max(0, deadlineAt - Date.now()));
  try {
    const raw = runNativeValidationRead(life.signal, async ownedSignal => {
      const active = associateNativeReadSignal(life.signal, AbortSignal.any([ownedSignal, signal]));
      check(); await ready({ signal: active, deadlineAt, check }); check();
    });
    await Promise.race([raw, cancelled]); check();
  }
  catch (error) { life.check(); native.checkRead(); throw error; }
  finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort); }
}

export function observeDiagnosticBinding<T>(observer: DiagnosticObserver, verify: (callerSignal?: AbortSignal) => Promise<T>) {
  return (callerSignal?: AbortSignal) => observer.span('consumer.verifyBinding', () => verify(callerSignal));
}

export interface NavigationDiagnosticState {
  loadPassed: boolean; readyPassed: boolean; navigationPassed: boolean; stopCount: number; failed: boolean;
}
export function createNavigationDiagnosticMode(observer: DiagnosticObserver) {
  const state: NavigationDiagnosticState = { loadPassed: false, readyPassed: false, navigationPassed: false, stopCount: 0, failed: false };
  const completed = new Error('DiagnosticNavigationComplete: native navigation and existing engine ready; no gameplay input');
  completed.name = 'DiagnosticNavigationComplete';
  let firstCause: unknown;
  let source: NativeValidationWaits | undefined;
  let expectation: ReadyExpectation | undefined;
  const stoppedReports = new WeakSet<object>();
  const fail = (error: unknown) => { if (!state.failed) { state.failed = true; firstCause = error; observer.event('diagnostic.navigation.failure', failure(error)); } return error; };
  return {
    bindNativeWaits(value: NativeValidationWaits) { assert.ok(isNativeValidationWaits(value)); assert.ok(!source || source === value); source = value; },
    source: () => source,
    configureReady(value: ReadyExpectation) { assert.ok(!expectation); expectation = value; },
    readyExpectation() { assert.ok(expectation, 'Navigation mode requires its sealed ready expectation'); return expectation; },
    snapshot: (): NavigationDiagnosticState => ({ ...state }),
    expectedReportError: () => 'Browser startup/execution: ' + completed.message,
    isIntentionalStop: (error: unknown) => error === completed && state.stopCount === 1,
    stoppedReport: (value: object) => state.stopCount === 1 && !state.failed && stoppedReports.has(value),
    observeGoto(page: { goto: (...args: any[]) => Promise<unknown>; url: () => string }, options: { origin: string; ready: () => Promise<void> }) {
      const patches = createMethodPatches(observer);
      patches.replace(page, 'goto', original => async function (this: unknown, ...args: unknown[]) {
        try {
          const response = await observer.span('page.goto', () => Reflect.apply(original, this, args)) as { ok(): boolean } | null;
          if (!response || !response.ok() || new URL(page.url()).origin !== options.origin) return response;
          state.loadPassed = true;
          await observer.span('diagnostic.ready', options.ready); state.readyPassed = true;
          return response;
        } catch (error) { throw fail(error); }
      });
      return () => { if (!patches.restore()) fail(new Error('Navigation page descriptor restoration failed')); };
    },
    run<T>(value: unknown, operation: () => Promise<T>, navigationSucceeded: () => boolean): Promise<T> {
      const clonePatches = createMethodPatches(observer), entriesPatches = createMethodPatches(observer);
      let target: unknown[] | undefined, captured = false;
      const restore = () => {
        const cloneRestored = clonePatches.restore(), entriesRestored = entriesPatches.restore(); target = undefined;
        if (!cloneRestored || !entriesRestored) fail(new Error('Navigation stop descriptor restoration failed'));
      };
      try {
        entriesPatches.replace(Array.prototype, 'entries', original => function (this: unknown, ...args: unknown[]) {
          if (!target || this !== target) return Reflect.apply(original, this, args);
          target = undefined;
          if (state.failed) throw firstCause;
          if (!state.loadPassed || !state.readyPassed || !navigationSucceeded()) throw fail(new Error('Diagnostic navigation stop gate incomplete'));
          state.navigationPassed = true; state.stopCount++;
          observer.event('diagnostic.stop', { point: 'plan.steps.entries', mode: 'navigation' });
          throw completed;
        });
        clonePatches.replace(globalThis, 'structuredClone', original => function (this: unknown, ...args: unknown[]) {
          const result = Reflect.apply(original, this, args);
          if (args[0] === value) {
            if (!Array.isArray(result?.steps)) throw fail(new Error('Diagnostic runner clone has no steps array'));
            target = result.steps; captured = true;
            if (!clonePatches.restore()) throw fail(new Error('Navigation clone descriptor restoration failed'));
          }
          return result;
        });
        const result = operation();
        void result.then(value => {
          if (state.stopCount === 1 && !state.failed && value && typeof value === 'object'
            && sameValue((value as { errors?: unknown }).errors, ['Browser startup/execution: ' + completed.message])) stoppedReports.add(value);
          restore();
        }, error => { fail(error); restore(); });
        if (!captured) { void result.catch(() => {}); throw fail(new Error('Diagnostic runner did not synchronously clone the exact plan')); }
        return result;
      } catch (error) { fail(error); restore(); throw error; }
    },
  };
}

export async function navigationReportVerified(report: PersistentAcceptanceReport | undefined, native: NativeValidationWaits | undefined,
  envelope: { diagnostics?: { reportValid?: boolean; issues?: { classification: string; checkId: string }[]; passedChecks?: unknown[] };
    nativeWaits?: { contractVersion: string; consumerStartedAt: number; consumerEndedAt: number; consumerElapsedMs: number } } | undefined,
  proof?: { mode: ReturnType<typeof createNavigationDiagnosticMode>; evidenceRoot: string; series: PersistentAcceptanceSeries }): Promise<boolean> {
  if (!report || !native || !isNativeValidationWaits(native) || !proof || proof.mode.source() !== native
    || envelope?.diagnostics?.reportValid !== false || !envelope.nativeWaits
    || !sameValue(envelope.diagnostics.passedChecks, []) || envelope.diagnostics.issues?.length !== 1
    || envelope.diagnostics.issues[0].classification !== 'insufficient_evidence' || envelope.diagnostics.issues[0].checkId !== 'persistent/report') return false;
  const expired = new Error('Diagnostic raw proof deadline reached');
  const check = () => { native.checkRead(); native.readSignal.throwIfAborted(); if (Date.now() >= native.workDeadlineAt) throw expired; };
  check();
  try {
    const value = report.nativeWaits, consumer = envelope.nativeWaits;
    if (!value || value.contractVersion !== native.contractVersion || value.caseId !== native.caseId || value.windowId !== native.windowId
      || value.taskId !== native.taskId || value.deadlineAt !== native.deadlineAt || value.workDeadlineAt !== native.workDeadlineAt
      || consumer.contractVersion !== native.contractVersion || consumer.consumerStartedAt !== value.consumerStartedAt
      || !Number.isSafeInteger(consumer.consumerEndedAt) || consumer.consumerEndedAt < value.seriesEndedAt
      || !Number.isFinite(consumer.consumerElapsedMs) || Math.abs(consumer.consumerElapsedMs - (consumer.consumerEndedAt - consumer.consumerStartedAt)) > 5
      || value.seriesStartedAt !== Date.parse(report.startedAt) || value.seriesEndedAt !== Date.parse(report.endedAt)
      || !Number.isFinite(value.seriesElapsedMs) || Math.abs(value.seriesElapsedMs - (value.seriesEndedAt - value.seriesStartedAt)) > 5
      || value.segments.length !== 1 || report.segments.length !== 1 || value.rawReads.pending !== 0 || value.rawReads.started !== value.rawReads.settled) return false;
    const segment = value.segments[0], actual = report.segments[0].report.nativeWaits;
    if (!(actual && actual.contractVersion === native.contractVersion && actual.deadlineAt === native.deadlineAt
      && actual.workDeadlineAt === native.workDeadlineAt && sameValue(segment, actual.segment) && segment.state === 'closed'
      && !segment.firstCause && !segment.rawReadsPending && !segment.rawOperationsPending && !segment.http.pending
      && segment.http.started > 0 && segment.http.started === segment.http.settled && segment.http.rejected === 0
      && segment.stages.every(stage => stage.outcome === 'passed' && !stage.rawPending)
      && segment.http.stages.every(stage => stage.count === segment.http.started))) return false;
    const source = native.snapshot();
    assert.ok(sameValue(value.segments, source.segments) && source.rawReads.pending === 0, 'Native source snapshot changed or still pending');
    assert.ok(!validatePersistentSeries(proof.series).length && sameValue(report.series, proof.series));
    assert.ok(report.formatVersion === '1.0.0' && report.kind === 'persistent_profile_process_reopen'
      && report.capability === PERSISTENT_PROFILE_CAPABILITY && report.deadlineAt === native.deadlineAt && report.outcome === 'failed');
    const first = proof.series.segments[0], row = report.segments[0].report, stop = proof.mode.expectedReportError();
    assert.ok(proof.mode.stoppedReport(row) && report.segments[0].id === first.id && sameValue(row.plan, first.plan));
    assert.ok(report.errors.length === 1 && sameValue(report.failureFacts, { formatVersion: 1, errors: [
      { errorIndex: 0, error: report.errors[0], phase: 'segment_report', kind: 'segment_failed', segmentId: first.id }] }));
    assert.ok(sameValue(row.errors, [stop]) && sameValue(row.failureFacts, { formatVersion: 1, termination: null,
      errors: [{ errorIndex: 0, error: stop, kind: 'lifecycle' }] }));
    assert.ok(row.formatVersion === '1.0.0' && row.kind === 'normal_browser_input' && row.outcome === 'failed'
      && row.browser.name === 'chromium' && row.browser.version && sameValue(row.browser.viewport, first.plan.viewport));
    assert.ok(sameValue(row.steps, first.plan.steps.map(step => ({ id: step.id, kind: step.kind,
      ...('acceptanceId' in step ? { acceptanceId: step.acceptanceId } : {}), outcome: 'skipped',
      expected: 'expected' in step ? step.expected : 'input delivered', actual: null, error: null, screenshot: null }))));
    const identity = row.session;
    assert.ok(identity && Number.isSafeInteger(identity.browserPid) && identity.browserPid > 0
      && row.cleanup.browserPid === identity.browserPid && row.cleanup.forced === false && row.cleanup.processExited === true
      && identity.closeEvent && identity.exitConfirmed && (identity.exitCode !== null || identity.signalCode !== null)
      && isAbsolute(identity.profile) && resolve(identity.profile) === identity.profile && dirname(identity.profile) === report.profileRoot
      && identity.commandLineProfile === identity.profile && identity.origin === new URL(first.plan.url).origin
      && sameValue(identity.cdp?.browserProcessIds, [identity.browserPid])
      && sameValue(identity.cdp?.profileArguments, ['--user-data-dir=' + identity.profile]));
    assert.ok(sameValue(report.checkpoint, { outcome: 'skipped', expected: proof.series.checkpoint.expected,
      actual: null, savedActual: null, before: null, after: null }));
    const folder = [first.plan.projectId, first.plan.artifact.artifactId, first.plan.artifact.version, first.plan.runId].join('/');
    assert.equal(report.reportPath, folder + '/' + proof.series.reportId + '/report.json');
    assert.equal(row.reportPath, folder + '/' + first.plan.reportId + '/report.json');
    assert.ok(value.seriesStartedAt <= Date.parse(row.startedAt) && Date.parse(row.startedAt) <= Date.parse(row.endedAt)
      && Date.parse(row.endedAt) <= value.seriesEndedAt && value.seriesEndedAt < native.workDeadlineAt);
    await runNativeValidationRead(native.readSignal, async active => {
      const read = diagnosticReadCheckpoint('navigation', active), prefix = folder + '/' + first.plan.reportId + '/';
      assert.ok(new Set(row.files).size === row.files.length && row.files.includes(row.reportPath) && row.files.every(file => file.startsWith(prefix)));
      for (const extension of ['.png', '.webm', '.log']) assert.ok(row.files.some(file => file.endsWith(extension)));
      for (const file of row.files) { check(); assert.ok((await read(() => regularFile(proof.evidenceRoot, file, active))).length > 0); }
      assert.ok(sameValue(decode(await read(() => regularFile(proof.evidenceRoot, row.reportPath, active))), row));
      assert.ok(sameValue(decode(await read(() => regularFile(proof.evidenceRoot, report.reportPath, active))), report)); check();
    });
    check(); assert.equal(native.snapshot().rawReads.pending, 0); return true;
  } catch (error) { check(); if (error instanceof assert.AssertionError) return false; throw error; }
}

export function observeNavigationDiagnosticLifecycle(lifecycle: OwnedAcceptanceLifecycle, mode: ReturnType<typeof createNavigationDiagnosticMode>,
  observer: DiagnosticObserver, expected: ReadyExpectation, requireIdentity = true) {
  const native = lifecycle.nativeValidationWaits, segment = lifecycle.nativeSegmentWaits;
  assert.ok(native && segment && native === mode.source(), 'Diagnostic lifecycle must retain the source-owned native waits');
  let navigationLife: NativeReadLifetime | undefined;
  const patches = createMethodPatches(observer), pageRestores: (() => void)[] = [];
  const delegated = { ...segment, runStage<T>(stage: Parameters<typeof segment.runStage>[0], operation: (life: NativeReadLifetime) => Promise<T>) {
    return segment.runStage(stage, life => { if (stage === 'navigation') navigationLife = life; return operation(life); });
  } };
  const view: OwnedAcceptanceLifecycle = { ...lifecycle, nativeValidationWaits: native, nativeSegmentWaits: delegated,
    identity: () => lifecycle.identity(), process: () => lifecycle.process(),
    async open(...args) {
      observer.event('lifecycle.open.arguments', { timeoutMs: args[1], deadlineAt: args[2]?.deadlineAt }); observer.phase('open.started');
      const result = await observer.span('lifecycle.open', () => lifecycle.open(...args)); observer.phase('open.returned');
      const identity = lifecycle.identity();
      if (requireIdentity) {
        assert.ok(identity); assert.deepEqual(identity.cdp?.browserProcessIds, [identity.browserPid]);
        assert.deepEqual(identity.cdp?.profileArguments, ['--user-data-dir=' + identity.profile]); assert.equal(identity.commandLineProfile, identity.profile);
        observer.event('lifecycle.identity', { browserPid: identity.browserPid, profile: identity.profile, commandLineProfile: identity.commandLineProfile,
          origin: identity.origin, cdpBrowserPid: identity.cdp?.browserProcessIds[0] ?? null });
      }
      patches.replace(result.context, 'newPage', original => async function (this: unknown, ...pageArgs: unknown[]) {
        const page = await Reflect.apply(original, this, pageArgs);
        pageRestores.push(mode.observeGoto(page, { origin: identity?.origin ?? new URL(page.url()).origin,
          ready: () => { assert.ok(navigationLife); return runNavigationDiagnosticReady(navigationLife, native,
            active => readNavigationDiagnosticReady(page, expected, active)); } }));
        return page;
      });
      return result;
    },
    close(...args) { observer.phase('close.started'); return observer.span('lifecycle.close', () => lifecycle.close(...args)); },
  };
  return { lifecycle: view, navigationSucceeded: () => {
    const snapshot = segment.snapshot(); return snapshot.state === 'input' && snapshot.stages[3].outcome === 'passed' && !snapshot.firstCause;
  }, restore() { for (const restore of pageRestores) restore(); patches.restore(); } };
}

export function summarizeNavigationDiagnostic(input: { state: NavigationDiagnosticState; nativeContractVerified: boolean; native?: NativeValidationWaits; normalCleanup: boolean;
  preservation: boolean; observationIncomplete: boolean; openMs: number | null; navigationMs: number | null }) {
  const timing = (measuredMs: number | null) => ({ limitMs: 15_000, measuredMs,
    withinLimit: measuredMs !== null && Number.isFinite(measuredMs) && measuredMs >= 0 ? measuredMs <= 15_000 : null });
  const validTiming = [input.openMs, input.navigationMs].every(value => value !== null && Number.isFinite(value) && value >= 0);
  const contractVersion = isNativeValidationWaits(input.native) ? input.native.contractVersion : null;
  const passed = contractVersion !== null && input.nativeContractVerified && validTiming && input.state.loadPassed && input.state.readyPassed && input.state.navigationPassed
    && input.state.stopCount === 1 && !input.state.failed && input.normalCleanup && input.preservation && !input.observationIncomplete;
  return { formatVersion: 'cos93-native-startup-diagnostic/2', navigation: { contractVersion,
    outcome: passed ? 'passed' : input.state.loadPassed ? 'failed' : 'not_reached' },
    oldLimits: { wholeOpen: timing(input.openMs), navigation: timing(input.navigationMs) } };
}

/** Only a full, explicit private-material run calls this. Ordinary tests never create this history. */
export async function diagnoseNativeStartup(options: { sourceRepository: string; historySnapshot: string; observer: DiagnosticObserver; patches?: DiagnosticPatches;
  mode?: 'navigation'; navigation?: ReturnType<typeof createNavigationDiagnosticMode> }, t: TestContext) {
  const { sourceRepository, historySnapshot } = await requireDiagnosticInputs(options.sourceRepository, options.historySnapshot);
  const observer = options.observer, protectedInputs = new ProtectedInputs(), signal = new AbortController().signal;
  const patches = options.patches ?? createMethodPatches(observer);
  const mode = options.mode, navigation = options.navigation;
  assert.equal(!!mode, !!navigation, 'Navigation mode requires its explicit shared observer');
  let progress: Awaited<ReturnType<typeof openDiagnosticProgress>> | undefined;
  const outputRoot = await mkdtemp(join(tmpdir(), mode ? 'cos93-native-startup-navigation-' : 'cos93-native-startup-'));
  await assertDiagnosticWriteRoot(outputRoot, sourceRepository);
  const repository = join(outputRoot, 'repository'), ledgerRoot = join(repository, '.cosmos/validation-shared'), root = join(repository, '.cosmos/e2e', CASE);
  const output = async (name: string, value: unknown) => { const path = await safePath(outputRoot, name); await writeFile(path, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' }); return path; };
  const git = async (cwd: string, ...args: string[]) => {
    const result = await runChild('git', ['--no-optional-locks', ...args], { cwd, signal, timeoutMs: 60000 });
    assert.equal(result.code, 0, `Diagnostic Git ${args[0]} failed: ${result.stderr}`); return result.stdout.trim();
  };
  let controller: RunController | undefined, work: OwnedWork | undefined, host: Awaited<ReturnType<typeof createTransferReusedConsumerHost>> | undefined;
  let report: PersistentAcceptanceReport | undefined, error: ReturnType<typeof failure> | undefined, phase = 'preparation';
  let navigationEnvelope: Parameters<typeof navigationReportVerified>[2], navigationProof = false;
  let navigationProofError: ReturnType<typeof failure> | undefined;
  let hostEvidence: EvidenceContract[] | undefined;
  let before: ReturnType<typeof counts> | undefined, preparedCounts: ReturnType<typeof counts> | undefined, baselineBytes = 0, preparedBytes = 0;
  const cleanup = { preparationClosed: false, drained: false, controllerClosed: false, locksAbsent: false, processesExited: false,
    ports: [] as Awaited<ReturnType<typeof closedLoopbackPort>>[], profile: null as null | { path: string; retainedForDiagnosis: true; markerSha256: string; entries: string[] }, errors: [] as ReturnType<typeof failure>[] };
  const spawned: { pid: number; command: string; exit: boolean; code: number | null; signal: string | null }[] = [];
  const observedPorts = new Set<string>();
  let nativeCalls = 0, buildReused = false, sourceSummary: unknown, beforeOriginal: ReturnType<typeof counts> | undefined, literalSeries: unknown;
  const prepareStart = performance.now();
  try {
    progress = await openDiagnosticProgress(outputRoot, sourceRepository, observer); observer.phase('preparation.started');
    const historyBytes = await protectedInputs.file(historySnapshot), baseline: RunSnapshot = decode(historyBytes); validateSnapshot(baseline); baselineBytes = historyBytes.length;
    before = counts(baseline);
    assert.deepEqual([before.revision, before.cases, before.delegations, before.closures, before.audits, before.requests, before.tasks], [2966, 21, 13, 105, 19, 680, 45]);
    assert.ok(baseline.validation!.cases.every(window => window.stopReason)); assert.equal(baseline.ledger.contractVersion, '5.0.0');
    assert.equal(baseline.allocationSupplementDecisions?.length, 1);
    const originalLedger = join(sourceRepository, '.cosmos/validation-shared');
    const current: RunSnapshot = decode(await protectedInputs.file(join(originalLedger, 'snapshot.json'))); validateSnapshot(current); beforeOriginal = counts(current);
    assert.deepEqual([beforeOriginal.revision, beforeOriginal.requests, beforeOriginal.settledMicroCny, beforeOriginal.reservedMicroCny, beforeOriginal.unknown], [3114, 715, 16901000, 0, 0]);
    const declaration = deriveTransferValidationCaseFourteenDeclaration(baseline), originalWindow = current.validation!.cases.find(window => window.caseId === CASE)!;
    assert.ok(originalWindow?.stopReason); assert.deepEqual(originalWindow.quote.declaration, declaration);
    await protectedInputs.file(join(originalLedger, originalWindow.operatorDecision.source.location));
    const { sourceSha256: originalDecisionHash, ...originalDecision } = originalWindow.operatorDecision;
    assert.equal((await verifyOperatorDecision(originalLedger, originalWindow.quote, originalDecision, Date.now())).sourceSha256, originalDecisionHash);
    const oldAdmissionRef = originalWindow.operatorDecision.sourceRefs.find(ref => ref.artifactId === `${CASE}-admission`)!;
    assert.ok(oldAdmissionRef); const oldAdmissionBytes = await protectedInputs.file(join(originalLedger, oldAdmissionRef.location));
    assert.equal(sha(oldAdmissionBytes), oldAdmissionRef.version); const oldAdmission = decode(oldAdmissionBytes);
    const originalCase = join(sourceRepository, '.cosmos/e2e', CASE), oldRoot = join(sourceRepository, '.cosmos/e2e', OLD);
    const manifestRef = originalWindow.operatorDecision.sourceRefs.find(ref => ref.artifactId === `${CASE}-historical-stages`)!;
    assert.ok(manifestRef); const manifestBytes = await protectedInputs.file(join(originalLedger, manifestRef.location)), manifest = decode(manifestBytes);
    assert.equal(sha(manifestBytes), manifestRef.version); assert.equal(manifest.originalRoot, oldRoot); assert.equal(manifest.captures.length, 7);
    for (const capture of manifest.captures) {
      await protectedInputs.file(join(oldRoot, capture.ref.location.slice(0, -'/files'.length), 'capture.json'));
      await protectedInputs.tree(join(oldRoot, capture.ref.location));
    }
    for (const stage of manifest.stages) {
      for (const name of Object.keys(stage.receipts)) await protectedInputs.file(join(oldRoot, `journal/task-${stage.task.taskId}/${name}.json`));
      const refs = [...stage.task.inputs, ...stage.task.artifacts, ...stage.task.evidence.map((item: any) => item.source), ...stage.task.context.interfaces];
      for (const ref of refs) await protectedInputs.tree(join(oldRoot, ref.location));
    }
    await protectedInputs.file(join(oldRoot, 'host-transfer-prepared-inputs.json'));
    const audit = `host-transfer-design-validation/${manifest.stages[0].task.taskId}/${manifest.stages[0].task.attempts[0].attemptId}`;
    for (const name of ['raw', 'started', 'result']) await protectedInputs.file(join(oldRoot, `${audit}/check-1-${name}.json`));
    const sourceProject = join(originalCase, `registry/captures/${CASE}-game-source/v1/files`);
    const originalCandidate = current.tasks.find(task => task.taskId === declaration.grants.coding.taskId)!.artifacts[0];
    const originalDist = join(originalCase, originalCandidate.location, 'dist');
    await protectedInputs.tree(sourceProject); await protectedInputs.tree(join(originalCase, originalCandidate.location));
    const authored = await snapshot(sourceProject); assert.equal(authored.size, 10); assert.equal([...authored.values()].reduce((sum, bytes) => sum + bytes.length, 0), 35771);
    if (navigation) {
      const plan = decode(await protectedInputs.file(join(originalCase, originalCandidate.location, '_cosmos/transfer-plan.json')));
      const design = decode(await protectedInputs.file(join(oldRoot, plan.binding.design.artifact.location, '_cosmos/transfer-design.json')));
      const media = decode(await protectedInputs.file(join(originalCase, originalCandidate.location, 'public/assets/manifest.json')));
      const world = authored.get('src/world.ts'); assert.ok(world);
      navigation.configureReady(deriveNavigationReadyExpectation(new TextDecoder('utf-8', { fatal: true }).decode(world), design, media));
    }
    const head = await git(platform, 'rev-parse', 'HEAD'); assert.equal(await git(platform, 'status', '--porcelain'), '', 'Commit reviewed diagnostic code before real material execution');
    await git(outputRoot, 'clone', '--local', '--no-hardlinks', '--no-checkout', platform, repository);
    await git(repository, 'checkout', '-B', 'main', head); await git(repository, 'update-ref', 'refs/remotes/origin/main', head);
    await mkdir(ledgerRoot, { recursive: true }); await mkdir(root, { recursive: true });
    await writeFile(join(ledgerRoot, 'snapshot.json'), historyBytes, { flag: 'wx' });
    const sourceLocations = new Set([...baseline.validation!.cases.map(window => window.operatorDecision.source.location),
      ...baseline.allocationClosureDecisions!.map(receipt => receipt.operatorDecision.source.location),
      ...baseline.allocationSupplementDecisions!.map(receipt => receipt.operatorDecision.source.location)]);
    for (const location of sourceLocations) { const bytes = await protectedInputs.file(join(originalLedger, location)), target = await safePath(ledgerRoot, location); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: 'wx' }); }
    await writeFile(await safePath(ledgerRoot, manifestRef.location), manifestBytes, { flag: 'wx' });
    await requireTransferCaseFourteenAccountingSources(ledgerRoot, baseline, signal); await verifyValidationBudgetSources(ledgerRoot, baseline);
    const execution = await captureTransferCaseFourteenSource(signal);
    for (const file of [...execution.files, execution.platformLock, ...execution.dependencies.flatMap(item => [{ path: item.entry }, { path: item.path }, ...item.files])]) await protectedInputs.file(file.path);
    sourceSummary = { head, executionSha256: execution.sha256, executionFiles: execution.files.length,
      dependencies: execution.dependencies.map(item => ({ name: item.name, version: item.version, files: item.files.length })), node: process.version,
      instrumentation: 'Plain runner module seam, non-recording method timing, bounded scalar trace and stage progress; original production calls and guards remain active' };
    const toolchain = join(root, 'toolchain'); await mkdir(toolchain);
    for (const file of declaration.inputs.template.files) {
      const name = file.path.slice('templates/2d/'.length), bytes = await protectedInputs.file(join(platform, file.path)), target = await safePath(toolchain, name);
      await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: 'wx' });
    }
    // Copy only the actual executable closure and licenses used by unchanged production checks.
    const copyTool = async (source: string, target: string) => { const bytes = await protectedInputs.file(source); await safePath(outputRoot, relative(outputRoot, target).split(sep).join('/')); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: 'wx' }); };
    for (const tool of execution.toolchain.tools) {
      const target = join(toolchain, 'node_modules', tool.name); await copyTool(tool.path, join(target, 'package.json'));
      for (const file of tool.files) await copyTool(join(dirname(tool.path), file.relative), join(target, file.relative));
    }
    for (const name of ['phaser', 'eventemitter3']) {
      const source = await realpath(join(platform, 'templates/2d/node_modules', name)), target = join(toolchain, 'node_modules', name);
      await copyTool(join(source, 'package.json'), join(target, 'package.json'));
      for (const name of (await readdir(source)).filter(file => /^licen[sc]e(?:\.[a-z]+)?$/i.test(file))) await copyTool(join(source, name), join(target, name));
      if (name === 'phaser') for (const file of ['src/geom/polygon/Earcut.js', 'src/geom/polygon/Simplify.js', 'src/physics/matter-js/lib/license.js', 'src/polyfills/AudioContextMonkeyPatch.js']) await copyTool(join(source, file), join(target, file));
    }
    const historicalRaw = createHistoricalPassedStages({ originalRoot: oldRoot, targetRoot: root,
      expected: { caseId: manifest.caseId, windowId: manifest.windowId, reviewedPlatformSha: manifest.reviewedPlatformSha, frozenCaseInputHash: manifest.frozenCaseInputHash,
        designTaskId: manifest.stages[0].task.taskId, artTaskId: manifest.stages[1].task.taskId }, manifestRef,
      readManifest: async readSignal => { readSignal.throwIfAborted(); return diagnosticReadCheckpoint(mode, readSignal)(() => regularFile(ledgerRoot, manifestRef.location, mode ? readSignal : undefined)); } });
    const historical = { ...historicalRaw, verify: (readSignal: AbortSignal) => observer.span('history.verify', () => historicalRaw.verify(readSignal)) };
    const fixed = fixedTransferValidationInput(declaration), frozen = await fixed.readTransferValidationInput(repository);
    const readIdentity = fixed.createTransferValidationIdentityReader({ repository, reviewedPlatformSha: head });
    const sourceIdentity = async (readSignal: AbortSignal) => {
      const read = diagnosticReadCheckpoint(mode, readSignal);
      await read(() => observer.span('identity.source', () => requireTransferCaseFourteenSource(execution, readSignal)));
      await read(() => observer.span('identity.template', () => requireTransferCaseFourteenTemplate(execution, repository, readSignal)));
      await read(() => observer.span('identity.accounting', () => requireTransferCaseFourteenAccountingSources(ledgerRoot, baseline, readSignal)));
      return read(() => observer.span('identity.git-fixed-input', () => readIdentity(readSignal)));
    };
    const context = { root: ledgerRoot, repositoryRoot: repository, identityReader: sourceIdentity };
    await writeProtectedBefore(outputRoot, sourceRepository, { formatVersion: 'cos93-protected-before/1', recordedAt: new Date().toISOString(),
      sourceRepository, historySnapshot, sourceSummary, before, original: beforeOriginal, ...protectedInputs.manifest() });
    observer.phase('protected.before.published'); await progress.flush();
    const quote = await prepareValidationCase({ ...context, declaration });
    const mapping = decode(await regularFile(repository, 'docs/specs/github-issues.json')), approvals = oldAdmission.sourceApprovals;
    assert.ok(Array.isArray(approvals) && approvals.length > 0);
    for (const approved of approvals) {
      const rows = mapping.tasks.filter((item: any) => item.taskId === approved.taskId); assert.equal(rows.length, 1);
      assert.deepEqual({ taskId: rows[0].taskId, reviewedCommit: rows[0].reviewedCommit, mergeCommit: rows[0].mergeCommit }, approved);
    }
    for (const ancestor of new Set([...baseline.validation!.cases.map(window => window.quote.identity.reviewedPlatformSha),
      ...approvals.flatMap((item: any) => [item.reviewedCommit, item.mergeCommit])])) await git(repository, 'merge-base', '--is-ancestor', ancestor as string, head);
    const admission = createTransferCaseFourteenAdmissionQuote(quote, manifestRef, approvals, execution, transferCaseFourteenHistoricalAccountingHash(baseline, quote));
    const admissionBytes = Buffer.from(JSON.stringify(admission, null, 2) + '\n'), admissionRef = { artifactId: `${CASE}-admission`, version: sha(admissionBytes), location: `${CASE}-admission-${admission.admissionId}.json` };
    await writeFile(join(ledgerRoot, admissionRef.location), admissionBytes, { flag: 'wx' });
    const key = `COS93-fixture-${randomUUID()}`, decision = { kind: 'operator_validation' as const, decisionId: key, actorId: 'COS93-offline-fixture', decidedAt: new Date().toISOString(),
      source: { artifactId: key, version: 'synthetic-only', location: `${key}.json` }, sourceRefs: [manifestRef, admissionRef] };
    await publishReceipt(join(ledgerRoot, decision.source.location), { formatVersion: 'operator-validation-decision-1', ...decision, source: undefined, quote });
    const window = await RunController.claimValidationCase({ ...context, quote, decision });
    const verifyAdmission = async (readSignal?: AbortSignal) => {
      assert.deepEqual(await diagnosticReadCheckpoint(mode, readSignal)(() => regularFile(ledgerRoot, admissionRef.location, mode ? readSignal : undefined)), admissionBytes, 'Current admission changed');
    };
    const scopeIdentity = async (readSignal: AbortSignal) => { const read = diagnosticReadCheckpoint(mode, readSignal);
      const identity = await read(() => sourceIdentity(readSignal)); await read(() => historical.verify(readSignal));
      await read(() => verifyAdmission(mode ? readSignal : undefined)); return identity; };
    controller = await RunController.openValidationCase({ ...context, caseId: CASE, windowId: window.windowId, identityReader: scopeIdentity });
    work = new OwnedWork(controller.signal);
    const currentController = controller, currentWork = work;
    const frozenBytes = await regularFile(repository, declaration.inputs.requirements.path); await mkdir(join(root, 'requirements')); await writeFile(join(root, 'requirements/fixed.json'), frozenBytes, { flag: 'wx' });
    const sources = [{ artifactId: `${CASE}-input`, version: declaration.inputs.requirements.version, location: 'requirements/fixed.json' }];
    const requirement = createValidationRequirement({ specVersion: frozen.requirements.specVersion, sources, acceptance: frozen.requirements.preparation.acceptance,
      validation: { runId: quote.basis.runId, ledgerId: quote.basis.ledgerId, caseId: CASE, windowId: window.windowId, ...quote.identity, decision } });
    const ownSource = async (readSignal: AbortSignal) => {
      const read = diagnosticReadCheckpoint(mode, readSignal);
      readSignal.throwIfAborted(); await read(() => verifyAdmission(mode ? readSignal : undefined)); assert.ok(window.operatorDecision.sourceRefs.some(ref => sameValue(ref, admissionRef)));
      assert.deepEqual(createTransferCaseFourteenAdmissionQuote(window.quote, manifestRef, approvals, execution, admission.accountingSha256), admission);
      await read(() => observer.span('scope.source', () => requireTransferCaseFourteenSource(execution, readSignal)));
      await read(() => observer.span('scope.template', () => requireTransferCaseFourteenTemplate(execution, repository, readSignal)));
      await read(() => observer.span('scope.toolchain', () => requireTransferCaseFourteenToolchain(execution, root, readSignal)));
      const state = await read(() => currentController.read(mode ? readSignal : undefined));
      assert.equal(transferCaseFourteenHistoricalAccountingHash(state, window.quote), admission.accountingSha256);
      assert.deepEqual(deriveTransferValidationCaseFourteenDeclaration(state), declaration);
      await read(() => observer.span('scope.accounting', () => requireTransferCaseFourteenAccountingSources(ledgerRoot, state, readSignal)));
    };
    const validation: ValidationExecutionBinding = { caseId: CASE, windowId: window.windowId, historicalManifest: { reference: manifestRef, readBytes: historical.readManifest },
      readScope: readSignal => observer.span('scope.read', async () => {
        const read = diagnosticReadCheckpoint(mode, readSignal), active = mode ? readSignal : undefined;
        currentController.requireValidationCase(CASE, window.windowId); assert.equal(historical.originalRoot, oldRoot); assert.equal(historical.targetRoot, root);
        assert.ok(window.operatorDecision.sourceRefs.some(ref => sameValue(ref, manifestRef)));
        assert.equal(sha(await read(() => historical.readManifest(readSignal))), manifestRef.version);
        await read(() => historical.verify(readSignal)); await read(() => ownSource(readSignal));
        const identity = await read(() => observer.span('scope.git-fixed-input', () => readIdentity(readSignal)));
        const observed = await read(() => fixed.readTransferValidationInput(repository, active));
        assert.deepEqual(identity, window.quote.identity); assert.deepEqual(observed.manifest, frozen.manifest);
        const requirementBytes = await read(() => regularFile(root, 'requirements/fixed.json', active));
        assert.deepEqual(requirementBytes, await read(() => regularFile(repository, declaration.inputs.requirements.path, active)));
        for (const file of declaration.inputs.template.files) {
          const toolBytes = await read(() => regularFile(root, 'toolchain/' + file.path.slice('templates/2d/'.length), active));
          assert.deepEqual(toolBytes, await read(() => regularFile(repository, file.path, active)));
        }
        const { sourceSha256, source, ...currentDecision } = window.operatorDecision;
        const operatorReceipt = await read(() => regularFile(ledgerRoot, source.location, active));
        assert.equal(sha(operatorReceipt), sourceSha256); assert.deepEqual(decode(operatorReceipt), { formatVersion: 'operator-validation-decision-1', ...currentDecision, quote: window.quote });
        readSignal.throwIfAborted(); return { requirement, operatorReceipt };
      }) };
    const native = createNativeBrowserHostIO({ root, controller, work });
    const io: BrowserHostIO = { ...native,
      async build(project) { assert.ok(within(root, project)); await cp(originalDist, join(project, 'dist'), { recursive: true, errorOnExist: true, force: false }); buildReused = true;
        return { passed: true, work: project, diagnostics: 'COS93 synthetic fixture: sealed original dist reused; no compiler or game generation executed.' }; },
      async playPersistent(series, input, authority) {
        return observer.span('nativeIO.playPersistent', async () => {
          nativeCalls++; assert.equal(nativeCalls, 1, 'Only one actual startup sample is allowed'); assert.equal(series.segments.length, 8);
          assert.equal(series.segments.reduce((sum, segment) => sum + segment.plan.steps.length, 0), 220);
          literalSeries = structuredClone(series); observer.event('measurement.start', { preparationMs: performance.now() - prepareStart }); phase = 'nativeIO'; observer.phase('nativeIO.started');
          if (navigation) { assert.ok(input.nativeValidationWaits); navigation.bindNativeWaits(input.nativeValidationWaits); }
          const verifyBinding = navigation ? observeDiagnosticBinding(observer, input.verifyBinding) : () => observer.span('consumer.verifyBinding', input.verifyBinding);
          report = await native.playPersistent!(series, { ...input, verifyBinding }, authority);
          assert.deepEqual(series, literalSeries); return report;
        });
      } };
    host = await createTransferReusedConsumerHost({ root, controller, work, requirement, proposal: frozen.requirements.preparation, validation, historicalStages: historical, resume: false, io,
      sessionFactory: async () => { throw new Error('COS93 must never create a model session'); } });
    const prepared = (await prepareTransferValidationCaseFourteenExecution({ state: await controller.read(), window, requirement, host,
      historical: await historical.verify(work.signal), root, manifestRef, capability: host.capability, signal: work.signal }, false)).tasks[0];
    await host.bindPreparedTasks([prepared]); await controller.registerTasks([prepared.task]);
    const journal = await TaskJournal.open({ artifactRoot: root, journalRoot: join(root, 'journal') }, { formatVersion: 3, validationCase: validationJournalBinding(window),
      runId: baseline.run.runId, ledgerId: baseline.ledger.ledgerId, originalStartedAt: baseline.run.originalStartedAt, originalDeadlineAt: baseline.run.originalDeadlineAt,
      limitMicroCny: baseline.ledger.limitMicroCny, requirement, prepared, reviewProtocolCorrections: 1, artifactRoot: root, sessionRoot: join(root, 'sessions') }, false);
    const task = structuredClone(prepared.task); task.state = 'ready'; await controller.saveTask(task, { role: 'system', actorId: 'COS93-fixture' });
    await host.preAuthor!(task, work.signal); task.state = 'running'; const attemptId = randomUUID();
    task.attempts = [{ attemptId, sessionRef: join(root, 'sessions', attemptId), startedAt: new Date().toISOString(), endedAt: null, outcome: 'running', failure: null }];
    await controller.saveTask(task, { role: 'system', actorId: 'COS93-fixture' });
    for (const [name, bytes] of authored) { const target = await safePath(prepared.workspace, 'authors/coding/' + name); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: 'wx' }); }
    const requests = current.requests.filter(item => item.validation?.caseId === CASE); assert.equal(requests.length, 35);
    await publishReceipt(join(ledgerRoot, 'COS93-accounting-only-no-provider.json'), { formatVersion: 'cos93-synthetic-accounting/1', providerCalls: 0,
      explanation: 'The following amounts reproduce sealed C14 accounting workload in this TEMP fixture; they are not new charges.',
      originalSnapshotSha256: protectedInputs.files.get(join(originalLedger, 'snapshot.json'))?.sha256,
      rows: requests.map((request, index) => ({ requestId: `${key}-${index}`, originalRequestId: request.requestId,
        settledMicroCny: current.ledger.entries.find(entry => entry.requestId === request.requestId)!.settledMicroCny })) });
    for (const [index, request] of requests.entries()) {
      const entry = current.ledger.entries.find(entry => entry.requestId === request.requestId)!; assert.equal(entry.status, 'settled'); assert.ok(request.admittedAt);
      const validation = { ...request.validation!, windowId: window.windowId }, requestId = `${key}-${index}`;
      const estimatedMaxCostMicroCny = Math.max(entry.settledMicroCny, (validation.hasImages ? 1000000 : validation.inputBytes) * 2 + validation.maxOutputTokens * 8);
      await controller.reserve({ requestId, taskId: task.taskId, provider: entry.provider, pricingVersion: entry.pricingVersion, estimatedMaxCostMicroCny, validation });
      await controller.admit(requestId); await controller.settle(requestId, entry.settledMicroCny, [{ artifactId: requestId, version: 'synthetic-accounting', location: 'COS93-accounting-only-no-provider.json' }]);
    }
    const proposal = { summary: 'COS93 copied sealed C14 candidate bytes as synthetic fixture input; no generation', remaining: [], uncertainty: [] };
    await journal.write('author', attemptId, { proposal, signature: await journal.signature(task.inputs) });
    await journal.write('capture-started', attemptId, { startedAt: new Date().toISOString() });
    const captured = await host.capture(task, proposal, work.signal); await journal.write('capture', attemptId, { captured, signature: await journal.signature(captured.artifacts) });
    task.artifacts = captured.artifacts; await controller.saveTask(task, { role: 'system', actorId: 'COS93-fixture' });
    preparedCounts = counts(await controller.read()); preparedBytes = (await readFile(join(ledgerRoot, 'snapshot.json'))).length;
    assert.deepEqual([preparedCounts.cases, preparedCounts.delegations, preparedCounts.closures, preparedCounts.audits, preparedCounts.requests, preparedCounts.tasks], [22, 14, 105, 19, 715, 46]);
    assert.deepEqual([preparedCounts.settledMicroCny, preparedCounts.reservedMicroCny, preparedCounts.unknown], [16901000, 0, 0]);
    await output('prepared.json', { kind: 'synthetic-accounting-and-candidate-only', sourceSummary, before, preparedCounts, baselineBytes, preparedBytes,
      original: beforeOriginal, oldRoot, currentRoot: root, ledgerRoot, sourceProject, originalDist, manifestRef, admissionRef, windowId: window.windowId,
      limitation: 'Original historical roots remain read-only; fixture composes production guards and does not execute the fixed CLI entry.' });
    observer.phase('prepared'); await progress.flush();
    // Observe the real queues and persistence. No callback becomes an authorization substitute.
    const initialOwner = decode(await readFile(join(ledgerRoot, '.controller.lock')));
    observer.event('owner.acquired', { root: ledgerRoot, name: '.controller.lock', untrackedWriters: initialOwner.untrackedWriters });
    patches.replace(OwnerLock, 'acquire', original => async function (this: unknown, ...args: Parameters<typeof OwnerLock.acquire>) {
      const owner = await Reflect.apply(original, this, args), actual = decode(await readFile(join(args[0], args[1])));
      observer.event('owner.acquired', { root: args[0], name: args[1], untrackedWriters: actual.untrackedWriters }); return owner;
    });
    for (const [prototype, name] of [[RunController.prototype, 'controller'], [OwnerLock.prototype, 'owner']] as const) {
      patches.replace(prototype, 'serial', original => function (this: unknown, action: (...args: unknown[]) => Promise<unknown>) {
        return observer.span(`${name}.queue`, () => Reflect.apply(original, this, [function (this: unknown, ...args: unknown[]) {
          return observer.span(`${name}.execute`, () => Reflect.apply(action, this, args));
        }]));
      });
    }
    for (const name of ['prepareOwnedChild', 'registerOwnedChild', 'releaseUnspawnedChild'] as const) {
      patches.replace(currentController, name, original => function (this: unknown, ...args: any[]) {
        const taskId = name === 'prepareOwnedChild' ? args[0]?.taskId ?? null : null, windowId = name === 'prepareOwnedChild' ? args[0]?.windowId ?? null : null;
        const pid = name === 'registerOwnedChild' ? args[0] : null, ticket = name === 'registerOwnedChild' ? args[1] : name === 'releaseUnspawnedChild' ? args[0] : null;
        const result: Promise<unknown> = observer.span(`controller.${name}`, () => Reflect.apply(original, this, args));
        void result.then(value => observer.event(`controller.${name}.done`, { taskId, windowId, pid, ticket: typeof value === 'string' ? value : ticket }), () => {});
        return result;
      });
    }
    patches.replace(OwnerLock.prototype, 'save', original => function (this: unknown, record: any) {
      const result: Promise<unknown> = observer.span('owner.persist', () => Reflect.apply(original, this, [record]));
      void result.then(() => {
        try { observer.event('owner.record', { untrackedWriters: record.untrackedWriters, childCount: record.children.length });
          for (const child of record.children) observer.event('owner.child', { ticket: child.ticket, pid: child.pid }); }
        catch (error) { observer.fail('owner_metadata', error); }
      }, () => {}); return result;
    });
    patches.replace(childProcess, 'spawn', original => function (this: unknown, ...args: Parameters<typeof childProcess.spawn>) {
      const started = performance.now(), child: ReturnType<typeof childProcess.spawn> = Reflect.apply(original, this, args);
      observer.event('os.spawn', { command: args[0], pid: child.pid ?? null, callMs: performance.now() - started });
      if (child.pid) { const record = { pid: child.pid, command: args[0], exit: false, code: null as number | null, signal: null as string | null }; spawned.push(record);
        child.once('close', (code, signal) => { Object.assign(record, { exit: true, code, signal }); observer.event('os.close', record); }); }
      return child;
    }); syncBuiltinESMExports();
    patches.replace(chromium, 'connectOverCDP', original => function (this: unknown, ...args: Parameters<typeof chromium.connectOverCDP>) { return observer.span('cdp.connect', async () => {
      if (typeof args[0] === 'string') observedPorts.add(new URL(args[0]).origin);
      const browser = await Reflect.apply(original, this, args);
      patches.replace(browser, 'newBrowserCDPSession', session => async function (this: unknown, ...args: unknown[]) { const cdp = await Reflect.apply(session, this, args);
        patches.replace(cdp, 'send', send => function (this: unknown, method: string, ...params: unknown[]) { return observer.span(`cdp.${method}`, () => Reflect.apply(send, this, [method, ...params])); }); return cdp; });
      return browser;
    }); });
    hostEvidence = await observer.span('host.verify', () => { observer.phase('host.verify.started'); return host!.verify(task, currentWork.signal); });
    if (navigation) try {
      const native = navigation.source(); assert.ok(native); native.checkRead(); assert.ok(Date.now() < native.workDeadlineAt);
      navigationEnvelope = decode(await runNativeValidationRead(native.readSignal, active =>
        regularFile(root, `evidence/${CASE}-coding/browser.json`, active)));
      navigationProof = await navigationReportVerified(report, native, navigationEnvelope,
        { mode: navigation, evidenceRoot: join(root, 'browser-evidence'), series: literalSeries as PersistentAcceptanceSeries });
      observer.event('diagnostic.rawProof', { verified: navigationProof });
    } catch (caught) { navigationProofError = failure(caught); throw caught; }
    phase = 'cleanup';
  } catch (caught) { error = failure(caught); observer.event('diagnostic.error', { phase, ...error }); }
  finally {
    observer.phase('cleanup.started');
    const finish = async (name: keyof typeof cleanup, action: () => Promise<unknown>) => { try { await observer.span(`cleanup.${name}`, action); (cleanup as any)[name] = true; } catch (caught) { cleanup.errors.push(failure(caught)); } };
    if (host) await finish('preparationClosed', () => host!.closePreparation());
    if (work) await finish('drained', () => work!.cancelAndDrain('COS93 diagnostic completed; synthetic fixture only'));
    if (controller) { await finish('controllerClosed', async () => { await controller!.stop('COS93 synthetic diagnostic; no game acceptance or provider'); await controller!.close(); }); }
    const locks = [join(ledgerRoot, '.controller.lock'), join(ledgerRoot, '.controller.lock.recovery'), join(root, 'registry/.commit.lock'), join(root, 'registry/.commit.lock.recovery')];
    try { cleanup.locksAbsent = (await Promise.all(locks.map(path => lstat(path).then(() => false, (e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return true; throw e; })))).every(Boolean); }
    catch (caught) { cleanup.errors.push(failure(caught)); }
    cleanup.processesExited = recordedProcessesExited(spawned);
    const urls = new Set(observedPorts);
    for (const path of [join(root, 'host-transfer-origin.json'), join(root, `evidence/${CASE}-coding/delivery-check.json`)]) {
      try { const receipt = decode(await readFile(path)); if (receipt.url) urls.add(new URL(receipt.url).origin); }
      catch (caught) { if ((caught as NodeJS.ErrnoException).code !== 'ENOENT') cleanup.errors.push(failure(caught)); }
    }
    if (report?.profileRoot) try {
      assert.ok(within(tmpdir(), report.profileRoot) && basename(report.profileRoot).startsWith('cosmos-browser-'));
      cleanup.profile = { path: report.profileRoot, retainedForDiagnosis: true, markerSha256: sha(await regularFile(report.profileRoot, '.owner')), entries: (await readdir(report.profileRoot)).sort() };
    } catch (caught) { cleanup.errors.push(failure(caught)); }
    for (const url of urls) try { cleanup.ports.push(await closedLoopbackPort(url)); } catch (caught) { cleanup.errors.push(failure(caught)); }
    patches.restore(); t.mock.restoreAll(); syncBuiltinESMExports();
    observer.phase('cleanup.finished'); await progress?.close();
  }
  const preservation = await protectedInputs.check(), trace = observer.snapshot();
  const opens = trace.spans.filter(span => span.name === 'lifecycle.open'), stops = trace.events.filter(event => event.name === 'diagnostic.stop');
  const segment = report?.segments[0]?.report, identity = segment?.session;
  const startupPassed = nativeCalls === 1 && opens.length === 1 && opens[0].outcome === 'returned' && opens[0].durationMs !== null && opens[0].durationMs <= 15000
    && stops.length === 1 && report?.outcome === 'failed' && report.segments.length === 1 && segment?.outcome === 'failed'
    && segment.cleanup.browserPid !== null && segment.cleanup.forced === false && segment.cleanup.processExited === true
    && identity?.exitConfirmed === true && identity.closeEvent === true && segment.steps.every(step => step.outcome === 'skipped')
    && sameValue(segment.errors, [diagnosticStopMessage]) && registeredBrowserBeforeCdp(trace, identity?.browserPid)
    && cleanup.preparationClosed && cleanup.drained && cleanup.controllerClosed && cleanup.locksAbsent && cleanup.processesExited
    && cleanup.ports.length >= 2 && cleanup.ports.every(port => port.closed) && preservation.unchanged && !cleanup.errors.length && !error && !trace.observation.incomplete;
  const startup = classifyDiagnosticStartup({ nativeCalls, startupPassed: !!startupPassed, hostEvidence, trace, phase, error });
  const result = { formatVersion: 'cos93-native-startup-diagnostic/1', outcome: nativeCalls === 1 && opens.length === 1 && preservation.unchanged && cleanup.errors.length === 0 && !trace.observation.incomplete ? 'diagnostic_completed' : 'diagnostic_incomplete',
    startup: { ...startup, open: opens[0] ?? null, stop: stops[0] ?? null },
    hostVerification: { returned: hostEvidence !== undefined, evidence: hostEvidence ?? null },
    phase, error: error ?? null, sourceSummary, counts: { before, prepared: preparedCounts, original: beforeOriginal },
    nativeCalls, buildReused, report: report ?? null, series: literalSeries ?? null, cleanup, spawned, preservation, outputRoot,
    observation: trace.observation, progress: progress?.status() ?? null,
    limitation: 'Synthetic fixture on existing candidate bytes; no model/provider, fixed CLI admission, gameplay, media, coding review, accepted or human pass.' };
  if (navigation) {
    const normalCleanup = nativeCalls === 1 && opens.length === 1 && opens[0].outcome === 'returned' && stops.length === 1
      && report?.outcome === 'failed' && report.segments.length === 1 && segment?.outcome === 'failed'
      && segment.cleanup.browserPid !== null && segment.cleanup.forced === false && segment.cleanup.processExited === true
      && identity?.exitConfirmed === true && identity.closeEvent === true && segment.steps.every(step => step.outcome === 'skipped')
      && sameValue(segment.errors, [navigation.expectedReportError()]) && registeredBrowserBeforeCdp(trace, identity?.browserPid)
      && cleanup.preparationClosed && cleanup.drained && cleanup.controllerClosed && cleanup.locksAbsent && cleanup.processesExited
      && cleanup.ports.length >= 2 && cleanup.ports.every(port => port.closed) && !cleanup.errors.length && !error;
    const summary = summarizeNavigationDiagnostic({ state: navigation.snapshot(), nativeContractVerified: navigationProof, native: navigation.source(),
      normalCleanup: !!normalCleanup, preservation: preservation.unchanged, observationIncomplete: trace.observation.incomplete,
      openMs: opens[0]?.durationMs ?? null, navigationMs: report?.segments[0]?.report.nativeWaits?.segment.stages[3]?.elapsedMs ?? null });
    const navigationResult = { ...result, ...summary,
      startup: { ...startup, outcome: 'failed' as const, reason: 'The original COS93 whole-open 15-second contract remains failed; navigation mode has its own result.' },
      nativeWaits: report?.nativeWaits ?? null, consumer: navigationEnvelope?.nativeWaits ?? null, envelopeError: navigationProofError ?? null,
      gameDiagnostics: navigationEnvelope?.diagnostics ?? null,
      exit: trace.spans.find(span => span.name === 'lifecycle.close') ?? null };
    await output('trace.json', trace); await output('preservation.json', preservation); await output('result.json', navigationResult);
    t.diagnostic(`COS93 raw result: ${join(outputRoot, 'result.json')}`); return navigationResult;
  }
  await output('trace.json', trace); await output('preservation.json', preservation); await output('result.json', result);
  t.diagnostic(`COS93 raw result: ${join(outputRoot, 'result.json')}`);
  return result;
}
