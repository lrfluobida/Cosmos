import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as media from '../../src/runtime/entrypoint-media.ts';
const design = { summary: '原创收集游戏', implementationNotes: ['点击星星增加得分'], acceptanceMapping: { win: '点击星星后显示胜利' },
  characters: [{ id: 'star', purpose: '可点击的目标', states: ['idle'] }], audio: [{ id: 'bell', trigger: '点击成功', loop: false }] };
const specification = { characters: [{ id: 'star', width: 32, height: 32, anchor: { x: 16, y: 16 },
  layers: [{ id: 'body', shape: 'ellipse', x: 2, y: 2, width: 28, height: 28, fill: '#ffee22', stroke: '#222222', strokeWidth: 1 }],
  states: [{ name: 'idle', fps: 1, loop: true, frames: [{}] }] }],
  audio: [{ id: 'bell', sampleRate: 22050, duration: 0.1, loop: false, notes: [{ midi: 72, start: 0, duration: 0.1, gain: 0.2, wave: 'sine', attack: 0.01, release: 0.01 }] }] };
test('generic art adapter renders real SVG and WAV from the exact dynamic design roster', async t => {
  assert.equal(typeof media.renderDeclaredMedia, 'function', 'A separate art adapter is required');
  const root = await mkdtemp(join(tmpdir(), 'cosmos-entry-media-')); t.after(() => rm(root, { recursive: true, force: true }));
  media.validateDesign(design, ['win']);
  const result = await media.renderDeclaredMedia(root, 'rendered', specification, design, new AbortController().signal);
  assert.equal(result.media.characters[0].manifest.id, 'star'); assert.equal(result.media.audio[0].manifest.id, 'bell');
  assert.match(await readFile(join(root, 'rendered/public/assets/star/idle-000.svg'), 'utf8'), /<svg /);
  assert.equal((await readFile(join(root, 'rendered/public/assets/audio/bell.wav'))).subarray(0, 4).toString(), 'RIFF');
  assert.ok(result.media.audio[0].manifest.peak > 0.001);
});
test('art cannot omit a design-declared character, action or audio clip', () => {
  assert.equal(typeof media.validateDeclaredMedia, 'function');
  for (const changed of [{ ...specification, audio: [] }, { ...specification, characters: [] },
    { ...specification, characters: [{ ...specification.characters[0], states: [{ ...specification.characters[0].states[0], name: 'wrong' }] }] }]) {
    assert.throws(() => media.validateDeclaredMedia(changed, design), /design|state|roster/i);
  }
});

test('runtime media checks bind dynamic IDs and actual manifest states without removing gameplay input', () => {
  assert.equal(typeof media.withMediaObservations, 'function', 'Final candidate needs runtime media observation');
  const original = { formatVersion: '1.0.0', projectId: 'game', taskId: 'coding', runId: 'game', reportId: 'report', specVersion: '1', artifact: { artifactId: 'game', version: 'v1', location: 'game/v1' }, url: 'http://127.0.0.1:1234', viewport: { width: 1280, height: 720 }, acceptanceIds: ['win'],
    steps: [{ id: 'click', kind: 'locator-click', selector: '#star', timeoutMs: 1000 }, { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] };
  const result = media.withMediaObservations(original, { characters: [{ directory: 'public/assets/star-id', manifest: { id: 'star-id', states: [{ name: 'idle', frames: ['idle-000.svg'] }] } }], audio: [{ directory: 'public/assets/audio', manifest: { id: 'bell-id' } }] });
  assert.deepEqual(result.plan.steps.slice(0, original.steps.length), original.steps);
  assert.ok(result.plan.steps.some((step: any) => step.expected === 'star-id'));
  assert.ok(result.plan.steps.some((step: any) => step.observation?.path?.join('.') === 'media.audio.0.started'));
  assert.equal(result.checks.filter((check: any) => check.kind === 'audio_started').length, 1);
});

function batches() {
  const characters = Array.from({ length: 17 }, (_, index) => ({ ...structuredClone(specification.characters[0]), id: `actor-${index}` }));
  const audio = Array.from({ length: 17 }, (_, index) => ({ ...structuredClone(specification.audio[0]), id: `sound-${index}` }));
  return { declared: { ...structuredClone(design), characters: characters.map(item => ({ id: item.id, purpose: '目标', states: ['idle'] })),
    audio: audio.map(item => ({ id: item.id, trigger: '点击成功', loop: item.loop })) },
    envelope: { formatVersion: 'batched-media/1', batches: [{ characters: characters.slice(0, 16), audio: audio.slice(0, 16) }, { characters: characters.slice(16), audio: audio.slice(16) }] } };
}
test('bounded batches render one complete roster and retain the original envelope for review and recovery', async t => {
  const { declared, envelope } = batches(); media.validateDesign(declared, ['win']);
  const root = await mkdtemp(join(tmpdir(), 'cos64-batches-')); t.after(() => rm(root, { recursive: true, force: true }));
  const result = await media.renderDeclaredMedia(root, 'rendered', envelope, declared, new AbortController().signal);
  assert.deepEqual(result.media.characters.map(item => item.manifest.id), declared.characters.map(item => item.id));
  assert.deepEqual(result.media.audio.map(item => item.manifest.id), declared.audio.map(item => item.id));
  assert.ok(result.files.includes('public/assets/actor-16/idle-000.svg')); assert.ok(result.files.includes('public/assets/audio/sound-16.wav'));
  assert.deepEqual(JSON.parse(await readFile(join(root, 'rendered/_cosmos/mediaSpec.json'), 'utf8')), envelope);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'rendered/public/assets/manifest.json'), 'utf8')), result.media);
});
test('batch union rejects duplicates, missing/extra IDs, state/loop changes and all batch/capacity overflow', async t => {
  const { declared, envelope } = batches();
  const mutations = [
    (v: any) => { v.batches[1].characters[0].id = 'actor-0'; }, (v: any) => { v.batches[1].characters = []; },
    (v: any) => { v.batches[1].characters[0].id = 'extra'; }, (v: any) => { v.batches[1].characters[0].states[0].name = 'wrong'; },
    (v: any) => { v.batches[1].audio[0].loop = true; }, (v: any) => { v.batches[1].audio[0].id = 'sound-0'; },
    (v: any) => { v.batches[0].characters.push(v.batches[1].characters[0]); },
    (v: any) => { v.batches[0].audio.push(v.batches[1].audio[0]); }, (v: any) => { v.batches = Array(9).fill(v.batches[1]); },
    (v: any) => { v.batches.push({ characters: [], audio: [] }); }, (v: any) => { v.formatVersion = 'unknown'; },
  ];
  for (const mutate of mutations) { const changed = structuredClone(envelope); mutate(changed); assert.throws(() => media.validateDeclaredMedia(changed, declared)); }
  assert.throws(() => media.validateDeclaredMedia({ characters: envelope.batches.flatMap(b => b.characters), audio: envelope.batches.flatMap(b => b.audio) }, declared), /batch|bounded/);
  assert.throws(() => media.validateDesign({ ...declared, characters: Array.from({ length: 129 }, (_, i) => ({ ...declared.characters[0], id: `a-${i}` })) }, ['win']));
  assert.throws(() => media.validateDesign({ ...declared, audio: Array.from({ length: 65 }, (_, i) => ({ ...declared.audio[0], id: `a-${i}` })) }, ['win']));
  const maximum = { ...declared, characters: Array.from({ length: 128 }, (_, i) => ({ ...declared.characters[0], id: `a-${i}` })),
    audio: Array.from({ length: 64 }, (_, i) => ({ ...declared.audio[0], id: `b-${i}` })) };
  media.validateDesign(maximum, ['win']);
  const root = await mkdtemp(join(tmpdir(), 'cos64-rejected-')); t.after(() => rm(root, { recursive: true, force: true }));
  const invalid = structuredClone(envelope); invalid.batches[1].audio[0].loop = true;
  await assert.rejects(media.renderDeclaredMedia(root, 'partial', invalid, declared, new AbortController().signal));
  await assert.rejects(readFile(join(root, 'partial/public/assets/manifest.json')), /ENOENT/);
});
test('the complete media union rejects an ID shared by a character and audio before rendering', () => {
  const shared = { ...structuredClone(design), audio: [{ ...design.audio[0], id: 'star' }] };
  const art = { ...structuredClone(specification), audio: [{ ...specification.audio[0], id: 'star' }] };
  assert.throws(() => media.validateDesign(shared, ['win']), /Duplicate/);
  assert.throws(() => media.validateDeclaredMedia({ formatVersion: 'batched-media/1', batches: [art] }, shared), /Duplicate/);
});
