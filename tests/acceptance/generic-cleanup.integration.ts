import assert from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { chromium } from '@playwright/test';
import type { ConnectOptions } from '@playwright/test';
import { runAcceptance } from '../../src/acceptance/runner.ts';
import { filterBrowserEnvironment } from '../../src/acceptance/persistent.ts';
import { browserProcessAbsent, stopBrowserProcess } from '../../src/acceptance/process.ts';
import type { AcceptancePlan } from '../../src/acceptance/plan.ts';

async function portClosed(port: number) {
  await new Promise<void>((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.on('connect', () => { socket.destroy(); reject(new Error(`Owned listener ${port} is still open`)); });
    socket.on('error', error => (error as NodeJS.ErrnoException).code === 'ECONNREFUSED' ? resolve() : reject(error));
    socket.setTimeout(1000, () => { socket.destroy(); reject(new Error(`Owned listener ${port} absence is unproven`)); });
  });
}

// One synthetic page and one browser: no generated game, ledger, provider, or media coverage claim.
// Run under an outer process-tree guard; node:test timeout alone does not terminate owned descendants.
test('COS94 real generic BrowserServer saves evidence and closes its owned process within the original budget', { timeout: 20000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos94-cleanup-real-')), started = performance.now();
  const events: { at: string; ms: number; name: string; [key: string]: unknown }[] = [];
  const record = (name: string, fields: Record<string, unknown> = {}) => {
    const row = { at: new Date().toISOString(), ms: +(performance.now() - started).toFixed(3), name, ...fields };
    events.push(row); appendFileSync(join(root, 'events.jsonl'), JSON.stringify(row) + '\n', 'utf8');
  };
  const timed = async <T>(name: string, operation: () => Promise<T>) => {
    record(`${name}:start`);
    try { const result = await operation(); record(`${name}:end`); return result; }
    catch (error) { record(`${name}:error`, { error: error instanceof Error ? error.message : String(error) }); throw error; }
  };
  let child: ChildProcess | undefined, wsPort: number | undefined;
  const launchServer = chromium.launchServer.bind(chromium), connectBrowser = chromium.connect.bind(chromium);
  t.mock.method(chromium, 'launchServer', async (options: Parameters<typeof launchServer>[0]) => {
    const server = await launchServer(options); child = server.process(); wsPort = Number(new URL(server.wsEndpoint()).port);
    record('browser:launched', { pid: child.pid, wsPort });
    child.on('exit', (code, signal) => record('process:exit', { code, signal }));
    child.on('close', (code, signal) => record('process:close', { code, signal }));
    const close = server.close.bind(server); t.mock.method(server, 'close', () => timed('server.close', close)); return server;
  });
  t.mock.method(chromium, 'connect', async (endpoint: string, options?: ConnectOptions) => {
    const browser = await connectBrowser(endpoint, options), close = browser.close.bind(browser), newContext = browser.newContext.bind(browser);
    browser.on('disconnected', () => record('client:disconnected'));
    t.mock.method(browser, 'close', (options: Parameters<typeof close>[0]) => timed('client.close', () => close(options)));
    t.mock.method(browser, 'newContext', async (options: Parameters<typeof newContext>[0]) => {
      const context = await newContext(options), close = context.close.bind(context), newPage = context.newPage.bind(context);
      t.mock.method(context, 'close', (options: Parameters<typeof close>[0]) => timed('context.close', () => close(options)));
      t.mock.method(context, 'newPage', async () => {
        const page = await newPage(), video = page.video();
        if (video) { const saveAs = video.saveAs.bind(video); t.mock.method(video, 'saveAs', (path: string) => timed('video.saveAs', () => saveAs(path))); }
        return page;
      });
      return context;
    });
    return browser;
  });
  const http = createServer((_request, response) => { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end('<!doctype html><p id="ready">就绪</p>'); });
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const address = http.address(); assert.ok(address && typeof address !== 'string'); record('http:listening', { port: address.port });
  t.diagnostic(`COS94 synthetic evidence: ${root}`);
  const plan: AcceptancePlan = { formatVersion: '1.0.0', projectId: 'cos94-synthetic', taskId: 'COS-94', runId: 'real', reportId: 'cleanup', specVersion: 'synthetic-v1',
    artifact: { artifactId: 'inline', version: 'v1', location: 'synthetic/inline' }, url: `http://127.0.0.1:${address.port}/`, viewport: { width: 1280, height: 720 }, acceptanceIds: ['ready'],
    steps: [{ id: 'ready', kind: 'assert', acceptanceId: 'ready', observation: { kind: 'text', selector: '#ready' }, expected: '就绪', timeoutMs: 1000 }] };
  let report;
  try {
    report = await timed('runner', () => runAcceptance(plan, { evidenceRoot: root, channel: 'msedge', env: filterBrowserEnvironment(process.env), timeoutMs: 15000 }));
  } finally {
    try {
      if (child && child.exitCode === null && child.signalCode === null) { record('fixture:force-cleanup'); await stopBrowserProcess(child, 2000); }
    } finally {
      http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve())); record('http:closed');
    }
  }
  const summary = { root, events, reportPath: report.reportPath, outcome: report.outcome, errors: report.errors, cleanup: report.cleanup,
    originalTimeoutMs: report.timeoutMs, deadlineLowerBound: Date.parse(report.startedAt) + report.timeoutMs,
    exitCode: child?.exitCode, signalCode: child?.signalCode, pidAbsent: !!child?.pid && browserProcessAbsent(child.pid), httpPort: address.port, wsPort };
  await writeFile(join(root, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
  assert.equal(report.outcome, 'passed', JSON.stringify(report.errors)); assert.equal(report.cleanup.forced, false);
  assert.equal(report.cleanup.processExited, true); assert.equal(summary.pidAbsent, true); assert.equal(child?.exitCode, 0);
  assert.ok(events.some(event => event.name === 'process:close' && event.code === 0));
  assert.ok(Date.parse(report.endedAt) < summary.deadlineLowerBound, 'Even the earlier report-start budget must contain this run');
  const video = report.files.find(file => file.endsWith('browser.webm')); assert.ok(video); assert.ok((await stat(join(root, video))).size > 0);
  assert.deepEqual(JSON.parse(await readFile(join(root, report.reportPath), 'utf8')), report);
  await portClosed(address.port); assert.ok(wsPort); await portClosed(wsPort);
});
