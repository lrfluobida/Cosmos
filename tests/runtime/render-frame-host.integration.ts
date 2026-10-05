import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { genericHostFixture } from './generic-persistent-host.fixture.ts';
import { createCodingBuildCheck } from '../../src/runtime/entrypoint-coding-check.ts';
import { createHash } from 'node:crypto';

test('actual captured Phaser factory measures native canvas rendering in the original save/reopen pipeline', { timeout: 120_000 }, async t => {
  const { root, host, task, controller, work } = await genericHostFixture(t, 'frame-native-real', true, true);
  const observer = host.availableArtifacts.find(ref => ref.artifactId === 'render-frame-observer')!, template = host.availableArtifacts.find(ref => ref.artifactId === 'generic-template')!;
  const moduleBytes = await readFile(join(root, observer.location, '_cosmos/render-frame-observer.ts')), state = await controller.read();
  const advisory = createCodingBuildCheck({ controller, work, workspace: root, toolchain: join(root, 'toolchain'), template: join(root, template.location),
    media: join(root, task.inputs.find((ref: any) => ref.artifactId === 'media').location), taskId: task.taskId, attemptId: task.attempts[0].attemptId,
    observer: { directory: join(root, observer.location), ref: observer, sha256: createHash('sha256').update(moduleBytes).digest('hex') },
    guard: async () => ({ taskId: task.taskId, windowId: null, deadlineAt: state.run.originalDeadlineAt }) });
  const advisoryResult = await advisory.tool.execute('free-advisory', {}, controller.signal);
  const checked = JSON.parse(advisoryResult.content.find((row: any) => row.type === 'text')!.text);
  assert.equal(checked.passed, true, checked.diagnostics); assert.deepEqual(checked.results.map((row: any) => row.code), [0, 0]);
  assert.ok((await readFile(join(checked.work, '_cosmos/render-frame-observer.ts'))).equals(moduleBytes));
  task.evidence = await host.verify(task, controller.signal); assert.equal(task.evidence[0].outcome, 'passed', task.evidence[0].summary);
  const frames = JSON.parse(await readFile(join(root, 'evidence/coding/render-frames.json'), 'utf8'));
  assert.equal(frames.samples.length, 2);
  for (const row of frames.samples) {
    assert.equal(row.assessment.status, 'measured', JSON.stringify(row)); assert.ok(row.assessment.averageRenderFps > 0); assert.ok(row.assessment.renderedFrames > 2);
    assert.equal(row.raw.after.engineVersion, '3.90.0'); assert.equal(row.raw.after.renderer, 'canvas'); assert.equal(row.raw.after.nativePipeline, true);
    assert.equal(row.raw.after.surface.width, 800); assert.equal(row.raw.after.surface.height, 500); assert.equal(row.assessment.resolutionMatchesViewport, false);
    assert.equal(row.raw.request.machine.frozen, false); assert.equal(row.assessment.performancePolicy, 'not_executed');
    const actualFrames = row.raw.after.frames.filter((frame: any) => frame.sequence > row.raw.before.sequence);
    assert.ok(actualFrames.every((frame: any) => frame.rendererPostCalls === 1 && frame.sceneRenders === 2 && frame.draws > 1 && frame.boundary === 'native-post-render'));
    assert.equal(new Set(actualFrames.map((frame: any) => frame.loopFrame)).size, actualFrames.length);
    assert.equal(actualFrames.at(-1).loopFrame - actualFrames[0].loopFrame + 1, actualFrames.length);
    assert.equal(row.raw.viewport.width, 1280); assert.equal(row.raw.viewport.height, 720); assert.equal(row.raw.recording.kind, 'persistent-screencast');
  }
  const original = JSON.parse(await readFile(join(root, 'evidence/coding/browser.json'), 'utf8'));
  assert.notEqual(original.segments[0].report.session.browserPid, original.segments[1].report.session.browserPid);
  assert.deepEqual(frames.samples.map((row: any) => row.raw.request.candidate), [task.artifacts[0], task.artifacts[0]]);
  const partial = JSON.parse(await readFile(join(root, 'evidence/coding/classic-policy.json'), 'utf8'));
  assert.equal(partial.entries.length, 230); assert.equal(partial.entries.find((row: any) => row.entryId === 'PERFORMANCE').outcome, 'policy_not_executed');
  assert.ok(task.evidence.some((row: any) => row.source.location.endsWith('render-frames.json')));
  const review = await readFile(join(root, 'reviews/coding/evidence/coding/render-frames.json')); assert.ok(review.equals(await readFile(join(root, 'evidence/coding/render-frames.json'))));
  console.log(JSON.stringify({ fixtureOnly: true, generatedByCosmos: false, modelCalls: 0, paid: 0, evidenceRoot: root, samples: frames.samples.map((row: any) => row.assessment),
    advisoryCodes: checked.results.map((row: any) => row.code), observerBytesMatched: true, browser: original.segments[0].report.browser,
    pids: original.segments.map((row: any) => row.report.session.browserPid), policy: 'not_executed' }));
});
