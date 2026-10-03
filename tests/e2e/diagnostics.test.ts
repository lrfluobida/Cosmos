import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { task as taskFixture, requirement as requirementFixture, ledger as ledgerFixture, run as runFixture } from '../contracts/fixtures.ts';
import type { TaskContract } from '../../src/contracts/types.ts';
import type { AcceptanceReport, BrowserFailureFacts } from '../../src/acceptance/runner.ts';
import { createPilotAcceptance } from '../../probes/e2e/acceptance.ts';
import { diagnoseBuild, diagnoseBrowser, diagnosedFailure } from '../../probes/e2e/diagnostics.ts';
import { runAcceptance } from '../../src/acceptance/runner.ts';
import type { AcceptancePlan } from '../../src/acceptance/plan.ts';
import { filteredChildEnvironment } from '../../probes/e2e/admission.ts';
import { buildRepairFeedback, failureRecord } from '../../src/runtime/repair/feedback.ts';
import { assessRepair, DEFAULT_REPAIR_POLICY } from '../../src/runtime/repair/policy.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import type { RequirementContract } from '../../src/contracts/types.ts';
import { fileURLToPath } from 'node:url';
import { attributePageErrors, projectMismatchCanStop } from '../../src/acceptance/failure-facts.ts';
import type { RuntimeException } from '../../src/acceptance/failure-facts.ts';

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

function attributedBrowser() {
  const fixture = browser(), { report, plan, failed } = fixture, index = report.steps.indexOf(failed);
  Object.assign(report.cleanup, { forced: true, processExited: true });
  failed.failure = 'observation_budget'; failed.observation = { completed: 1 };
  report.steps.slice(index + 1).forEach(row => { row.outcome = 'skipped'; row.actual = null; });
  report.errors = ['Page: HUD element [data-testid="wave"] is missing', `Browser startup/execution: Observation ${failed.id}: timed out after 3 ms`,
    'Video unavailable after forced browser termination; earlier screenshots retained'];
  report.failureFacts = { formatVersion: 1, termination: { kind: 'observation_budget', stepId: failed.id }, errors: [
    { errorIndex: 0, error: report.errors[0], kind: 'page_exception', exception: { exceptionId: 1, sourceURL: `${plan.url}/src/hud.js`, line: 29, column: 8 } },
    { errorIndex: 1, error: report.errors[1], kind: 'observation_budget', stepId: failed.id },
    { errorIndex: 2, error: report.errors[2], kind: 'termination_evidence', stepId: failed.id },
  ] };
  return fixture;
}

test('attributable project exceptions and a closed local observation race retain a code defect', () => {
  const { task, plan, report, failed } = attributedBrowser(), before = structuredClone(report);
  const diagnostic = diagnoseBrowser(task, report, plan, 'browser.json');
  assert.equal(diagnostic.reportValid, true);
  assert.equal(diagnostic.issues.length, 1);
  assert.equal(diagnostic.issues[0].classification, 'code_defect');
  assert.equal(diagnostic.issues[0].checkId, `browser/${failed.id}`);
  assert.deepEqual(report, before);
});

test('attributable project exceptions with graceful exit preserve a reliable mismatch', () => {
  const { task, plan, report, failed } = attributedBrowser();
  report.cleanup.forced = false; report.errors = report.errors.slice(0, 1);
  report.failureFacts!.errors = report.failureFacts!.errors.slice(0, 1);
  report.failureFacts!.termination = null; failed.failure = 'mismatch';
  report.steps.slice(report.steps.indexOf(failed) + 1).forEach(row => { row.outcome = 'passed'; row.actual = row.expected; });
  assert.equal(diagnoseBrowser(task, report, plan, 'browser.json').issues[0].classification, 'code_defect');
});

function projectMismatchBrowser() {
  const fixture = attributedBrowser(), { report, failed } = fixture;
  report.cleanup.forced = false; report.errors = report.errors.slice(0, 1);
  report.failureFacts!.errors = report.failureFacts!.errors.slice(0, 1);
  Object.assign(report.failureFacts!.termination!, { kind: 'project_mismatch' }); failed.failure = 'mismatch';
  return fixture;
}

test('project exception association rechecks uniqueness and uses the throwing source frame', () => {
  const facts: BrowserFailureFacts = { formatVersion: 1, termination: null, errors: [{ errorIndex: 0, error: 'Page: fixture failure', kind: 'unknown' }] };
  const pages = [{ errorIndex: 0, name: 'Error', message: 'fixture failure' }];
  const detail: RuntimeException = { exceptionId: 1, lineNumber: 2, columnNumber: 3, url: 'http://localhost:4173/src/hud.js', exception: { description: 'Error: fixture failure\n    at hud' } };
  attributePageErrors(facts, pages, [detail]); assert.equal(facts.errors[0].kind, 'page_exception');
  assert.equal(facts.errors[0].exception!.sourceURL, detail.url);
  attributePageErrors(facts, pages, [detail, { ...detail, exceptionId: 2 }]);
  assert.equal(facts.errors[0].kind, 'unknown'); assert.equal(facts.errors[0].exception, undefined);
  attributePageErrors(facts, [...pages, { ...pages[0], errorIndex: 0 }], [detail]); assert.equal(facts.errors[0].kind, 'unknown');
  attributePageErrors(facts, pages, [{ ...detail, url: undefined, stackTrace: { callFrames: [
    { url: '', lineNumber: 0, columnNumber: 0 }, { url: detail.url!, lineNumber: 2, columnNumber: 3 },
  ] } }]);
  assert.equal(facts.errors[0].kind, 'unknown');
});

test('project mismatch stop requires a settled check, delivered input and only attributed errors', () => {
  const { report, failed } = projectMismatchBrowser(), index = report.steps.indexOf(failed); report.failureFacts!.termination = null;
  assert.equal(projectMismatchCanStop(report, index), true);
  for (const changed of ['unsettled', 'no-actual', 'undelivered', 'unknown', 'no-exception', 'duplicate']) {
    const clone = structuredClone(report), row = clone.steps[index];
    if (changed === 'unsettled') row.failure = 'observation_budget';
    if (changed === 'no-actual') row.actual = null;
    if (changed === 'undelivered') clone.steps.find(step => step.kind === 'mouse-click')!.actual = null;
    if (changed === 'unknown') clone.failureFacts!.errors[0].kind = 'unknown';
    if (changed === 'no-exception') { clone.errors = []; clone.failureFacts!.errors = []; }
    if (changed === 'duplicate') { clone.errors.push('Page: repeated'); clone.failureFacts!.errors.push({ ...clone.failureFacts!.errors[0], errorIndex: 1, error: clone.errors[1] }); }
    assert.equal(projectMismatchCanStop(clone, index), false, changed);
  }
});

test('project mismatch stop preserves a current completed check and its skipped suffix', () => {
  const { task, plan, report, failed } = projectMismatchBrowser(), before = structuredClone(report);
  const diagnostic = diagnoseBrowser(task, report, plan, 'browser.json');
  assert.equal(diagnostic.reportValid, true); assert.equal(diagnostic.issues.length, 1);
  assert.equal(diagnostic.issues[0].classification, 'code_defect'); assert.equal(diagnostic.issues[0].checkId, `browser/${failed.id}`);
  assert.deepEqual(report, before);
});

for (const changed of ['wrong-step', 'wrong-kind', 'no-actual', 'equal-actual', 'invalid-completed', 'undelivered', 'unknown', 'no-exception', 'executed-suffix', 'skipped-prefix', 'forced'] as const)
  test(`project mismatch stop remains conservative for ${changed}`, () => {
    const { task, plan, report, failed } = projectMismatchBrowser(), facts = report.failureFacts!;
    if (changed === 'wrong-step') Object.assign(facts.termination!, { stepId: 'another-check' });
    if (changed === 'wrong-kind') failed.failure = 'observation_error';
    if (changed === 'no-actual') failed.actual = null;
    if (changed === 'equal-actual') failed.actual = failed.expected;
    if (changed === 'invalid-completed') failed.observation!.completed = 0;
    if (changed === 'undelivered') report.steps.find(row => row.kind === 'mouse-click')!.actual = null;
    if (changed === 'unknown') facts.errors[0].kind = 'unknown';
    if (changed === 'no-exception') { report.errors = []; facts.errors = []; }
    if (changed === 'executed-suffix') report.steps[report.steps.indexOf(failed) + 1].outcome = 'passed';
    if (changed === 'skipped-prefix') report.steps[0].outcome = 'skipped';
    if (changed === 'forced') report.cleanup.forced = true;
    const diagnostic = diagnoseBrowser(task, report, plan, 'browser.json');
    assert.ok(diagnostic.issues.every(issue => issue.classification === 'insufficient_evidence'));
  });

for (const changed of ['valid-v1', 'legacy', 'unknown-format', 'missing-errors', 'missing-termination', 'lifecycle', 'unbound-unknown', 'null-facts'] as const)
  test(`clean reports always validate present failure facts for ${changed}`, () => {
    const { task, plan, report, failed } = browser();
    report.cleanup.processExited = true; failed.failure = 'mismatch'; failed.observation = { completed: 1 };
    const facts: BrowserFailureFacts = { formatVersion: 1, termination: null, errors: [] }; report.failureFacts = facts;
    if (changed === 'legacy') delete report.failureFacts;
    if (changed === 'unknown-format') Object.assign(facts, { formatVersion: 99 });
    if (changed === 'missing-errors') delete (facts as Partial<BrowserFailureFacts>).errors;
    if (changed === 'missing-termination') delete (facts as Partial<BrowserFailureFacts>).termination;
    if (changed === 'lifecycle') facts.termination = { kind: 'lifecycle' };
    if (changed === 'unbound-unknown') facts.errors.push({ errorIndex: 0, error: 'Unbound unknown error', kind: 'unknown' });
    if (changed === 'null-facts') Object.assign(report, { failureFacts: null });
    const before = structuredClone(report), diagnostic = diagnoseBrowser(task, report, plan, 'browser.json');
    assert.equal(diagnostic.reportValid, true);
    assert.ok(diagnostic.issues.every(issue => issue.classification === (['valid-v1', 'legacy'].includes(changed) ? 'code_defect' : 'insufficient_evidence')));
    assert.deepEqual(report, before);
  });

for (const changed of ['legacy', 'unknown', 'global', 'crash', 'cleanup', 'nonexit', 'missing-exit', 'foreign', 'no-url', 'bad-location', 'unmatched', 'no-actual', 'observation-error', 'undelivered', 'wrong-step', 'duplicate-exception', 'invalid-completed'] as const)
  test(`closed local observation evidence remains conservative for ${changed}`, () => {
    const { task, plan, report, failed } = attributedBrowser(), facts = report.failureFacts!;
    if (changed === 'legacy') delete report.failureFacts;
    if (['unknown', 'global', 'crash', 'cleanup'].includes(changed)) {
      report.errors.push(changed === 'unknown' ? 'Page: another unassociated error' : changed);
      facts.errors.push({ errorIndex: report.errors.length - 1, error: report.errors.at(-1)!, kind: changed === 'unknown' ? 'unknown' : 'lifecycle' });
    }
    if (changed === 'nonexit') report.cleanup.processExited = false;
    if (changed === 'missing-exit') report.cleanup.processExited = null;
    if (changed === 'foreign') facts.errors[0].exception!.sourceURL = 'https://external.invalid/hud.js';
    if (changed === 'no-url') facts.errors[0].exception!.sourceURL = '';
    if (changed === 'bad-location') facts.errors[0].exception!.line = -1;
    if (changed === 'unmatched') facts.errors[0].error = 'another raw error';
    if (changed === 'no-actual') failed.actual = null;
    if (changed === 'observation-error') failed.failure = 'observation_error';
    if (changed === 'undelivered') { const input = report.steps.find(row => row.kind === 'mouse-click')!; input.outcome = 'failed'; input.actual = null; }
    if (changed === 'wrong-step') (facts.termination as Extract<BrowserFailureFacts['termination'], { kind: 'observation_budget' }>).stepId = 'another-check';
    if (changed === 'duplicate-exception') {
      report.errors.push('Page: duplicate exception');
      facts.errors.push({ ...facts.errors[0], errorIndex: report.errors.length - 1, error: report.errors.at(-1)! });
    }
    if (changed === 'invalid-completed') failed.observation!.completed = -1;
    assert.ok(diagnoseBrowser(task, report, plan, 'browser.json').issues.every(issue => issue.classification === 'insufficient_evidence'));
  });

function browserRepairDecision(task: TaskContract, diagnostic: ReturnType<typeof diagnoseBrowser>) {
  task.dependsOn = []; task.state = 'failed'; task.stateReason = 'Host check failed'; task.attempts[0].outcome = 'failed';
  task.acceptance = task.acceptanceIds.map(acceptanceId => ({ ...task.acceptance[0], acceptanceId }));
  task.evidence = [{ ...task.evidence[0], evidenceId: `${task.taskId}-host`, outcome: 'failed', acceptanceIds: task.acceptanceIds, artifactVersions: [...task.inputs, ...task.artifacts] }];
  const requirement = requirementFixture() as RequirementContract;
  requirement.acceptance = task.acceptance.map(item => ({ ...requirement.acceptance[0], ...item }));
  const snapshot = { formatVersion: 1, revision: 1, run: runFixture(), ledger: ledgerFixture(), tasks: [task], requests: [], stopReason: null, events: [] } as RunSnapshot;
  snapshot.ledger.entries = []; snapshot.run.fees = { settledMicroCny: 0, reservedMicroCny: 0, unknownRequestIds: [] };
  const failure = diagnosedFailure(task, diagnostic)!;
  task.attempts[0].failure = failureRecord(failure.issues);
  const feedback = buildRepairFeedback(task, failure, 'host_verification', snapshot);
  return assessRepair({ snapshot, requirement, history: [feedback], policy: DEFAULT_REPAIR_POLICY,
    now: Date.parse('2026-10-01T01:00:00Z'), estimate: { costMicroCny: 100, durationMs: 1000, cleanupMs: 100 } });
}

test('attributable browser failure enters the existing bounded code repair policy', () => {
  const { task, plan, report } = attributedBrowser(), diagnostic = diagnoseBrowser(task, report, plan, 'browser.json');
  const decision = browserRepairDecision(task, diagnostic);
  assert.equal(decision.action, 'repair'); assert.equal(decision.reason, 'code_defect');
  assert.equal(DEFAULT_REPAIR_POLICY.maxRepairTasks, 1); assert.equal(task.state, 'failed'); assert.equal(report.outcome, 'failed');
});

test('actual Edge stops after a normal text mismatch caused by a HUD exception and permits bounded repair', { timeout: 30_000 }, async t => {
  const html = '<!doctype html><meta charset="utf-8"><strong id="status">准备开始</strong><strong id="wave">0/2</strong><button id="start">开始游戏</button><script src="/src/hud.js"></script>';
  const hud = 'const wave=document.querySelector(\'[data-testid="wave"]\');if(wave===null)throw new Error(\'HUD element [data-testid="wave"] is missing\');'
    + 'document.querySelector("#start").addEventListener("click",()=>{document.querySelector("#status").textContent="防守中"})';
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/src/hud.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    response.end(request.url === '/src/hud.js' ? hud : html);
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const plan: AcceptancePlan = { formatVersion: '1.0.0', projectId: 'cos32-fixture', taskId: 'fixture-code', runId: `offline-${Date.now()}`, reportId: 'hud-text-mismatch', specVersion: '1.0',
    artifact: { artifactId: 'hud-fixture', version: 'v1', location: 'tests/e2e/diagnostics.test.ts' }, url: `http://127.0.0.1:${address.port}/`,
    viewport: { width: 1280, height: 720 }, acceptanceIds: ['PILOT-START'], steps: [
      { id: 'ready', kind: 'assert', acceptanceId: 'PILOT-START', observation: { kind: 'text', selector: '#status' }, expected: '准备开始', timeoutMs: 1000 },
      { id: 'start', kind: 'mouse-click', selector: '#start', x: 0.5, y: 0.5 },
      { id: 'status', kind: 'wait-for', acceptanceId: 'PILOT-START', observation: { kind: 'text', selector: '#status' }, expected: '防守中', timeoutMs: 500 },
      { id: 'after-status', kind: 'mouse-click', selector: '#start', x: 0.5, y: 0.5 },
    ] };
  const evidenceRoot = new URL('../../.cosmos/diagnostics/', import.meta.url);
  const report = await runAcceptance(plan, { evidenceRoot: fileURLToPath(evidenceRoot), channel: 'msedge', env: filteredChildEnvironment(process.env), timeoutMs: 15_000 });
  console.log(`COS32 Edge text fixture: ${JSON.stringify({ version: report.browser.version, cleanup: report.cleanup, errors: report.errors, failureFacts: report.failureFacts, reportPath: report.reportPath })}`);
  assert.equal(report.outcome, 'failed'); assert.equal(report.steps[1].actual, 'input delivered');
  assert.equal(report.steps[2].failure, 'mismatch'); assert.equal(report.steps[2].actual, '准备开始'); assert.ok(report.steps[2].observation!.completed > 0);
  assert.ok(report.steps[2].screenshot); assert.equal(report.steps[3].outcome, 'skipped');
  assert.deepEqual(report.failureFacts!.termination, { kind: 'project_mismatch', stepId: 'status' });
  assert.equal(report.cleanup.forced, false); assert.equal(report.cleanup.processExited, true); assert.throws(() => process.kill(report.cleanup.browserPid!, 0));
  assert.deepEqual(report.errors, ['Page: HUD element [data-testid="wave"] is missing']);
  const task = taskFixture() as TaskContract; task.acceptanceIds = plan.acceptanceIds; task.artifacts = [plan.artifact];
  const diagnostic = diagnoseBrowser(task, report, plan, report.reportPath);
  assert.equal(diagnostic.issues.length, 1); assert.equal(diagnostic.issues[0].classification, 'code_defect');
  assert.equal(browserRepairDecision(task, diagnostic).action, 'repair'); assert.equal(DEFAULT_REPAIR_POLICY.maxRepairTasks, 1);
  assert.equal(JSON.parse(await readFile(new URL(report.reportPath, evidenceRoot), 'utf8')).outcome, 'failed');
});

test('actual Edge attributes a HUD exception and cancels a local observation race after normal input', { timeout: 30_000 }, async t => {
  // Diagnostic instrumentation delays a later read; this fixture is not a generated-game acceptance result.
  const html = '<!doctype html><meta charset="utf-8"><strong id="status">准备开始</strong><strong id="wave">0/2</strong><button id="start">开始游戏</button>'
    + '<script>let reads=0;Object.defineProperty(window,"cosmosDebug",{configurable:false,get(){'
    + 'if(++reads>1){const until=performance.now()+500;while(performance.now()<until){}}'
    + 'return Object.freeze({status:document.querySelector("#status").textContent});}})</script><script src="/src/hud.js"></script>';
  const hud = 'const wave=document.querySelector(\'[data-testid="wave"]\');if(wave===null)throw new Error(\'HUD element [data-testid="wave"] is missing\');'
    + 'document.querySelector("#start").addEventListener("click",()=>{document.querySelector("#status").textContent="防守中"})';
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/src/hud.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    response.end(request.url === '/src/hud.js' ? hud : html);
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const plan: AcceptancePlan = { formatVersion: '1.0.0', projectId: 'cos32-fixture', taskId: 'fixture-code', runId: `offline-${Date.now()}`, reportId: 'hud-local-budget', specVersion: '1.0',
    artifact: { artifactId: 'hud-fixture', version: 'v1', location: 'tests/e2e/diagnostics.test.ts' }, url: `http://127.0.0.1:${address.port}/`,
    viewport: { width: 1280, height: 720 }, acceptanceIds: ['PILOT-START'], steps: [
      { id: 'ready', kind: 'assert', acceptanceId: 'PILOT-START', observation: { kind: 'text', selector: '#status' }, expected: '准备开始', timeoutMs: 1000 },
      { id: 'start', kind: 'mouse-click', selector: '#start', x: 0.5, y: 0.5 },
      { id: 'status', kind: 'wait-for', acceptanceId: 'PILOT-START', observation: { kind: 'debug', path: ['status'] }, expected: '防守中', timeoutMs: 150 },
      { id: 'after-race', kind: 'mouse-click', selector: '#start', x: 0.5, y: 0.5 },
    ] };
  const evidenceRoot = new URL('../../.cosmos/diagnostics/', import.meta.url);
  const report = await runAcceptance(plan, { evidenceRoot: fileURLToPath(evidenceRoot), channel: 'msedge', env: filteredChildEnvironment(process.env), timeoutMs: 15_000 });
  console.log(`COS32 Edge fixture: ${JSON.stringify({ version: report.browser.version, cleanup: report.cleanup, errors: report.errors, failureFacts: report.failureFacts, reportPath: report.reportPath })}`);
  assert.equal(report.outcome, 'failed'); assert.equal(report.steps[1].actual, 'input delivered');
  assert.equal(report.steps[2].failure, 'observation_budget'); assert.equal(report.steps[2].actual, '准备开始');
  assert.equal(report.steps[3].outcome, 'skipped'); assert.equal(report.cleanup.forced, true); assert.equal(report.cleanup.processExited, true);
  assert.throws(() => process.kill(report.cleanup.browserPid!, 0));
  assert.equal(report.failureFacts!.errors[0].kind, 'page_exception');
  assert.equal(report.failureFacts!.errors[0].exception!.sourceURL, `${plan.url}src/hud.js`);
  const task = taskFixture() as TaskContract; task.acceptanceIds = plan.acceptanceIds;
  const diagnostic = diagnoseBrowser(task, report, plan, report.reportPath);
  assert.equal(diagnostic.issues.length, 1); assert.equal(diagnostic.issues[0].classification, 'code_defect');
  assert.equal(diagnostic.issues[0].checkId, 'browser/status');
  const persisted = JSON.parse(await readFile(new URL(report.reportPath, evidenceRoot), 'utf8'));
  assert.deepEqual(persisted, report); assert.equal(persisted.outcome, 'failed');
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
