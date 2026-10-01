import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderCharacter, animationFrame } from '../../src/media/vector.ts';

function fixture(): any {
  return {
    id: 'probe', width: 128, height: 128, anchor: { x: 64, y: 112 },
    layers: [{ id: 'body', shape: 'rect', x: 40, y: 40, width: 48, height: 60, fill: '#24bfae', stroke: '#192837', strokeWidth: 3, radius: 8 }],
    states: [
      { name: 'idle', fps: 4, loop: true, frames: [{}, { body: { dy: -2 } }] },
      { name: 'attack', fps: 8, loop: false, frames: [{ body: { rotation: -10 } }, { body: { dx: 10, rotation: 15 } }] },
      { name: 'death', fps: 6, loop: false, frames: [{}, { body: { dy: 16, scaleY: 0.2, opacity: 0.3 } }] },
    ],
  };
}

test('renders ordered transparent SVG frames with a shared pixel anchor and state metadata', () => {
  const result = renderCharacter(fixture());
  assert.deepEqual(result.manifest.anchor, { x: 64, y: 112 });
  assert.deepEqual(result.manifest.origin, { x: 0.5, y: 0.875 });
  assert.equal(result.manifest.width, 128);
  assert.equal(result.manifest.height, 128);
  assert.equal(result.files.length, 6);
  assert.deepEqual(result.manifest.states[0], { name: 'idle', fps: 4, loop: true, frames: ['idle-000.svg', 'idle-001.svg'] });
  assert.match(result.files[0].svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="128" height="128" viewBox="0 0 128 128">/);
  assert.doesNotMatch(result.files[0].svg, /<image|<script|<style|background|<foreignObject/);
  assert.notEqual(result.files[0].svg, result.files[1].svg);
  assert.deepEqual(renderCharacter(fixture()), result);
});

test('rejects untrusted markup, extra fields and path-like names before producing SVG', () => {
  const mutations = [
    (s: any) => { s.layers[0].fill = 'url(https://example.invalid/x)'; },
    (s: any) => { s.layers[0].shape = 'script'; },
    (s: any) => { s.layers[0].onclick = 'alert(1)'; },
    (s: any) => { s.states[0].name = '../escape'; },
    (s: any) => { s.states[0].frames[0] = { absent: { dx: 1 } }; },
    (s: any) => { s.states[0].frames[0] = { body: { transform: '<script/>' } }; },
    (s: any) => { s.layers.push({ ...s.layers[0] }); },
    (s: any) => { s.states.push({ ...s.states[0] }); },
  ];
  for (const mutate of mutations) {
    const spec = fixture(); mutate(spec);
    assert.throws(() => renderCharacter(spec), /Invalid media spec/);
  }
});

test('rejects non-finite or oversized geometry, animation and allocations', () => {
  const mutations = [
    (s: any) => { s.width = Infinity; },
    (s: any) => { s.height = 4096; },
    (s: any) => { s.width = 64.5; },
    (s: any) => { s.anchor.x = NaN; },
    (s: any) => { s.anchor.y = 129; },
    (s: any) => { s.layers[0].width = -1; },
    (s: any) => { s.layers[0].x = 1e10; },
    (s: any) => { s.layers[0].strokeWidth = 50; },
    (s: any) => { s.states[0].fps = 0; },
    (s: any) => { s.states[0].frames = []; },
    (s: any) => { s.states[0].frames = Array(65).fill({}); },
    (s: any) => { s.layers = Array(65).fill(s.layers[0]); },
    (s: any) => { s.states[0].frames[0] = { body: { dx: NaN } }; },
    (s: any) => { s.states[0].frames[0] = { body: { scaleX: 100 } }; },
    (s: any) => { s.states[0].loop = 'yes'; },
    (s: any) => { s.states = Array.from({ length: 5 }, (_, i) => ({ ...s.states[0], name: `state-${i}`, frames: Array(64).fill({}) })); },
    (s: any) => { s.states = Array(3); },
    (s: any) => { s.layers = Array(2); },
    (s: any) => { s.states[0].frames = Array(2); },
  ];
  for (const mutate of mutations) {
    const spec = fixture(); mutate(spec);
    assert.throws(() => renderCharacter(spec), /Invalid media spec/);
  }
});

test('animation timing wraps idle, holds a final non-loop frame and resets on a new state', () => {
  const { states } = renderCharacter(fixture()).manifest;
  assert.equal(animationFrame(states[0], 0), 'idle-000.svg');
  assert.equal(animationFrame(states[0], 250), 'idle-001.svg');
  assert.equal(animationFrame(states[0], 500), 'idle-000.svg');
  assert.equal(animationFrame(states[1], 1000), 'attack-001.svg');
  assert.equal(animationFrame(states[2], 1000), 'death-001.svg');
  assert.equal(animationFrame(states[1], 0), 'attack-000.svg');
  for (const time of [-1, NaN, Infinity]) assert.throws(() => animationFrame(states[0], time), /Invalid media spec/);
});
