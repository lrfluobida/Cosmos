import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AcceptancePlan } from '../../src/acceptance/plan.ts';
import type { Observation } from '../../src/acceptance/plan.ts';
import type { AcceptanceReport } from '../../src/acceptance/runner.ts';
import * as api from '../../src/acceptance/persistent.ts';
import * as consumer from '../../probes/transfer/acceptance.ts';

const snapshot: Observation = { kind: 'debug', path: ['transfer', 'snapshot'] };
const saved: Observation = { kind: 'debug', path: ['transfer', 'saveSnapshot'] };
function plan(id: string, resume = false): AcceptancePlan {
  return { formatVersion: '1.0.0', projectId: 'persistent-fixture', taskId: 'COS-37', runId: 'unit-run', reportId: id,
    specVersion: '1.0', artifact: { artifactId: 'fixture', version: 'fixture-v1', location: 'fixture' },
    url: 'http://127.0.0.1:32123/', viewport: { width: 1280, height: 720 }, acceptanceIds: ['save'], steps: [
      { id: id + '-click', kind: 'locator-click', selector: resume ? '#continue' : '#save', timeoutMs: 100 },
      { id: id + '-snapshot', kind: 'assert', acceptanceId: 'save', observation: structuredClone(snapshot), expected: 'saved-state', timeoutMs: 100 },
      { id: id + '-saved', kind: 'assert', acceptanceId: 'save', observation: structuredClone(saved), expected: 'saved-state', timeoutMs: 100 },
      { id: id + '-visible', kind: 'assert', acceptanceId: 'save', observation: { kind: 'visible', selector: '#board' }, expected: true, timeoutMs: 100 },
    ] };
}
function series(): any {
  return { formatVersion: 'persistent-acceptance/1', reportId: 'series', sourceVersion: 'a'.repeat(40), bindingSha256: 'b'.repeat(64),
    segments: [{ id: 'restore', prerequisite: 'fresh-profile', plan: plan('restore') },
      { id: 'victory', prerequisite: 'same-profile-reopened', plan: plan('victory', true) }],
    checkpoint: { kind: 'close-process-reopen', afterSegment: 'restore', beforeSegment: 'victory', sameProfile: true, sameOrigin: true,
      origin: 'http://127.0.0.1:32123', expected: 'saved-state', snapshot: structuredClone(snapshot), savedSnapshot: structuredClone(saved) } };
}
async function fakeReport(p: AcceptancePlan, root: string, profile: string, pid: number): Promise<AcceptanceReport> {
  const folder = p.reportId;
  await mkdir(join(root, folder));
  for (const name of ['final.png', 'browser.webm', 'browser.log', 'report.json']) await writeFile(join(root, folder, name), 'unit evidence');
  const report: AcceptanceReport = { formatVersion: '1.0.0', kind: 'normal_browser_input', plan: p, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
    outcome: 'passed', browser: { name: 'chromium', channel: 'msedge', version: '1.0', headless: true, viewport: p.viewport }, timeoutMs: 10_000,
    cleanup: { browserPid: pid, forced: false, processExited: true },
    session: { browserPid: pid, profile, commandLineProfile: profile, origin: new URL(p.url).origin,
      closeEvent: true, exitConfirmed: true, exitCode: 0, signalCode: null },
    steps: p.steps.map(step => ({ id: step.id, kind: step.kind, ...('acceptanceId' in step ? { acceptanceId: step.acceptanceId } : {}),
      outcome: 'passed', expected: 'expected' in step ? step.expected : 'input delivered', actual: 'expected' in step ? step.expected : 'input delivered',
      error: null, screenshot: folder + '/final.png', ...('expected' in step ? { observation: { completed: 1 } } : {}) })),
    errors: [], files: ['final.png', 'browser.webm', 'browser.log', 'report.json'].map(name => folder + '/' + name),
    reportPath: folder + '/report.json', evidence: [], failureFacts: { formatVersion: 1, termination: null, errors: [] } };
  await writeFile(join(root, report.reportPath), JSON.stringify(report), 'utf8');
  return report;
}

test('finite series rejects changed origin/candidate, unknown fields and false reopen prerequisites', () => {
  assert.equal(typeof api.validatePersistentSeries, 'function');
  assert.deepEqual(api.validatePersistentSeries(series()), []);
  for (const change of [
    (s: any) => { s.segments[1].plan.url = 'http://localhost:32123/'; },
    (s: any) => { s.segments[1].plan.artifact.version = 'fixture-v2'; },
    (s: any) => { s.profile = 'C:/Users/User/Edge'; },
    (s: any) => { s.segments[1].prerequisite = 'fresh-profile'; },
    (s: any) => { s.checkpoint.expected = 'other'; },
    (s: any) => { s.segments[1].plan.steps[0].kind = 'reload'; },
  ]) { const changed = series(); change(changed); assert.ok(api.validatePersistentSeries(changed).length); }
});

test('public browser identity requires one browser PID and the exact unique absolute owned profile', () => {
  assert.equal(typeof api.assertPersistentIdentity, 'function');
  const profile = join(tmpdir(), 'owned-profile');
  const info = [{ type: 'browser', id: 2345 }, { type: 'renderer', id: 2346 }];
  assert.deepEqual(api.assertPersistentIdentity(info, ['edge', '--user-data-dir=' + profile], 2345, profile), { browserPid: 2345, commandLineProfile: profile });
  const invalidCases: [unknown, unknown, number, string][] = [
    [info, ['edge'], 2345, profile], [info, ['--user-data-dir=' + profile, '--user-data-dir=elsewhere'], 2345, profile],
    [[...info, { type: 'browser', id: 2347 }], ['--user-data-dir=' + profile], 2345, profile],
    [info, ['--user-data-dir=' + profile], 2346, profile], [info, ['--user-data-dir=relative'], 2345, 'relative'],
  ];
  for (const [processes, args, pid, path] of invalidCases) assert.throws(() => api.assertPersistentIdentity(processes, args, pid, path), /identity|profile|PID/);
  assert.equal(typeof api.filterBrowserEnvironment, 'function');
  assert.deepEqual(api.filterBrowserEnvironment({ PATH: 'safe-path', SystemRoot: 'safe-system', DEEPSEEK_API_KEY: 'forbidden', NODE_OPTIONS: 'forbidden' }),
    { PATH: 'safe-path', SystemRoot: 'safe-system' });
});

test('checkpoint requires actual saved state, input, media and positive full process exit', async () => {
  assert.equal(typeof api.verifyReopenCheckpoint, 'function');
  const root = await mkdtemp(join(tmpdir(), 'cos37-unit-'));
  try {
    const s = series(), profile = join(root, 'private-profile');
    const report = await fakeReport(s.segments[0].plan, root, profile, 2345);
    await api.verifyReopenCheckpoint(s, report, root, profile);
    for (const change of [
      (r: any) => { r.steps[2].actual = 'wrong'; }, (r: any) => { r.steps[0].outcome = 'skipped'; },
      (r: any) => { r.cleanup.processExited = false; }, (r: any) => { r.session.closeEvent = false; },
      (r: any) => { r.session.commandLineProfile += '-changed'; }, (r: any) => { r.files = r.files.filter((f: string) => !f.endsWith('.webm')); },
      (r: any) => { r.errors.push('unknown'); },
    ]) { const changed = structuredClone(report); change(changed); await assert.rejects(api.verifyReopenCheckpoint(s, changed, root, profile)); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('series uses one absolute deadline, rechecks binding and reopens only the same internally owned profile', async () => {
  assert.equal(typeof api.executePersistentSeries, 'function');
  const root = await mkdtemp(join(tmpdir(), 'cos37-unit-'));
  const deadlineAt = Date.now() + 10_000, calls: any[] = []; let checked = 0;
  try {
    const report = await api.executePersistentSeries(series(), { evidenceRoot: root, deadlineAt, verifyBinding: async () => { checked++; } },
      async (p: AcceptancePlan, lifecycle: any) => { calls.push(lifecycle); return fakeReport(p, root, lifecycle.profile, 3000 + calls.length); });
    assert.equal(report.outcome, 'passed'); assert.equal(report.deadlineAt, deadlineAt);
    assert.equal(calls.length, 2); assert.ok(calls.every(call => call.deadlineAt === deadlineAt));
    assert.equal(calls[0].profile, calls[1].profile); assert.ok(checked >= 6);
    assert.notEqual(report.segments[0].report.session!.browserPid, report.segments[1].report.session!.browserPid);
    assert.deepEqual(JSON.parse(await readFile(join(root, report.reportPath), 'utf8')), report);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('cancel, deadline, scope change, missing exit and reused PID stop the series and retain failed reports', async () => {
  assert.equal(typeof api.executePersistentSeries, 'function');
  for (const fault of ['cancel', 'late-cancel', 'deadline', 'scope', 'exit', 'pid']) {
    const root = await mkdtemp(join(tmpdir(), 'cos37-unit-')); const controller = new AbortController(); let calls = 0, checks = 0;
    try {
      const report = await api.executePersistentSeries(series(), { evidenceRoot: root, deadlineAt: Date.now() + (fault === 'deadline' ? 2200 : 10_000),
        signal: controller.signal, verifyBinding: async () => {
          checks++;
          if (fault === 'scope' && checks === 3) throw new Error('source changed');
          if (fault === 'late-cancel' && checks === 6) setTimeout(() => controller.abort(), 0);
        } },
      async (p: AcceptancePlan, lifecycle: any) => {
        calls++; const r = await fakeReport(p, root, lifecycle.profile, fault === 'pid' ? 3001 : 3000 + calls);
        if (fault === 'cancel') controller.abort();
        if (fault === 'deadline') await new Promise(resolve => setTimeout(resolve, 1300));
        if (fault === 'exit') r.cleanup.processExited = false;
        return r;
      });
      assert.equal(report.outcome, 'failed', fault); assert.ok(report.errors.length, fault);
      assert.equal(calls, ['pid', 'late-cancel'].includes(fault) ? 2 : 1, fault);
      assert.ok(report.segments.length); assert.equal(JSON.parse(await readFile(join(root, report.reportPath), 'utf8')).outcome, 'failed');
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test('COS-36 reader preserves the immutable preparation draft and its exact eight segments/checkpoint', () => {
  assert.equal(typeof consumer.transferPersistentSeries, 'function');
  const s = series(), names = ['start', 'walk-wall', 'push', 'box-wall', 'double-box', 'restart', 'restore', 'victory'];
  const draft: any = { formatVersion: 'cos16-plan/1', phase: 'preparation-only', executable: false, acceptanceIds: Array.from({ length: 6 }, (_, i) => 'T16-0' + (i + 1)),
    artifact: { artifactId: 'plan', version: 'plan-v1', location: 'plan' }, planSha256: 'b'.repeat(64),
    binding: { candidate: s.segments[0].plan.artifact, runId: 'unit-run', design: { artifact: { artifactId: 'design', version: 'design-v1', location: 'design' },
      requirement: { artifactId: 'requirement', version: 'requirement-v1', location: 'requirement' }, designSha256: 'c'.repeat(64), mapVersion: 'map-v1' } },
    segments: names.map(id => ({ id, executable: false, prerequisite: id === 'victory' ? 'same-profile-reopened' : 'fresh-profile', plan: plan(id, id === 'victory') })),
    checkpoint: { ...s.checkpoint, executable: false, requiredCapability: 'persistent-profile-real-process-reopen-with-evidence' } };
  draft.segments.forEach((segment: any, i: number) => { const id = 'T16-0' + ([1, 2, 3, 3, 3, 4, 5, 6][i]); segment.plan.acceptanceIds = [id]; segment.plan.steps.forEach((step: any) => { if (step.acceptanceId) step.acceptanceId = id; }); });
  const before = structuredClone(draft), result = consumer.transferPersistentSeries(draft, 'a'.repeat(40), 'series');
  assert.deepEqual(draft, before); assert.deepEqual(result.segments.map((segment: any) => segment.id), names);
  assert.equal(result.bindingSha256, draft.planSha256); assert.equal(result.checkpoint.expected, draft.checkpoint.expected);
  assert.ok(result.scope);
  assert.equal(result.scope.designSha256, draft.binding.design.designSha256); assert.equal(result.scope.mapVersion, 'map-v1');
  assert.deepEqual(result.scope.acceptanceIds, draft.acceptanceIds);
  draft.checkpoint.sameOrigin = false; assert.throws(() => consumer.transferPersistentSeries(draft, 'a'.repeat(40), 'series'));
});

test('COS39 returned failed segments record the actual report, exit and evidence boundary', async () => {
  for (const fault of ['mismatch', 'plan', 'exit', 'exit-code', 'exit-flag', 'raw', 'video', 'lifecycle', 'execute']) {
    const root = await mkdtemp(join(tmpdir(), 'cos39-facts-')); let calls = 0;
    try {
      const report = await api.executePersistentSeries(series(), { evidenceRoot: root, deadlineAt: Date.now() + 10_000, verifyBinding: async () => {} },
        async (p: AcceptancePlan, lifecycle: any) => {
          calls++;
          if (fault === 'execute') throw new Error('Expected game value; observed wrong value');
          const r = await fakeReport(p, root, lifecycle.profile, 3001);
          r.outcome = 'failed'; Object.assign(r.steps[1], { outcome: 'failed', actual: 'wrong', error: 'fixed mismatch', failure: 'mismatch' });
          if (fault === 'plan') r.plan.artifact.version = 'wrong';
          if (fault === 'exit') r.session!.exitConfirmed = false;
          if (fault === 'exit-code') delete (r.session as any).exitCode;
          if (fault === 'exit-flag') (r.session as any).closeEvent = 'true';
          if (fault === 'lifecycle') { r.errors.push('arbitrary text'); r.failureFacts!.errors.push({ errorIndex: 0, error: 'arbitrary text', kind: 'unknown' }); }
          await writeFile(join(root, r.reportPath), JSON.stringify(r), 'utf8');
          if (fault === 'raw') await writeFile(join(root, r.reportPath), '{}', 'utf8');
          if (fault === 'video') await writeFile(join(root, 'restore/browser.webm'), '', 'utf8');
          return r;
        });
      assert.equal(report.outcome, 'failed'); assert.equal(calls, 1); assert.equal(report.checkpoint.outcome, 'skipped');
      const facts = (report as any).failureFacts;
      assert.equal(facts?.formatVersion, 1);
      assert.equal(facts.errors.length, report.errors.length);
      assert.equal(facts.errors[0].errorIndex, 0); assert.equal(facts.errors[0].error, report.errors[0]);
      assert.equal(facts.errors[0].segmentId, 'restore');
      const expected = fault === 'plan' ? ['segment_report', 'invalid_segment'] : fault.startsWith('exit') ? ['segment_report', 'owned_exit']
        : ['raw', 'video'].includes(fault) ? ['evidence', 'evidence'] : fault === 'execute' ? ['execute', 'unknown'] : ['segment_report', 'segment_failed'];
      assert.deepEqual([facts.errors[0].phase, facts.errors[0].kind], expected, fault);
      assert.deepEqual(JSON.parse(await readFile(join(root, report.reportPath), 'utf8')), report);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test('COS39 typed guards retain cancellation, deadline and binding sources without parsing text', async () => {
  for (const fault of ['cancel', 'deadline', 'binding', 'profile']) {
    const root = await mkdtemp(join(tmpdir(), 'cos39-guard-')), controller = new AbortController(); let checks = 0, calls = 0;
    try {
      const report = await api.executePersistentSeries(series(), { evidenceRoot: root, deadlineAt: Date.now() + (fault === 'deadline' ? 2200 : 10_000),
        signal: controller.signal, verifyBinding: async () => { if (++checks === 3 && fault === 'binding') throw new Error('acceptance cancelled'); } },
        async (p: AcceptancePlan, lifecycle: any) => {
          calls++; const result = await fakeReport(p, root, lifecycle.profile, 3001);
          if (fault === 'cancel') controller.abort();
          if (fault === 'profile') await writeFile(join(lifecycle.profile, '..', '.owner'), 'changed', 'utf8');
          if (fault === 'deadline') await new Promise(resolveWait => setTimeout(resolveWait, 2250));
          return result;
        });
      assert.equal(calls, 1); assert.equal(report.outcome, 'failed');
      const fact = (report as any).failureFacts?.errors[0];
      assert.equal(fact?.phase, 'guard'); assert.equal(fact.kind, fault === 'cancel' ? 'cancelled' : fault === 'profile' ? 'private_profile' : fault);
      assert.equal(fact.error, report.errors[0]);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test('COS39 publication drains binding and cancellation for failed and passed series', async () => {
  for (const failed of [false, true]) for (const fault of ['cancel', 'binding']) {
    const root = await mkdtemp(join(tmpdir(), 'cos39-publication-')), controller = new AbortController(); let checks = 0, calls = 0;
    try {
      const report = await api.executePersistentSeries(series(), { evidenceRoot: root, deadlineAt: Date.now() + 10_000, signal: controller.signal,
        verifyBinding: async () => {
          if (++checks === (failed ? 4 : 7)) {
            if (fault === 'cancel') controller.abort(); else throw new Error('Expected game value; observed wrong value');
          }
        } }, async (p: AcceptancePlan, lifecycle: any) => {
          const result = await fakeReport(p, root, lifecycle.profile, 3000 + ++calls);
          if (failed) {
            result.outcome = 'failed'; Object.assign(result.steps[1], { outcome: 'failed', actual: 'wrong', error: 'fixed mismatch', failure: 'mismatch' });
            await writeFile(join(root, result.reportPath), JSON.stringify(result), 'utf8');
          }
          return result;
        });
      assert.equal(report.outcome, 'failed', `${failed}/${fault}`); assert.equal(calls, failed ? 1 : 2);
      const fact = (report as any).failureFacts?.errors.at(-1);
      assert.equal(fact?.phase, 'final_publication'); assert.equal(fact.kind, fault === 'cancel' ? 'cancelled' : 'binding');
      assert.equal(fact.errorIndex, report.errors.length - 1); assert.equal(fact.error, report.errors.at(-1));
      assert.deepEqual(JSON.parse(await readFile(join(root, report.reportPath), 'utf8')), report);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});
