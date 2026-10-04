import { isDeepStrictEqual } from 'node:util';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { TaskContract } from '../../src/contracts/types.ts';
import type { AcceptancePlan } from '../../src/acceptance/plan.ts';
import type { AcceptanceReport } from '../../src/acceptance/runner.ts';
import { completedObservation, deliveredInputs } from '../../src/acceptance/failure-facts.ts';
import { bounded } from '../../src/acceptance/deadline.ts';
import { regularFile } from '../../src/artifacts/paths.ts';
import { PERSISTENT_PROFILE_CAPABILITY, validatePersistentSeries } from '../../src/acceptance/persistent.ts';
import type { PersistentAcceptanceReport, PersistentAcceptanceSeries } from '../../src/acceptance/persistent.ts';
import { diagnoseBrowser } from '../e2e/diagnostics.ts';
import type { Diagnostics } from '../e2e/diagnostics.ts';

export interface PersistentDiagnosticExpected {
  series: PersistentAcceptanceSeries; deadlineAt: number; sourceVersion: string; reportPath: string;
}
export interface PersistentDiagnosticOptions {
  evidenceRoot: string; verifyBinding: () => Promise<void>; signal?: AbortSignal;
}
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const only = (value: Record<string, any>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const scalar = (value: unknown) => value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value);
function check(valid: unknown): asserts valid { if (!valid) throw new Error('Incomplete persistent evidence'); }
const directory = (plan: AcceptancePlan) => [plan.projectId, plan.artifact.artifactId, plan.artifact.version, plan.runId, plan.reportId].join('/');

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
  const facts = report.failureFacts;
  check(object(facts) && only(facts, ['formatVersion', 'termination', 'errors']) && facts.formatVersion === 1 && Array.isArray(facts.errors)
    && Object.hasOwn(facts, 'termination'));
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
    check(!validatePersistentSeries(current.series).length && current.sourceVersion === current.series.sourceVersion
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
    validFacts(report);
    check(isDeepStrictEqual(JSON.parse((await regularFile(options.evidenceRoot, current.reportPath)).toString('utf8')), report));
    const diagnostics: Diagnostics = { reportValid: true, issues: [], passedChecks: [] }, profiles = new Set<string>(); let priorEnd = start;
    for (const [index, segment] of report.segments.entries()) {
      const expectedSegment = current.series.segments[index], plan = expectedSegment.plan;
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
