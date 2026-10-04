import { lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { regularFile, safePath } from '../../../artifacts/paths.ts';
import type { BrowserCandidateConsumerContext, BrowserCandidateConsumerResult } from '../../entrypoint-preparation.ts';
import { assessMediaCoverage, createMediaObservationRequest } from '../../entrypoint-media.ts';
import { bindTransferAcceptance } from './binding.ts';
import type { BindInput } from './binding.ts';
import { transferPersistentSeries } from './acceptance.ts';
import { diagnosePersistentBrowser } from './persistent-diagnostics.ts';
import { requireThat } from './design.ts';
import { diagnoseBuild } from '../../repair/browser-diagnostics.ts';
import type { TaskContract } from '../../../contracts/types.ts';
import type { BrowserBuildReport } from '../../entrypoint-host.ts';

export function diagnoseTransferBuild(task: TaskContract, report: BrowserBuildReport, path: string): BrowserCandidateConsumerResult['diagnostics'] {
  if (typeof report.work === 'string' && Array.isArray(report.results) && report.results.length > 0 && report.results.length <= 2
    && report.results.every(result => result && (result.code === null || Number.isSafeInteger(result.code)) && typeof result.stdout === 'string' && typeof result.stderr === 'string')) {
    return diagnoseBuild(task, { passed: report.passed, work: report.work, results: report.results } as Parameters<typeof diagnoseBuild>[1], path);
  }
  return { reportValid: false, passedChecks: [], issues: [{ acceptanceId: task.acceptanceIds[0], checkId: 'build/report', classification: 'insufficient_evidence',
    summary: 'Build failed without complete attributable compiler facts.', reproduction: ['Inspect the fixed build report.'], actual: 'Incomplete or unknown compiler/environment failure.',
    expected: 'Both pinned commands or a known generated-source diagnostic.', evidenceRefs: [path] }] };
}

/** Executes trusted immutable plans; all mutable authority remains in the original host/controller. */
export async function consumeTransferCandidate(context: BrowserCandidateConsumerContext, options: {
  input: BindInput; sourceVersion: string; mount(verifyBinding: () => Promise<void>): Promise<() => Promise<void>>;
}): Promise<BrowserCandidateConsumerResult> {
  const bound = await bindTransferAcceptance(options.input), series = transferPersistentSeries(bound, options.sourceVersion, `${context.task.taskId}-persistent`);
  requireThat(series.segments.every(segment => segment.plan.taskId === context.task.taskId), 'actual task differs from the frozen plans');
  const evidenceRoot = join(context.root, 'browser-evidence'), first = series.segments[0].plan;
  const reportPath = [first.projectId, first.artifact.artifactId, first.artifact.version, first.runId, series.reportId, 'report.json'].join('/');
  const guard = async () => {
    context.signal.throwIfAborted(); await context.requireCurrent(); context.signal.throwIfAborted();
    requireThat(Date.now() < context.deadlineAt && isDeepStrictEqual(await bindTransferAcceptance(options.input), bound), 'consumer deadline or frozen input binding changed');
    const bytes = await regularFile(context.root, context.mediaArtifact.location + '/public/assets/manifest.json');
    requireThat(createHash('sha256').update(bytes).digest('hex') === context.manifestSha256
      && isDeepStrictEqual(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), context.media), 'actual current media manifest changed');
  };
  await guard();
  const folder = await safePath(evidenceRoot, dirname(reportPath));
  const previous = await lstat(folder).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  requireThat(!previous, 'persistent verification already started; unknown side effects cannot be replayed');
  const request = createMediaObservationRequest(context.media, { media: context.mediaArtifact, manifestSha256: context.manifestSha256,
    candidate: context.candidate, sourceVersion: options.sourceVersion, planBindingSha256: bound.planSha256, scope: series.scope! });
  const unmount = await options.mount(guard);
  let report;
  try {
    report = await context.playPersistent(series, { evidenceRoot, deadlineAt: context.deadlineAt, signal: context.signal, verifyBinding: guard,
      channel: 'msedge', headless: true, mediaObservations: request });
  } finally { await unmount(); }
  await guard();
  const diagnostics = await diagnosePersistentBrowser(context.task, report, { series, deadlineAt: context.deadlineAt, sourceVersion: options.sourceVersion, reportPath },
    { evidenceRoot, verifyBinding: guard, signal: context.signal });
  diagnostics.issues = diagnostics.issues.map(issue => ({ ...issue, evidenceRefs: issue.evidenceRefs.map(path => 'browser-evidence/' + path) }));
  await guard();
  const usage: Record<string, unknown> = { candidate: context.candidate, media: context.mediaArtifact, request, coverage: null,
    scope: 'Actual per-document engine observations during the frozen normal-input series, with independent source/PNG review.' };
  const result: BrowserCandidateConsumerResult = { passed: false, reportPath: 'browser-evidence/' + reportPath, mediaUsage: usage, pictures: [], rawEvidence: [], diagnostics };
  if (diagnostics.reportValid) result.rawEvidence = [reportPath, ...report.segments.map(segment => segment.report.reportPath)].map((path, index) => ({ artifactId: `${context.task.taskId}-raw-${index}`,
    version: context.candidate.version, location: 'browser-evidence/' + dirname(path) }));
  if (!diagnostics.reportValid || diagnostics.issues.length || report.outcome !== 'passed') return result;
  const currentRaw = async () => {
    requireThat(isDeepStrictEqual(JSON.parse((await regularFile(evidenceRoot, reportPath)).toString('utf8')), report), 'persistent raw aggregate changed');
    for (const segment of report.segments) requireThat(isDeepStrictEqual(JSON.parse((await regularFile(evidenceRoot, segment.report.reportPath)).toString('utf8')), segment.report), 'persistent raw segment changed');
  };
  await currentRaw();
  const rows = report.segments.map(segment => ({ segmentId: segment.id, reportPath: segment.report.reportPath, sample: segment.report.mediaObservations! }));
  const coverage = assessMediaCoverage(context.media, request, rows);
  if (rows.some((row, index) => !row.sample || Date.parse(row.sample.recordedAt) < Date.parse(report.segments[index].report.startedAt)
    || Date.parse(row.sample.recordedAt) > Date.parse(report.segments[index].report.endedAt))) coverage.valid = false;
  usage.coverage = coverage;
  if (!coverage.valid) { diagnostics.reportValid = false; diagnostics.passedChecks = []; diagnostics.issues.push({ acceptanceId: context.task.acceptanceIds[0], checkId: 'media/report', classification: 'insufficient_evidence',
    summary: 'Current media observation packets are absent or inconsistent.', reproduction: ['Inspect the current raw segment reports and exact art manifest.'],
    actual: 'Missing, malformed or changed current media samples.', expected: 'Complete typed samples from each actual segment document.', evidenceRefs: [result.reportPath] }); }
  else for (const check of coverage.checks) if (check.actual !== check.expected) diagnostics.issues.push({
    acceptanceId: context.task.acceptanceIds.includes('T16-06') ? 'T16-06' : context.task.acceptanceIds[0], checkId: `media/${check.id}`, classification: 'code_defect',
    summary: `Actual normal-input media coverage is incomplete: ${check.mediaId}/${check.state ?? check.kind}.`,
    reproduction: ['Run all eight frozen normal-input segments on this exact candidate.', `Read ${check.path.join('.')}.`],
    actual: JSON.stringify(check.actual), expected: JSON.stringify(check.expected), evidenceRefs: check.observations.map(row => 'browser-evidence/' + row.reportPath) });
  await currentRaw(); await guard();
  result.passed = coverage.valid && coverage.complete && !diagnostics.issues.length;
  if (result.passed) {
    result.pictures = report.segments.map((segment, index) => {
      const screenshot = [...segment.report.steps].reverse().find(row => row.screenshot)?.screenshot;
      requireThat(screenshot, 'current segment screenshot is missing');
      return { artifactId: `${context.task.taskId}-screenshot-${index}`, version: context.candidate.version, location: 'browser-evidence/' + screenshot };
    });
    for (const picture of result.pictures) requireThat((await regularFile(context.root, picture.location)).subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'current screenshot is not PNG');
  }
  await guard(); return result;
}
