import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPersistentAcceptance } from '../../src/acceptance/persistent.ts';
import type { PersistentAcceptanceSeries } from '../../src/acceptance/persistent.ts';
import type { AcceptancePlan } from '../../src/acceptance/plan.ts';

test('real persistent Edge blocks service worker registration before parent/frame scripts and after process reopen', { timeout: 30_000 }, async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url)), fixture = await readFile(new URL('./fixtures/persistent.html', import.meta.url), 'utf8');
  const sourceVersion = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, windowsHide: true }).toString().trim();
  const sourceFiles = ['src/acceptance/persistent.ts', 'tests/acceptance/fixtures/persistent.html', 'tests/acceptance/service-workers.integration.ts'];
  const digest = async () => {
    const hash = createHash('sha256'); for (const file of sourceFiles) hash.update(file).update(await readFile(join(root, file)));
    return hash.digest('hex');
  };
  const bindingSha256 = await digest(); let workerRequests = 0, frameRequests = 0;
  const probe = (name: string) => `<script>(async () => {
    const registration = await navigator.serviceWorker.register('/sw.js');
    const registrations = await navigator.serviceWorker.getRegistrations();
    const value = '${name}:returned=' + Boolean(registration) + ';registrations=' + registrations.length + ';controlled=' + Boolean(navigator.serviceWorker.controller);
    if ('${name}' === 'frame') parent.postMessage(value, location.origin);
    else document.querySelector('#sw-parent').textContent = value;
  })().catch(error => console.error('Service worker probe failed: ' + error.message));</script>`;
  const parentProbe = `<div id="sw-parent">pending</div><div id="sw-frame">pending</div>
    <script>addEventListener('message', event => { if (event.origin === location.origin && typeof event.data === 'string' && event.data.startsWith('frame:')) document.querySelector('#sw-frame').textContent = event.data; });</script>
    <iframe src="/frame"></iframe>${probe('parent')}`;
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.url === '/sw.js') { workerRequests++; response.setHeader('Content-Type', 'text/javascript'); response.end("self.addEventListener('fetch', () => {});"); return; }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (request.url === '/frame') { frameRequests++; response.end('<!doctype html><meta charset="utf-8">' + probe('frame')); }
    else response.end(fixture + parentProbe);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = 'http://127.0.0.1:' + address.port + '/', runId = 'real-sw-' + Date.now(), expected = '{"fixture":"cos37-mouse-save","count":1}';
  const plan = (reportId: string, resume: boolean): AcceptancePlan => ({ formatVersion: '1.0.0', projectId: 'cos37-service-workers', taskId: 'COS-37', runId, reportId,
    specVersion: 'synthetic-sw-1', artifact: { artifactId: 'fixture', version: 'synthetic-sw-v1', location: 'tests/acceptance/fixtures/persistent.html' },
    url, viewport: { width: 1280, height: 720 }, acceptanceIds: ['service-workers'], steps: [
      ...['parent', 'frame'].map(name => ({ id: 'sw-' + name, kind: 'wait-for' as const, acceptanceId: 'service-workers',
        observation: { kind: 'text' as const, selector: '#sw-' + name }, expected: name + ':returned=false;registrations=0;controlled=false', timeoutMs: 2000 })),
      { id: 'normal-mouse', kind: 'mouse-click', selector: resume ? '#continue' : '#save', x: 0.5, y: 0.5 },
      { id: 'snapshot', kind: 'wait-for', acceptanceId: 'service-workers', observation: { kind: 'debug', path: ['transfer', 'snapshot'] }, expected, timeoutMs: 1000 },
      { id: 'save', kind: 'wait-for', acceptanceId: 'service-workers', observation: { kind: 'debug', path: ['transfer', 'saveSnapshot'] }, expected, timeoutMs: 1000 },
      { id: 'visible-board', kind: 'assert', acceptanceId: 'service-workers', observation: { kind: 'text', selector: '#board' }, expected: '保存值：1', timeoutMs: 1000 },
    ] });
  const series: PersistentAcceptanceSeries = { formatVersion: 'persistent-acceptance/1', sourceVersion, bindingSha256, reportId: 'service-workers-series',
    segments: [{ id: 'restore', prerequisite: 'fresh-profile', plan: plan('first', false) }, { id: 'victory', prerequisite: 'same-profile-reopened', plan: plan('reopened', true) }],
    checkpoint: { kind: 'close-process-reopen', afterSegment: 'restore', beforeSegment: 'victory', sameProfile: true, sameOrigin: true, origin: new URL(url).origin,
      expected, snapshot: { kind: 'debug', path: ['transfer', 'snapshot'] }, savedSnapshot: { kind: 'debug', path: ['transfer', 'saveSnapshot'] } } };
  const evidenceRoot = join(root, '.cosmos/cos37-service-workers'), start = Date.now(), deadlineAt = start + 20_000;
  try {
    const report = await runPersistentAcceptance(series, { evidenceRoot, channel: 'msedge', deadlineAt, timeoutMs: 20_000,
      verifyBinding: async () => { assert.equal(await digest(), bindingSha256); } });
    assert.equal(report.outcome, 'passed', JSON.stringify(report.errors)); assert.equal(report.deadlineAt, deadlineAt);
    assert.equal(report.segments.length, 2); assert.equal(workerRequests, 0); assert.equal(frameRequests, 2);
    const [first, reopened] = report.segments.map(segment => segment.report.session!);
    assert.notEqual(first.browserPid, reopened.browserPid); assert.equal(first.profile, reopened.profile); assert.equal(first.origin, reopened.origin);
    for (const segment of report.segments) {
      assert.equal(segment.report.cleanup.processExited, true); assert.equal(segment.report.cleanup.forced, false); assert.equal(segment.report.errors.length, 0);
      const logs = await readFile(join(evidenceRoot, segment.report.files.find(file => file.endsWith('browser.log'))!), 'utf8');
      const warnings = logs.trim().split('\n').map(line => JSON.parse(line)).filter(row => row.kind === 'console.warning'
        && row.message === 'Service Worker registration blocked by Playwright');
      assert.equal(warnings.length, 2);
    }
    console.log(JSON.stringify({ syntheticOnly: true, sourceVersion, sourceBytesSha256: bindingSha256, reportPath: report.reportPath,
      browser: report.segments[0].report.browser.version, pids: [first.browserPid, reopened.browserPid], workerRequests, frameRequests,
      blockedAttempts: 4, registrations: 0, controllers: 0, warningsRetained: 4, totalMs: Date.now() - start }));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
