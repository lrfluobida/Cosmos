import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { task as taskFixture } from '../contracts/fixtures.ts';
import type { TaskContract } from '../../src/contracts/types.ts';
import type { AcceptanceReport } from '../../src/acceptance/runner.ts';
import { createPilotAcceptance } from '../../probes/e2e/acceptance.ts';
import { diagnoseBuild, diagnoseBrowser, diagnosedFailure } from '../../probes/e2e/diagnostics.ts';
import { runAcceptance } from '../../src/acceptance/runner.ts';
import type { AcceptancePlan } from '../../src/acceptance/plan.ts';
import { filteredChildEnvironment } from '../../probes/e2e/admission.ts';

test('compiler source facts establish defects while environment text does not', () => {
  const task = taskFixture() as TaskContract; task.acceptanceIds = ['PILOT-START'];
  const source = diagnoseBuild(task, { passed: false, work: 'fixture', results: [{ code: 2, stdout: "src/main.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.", stderr: '' }] }, 'build.json');
  assert.equal(source.issues[0].classification, 'code_defect'); assert.equal(source.issues[0].checkId, 'build/typecheck');
  const environment = diagnoseBuild(task, { passed: false, work: 'fixture', results: [{ code: 1, stdout: '', stderr: 'SECRET_PROVIDER_TEXT MODULE_NOT_FOUND' }] }, 'build.json');
  assert.equal(environment.issues[0].classification, 'insufficient_evidence'); assert.doesNotMatch(JSON.stringify(environment), /SECRET_PROVIDER_TEXT/);
  const vite = diagnoseBuild(task, { passed: false, work: 'E:/fixture', results: [{ code: 0, stdout: '', stderr: '' },
    { code: 1, stdout: '', stderr: '[PARSE_ERROR] Error: Unexpected token\nE:/fixture/src/main.ts:3:7' }] }, 'build.json');
  assert.equal(vite.issues[0].classification, 'code_defect'); assert.equal(vite.issues[0].checkId, 'build/vite');
  assert.deepEqual(vite.passedChecks, [{ acceptanceId: 'PILOT-START', checkId: 'build/typecheck' }]);
});

function browser() {
  const task = taskFixture() as TaskContract, plan = createPilotAcceptance({ artifactId: 'game', version: 'v1', location: 'game/v1' }, 'http://localhost:4173', 'run1', 'report1');
  task.acceptanceIds = plan.acceptanceIds;
  const report = { plan, outcome: 'failed', browser: { version: '123' }, cleanup: { forced: false }, errors: [], steps: plan.steps.map(step => ({ id: step.id, kind: step.kind, outcome: 'passed',
    acceptanceId: 'acceptanceId' in step ? step.acceptanceId : undefined, expected: 'expected' in step ? step.expected : 'input delivered', actual: 'expected' in step ? step.expected : 'input delivered' })) } as unknown as AcceptanceReport;
  const failed = report.steps.find(row => row.acceptanceId === 'PILOT-COOLDOWN')!; failed.outcome = 'failed'; failed.actual = 'none';
  task.evidence = [{ ...task.evidence[0], evidenceId: `${task.taskId}-host`, outcome: 'failed', acceptanceIds: task.acceptanceIds, artifactVersions: [...task.inputs, ...task.artifacts] }];
  return { task, plan, report, failed };
}

test('normal assertion mismatch retains failed report and uses passed checks only as witnesses', () => {
  const { task, plan, report, failed } = browser(), before = structuredClone(report);
  const diagnostic = diagnoseBrowser(task, report, plan, 'browser.json'), failure = diagnosedFailure(task, diagnostic)!;
  assert.equal(failure.issues[0].classification, 'code_defect'); assert.equal(failure.issues[0].checkId, `browser/${failed.id}`);
  assert.ok(failure.passedChecks.length); assert.ok(failure.passedChecks.every(check => check.evidenceId === `${task.taskId}-host`));
  assert.deepEqual(report, before); assert.equal(task.evidence[0].outcome, 'failed');
});

test('stale versions, whole-browser deadline and unavailable observations cannot trigger code repair', () => {
  const { task, plan, report, failed } = browser();
  const stale = structuredClone(report); stale.plan.artifact.version = 'v0';
  assert.equal(diagnoseBrowser(task, stale, plan, 'stale.json').reportValid, false);
  const inconsistent = structuredClone(report); inconsistent.outcome = 'passed'; inconsistent.steps.find(row => row.id === failed.id)!.outcome = 'passed';
  assert.equal(diagnoseBrowser(task, inconsistent, plan, 'inconsistent.json').reportValid, false);
  report.errors.push('Browser startup/execution deadline');
  assert.ok(diagnoseBrowser(task, report, plan, 'timeout.json').issues.every(issue => issue.classification === 'insufficient_evidence'));
  report.errors = []; failed.actual = null;
  assert.equal(diagnoseBrowser(task, report, plan, 'missing.json').issues[0].classification, 'insufficient_evidence');
});

test('actual normal-input browser failure maps to a stable defect while passed readiness is only a progress witness', { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-browser-diagnostic-')); t.after(() => rm(root, { recursive: true, force: true }));
  const html = await readFile(new URL('../acceptance/fixtures/input.html', import.meta.url), 'utf8');
  const server = createServer((_request, response) => { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const plan: AcceptancePlan = { formatVersion: '1.0.0', projectId: 'diagnostic-fixture', taskId: 'fixture-code', runId: 'offline-1', reportId: 'disabled-input', specVersion: '1.0',
    artifact: { artifactId: 'input-fixture', version: 'v1', location: 'tests/acceptance/fixtures/input.html' }, url: `http://127.0.0.1:${address.port}/?fault=disabled`,
    viewport: { width: 1280, height: 720 }, acceptanceIds: ['PILOT-START'], steps: [
      { id: 'ready', kind: 'wait-for', acceptanceId: 'PILOT-START', observation: { kind: 'text', selector: '#display' }, expected: '计数：0', timeoutMs: 3000 },
      { id: 'click', kind: 'mouse-click', selector: '#increment', x: 0.5, y: 0.5 },
      { id: 'input-effect', kind: 'wait-for', acceptanceId: 'PILOT-START', observation: { kind: 'debug', path: ['clicks'] }, expected: 1, timeoutMs: 500 },
    ] };
  const report = await runAcceptance(plan, { evidenceRoot: root, channel: 'msedge', env: filteredChildEnvironment(process.env), timeoutMs: 15_000 });
  assert.equal(report.outcome, 'failed'); assert.equal(report.cleanup.processExited, true); assert.deepEqual(report.errors, []);
  const task = taskFixture() as TaskContract; task.acceptanceIds = plan.acceptanceIds;
  const diagnostic = diagnoseBrowser(task, report, plan, report.reportPath);
  assert.equal(diagnostic.issues.length, 1); assert.equal(diagnostic.issues[0].classification, 'code_defect');
  assert.equal(diagnostic.issues[0].checkId, 'browser/input-effect'); assert.equal(diagnostic.issues[0].actual, 'Observed 0.');
  assert.deepEqual(diagnostic.passedChecks, [{ acceptanceId: 'PILOT-START', checkId: 'browser/ready' }]);
  assert.equal(JSON.parse(await readFile(join(root, report.reportPath), 'utf8')).outcome, 'failed');
});
