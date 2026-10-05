import type { Page } from '@playwright/test';
import { isDeepStrictEqual } from 'node:util';
import type { ArtifactReference } from '../contracts/types.ts';

export const RENDER_OBSERVER_MODULE = '/assets/cosmos-render-observer.js';
export interface RenderFrameRequest {
  formatVersion: 'render-frame-request/1'; candidate: ArtifactReference; observer: ArtifactReference; observerSha256: string;
  requirement: ArtifactReference; design: ArtifactReference; media: ArtifactReference; manifestSha256: string; planBindingSha256: string;
  runId: string; taskId: string; attemptId: string; specVersion: string; windowId: string | null; deadlineAt: number;
  durationMs: 2000; modulePath: typeof RENDER_OBSERVER_MODULE;
  machine: { frozen: false; platform: string; cpu: string | null; gpu: null; osRelease?: string; memoryBytes?: number };
  collection: { kind: 'normal'; reportId: string } | { kind: 'persistent-segment'; seriesBindingSha256: string; segmentId: string };
}
export interface RenderFrameSnapshot {
  formatVersion: 'phaser-render-observer/1'; engineVersion: '3.90.0'; gameId: string; renderer: 'canvas' | 'webgl' | null;
  nativePipeline: boolean; activeScenes: string[]; visible: boolean; paused: boolean; issues: string[]; sequence: number; now: number;
  activityEpoch?: number;
  surface: { width: number; height: number; cssWidth: number; cssHeight: number; dpr: number };
  frames: { sequence: number; time: number; draws: number; boundary: 'native-post-render'; rendererPostCalls: 1; sceneRenders: number; nativeStepSequence: number; loopFrame: number }[];
}
export interface RenderFrameSample {
  request: RenderFrameRequest; startedAt: string; endedAt: string; before: RenderFrameSnapshot | null; after: RenderFrameSnapshot | null;
  viewport: { width: number; height: number }; browser: { channel: string; version: string | null; headless: boolean };
  recording: { kind: 'context-video' | 'persistent-screencast'; enabled: true }; error?: string;
}
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' && value.length > 0;
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integer = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const fixed = (value: unknown) => object(value) && ['artifactId', 'version', 'location'].every(key => text(value[key]))
  && !/^(latest|current|head|main|master|dev)$/i.test(value.version);
export function validateRenderFrameRequest(value: unknown): string[] {
  if (!object(value)) return ['Missing source render-frame request.'];
  const keys = ['formatVersion', 'candidate', 'observer', 'observerSha256', 'requirement', 'design', 'media', 'manifestSha256', 'planBindingSha256',
    'runId', 'taskId', 'attemptId', 'specVersion', 'windowId', 'deadlineAt', 'durationMs', 'modulePath', 'machine', 'collection'];
  if (Object.keys(value).some(key => !keys.includes(key)) || value.formatVersion !== 'render-frame-request/1'
    || ['candidate', 'observer', 'requirement', 'design', 'media'].some(key => !fixed(value[key]))
    || ['observerSha256', 'manifestSha256', 'planBindingSha256'].some(key => !hash(value[key]))
    || ['runId', 'taskId', 'attemptId', 'specVersion'].some(key => !text(value[key]))
    || value.windowId !== null && !text(value.windowId) || !integer(value.deadlineAt) || value.durationMs !== 2000 || value.modulePath !== RENDER_OBSERVER_MODULE
    || !object(value.machine) || value.machine.frozen !== false || !text(value.machine.platform) || value.machine.gpu !== null
    || value.machine.cpu !== null && !text(value.machine.cpu) || !object(value.collection)
    || !(value.collection.kind === 'normal' && text(value.collection.reportId)
      || value.collection.kind === 'persistent-segment' && hash(value.collection.seriesBindingSha256) && text(value.collection.segmentId))) return ['Invalid fixed render-frame request.'];
  return [];
}

/** Shape/arithmetic only. The host authenticates current module/candidate/raw bytes before using it. */
export function assessRenderFrames(request: RenderFrameRequest, sample: unknown) {
  const gaps = ['machine_not_frozen', 'ordinary_workload_not_frozen', 'endless_stress_workload_not_frozen', 'benchmark_duration_not_frozen', 'recording_overhead_present', 'full_performance_policy_not_executed'];
  const invalid = (reason: string) => ({ status: 'insufficient_evidence' as const, averageRenderFps: null, renderedFrames: null, elapsedMs: null,
    resolutionMatchesViewport: false, performancePolicy: 'not_executed' as const, gaps, reason });
  if (validateRenderFrameRequest(request).length || !object(sample) || !isDeepStrictEqual(sample.request, request) || sample.error) return invalid('Missing or changed render collection binding.');
  const before = sample.before, after = sample.after;
  for (const point of [before, after]) if (!object(point) || point.formatVersion !== 'phaser-render-observer/1' || point.engineVersion !== '3.90.0'
    || !text(point.gameId) || !['canvas', 'webgl'].includes(point.renderer) || point.nativePipeline !== true
    || !Array.isArray(point.activeScenes) || !point.activeScenes.length || !point.activeScenes.every(text)
    || point.visible !== true || point.paused !== false || !Array.isArray(point.issues) || point.issues.length || !integer(point.sequence)
    || typeof point.now !== 'number' || !Number.isFinite(point.now) || point.now < 0 || !object(point.surface)
    || !Object.values(point.surface).every(positive)) return invalid('Native renderer, visible active scene, surface or clock is unproven.');
  if (before.gameId !== after.gameId || before.renderer !== after.renderer || before.activityEpoch !== after.activityEpoch || !isDeepStrictEqual(before.surface, after.surface)
    || !isDeepStrictEqual(before.activeScenes, after.activeScenes)) return invalid('Game, renderer, scene or canvas changed within the sample.');
  const elapsedMs = after.now - before.now, count = after.sequence - before.sequence;
  const startedAt = Date.parse(sample.startedAt), endedAt = Date.parse(sample.endedAt);
  if (!positive(elapsedMs) || elapsedMs < request.durationMs || elapsedMs > request.durationMs + 1500 || !integer(count) || count < 2
    || !Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt || endedAt > request.deadlineAt
    || !object(sample.viewport) || !positive(sample.viewport.width) || !positive(sample.viewport.height)
    || !object(sample.browser) || !text(sample.browser.version) || typeof sample.browser.headless !== 'boolean'
    || !object(sample.recording) || sample.recording.enabled !== true || !['context-video', 'persistent-screencast'].includes(sample.recording.kind)
    || !Array.isArray(after.frames)) return invalid('Frame window, browser, recording or original deadline is incomplete.');
  const rows = after.frames.filter((row: any) => object(row) && row.sequence > before.sequence);
  if (rows.length !== count) return invalid('Rendered-frame history is missing or overflows its bounded window.');
  let prior = before.now, priorStep = -1, priorLoop = -1;
  for (const [index, row] of rows.entries()) {
    if (row.sequence !== before.sequence + index + 1 || !integer(row.draws) || row.draws < 1 || !positive(row.time)
      || row.time <= prior || row.time > after.now || row.boundary !== 'native-post-render' || row.rendererPostCalls !== 1
      || !integer(row.sceneRenders) || row.sceneRenders < 1 || !integer(row.nativeStepSequence) || row.nativeStepSequence <= priorStep
      || !integer(row.loopFrame) || row.loopFrame <= priorLoop) return invalid('Rendered-frame sequence, actual draw/post-render boundary or monotonic time is missing/backwards.');
    prior = row.time; priorStep = row.nativeStepSequence; priorLoop = row.loopFrame;
  }
  return { status: 'measured' as const, averageRenderFps: count / elapsedMs * 1000, renderedFrames: count, elapsedMs,
    resolutionMatchesViewport: after.surface.width === sample.viewport.width && after.surface.height === sample.viewport.height,
    performancePolicy: 'not_executed' as const, gaps, reason: 'Actual rendered frames in this candidate/document/window; benchmark conditions remain unfrozen.' };
}

/** Imports the fixed compiled module, never author debug counters or a model-supplied script. */
export async function collectRenderFrames(page: Page, request: RenderFrameRequest,
  context: Pick<RenderFrameSample, 'viewport' | 'browser' | 'recording'>): Promise<RenderFrameSample> {
  const startedAt = new Date().toISOString();
  if (validateRenderFrameRequest(request).length || Date.now() + request.durationMs + 1000 >= request.deadlineAt) throw new Error('Render sampling has insufficient original deadline or invalid binding.');
  try {
    const observed = await page.evaluate(async ({ path, duration }) => {
      const observer = await import(new URL(path, location.origin).href);
      if (typeof observer.readRenderSnapshot !== 'function') throw new Error('The fixed observer module is unavailable.');
      const before = observer.readRenderSnapshot();
      await new Promise(done => setTimeout(done, duration));
      return { before, after: observer.readRenderSnapshot() };
    }, { path: request.modulePath, duration: request.durationMs });
    return { request: structuredClone(request), startedAt, endedAt: new Date().toISOString(), ...observed, ...context };
  } catch (error) { return { request: structuredClone(request), startedAt, endedAt: new Date().toISOString(), before: null, after: null, ...context,
    error: error instanceof Error ? error.message : 'The current render observer is unavailable.' }; }
}
