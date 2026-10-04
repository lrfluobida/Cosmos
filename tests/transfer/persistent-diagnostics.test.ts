import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { TaskContract } from '../../src/contracts/types.ts';
import type { AcceptancePlan } from '../../src/acceptance/plan.ts';
import type { AcceptanceReport } from '../../src/acceptance/runner.ts';
import { executePersistentSeries } from '../../src/acceptance/persistent.ts';
import type { PersistentAcceptanceReport, PersistentAcceptanceSeries } from '../../src/acceptance/persistent.ts';
import { diagnosePersistentBrowser as diagnose } from '../../probes/transfer/persistent-diagnostics.ts';
import type { PersistentDiagnosticExpected, PersistentDiagnosticOptions } from '../../probes/transfer/persistent-diagnostics.ts';
import type { Diagnostics } from '../../probes/e2e/diagnostics.ts';

const candidate = { artifactId: 'game', version: 'v1', location: 'registry/game/v1/project' };
const task = { taskId: 'coding', runId: 'fixture-run', specVersion: 'spec-v1', acceptanceIds: ['save'], artifacts: [candidate] } as TaskContract;
function plan(id: string): AcceptancePlan {
  return { formatVersion: '1.0.0', projectId: 'fixture', taskId: task.taskId, runId: task.runId, reportId: id + '-report',
    specVersion: task.specVersion, artifact: structuredClone(candidate), url: 'http://127.0.0.1:32123/', viewport: { width: 1280, height: 720 },
    acceptanceIds: ['save'], steps: [
      { id: 'click', kind: 'locator-click', selector: '#save', timeoutMs: 100 },
      { id: 'snapshot', kind: 'assert', acceptanceId: 'save', observation: { kind: 'debug', path: ['transfer', 'snapshot'] }, expected: 'saved-state', timeoutMs: 100 },
      { id: 'saved', kind: 'assert', acceptanceId: 'save', observation: { kind: 'debug', path: ['transfer', 'saveSnapshot'] }, expected: 'saved-state', timeoutMs: 100 },
      { id: 'visible', kind: 'assert', acceptanceId: 'save', observation: { kind: 'visible', selector: '#board' }, expected: true, timeoutMs: 100 },
    ] };
}
function series(): PersistentAcceptanceSeries {
  return { formatVersion: 'persistent-acceptance/1', reportId: 'series', sourceVersion: 'a'.repeat(40), bindingSha256: 'b'.repeat(64),
    scope: { requirement: { artifactId: 'requirement', version: 'v1', location: 'requirement.json' },
      design: { artifactId: 'design', version: 'v1', location: 'design.json' }, plan: { artifactId: 'plan', version: 'v1', location: 'plan.json' },
      designSha256: 'd'.repeat(64), mapVersion: 'map-v1', acceptanceIds: ['save'] },
    segments: ['start', 'restore', 'victory'].map(id => ({ id, prerequisite: id === 'victory' ? 'same-profile-reopened' : 'fresh-profile', plan: plan(id) })),
    checkpoint: { kind: 'close-process-reopen', afterSegment: 'restore', beforeSegment: 'victory', sameProfile: true, sameOrigin: true,
      origin: 'http://127.0.0.1:32123', expected: 'saved-state', snapshot: { kind: 'debug', path: ['transfer', 'snapshot'] },
      savedSnapshot: { kind: 'debug', path: ['transfer', 'saveSnapshot'] } } };
}
type FixtureKind = 'pass' | 'mismatch' | 'exception' | 'unknown' | 'input' | 'no-input';
async function fixture(kind: FixtureKind = 'mismatch', failureAt = 0) {
  const root = await mkdtemp(join(tmpdir(), 'cos39-diagnostic-')), expectedSeries = series(), deadlineAt = Date.now() + 30_000; let calls = 0;
  if (kind === 'no-input') expectedSeries.segments[0].plan.steps[0] = { id: 'click', kind: 'assert', acceptanceId: 'save',
    observation: { kind: 'visible', selector: '#save' }, expected: true, timeoutMs: 100 };
  const report = await executePersistentSeries(expectedSeries, { evidenceRoot: root, deadlineAt, verifyBinding: async () => {} }, async (p, lifecycle) => {
    calls++; const folder = [p.projectId, p.artifact.artifactId, p.artifact.version, p.runId, p.reportId].join('/');
    await mkdir(join(root, folder), { recursive: true });
    const file = (name: string) => folder + '/' + name;
    const pid = 3000 + calls;
    const result: AcceptanceReport = { formatVersion: '1.0.0', kind: 'normal_browser_input', plan: p, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      outcome: 'passed', browser: { name: 'chromium', channel: 'msedge', version: '123', headless: true, viewport: p.viewport }, timeoutMs: 30_000,
      cleanup: { browserPid: pid, forced: false, processExited: true },
      session: { browserPid: pid, profile: lifecycle.profile, commandLineProfile: lifecycle.profile, origin: new URL(p.url).origin,
        closeEvent: true, exitConfirmed: true, exitCode: 0, signalCode: null,
        cdp: { browserProcessIds: [pid], profileArguments: ['--user-data-dir=' + lifecycle.profile] } },
      steps: p.steps.map(step => ({ id: step.id, kind: step.kind, ...('acceptanceId' in step ? { acceptanceId: step.acceptanceId } : {}),
        outcome: 'passed', expected: 'expected' in step ? step.expected : 'input delivered', actual: 'expected' in step ? step.expected : 'input delivered',
        error: null, screenshot: file('final.png'), ...('expected' in step ? { observation: { completed: 1 } } : {}) })),
      errors: [], files: ['final.png', 'browser.webm', 'browser.log', 'report.json'].map(file), reportPath: file('report.json'), evidence: [],
      failureFacts: { formatVersion: 1, termination: null, errors: [] } };
    if (kind !== 'pass' && calls - 1 === failureAt) {
      result.outcome = 'failed'; Object.assign(result.steps[1], { outcome: 'failed', actual: 'wrong', error: '期望存档；实际不同', failure: 'mismatch' });
      if (kind === 'exception') {
        result.errors = ['Page: 原始项目异常'];
        result.failureFacts = { formatVersion: 1, termination: { kind: 'project_mismatch', stepId: 'snapshot' }, errors: [
          { errorIndex: 0, error: result.errors[0], kind: 'page_exception', exception: { exceptionId: 1, sourceURL: p.url + 'src/game.js', line: 1, column: 2 } },
        ] };
        for (const row of result.steps.slice(2)) Object.assign(row, { outcome: 'skipped', actual: null, error: null, screenshot: null, observation: { completed: 0 } });
      }
      if (kind === 'unknown') {
        result.errors = ['Page: 原始项目异常']; result.failureFacts!.errors = [{ errorIndex: 0, error: result.errors[0], kind: 'unknown' }];
      }
      if (kind === 'input') Object.assign(result.steps[0], { outcome: 'failed', actual: null, error: 'input failed', failure: 'input' });
    }
    for (const name of ['final.png', 'browser.webm', 'browser.log']) await writeFile(join(root, file(name)), 'synthetic evidence', 'utf8');
    await writeFile(join(root, result.reportPath), JSON.stringify(result) + '\n', 'utf8'); return result;
  });
  const profileRoot = report.profileRoot;
  const expected = { series: expectedSeries, deadlineAt, sourceVersion: expectedSeries.sourceVersion, reportPath: report.reportPath };
  const options = { evidenceRoot: root, verifyBinding: async () => {} };
  const persist = async (value: PersistentAcceptanceReport = report) => {
    for (const segment of value.segments) await writeFile(join(root, segment.report.reportPath), JSON.stringify(segment.report) + '\n', 'utf8');
    await writeFile(join(root, value.reportPath), JSON.stringify(value) + '\n', 'utf8');
  };
  const cleanup = async () => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir())); assert.ok(basename(root).startsWith('cos39-diagnostic-'));
    assert.equal(dirname(resolve(profileRoot)), resolve(tmpdir())); assert.ok(basename(profileRoot).startsWith('cosmos-browser-'));
    await rm(root, { recursive: true, force: true }); await rm(profileRoot, { recursive: true, force: true });
  };
  return { root, report, expected, options, persist, cleanup, calls };
}
async function diagnostic(f: Awaited<ReturnType<typeof fixture>>, report: unknown = f.report, expected: PersistentDiagnosticExpected = f.expected,
  options: PersistentDiagnosticOptions = f.options) {
  assert.equal(typeof diagnose, 'function', 'COS39 exports its probe diagnosis API');
  return diagnose(task, report, expected, options);
}
function insufficient(result: Diagnostics) {
  assert.ok(result.issues.length); assert.ok(result.issues.every(issue => issue.classification === 'insufficient_evidence'));
  assert.deepEqual(result.passedChecks, []);
}

test('COS39 diagnoses a reliable early mismatch and attributed project exception without passing an unreached checkpoint', async () => {
  for (const kind of ['mismatch', 'exception'] as const) {
    const f = await fixture(kind);
    try {
      const before = JSON.stringify(f.report), raw = await readFile(join(f.root, f.report.reportPath), 'utf8'), result = await diagnostic(f);
      assert.equal(result.reportValid, true); assert.equal(f.calls, 1); assert.equal(f.report.outcome, 'failed'); assert.equal(f.report.checkpoint.outcome, 'skipped');
      assert.equal(result.issues.length, 1); assert.equal(result.issues[0].classification, 'code_defect');
      assert.equal(result.issues[0].checkId, 'persistent/start/browser/snapshot');
      assert.ok(result.passedChecks.every((check: any) => check.checkId.startsWith('persistent/start/')));
      assert.equal(JSON.stringify(f.report), before); assert.equal(await readFile(join(f.root, f.report.reportPath), 'utf8'), raw);
      f.report.errors[0] = 'arbitrary unrelated error words'; f.report.failureFacts!.errors[0].error = f.report.errors[0]; await f.persist();
      assert.equal((await diagnostic(f)).issues[0].classification, 'code_defect');
    } finally { await f.cleanup(); }
  }
});

test('COS39 complete success proves exact reopen and keeps repeated segment step IDs distinct', async () => {
  const f = await fixture('pass'); let checked = 0;
  try {
    const result = await diagnostic(f, f.report, f.expected, { ...f.options, verifyBinding: async () => { checked++; } });
    assert.equal(result.reportValid, true); assert.deepEqual(result.issues, []); assert.equal(checked, 2);
    assert.equal(result.passedChecks.length, 9); assert.equal(new Set(result.passedChecks.map((check: any) => check.checkId)).size, 9);
    assert.equal(f.report.checkpoint.outcome, 'passed');
  } finally { await f.cleanup(); }
});

test('COS39 reliable failures at the save and reopened segments retain only actual passing witnesses', async () => {
  for (const failureAt of [1, 2]) {
    const f = await fixture('exception', failureAt);
    try {
      const result = await diagnostic(f);
      assert.equal(result.reportValid, true); assert.equal(result.issues[0].classification, 'code_defect');
      assert.equal(f.calls, failureAt + 1); assert.equal(f.report.checkpoint.outcome, failureAt === 1 ? 'skipped' : 'failed');
      assert.equal(result.passedChecks.length, failureAt * 3);
      assert.ok(result.passedChecks.every(check => !check.checkId.includes('/checkpoint')));
    } finally { await f.cleanup(); }
  }
});

test('COS39 unknown lifecycle and undelivered input cannot retain code defects', async () => {
  for (const kind of ['unknown', 'input', 'no-input'] as const) {
    const f = await fixture(kind);
    try { insufficient(await diagnostic(f)); } finally { await f.cleanup(); }
  }
});

test('COS39 rejects legacy, malformed, reordered and contradictory aggregate facts', async () => {
  const mutations: ((report: any) => void)[] = [
    r => { delete r.failureFacts; }, r => { r.failureFacts = null; }, r => { r.failureFacts.formatVersion = 2; },
    r => { r.failureFacts.errors = []; }, r => { r.failureFacts.errors.push({ ...r.failureFacts.errors[0] }); },
    r => { r.failureFacts.errors[0].errorIndex = 1; }, r => { r.failureFacts.errors[0].error = 'different'; },
    r => { r.failureFacts.errors[0].segmentId = 'restore'; }, r => { r.failureFacts.errors[0].phase = 'unknown'; },
    r => { r.failureFacts.errors[0].kind = 'unknown'; }, r => { r.failureFacts.errors[0].phase = 'guard'; r.failureFacts.errors[0].kind = 'cancelled'; },
    r => { r.failureFacts.errors[0].phase = 'final_publication'; r.failureFacts.errors[0].kind = 'binding'; },
    r => { r.failureFacts.errors[0].extra = true; }, r => { r.failureFacts.extra = true; },
    r => { r.segments[0].id = 'restore'; }, r => { r.outcome = 'passed'; },
    r => { r.checkpoint.outcome = 'passed'; }, r => { r.checkpoint.actual = 'saved-state'; },
    r => { r.startedAt = 0; }, r => { r.segments[0].report.steps[1].error = null; },
  ];
  const f = await fixture();
  try {
    for (const mutate of mutations) { const changed = structuredClone(f.report); mutate(changed); await f.persist(changed); insufficient(await diagnostic(f, changed)); }
  } finally { await f.cleanup(); }
});

test('COS39 rejects changed current candidate, plan, scope, source, deadline and task binding', async () => {
  const f = await fixture();
  try {
    for (const mutate of [
      (e: any) => { e.series.segments[0].plan.artifact.version = 'v2'; }, (e: any) => { e.series.segments[0].plan.steps[1].expected = 'new'; },
      (e: any) => { e.series.bindingSha256 = 'c'.repeat(64); }, (e: any) => { e.series.scope.mapVersion = 'map-v2'; },
      (e: any) => { e.series.scope.design.version = 'v2'; }, (e: any) => { e.sourceVersion = 'c'.repeat(40); },
      (e: any) => { e.series.sourceVersion = 'c'.repeat(40); }, (e: any) => { e.deadlineAt++; },
      (e: any) => { e.reportPath = 'other/report.json'; },
    ]) { const expected = structuredClone(f.expected); mutate(expected); insufficient(await diagnostic(f, f.report, expected)); }
    assert.equal(typeof diagnose, 'function');
    insufficient(await diagnose({ ...task, artifacts: [{ ...candidate, version: 'v2' }] }, f.report, f.expected, f.options));
    insufficient(await diagnose({ ...task, taskId: 'other' }, f.report, f.expected, f.options));
  } finally { await f.cleanup(); }
});

test('COS39 rejects damaged raw reports, missing evidence and unproven owned exit', async () => {
  const f = await fixture('exception');
  try {
    for (const mutate of [
      (r: any) => { r.segments[0].report.cleanup.processExited = null; }, (r: any) => { r.segments[0].report.session.exitConfirmed = false; },
      (r: any) => { r.segments[0].report.session.browserPid++; }, (r: any) => { r.segments[0].report.session.commandLineProfile += '-changed'; },
      (r: any) => { r.segments[0].report.session.origin = 'http://localhost:32123'; }, (r: any) => { r.segments[0].report.session.cdp.browserProcessIds.push(9999); },
      (r: any) => { delete r.segments[0].report.failureFacts; }, (r: any) => { r.segments[0].report.steps[1].observation.completed = 0; },
      (r: any) => { r.segments[0].report.steps[1].actual = { fake: true }; },
    ]) { const changed = structuredClone(f.report); mutate(changed); await f.persist(changed); insufficient(await diagnostic(f, changed)); }
    await f.persist(); await writeFile(join(f.root, f.report.reportPath), '{}', 'utf8'); insufficient(await diagnostic(f));
    await f.persist(); await writeFile(join(f.root, f.report.segments[0].report.reportPath), '{}', 'utf8'); insufficient(await diagnostic(f));
    await f.persist();
    for (const suffix of ['.png', '.webm', '.log']) {
      const path = f.report.segments[0].report.files.find(file => file.endsWith(suffix))!;
      await writeFile(join(f.root, path), '', 'utf8'); insufficient(await diagnostic(f)); await writeFile(join(f.root, path), 'synthetic evidence', 'utf8');
    }
  } finally { await f.cleanup(); }
});

test('COS39 consumer drains current binding and cancellation after raw evidence reads', async () => {
  const f = await fixture();
  try {
    for (const fault of ['cancel-before', 'cancel-after', 'binding-after']) {
      const controller = new AbortController(); let calls = 0;
      if (fault === 'cancel-before') controller.abort();
      insufficient(await diagnostic(f, f.report, f.expected, { ...f.options, signal: controller.signal, verifyBinding: async () => {
        if (++calls === 2) { if (fault === 'cancel-after') controller.abort(); else throw new Error('Expected game value; observed wrong value'); }
      } } as any));
    }
  } finally { await f.cleanup(); }
});

test('COS39 rejects an array-coerced project exception source URL', async () => {
  const f = await fixture('exception');
  try {
    const changed = structuredClone(f.report), source = changed.segments[0].report.failureFacts!.errors[0].exception!;
    (source as any).sourceURL = [source.sourceURL];
    await f.persist(changed); insufficient(await diagnostic(f, changed));
  } finally { await f.cleanup(); }
});

test('COS39 checks nested exception types and declared error fields before Source32 diagnosis', async () => {
  const f = await fixture('exception');
  const mutations: ((facts: any) => void)[] = [
    facts => { facts.errors[0].exception.sourceURL = { url: facts.errors[0].exception.sourceURL }; },
    facts => { facts.errors[0].exception.sourceURL = [[facts.errors[0].exception.sourceURL]]; },
    facts => { facts.errors[0].exception.sourceURL = null; }, facts => { delete facts.errors[0].exception.sourceURL; },
    facts => { facts.errors[0].exception = null; }, facts => { facts.errors[0].exception = []; },
    facts => { delete facts.errors[0].exception; }, facts => { facts.errors[0].exception.extra = true; },
    facts => { facts.errors[0].exception.line = '1'; }, facts => { facts.errors[0].exception.column = [2]; },
    facts => { facts.errors[0].exception.exceptionId = null; }, facts => { delete facts.errors[0].exception.column; },
    facts => { facts.errors[0].stepId = 'snapshot'; }, facts => { facts.errors[0].stepId = null; },
    facts => { facts.errors[0].stepId = ['snapshot']; }, facts => { facts.errors[0].extra = true; },
    facts => { facts.errors[0].kind = ['page_exception']; },
  ];
  try {
    assert.equal((await diagnostic(f)).issues[0].classification, 'code_defect');
    for (const mutate of mutations) {
      const changed = structuredClone(f.report), before = JSON.stringify(changed.segments[0].report.errors);
      mutate(changed.segments[0].report.failureFacts); await f.persist(changed); insufficient(await diagnostic(f, changed));
      assert.equal(JSON.stringify(changed.segments[0].report.errors), before);
    }
  } finally { await f.cleanup(); }
});

test('COS39 checks termination fields and error kind to step associations', async () => {
  const f = await fixture('exception');
  const mutations: ((facts: any) => void)[] = [
    facts => { facts.termination = []; }, facts => { facts.termination = {}; },
    facts => { facts.termination.stepId = null; }, facts => { delete facts.termination.stepId; },
    facts => { facts.termination.stepId = 'saved'; }, facts => { facts.termination.stepId = ['snapshot']; },
    facts => { facts.termination.extra = true; }, facts => { facts.termination.kind = ['project_mismatch']; },
    facts => { facts.errors[0].kind = 'observation_budget'; facts.errors[0].stepId = 'snapshot'; },
    facts => { facts.errors[0].kind = 'termination_evidence'; facts.errors[0].stepId = 'snapshot'; },
  ];
  try {
    for (const mutate of mutations) { const changed = structuredClone(f.report); mutate(changed.segments[0].report.failureFacts);
      await f.persist(changed); insufficient(await diagnostic(f, changed)); }
  } finally { await f.cleanup(); }
});

test('COS39 accepts declared nullable and local observation facts with their exact step associations', async () => {
  const f = await fixture('exception');
  try {
    for (const local of [false, true]) {
      const changed = structuredClone(f.report), report = changed.segments[0].report, facts = report.failureFacts!;
      if (local) {
        facts.termination = { kind: 'observation_budget', stepId: 'snapshot' }; report.cleanup.forced = true;
        report.steps[1].failure = 'observation_budget';
        for (const kind of ['observation_budget', 'termination_evidence'] as const) {
          const error = '原始有界观察证据 ' + kind;
          facts.errors.push({ errorIndex: report.errors.length, error, kind, stepId: 'snapshot' }); report.errors.push(error);
        }
      } else {
        facts.termination = null;
        for (const row of report.steps.slice(2)) Object.assign(row, { outcome: 'passed', actual: row.expected, error: null,
          screenshot: report.files.find(file => file.endsWith('.png'))!, observation: { completed: 1 } });
      }
      await f.persist(changed);
      const raw = await readFile(join(f.root, changed.reportPath), 'utf8'), result = await diagnostic(f, changed);
      assert.equal(result.reportValid, true); assert.equal(result.issues[0].classification, 'code_defect');
      assert.equal(await readFile(join(f.root, changed.reportPath), 'utf8'), raw);
      if (local) for (const mutate of [
        (r: any) => { r.failureFacts.errors[1].stepId = 'saved'; }, (r: any) => { r.failureFacts.errors[1].stepId = null; },
        (r: any) => { r.failureFacts.errors[1].exception = r.failureFacts.errors[0].exception; },
        (r: any) => { r.failureFacts.termination.kind = 'project_mismatch'; },
      ]) { const invalid = structuredClone(changed); mutate(invalid.segments[0].report); await f.persist(invalid); insufficient(await diagnostic(f, invalid)); }
    }
  } finally { await f.cleanup(); }
});
