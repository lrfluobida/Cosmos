import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as persistent from '../../src/acceptance/persistent.ts';
import * as media from '../../src/runtime/entrypoint-media.ts';
import { genericPersistentDraft } from './generic-persistent.fixture.ts';
import * as api from '../../src/runtime/entrypoint-persistent.ts';

const candidate = { artifactId: 'game', version: 'v1', location: 'candidate/game/v1' };
const manifest: any = { characters: [{ directory: 'assets/marker', manifest: { id: 'marker', states: [{ name: 'play', frames: ['a.svg'] }, { name: 'resume', frames: ['b.svg'] }] } }],
  audio: [{ directory: 'assets', manifest: { id: 'purchase' } }, { directory: 'assets', manifest: { id: 'continue' } }] };
export function boundSeries(): any {
  assert.equal(typeof api.createGenericPersistentSeries, 'function', 'Generic series assembly is required');
  return api.createGenericPersistentSeries({ scenario: genericPersistentDraft().scenario, projectId: 'game', taskId: 'coding', runId: 'run', specVersion: '1.0', reportId: 'series',
    url: 'http://127.0.0.1:32123', candidate, requirement: { artifactId: 'requirement', version: 'v1', location: 'capture/requirement/v1' },
    design: { artifactId: 'design', version: 'v1', location: 'capture/design/v1' }, acceptanceIds: ['save', 'resume'] });
}
test('generic series binds fixed current captures and distinct plans without transfer source/map facts', () => {
  const series = boundSeries();
  assert.equal(series.formatVersion, 'persistent-acceptance/generic-1'); assert.equal(series.sourceVersion, undefined); assert.equal(series.scope, undefined);
  assert.deepEqual(persistent.validatePersistentSeries(series), []);
  assert.deepEqual(series.segments[0].plan.acceptanceIds, ['save']); assert.deepEqual(series.segments[1].plan.acceptanceIds, ['resume']);
  assert.equal(series.bindingSha256, createHash('sha256').update(JSON.stringify({ binding: series.binding, segments: series.segments, checkpoint: series.checkpoint })).digest('hex'));
  for (const change of [
    (s: any) => { s.sourceVersion = 'a'.repeat(40); }, (s: any) => { s.scope = {}; }, (s: any) => { s.binding.candidate.version = 'v2'; },
    (s: any) => { s.binding.design.version = 'latest'; }, (s: any) => { s.binding.requirement.location = ''; },
    (s: any) => { s.segments[1].plan.steps[1].expected = 'wrong'; }, (s: any) => { s.segments[1].plan.runId = 'wrong'; },
    (s: any) => { s.segments[1].plan.url = 'http://localhost:32123'; }, (s: any) => { s.segments.push(structuredClone(s.segments[0])); },
  ]) { const changed = structuredClone(series); change(changed); assert.ok(persistent.validatePersistentSeries(changed).length); }
});

function report(series: any) {
  const startedAt = new Date(Date.now() - 100).toISOString(), endedAt = new Date().toISOString();
  return { series, deadlineAt: Date.now() + 5000, startedAt, endedAt, outcome: 'passed', errors: [],
    segments: series.segments.map((segment: any, i: number) => {
      const request: any = media.createGenericMediaObservationRequest(manifest, { media: { artifactId: 'media', version: 'v1', location: 'capture/media/v1' },
        manifestSha256: 'a'.repeat(64), plan: segment.plan, collection: { kind: 'persistent-segment', seriesBindingSha256: series.bindingSha256, segmentId: segment.id } } as any);
      const definitions = media.mediaObservationDefinitions(manifest), segmentStart = new Date(Date.parse(startedAt) + i * 50).toISOString(), segmentEnd = new Date(Date.parse(startedAt) + i * 50 + 40).toISOString();
      return { id: segment.id, report: { formatVersion: '1.0.0', kind: 'normal_browser_input', plan: segment.plan, outcome: 'passed', errors: [], startedAt: segmentStart, endedAt: segmentEnd,
        reportPath: segment.plan.reportId + '/report.json', cleanup: { processExited: true },
        steps: segment.plan.steps.map((step: any) => ({ id: step.id, kind: step.kind, acceptanceId: step.acceptanceId, outcome: 'passed', error: null,
          expected: step.expected ?? 'input delivered', actual: step.expected ?? 'input delivered' })),
        mediaObservations: { request, recordedAt: segmentEnd, values: definitions.map(field => typeof field.expected !== 'boolean' ? field.expected
          : field.kind === 'state_seen' ? field.state === (i ? 'resume' : 'play') : field.mediaId === (i ? 'continue' : 'purchase')) } } };
    }) };
}
test('two exact documents contribute actual partial samples and complete the final roster', () => {
  const series = boundSeries(), current = report(series), assess: any = (media as any).assessGenericSeriesMediaCoverage;
  assert.equal(typeof assess, 'function', 'Per-plan series coverage is required');
  const binding = { series, media: { artifactId: 'media', version: 'v1', location: 'capture/media/v1' }, manifestSha256: 'a'.repeat(64), deadlineAt: current.deadlineAt };
  const result = assess(manifest, binding, current); assert.equal(result.valid, true); assert.equal(result.complete, true);
  const seen = result.checks.find((check: any) => check.state === 'play' && check.kind === 'state_seen');
  assert.deepEqual(seen.observations.map((row: any) => row.value), [true, false]);
  assert.notEqual(current.segments[0].report.mediaObservations.request.planBindingSha256, current.segments[1].report.mediaObservations.request.planBindingSha256);
  for (const change of [
    (r: any) => { r.segments.pop(); }, (r: any) => { r.segments[1].report.mediaObservations.request = r.segments[0].report.mediaObservations.request; },
    (r: any) => { r.segments[1].report.mediaObservations.request.manifestSha256 = 'b'.repeat(64); },
    (r: any) => { r.segments[1].report.mediaObservations.request.candidate.version = 'v2'; },
    (r: any) => { r.segments[1].report.plan.runId = 'wrong'; }, (r: any) => { r.segments[1].report.steps[0].outcome = 'failed'; },
    (r: any) => { r.segments[1].report.mediaObservations.recordedAt = new Date(current.deadlineAt + 1).toISOString(); },
    (r: any) => { r.segments[1].report.mediaObservations.values[0] = null; },
    (r: any) => { r.segments[1].report.mediaObservations.values.pop(); },
  ]) { const changed = structuredClone(current); change(changed); assert.equal(assess(manifest, binding, changed).valid, false); }
  const missing = structuredClone(current); missing.segments[1].report.mediaObservations.values[5] = false;
  assert.equal(assess(manifest, binding, missing).complete, false);
});
