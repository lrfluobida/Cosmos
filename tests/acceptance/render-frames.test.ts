import assert from 'node:assert/strict';
import test from 'node:test';
import { assessRenderFrames, validateRenderFrameRequest } from '../../src/acceptance/render-frames.ts';

const ref = (artifactId: string) => ({ artifactId, version: 'v1', location: `registry/${artifactId}/v1/files` });
const request: any = { formatVersion: 'render-frame-request/1', candidate: ref('game'), observer: ref('render-frame-observer'), observerSha256: 'a'.repeat(64),
  requirement: ref('requirement'), design: ref('design'), media: ref('media'), manifestSha256: 'b'.repeat(64), planBindingSha256: 'c'.repeat(64),
  runId: 'run', taskId: 'coding', attemptId: 'attempt', specVersion: '1.0', windowId: null, deadlineAt: Date.now() + 60_000,
  durationMs: 2000, modulePath: '/assets/cosmos-render-observer.js', machine: { frozen: false, platform: 'synthetic fixture', cpu: null, gpu: null },
  collection: { kind: 'normal', reportId: 'normal-report' } };
const snapshot = (sequence: number, time: number): any => ({ formatVersion: 'phaser-render-observer/1', engineVersion: '3.90.0', gameId: 'fixture-game',
  renderer: 'canvas', nativePipeline: true, activeScenes: ['fixture'], visible: true, paused: false, issues: [], sequence, now: time,
  surface: { width: 800, height: 500, cssWidth: 1152, cssHeight: 720, dpr: 1 }, frames: [] });
const sample = (): any => ({ request: structuredClone(request), startedAt: new Date(Date.now() - 2000).toISOString(), endedAt: new Date().toISOString(),
  before: snapshot(10, 100), after: { ...snapshot(130, 2100), frames: Array.from({ length: 120 }, (_, index) => ({ sequence: 11 + index, time: 100 + (index + 1) * 2000 / 120,
    draws: 1, boundary: 'native-post-render', rendererPostCalls: 1, sceneRenders: 1, nativeStepSequence: 11 + index, loopFrame: 51 + index })) },
  recording: { kind: 'context-video', enabled: true }, viewport: { width: 1280, height: 720 }, browser: { channel: 'fixture', version: 'fixture', headless: true } });

// Pure synthetic shape/arithmetic checks; production authentication requires the captured module and raw reports.
test('render sampling reports actual count/time arithmetic and buffer mismatch without a performance verdict', () => {
  assert.deepEqual(validateRenderFrameRequest(request), []); const result = assessRenderFrames(request, sample());
  assert.equal(result.status, 'measured'); assert.equal(result.averageRenderFps, 60); assert.equal(result.renderedFrames, 120); assert.equal(result.elapsedMs, 2000);
  assert.equal(result.resolutionMatchesViewport, false); assert.equal(result.performancePolicy, 'not_executed'); assert.ok(result.gaps.includes('machine_not_frozen'));
});
test('multiple draws and active scene renders count once at the native post-render boundary', () => {
  const value = sample(); for (const row of value.after.frames) { row.draws = 12; row.sceneRenders = 4; }
  assert.equal(assessRenderFrames(request, value).renderedFrames, 120); assert.equal(assessRenderFrames(request, value).averageRenderFps, 60);
  for (const change of [
    (row: any) => { row.boundary = 'manual-post-render'; }, (row: any) => { row.rendererPostCalls = 2; },
    (row: any) => { row.nativeStepSequence = 0; }, (row: any) => { row.loopFrame = 0; },
  ]) { const invalid = sample(); change(invalid.after.frames[1]); assert.equal(assessRenderFrames(request, invalid).status, 'insufficient_evidence'); }
});
test('constant values, missing draws, manual events and invalid windows cannot become valid measurements', () => {
  const changes = [
    (value: any) => { value.after.sequence = value.before.sequence; }, (value: any) => { value.after.now = value.before.now; },
    (value: any) => { value.after.frames[1].sequence++; }, (value: any) => { value.after.frames[1].time = value.after.frames[0].time - 1; },
    (value: any) => { value.after.frames[0].draws = 0; }, (value: any) => { value.after.nativePipeline = false; },
    (value: any) => { value.after.renderer = null; }, (value: any) => { value.after.activeScenes = []; },
    (value: any) => { value.after.surface.width = 0; }, (value: any) => { value.after.visible = false; },
    (value: any) => { value.after.paused = true; }, (value: any) => { value.after.gameId = 'other'; },
    (value: any) => { value.after.issues = ['observer_changed']; }, (value: any) => { value.request.candidate.version = 'other'; },
    (value: any) => { value.request.planBindingSha256 = 'd'.repeat(64); }, (value: any) => { value.request.windowId = 'other'; },
  ];
  for (const change of changes) { const value = sample(); change(value); const result = assessRenderFrames(request, value);
    assert.equal(result.status, 'insufficient_evidence'); assert.equal(result.averageRenderFps, null); assert.equal(result.performancePolicy, 'not_executed'); }
});
test('source sampling duration, paths and bindings are bounded and never model script fields', () => {
  for (const changed of [{ durationMs: 0 }, { durationMs: 100000 }, { modulePath: 'https://other/frame.js' }, { observerSha256: 'unknown' }, { script: 'fps=60' }]) {
    assert.ok(validateRenderFrameRequest({ ...request, ...changed }).length);
  }
});
test('a low valid rendered-frame measurement remains a sample with no benchmark or repair verdict', () => {
  const value = sample(); value.after.sequence = 14; value.after.frames = value.after.frames.slice(0, 4).map((row: any, index: number) => ({ ...row, time: 600 + index * 500 }));
  const result = assessRenderFrames(request, value); assert.equal(result.status, 'measured'); assert.equal(result.averageRenderFps, 2);
  assert.equal(result.performancePolicy, 'not_executed'); assert.equal(Object.hasOwn(result, 'classification'), false);
});
