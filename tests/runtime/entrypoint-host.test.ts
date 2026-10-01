import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { IntakeController } from '../../src/runtime/intake.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { withHostStages, DESIGN_ACCEPTANCE_ID, MEDIA_ACCEPTANCE_ID } from '../../src/roles/requirements.ts';
import * as hosts from '../../src/runtime/entrypoint-host.ts';
async function fixture(t: test.TestContext, mismatch: boolean | 'media-missing' | 'image' = false) {
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
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  await mkdir(join(root, 'toolchain'), { recursive: true });
  for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await writeFile(join(root, 'toolchain', file), file === 'vite.config.ts' ? 'export default {}' : '{}', 'utf8');
  const host = await hosts.createBrowserHost({ root, controller, requirement, draft, work, resume: false, io: {
    async build(project: string) { await mkdir(join(project, 'dist')); await writeFile(join(project, 'dist/index.html'), '<p>offline fixture</p>', 'utf8'); return { passed: true, diagnostics: 'Offline build fixture' }; },
    async play(plan: any) {
      if (mismatch === 'image') { await mkdir(join(root, 'browser-evidence'), { recursive: true }); await writeFile(join(root, 'browser-evidence/fixture.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfXcAAAAASUVORK5CYII=', 'base64')); }
      return { formatVersion: '1.0.0', kind: 'normal_browser_input', plan: { ...plan, ...(mismatch === true ? { runId: 'wrong-run' } : {}) }, outcome: 'passed',
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
  const design = { summary: '原创点击游戏', implementationNotes: ['点击星星获胜'], acceptanceMapping: { win: '点击目标显示胜利' }, characters: [{ id: 'star', purpose: '目标', states: ['idle'] }], audio: [] };
  await writeFile(join(root, 'authors/design/design.json'), JSON.stringify(design), 'utf8');
  await writeFile(join(root, 'authors/art/media.json'), JSON.stringify({ characters: [{ id: 'star', width: 32, height: 32, anchor: { x: 16, y: 16 },
    layers: [{ id: 'body', shape: 'ellipse', x: 2, y: 2, width: 28, height: 28, fill: '#ffee22', stroke: '#222222', strokeWidth: 1 }], states: [{ name: 'idle', fps: 1, loop: true, frames: [{}] }] }], audio: [] }), 'utf8');
  const designTask = makeTask('design', [DESIGN_ACCEPTANCE_ID]), artTask = makeTask('art', [MEDIA_ACCEPTANCE_ID]);
  designTask.artifacts = (await host.capture(designTask, {}, controller.signal)).artifacts;
  designTask.evidence = await host.verify(designTask, controller.signal); assert.equal(designTask.evidence[0].outcome, 'passed'); designTask.state = 'passed';
  artTask.inputs.push(...designTask.artifacts); artTask.artifacts = (await host.capture(artTask, {}, controller.signal)).artifacts;
  artTask.evidence = await host.verify(artTask, controller.signal); assert.equal(artTask.evidence[0].outcome, 'passed'); artTask.state = 'passed';
  await writeFile(join(root, 'authors/coding/src/main.ts'), '// Offline fake model artifact\n', 'utf8'); await writeFile(join(root, 'authors/coding/index.html'), '<div id="app"></div>', 'utf8');
  const task = makeTask('coding', ['win']); task.inputs.push(...designTask.artifacts, ...artTask.artifacts);
  return { root, host, task, upstream: [designTask, artTask] };
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
