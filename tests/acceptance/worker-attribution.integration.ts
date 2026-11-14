import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import type { TaskContract } from '../../src/contracts/types.ts';
import type { AcceptancePlan } from '../../src/acceptance/plan.ts';
import { runPersistentAcceptance } from '../../src/acceptance/persistent.ts';
import type { PersistentAcceptanceSeries } from '../../src/acceptance/persistent.ts';
import { diagnosePersistentBrowser } from '../../src/runtime/adapters/transfer/persistent-diagnostics.ts';
import { removeOwned } from '../../src/artifacts/paths.ts';

// Authored fixture, real production Edge flags/profile lifecycle; no provider or generated-game claim.
test('real persistent Edge excludes browser extension workers while preserving exact project mismatches', { timeout: 90_000 }, async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const fixture = await readFile(new URL('./fixtures/persistent.html', import.meta.url), 'utf8');
  const sourceVersion = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, windowsHide: true }).toString().trim();
  const files = ['src/acceptance/runner.ts', 'src/acceptance/persistent.ts', 'tests/acceptance/fixtures/persistent.html', 'tests/acceptance/worker-attribution.integration.ts'];
  const digest = async () => {
    const hash = createHash('sha256'); for (const file of files) hash.update(file).update(await readFile(join(root, file)));
    return hash.digest('hex');
  };
  const bindingSha256 = await digest(), verifyBinding = async () => { assert.equal(await digest(), bindingSha256); };
  const server = createServer((_request, response) => { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(fixture); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = 'http://127.0.0.1:' + address.port + '/', evidenceRoot = join(root, '.cosmos/r63-worker-attribution/real-' + Date.now());
  const summaries = [], expected = '{"fixture":"cos37-mouse-save","count":1}';
  try {
    for (const mismatch of [false, true]) {
      const runId = mismatch ? 'mismatch' : 'pass';
      const plan = (resume: boolean): AcceptancePlan => ({ formatVersion: '1.0.0', projectId: 'worker-attribution', taskId: 'coding', runId,
        reportId: resume ? 'reopened' : 'first', specVersion: 'synthetic-v1',
        artifact: { artifactId: 'fixture', version: 'v1', location: 'tests/acceptance/fixtures/persistent.html' },
        url, viewport: { width: 1280, height: 720 }, acceptanceIds: ['save', 'offline'], steps: [
          { id: 'offline', kind: 'assert', acceptanceId: 'offline', observation: { kind: 'external-requests' }, expected: 0, timeoutMs: 1000 },
          { id: 'normal-mouse', kind: 'mouse-click', selector: resume ? '#continue' : '#save', x: 0.5, y: 0.5 },
          { id: 'snapshot', kind: 'wait-for', acceptanceId: 'save', observation: { kind: 'debug', path: ['transfer', 'snapshot'] }, expected, timeoutMs: 1000 },
          { id: 'saved', kind: 'assert', acceptanceId: 'save', observation: { kind: 'debug', path: ['transfer', 'saveSnapshot'] }, expected, timeoutMs: 1000 },
          { id: 'visible-board', kind: 'assert', acceptanceId: 'save', observation: { kind: 'text', selector: '#board' },
            expected: resume && mismatch ? '保存值：2' : '保存值：1', timeoutMs: 1000 },
        ] });
      const series: PersistentAcceptanceSeries = { formatVersion: 'persistent-acceptance/1', sourceVersion, bindingSha256, reportId: 'series',
        segments: [{ id: 'save', prerequisite: 'fresh-profile', plan: plan(false) }, { id: 'resume', prerequisite: 'same-profile-reopened', plan: plan(true) }],
        checkpoint: { kind: 'close-process-reopen', afterSegment: 'save', beforeSegment: 'resume', sameProfile: true, sameOrigin: true,
          origin: new URL(url).origin, expected, snapshot: { kind: 'debug', path: ['transfer', 'snapshot'] }, savedSnapshot: { kind: 'debug', path: ['transfer', 'saveSnapshot'] } } };
      const deadlineAt = Date.now() + 35_000;
      const report = await runPersistentAcceptance(series, { evidenceRoot, channel: 'msedge', deadlineAt, timeoutMs: 35_000, verifyBinding });
      try {
        assert.equal(report.outcome, mismatch ? 'failed' : 'passed', JSON.stringify(report));
        assert.equal(report.segments.length, 2); const [first, reopened] = report.segments.map(segment => segment.report.session!);
        assert.notEqual(first.browserPid, reopened.browserPid); assert.equal(first.profile, reopened.profile); assert.equal(first.origin, reopened.origin);
        const observedTargets = [];
        for (const segment of report.segments) {
          assert.deepEqual(segment.report.errors, []);
          assert.equal(segment.report.cleanup.processExited, true); assert.equal(segment.report.cleanup.forced, false);
          assert.equal(segment.report.session!.exitConfirmed, true); assert.equal(segment.report.session!.closeEvent, true);
          assert.throws(() => process.kill(segment.report.session!.browserPid, 0));
          assert.deepEqual(segment.report.session!.cdp!.profileArguments, ['--user-data-dir=' + segment.report.session!.profile]);
          assert.equal(segment.report.steps[0].outcome, 'passed'); assert.equal(segment.report.steps[0].actual, 0);
          const logs = (await readFile(join(evidenceRoot, segment.report.files.find(file => file.endsWith('browser.log'))!), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
          const targets = logs.filter(row => row.kind === 'network-target').map(row => JSON.parse(row.message));
          for (const target of targets) {
            assert.equal(target.attribution, 'browser-extension'); assert.equal(new URL(target.url).protocol, 'chrome-extension:');
            assert.equal(target.openerId, null); assert.equal(target.openerFrameId, null);
          }
          observedTargets.push({ segmentId: segment.id, targets });
        }
        const task = { taskId: 'coding', runId, specVersion: 'synthetic-v1', acceptanceIds: ['save', 'offline'], artifacts: [plan(false).artifact] } as TaskContract;
        const diagnosis = await diagnosePersistentBrowser(task, report, { series, deadlineAt, sourceVersion, reportPath: report.reportPath }, { evidenceRoot, verifyBinding });
        assert.equal(diagnosis.reportValid, true, JSON.stringify(diagnosis));
        if (mismatch) {
          const row = report.segments[1].report.steps.at(-1)!;
          assert.equal(row.id, 'visible-board'); assert.equal(row.failure, 'mismatch'); assert.equal(row.actual, '保存值：1'); assert.equal(row.expected, '保存值：2');
          assert.equal(diagnosis.issues.length, 1, JSON.stringify(diagnosis)); assert.equal(diagnosis.issues[0].classification, 'code_defect');
        } else assert.deepEqual(diagnosis.issues, []);
        summaries.push({ runId, sourceVersion, bindingSha256, reportPath: report.reportPath, observedTargets, diagnosis,
          pids: [first.browserPid, reopened.browserPid], profile: first.profile, browser: report.segments[0].report.browser.version });
      } finally {
        if (report.segments.length && report.segments.every(segment => segment.report.session?.exitConfirmed)) await removeOwned(tmpdir(), report.profileRoot);
      }
    }
    await writeFile(join(evidenceRoot, 'summary.json'), JSON.stringify(summaries, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify({ evidenceRoot, sourceVersion, bindingSha256, cases: summaries.map(row => ({ runId: row.runId, reportPath: row.reportPath,
      extensionTargets: row.observedTargets.map(segment => segment.targets.length), reportValid: row.diagnosis.reportValid,
      classifications: row.diagnosis.issues.map(issue => issue.classification), pids: row.pids })), profilesRemoved: true, modelCost: 0 }));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
