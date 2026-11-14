import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { mock } from 'node:test';
import type { OwnedAcceptanceLifecycle } from '../../src/acceptance/runner.ts';
import type { AcceptancePlan } from '../../src/acceptance/plan.ts';
import { removeOwned } from '../../src/artifacts/paths.ts';

mock.module(new URL('../../src/acceptance/process.ts', import.meta.url).href, { namedExports: {
  browserProcessAbsent: () => true, stopBrowserProcess: async () => {},
} });
const { runAcceptanceInOwnedSession } = await import('../../src/acceptance/runner.ts');

const extensionURL = 'chrome-extension://' + 'a'.repeat(32) + '/background.js';
type Target = { targetId: string; type: string; url: string; browserContextId?: string; openerId?: string; openerFrameId?: string };
const worker = (fields: Partial<Target> = {}): Target => ({ targetId: 'fixture-target', type: 'service_worker', url: extensionURL,
  browserContextId: 'same-as-page', ...fields });

// Browser transport/exit are synthetic; events enter the production runner's CDP listener.
async function observeWorkers(targets: Target[]) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-worker-attribution-'));
  const listeners = new Map<string, (event: { targetInfo: Target }) => void>();
  let directory = '';
  const page = { video: () => null, setViewportSize: async () => {}, setDefaultTimeout() {}, on() {}, isClosed: () => false,
    goto: async () => ({ ok: () => true }), url: () => 'http://127.0.0.1:32123/',
    screenshot: async ({ path }: { path: string }) => writeFile(path, 'synthetic screenshot', 'utf8'),
    screencast: { start: async () => {}, stop: async () => writeFile(join(directory, 'browser.webm'), 'synthetic video', 'utf8') } };
  const context = { on() {}, route: async () => {}, routeWebSocket: async () => {}, newPage: async () => page,
    newCDPSession: async () => ({ on: (event: string, listener: (event: { targetInfo: Target }) => void) => listeners.set(event, listener),
      send: async (method: string) => { if (method === 'Target.setDiscoverTargets') for (const targetInfo of targets)
        listeners.get('Target.targetCreated')!({ targetInfo }); } }) };
  const lifecycle: OwnedAcceptanceLifecycle = { deadlineAt: Date.now() + 10_000,
    open: async path => { directory = path; return { browser: { version: () => 'synthetic CDP', close: async () => {} } as any, context: context as any }; },
    process: () => ({ pid: 12345, exitCode: 0, signalCode: null }) as any,
    identity: () => ({ browserPid: 12345, profile: root, commandLineProfile: root, origin: page.url(),
      closeEvent: true, exitConfirmed: true, exitCode: 0, signalCode: null }), close: async () => {} };
  const plan: AcceptancePlan = { formatVersion: '1.0.0', projectId: 'fixture', taskId: 'network', runId: 'fixture', reportId: 'worker', specVersion: 'v1',
    artifact: { artifactId: 'game', version: 'v1', location: 'synthetic/game' }, url: page.url(), viewport: { width: 1280, height: 720 }, acceptanceIds: ['offline'],
    steps: [{ id: 'offline', kind: 'assert', acceptanceId: 'offline', observation: { kind: 'external-requests' }, expected: 0, timeoutMs: 1000 }] };
  try {
    const report = await runAcceptanceInOwnedSession(plan, { evidenceRoot: root, timeoutMs: 10_000 }, lifecycle);
    const logs = (await readFile(join(directory, 'browser.log'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    return { report, targets: logs.filter(row => row.kind === 'network-target').map(row => JSON.parse(row.message)) };
  } finally { await removeOwned(tmpdir(), root); }
}

test('CDP extension workers without openers do not invalidate project network evidence and retain attribution', async () => {
  const targets = ['worker', 'shared_worker', 'service_worker'].map(type => worker({ type }));
  const result = await observeWorkers(targets);
  assert.equal(result.report.outcome, 'passed', result.report.errors.join('\n'));
  assert.equal(result.report.steps[0].actual, 0);
  assert.deepEqual(result.targets, targets.map(target => ({ ...target, openerId: null, openerFrameId: null,
    attribution: 'browser-extension', reason: 'chrome-extension URL without an opener' })));
});

test('project and unknown worker targets remain fail-closed even alongside a browser extension', async t => {
  const targets = [
    ...['worker', 'shared_worker', 'service_worker'].map(type => worker({ type, url: 'http://127.0.0.1:32123/worker.js' })),
    worker({ url: 'https://example.test/worker.js', browserContextId: 'other-context' }),
    worker({ url: 'blob:http://127.0.0.1:32123/worker' }), worker({ url: 'blob:' + extensionURL }),
    worker({ url: 'data:text/javascript,0' }), worker({ url: '' }), worker({ url: 'not a URL' }),
    worker({ url: 'about:blank' }), worker({ url: 'chrome-extension://' }),
    worker({ url: 'chrome-extension://invalid/background.js' }), worker({ url: extensionURL.replace('://', '://user@') }),
    worker({ url: 'http://example.test/' + extensionURL }), worker({ openerId: 'project-page' }),
    worker({ openerFrameId: 'project-frame' }), worker({ type: 'unknown' }),
  ];
  for (const target of targets) await t.test(JSON.stringify(target), async () => {
    const result = await observeWorkers([worker(), target]);
    assert.equal(result.report.outcome, 'failed');
    assert.deepEqual(result.report.errors, [`External request evidence incomplete for Chromium ${target.type}`]);
    assert.equal(result.report.steps[0].failure, 'observation_error');
    assert.equal(result.report.steps[0].actual, null);
    assert.equal(result.report.steps[0].error, 'External request count unavailable for worker targets');
    assert.equal(result.targets[1].url, target.url);
    assert.equal(result.targets[1].attribution, 'unresolved');
  });
});
