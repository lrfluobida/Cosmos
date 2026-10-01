import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAcceptance } from '../../src/acceptance/runner.ts';
import type { AcceptancePlan } from '../../src/acceptance/plan.ts';
import { validateEvidence } from '../../src/contracts/index.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const evidenceRoot = join(root, '.cosmos/acceptance');
const runId = `browser-${Date.now()}`;
const fixture = await readFile(new URL('./fixtures/input.html', import.meta.url), 'utf8');

function plan(url: string, reportId: string): AcceptancePlan {
  return {
    formatVersion: '1.0.0', projectId: 'input-fixture', taskId: 'COS-08', runId, reportId,
    specVersion: '1.0', artifact: { artifactId: 'fixture', version: 'input-fixture-v1', location: 'tests/acceptance/fixtures/input.html' },
    url, viewport: { width: 1280, height: 720 }, acceptanceIds: ['input', 'display'], steps: [
      { id: 'ready', kind: 'wait-for', acceptanceId: 'display', observation: { kind: 'text', selector: '#display' }, expected: '计数：0', timeoutMs: 2000 },
      { id: 'move', kind: 'mouse-move', selector: '#increment', x: 0.5, y: 0.5 },
      { id: 'click', kind: 'mouse-click', selector: '#increment', x: 0.5, y: 0.5 },
      { id: 'input', kind: 'wait-for', acceptanceId: 'input', observation: { kind: 'debug', path: ['clicks'] }, expected: 1, timeoutMs: 300 },
      { id: 'display', kind: 'assert', acceptanceId: 'display', observation: { kind: 'text', selector: '#display' }, expected: '计数：1', timeoutMs: 300 },
    ],
  };
}

test('real browser retains per-assertion evidence for normal input and four independent faults', { timeout: 90_000 }, async (t) => {
  const server = createServer((request, response) => {
    if (request.url === '/unavailable') { response.writeHead(503); response.end('unavailable'); return; }
    response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(fixture);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  try {
    for (const fault of ['normal', 'disabled', 'broken-response', 'overlay', 'wrong-display', 'pageerror']) await t.test(fault, async () => {
      const input = plan(`${url}/?fault=${fault}`, fault);
      const report = await runAcceptance(input, { evidenceRoot });
      assert.equal(report.outcome, fault === 'normal' ? 'passed' : 'failed');
      assert.match(report.browser.version!, /^\d+\./);
      assert.equal(report.browser.headless, true);
      assert.equal(report.cleanup.processExited, true);
      assert.deepEqual(report.browser.viewport, input.viewport);
      assert.equal(report.steps.find(step => step.id === 'ready')?.outcome, 'passed');
      if (['disabled', 'broken-response', 'overlay'].includes(fault)) {
        const inputResult = report.steps.find(step => step.id === 'input')!;
        assert.equal(inputResult.outcome, 'failed'); assert.equal(inputResult.expected, 1); assert.equal(inputResult.actual, 0);
      }
      if (fault === 'wrong-display') {
        assert.equal(report.steps.find(step => step.id === 'input')?.outcome, 'passed');
        const display = report.steps.find(step => step.id === 'display')!;
        assert.equal(display.outcome, 'failed'); assert.equal(display.actual, '计数：999'); assert.equal(display.expected, '计数：1');
      }
      if (fault === 'pageerror') assert.ok(report.errors.some(error => error.includes('fixture page failure')));
      assert.ok(report.files.some(file => file.endsWith('.webm')));
      assert.ok(report.files.some(file => file.endsWith('.png')));
      for (const file of report.files) assert.ok((await stat(join(evidenceRoot, file))).size > 0, file);
      for (const evidence of report.evidence) assert.deepEqual(validateEvidence(evidence), []);
      assert.deepEqual(JSON.parse(await readFile(join(evidenceRoot, report.reportPath), 'utf8')), report);
      await assert.rejects(runAcceptance(input, { evidenceRoot }), /exist/i);
    });
    await t.test('HTTP startup failure is a machine-readable failed report', async () => {
      const report = await runAcceptance(plan(`${url}/unavailable`, 'startup'), { evidenceRoot });
      assert.equal(report.outcome, 'failed');
      assert.ok(report.errors.some(error => error.includes('503')));
      assert.ok(report.steps.every(step => step.outcome === 'skipped'));
      assert.ok((await stat(join(evidenceRoot, report.reportPath))).size > 0);
    });
    await t.test('locator clicks use browser actionability and do not bypass overlays', async () => {
      const input = plan(`${url}/?fault=overlay`, 'locator-overlay');
      input.steps[2] = { id: 'click', kind: 'locator-click', selector: '#increment', timeoutMs: 200 };
      const report = await runAcceptance(input, { evidenceRoot });
      assert.equal(report.steps.find(step => step.id === 'click')?.outcome, 'failed');
      assert.equal(report.steps.find(step => step.id === 'input')?.actual, 0);
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('invalid plans fail before creating a browser or evidence directory', async () => {
  await mkdir(evidenceRoot, { recursive: true });
  await assert.rejects(runAcceptance({ ...plan('https://example.com', 'invalid') }, { evidenceRoot }), /loopback/);
});
