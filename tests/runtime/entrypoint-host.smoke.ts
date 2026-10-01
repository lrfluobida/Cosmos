import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { IntakeController } from '../../dist/runtime/intake.js';
import { RunController } from '../../dist/runtime/run.js';
import { OwnedWork } from '../../dist/runtime/recovery/owned-work.js';
import { createBrowserHost } from '../../dist/runtime/entrypoint-host.js';
import { withHostStages, DESIGN_ACCEPTANCE_ID, MEDIA_ACCEPTANCE_ID } from '../../dist/roles/requirements.js';

// Explicit smoke command only: npm test does not discover *.smoke.ts.
// All sources below are a generic fixture. No model session or paid API is invoked.
test('compiled production host builds and browser-verifies a generic fixture through owned children', async t => {
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const root = join(repository, '.cosmos/cos18-host-smoke', randomUUID()); await mkdir(root, { recursive: true });
  await writeFile(join(root, 'SCOPE.txt'), 'Zero-API production-host smoke using the generic template and test media. This is not a Cosmos-generated game.\n', 'utf8');
  const template = join(repository, 'templates/2d');
  await cp(template, join(root, 'toolchain'), { recursive: true, filter: path => relative(template, path).split(sep)[0] !== 'dist' });
  const intake = await IntakeController.create({ root, runId: 'host-smoke', ledgerId: 'host-smoke-synthetic', specVersion: '1.0', durationMs: 180000,
    interviewTaskId: 'intake', maxRequests: 2, allocations: [{ taskId: 'intake', amountMicroCny: 100 }, { taskId: 'planning', amountMicroCny: 100 }] });
  const draft = withHostStages({ brief: '通用模板输入与媒体接线测试', questions: [{ id: 'scope', prompt: '测试范围？' }], answers: { scope: '只检查通用fixture接线，不调用模型' }, unsupported: [],
    acceptance: [{ acceptanceId: 'click', description: '正常点击模板精灵', steps: ['等待场景就绪', '点击精灵'], expected: '点击次数变为 1', evidenceKinds: ['test_report'] }],
    scenario: { viewport: { width: 1280, height: 720 }, steps: [
      { id: 'ready', kind: 'wait-for', acceptanceId: 'click', observation: { kind: 'text', selector: '[data-testid="fixture-status"]' }, expected: 'playground:0', timeoutMs: 15000 },
      { id: 'click-sprite', kind: 'mouse-click', selector: 'canvas', x: 0.3, y: 0.5 },
      { id: 'clicked', kind: 'wait-for', acceptanceId: 'click', observation: { kind: 'text', selector: '[data-testid="fixture-status"]' }, expected: 'playground:1', timeoutMs: 3000 },
    ] } });
  const saved = await intake.saveDraft(draft), requirement = await intake.confirm({ revision: saved.revision, confirmed: true, actorId: 'offline-fixture-owner', at: new Date().toISOString() });
  await intake.activateGeneration({ environmentReady: true, executionReady: true }); await intake.close();
  const controller = await RunController.open({ root }); t.after(() => controller.close());
  const host = await createBrowserHost({ root, controller, requirement, draft, work: new OwnedWork(controller.signal), resume: false });
  const design = { summary: '通用模板测试设计', implementationNotes: ['使用已有精灵点击流程检查媒体接线'], acceptanceMapping: { click: '点击精灵使原计数加一' },
    characters: [{ id: 'fixture-marker', purpose: '通用精灵素材', states: ['idle'] }], audio: [{ id: 'fixture-tone', trigger: '点击精灵', loop: false }] };
  const media = { characters: [{ id: 'fixture-marker', width: 56, height: 56, anchor: { x: 28, y: 28 },
    layers: [{ id: 'body', shape: 'ellipse', x: 4, y: 4, width: 48, height: 48, fill: '#81e4cb', stroke: '#172637', strokeWidth: 2 }],
    states: [{ name: 'idle', fps: 1, loop: true, frames: [{}] }] }],
    audio: [{ id: 'fixture-tone', sampleRate: 22050, duration: 0.2, loop: false, notes: [{ midi: 72, start: 0, duration: 0.2, gain: 0.2, wave: 'sine', attack: 0.01, release: 0.02 }] }] };
  await writeFile(join(root, 'authors/design/design.json'), JSON.stringify(design), 'utf8');
  await writeFile(join(root, 'authors/art/media.json'), JSON.stringify(media), 'utf8');
  const makeTask = (role: string, ids: string[], inputs: any[]) => {
    const output = host.taskPolicies.find(policy => policy.role === role)!.outputs[0];
    return { taskId: role, runId: 'host-smoke', specVersion: '1.0', authorId: `${role}-fixture-author`, context: { contextId: `${role}-fixture-context`, interfaces: [] }, inputs,
      outputs: [{ type: output.type, schema: output.schema, destination: output.destination }], acceptanceIds: ids, acceptance: requirement.acceptance.filter(item => ids.includes(item.acceptanceId)), artifacts: [], evidence: [],
      attempts: [{ attemptId: `${role}-fixture`, sessionRef: join(root, `fixture-sessions/${role}`) }], state: 'running',
      review: { verdict: 'approved', reviewerId: 'offline-host-test', contextId: 'offline-test-context', evidenceIds: [] } } as any;
  };
  const designTask = makeTask('design', [DESIGN_ACCEPTANCE_ID], [...host.availableArtifacts]);
  designTask.artifacts = (await host.capture(designTask, {}, controller.signal)).artifacts; designTask.evidence = await host.verify(designTask, controller.signal);
  assert.equal(designTask.evidence[0].outcome, 'passed'); designTask.state = 'passed';
  const artTask = makeTask('art', [MEDIA_ACCEPTANCE_ID], [...host.availableArtifacts, ...designTask.artifacts]);
  artTask.artifacts = (await host.capture(artTask, {}, controller.signal)).artifacts; artTask.evidence = await host.verify(artTask, controller.signal);
  assert.equal(artTask.evidence[0].outcome, 'passed'); artTask.state = 'passed';
  let source = await readFile(join(repository, 'templates/2d/src/main.ts'), 'utf8');
  const instrumentation = `const mediaObservation = { characters: [{id:'fixture-marker',loadedFrames:0,states:[{name:'idle',seen:false}]}],audio:[{id:'fixture-tone',decoded:false,started:false}] };
const mediaSnapshot = () => JSON.parse(JSON.stringify(mediaObservation)) as typeof mediaObservation;
`;
  source = source.replace("type Snapshot =", instrumentation + "type Snapshot =");
  source = source.replace('x: number; y: number }>', 'x: number; y: number; media: typeof mediaObservation }>');
  source = source.replace("scene: 'loading', clicks: 0, x: 0, y: 0", "scene: 'loading', clicks: 0, x: 0, y: 0, media: mediaSnapshot()");
  source = source.replace('x: Math.round(x), y: Math.round(y)', 'x: Math.round(x), y: Math.round(y), media: mediaSnapshot()');
  source = source.replace('if (observation) observation.textContent', "const status = document.querySelector('[data-testid=fixture-status]'); if(status) status.textContent = scene + ':' + clicks;\n  if (observation) observation.textContent");
  source = source.replace("constructor() { super('playground'); }", "constructor() { super('playground'); }\n  preload(): void { this.load.svg('host-frame','/assets/fixture-marker/idle-000.svg'); this.load.audio('host-audio','/assets/audio/fixture-tone.wav'); }");
  source = source.replace("this.add.sprite(240, 250, 'marker')", "this.add.sprite(240, 250, 'host-frame')");
  source = source.replace("const publish = () => observe('playground', clicks, sprite.x, sprite.y);", `const publish = () => observe('playground', clicks, sprite.x, sprite.y);
    mediaObservation.characters[0].loadedFrames = this.textures.exists('host-frame') ? 1 : 0;
    mediaObservation.audio[0].decoded = this.cache.audio.exists('host-audio');
    const sound = this.sound.add('host-audio'); sound.on('play', () => {mediaObservation.audio[0].started = sound.isPlaying; publish();});
    this.sound.once('unlocked', () => sound.play());
    this.events.once(Phaser.Scenes.Events.POST_UPDATE, () => {mediaObservation.characters[0].states[0].seen = sprite.active && sprite.visible && sprite.texture.key === 'host-frame'; publish();});`);
  source = source.replace("sprite.on('pointerdown', () => {", "sprite.on('pointerdown', () => {\n      sound.play();");
  const html = (await readFile(join(repository, 'templates/2d/index.html'), 'utf8')).replace('<div id="game"', '<p data-testid="fixture-status">Loading</p><div id="game"');
  await writeFile(join(root, 'authors/coding/src/main.ts'), source, 'utf8'); await writeFile(join(root, 'authors/coding/index.html'), html, 'utf8');
  const coding = makeTask('coding', ['click'], [...host.availableArtifacts, ...designTask.artifacts, ...artTask.artifacts]);
  coding.artifacts = (await host.capture(coding, {}, controller.signal)).artifacts;
  coding.evidence = await host.verify(coding, controller.signal);
  assert.equal(coding.evidence[0].outcome, 'passed', `Inspect retained host evidence at ${root}`);
  coding.review.evidenceIds = coding.evidence.map((item: any) => item.evidenceId); coding.state = 'passed';
  const delivery = await host.finish([designTask, artTask, coding]); assert.ok(delivery.delivery);
  const images = await host.reviewImages!(coding, controller.signal); assert.ok(images.length > 0);
  assert.equal((await controller.read()).ledger.entries.length, 0);
  const report = { kind: 'zero-api-host-smoke', generatedByCosmos: false, modelRequests: 0, fixture: 'generic 2D template with test-only media observations', delivery,
    evidenceRoot: root, browserReport: 'evidence/coding/browser.json', mediaReport: 'evidence/coding/media-usage.json', screenshots: images.map(image => image.source.location) };
  await writeFile(join(root, 'smoke-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(report));
});
