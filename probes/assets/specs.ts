import type { CharacterSpec, Layer, Pose } from '../../src/media/vector.ts';
import type { AudioSpec, Note } from '../../src/media/audio.ts';

// Authored specifically for this platform probe. No reference-game assets or melodies.
const ink = '#203746';
const layer = (id: string, shape: Layer['shape'], x: number, y: number, width: number, height: number, fill: string, radius = 0): Layer =>
  ({ id, shape, x, y, width, height, fill, stroke: ink, strokeWidth: 3, ...(shape === 'rect' ? { radius } : {}) });

const layers: Layer[] = [
  layer('leg-left', 'rect', 75, 142, 15, 28, '#337d82', 6),
  layer('leg-right', 'rect', 104, 142, 15, 28, '#337d82', 6),
  layer('foot-left', 'rect', 65, 163, 31, 12, '#efb366', 5),
  layer('foot-right', 'rect', 102, 163, 31, 12, '#efb366', 5),
  layer('arm-left', 'rect', 49, 88, 18, 47, '#337d82', 8),
  layer('hand-left', 'ellipse', 45, 123, 24, 23, '#efb366'),
  layer('arm-right', 'rect', 126, 87, 18, 44, '#337d82', 8),
  layer('hand-right', 'ellipse', 126, 119, 26, 25, '#efb366'),
  layer('body', 'rect', 66, 81, 62, 68, '#4fc3ad', 18),
  layer('panel', 'rect', 77, 103, 40, 33, '#e7f5dc', 10),
  layer('core', 'ellipse', 89, 111, 16, 16, '#efb366'),
  layer('antenna', 'rect', 91, 23, 9, 23, '#337d82', 4),
  layer('beacon', 'ellipse', 86, 16, 19, 18, '#efb366'),
  layer('head', 'rect', 58, 39, 76, 59, '#4fc3ad', 23),
  layer('face', 'rect', 69, 51, 54, 33, '#203746', 13),
  layer('eye-left', 'ellipse', 78, 60, 9, 12, '#e7f5dc'),
  layer('eye-right', 'ellipse', 106, 60, 9, 12, '#e7f5dc'),
  layer('spark', 'ellipse', 165, 91, 15, 15, '#ffe2a0'),
];
const headParts = ['antenna', 'beacon', 'head', 'face', 'eye-left', 'eye-right'];
function pose(parts: string[], values: Pose): Record<string, Pose> {
  return Object.fromEntries(parts.map((id) => [id, { ...values }]));
}
const rest = { spark: { opacity: 0 } };
const idle = [0, -2, -4, -2].map((dy) => ({ ...rest, ...pose(headParts, { dy }), body: { dy: dy / 2 }, panel: { dy: dy / 2 }, core: { dy: dy / 2 } }));
const attack: Record<string, Pose>[] = [
  { ...rest, ...pose(headParts, { dx: -3 }), 'arm-right': { rotation: 20, dy: -4 }, 'hand-right': { dx: -4, dy: -10 } },
  { ...rest, ...pose(headParts, { dx: -5, dy: 2 }), 'arm-right': { rotation: 45, dy: -7 }, 'hand-right': { dx: -9, dy: -20 }, core: { scaleX: 1.2, scaleY: 1.2 } },
  { ...pose(headParts, { dx: 3, dy: -2 }), 'arm-right': { rotation: -80, dx: 6, dy: -10 }, 'hand-right': { dx: 21, dy: -28 }, spark: { opacity: 1 }, core: { scaleX: 1.35, scaleY: 1.35 } },
  { ...pose(headParts, { dx: 2 }), 'arm-right': { rotation: -70, dx: 5, dy: -9 }, 'hand-right': { dx: 17, dy: -26 }, spark: { opacity: 0.4, scaleX: 0.55, scaleY: 0.55 } },
  { ...rest, 'arm-right': { rotation: -25, dy: -4 }, 'hand-right': { dx: 6, dy: -10 } },
  { ...rest },
];
const death = [0, 0.3, 0.65, 1].map((amount) => {
  const frame: Record<string, Pose> = { ...rest };
  for (const part of layers.filter((part) => part.id !== 'spark')) {
    // Collapse about the same ground anchor, without trimming the frame canvas.
    const cy = part.y + part.height / 2;
    frame[part.id] = { dy: (168 - cy) * amount * 0.76, scaleY: 1 - amount * 0.68, opacity: 1 - amount * 0.3 };
  }
  frame['eye-left'] = { ...frame['eye-left'], scaleY: 0.12 };
  frame['eye-right'] = { ...frame['eye-right'], scaleY: 0.12 };
  return frame;
});

export const character: CharacterSpec = {
  id: 'copper-scout', width: 192, height: 192, anchor: { x: 96, y: 175 }, layers,
  states: [
    { name: 'idle', fps: 6, loop: true, frames: idle },
    { name: 'attack', fps: 10, loop: false, frames: attack },
    { name: 'death', fps: 6, loop: false, frames: death },
  ],
};

const note = (midi: number, start: number, duration: number, gain = 0.12, wave: Note['wave'] = 'sine'): Note =>
  ({ midi, start, duration, gain, wave, attack: 0.008, release: Math.min(0.08, duration / 3) });

// An original eight-second motif, entered as notes here, with a quiet tail at the loop seam.
export const music: AudioSpec = {
  id: 'workshop-loop', sampleRate: 22050, duration: 8, loop: true,
  notes: [
    ...[60, 67, 64, 72, 69, 64, 67, 62, 65, 69, 72, 67, 64, 62, 67, 60]
      .map((pitch, i) => note(pitch, i * 0.5, 0.4, 0.13, 'triangle')),
    ...[48, 45, 53, 48].map((pitch, i) => note(pitch, i * 2, 1.8, 0.10)),
    ...[67, 64, 69, 67].map((pitch, i) => note(pitch, i * 2 + 0.25, 1.4, 0.045)),
  ],
};

export const sounds: AudioSpec[] = [
  { id: 'confirm', sampleRate: 22050, duration: 0.24, loop: false, notes: [note(72, 0, 0.10, 0.18), note(79, 0.10, 0.14, 0.16)] },
  { id: 'attack', sampleRate: 22050, duration: 0.20, loop: false, notes: [note(84, 0, 0.07, 0.19, 'triangle'), note(72, 0.05, 0.10, 0.18), note(60, 0.10, 0.10, 0.10)] },
  { id: 'impact', sampleRate: 22050, duration: 0.22, loop: false, notes: [note(43, 0, 0.22, 0.30, 'triangle'), note(49, 0, 0.14, 0.17, 'triangle')] },
  { id: 'power-down', sampleRate: 22050, duration: 0.6, loop: false, notes: [note(64, 0, 0.20, 0.16), note(55, 0.15, 0.23, 0.18), note(43, 0.33, 0.27, 0.20)] },
];
