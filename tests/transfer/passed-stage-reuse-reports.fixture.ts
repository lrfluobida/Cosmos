import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PersistentAcceptanceReport, PersistentAcceptanceSeries, PersistentAcceptanceOptions } from '../../src/acceptance/persistent.ts';
import type { AcceptanceReport } from '../../src/acceptance/runner.ts';
import { mediaObservationDefinitions } from '../../src/runtime/entrypoint-media.ts';

/** Synthetic typed transport only, reused to exercise the changed inherited promotion boundary. No browser proof. */
export async function syntheticReports(series: PersistentAcceptanceSeries, options: PersistentAcceptanceOptions, fail = false, mediaMutation?: string): Promise<PersistentAcceptanceReport> {
  const first = series.segments[0].plan, profileRoot = await mkdtemp(join(tmpdir(), 'cosmos-media-report-'));
  const base = [first.projectId, first.artifact.artifactId, first.artifact.version, first.runId].join('/');
  const at = new Date().toISOString(), segments: PersistentAcceptanceReport['segments'] = [];
  for (const [number, segment] of series.segments.entries()) {
    const plan = segment.plan, folder = base + '/' + plan.reportId, screenshot = folder + '/final.png';
    const profile = join(profileRoot, 'p' + (number === 7 ? 6 : number));
    const session = { browserPid: 20000 + number, profile, commandLineProfile: profile, origin: new URL(plan.url).origin,
      closeEvent: true, exitConfirmed: true, exitCode: 0, signalCode: null, cdp: { browserProcessIds: [20000 + number], profileArguments: ['--user-data-dir=' + profile] } };
    const report: AcceptanceReport = { formatVersion: '1.0.0', kind: 'normal_browser_input', plan: structuredClone(plan), startedAt: at, endedAt: at, outcome: 'passed',
      browser: { name: 'chromium', channel: 'synthetic', version: 'synthetic', headless: true, viewport: plan.viewport }, timeoutMs: 1000,
      cleanup: { browserPid: session.browserPid, forced: false, processExited: true }, session,
      steps: plan.steps.map(step => ({ id: step.id, kind: step.kind, ...('acceptanceId' in step ? { acceptanceId: step.acceptanceId } : {}),
        outcome: 'passed', expected: 'expected' in step ? step.expected : 'input delivered', actual: 'expected' in step ? step.expected : 'input delivered',
        error: null, screenshot, ...('expected' in step ? { observation: { completed: 1 } } : {}) })), errors: [],
      files: [screenshot, folder + '/browser.webm', folder + '/browser.log', folder + '/report.json'], reportPath: folder + '/report.json', evidence: [],
      failureFacts: { formatVersion: 1, termination: null, errors: [] } };
    if (fail) {
      const index = plan.steps.findIndex((step, index) => 'expected' in step && index > plan.steps.findIndex(step => step.kind === 'locator-click'));
      const row = report.steps[index]; row.outcome = 'failed'; row.actual = 'synthetic mismatch'; row.error = 'Expected frozen value'; row.failure = 'mismatch';
      report.steps.slice(index + 1).forEach(row => { row.outcome = 'skipped'; row.actual = null; row.error = null; row.screenshot = null; });
      report.outcome = 'failed'; report.failureFacts!.termination = { kind: 'project_mismatch', stepId: row.id };
      report.errors = ['Page: synthetic attributed exception'];
      report.failureFacts!.errors = [{ errorIndex: 0, error: report.errors[0], kind: 'page_exception',
        exception: { exceptionId: 1, sourceURL: plan.url + '/src/fixture.js', line: 1, column: 1 } }];
    } else if (options.mediaObservations) {
      const raw = JSON.parse(await readFile(join(options.evidenceRoot, '..', options.mediaObservations.media.location, 'public/assets/manifest.json'), 'utf8'));
      report.mediaObservations = { request: structuredClone(options.mediaObservations), recordedAt: at, values: mediaObservationDefinitions(raw).map(item => item.expected) };
      if (mediaMutation === 'false-media') report.mediaObservations.values[1] = 0;
      if (mediaMutation === 'null-media') report.mediaObservations.values[1] = null;
    }
    await mkdir(join(options.evidenceRoot, folder), { recursive: true });
    await writeFile(join(options.evidenceRoot, screenshot), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]));
    await writeFile(join(options.evidenceRoot, folder + '/browser.webm'), 'synthetic video');
    await writeFile(join(options.evidenceRoot, folder + '/browser.log'), 'synthetic log');
    await writeFile(join(options.evidenceRoot, report.reportPath), JSON.stringify(report), 'utf8'); segments.push({ id: segment.id, report });
    if (fail) break;
  }
  const checkpoint = series.checkpoint, result: PersistentAcceptanceReport = { formatVersion: '1.0.0', kind: 'persistent_profile_process_reopen',
    capability: 'persistent-profile-real-process-reopen-with-evidence', series: structuredClone(series), deadlineAt: options.deadlineAt, startedAt: at, endedAt: at,
    outcome: fail ? 'failed' : 'passed', profileRoot, segments,
    checkpoint: fail ? { outcome: 'skipped', expected: checkpoint.expected, actual: null, savedActual: null, before: null, after: null }
      : { outcome: 'passed', expected: checkpoint.expected, actual: checkpoint.expected, savedActual: checkpoint.expected, before: segments[6].report.session!, after: segments[7].report.session! },
    errors: fail ? ['segment failed'] : [], reportPath: base + '/' + series.reportId + '/report.json',
    failureFacts: { formatVersion: 1, errors: fail ? [{ errorIndex: 0, error: 'segment failed', phase: 'segment_report', kind: 'segment_failed', segmentId: segments[0].id }] : [] } };
  await mkdir(join(options.evidenceRoot, base, series.reportId), { recursive: true });
  await writeFile(join(options.evidenceRoot, result.reportPath), JSON.stringify(result), 'utf8');
  await rm(profileRoot, { recursive: true, force: true }); return result;
}
