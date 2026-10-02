import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { IntakeController } from '../../dist/runtime/intake.js';
import { RunController } from '../../dist/runtime/run.js';
import { buildContinuationQuote } from '../../dist/runtime/continuation-quote.js';
import { OwnedWork } from '../../dist/runtime/recovery/owned-work.js';
import { createArtifactRegistry } from '../../dist/artifacts/index.js';
import { createBrowserHost } from '../../dist/runtime/entrypoint-host.js';
import { withHostStages, DESIGN_ACCEPTANCE_ID, MEDIA_ACCEPTANCE_ID } from '../../dist/roles/requirements.js';
import { task as taskFixture } from '../contracts/fixtures.ts';

// Explicit, reviewed smoke only. No model session/API: generic template and test-only media.
test('authorized continuation host owns real build/browser children in the fresh workspace window', async t => {
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const root = join(repository, '.cosmos/cos18-continuation-host-smoke', randomUUID()); await mkdir(root, { recursive: true });
  await writeFile(join(root, 'SCOPE.txt'), 'Zero-API continuation host smoke. Generic template and test-only media; generatedByCosmos=false. No model generation or game acceptance claim.\n', 'utf8');
  const template = join(repository, 'templates/2d');
  await cp(template, join(root, 'toolchain'), { recursive: true, filter: path => relative(template, path).split(sep)[0] !== 'dist' });
  const originalNow = () => Date.now() - 13 * 60 * 60 * 1000;
  const intake = await IntakeController.create({ root, runId: 'continuation-host-smoke', ledgerId: 'smoke-synthetic-ledger', specVersion: '1.0',
    interviewTaskId: 'intake', maxRequests: 2, allocations: [{ taskId: 'intake', amountMicroCny: 100 }, { taskId: 'planning', amountMicroCny: 100 }], now: originalNow });
  const draft = withHostStages({ brief: '通用模板续跑输入与媒体接线测试', questions: [{ id: 'scope', prompt: '测试范围？' }], answers: { scope: '只检查授权窗口与通用fixture接线，不调用模型' }, unsupported: [],
    acceptance: [{ acceptanceId: 'click', description: '正常点击模板精灵', steps: ['等待场景就绪', '点击精灵'], expected: '点击次数变为 1', evidenceKinds: ['test_report'] }],
    scenario: { viewport: { width: 1280, height: 720 }, steps: [
      { id: 'ready', kind: 'wait-for', acceptanceId: 'click', observation: { kind: 'text', selector: '[data-testid="fixture-status"]' }, expected: 'playground:0', timeoutMs: 15000 },
      { id: 'click-sprite', kind: 'mouse-click', selector: 'canvas', x: 0.3, y: 0.5 },
      { id: 'clicked', kind: 'wait-for', acceptanceId: 'click', observation: { kind: 'text', selector: '[data-testid="fixture-status"]' }, expected: 'playground:1', timeoutMs: 3000 },
    ] } });
  const saved = await intake.saveDraft(draft), requirement = await intake.confirm({ revision: saved.revision, confirmed: true, actorId: 'offline-fixture-owner', at: new Date(originalNow()).toISOString() });
  await intake.activateGeneration({ environmentReady: true, executionReady: true }); await intake.close();
  let controller = await RunController.open({ root, now: originalNow }); t.after(() => controller.close());
  const oldHost = await createBrowserHost({ root, controller, requirement, draft, work: new OwnedWork(controller.signal), resume: false });
  const state = await controller.read();
  const originals = oldHost.taskPolicies.map((policy, index) => {
    const prior = index === 0 ? [] : index === 1 ? [oldHost.taskPolicies[0]] : oldHost.taskPolicies.slice(0, 2);
    const ids = index === 0 ? [DESIGN_ACCEPTANCE_ID] : index === 1 ? [MEDIA_ACCEPTANCE_ID] : ['click'];
    const task = taskFixture() as any;
    Object.assign(task, { taskId: `old-${policy.role}`, runId: state.run.runId, specVersion: requirement.specVersion, authorId: `${policy.role}-fixture-author`, objective: `Generic fixture ${policy.role}`,
      acceptanceIds: ids, acceptance: requirement.acceptance.filter(item => ids.includes(item.acceptanceId)).map(item => ({ acceptanceId: item.acceptanceId, steps: item.steps, expected: item.expected, evidenceDestinations: [`evidence/old-${policy.role}/host-report.json`] })),
      context: { contextId: `${policy.role}-fixture-context`, rules: policy.rules, interfaces: [], knownFailures: [], tools: [] },
      inputs: [...oldHost.availableArtifacts, ...prior.map(item => ({ artifactId: item.outputs[0].artifactId, version: item.outputs[0].version, location: item.outputs[0].location }))],
      dependsOn: prior.map(item => ({ taskId: `old-${item.role}`, requiredState: 'passed', state: 'not_started' })), ownership: { writePaths: policy.writePaths, readOnlyPaths: policy.readOnlyPaths },
      outputs: policy.outputs.map(item => ({ type: item.type, schema: item.schema, destination: item.destination })), budget: { ledgerId: state.ledger.ledgerId, allocationMicroCny: policy.allocationMicroCny, originalDeadlineAt: state.run.originalDeadlineAt },
      state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [], handoff: { completed: [], remaining: [], uncertainty: [], resumeFrom: null },
      review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] } });
    return { role: policy.role, task, workspace: root, expectedArtifacts: policy.outputs.map(item => ({ artifactId: item.artifactId, version: item.version, location: item.location })) };
  });
  await controller.registerTasks(originals.map(item => item.task));
  await writeFile(join(root, 'authors/coding/index.html'), '<p>Preserved unverified original partial fixture</p>', 'utf8');
  await controller.stop('Offline original window ended; explicit fixture continuation required.');
  const original = await controller.read(); await controller.close();
  const quote = await buildContinuationQuote({ root, additionalMicroCny: 0, additionalDurationMs: 600000 });
  const confirmation = { decisionId: 'host-smoke-decision', actorId: 'offline-fixture-owner', decidedAt: new Date().toISOString(), source: { artifactId: 'smoke-confirmation', version: 'v1', location: 'continuation-confirmation.json' } };
  await writeFile(join(root, confirmation.source.location), JSON.stringify({ formatVersion: 'continuation-confirmation-1', decisionId: confirmation.decisionId, actorId: confirmation.actorId, decidedAt: confirmation.decidedAt, confirmed: true, quote }), 'utf8');
  const window = await RunController.activateContinuation({ root, quote, confirmation }); controller = await RunController.open({ root, windowId: window.windowId });
  const registry = await createArtifactRegistry({ workspaceRoot: root, registryRoot: 'registry' }), workspace = join(root, 'continuations/host-smoke-decision/workspace');
  const tasks = originals.map(item => {
    const task = structuredClone(item.task), grant = window.grants.find(grant => grant.sourceTaskId === task.taskId)!;
    const ref = item.role === 'coding' ? registry.candidateRef('game', 'continued-v1') : registry.artifactRef(item.role === 'design' ? 'design' : 'media', 'continued-v1');
    task.taskId = grant.taskId; task.authorId = `fixture-author-${grant.taskId}`; task.context.contextId = `fixture-context-${grant.taskId}`; task.budget.allocationMicroCny = grant.amountMicroCny;
    task.outputs[0].destination = ref.location; task.dependsOn = task.dependsOn.map((dep: any) => ({ ...dep, taskId: window.grants.find(grant => grant.sourceTaskId === dep.taskId)!.taskId }));
    task.inputs = task.inputs.map((input: any) => ['design', 'media'].includes(input.artifactId) ? registry.artifactRef(input.artifactId, 'continued-v1') : input);
    return { ...item, task, workspace, expectedArtifacts: [ref] };
  });
  const host = await createBrowserHost({ root, controller, requirement, draft, work: new OwnedWork(controller.signal), resume: true, binding: { windowId: window.windowId, tasks } });
  await controller.registerTasks(tasks.map(item => item.task));
  const design = { summary: '通用模板测试设计', implementationNotes: ['使用已有精灵点击流程检查媒体接线'], acceptanceMapping: { click: '点击精灵使原计数加一' },
    characters: [{ id: 'fixture-marker', purpose: '通用精灵素材', states: ['idle'] }], audio: [{ id: 'fixture-tone', trigger: '点击精灵', loop: false }] };
  const media = { characters: [{ id: 'fixture-marker', width: 56, height: 56, anchor: { x: 28, y: 28 }, layers: [{ id: 'body', shape: 'ellipse', x: 4, y: 4, width: 48, height: 48, fill: '#81e4cb', stroke: '#172637', strokeWidth: 2 }], states: [{ name: 'idle', fps: 1, loop: true, frames: [{}] }] }],
    audio: [{ id: 'fixture-tone', sampleRate: 22050, duration: 0.2, loop: false, notes: [{ midi: 72, start: 0, duration: 0.2, gain: 0.2, wave: 'sine', attack: 0.01, release: 0.02 }] }] };
  let source = await readFile(join(template, 'src/main.ts'), 'utf8');
  const instrumentation = `const mediaObservation = { characters: [{id:'fixture-marker',loadedFrames:0,states:[{name:'idle',seen:false}]}],audio:[{id:'fixture-tone',decoded:false,started:false}] };
const mediaSnapshot = () => JSON.parse(JSON.stringify(mediaObservation)) as typeof mediaObservation;
`;
  source = source.replace('type Snapshot =', instrumentation + 'type Snapshot =');
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
  const html = (await readFile(join(template, 'index.html'), 'utf8')).replace('<div id="game"', '<p data-testid="fixture-status">Loading</p><div id="game"');
  for (const item of tasks) {
    const task = structuredClone(item.task);
    task.dependsOn = task.dependsOn.map((dep: any) => ({ ...dep, state: 'passed' }));
    await host.preAuthor!(task, controller.signal);
    task.state = 'ready'; await controller.saveTask(task, { role: 'system', actorId: 'offline-host-fixture' });
    const attemptId = randomUUID(), sessionRef = join(root, 'sessions', attemptId); await mkdir(sessionRef, { recursive: true });
    task.state = 'running'; task.attempts = [{ attemptId, sessionRef, startedAt: new Date().toISOString(), endedAt: null, outcome: 'running', failure: null }];
    await controller.saveTask(task, { role: 'system', actorId: 'offline-host-fixture' });
    if (item.role === 'design') await writeFile(join(workspace, 'authors/design/design.json'), JSON.stringify(design), 'utf8');
    else if (item.role === 'art') await writeFile(join(workspace, 'authors/art/media.json'), JSON.stringify(media), 'utf8');
    else { await writeFile(join(workspace, 'authors/coding/src/main.ts'), source, 'utf8'); await writeFile(join(workspace, 'authors/coding/index.html'), html, 'utf8'); }
    task.artifacts = (await host.capture(task, { summary: 'Offline fixture', remaining: [], uncertainty: [] }, controller.signal)).artifacts;
    task.evidence = await host.verify(task, controller.signal);
    assert.equal(task.evidence[0].outcome, 'passed', `Inspect retained evidence at ${root}`);
    task.state = 'awaiting_review'; task.attempts[0].endedAt = new Date().toISOString(); task.attempts[0].outcome = 'passed';
    await controller.saveTask(task, { role: 'system', actorId: 'offline-host-fixture' });
    task.review = { verdict: 'approved', reviewerId: 'offline-fixture-checker', contextId: 'offline-fixture-check-context', inputVersions: [...task.inputs, ...task.artifacts], evidenceIds: task.evidence.map((item: any) => item.evidenceId) };
    task.state = 'passed'; await controller.saveTask(task, { role: 'reviewer', actorId: task.review.reviewerId });
    Object.assign(item.task, task);
  }
  const delivery = await host.finish(tasks.map(item => item.task)); assert.ok(delivery.delivery);
  const coding = tasks.find(item => item.role === 'coding')!.task, images = await host.reviewImages!(coding, controller.signal);
  assert.ok(images.length > 0);
  const final = await controller.read(); assert.equal(final.ledger.entries.length, 0); assert.deepEqual(final.stopReason, original.stopReason);
  assert.equal(await readFile(join(root, 'authors/coding/index.html'), 'utf8'), '<p>Preserved unverified original partial fixture</p>');
  const capture = await registry.getCapture(registry.artifactRef('game-source', 'continued-v1'));
  assert.equal(capture.sourceRoot, 'continuations/host-smoke-decision/workspace/authors/coding');
  assert.ok(capture.metadata.provenance.sourceRefs.includes(coding.attempts[0].sessionRef));
  await controller.close();
  const report = { kind: 'zero-api-continuation-host-smoke', generatedByCosmos: false, modelRequests: 0, fixture: 'generic template with test-only media and offline fixture verdicts', windowId: window.windowId,
    originalDeadlineAt: original.run.originalDeadlineAt, deadlineAt: window.deadlineAt, delivery, evidenceRoot: root, browserReport: `evidence/${coding.taskId}/browser.json`,
    mediaReport: `evidence/${coding.taskId}/media-usage.json`, screenshots: images.map(image => image.source.location), ownerClosed: true };
  await writeFile(join(root, 'smoke-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8'); console.log(JSON.stringify(report));
});
