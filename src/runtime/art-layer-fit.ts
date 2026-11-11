import type { PixelPattern } from '../acceptance/plan.ts';
import { pixelPatternPercent, type MeasuredCell } from '../acceptance/visual-observations.ts';
import { identifier, list, number, object, unique } from '../media/validation.ts';
import { validateCharacter, type CharacterSpec, type Layer } from '../media/vector.ts';
import type { BrowserScenario } from '../roles/requirements.ts';
import { artMappings, frameSvg, mappedPattern, withFrameMeasurement, type ForegroundMapping } from './art-frame-check.ts';

const axes = ['x', 'y', 'width', 'height'] as const;
type Axis = typeof axes[number];
type Change = { layerId: string } & Partial<Record<Axis, number>>;
export type LayerFit = { inputSha256: string; mapping: ForegroundMapping; changes: Change[] };
const maxDelta = 3, maxEditedLayers = 8, maxMeasurements = 1024;

function fitTarget(scenario: BrowserScenario, characters: CharacterSpec[], input: unknown) {
  const [mapping] = artMappings([input]);
  if (!('characterId' in mapping)) throw new Error('Fit requires an editable foreground frame.');
  const step = mappedPattern(scenario, mapping);
  if (!step.expected) throw new Error('Fit requires a pixel pattern expected to match.');
  const character = characters.find(item => item.id === mapping.characterId);
  if (!character) throw new Error('Missing fit character: ' + mapping.characterId);
  if (character.states.length !== 1 || character.states[0].frames.length !== 1) throw new Error('Geometry fit currently requires a single-frame character.');
  frameSvg([character], mapping);
  const background = mapping.background ? frameSvg(characters, mapping.background) : undefined;
  return { mapping, character, pattern: step.pattern, background };
}

/** Replay explicit native-unit offsets only. Review and capture still belong to the new run. */
export function replayLayerFit(scenario: BrowserScenario, characters: CharacterSpec[], input: unknown, inputSha256: string) {
  const fit = object(input, ['inputSha256', 'mapping', 'changes']);
  if (fit.inputSha256 !== inputSha256) throw new Error('Geometry fit input media changed.');
  const { mapping, character } = fitTarget(scenario, characters, fit.mapping);
  const layers = character.layers.map(layer => ({ ...layer }));
  const changes = list(fit.changes, maxEditedLayers).map(value => {
    const entry = object(value, ['layerId', ...axes]), layerId = identifier(entry.layerId);
    const layer = layers.find(item => item.id === layerId);
    if (!layer) throw new Error('Unknown fit layer: ' + layerId);
    const change: Change = { layerId };
    for (const axis of axes) if (axis in entry) {
      const delta = number(entry[axis], -maxDelta, maxDelta, true);
      if (!delta) throw new Error('Omit unchanged fit coordinates.');
      change[axis] = delta;
      layer[axis] += delta;
    }
    if (Object.keys(change).length === 1) throw new Error('Geometry fit requires a change.');
    return change;
  });
  unique(changes.map(change => change.layerId));
  const result = validateCharacter({ ...character, layers });
  return { character: result, fit: { inputSha256, mapping, changes } satisfies LayerFit };
}

function changesFrom(original: CharacterSpec, layers: Layer[]) {
  const changes: Change[] = [];
  let movement = 0;
  for (const [i, layer] of layers.entries()) {
    const change: Change = { layerId: layer.id };
    for (const axis of axes) {
      const delta = Math.round(layer[axis] - original.layers[i][axis]);
      if (delta) { change[axis] = delta; movement += Math.abs(delta); }
    }
    if (Object.keys(change).length > 1) changes.push(change);
  }
  return { changes, movement };
}

function score(pattern: PixelPattern, failedCells: MeasuredCell[], movement: number) {
  const deficit = failedCells.reduce((sum, [row, col, matches, pixels]) => sum + (pattern.rows[row][col] === '+'
    ? Math.ceil(pixels * pixelPatternPercent.positiveMinimum / 100) - matches
    : matches - Math.floor(pixels * pixelPatternPercent.negativeMaximum / 100)), 0);
  return { deficit, failedCells, movement };
}
type Score = ReturnType<typeof score>;
const better = (a: Score, b: Score) => a.deficit < b.deficit || a.deficit === b.deficit &&
  (a.failedCells.length < b.failedCells.length || a.failedCells.length === b.failedCells.length && a.movement < b.movement);

// Translate, resize an edge, or translate diagonally. Each offset remains relative to the pinned original.
const directions = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1],
  [1, 0, -1, 0], [0, 1, 0, -1], [1, 1, 0, 0], [1, -1, 0, 0]];

export async function fitArtFrame(scenario: BrowserScenario, characters: CharacterSpec[], input: unknown) {
  const { mapping, character, pattern, background } = fitTarget(scenario, characters, input);
  return withFrameMeasurement(scenario.viewport, async measure => {
    let measurements = 0;
    async function evaluate(candidate: CharacterSpec, foreground: string, movement: number) {
      const backdrop = mapping.background?.characterId === character.id ? frameSvg([candidate], mapping.background) : background;
      measurements++;
      return score(pattern, (await measure(pattern, foreground, backdrop)).failedCells, movement);
    }
    const before = await evaluate(character, frameSvg([character], mapping), 0);
    let best = character, after = before;
    for (let pass = 0; pass < 3 && after.deficit && measurements < maxMeasurements; pass++) {
      const passStart = after;
      for (let i = 0; i < character.layers.length && after.deficit && measurements < maxMeasurements; i++) {
        const start = best;
        for (const direction of directions) for (const distance of [-1, 1, -2, 2, -3, 3]) {
          if (measurements >= maxMeasurements) break;
          const layer = { ...start.layers[i] };
          for (const [j, axis] of axes.entries()) {
            const original = character.layers[i][axis];
            layer[axis] = original + (Math.round(layer[axis] - original) + direction[j] * distance);
          }
          if (axes.some(axis => Math.abs(Math.round(layer[axis] - character.layers[i][axis])) > maxDelta)) continue;
          const layers = [...start.layers];
          layers[i] = layer;
          const { changes, movement } = changesFrom(character, layers);
          if (changes.length > maxEditedLayers) continue;
          const candidate = { ...character, layers };
          let foreground: string;
          try { foreground = frameSvg([candidate], mapping); }
          catch { continue; } // A move can violate the native size, position or corner-radius limits.
          const outcome = await evaluate(candidate, foreground, movement);
          if (better(outcome, after)) { best = candidate; after = outcome; }
        }
      }
      if (after === passStart) break;
    }
    return { mapping, before, after, measurements, changes: changesFrom(character, best.layers).changes };
  });
}
