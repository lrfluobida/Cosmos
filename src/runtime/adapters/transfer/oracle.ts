import type { ArtifactReference } from '../../../contracts/types.ts';
import { parseTransferDesign, requireThat, samePoint, sortedPoints, SCENES } from './design.ts';
import type { Direction, Point, Scene, TransferDesign } from './design.ts';

export interface TransferState {
  mapVersion: string; player: Point; boxes: Point[];
  targets: { position: Point; occupied: boolean }[];
  steps: number; won: boolean;
}
export interface Transition {
  direction: Direction; outcome: 'walk' | 'push' | 'wall' | 'box-wall' | 'double-box';
  before: TransferState; after: TransferState;
}
export interface ValidatedTransferDesign {
  design: TransferDesign; initial: TransferState; scenes: Record<Scene, Transition[]>;
  solution: Transition[]; restore: TransferState; continuation: Transition[];
}
function state(design: TransferDesign, player: Point, boxes: Point[], steps: number): TransferState {
  const targets = sortedPoints(design.map.targets).map(position => ({ position, occupied: boxes.some(box => samePoint(box, position)) }));
  return { mapVersion: design.mapVersion, player: structuredClone(player), boxes: sortedPoints(boxes), targets, steps,
    won: targets.every(target => target.occupied) };
}
const delta: Record<Direction, Point> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
function move(design: TransferDesign, before: TransferState, direction: Direction): Transition {
  requireThat(!before.won, 'path cannot move after victory');
  const offset = delta[direction], next: Point = [before.player[0] + offset[0], before.player[1] + offset[1]];
  const wall = (p: Point) => design.map.tiles[p[1]]?.[p[0]] !== '.';
  let outcome: Transition['outcome'] = 'walk', after = structuredClone(before);
  if (wall(next)) outcome = 'wall';
  else {
    const index = before.boxes.findIndex(box => samePoint(box, next));
    if (index >= 0) {
      const beyond: Point = [next[0] + offset[0], next[1] + offset[1]];
      if (wall(beyond)) outcome = 'box-wall';
      else if (before.boxes.some(box => samePoint(box, beyond))) outcome = 'double-box';
      else {
        outcome = 'push'; const boxes = structuredClone(before.boxes); boxes[index] = beyond;
        after = state(design, next, boxes, before.steps + 1);
      }
    } else after = state(design, next, before.boxes, before.steps + 1);
  }
  return { direction, outcome, before: structuredClone(before), after };
}
const legal = (step: Transition) => step.outcome === 'walk' || step.outcome === 'push';
function trace(design: TransferDesign, initial: TransferState, path: Direction[]): Transition[] {
  let current = initial;
  return path.map(direction => { const step = move(design, current, direction); current = step.after; return step; });
}
const mixed = (steps: Transition[]) => steps.some(step => step.outcome === 'walk') && steps.some(step => step.outcome === 'push');
const occupied = (s: TransferState) => s.targets.filter(target => target.occupied).length;

/** Static normative oracle only; never imports game code or observes a candidate. */
export function validateTransferDesign(value: unknown, requirement: ArtifactReference): ValidatedTransferDesign {
  const design = parseTransferDesign(value, requirement);
  const initial = state(design, design.map.player, design.map.boxes, 0);
  requireThat(!initial.won, 'initial state must be non-victory');
  const scenes = Object.fromEntries(SCENES.map(scene => [scene, trace(design, initial, design.paths[scene])])) as Record<Scene, Transition[]>;
  const probes = { wall: 'wall', push: 'push', boxWall: 'box-wall', doubleBox: 'double-box' } as const;
  for (const scene of ['wall', 'push', 'boxWall', 'doubleBox'] as const) {
    const steps = scenes[scene];
    requireThat(steps.slice(0, -1).every(legal) && steps.at(-1)!.outcome === probes[scene], scene + ' requires a legal access path followed by the exact probe');
  }
  requireThat(scenes.wall[0].outcome === 'walk', 'T16-02 must begin with an ordinary one-cell walk');
  for (const scene of ['restart', 'restore'] as const) {
    requireThat(scenes[scene].every(legal) && mixed(scenes[scene]) && !scenes[scene].at(-1)!.after.won,
      scene + ' requires ordinary walking and pushing before a nonterminal checkpoint');
  }
  const restore = scenes.restore.at(-1)!.after;
  requireThat(occupied(restore) === 0, 'restore checkpoint must precede the single-target scene');
  requireThat(design.paths.restore.length < design.solution.length
    && design.paths.restore.every((direction, index) => design.solution[index] === direction), 'solution must have the restore path as a strict prefix');
  const solution = trace(design, initial, design.solution);
  requireThat(solution.every(legal) && solution.at(-1)!.after.won, 'solution must win in at most 40 legal moves');
  const continuation = solution.slice(design.paths.restore.length);
  requireThat(continuation.some(step => occupied(step.after) === 1 && !step.after.won), 'T16-06 must visit a single target after restoration before dual-target victory');
  return { design, initial, scenes, solution, restore: structuredClone(restore), continuation };
}
/** Exact JSON scalar observed at cosmosDebug.transfer.snapshot/saveSnapshot. */
export function snapshotJSON(value: TransferState): string {
  return JSON.stringify({ mapVersion: value.mapVersion, player: value.player, boxes: sortedPoints(value.boxes),
    targets: [...value.targets].sort((a, b) => a.position[0] - b.position[0] || a.position[1] - b.position[1]),
    steps: value.steps, won: value.won });
}
