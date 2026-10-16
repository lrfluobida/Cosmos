import { isDeepStrictEqual } from 'node:util';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { TaskContract } from '../../../contracts/types.ts';
import type { AcceptancePlan } from '../../../acceptance/plan.ts';
import type { AcceptanceReport } from '../../../acceptance/runner.ts';
import { completedObservation, deliveredInputs } from '../../../acceptance/failure-facts.ts';
import { bounded } from '../../../acceptance/deadline.ts';
import { regularFile } from '../../../artifacts/paths.ts';
import { PERSISTENT_PROFILE_CAPABILITY, validatePersistentSeries } from '../../../acceptance/persistent.ts';
import type { PersistentAcceptanceReport, PersistentAcceptanceSeries } from '../../../acceptance/persistent.ts';
import { diagnoseBrowser } from '../../repair/browser-diagnostics.ts';
import type { Diagnostics } from '../../repair/browser-diagnostics.ts';
import { NATIVE_VALIDATION_WAIT_CONTRACT, NATIVE_SNAPSHOT_VALIDATION_WAIT_CONTRACT, type NativeValidationWaitContract } from '../../../acceptance/native-validation-waits.ts';

export interface PersistentDiagnosticExpected {
  series: PersistentAcceptanceSeries; deadlineAt: number; sourceVersion?: string; reportPath: string;
  nativeWaitContract?: NativeValidationWaitContract;
}
export interface PersistentDiagnosticOptions {
  evidenceRoot: string; verifyBinding: () => Promise<void>; signal?: AbortSignal;
}
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const only = (value: Record<string, any>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const scalar = (value: unknown) => value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value);
function check(valid: unknown): asserts valid { if (!valid) throw new Error('Incomplete persistent evidence'); }
const directory = (plan: AcceptancePlan) => [plan.projectId, plan.artifact.artifactId, plan.artifact.version, plan.runId, plan.reportId].join('/');
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const time = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const elapsed = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
// Date timestamps have millisecond precision; performance.now records the same interval at finer precision.
const nativeClockToleranceMs = 5;
const consistentElapsed = (value: unknown, start: number, end: number) => elapsed(value) && Math.abs(value - (end - start)) <= nativeClockToleranceMs;
function validNativeSegment(value: unknown, plan: AcceptancePlan, start: number, end: number, deadlineAt: number, contractVersion: NativeValidationWaitContract) {
  const snapshot = contractVersion === NATIVE_SNAPSHOT_VALIDATION_WAIT_CONTRACT, workDeadlineAt = deadlineAt - (snapshot ? 35000 : 5000);
  check(object(value) && only(value, ['contractVersion', 'deadlineAt', 'workDeadlineAt', 'segment', ...(snapshot ? ['cleanup'] : [])])
    && value.contractVersion === contractVersion && value.deadlineAt === deadlineAt && value.workDeadlineAt === workDeadlineAt);
  const segment = value.segment;
  check(object(segment) && only(segment, ['reportId', 'generation', 'state', 'stages', 'rawReadsPending', 'rawOperationsPending', 'http', 'firstCause'])
    && segment.reportId === plan.reportId && count(segment.generation) && segment.generation > 0 && segment.state === 'closed'
    && segment.rawReadsPending === 0 && segment.rawOperationsPending === 0 && segment.firstCause === null && Array.isArray(segment.stages) && segment.stages.length === 4);
  let previous = start;
  for (const [index, [stage, cap]] of (['prepare_authority', 'register_authority', 'browser_transport', 'navigation'] as const).map((stage, index) => [stage, [60000, 60000, 15000, 300000][index]] as const).entries()) {
    const row = segment.stages[index];
    check(object(row) && only(row, ['stage', 'capMs', 'startedAt', 'deadlineAt', 'endedAt', 'elapsedMs', 'outcome', 'rawPending'])
      && row.stage === stage && row.capMs === cap && row.outcome === 'passed' && row.rawPending === false
      && time(row.startedAt) && time(row.deadlineAt) && time(row.endedAt) && elapsed(row.elapsedMs)
      && previous <= row.startedAt && row.startedAt <= row.endedAt && row.endedAt < row.deadlineAt && row.endedAt <= end
      && row.deadlineAt === Math.min(workDeadlineAt, row.startedAt + cap)
      && consistentElapsed(row.elapsedMs, row.startedAt, row.endedAt) && row.elapsedMs <= cap + nativeClockToleranceMs);
    previous = row.endedAt;
  }
  const http = segment.http;
  check(object(http) && only(http, ['started', 'settled', 'rejected', 'pending', 'stages']) && count(http.started) && count(http.settled)
    && http.started === http.settled && http.rejected === 0 && http.pending === 0 && Array.isArray(http.stages) && http.stages.length === 3);
  for (const [index, stage] of ['http_pre_authority', 'http_body', 'http_post_authority'].entries()) {
    const row = http.stages[index]; check(object(row) && only(row, ['stage', 'capMs', 'count', 'totalMs', 'maxMs']) && row.stage === stage
      && row.capMs === (contractVersion === NATIVE_SNAPSHOT_VALIDATION_WAIT_CONTRACT ? [5000, 15000, 5000] : [60000, 15000, 60000])[index]
      && row.count === http.started && elapsed(row.totalMs) && elapsed(row.maxMs)
      && row.maxMs <= row.totalMs && row.maxMs <= Math.min(row.capMs, end - segment.stages[3].startedAt) + nativeClockToleranceMs
      && (row.count > 0 ? row.totalMs / row.count <= row.maxMs + 1e-6 : row.totalMs === 0 && row.maxMs === 0));
  }
  return segment;
}
export function validNativeCleanup(report: AcceptanceReport, deadlineAt: number) {
  const cleanup = report.nativeWaits?.cleanup;
  check(object(cleanup) && only(cleanup, ['startedAt', 'endedAt', 'deadlineAt', 'gracefulDeadlineAt', 'rawPending', 'steps'])
    && time(cleanup.startedAt) && time(cleanup.endedAt) && cleanup.startedAt >= report.nativeWaits!.segment.stages[3].endedAt!
    && cleanup.startedAt <= cleanup.endedAt && cleanup.endedAt <= Date.parse(report.endedAt)
    && cleanup.deadlineAt === Math.min(deadlineAt - 5000, cleanup.startedAt + 30000)
    && cleanup.gracefulDeadlineAt === cleanup.deadlineAt - 5000 && cleanup.endedAt <= cleanup.deadlineAt
    && cleanup.rawPending === 0 && report.cleanup.forced === false && report.cleanup.processExited === true
    && Array.isArray(cleanup.steps) && cleanup.steps.length === 7);
  let previous = cleanup.startedAt;
  for (const [index, step] of ['final_screenshot', 'video_stop', 'lifecycle_close', 'video_save', 'client_close', 'force', 'raw_settle'].entries()) {
    const row = cleanup.steps[index];
    check(object(row) && only(row, ['step', 'startedAt', 'endedAt', 'outcome', 'rawPending']) && row.step === step && row.rawPending === false);
    if (step === 'force' || step === 'video_save' && row.outcome === 'skipped') {
      check(row.outcome === 'skipped' && row.startedAt === null && row.endedAt === null); continue;
    }
    check(row.outcome === 'passed' && time(row.startedAt) && time(row.endedAt) && previous <= row.startedAt && row.startedAt <= row.endedAt
      && row.endedAt <= cleanup.endedAt && row.endedAt <= (step === 'raw_settle' ? cleanup.deadlineAt : cleanup.gracefulDeadlineAt)
      && (step !== 'final_screenshot' || row.endedAt - row.startedAt <= 5000));
    previous = row.endedAt;
  }
}
function validNativeAggregate(report: PersistentAcceptanceReport, task: TaskContract, expected: PersistentDiagnosticExpected, start: number, end: number) {
  check((expected.nativeWaitContract === NATIVE_VALIDATION_WAIT_CONTRACT || expected.nativeWaitContract === NATIVE_SNAPSHOT_VALIDATION_WAIT_CONTRACT)
    && report.series.formatVersion === 'persistent-acceptance/1');
  const value = report.nativeWaits;
  check(object(value) && only(value, ['contractVersion', 'deadlineAt', 'workDeadlineAt', 'consumerStartedAt', 'rawReads', 'segments', 'caseId', 'windowId', 'taskId', 'seriesStartedAt', 'seriesEndedAt', 'seriesElapsedMs'])
    && value.contractVersion === expected.nativeWaitContract && value.deadlineAt === expected.deadlineAt
    && value.workDeadlineAt === expected.deadlineAt - (expected.nativeWaitContract === NATIVE_SNAPSHOT_VALIDATION_WAIT_CONTRACT ? 35000 : 5000)
    && value.taskId === task.taskId && [value.caseId, value.windowId].every(id => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(id))
    && time(value.consumerStartedAt) && value.consumerStartedAt <= start && value.seriesStartedAt === start && value.seriesEndedAt === end
    && consistentElapsed(value.seriesElapsedMs, start, end)
    && object(value.rawReads) && only(value.rawReads, ['started', 'settled', 'pending']) && count(value.rawReads.started)
    && value.rawReads.started === value.rawReads.settled && value.rawReads.pending === 0 && Array.isArray(value.segments) && value.segments.length === report.segments.length);
  for (const [index, row] of report.segments.entries()) {
    const segment = validNativeSegment(row.report.nativeWaits, row.report.plan, Date.parse(row.report.startedAt), Date.parse(row.report.endedAt), expected.deadlineAt, expected.nativeWaitContract);
    check(segment.generation === index + 1 && isDeepStrictEqual(segment, value.segments[index]));
    if (expected.nativeWaitContract === NATIVE_SNAPSHOT_VALIDATION_WAIT_CONTRACT) validNativeCleanup(row.report, expected.deadlineAt);
  }
}

function validFacts(report: PersistentAcceptanceReport) {
  const facts = report.failureFacts;
  check(object(facts) && only(facts, ['formatVersion', 'errors']) && facts.formatVersion === 1 && Array.isArray(facts.errors)
    && facts.errors.length === report.errors.length);
  const kinds: Record<string, string[]> = {
    private_profile: ['private_profile'], guard: ['private_profile', 'cancelled', 'deadline', 'binding'], execute: ['unknown'],
    segment_report: ['invalid_segment', 'owned_exit', 'segment_failed'], evidence: ['evidence'], checkpoint: ['checkpoint'],
    final_publication: ['private_profile', 'cancelled', 'deadline', 'binding', 'publication'],
  };
  for (const [index, fact] of facts.errors.entries()) check(object(fact) && only(fact, ['errorIndex', 'error', 'phase', 'kind', 'segmentId'])
    && fact.errorIndex === index && fact.error === report.errors[index] && kinds[fact.phase]?.includes(fact.kind)
    && (fact.segmentId === undefined || report.series.segments.some(segment => segment.id === fact.segmentId)));
  if (report.outcome === 'passed') check(!facts.errors.length);
  else {
    const fact = facts.errors[0], last = report.segments.at(-1);
    check(facts.errors.length === 1 && fact.phase === 'segment_report' && fact.kind === 'segment_failed'
      && last && fact.segmentId === last.id && last.report.outcome === 'failed');
  }
}

function validBrowserFacts(report: AcceptanceReport, plan: AcceptancePlan) {
  const facts = report.failureFacts;
  check(object(facts) && only(facts, ['formatVersion', 'termination', 'errors']) && facts.formatVersion === 1 && Array.isArray(facts.errors)
    && facts.errors.length === report.errors.length && Object.hasOwn(facts, 'termination'));
  const observationStep = (id: unknown) => typeof id === 'string' && plan.steps.some(step => step.id === id && ['assert', 'wait-for'].includes(step.kind));
  const termination = facts.termination;
  if (termination !== null) {
    check(object(termination));
    if (termination.kind === 'lifecycle') check(only(termination, ['kind']));
    else check(['observation_budget', 'project_mismatch'].includes(termination.kind) && only(termination, ['kind', 'stepId'])
      && observationStep(termination.stepId));
  }
  for (const [index, fact] of facts.errors.entries()) {
    check(object(fact) && only(fact, ['errorIndex', 'error', 'kind', 'stepId', 'exception']) && fact.errorIndex === index
      && typeof fact.error === 'string' && fact.error === report.errors[index]
      && ['page_exception', 'observation_budget', 'termination_evidence', 'lifecycle', 'unknown'].includes(fact.kind));
    if (fact.kind === 'page_exception') {
      const source = fact.exception;
      check(!Object.hasOwn(fact, 'stepId') && object(source) && only(source, ['exceptionId', 'sourceURL', 'line', 'column'])
        && typeof source.sourceURL === 'string' && !!source.sourceURL
        && Number.isSafeInteger(source.exceptionId) && source.exceptionId >= 0
        && Number.isSafeInteger(source.line) && source.line >= 0 && Number.isSafeInteger(source.column) && source.column >= 0);
    } else {
      check(!Object.hasOwn(fact, 'exception'));
      if (fact.kind === 'observation_budget' || fact.kind === 'termination_evidence') check(termination?.kind === 'observation_budget'
        && observationStep(fact.stepId) && fact.stepId === termination.stepId);
      else check(!Object.hasOwn(fact, 'stepId'));
    }
  }
}

function validSegment(report: AcceptanceReport, plan: AcceptancePlan, profileRoot: string) {
  check(object(report) && report.formatVersion === '1.0.0' && report.kind === 'normal_browser_input' && isDeepStrictEqual(report.plan, plan)
    && typeof report.startedAt === 'string' && typeof report.endedAt === 'string'
    && ['passed', 'failed'].includes(report.outcome) && Array.isArray(report.errors) && report.errors.every(error => typeof error === 'string')
    && Array.isArray(report.steps) && report.steps.length === plan.steps.length && object(report.browser) && report.browser.name === 'chromium'
    && typeof report.browser.version === 'string' && !!report.browser.version && isDeepStrictEqual(report.browser.viewport, plan.viewport));
  for (const [index, step] of plan.steps.entries()) {
    const row = report.steps[index];
    check(object(row) && row.id === step.id && row.kind === step.kind && row.acceptanceId === ('acceptanceId' in step ? step.acceptanceId : undefined)
      && row.expected === ('expected' in step ? step.expected : 'input delivered') && scalar(row.actual) && ['passed', 'failed', 'skipped'].includes(row.outcome)
      && (row.error === null || typeof row.error === 'string') && (row.screenshot === null || typeof row.screenshot === 'string')
      && (row.outcome !== 'passed' || row.error === null && row.actual === row.expected)
      && (row.outcome !== 'failed' || typeof row.error === 'string' && !!row.error)
      && (row.outcome !== 'skipped' || row.actual === null && row.error === null));
  }
  validBrowserFacts(report, plan);
  const identity = report.session;
  check(object(identity) && Number.isSafeInteger(identity.browserPid) && identity.browserPid > 0 && object(report.cleanup)
    && report.cleanup.browserPid === identity.browserPid && report.cleanup.processExited === true && typeof report.cleanup.forced === 'boolean'
    && typeof identity.profile === 'string' && isAbsolute(identity.profile) && resolve(identity.profile) === identity.profile
    && dirname(identity.profile) === profileRoot && identity.commandLineProfile === identity.profile && identity.origin === new URL(plan.url).origin
    && identity.closeEvent === true && identity.exitConfirmed === true
    && (identity.exitCode === null || Number.isSafeInteger(identity.exitCode))
    && (identity.signalCode === null || typeof identity.signalCode === 'string' && /^SIG[A-Z0-9]+$/.test(identity.signalCode))
    && (identity.exitCode !== null || identity.signalCode !== null));
  if (identity.cdp !== undefined) check(object(identity.cdp) && isDeepStrictEqual(identity.cdp.browserProcessIds, [identity.browserPid])
    && isDeepStrictEqual(identity.cdp.profileArguments, ['--user-data-dir=' + identity.profile]));
}

async function rawEvidence(report: AcceptanceReport, plan: AcceptancePlan, root: string) {
  const folder = directory(plan);
  check(report.reportPath === folder + '/report.json' && Array.isArray(report.files) && report.files.every(file => typeof file === 'string' && file.startsWith(folder + '/'))
    && new Set(report.files).size === report.files.length && report.files.includes(report.reportPath));
  for (const extension of ['.png', '.webm', '.log']) check(report.files.some(file => file.endsWith(extension)));
  for (const row of report.steps) if (row.screenshot !== null) check(report.files.includes(row.screenshot));
  for (const file of report.files) check((await regularFile(root, file)).length > 0);
  const raw = JSON.parse((await regularFile(root, report.reportPath)).toString('utf8'));
  check(isDeepStrictEqual(raw, report));
}

function validCheckpoint(report: PersistentAcceptanceReport, series: PersistentAcceptanceSeries) {
  const c = report.checkpoint, expected = series.checkpoint;
  check(object(c) && only(c, ['outcome', 'expected', 'actual', 'savedActual', 'before', 'after']) && c.expected === expected.expected);
  const afterIndex = series.segments.findIndex(segment => segment.id === expected.afterSegment);
  if (report.outcome === 'failed' && report.segments.length <= afterIndex + 1) {
    check(c.outcome === 'skipped' && c.actual === null && c.savedActual === null && c.before === null && c.after === null); return;
  }
  const before = report.segments[afterIndex]?.report, after = report.segments[afterIndex + 1]?.report;
  check(before && c.actual === expected.expected && c.savedActual === expected.expected && isDeepStrictEqual(c.before, before.session));
  for (const observation of [expected.snapshot, expected.savedSnapshot]) {
    const indices = before.plan.steps.flatMap((step, index) => (step.kind === 'assert' || step.kind === 'wait-for')
      && isDeepStrictEqual(step.observation, observation) && step.expected === expected.expected ? [index] : []);
    const row = before.steps[indices.at(-1) ?? -1]; check(row && row.outcome === 'passed' && row.actual === expected.expected && completedObservation(row) && row.screenshot);
  }
  check(before.plan.steps.some((step, index) => ['mouse-click', 'locator-click'].includes(step.kind) && before.steps[index].actual === 'input delivered'));
  if (report.outcome === 'passed') check(c.outcome === 'passed' && after && isDeepStrictEqual(c.after, after.session));
  else check(c.outcome === 'failed' && c.after === null);
}

/** The caller supplies frozen current registry/source data and rechecks it before consuming the result. */
export async function diagnosePersistentBrowser(task: TaskContract, value: unknown, expected: PersistentDiagnosticExpected,
  options: PersistentDiagnosticOptions): Promise<Diagnostics> {
  const invalid = (): Diagnostics => ({ reportValid: false, passedChecks: [], issues: [{ acceptanceId: task.acceptanceIds[0],
    checkId: 'persistent/report', classification: 'insufficient_evidence', summary: 'Persistent execution has incomplete or inconsistent current evidence.',
    reproduction: ['Run the frozen persistent host on this exact candidate and inspect its raw reports.'],
    actual: 'Current binding, lifecycle, failure facts or durable evidence could not be established.',
    expected: 'Exact current source, candidate, series, deadline and owned process evidence.', evidenceRefs: [expected.reportPath] }] });
  try {
    const current = structuredClone(expected), report = structuredClone(value) as PersistentAcceptanceReport;
    check(!validatePersistentSeries(current.series).length && (current.series.formatVersion === 'persistent-acceptance/generic-1'
      ? !Object.hasOwn(current, 'sourceVersion') : current.sourceVersion === current.series.sourceVersion)
      && Number.isSafeInteger(current.deadlineAt) && typeof options.verifyBinding === 'function');
    const guard = async () => {
      await bounded(options.verifyBinding, current.deadlineAt - Date.now(), 'Persistent diagnostic binding', options.signal);
      check(!options.signal?.aborted && Date.now() < current.deadlineAt);
    };
    await guard();
    check(object(report) && report.formatVersion === '1.0.0' && report.kind === 'persistent_profile_process_reopen'
      && report.capability === PERSISTENT_PROFILE_CAPABILITY && isDeepStrictEqual(report.series, current.series) && report.deadlineAt === current.deadlineAt
      && typeof report.startedAt === 'string' && typeof report.endedAt === 'string'
      && report.reportPath === current.reportPath && ['passed', 'failed'].includes(report.outcome)
      && Array.isArray(report.errors) && report.errors.every(error => typeof error === 'string') && Array.isArray(report.segments)
      && report.segments.length > 0 && report.segments.length <= current.series.segments.length
      && (report.outcome !== 'passed' || report.segments.length === current.series.segments.length)
      && typeof report.profileRoot === 'string' && isAbsolute(report.profileRoot) && resolve(report.profileRoot) === report.profileRoot);
    const first = current.series.segments[0].plan;
    check(current.reportPath === [first.projectId, first.artifact.artifactId, first.artifact.version, first.runId, current.series.reportId, 'report.json'].join('/'));
    const start = Date.parse(report.startedAt), end = Date.parse(report.endedAt);
    check(Number.isFinite(start) && Number.isFinite(end) && start <= end && end < current.deadlineAt);
    if (current.nativeWaitContract !== undefined) validNativeAggregate(report, task, current, start, end);
    validFacts(report);
    check(isDeepStrictEqual(JSON.parse((await regularFile(options.evidenceRoot, current.reportPath)).toString('utf8')), report));
    const diagnostics: Diagnostics = { reportValid: true, issues: [], passedChecks: [] }, profiles = new Set<string>(); let priorEnd = start;
    for (const [index, segment] of report.segments.entries()) {
      const expectedSegment: PersistentAcceptanceSeries['segments'][number] = current.series.segments[index], plan: AcceptancePlan = expectedSegment.plan;
      check(object(segment) && only(segment, ['id', 'report']) && segment.id === expectedSegment.id && plan.taskId === task.taskId
        && plan.runId === task.runId && plan.specVersion === task.specVersion && plan.acceptanceIds.every(id => task.acceptanceIds.includes(id))
        && task.artifacts.some(artifact => isDeepStrictEqual(artifact, plan.artifact)));
      validSegment(segment.report, plan, report.profileRoot);
      const identity = segment.report.session!, segmentStart = Date.parse(segment.report.startedAt), segmentEnd = Date.parse(segment.report.endedAt);
      check(Number.isFinite(segmentStart) && Number.isFinite(segmentEnd) && priorEnd <= segmentStart && segmentStart <= segmentEnd && segmentEnd <= end); priorEnd = segmentEnd;
      if (expectedSegment.prerequisite === 'fresh-profile') check(!profiles.has(identity.profile));
      else {
        const previous = report.segments[index - 1]?.report.session;
        check(previous && previous.profile === identity.profile && previous.origin === identity.origin && previous.browserPid !== identity.browserPid);
      }
      profiles.add(identity.profile);
      await rawEvidence(segment.report, plan, options.evidenceRoot);
      const diagnostic = diagnoseBrowser(task, segment.report, plan, segment.report.reportPath);
      check(diagnostic.reportValid && (index === report.segments.length - 1 || segment.report.outcome === 'passed'));
      for (const issue of diagnostic.issues) if (issue.classification === 'code_defect') {
        const at = plan.steps.findIndex(step => issue.checkId === 'browser/' + step.id);
        check(at >= 0 && completedObservation(segment.report.steps[at]) && deliveredInputs(segment.report, plan, at));
      }
      diagnostics.issues.push(...diagnostic.issues.map(issue => ({ ...issue, checkId: `persistent/${segment.id}/${issue.checkId}` })));
      diagnostics.passedChecks.push(...diagnostic.passedChecks.map(check => ({ ...check, checkId: `persistent/${segment.id}/${check.checkId}` })));
    }
    validCheckpoint(report, current.series);
    if (report.outcome === 'passed') check(!diagnostics.issues.length);
    else check(diagnostics.issues.length > 0);
    await guard();
    if (diagnostics.issues.some(issue => issue.classification !== 'code_defect')) return invalid();
    return diagnostics;
  } catch { return invalid(); }
}
