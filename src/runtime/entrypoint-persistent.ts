import { createHash } from 'node:crypto';
import type { ArtifactReference } from '../contracts/types.ts';
import type { AcceptancePlan } from '../acceptance/plan.ts';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { sameValue } from '../contracts/validation.ts';
import { regularFile } from '../artifacts/paths.ts';
import { validatePersistentSeries, PERSISTENT_PROFILE_CAPABILITY, verifyPersistentSegmentEvidence, verifyReopenCheckpoint } from '../acceptance/persistent.ts';
import type { GenericPersistentAcceptanceSeries, PersistentAcceptanceReport } from '../acceptance/persistent.ts';
import type { BrowserScenario } from '../roles/requirements.ts';

/** Only the trusted host supplies captures and execution identities. */
export function createGenericPersistentSeries(input: { scenario: BrowserScenario; requirement: ArtifactReference; design: ArtifactReference; candidate: ArtifactReference;
  projectId: string; taskId: string; runId: string; specVersion: string; reportId: string; url: string; acceptanceIds: string[] }): GenericPersistentAcceptanceSeries {
  const reopen = input.scenario.reopen;
  if (!reopen) throw new Error('A confirmed reopen scenario is required.');
  const binding = { requirement: structuredClone(input.requirement), design: structuredClone(input.design), candidate: structuredClone(input.candidate), acceptanceIds: [...input.acceptanceIds] };
  const segments: GenericPersistentAcceptanceSeries['segments'] = [input.scenario.steps, reopen.steps].map((steps, index) => {
    const plan: AcceptancePlan = { formatVersion: '1.0.0', projectId: input.projectId, taskId: input.taskId, runId: input.runId, specVersion: input.specVersion,
      reportId: `${input.reportId}-${index ? 'resume' : 'save'}`, artifact: structuredClone(input.candidate), url: input.url,
      viewport: structuredClone(input.scenario.viewport), steps: structuredClone(steps),
      acceptanceIds: input.acceptanceIds.filter(id => steps.some(step => 'acceptanceId' in step && step.acceptanceId === id)) };
    return { id: index ? 'resume' : 'save', prerequisite: index ? 'same-profile-reopened' : 'fresh-profile', plan };
  });
  const checkpoint = { ...structuredClone(reopen.checkpoint), kind: 'close-process-reopen' as const, afterSegment: 'save', beforeSegment: 'resume', sameProfile: true as const,
    sameOrigin: true as const, origin: new URL(input.url).origin };
  const series: GenericPersistentAcceptanceSeries = { formatVersion: 'persistent-acceptance/generic-1', reportId: input.reportId, binding, segments, checkpoint,
    bindingSha256: createHash('sha256').update(JSON.stringify({ binding, segments, checkpoint })).digest('hex') };
  const issues = validatePersistentSeries(series); if (issues.length) throw new Error(`Invalid generic save binding: ${issues.join('; ')}`);
  return series;
}

/** No reported pass is promoted without its exact raw process and gameplay evidence. */
export async function verifyGenericPersistentEvidence(series: GenericPersistentAcceptanceSeries, report: PersistentAcceptanceReport, evidenceRoot: string, deadlineAt: number) {
  const requireThat = (valid: unknown) => { if (!valid) throw new Error('Incomplete generic persistent evidence.'); };
  const first = series.segments[0].plan, reportPath = [first.projectId, first.artifact.artifactId, first.artifact.version, first.runId, series.reportId, 'report.json'].join('/');
  requireThat(!validatePersistentSeries(series).length && report?.formatVersion === '1.0.0' && report.kind === 'persistent_profile_process_reopen'
    && report.capability === PERSISTENT_PROFILE_CAPABILITY && sameValue(report.series, series) && report.deadlineAt === deadlineAt
    && report.reportPath === reportPath && report.outcome === 'passed' && report.errors.length === 0 && report.failureFacts?.errors.length === 0
    && report.segments.length === 2 && report.checkpoint.outcome === 'passed' && report.checkpoint.expected === series.checkpoint.expected
    && report.checkpoint.actual === series.checkpoint.expected && report.checkpoint.savedActual === series.checkpoint.expected);
  requireThat(isAbsolute(report.profileRoot) && resolve(report.profileRoot) === report.profileRoot);
  const profile = report.segments[0]?.report.session?.profile;
  requireThat(typeof profile === 'string' && isAbsolute(profile) && resolve(profile) === profile && /^profile-[a-f0-9-]+$/.test(relative(report.profileRoot, profile)));
  for (const [index, segment] of series.segments.entries()) {
    const raw = report.segments[index]; requireThat(raw?.id === segment.id && !!raw.report.browser.version);
    requireThat(raw.report.reportPath === [first.projectId, first.artifact.artifactId, first.artifact.version, first.runId, segment.plan.reportId, 'report.json'].join('/'));
    await verifyPersistentSegmentEvidence(raw.report, segment.plan, evidenceRoot, profile!);
    for (const observation of [series.checkpoint.snapshot, series.checkpoint.savedSnapshot]) requireThat(raw.report.steps.some((row, index) => {
      const step = segment.plan.steps[index];
      return 'observation' in step && sameValue(step.observation, observation) && row.actual === series.checkpoint.expected
        && (row.observation?.completed ?? 0) > 0 && !!row.screenshot;
    }));
  }
  await verifyReopenCheckpoint(series, report.segments[0].report, evidenceRoot, profile!);
  const [before, after] = report.segments.map(segment => segment.report.session!);
  requireThat(before.browserPid !== after.browserPid && before.profile === after.profile && before.origin === after.origin
    && sameValue(report.checkpoint.before, before) && sameValue(report.checkpoint.after, after));
  requireThat(sameValue(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(evidenceRoot, reportPath))), report));
  return [{ artifactId: `${first.taskId}-persistent-raw`, version: first.artifact.version, location: `browser-evidence/${dirname(reportPath).replaceAll('\\', '/')}` },
    ...report.segments.map(segment => ({ artifactId: `${first.taskId}-${segment.id}-raw`, version: first.artifact.version,
      location: `browser-evidence/${dirname(segment.report.reportPath).replaceAll('\\', '/')}` }))];
}
