import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import type { OwnedAcceptanceLifecycle } from '../../src/acceptance/runner.ts';
import { renderCharacter } from '../../src/media/vector.ts';
import { synthesizeWav } from '../../src/media/audio.ts';
import type { MediaMetadata } from '../../src/artifacts/types.ts';
import type { AcceptancePlan } from '../../src/acceptance/plan.ts';
import { runAcceptanceInOwnedSession } from '../../src/acceptance/runner.ts';
import * as persistent from '../../src/acceptance/persistent.ts';
import { RunController } from '../../src/runtime/run.ts';
import { browserProcessAbsent } from '../../src/acceptance/process.ts';
import { createMediaObservationRequest, assessMediaCoverage } from '../../src/runtime/entrypoint-media.ts';

async function fixture(t: any, rejectRegistration = false) {
  const root = await mkdtemp(join(tmpdir(), 'cos40-observer-')), profile = join(root, 'profile'), evidenceRoot = join(root, 'evidence');
  await mkdir(profile); const at = Date.now(), deadlineAt = at + 30_000;
  const controller = await RunController.create({ root: join(root, 'ledger'), runId: 'observer', ledgerId: 'synthetic-observer', kind: 'evaluation', scope: 'validation',
    specVersion: 'synthetic', allocations: [{ taskId: 'observer', amountMicroCny: 1 }], durationMs: 30_000 }); t.after(() => controller.close());
  const character = renderCharacter({ id: 'marker', width: 96, height: 96, anchor: { x: 48, y: 48 }, layers: [
    { id: 'body', shape: 'ellipse', x: 8, y: 8, width: 80, height: 80, fill: '#4477cc', stroke: '#224466', strokeWidth: 2 }],
    states: [{ name: 'idle', fps: 1, loop: true, frames: [{}] }, { name: 'active', fps: 1, loop: true, frames: [{}] }] });
  const audio = synthesizeWav({ id: 'bell', sampleRate: 22050, duration: 2, loop: false,
    notes: [{ midi: 72, start: 0, duration: 2, gain: 0.2, wave: 'sine', attack: 0.01, release: 0.05 }] });
  const media: MediaMetadata = { characters: [{ directory: 'public/assets/marker', manifest: character.manifest }], audio: [{ directory: 'public/assets/audio', manifest: audio.manifest }] };
  const html = await readFile(fileURLToPath(new URL('./fixtures/media-observer.html', import.meta.url)));
  const phaser = await readFile('E:/develop/Cosmos/templates/2d/node_modules/phaser/dist/phaser.js');
  const files = new Map<string, Uint8Array>([['/', html], ['/phaser.js', phaser], ['/bell.wav', audio.bytes],
    ...character.files.map(file => ['/' + file.name, Buffer.from(file.svg)] as [string, Buffer])]);
  const server = createServer((request, response) => {
    const name = new URL(request.url ?? '/', 'http://127.0.0.1').pathname, bytes = files.get(name);
    if (name === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    response.writeHead(bytes ? 200 : 404, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.wav') ? 'audio/wav' : 'text/html; charset=utf-8' }); response.end(bytes ?? 'Not found');
  }); await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); }));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const candidate = { artifactId: 'observer', version: rejectRegistration ? 'registration-rejected' : 'observed', location: 'synthetic/observer' };
  const plan: AcceptancePlan = { formatVersion: '1.0.0', projectId: 'cos40-observer', taskId: 'observer', runId: 'observer', reportId: candidate.version, specVersion: 'synthetic',
    artifact: candidate, url: 'http://127.0.0.1:' + address.port, viewport: { width: 1280, height: 720 }, acceptanceIds: ['observe'], steps: [
      { id: 'ready', kind: 'wait-for', acceptanceId: 'observe', observation: { kind: 'text', selector: '#status' }, expected: 'ready', timeoutMs: 5000 },
      { id: 'click', kind: 'locator-click', selector: '#activate', timeoutMs: 3000 },
      { id: 'active', kind: 'wait-for', acceptanceId: 'observe', observation: { kind: 'text', selector: '#status' }, expected: 'active', timeoutMs: 3000 }] };
  const ref = { artifactId: 'synthetic', version: 'v1', location: 'synthetic.json' };
  const request = createMediaObservationRequest(media, { media: ref, manifestSha256: createHash('sha256').update(JSON.stringify(media)).digest('hex'), candidate,
    sourceVersion: 'a'.repeat(40), planBindingSha256: createHash('sha256').update(JSON.stringify(plan)).digest('hex'),
    scope: { requirement: ref, design: ref, plan: ref, designSha256: 'b'.repeat(64), mapVersion: 'observer', acceptanceIds: ['observe'] } });
  const order: string[] = []; let pid = 0, cdpCalls = 0, closeEvent = false, lifecycle: OwnedAcceptanceLifecycle;
  const connect = chromium.connectOverCDP;
  chromium.connectOverCDP = ((...args: any[]) => { cdpCalls++; return (connect as any).apply(chromium, args); }) as typeof connect;
  t.after(() => { chromium.connectOverCDP = connect; });
  const options = { evidenceRoot, deadlineAt, channel: 'msedge' as const, timeoutMs: 30_000, mediaObservations: request, verifyBinding: async () => { controller.signal.throwIfAborted(); },
    ownedChild: { prepare: async () => { order.push('ticket'); assert.equal(lifecycle.process(), undefined); return controller.prepareOwnedChild(); },
      register: async (id: number, ticket: string) => { pid = id; order.push('register'); assert.equal(cdpCalls, 0); assert.equal(lifecycle.process()!.pid, id);
        lifecycle.process()!.once('close', () => { closeEvent = true; }); assert.equal(browserProcessAbsent(id), false); await controller.registerOwnedChild(id, ticket);
        if (rejectRegistration) throw new Error('Synthetic registration rejection'); } } };
  const make: any = (persistent as any).ownedPersistentBrowserLifecycle;
  assert.equal(typeof make, 'function', 'The existing persistent lifecycle must expose its trusted transport for the short observer QA');
  lifecycle = make(plan, options, { profile, deadlineAt, signal: controller.signal });
  const report = await runAcceptanceInOwnedSession(plan, options, lifecycle);
  const digest = createHash('sha256');
  for (const path of ['./fixtures/media-observer.html', './media-observations.integration.ts', '../../src/acceptance/browser.ts', '../../src/acceptance/runner.ts', '../../src/acceptance/persistent.ts', '../../src/runtime/entrypoint-media.ts']) {
    digest.update(path); digest.update(await readFile(fileURLToPath(new URL(path, import.meta.url))));
  }
  const owned = lifecycle.process()!;
  await writeFile(join(root, 'qa-summary.json'), JSON.stringify({ root, pid, order, closeEvent, exitCode: owned.exitCode, signalCode: owned.signalCode,
    pidAbsent: browserProcessAbsent(pid), cdpCalls, sourceDigest: digest.digest('hex'), report, providerCalls: 0 }, null, 2), 'utf8');
  t.diagnostic('New observer evidence: ' + root); assert.deepEqual(order, ['ticket', 'register']); assert.equal(browserProcessAbsent(pid), true);
  assert.equal(closeEvent, true); assert.equal(cdpCalls, rejectRegistration ? 0 : 1); assert.ok(owned.exitCode !== null || owned.signalCode !== null);
  assert.equal((await controller.read()).ledger.entries.length, 0);
  return { root, report, request, media, evidenceRoot };
}
test('COS40 new observer records real Phaser loading, displayed states and decoded/started audio in the original raw report', async t => {
  const f = await fixture(t);
  assert.equal(f.report.outcome, 'passed', JSON.stringify(f.report.errors)); assert.equal(f.report.session!.exitConfirmed, true);
  assert.equal(f.report.cleanup.forced, false); assert.ok(f.report.mediaObservations);
  const coverage = assessMediaCoverage(f.media, f.request, [{ segmentId: 'observer', reportPath: f.report.reportPath, sample: f.report.mediaObservations! }]);
  assert.equal(coverage.valid, true); assert.equal(coverage.complete, true);
  assert.deepEqual(JSON.parse(await readFile(join(f.evidenceRoot, f.report.reportPath), 'utf8')), f.report);
  for (const suffix of ['.png', '.webm', '.log']) assert.ok((await readFile(join(f.evidenceRoot, f.report.files.find(file => file.endsWith(suffix))!))).length > 0);
});
test('COS40 registration rejection before CDP retains failure and confirms the owned child is absent', async t => {
  const f = await fixture(t, true); assert.equal(f.report.outcome, 'failed'); assert.equal(f.report.mediaObservations, undefined);
  assert.ok(f.report.errors.some(error => error.includes('registration rejection'))); assert.equal(f.report.cleanup.forced, true);
});
