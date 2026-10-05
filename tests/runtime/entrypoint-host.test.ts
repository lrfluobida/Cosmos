import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { IntakeController } from '../../src/runtime/intake.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { withHostStages, DESIGN_ACCEPTANCE_ID, MEDIA_ACCEPTANCE_ID } from '../../src/roles/requirements.ts';
import * as hosts from '../../src/runtime/entrypoint-host.ts';
import { runAcceptance } from '../../src/acceptance/runner.ts';
import { genericMediaFixture } from '../acceptance/generic-media.fixture.ts';
async function fixture(t: test.TestContext, mismatch: boolean | 'media-missing' | 'image' | 'sample-binding' | 'sample-missing' = false, batched = false) {
  assert.equal(typeof hosts.createBrowserHost, 'function', 'Generic host adapter is required');
  const root = await mkdtemp(join(tmpdir(), 'cosmos-browser-host-'));
  const intake = await IntakeController.create({ root, runId: 'game', ledgerId: 'budget', specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 2,
    allocations: [{ taskId: 'intake', amountMicroCny: 100 }, { taskId: 'planning', amountMicroCny: 100 }] });
  const draft = withHostStages({ brief: '点击星星获胜', questions: [{ id: 'goal', prompt: '目标？' }], answers: { goal: '获胜' }, unsupported: [],
    acceptance: [{ acceptanceId: 'win', description: '点击获胜', steps: ['点击星星'], expected: '胜利', evidenceKinds: ['test_report'] }],
    scenario: { viewport: { width: 1280, height: 720 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#star', timeoutMs: 1000 }, { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] } });
  const saved = await intake.saveDraft(draft as any), requirement = await intake.confirm({ revision: saved.revision, confirmed: true, actorId: 'user', at: new Date().toISOString() });
  await intake.activateGeneration({ environmentReady: true, executionReady: true }); await intake.close();
  const controller = await RunController.open({ root }), work = new OwnedWork(controller.signal);
  t.after(async () => { await controller.close(); if (batched && mismatch === false) t.diagnostic(`Source-only host/real-runner evidence: ${root}; model requests: 0`);
    else await rm(root, { recursive: true, force: true }); });
  await mkdir(join(root, 'toolchain'), { recursive: true });
  for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await writeFile(join(root, 'toolchain', file), file === 'vite.config.ts' ? 'export default {}' : '{}', 'utf8');
  const plays: any[] = [];
  const host = await hosts.createBrowserHost({ root, controller, requirement, draft, work, resume: false, io: {
    async build(project: string) { await mkdir(join(project, 'dist'));
      await cp(join(project, 'public/assets'), join(project, 'dist/assets'), { recursive: true });
      if (batched && mismatch === false) {
        const manifest = JSON.parse(await readFile(join(project, 'public/assets/manifest.json'), 'utf8'));
        await writeFile(join(project, 'dist/index.html'), genericMediaFixture(manifest, true), 'utf8');
      } else await writeFile(join(project, 'dist/index.html'), '<p>offline fixture</p>', 'utf8');
      return { passed: true, diagnostics: 'Synthetic build fixture; no model or compiler evidence' }; },
    async play(plan: any, _signal: any, _authority: any, options: any) {
      plays.push({ plan: structuredClone(plan), options: structuredClone(options) });
      if (batched && mismatch === false) return runAcceptance(plan, { evidenceRoot: join(root, 'browser-evidence'), channel: 'msedge', timeoutMs: 15_000, ...options });
      if (mismatch === 'image') { await mkdir(join(root, 'browser-evidence'), { recursive: true }); await writeFile(join(root, 'browser-evidence/fixture.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfXcAAAAASUVORK5CYII=', 'base64')); }
      const request = structuredClone(options?.mediaObservations);
      if (request && mismatch === 'sample-binding') request.planBindingSha256 = 'f'.repeat(64);
      const values = request?.fields.map((field: any) => mismatch === 'sample-missing' && field.path.at(-1) === 'seen' ? false : field.expected);
      return { formatVersion: '1.0.0', kind: 'normal_browser_input', plan: { ...plan, ...(mismatch === true ? { runId: 'wrong-run' } : {}) }, outcome: 'passed',
      ...(request ? { mediaObservations: { request, recordedAt: new Date().toISOString(), values } } : {}),
      browser: { version: 'offline-browser' }, cleanup: { processExited: true }, errors: [], reportPath: 'offline-report.json', files: [], evidence: [],
      steps: plan.steps.map((step: any) => ({ id: step.id, kind: step.kind, acceptanceId: step.acceptanceId,
        outcome: mismatch === 'media-missing' && step.observation?.path?.at(-1) === 'seen' ? 'failed' : 'passed', expected: step.expected ?? 'input delivered',
        actual: mismatch === 'media-missing' && step.observation?.path?.at(-1) === 'seen' ? false : step.expected ?? 'input delivered', screenshot: mismatch === 'image' ? 'fixture.png' : null })) }; },
  } });
  assert.deepEqual(host.taskPolicies.map((policy: any) => policy.role), ['design', 'art', 'coding']);
  const makeTask = (role: string, acceptanceIds: string[]) => {
    const output = host.taskPolicies.find((policy: any) => policy.role === role).outputs[0];
    return { taskId: role, runId: 'game', specVersion: '1.0', authorId: `author-${role}`, context: { contextId: `author-context-${role}`, interfaces: [] }, inputs: [...host.availableArtifacts],
      outputs: [{ type: output.type, schema: output.schema, destination: output.destination }], artifacts: [], acceptanceIds, acceptance: requirement.acceptance.filter(item => acceptanceIds.includes(item.acceptanceId)),
      attempts: [{ attemptId: `attempt-${role}`, sessionRef: join(root, `sessions/attempt-${role}`) }], state: 'running', evidence: [],
      review: { reviewerId: 'independent-reviewer', contextId: 'review-context', verdict: 'approved', evidenceIds: [] } } as any;
  };
  const states = batched ? Array.from({ length: 16 }, (_, i) => `state-${i}`) : ['idle'];
  const design = { summary: '原创点击游戏', implementationNotes: ['点击星星获胜'], acceptanceMapping: { win: '点击目标显示胜利' },
    characters: Array.from({ length: batched ? 17 : 1 }, (_, i) => ({ id: batched ? `star-${i}` : 'star', purpose: '目标', states })),
    audio: Array.from({ length: batched ? 17 : 0 }, (_, i) => ({ id: `sound-${i}`, trigger: '点击', loop: false })) };
  await writeFile(join(root, 'authors/design/design.json'), JSON.stringify(design), 'utf8');
  const art = { characters: design.characters.map(({ id }) => ({ id, width: 32, height: 32, anchor: { x: 16, y: 16 },
    layers: [{ id: 'body', shape: 'ellipse', x: 2, y: 2, width: 28, height: 28, fill: '#ffee22', stroke: '#222222', strokeWidth: 1 }],
    states: states.map(name => ({ name, fps: 1, loop: true, frames: [{}] })) })),
    audio: design.audio.map(({ id, loop }) => ({ id, loop, sampleRate: 22050, duration: 0.02, notes: [
      { midi: 72, start: 0, duration: 0.02, gain: 0.2, wave: 'sine', attack: 0.002, release: 0.002 }] })) };
  const envelope = batched ? { formatVersion: 'batched-media/1', batches: [
    { characters: art.characters.slice(0, 16), audio: art.audio.slice(0, 16) }, { characters: art.characters.slice(16), audio: art.audio.slice(16) }] } : art;
  await writeFile(join(root, 'authors/art/media.json'), JSON.stringify(envelope), 'utf8');
  const designTask = makeTask('design', [DESIGN_ACCEPTANCE_ID]), artTask = makeTask('art', [MEDIA_ACCEPTANCE_ID]);
  designTask.artifacts = (await host.capture(designTask, {}, controller.signal)).artifacts;
  designTask.evidence = await host.verify(designTask, controller.signal); assert.equal(designTask.evidence[0].outcome, 'passed'); designTask.state = 'passed';
  artTask.inputs.push(...designTask.artifacts); artTask.artifacts = (await host.capture(artTask, {}, controller.signal)).artifacts;
  artTask.evidence = await host.verify(artTask, controller.signal); assert.equal(artTask.evidence[0].outcome, 'passed'); artTask.state = 'passed';
  await writeFile(join(root, 'authors/coding/src/main.ts'), '// Offline fake model artifact\n', 'utf8'); await writeFile(join(root, 'authors/coding/index.html'), '<div id="app"></div>', 'utf8');
  const task = makeTask('coding', ['win']); task.inputs.push(...designTask.artifacts, ...artTask.artifacts);
  return { root, host, task, upstream: [designTask, artTask], plays, envelope, draft };
}
test('generic host captures exact source and refuses a browser report for another run', async t => {
  const { host, task, upstream } = await fixture(t, true);
  task.artifacts = (await host.capture(task, {}, new AbortController().signal)).artifacts;
  const evidence = await host.verify(task, new AbortController().signal);
  assert.equal(evidence[0].outcome, 'failed');
  assert.equal((await host.finish([...upstream, task])).delivery, undefined);
});
test('delivery requires the independent verdict and exact host proof for the captured candidate', async t => {
  const { root, host, task, upstream } = await fixture(t);
  task.artifacts = (await host.capture(task, {}, new AbortController().signal)).artifacts;
  task.evidence = await host.verify(task, new AbortController().signal); assert.equal(task.evidence[0].outcome, 'passed');
  task.review.evidenceIds = task.evidence.map((item: any) => item.evidenceId);
  assert.equal((await host.finish([...upstream, task])).delivery, undefined);
  task.state = 'passed'; const result = await host.finish([...upstream, task]);
  assert.ok(result.delivery); assert.deepEqual(result.gaps, []);
  assert.equal(await readFile(join(root, result.delivery, 'src/main.ts'), 'utf8'), '// Offline fake model artifact\n');
});

test('standalone package is present in the final review snapshot before promotion', async t => {
  const { root, host, task } = await fixture(t);
  task.artifacts = (await host.capture(task, {}, new AbortController().signal)).artifacts;
  task.evidence = await host.verify(task, new AbortController().signal);
  assert.equal(task.evidence[0].outcome, 'passed');
  const candidate = task.artifacts[0];
  assert.match(await readFile(join(root, candidate.location, 'standalone-launcher.mjs'), 'utf8'), /node:http/);
  assert.match(await readFile(join(root, candidate.location, 'README.zh-CN.md'), 'utf8'), /node standalone-launcher\.mjs/);
  const packaged = JSON.parse(await readFile(join(root, candidate.location, '_cosmos/delivery.json'), 'utf8'));
  assert.deepEqual(packaged.candidate, candidate);
  assert.equal(await readFile(join(root, `reviews/${task.taskId}`, candidate.location, 'README.zh-CN.md'), 'utf8'),
    await readFile(join(root, candidate.location, 'README.zh-CN.md'), 'utf8'));
  assert.ok(task.evidence.some((item: any) => item.source.location.endsWith('/delivery-check.json')));
});

test('passing gameplay text cannot conceal missing runtime animation observations', async t => {
  const { root, host, task, upstream } = await fixture(t, 'media-missing');
  task.artifacts = (await host.capture(task, {}, new AbortController().signal)).artifacts;
  task.evidence = await host.verify(task, new AbortController().signal);
  assert.equal(task.evidence[0].outcome, 'failed'); assert.equal((await host.finish([...upstream, task])).delivery, undefined);
  const report = JSON.parse(await readFile(join(root, 'evidence/coding/media-usage.json'), 'utf8'));
  assert.ok(report.checks.some((check: any) => check.kind === 'state_seen' && check.result.actual === false));
  assert.equal(report.candidate.location, task.artifacts[0].location);
});

test('normal input screenshots reach independent review as observed evidence for the exact candidate', async t => {
  const { host, task } = await fixture(t, 'image');
  task.artifacts = (await host.capture(task, {}, new AbortController().signal)).artifacts;
  task.evidence = await host.verify(task, new AbortController().signal);
  assert.equal(typeof host.reviewImages, 'function');
  const images = await host.reviewImages(task, new AbortController().signal);
  assert.equal(images.length, 1); assert.equal(images[0].image.mimeType, 'image/png');
  assert.ok(task.evidence.some((item: any) => item.kind === 'screenshot' && item.outcome === 'observed' && item.source.location === images[0].source.location));
  assert.ok(task.evidence.some((item: any) => item.kind === 'log' && item.source.location.endsWith('/media-usage.json')), 'Review needs read permission for the actual media observations');
});

test('recovery rejects a stage capture whose provenance no longer names the original author attempt', async t => {
  const { root, host, upstream } = await fixture(t);
  const path = join(root, 'registry/captures/design/v1/capture.json');
  const record = JSON.parse(await readFile(path, 'utf8')); record.metadata.provenance.sourceRefs = ['another-attempt'];
  await writeFile(path, JSON.stringify(record), 'utf8');
  assert.equal(await host.recoverCapture(upstream[0], {}, new AbortController().signal), null);
});

test('production host captures every batch, gives coding one complete capture and samples 629 fields on unchanged normal input', async t => {
  const { root, host, task, upstream, plays, envelope, draft } = await fixture(t, false, true);
  const mediaRef = upstream[1].artifacts[0];
  assert.equal(task.inputs.filter((ref: any) => ref.artifactId === mediaRef.artifactId).length, 1);
  const manifest = JSON.parse(await readFile(join(root, mediaRef.location, 'public/assets/manifest.json'), 'utf8'));
  assert.equal(manifest.characters.length, 17); assert.equal(manifest.audio.length, 17);
  assert.deepEqual(JSON.parse(await readFile(join(root, mediaRef.location, '_cosmos/mediaSpec.json'), 'utf8')), envelope);
  assert.ok(await host.recoverCapture(upstream[1], {}, new AbortController().signal));
  task.artifacts = (await host.capture(task, {}, new AbortController().signal)).artifacts;
  const staged = task.artifacts[0].location;
  assert.deepEqual(JSON.parse(await readFile(join(root, staged, 'public/assets/manifest.json'), 'utf8')), manifest);
  assert.match(await readFile(join(root, staged, 'public/assets/star-16/state-15-000.svg'), 'utf8'), /<svg/);
  assert.equal((await readFile(join(root, staged, 'public/assets/audio/sound-16.wav'))).subarray(0, 4).toString(), 'RIFF');
  task.evidence = await host.verify(task, new AbortController().signal); assert.equal(task.evidence[0].outcome, 'passed');
  assert.deepEqual(plays[0].plan.steps, draft.scenario.steps); assert.equal(plays[0].options.mediaObservations.fields.length, 629);
  assert.deepEqual(plays[0].options.mediaObservations.media, mediaRef); assert.deepEqual(plays[0].options.mediaObservations.candidate, task.artifacts[0]);
  const usage = JSON.parse(await readFile(join(root, 'evidence/coding/media-usage.json'), 'utf8'));
  assert.equal(usage.coverage.valid, true); assert.equal(usage.coverage.complete, true); assert.equal(usage.coverage.checks.length, 629);
});
for (const fault of ['sample-binding', 'sample-missing'] as const) test(`production generic collection rejects ${fault}`, async t => {
  const { root, host, task, upstream } = await fixture(t, fault, true);
  task.artifacts = (await host.capture(task, {}, new AbortController().signal)).artifacts;
  task.evidence = await host.verify(task, new AbortController().signal); assert.equal(task.evidence[0].outcome, 'failed');
  assert.equal((await host.finish([...upstream, task])).delivery, undefined);
  const usage = JSON.parse(await readFile(join(root, 'evidence/coding/media-usage.json'), 'utf8'));
  assert.equal(fault === 'sample-binding' ? usage.coverage.valid : usage.coverage.complete, false);
});
