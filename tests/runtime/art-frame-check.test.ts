import assert from 'node:assert/strict';
import test from 'node:test';
import { checkArtFrames, artPatternIndex } from '../../src/runtime/art-frame-check.ts';
import { fitArtFrame } from '../../src/runtime/art-layer-fit.ts';
import type { BrowserScenario } from '../../src/roles/requirements.ts';
import type { DesignDocument } from '../../src/runtime/entrypoint-media.ts';

const pattern = { kind: 'pixel-pattern' as const, x: 17, y: 29, width: 30, height: 32, rows: ['+'], color: '#268ad2', tolerance: 0 };
const step = { kind: 'assert' as const, id: 'blue', expected: true, acceptanceId: 'scene', observation: pattern, timeoutMs: 1000 };
const scenario: BrowserScenario = { viewport: { width: 160, height: 120 }, steps: [step, { ...step, id: 'again' },
  { ...step, id: 'red', observation: { ...pattern, color: '#aa0000' } }], reopen: {
  steps: [{ ...step, expected: false }], checkpoint: { expected: 'saved', snapshot: { kind: 'text', selector: '#saved' }, savedSnapshot: { kind: 'text', selector: '#saved' } } } };
const character = { id: 'target', width: 16, height: 16, anchor: { x: 0, y: 0 },
  layers: [{ id: 'body', shape: 'rect', x: 0, y: 0, width: 16, height: 16, fill: pattern.color, stroke: pattern.color, strokeWidth: 0 }],
  states: [{ name: 'idle', fps: 1, loop: true, frames: [{}, { body: { opacity: 0 } }] }] };
const media = { formatVersion: 'batched-media/1', batches: [{ characters: [character], audio: [] }] };
const design: DesignDocument = { summary: 'Scene', implementationNotes: [], acceptanceMapping: {},
  characters: [{ id: 'target', purpose: 'Target', states: ['idle'] }, { id: 'later', purpose: 'Later', states: ['idle'] }], audio: [] };
const frame = { characterId: 'target', state: 'idle', stepId: 'blue', stage: 'main' as const };

test('compact approved pattern index preserves stage, position, mask, expected and repeat counts', () => {
  const page = artPatternIndex(scenario);
  assert.equal(page.patterns.length, 3);
  assert.deepEqual(page.patterns[0], { stage: 'main', stepId: 'blue', count: 2, expected: true, ...pattern });
  assert.equal(page.patterns[2].stage, 'reopen');
  assert.equal(page.patterns[2].expected, false);
});

test('Edge checks real frames, explicit background, false expectation and per-item errors in one read-only batch', async () => {
  const { results } = await checkArtFrames(scenario, design, media, [frame, { ...frame, stepId: 'red' },
    { ...frame, frame: 1, background: { characterId: 'target', state: 'idle' } },
    { ...frame, stage: 'reopen' }, { ...frame, characterId: 'later' }, { ...frame, stepId: 'missing' }, { ...frame, frame: 2 }]);
  assert.deepEqual(results.map(row => row.passed), [true, false, true, false, false, false, false]);
  assert.deepEqual(results[1].failedCells, [[0, 0, 0, 960]]);
  assert.equal(results[3].matched, true);
  assert.match(results[4].error!, /later/);
  assert.match(results[5].error!, /missing/);
  assert.match(results[6].error!, /frame/i);
  await assert.rejects(checkArtFrames(scenario, design, media, [{ ...frame, url: 'file:///etc' }]), /field/i);
  await assert.rejects(checkArtFrames(scenario, design, { ...media, script: 'alert(1)' }, [frame]), /batch/i);
});

test('an empty scene measures the viewport background at the approved ROI, leaving the foreground absent', async () => {
  const background = { characterId: 'target', state: 'idle' };
  // The ROI lies outside the top-left quarter of the viewport. Scaling this layer to the ROI would put blue pixels inside it.
  const smallLayer = { ...character.layers[0], width: 8, height: 8 };
  const draft = { characters: [{ ...character, layers: [smallLayer] }], audio: [] };
  const location = { ...pattern, x: 95, y: 68, rows: ['-'] };
  const scene = { ...scenario, steps: [{ ...step, observation: location }] };
  const empty = { stepId: 'blue', stage: 'main', background };
  const { results } = await checkArtFrames(scene, design, draft, [empty, { ...empty, ...background },
    { ...empty, characterId: null, state: null, frame: null }]);
  assert.deepEqual(results.map(row => row.passed), [true, false, true]);
  assert.deepEqual(results[1].failedCells, [[0, 0, 225, 960]]);
  assert.deepEqual(results[1].failedCellSigns, ['-']);
  for (const invalid of [{ stepId: 'blue' }, { ...empty, characterId: 'target' }, { ...empty, state: 'idle' }, { ...empty, frame: 1 },
    { ...empty, background: {} }]) await assert.rejects(checkArtFrames(scene, design, draft, [invalid]));
  await assert.rejects(fitArtFrame(scene, [], empty), /foreground/i);
});
