import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { reserveTransferOrigin } from '../../probes/transfer/loopback-origin.ts';
import * as runtime from '../../probes/transfer/runtime-host.ts';
import { transferFixture } from './runtime-host.fixture.ts';
import { executeTaskDag, resumeTaskDag } from '../../src/runtime/orchestrator.ts';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';
import type { PersistentAcceptanceReport, PersistentAcceptanceSeries, PersistentAcceptanceOptions } from '../../src/acceptance/persistent.ts';
import type { AcceptanceReport } from '../../src/acceptance/runner.ts';
import type { TaskContract } from '../../src/contracts/types.ts';
import { mediaObservationDefinitions } from '../../src/runtime/entrypoint-media.ts';

/** Deliberately synthetic transport packets; actual browser ownership is checked by the separate short Phaser QA. */
async function syntheticReports(series: PersistentAcceptanceSeries, options: PersistentAcceptanceOptions, fail = false, mediaMutation?: string): Promise<PersistentAcceptanceReport> {
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

async function consumerPipeline(t: any, repair = false, mutateMedia = false, mutateCandidate = false, mode?: string) {
  assert.equal(typeof (runtime as any).createTransferConsumerHost, 'function', 'COS40 explicit consumer factory is missing');
  const f = await transferFixture(t); let host: any, seriesCalls = 0;
  const io: any = { ...f.input.io,
    build: async (project: string, taskId: string, _signal: AbortSignal, authority: any) => {
      assert.equal(taskId, authority.taskId); f.calls.push({ kind: 'build', taskId });
      if (mode === 'build-fail') return { passed: false, diagnostics: 'Synthetic environment failure, no generated-source compiler facts.' };
      if (mode === 'candidate-deps') {
        const path = join(dirname(project), 'candidate.json'), candidate = JSON.parse(await readFile(path, 'utf8'));
        candidate.inputs = candidate.inputs.filter((ref: any) => !ref.artifactId.endsWith('-media'));
        candidate.expectedDeps = candidate.expectedDeps.filter((ref: any) => !ref.artifactId.endsWith('-media'));
        await writeFile(path, JSON.stringify(candidate), 'utf8');
      }
      if (mutateCandidate) {
        const ref = `registry/captures/${f.window.caseId}-game-source/v1/files/src/main.ts`;
        await writeFile(join(f.root, ref), '// same-version synthetic source changed\n', 'utf8');
        await writeFile(join(project, 'src/main.ts'), '// same-version synthetic source changed\n', 'utf8');
      }
      await mkdir(join(project, 'dist')); await writeFile(join(project, 'dist/index.html'), 'synthetic ' + taskId, 'utf8');
      return { passed: true, diagnostics: '' };
    },
    playPersistent: async (series: PersistentAcceptanceSeries, options: PersistentAcceptanceOptions, authority: any) => {
      seriesCalls++; assert.equal(series.segments[0].plan.taskId, authority.taskId); await options.verifyBinding();
      assert.equal(await (await fetch(series.segments[0].plan.url)).text(), 'synthetic ' + authority.taskId);
      return syntheticReports(series, options, repair && seriesCalls === 1, mode);
    } };
  host = await (runtime as any).createTransferConsumerHost({ ...f.input, io }); t.after(() => host.closePreparation());
  const tasks = f.prepare(host); host.validateTasks(tasks);
  const recovery = { artifactRoot: f.root, journalRoot: join(f.root, 'journal'), recoverCapture: host.recoverCapture };
  const execute = (tasks: any[], resume = false) => {
    const options = { controller: f.controller, validation: f.validation, requirement: f.requirement, tasks,
    sessionRoot: join(f.root, 'sessions'), availableArtifacts: host.availableArtifacts, roleFactory: host.roleFactory,
    preAuthor: async (task: Readonly<TaskContract>, signal: AbortSignal) => {
      if (mutateMedia && task.taskId === f.window.quote.declaration.grants.coding.taskId) {
        const media = task.inputs.find(ref => ref.artifactId.endsWith('-media'))!;
        await writeFile(join(f.root, media.location, 'public/assets/marker/idle-000.svg'), '<svg>changed</svg>', 'utf8');
      }
      return host.preAuthor(task, signal);
    }, capture: host.capture, verify: host.verify, reviewImages: host.reviewImages, diagnoseFailure: host.diagnoseFailure,
    recovery, reviewProtocolCorrections: 1 as const, authorProtocolCorrections: 1 as const };
    return resume ? resumeTaskDag(options).then(report => { assert.deepEqual(report.blocked, []); return report.tasks; }) : executeTaskDag(options);
  };
  let result: TaskContract[] = [], finished: any;
  await host.withPreparation(async () => {
    result = await execute(tasks);
    if (repair && result[2].state === 'failed') {
      const feedback = JSON.parse(await readFile(join(result[2].attempts.at(-1)!.sessionRef, 'failure.json'), 'utf8'));
      assert.ok(feedback.issues.every((issue: any) => issue.classification === 'code_defect'), JSON.stringify(feedback.issues));
      const prepared = await host.prepareValidationRepair({ ...tasks[2], task: result[2] }, feedback, recovery);
      await assert.rejects(host.prepareValidationRepair({ ...tasks[2], task: result[2] }, feedback, recovery), /claimed|already/i);
      result = await execute([tasks[0], tasks[1], prepared], true);
    }
    finished = await host.finish(result); return finished;
  });
  return { ...f, result, finished, seriesCalls };
}

test('COS40 explicit consumer factory is source-owned and separate from default preparation', () => {
  assert.equal(typeof (runtime as any).createTransferConsumerHost, 'function', 'COS40 explicit consumer factory is missing');
});
test('COS40 consumer envelope rejects late origin receipt drift before returning a callback result', async t => {
  const f = await transferFixture(t), host = await (runtime as any).createTransferConsumerHost(f.input); t.after(() => host.closePreparation());
  const file = join(f.root, 'host-transfer-origin.json'), original = JSON.parse(await readFile(file, 'utf8'));
  await assert.rejects(host.withPreparation(async () => {
    await writeFile(file, JSON.stringify({ ...original, binding: { ...original.binding, sourceVersion: 'f'.repeat(40) } }), 'utf8');
    return 'stale consumer result';
  }), /receipt|origin|binding/i);
  await assert.rejects(fetch(original.url)); assert.equal(f.calls.length, 0);
});
test('COS40 trusted consumer freezes actual task IDs and promotes only complete current synthetic evidence plus independent review', async t => {
  const f = await consumerPipeline(t);
  assert.deepEqual(f.result.map(task => task.state), ['passed', 'passed', 'passed'], JSON.stringify(f.result[2].handoff)); assert.equal(f.seriesCalls, 1);
  assert.equal(f.finished.acceptedCandidate.candidateRef.version, 'v1');
  const registry = await createArtifactRegistry({ workspaceRoot: f.root, registryRoot: 'registry' });
  const plan = await registry.getCapture(registry.artifactRef(f.window.caseId + '-plan-v1', 'v1'));
  const frozen = JSON.parse(await readFile(join(f.root, plan.artifactRef.location, '_cosmos/transfer-plan.json'), 'utf8'));
  assert.ok(frozen.segments.every((item: any) => item.plan.taskId === f.window.quote.declaration.grants.coding.taskId));
  const usage = JSON.parse(await readFile(join(f.root, f.finished.mediaUsage), 'utf8')); assert.equal(usage.coverage.complete, true);
  assert.ok(usage.coverage.checks.every((check: any) => check.witnesses.length));
  assert.ok(f.result[2].evidence.some(item => item.kind === 'screenshot')); assert.equal(f.result[2].review.verdict, 'approved');
});
test('COS40 reliable persistent mismatch uses only the original linked repair v2 with the same frozen map and origin', async t => {
  const f = await consumerPipeline(t, true); assert.equal(f.seriesCalls, 2); assert.equal(f.finished.acceptedCandidate.candidateRef.version, 'v2');
  const refs = ['v1', 'v2'].map(version => `registry/captures/${f.window.caseId}-plan-${version}/v1/files/_cosmos/transfer-plan.json`);
  const [first, second] = await Promise.all(refs.map(async path => JSON.parse(await readFile(join(f.root, path), 'utf8'))));
  assert.deepEqual(first.segments.map((item: any) => item.plan.steps), second.segments.map((item: any) => item.plan.steps));
  assert.equal(first.checkpoint.origin, second.checkpoint.origin);
  assert.ok(second.segments.every((item: any) => item.plan.taskId === f.window.quote.declaration.grants.repair.taskId));
  assert.ok((await f.controller.read()).validation!.cases[0].repair);
});
test('COS40 same-version art bytes are rejected by the original journal signature before coding or build', async t => {
  const f = await consumerPipeline(t, false, true);
  assert.ok(!f.calls.some(call => call.kind === 'coding' || call.kind === 'build'));
  assert.equal(f.finished.acceptedCandidate, undefined); assert.equal(f.seriesCalls, 0);
});
test('COS40 same-version candidate and matching source-capture rewrites cannot bypass the original capture signature', async t => {
  const f = await consumerPipeline(t, false, false, true);
  assert.equal(f.result[2].state, 'failed'); assert.equal(f.seriesCalls, 0); assert.equal(f.finished.acceptedCandidate, undefined);
});
test('COS40 candidate manifest cannot drop an exact art dependency while keeping its staged bytes', async t => {
  const f = await consumerPipeline(t, false, false, false, 'candidate-deps');
  assert.equal(f.result[2].state, 'failed'); assert.equal(f.seriesCalls, 0); assert.equal(f.finished.acceptedCandidate, undefined);
});
test('COS40 healthy false media is a coding defect but unknown media and unattributed build failures stay insufficient', async t => {
  for (const [mode, expected] of [['false-media', 'code_defect'], ['null-media', 'insufficient_evidence'], ['build-fail', 'insufficient_evidence']]) {
    const f = await consumerPipeline(t, false, false, false, mode), task = f.result[2];
    assert.equal(task.state, 'failed'); assert.equal(f.finished.acceptedCandidate, undefined);
    const feedback = JSON.parse(await readFile(join(task.attempts.at(-1)!.sessionRef, 'failure.json'), 'utf8'));
    assert.ok(feedback.issues.length); assert.ok(feedback.issues.every((issue: any) => issue.classification === expected), JSON.stringify(feedback.issues));
    assert.equal((await f.controller.read()).validation!.cases[0].repair, null);
    if (mode !== 'build-fail') {
      const usage = JSON.parse(await readFile(join(f.root, 'evidence', task.taskId, 'media-usage.json'), 'utf8'));
      if (mode === 'false-media') assert.ok(usage.coverage.checks.find((check: any) => check.kind === 'loaded_frames').observations.every((row: any) => row.value === 0));
      else assert.equal(usage.coverage.valid, false);
    }
  }
});
test('COS40 candidate dist mount retains the original listener and exact receipt then unmounts', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-consumer-origin-')); t.after(() => rm(root, { recursive: true, force: true }));
  const abort = new AbortController(); let current = true;
  const candidate = { artifactId: 'game', version: 'v1', location: 'registry/candidates/game/v1/project' };
  const project = join(root, candidate.location); await mkdir(join(project, 'dist'), { recursive: true });
  await writeFile(join(project, 'dist/index.html'), '<p>合成媒体 fixture</p>', 'utf8'); await writeFile(join(project, 'dist/a.wav'), 'WAV', 'utf8');
  const origin: any = await reserveTransferOrigin({ root, resume: false, signal: abort.signal,
    binding: { caseId: 'synthetic', windowId: 'window', sourceVersion: 'a'.repeat(40), requirementSha256: 'b'.repeat(64), runId: 'run', specVersion: '1' },
    requireScope: async () => { if (!current) throw new Error('Scope changed'); } }); t.after(() => origin.close());
  assert.equal(typeof origin.mountCandidate, 'function', 'COS40 stable candidate dist mount is missing');
  const receipt = await readFile(join(root, 'host-transfer-origin.json')), url = origin.url;
  let completeBindings = 0;
  const unmount = await origin.mountCandidate({ candidate, project, verifyBinding: async () => { completeBindings++; await origin.verify(); } });
  assert.equal(await (await fetch(url)).text(), '<p>合成媒体 fixture</p>');
  assert.equal((await fetch(url + '/a.wav')).headers.get('content-type'), 'audio/wav');
  assert.equal((await fetch(url)).headers.get('cache-control'), 'no-store');
  assert.equal(completeBindings, 1, 'Asset requests retain source/scope/origin guards without rehashing the complete roster for every frame');
  assert.equal((await fetch(url + '/%2e%2e%2findex.html')).status, 404);
  await assert.rejects(origin.mountCandidate({ candidate, project, verifyBinding: origin.verify }), /mount|active/i);
  await unmount(); assert.equal((await fetch(url)).status, 404);
  assert.equal(origin.url, url); assert.deepEqual(await readFile(join(root, 'host-transfer-origin.json')), receipt);
  await assert.rejects(origin.mountCandidate({ candidate: { ...candidate, location: '../escape' }, project, verifyBinding: origin.verify }));
  await origin.mountCandidate({ candidate, project, verifyBinding: origin.verify }); current = false;
  await assert.rejects(origin.verify(), /Scope changed/); await assert.rejects(fetch(url));
});
