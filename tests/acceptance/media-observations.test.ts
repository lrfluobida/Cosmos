import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import * as browser from '../../src/acceptance/browser.ts';
import * as media from '../../src/runtime/entrypoint-media.ts';

const manifest: any = { characters: [{ directory: 'public/assets/marker', manifest: { id: 'marker', states: [
  { name: 'idle', frames: ['idle.svg'] }, { name: 'active', frames: ['active.svg'] }] } }],
  audio: [{ directory: 'public/assets/audio', manifest: { id: 'bell' } }] };
const binding: any = { media: { artifactId: 'media', version: 'v1', location: 'registry/media/v1' }, manifestSha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
  candidate: { artifactId: 'game', version: 'v1', location: 'registry/game/v1' }, sourceVersion: 'b'.repeat(40),
  planBindingSha256: 'c'.repeat(64), scope: { requirement: { artifactId: 'requirement', version: 'v1', location: 'req' },
    design: { artifactId: 'design', version: 'v1', location: 'design' }, plan: { artifactId: 'plan', version: 'v1', location: 'plan' },
    designSha256: 'd'.repeat(64), mapVersion: 'map', acceptanceIds: ['T16-01', 'T16-06'] } };
function api(): any {
  assert.equal(typeof (media as any).mediaObservationDefinitions, 'function', 'COS40 shared media definitions are missing');
  assert.equal(typeof (media as any).assessMediaCoverage, 'function', 'COS40 real sample coverage is missing');
  return media;
}
function samples(definitions: any[]) {
  const request = { formatVersion: 'readonly-media/1', ...binding, fields: definitions.map(({ id, path }) => ({ id, path })) };
  const values = definitions.map(item => item.kind === 'state_seen' ? item.state === 'idle' : item.kind === 'audio_started' ? false : item.expected);
  const sample = { request, recordedAt: new Date().toISOString(), values };
  return { request, sample };
}
test('COS40 shared definitions retain every manifest field and default appended observation order', () => {
  const a = api(), definitions = a.mediaObservationDefinitions(manifest);
  assert.deepEqual(definitions.map((item: any) => item.kind), ['character_id', 'loaded_frames', 'state_name', 'state_seen', 'state_name', 'state_seen', 'audio_id', 'audio_decoded', 'audio_started']);
  const large = { characters: Array.from({ length: 16 }, (_, index) => ({ directory: 'assets/' + index,
    manifest: { id: 'c' + index, states: Array.from({ length: 16 }, (_, state) => ({ name: 's' + state, frames: ['f.svg'] })) } })), audio: [] };
  assert.equal(a.mediaObservationDefinitions(large).length, 544, 'Do not shrink media to fit mouse-plan steps');
});
test('COS40 batch scalar observation reads one actual immutable snapshot without invoking nested getters', async () => {
  const read: any = (browser as any).observeDebugScalars;
  assert.equal(typeof read, 'function', 'COS40 batch read-only observation is missing');
  let snapshots = 0; const target: any = {};
  Object.defineProperty(target, 'cosmosDebug', { configurable: false, get: () => { snapshots++; return Object.freeze({ media: Object.freeze({ loaded: 2, seen: false, started: true }) }); } });
  const page: any = { evaluate: async (fn: any, paths: any) => {
    const previous = (globalThis as any).window; (globalThis as any).window = target;
    try { return fn(paths); } finally { (globalThis as any).window = previous; }
  } };
  assert.deepEqual(await read(page, [['media', 'loaded'], ['media', 'seen'], ['media', 'started']]), [2, false, true]);
  assert.equal(snapshots, 1);
  await assert.rejects(read(page, [['media', 'missing']]));
  const bad: any = {}; Object.defineProperty(bad, 'cosmosDebug', { configurable: false, value: { media: { get changed() { throw new Error('must not invoke'); } } } });
  const other: any = { evaluate: async (fn: any, paths: any) => { (globalThis as any).window = bad; try { return fn(paths); } finally { delete (globalThis as any).window; } } };
  await assert.rejects(read(other, [['media', 'changed']]), /data properties/);
});
test('COS40 coverage unions actual document witnesses without summing frames or writing samples', () => {
  const a = api(), definitions = a.mediaObservationDefinitions(manifest), { request, sample } = samples(definitions);
  const second = structuredClone(sample); second.values[3] = false; second.values[5] = true; second.values[8] = true;
  const rows = [{ segmentId: 'first', reportPath: 'first/report.json', sample }, { segmentId: 'second', reportPath: 'second/report.json', sample: second }];
  const before = structuredClone(rows), result = a.assessMediaCoverage(manifest, request, rows);
  assert.equal(result.valid, true); assert.equal(result.complete, true); assert.deepEqual(rows, before);
  assert.deepEqual(result.checks.find((item: any) => item.kind === 'state_seen' && item.state === 'active').witnesses, [{ segmentId: 'second', reportPath: 'second/report.json' }]);
  const split = structuredClone(rows); split.forEach(row => { row.sample.values[1] = 1; });
  const insufficientFrames = a.assessMediaCoverage(manifest, request, split);
  assert.equal(insufficientFrames.valid, true); assert.equal(insufficientFrames.complete, false);
  assert.equal(insufficientFrames.checks.find((item: any) => item.kind === 'loaded_frames').actual, 1);
});
test('COS40 malformed, missing and changed-bound samples cannot create coverage', () => {
  const a = api(), definitions = a.mediaObservationDefinitions(manifest), { request, sample } = samples(definitions);
  const mutations = [(value: any) => value.values.pop(), (value: any) => value.values[0] = null,
    (value: any) => value.values[1] = 3, (value: any) => value.values[3] = 'true',
    (value: any) => { value.values[7] = false; value.values[8] = true; },
    (value: any) => value.request.media.version = 'v2', (value: any) => value.request.sourceVersion = 'f'.repeat(40),
    (value: any) => value.request.fields.reverse(), (value: any) => value.recordedAt = 1];
  for (const mutate of mutations) { const changed = structuredClone(sample); mutate(changed);
    assert.equal(a.assessMediaCoverage(manifest, request, [{ segmentId: 'only', reportPath: 'only/report.json', sample: changed }]).valid, false); }
  assert.equal(a.assessMediaCoverage(manifest, request, []).valid, false);
});
test('COS40 healthy nonnull identity mismatches remain actual coverage differences with raw witnesses', () => {
  const a = api(), definitions = a.mediaObservationDefinitions(manifest), { request, sample } = samples(definitions);
  sample.values[0] = 'wrong-id'; sample.values[2] = 'wrong-state';
  const result = a.assessMediaCoverage(manifest, request, [{ segmentId: 'actual', reportPath: 'actual/report.json', sample }]);
  assert.equal(result.valid, true); assert.equal(result.complete, false);
  assert.equal(result.checks[0].actual, 'wrong-id');
  assert.deepEqual(result.checks[0].observations, [{ segmentId: 'actual', reportPath: 'actual/report.json', value: 'wrong-id' }]);
});
