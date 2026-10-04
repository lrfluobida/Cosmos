import type { ArtifactReference } from '../../../contracts/types.ts';
import { id, pathName } from '../../../artifacts/paths.ts';
import { isDeepStrictEqual } from 'node:util';

export const TRANSFER_ACCEPTANCE_IDS = ['T16-01', 'T16-02', 'T16-03', 'T16-04', 'T16-05', 'T16-06'] as const;
export const SCENES = ['wall', 'push', 'boxWall', 'doubleBox', 'restart', 'restore'] as const;
export type Direction = 'up' | 'down' | 'left' | 'right';
export type Point = [number, number];
export type Scene = typeof SCENES[number];
export interface TransferDesign {
  formatVersion: 'cos16-design/1';
  requirement: ArtifactReference;
  mapVersion: string;
  map: { tiles: string[]; player: Point; boxes: Point[]; targets: Point[] };
  solution: Direction[];
  paths: Record<Scene, Direction[]>;
}
export function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('Transfer design: ' + message);
}
function fields(value: unknown, keys: string[], label: string): asserts value is Record<string, unknown> {
  requireThat(value && typeof value === 'object' && !Array.isArray(value), label + ' must be an object');
  requireThat(isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort()), label + ' has missing or unknown fields');
}
export function fixedReference(value: unknown): asserts value is ArtifactReference {
  fields(value, ['artifactId', 'version', 'location'], 'reference');
  id(value.artifactId as string); id(value.version as string, true); pathName(value.location as string);
}
export const sameReference = (left: ArtifactReference, right: ArtifactReference) => isDeepStrictEqual(left, right);
const directions: Direction[] = ['up', 'down', 'left', 'right'];
export const samePoint = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
export const sortedPoints = (points: Point[]): Point[] => structuredClone(points).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

/** A separate versioned extension; does not alter generic DesignDocument or pilot output. */
export function parseTransferDesign(value: unknown, requirement: ArtifactReference): TransferDesign {
  fixedReference(requirement);
  fields(value, ['formatVersion', 'requirement', 'mapVersion', 'map', 'solution', 'paths'], 'design');
  requireThat(value.formatVersion === 'cos16-design/1', 'unsupported schema version');
  fixedReference(value.requirement);
  requireThat(sameReference(value.requirement, requirement), 'current requirement reference mismatch');
  id(value.mapVersion as string, true);
  fields(value.map, ['tiles', 'player', 'boxes', 'targets'], 'map');
  const map = value.map;
  requireThat(Array.isArray(map.tiles) && map.tiles.length >= 3 && map.tiles.length <= 8, 'map height must be 3..8');
  const tiles = map.tiles as unknown[];
  requireThat(typeof tiles[0] === 'string' && tiles[0].length >= 3 && tiles[0].length <= 8, 'map width must be 3..8');
  const width = tiles[0].length;
  requireThat(tiles.every(row => typeof row === 'string' && row.length === width && /^[#.]+$/.test(row)), 'invalid or ragged wall/floor matrix');
  const rows = tiles as string[];
  requireThat(rows.every((row, y) => y === 0 || y === rows.length - 1 ? /^#+$/.test(row) : row[0] === '#' && row.at(-1) === '#'), 'map boundary must be closed');
  const point = (value: unknown): value is Point => Array.isArray(value) && value.length === 2
    && value.every(Number.isInteger) && value[0] >= 0 && value[0] < width && value[1] >= 0
    && value[1] < rows.length && rows[value[1]][value[0]] === '.';
  requireThat(point(map.player), 'player must be one integer floor coordinate');
  for (const name of ['boxes', 'targets']) {
    const points = map[name];
    requireThat(Array.isArray(points) && points.length === 2 && points.every(point), name + ' must contain exactly two floor coordinates');
    requireThat(!samePoint(points[0], points[1]), 'duplicate ' + name);
  }
  requireThat(!(map.boxes as Point[]).some(box => samePoint(box, map.player as Point)), 'player and box overlap');
  const path = (value: unknown, limit: number, label: string) => requireThat(Array.isArray(value)
    && value.length > 0 && value.length <= limit && value.every(move => directions.includes(move)), label + ' must contain 1..' + limit + ' directions');
  path(value.solution, 40, 'solution');
  fields(value.paths, [...SCENES], 'paths');
  // Transport bound: every independently prepared mouse plan stays below COS-08's 200-step cap.
  for (const scene of SCENES) path(value.paths[scene], 60, scene);
  return structuredClone(value) as unknown as TransferDesign;
}
