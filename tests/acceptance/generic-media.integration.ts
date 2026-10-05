import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runAcceptance } from '../../src/acceptance/runner.ts';
import { assessMediaCoverage, mediaObservationDefinitions } from '../../src/runtime/entrypoint-media.ts';
import { synthesizeWav } from '../../src/media/audio.ts';
import { genericMediaFixture } from './generic-media.fixture.ts';

// Synthetic browser fixture only: actual image readiness, displayed states and WebAudio events.
// It is not authored by a model and is not evidence of a generated game.
test('generic runner reads all 4544 immutable fields after normal input and delayed real media readiness', { timeout: 60_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos64-browser-'));
  const media: any = { characters: Array.from({ length: 128 }, (_, i) => ({ directory: `assets/a-${i}`, manifest: { id: `a-${i}`,
    states: Array.from({ length: 16 }, (_, j) => ({ name: `s-${j}`, frames: [`s-${j}.svg`] })) } })),
    audio: Array.from({ length: 64 }, (_, i) => ({ directory: 'assets/audio', manifest: { id: `b-${i}` } })) };
  const definitions = mediaObservationDefinitions(media);
  const tone = synthesizeWav({ id: 'tone', sampleRate: 22050, duration: 0.02, loop: false, notes: [
    { midi: 72, start: 0, duration: 0.02, gain: 0.1, wave: 'sine', attack: 0.002, release: 0.002 }] }).bytes;
  const html = genericMediaFixture(media);
  const server = createServer((request, response) => { const toneRequest = request.url === '/tone.wav';
    if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    response.writeHead(200, { 'Content-Type': toneRequest ? 'audio/wav' : 'text/html; charset=utf-8' }); response.end(toneRequest ? tone : html); });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); }));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const ref = { artifactId: 'synthetic', version: 'v1', location: 'synthetic/fixture' };
  for (const fault of ['normal', 'incomplete', 'wrong-plan', 'wrong-candidate', 'getter']) await t.test(fault, async () => {
    const plan: any = { formatVersion: '1.0.0', projectId: 'cos64', taskId: 'fixture', runId: 'browser', reportId: fault, specVersion: 'synthetic', artifact: ref,
      url: `http://127.0.0.1:${address.port}/?fault=${fault}`, viewport: { width: 400, height: 300 }, acceptanceIds: ['input'], steps: [
        { id: 'click', kind: 'locator-click', selector: '#star', timeoutMs: 1000 },
        { id: 'played', kind: 'assert', acceptanceId: 'input', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] };
    const request: any = { formatVersion: 'readonly-media/generic-1', media: ref, candidate: ref,
      manifestSha256: createHash('sha256').update(JSON.stringify(media)).digest('hex'), planBindingSha256: createHash('sha256').update(JSON.stringify(plan)).digest('hex'),
      fields: definitions.map(({ id, path, expected }) => ({ id, path, expected })) };
    if (fault === 'wrong-plan') request.planBindingSha256 = 'f'.repeat(64);
    if (fault === 'wrong-candidate') request.candidate = { ...ref, version: 'v2' };
    const report = await runAcceptance(plan, { evidenceRoot: root, channel: 'msedge', timeoutMs: 15_000, mediaObservations: request });
    assert.equal(report.outcome, fault === 'normal' ? 'passed' : 'failed', JSON.stringify(report.errors)); assert.equal(report.cleanup.processExited, true);
    assert.deepEqual(report.plan, plan); assert.equal(report.steps.length, 2);
    if (fault === 'normal' || fault === 'incomplete') {
      assert.equal(report.mediaObservations!.values.length, 4544); assert.deepEqual(report.mediaObservations!.request, request);
      const coverage = assessMediaCoverage(media, request, [{ segmentId: 'fixture', reportPath: report.reportPath, sample: report.mediaObservations! }]);
      assert.equal(coverage.valid, true); assert.equal(coverage.complete, fault === 'normal');
      if (fault === 'incomplete') assert.ok(coverage.checks.some(check => check.kind === 'audio_started' && check.actual === false));
    } else assert.equal(report.mediaObservations, undefined);
    if (fault === 'getter') { assert.ok(report.errors.some(error => error.includes('data properties: name'))); assert.ok(report.errors.every(error => !error.includes('must never invoke'))); }
    assert.deepEqual(JSON.parse(await readFile(join(root, report.reportPath), 'utf8')), report);
  });
  t.diagnostic(`Source-only browser evidence: ${root}; model requests: 0`);
});
