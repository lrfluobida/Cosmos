import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAcceptance } from '../../src/acceptance/runner.ts';
import { runPersistentAcceptance, filterBrowserEnvironment } from '../../src/acceptance/persistent.ts';
import type { PersistentAcceptanceSeries } from '../../src/acceptance/persistent.ts';
import type { AcceptancePlan } from '../../src/acceptance/plan.ts';

test('synthetic Edge mouse save survives complete process exit and the default runner remains normal', { timeout: 45_000 }, async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url)), fixture = await readFile(new URL('./fixtures/persistent.html', import.meta.url), 'utf8');
  const sourceVersion = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, windowsHide: true }).toString().trim();
  const files = ['src/acceptance/persistent.ts', 'src/acceptance/runner.ts', 'src/acceptance/process.ts', 'src/acceptance/deadline.ts',
    'src/acceptance/browser.ts', 'src/acceptance/failure-facts.ts', 'tests/acceptance/fixtures/persistent.html'];
  const digest = async () => {
    const hash = createHash('sha256');
    for (const file of files) hash.update(file).update(await readFile(join(root, file)));
    return hash.digest('hex');
  };
  const bindingSha256 = await digest(), server = createServer((_request, response) => { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(fixture); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = 'http://127.0.0.1:' + address.port + '/', runId = 'real-' + Date.now(), expected = '{"fixture":"cos37-mouse-save","count":1}';
  const plan = (reportId: string, resume = false): AcceptancePlan => ({ formatVersion: '1.0.0', projectId: 'cos37-synthetic', taskId: 'COS-37', runId, reportId,
    specVersion: 'synthetic-1', artifact: { artifactId: 'fixture', version: 'synthetic-v1', location: 'tests/acceptance/fixtures/persistent.html' },
    url, viewport: { width: 1280, height: 720 }, acceptanceIds: ['synthetic-save'], steps: [
      ...(resume ? [{ id: 'home', kind: 'assert' as const, acceptanceId: 'synthetic-save', observation: { kind: 'text' as const, selector: '#status' }, expected: '等待继续', timeoutMs: 1000 }]
        : [{ id: 'start', kind: 'locator-click' as const, selector: '#start', timeoutMs: 1000 }]),
      { id: 'normal-mouse', kind: 'mouse-click', selector: resume ? '#continue' : '#save', x: 0.5, y: 0.5 },
      { id: 'snapshot', kind: 'wait-for', acceptanceId: 'synthetic-save', observation: { kind: 'debug', path: ['transfer', 'snapshot'] }, expected, timeoutMs: 1000 },
      { id: 'save', kind: 'wait-for', acceptanceId: 'synthetic-save', observation: { kind: 'debug', path: ['transfer', 'saveSnapshot'] }, expected, timeoutMs: 1000 },
      { id: 'visible-board', kind: 'assert', acceptanceId: 'synthetic-save', observation: { kind: 'text', selector: '#board' }, expected: '保存值：1', timeoutMs: 1000 },
      { id: 'visible-status', kind: 'assert', acceptanceId: 'synthetic-save', observation: { kind: 'text', selector: '#status' }, expected: resume ? '已恢复' : '已保存', timeoutMs: 1000 },
    ] });
  const series: PersistentAcceptanceSeries = { formatVersion: 'persistent-acceptance/1', sourceVersion, bindingSha256, reportId: 'persistent-series',
    segments: [{ id: 'restore', prerequisite: 'fresh-profile', plan: plan('restore') }, { id: 'victory', prerequisite: 'same-profile-reopened', plan: plan('reopen', true) }],
    checkpoint: { kind: 'close-process-reopen', afterSegment: 'restore', beforeSegment: 'victory', sameProfile: true, sameOrigin: true,
      origin: new URL(url).origin, expected, snapshot: { kind: 'debug', path: ['transfer', 'snapshot'] }, savedSnapshot: { kind: 'debug', path: ['transfer', 'saveSnapshot'] } } };
  const evidenceRoot = join(root, '.cosmos/cos37-synthetic'), started = Date.now(), deadlineAt = started + 30_000;
  try {
    const report = await runPersistentAcceptance(series, { evidenceRoot, channel: 'msedge', deadlineAt, timeoutMs: 30_000,
      env: { ...process.env, DEEPSEEK_API_KEY: 'must-not-cross-browser-boundary', NODE_OPTIONS: 'must-not-cross-browser-boundary' },
      verifyBinding: async () => {
        assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, windowsHide: true }).toString().trim(), sourceVersion);
        assert.equal(await digest(), bindingSha256);
      } });
    assert.equal(report.outcome, 'passed', JSON.stringify(report.errors)); assert.equal(report.deadlineAt, deadlineAt);
    assert.equal(report.segments.length, 2); assert.equal(report.checkpoint.outcome, 'passed');
    const [before, after] = report.segments.map(segment => segment.report.session!);
    assert.notEqual(before.browserPid, after.browserPid); assert.equal(before.profile, after.profile); assert.equal(before.origin, after.origin);
    for (const segment of report.segments) {
      assert.equal(segment.report.cleanup.forced, false); assert.equal(segment.report.cleanup.processExited, true);
      assert.equal(segment.report.session!.closeEvent, true); assert.equal(segment.report.session!.exitConfirmed, true);
      assert.deepEqual(segment.report.session!.cdp!.browserProcessIds, [segment.report.session!.browserPid]);
      assert.deepEqual(segment.report.session!.cdp!.profileArguments, ['--user-data-dir=' + segment.report.session!.profile]);
      assert.ok(!segment.report.session!.environmentKeys!.some(key => /api_key|node_options/i.test(key)));
      assert.throws(() => process.kill(segment.report.session!.browserPid, 0));
      for (const file of segment.report.files) assert.ok((await stat(join(evidenceRoot, file))).size > 0, file);
    }
    assert.deepEqual(JSON.parse(await readFile(join(evidenceRoot, report.reportPath), 'utf8')), report);
    const baseline = await runAcceptance(plan('default-baseline'), { evidenceRoot, channel: 'msedge', timeoutMs: 10_000, env: filterBrowserEnvironment(process.env) });
    assert.equal(baseline.outcome, 'passed', JSON.stringify(baseline.errors)); assert.equal(baseline.cleanup.processExited, true); assert.equal(baseline.session, undefined);
    console.log(JSON.stringify({ syntheticOnly: true, sourceVersion, sourceBytesSha256: bindingSha256, reportPath: report.reportPath,
      browser: report.segments.map(segment => segment.report.browser.version), pids: [before.browserPid, after.browserPid], profile: before.profile,
      origin: before.origin, fullExitConfirmed: true, credentialForwarded: false, totalMs: Date.now() - started, defaultReportPath: baseline.reportPath }));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
