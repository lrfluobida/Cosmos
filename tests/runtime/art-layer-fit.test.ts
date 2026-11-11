import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCharacter } from '../../src/media/vector.ts';
import type { BrowserScenario } from '../../src/roles/requirements.ts';
import { fitArtFrame, replayLayerFit } from '../../src/runtime/art-layer-fit.ts';

const character = validateCharacter({ id: 'marker', width: 16, height: 16, anchor: { x: 0, y: 0 },
  layers: [{ id: 'bar', shape: 'rect', x: 6.2, y: 0, width: 6, height: 16, fill: '#337799', stroke: '#337799', strokeWidth: 0 }],
  states: [{ name: 'shown', fps: 1, loop: false, frames: [{}] }] });
const scenario: BrowserScenario = { viewport: { width: 160, height: 120 }, steps: [{ id: 'marker-mask', kind: 'assert',
  expected: true, acceptanceId: 'show-marker', observation: { kind: 'pixel-pattern', x: 18, y: 13, width: 16, height: 16,
    color: '#337799', tolerance: 0, rows: ['-+'] }, timeoutMs: 1000 }] };
const mapping = { stepId: 'marker-mask', characterId: 'marker', state: 'shown' };
const inputSha256 = 'a'.repeat(64);
const sample = { inputSha256, mapping, changes: [{ layerId: 'bar', x: 1 }] };

test('Edge fits a fractional native position to negative and positive cells, then replay matches on the first render', async () => {
  const result = await fitArtFrame(scenario, [character], mapping);
  assert.deepEqual(result.before, { failedCells: [[0, 0, 16, 128]], deficit: 4, movement: 0 });
  assert.deepEqual(result.after, { failedCells: [], deficit: 0, movement: 1 });
  assert.deepEqual(result.changes, sample.changes);
  assert.ok(result.measurements <= 49);
  const revised = replayLayerFit(scenario, [character], { ...sample, changes: result.changes }, inputSha256);
  assert.equal(revised.character.layers[0].x, 7.2);
  const matched = await fitArtFrame(scenario, [revised.character], mapping);
  assert.equal(matched.measurements, 1);
  assert.deepEqual(matched.changes, []);
  assert.equal(character.layers[0].x, 6.2);
});

test('an unreachable color leaves the original geometry after a bounded unsuccessful search', async () => {
  const absent = { ...character, layers: [{ ...character.layers[0], fill: '#000000' }] };
  const result = await fitArtFrame(scenario, [absent], mapping);
  assert.deepEqual(result.after, result.before);
  assert.equal(result.after.deficit, 45);
  assert.deepEqual(result.changes, []);
  assert.ok(result.measurements <= 49);
});

test('replay rejects unbound geometry, missing inputs and edits affecting other animation frames', () => {
  const replay = (patch: object) => replayLayerFit(scenario, [character], { ...sample, ...patch }, inputSha256);
  for (const change of [{ layerId: 'bar', y: 4 }, { layerId: 'bar', width: 0.5 }, { layerId: 'bar', x: 0 },
    { layerId: 'bar', fill: '#fff' }, { layerId: 'bar' }, { layerId: 'absent', y: 1 }]) {
    assert.throws(() => replay({ changes: [change] }));
  }
  for (const patch of [{ changes: [] }, { changes: Array(9).fill(sample.changes[0]) },
    { changes: [...sample.changes, ...sample.changes] }, { inputSha256: 'b'.repeat(64) }, { approved: true },
    { mapping: { ...mapping, stepId: 'absent' } }, { mapping: { ...mapping, state: 'absent' } },
    { mapping: { ...mapping, background: { characterId: 'absent', state: 'shown' } } }]) assert.throws(() => replay(patch));
  const multi = { ...character, states: [{ ...character.states[0], frames: [{}, {}] }] };
  assert.throws(() => replayLayerFit(scenario, [multi], sample, inputSha256), /single-frame/);
  const thin = { ...character, layers: [{ ...character.layers[0], width: 1 }] };
  assert.throws(() => replayLayerFit(scenario, [thin], { ...sample, changes: [{ layerId: 'bar', width: -2 }] }, inputSha256), /bounds/);
});
