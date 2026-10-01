import { boolean, choice, color, identifier, invalid, list, number, object, unique } from './validation.ts';

export interface Layer {
  id: string;
  shape: 'rect' | 'ellipse';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius?: number;
}

export interface Pose {
  dx?: number;
  dy?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  opacity?: number;
}

export interface CharacterSpec {
  id: string;
  width: number;
  height: number;
  anchor: { x: number; y: number };
  layers: Layer[];
  states: { name: string; fps: number; loop: boolean; frames: Record<string, Pose>[] }[];
}

export interface AnimationState {
  name: string;
  fps: number;
  loop: boolean;
  frames: string[];
}

export interface CharacterManifest {
  format: 'cosmos-vector-v1';
  id: string;
  width: number;
  height: number;
  anchor: { x: number; y: number };
  origin: { x: number; y: number };
  transparent: true;
  states: AnimationState[];
}

export function validateCharacter(input: unknown): CharacterSpec {
  const spec = object(input, ['id', 'width', 'height', 'anchor', 'layers', 'states']);
  const width = number(spec.width, 16, 512, true);
  const height = number(spec.height, 16, 512, true);
  const anchor = object(spec.anchor, ['x', 'y']);
  const layers = list(spec.layers, 64).map((item): Layer => {
    const layer = object(item, ['id', 'shape', 'x', 'y', 'width', 'height', 'fill', 'stroke', 'strokeWidth', 'radius']);
    const result: Layer = {
      id: identifier(layer.id), shape: choice(layer.shape, ['rect', 'ellipse']),
      x: number(layer.x, -512, 1024), y: number(layer.y, -512, 1024),
      width: number(layer.width, 0.1, 512), height: number(layer.height, 0.1, 512),
      fill: color(layer.fill), stroke: color(layer.stroke), strokeWidth: number(layer.strokeWidth, 0, 16),
    };
    if (layer.radius !== undefined) result.radius = number(layer.radius, 0, Math.min(result.width, result.height) / 2);
    return result;
  });
  unique(layers.map((layer) => layer.id));
  let totalFrames = 0;
  const states = list(spec.states, 16).map((item) => {
    const state = object(item, ['name', 'fps', 'loop', 'frames']);
    const frames = list(state.frames, 64);
    totalFrames += frames.length;
    if (totalFrames > 256) invalid('total frames exceed 256');
    return {
      name: identifier(state.name), fps: number(state.fps, 1, 60), loop: boolean(state.loop),
      frames: frames.map((item) => {
        const frame = object(item, layers.map((layer) => layer.id));
        const result: Record<string, Pose> = {};
        for (const [id, value] of Object.entries(frame)) {
          const pose = object(value, ['dx', 'dy', 'rotation', 'scaleX', 'scaleY', 'opacity']);
          const limits = { dx: [-512, 512], dy: [-512, 512], rotation: [-180, 180], scaleX: [0.01, 4], scaleY: [0.01, 4], opacity: [0, 1] };
          const clean: Pose = {};
          for (const key of Object.keys(pose) as (keyof Pose)[]) clean[key] = number(pose[key], limits[key][0], limits[key][1]);
          result[id] = clean;
        }
        return result;
      }),
    };
  });
  unique(states.map((state) => state.name));
  return { id: identifier(spec.id), width, height, anchor: { x: number(anchor.x, 0, width), y: number(anchor.y, 0, height) }, layers, states };
}

function layerSvg(layer: Layer, pose: Pose = {}): string {
  const { width, height } = layer;
  const geometry = layer.shape === 'rect'
    ? `<rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" rx="${layer.radius ?? 0}"`
    : `<ellipse cx="0" cy="0" rx="${width / 2}" ry="${height / 2}"`;
  return `<g transform="translate(${layer.x + width / 2 + (pose.dx ?? 0)} ${layer.y + height / 2 + (pose.dy ?? 0)}) rotate(${pose.rotation ?? 0}) scale(${pose.scaleX ?? 1} ${pose.scaleY ?? 1})" opacity="${pose.opacity ?? 1}">${geometry} fill="${layer.fill}" stroke="${layer.stroke}" stroke-width="${layer.strokeWidth}"/></g>`;
}

export function renderCharacter(input: unknown): { manifest: CharacterManifest; files: { name: string; svg: string }[] } {
  // Parse a fresh allowlisted copy before interpolating anything into markup.
  const spec = validateCharacter(input);
  const files: { name: string; svg: string }[] = [];
  const states = spec.states.map((state): AnimationState => ({
    name: state.name, fps: state.fps, loop: state.loop,
    frames: state.frames.map((poses, index) => {
      const name = `${state.name}-${String(index).padStart(3, '0')}.svg`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}">${spec.layers.map((layer) => layerSvg(layer, poses[layer.id])).join('')}</svg>`;
      files.push({ name, svg });
      return name;
    }),
  }));
  return {
    manifest: { format: 'cosmos-vector-v1', id: spec.id, width: spec.width, height: spec.height,
      anchor: spec.anchor, origin: { x: spec.anchor.x / spec.width, y: spec.anchor.y / spec.height }, transparent: true, states },
    files,
  };
}

/** Pass elapsed time since the latest state change. Non-looping states hold their final frame. */
export function animationFrame(state: AnimationState, elapsedMs: number): string {
  number(elapsedMs, 0, Number.MAX_SAFE_INTEGER / 60);
  const fps = number(state.fps, 1, 60);
  const frames = list(state.frames, 64);
  const loop = boolean(state.loop);
  const index = Math.floor(elapsedMs * fps / 1000);
  return state.frames[loop ? index % frames.length : Math.min(index, frames.length - 1)];
}
