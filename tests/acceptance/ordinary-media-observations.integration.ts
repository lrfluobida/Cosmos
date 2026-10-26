import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import type { TestContext } from 'node:test';
import type { BrowserScenario } from '../../src/roles/requirements.ts';
import type { Step as PlanStep } from '../../src/acceptance/plan.ts';
import { createGenericPersistentSeries, verifyGenericPersistentEvidence } from '../../src/runtime/entrypoint-persistent.ts';
import { runPersistentAcceptance } from '../../src/acceptance/persistent.ts';
import { browserProcessAbsent } from '../../src/acceptance/process.ts';
import { createPersistentOwnedChild } from '../../src/runtime/entrypoint-host.ts';
import { createGenericMediaObservationRequest, assessGenericSeriesMediaCoverage } from '../../src/runtime/entrypoint-media.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { synthesizeWav } from '../../src/media/audio.ts';
import type { MediaMetadata } from '../../src/artifacts/types.ts';

let buildRoot: string, url: string, server: ReturnType<typeof createServer>, media: MediaMetadata;
const ids = ['prototype', 'constructor', 'a-b', 'bgm-soft']; // Art order intentionally differs from the design's BGM-first order.
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
function command(args: string[], cwd: string) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT'].includes(key.toUpperCase())));
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((done, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, shell: false }); let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject); child.once('close', code => done({ code, stdout, stderr }));
  });
}
before(async () => {
  buildRoot = await mkdtemp(join(tmpdir(), 'cos133-media-'));
  const template = resolve(process.env.COSMOS_TEMPLATE_ROOT ?? fileURLToPath(new URL('../../templates/2d', import.meta.url)));
  const repositoryTemplate = fileURLToPath(new URL('../../templates/2d', import.meta.url));
  assert.deepEqual(await readFile(join(template, 'package-lock.json')), await readFile(join(repositoryTemplate, 'package-lock.json')));
  const lock = await json(join(template, 'package-lock.json'));
  for (const name of ['phaser', 'typescript', 'vite']) assert.equal((await json(join(template, 'node_modules', name, 'package.json'))).version, lock.packages['node_modules/' + name].version);
  for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await cp(join(template, file), join(buildRoot, file));
  await cp(await realpath(join(template, 'node_modules')), join(buildRoot, 'node_modules'), { recursive: true, dereference: true });
  await mkdir(join(buildRoot, 'src')); await mkdir(join(buildRoot, 'public'));
  await cp(new URL('./fixtures/ordinary-media-observer.ts', import.meta.url), join(buildRoot, 'src/main.ts'));
  const clips = ids.map(id => synthesizeWav({ id, sampleRate: 22050, duration: id === 'bgm-soft' ? 1 : 0.025, loop: id === 'bgm-soft',
    notes: [{ midi: 65, start: 0, duration: id === 'bgm-soft' ? 1 : 0.025, gain: 0.1, wave: 'sine', attack: 0.002, release: 0.003 }] }));
  media = { characters: [], audio: clips.map(clip => ({ directory: 'public', manifest: clip.manifest })) };
  for (const clip of clips) await writeFile(join(buildRoot, 'public', clip.manifest.file), clip.bytes);
  await writeFile(join(buildRoot, 'public/manifest.json'), JSON.stringify({ audio: clips.map(clip => clip.manifest) }), 'utf8');
  const controls = ['start', 'sound', 'collect', 'zero', 'normal', 'replay', 'pause', 'resume', 'volume-zero', 'volume-normal', 'instance-mute', 'instance-unmute', 'transient', 'reenable', 'save', 'continue', 'scene', 'stop', 'destroy', 'suspend'];
  await writeFile(join(buildRoot, 'index.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>媒体观测测试</title><style>button{margin:5px;padding:8px}body{font:18px sans-serif}</style>'
    + controls.map(id => `<button id="${id}">${id === 'sound' ? '声音：开' : id}</button>`).join('')
    + '<p id="status">loading</p><p id="last">none</p><p id="progress">0</p><p id="saved">none</p><p id="scene-state">first</p><p id="context">initial</p><div id="canvas"></div><script type="module" src="/src/main.ts"></script></html>', 'utf8');
  const compile = await command(['node_modules/typescript/bin/tsc', '--noEmit'], buildRoot);
  await writeFile(join(buildRoot, 'compile.json'), JSON.stringify(compile, null, 2), 'utf8');
  assert.equal(compile.code, 0, `${buildRoot}\n${compile.stdout}\n${compile.stderr}`);
  const build = await command(['node_modules/vite/bin/vite.js', 'build'], buildRoot);
  await writeFile(join(buildRoot, 'build.json'), JSON.stringify(build, null, 2), 'utf8');
  assert.equal(build.code, 0, `${buildRoot}\n${build.stdout}\n${build.stderr}`);
  server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname, dist = join(buildRoot, 'dist');
      if (path === '/favicon.ico') { response.writeHead(204).end(); return; }
      const file = resolve(dist, '.' + (path === '/' ? '/index.html' : path));
      if (!file.startsWith(dist + sep)) { response.writeHead(403).end(); return; }
      try {
        const bytes = await readFile(file);
        response.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.wav') ? 'audio/wav' : file.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' }).end(bytes);
      } catch { response.writeHead(404).end(); }
    })();
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address(); assert.ok(address && typeof address !== 'string'); url = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  if (server) await new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); });
  if (buildRoot) await writeFile(join(buildRoot, 'server-cleanup.json'), JSON.stringify({ listening: server?.listening ?? false, providerCalls: 0 }), 'utf8');
});

function scenario(): BrowserScenario {
  let index = 0, steps: PlanStep[] = [];
  const check = (selector: string, expected: string) => steps.push({ id: `s${++index}`, kind: 'wait-for', acceptanceId: 'audio', observation: { kind: 'text', selector }, expected, timeoutMs: 5000 });
  const click = (id: string) => { steps.push({ id: `s${++index}`, kind: 'locator-click', selector: '#' + id, timeoutMs: 5000 }); check('#last', id); };
  const audio = (id: string, field: string, expected: string | number | boolean, wait = false) => steps.push({ id: `s${++index}-${id}-${field}`, kind: wait ? 'wait-for' : 'assert', acceptanceId: 'audio',
    observation: { kind: 'debug', path: ['media', 'audioById', 'clip_' + id.replaceAll('-', '_'), field] }, expected, timeoutMs: 5000 });
  const initial = () => { check('#status', 'ready'); for (const id of ids) { audio(id, 'id', id); audio(id, 'decoded', true); audio(id, 'outputActivations', 0); } };
  initial();
  steps.push({ id: `s${++index}-array-order`, kind: 'assert', acceptanceId: 'audio', observation: { kind: 'debug', path: ['media', 'audio', '0', 'id'] }, expected: 'prototype', timeoutMs: 1000 });
  click('zero'); audio('prototype', 'started', true); audio('prototype', 'outputActive', false); audio('prototype', 'outputActivations', 0);
  click('normal'); audio('prototype', 'outputActivations', 1); audio('prototype', 'playing', false, true);
  click('start'); audio('bgm-soft', 'looping', true); audio('bgm-soft', 'playing', true); audio('bgm-soft', 'outputActive', true); audio('bgm-soft', 'outputActivations', 1); audio('bgm-soft', 'outputActivations', 1);
  click('replay'); audio('bgm-soft', 'outputActivations', 2);
  click('pause'); audio('bgm-soft', 'playing', false); audio('bgm-soft', 'outputActive', false);
  click('resume'); audio('bgm-soft', 'outputActivations', 3); click('resume'); audio('bgm-soft', 'outputActivations', 3);
  click('sound'); check('#sound', '声音：关'); audio('bgm-soft', 'outputActive', false);
  click('collect'); audio('constructor', 'started', true); audio('constructor', 'outputActive', false); audio('constructor', 'outputActivations', 0); audio('constructor', 'playing', false, true);
  click('volume-zero'); audio('constructor', 'outputActivations', 0); audio('constructor', 'playing', false, true);
  click('sound'); check('#sound', '声音：开'); audio('bgm-soft', 'outputActive', false); audio('bgm-soft', 'outputActivations', 3);
  click('collect'); audio('constructor', 'outputActivations', 0); audio('constructor', 'playing', false, true);
  click('volume-normal'); audio('bgm-soft', 'outputActive', true); audio('bgm-soft', 'outputActivations', 4);
  click('collect'); audio('constructor', 'outputActivations', 1); audio('constructor', 'playing', false, true);
  click('instance-mute'); audio('bgm-soft', 'outputActive', false);
  click('instance-unmute'); audio('bgm-soft', 'outputActivations', 5);
  click('transient'); audio('a-b', 'outputActivations', 1); audio('a-b', 'outputActive', false); audio('a-b', 'playing', false, true); audio('bgm-soft', 'outputActive', false);
  click('reenable'); audio('bgm-soft', 'outputActivations', 6);
  click('collect'); audio('constructor', 'outputActivations', 2); audio('constructor', 'playing', false, true);
  click('scene'); check('#scene-state', 'second'); audio('constructor', 'outputActivations', 3); audio('constructor', 'playing', false, true); audio('bgm-soft', 'outputActivations', 6);
  click('suspend'); check('#context', 'suspended'); audio('bgm-soft', 'outputActive', false);
  click('start'); audio('bgm-soft', 'outputActivations', 7);
  click('stop'); audio('bgm-soft', 'playing', false); audio('bgm-soft', 'looping', false);
  click('start'); audio('bgm-soft', 'outputActivations', 8);
  click('destroy'); audio('bgm-soft', 'playing', false); audio('bgm-soft', 'outputActive', false); audio('bgm-soft', 'outputActivations', 8);
  click('save'); check('#progress', '4'); check('#saved', '4');
  click('collect'); check('#progress', '5'); check('#saved', '4'); audio('constructor', 'outputActivations', 4);
  const first = steps; steps = [];
  initial(); // No input before sound-off; the new document has independent observation counters.
  click('sound'); check('#sound', '声音：关'); audio('bgm-soft', 'started', true); audio('bgm-soft', 'playing', true);
  for (const id of ids) { audio(id, 'outputActive', false); audio(id, 'outputActivations', 0); }
  click('collect'); audio('constructor', 'started', true); audio('constructor', 'outputActivations', 0);
  click('continue'); check('#progress', '4'); check('#saved', '4'); audio('bgm-soft', 'outputActivations', 0);
  click('reenable'); audio('bgm-soft', 'outputActive', true); audio('bgm-soft', 'looping', true); audio('bgm-soft', 'outputActivations', 1);
  click('collect'); check('#progress', '5'); audio('constructor', 'outputActivations', 1);
  return { viewport: { width: 1280, height: 720 }, steps: first, reopen: { steps, checkpoint: { expected: '4', snapshot: { kind: 'text', selector: '#progress' }, savedSnapshot: { kind: 'text', selector: '#saved' } } } };
}

async function run(t: TestContext, fault = '') {
  const root = await mkdtemp(join(buildRoot, 'case-')), at = Date.now(), deadlineAt = at + 120_000;
  const controller = await RunController.create({ root: join(root, 'ledger'), runId: 'ordinary-media', ledgerId: 'source-only', kind: 'evaluation', scope: 'validation',
    specVersion: 'source', durationMs: 120_000, allocations: [{ taskId: 'media', amountMicroCny: 1 }] });
  const work = new OwnedWork(controller.signal), pids: number[] = [], ref = { artifactId: 'fixture', version: 'v1', location: 'source/fixture' };
  const series = createGenericPersistentSeries({ scenario: scenario(), projectId: 'ordinary-media', taskId: 'media', runId: 'ordinary-media', specVersion: 'source', reportId: 'series',
    url: url + '/?fault=' + encodeURIComponent(fault), candidate: { ...ref, artifactId: 'game' }, requirement: { ...ref, artifactId: 'requirements' }, design: { ...ref, artifactId: 'design' }, acceptanceIds: ['audio'] });
  const evidenceRoot = join(root, 'evidence'), manifestSha256 = createHash('sha256').update(JSON.stringify(media)).digest('hex');
  const segmentMediaObservations = series.segments.map(segment => ({ segmentId: segment.id, request: createGenericMediaObservationRequest(media,
    { media: ref, manifestSha256, plan: segment.plan, collection: { kind: 'persistent-segment', seriesBindingSha256: series.bindingSha256, segmentId: segment.id } }) }));
  const owned = createPersistentOwnedChild({ controller, work }, { taskId: 'media', windowId: null, deadlineAt: new Date(deadlineAt).toISOString() }, async () => controller.signal.throwIfAborted());
  try {
    const report = await runPersistentAcceptance(series, { evidenceRoot, deadlineAt, channel: 'msedge', timeoutMs: 120_000, signal: controller.signal, segmentMediaObservations,
      verifyBinding: async () => controller.signal.throwIfAborted(), ownedChild: { prepare: async launch => {
        const handle = await owned.prepare(launch); return { ...handle, register: async (pid, lifetime) => { pids.push(pid); await handle.register(pid, lifetime); } };
      } } });
    await work.cancelAndDrain('Source media test complete');
    assert.ok(pids.length > 0); assert.ok(pids.every(browserProcessAbsent));
    assert.ok(report.segments.every(segment => segment.report.cleanup.processExited && segment.report.session?.exitConfirmed));
    assert.deepEqual((await controller.read()).ledger.entries, []);
    await writeFile(join(root, 'summary.json'), JSON.stringify({ fault, buildRoot, providerCalls: 0, pids, absent: pids.map(browserProcessAbsent), report }, null, 2), 'utf8');
    t.diagnostic('SOURCE real Phaser/Edge evidence: ' + root);
    return { root, report, series, evidenceRoot, manifestSha256, deadlineAt, ref, pids };
  } finally { await work.cancelAndDrain('Source fixture final cleanup'); await controller.close(); }
}

test('ordinary real media transaction states survive scenes and exactly one browser process reopen', async t => {
  const f = await run(t, process.env.COSMOS_MEDIA_BASELINE ?? '');
  assert.equal(f.report.outcome, 'passed', JSON.stringify({ errors: f.report.errors, firstFailed: f.report.segments.flatMap(s => s.report.steps).find(s => s.outcome === 'failed') }));
  assert.equal(f.pids.length, 2); assert.notEqual(f.pids[0], f.pids[1]);
  await verifyGenericPersistentEvidence(f.series, f.report, f.evidenceRoot, f.deadlineAt);
  const coverage = assessGenericSeriesMediaCoverage(media, { series: f.series, media: f.ref, manifestSha256: f.manifestSha256, deadlineAt: f.deadlineAt }, f.report);
  assert.equal(coverage.valid, true); assert.equal(coverage.complete, true);
  assert.equal(f.series.segments[1].plan.steps.find(step => step.kind === 'locator-click')!.selector, '#sound');
});
for (const [fault, field] of [['ignore-mute', 'outputActive'], ['omit-resumed-effect', 'outputActivations'], ['no-loop', 'looping'], ['wrong-id', 'id']]) {
  test(`ordinary real media rejects ${fault} at the actual ${field} observation`, async t => {
    const f = await run(t, fault);
    assert.equal(f.report.outcome, 'failed'); assert.equal(f.pids.length, 1);
    const failed = f.report.segments.flatMap(segment => segment.report.steps).find(step => step.outcome === 'failed');
    assert.ok(failed); assert.ok(failed.id.endsWith('-' + field), JSON.stringify(failed));
    assert.notDeepEqual(failed.actual, failed.expected);
  });
}
