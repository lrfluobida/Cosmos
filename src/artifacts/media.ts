import { boolean, identifier, list, number, object, unique } from '../media/validation.ts';
import { fail, pathName, regularFile } from './paths.ts';
import type { CaptureRequest, MediaMetadata } from './types.ts';

function safeSvg(bytes: Buffer, width: number, height: number): void {
  const svg = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const prefix = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  if (!svg.startsWith(prefix) || !svg.endsWith('</svg>')) fail('SVG dimensions/viewBox do not match manifest');
  const body = svg.slice(prefix.length, -6);
  // Only the renderer's bounded geometry vocabulary is accepted; no XML entities,
  // scripts, external resources, CSS, events, foreignObject or unknown markup.
  const numeric = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?';
  const transform = `translate\\(${numeric} ${numeric}\\) rotate\\(${numeric}\\) scale\\(${numeric} ${numeric}\\)`;
  const group = new RegExp(`<g transform="${transform}" opacity="${numeric}"><(rect|ellipse) ([^<>]+)\\/></g>`, 'g');
  let consumed = 0, groups = 0;
  for (const match of body.matchAll(group)) {
    if (match.index !== consumed) fail('Unsafe or unsupported SVG markup');
    consumed += match[0].length; groups++;
    const allowed = match[1] === 'rect' ? ['x', 'y', 'width', 'height', 'rx', 'fill', 'stroke', 'stroke-width'] : ['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'stroke-width'];
    const attributes = [...match[2].matchAll(/([a-z-]+)="([^"]*)"(?: |$)/g)];
    if (attributes.map(item => item[0]).join('') !== match[2] || attributes.length !== allowed.length
      || new Set(attributes.map(item => item[1])).size !== allowed.length) fail('Unsafe SVG attributes');
    for (const [, key, value] of attributes) {
      if (!allowed.includes(key)) fail('Unsafe SVG attribute');
      if (key === 'fill' || key === 'stroke') { if (!/^#[0-9a-fA-F]{6}$/.test(value)) fail('Unsafe SVG color'); }
      else if (!new RegExp(`^${numeric}$`).test(value) || !Number.isFinite(Number(value))) fail('Invalid SVG geometry');
    }
    const transforms = match[0].slice(0, match[0].indexOf('><')).match(new RegExp(numeric, 'g')) ?? [];
    if (transforms.some(value => !Number.isFinite(Number(value)))) fail('Invalid SVG transform');
  }
  if (!groups || groups > 64 || consumed !== body.length) fail('Unsafe or unsupported SVG markup');
}

export async function validateMedia(media: MediaMetadata, root: string, declaredFiles: string[]): Promise<void> {
  object(media, ['characters', 'audio']);
  if (!Array.isArray(media.characters) || !Array.isArray(media.audio) || !media.characters.length && !media.audio.length) fail('Missing media interfaces');
  const used: string[] = [], ids: string[] = [];
  for (const character of media.characters) {
    object(character, ['directory', 'manifest']); pathName(character.directory);
    const m = character.manifest; object(m, ['format', 'id', 'width', 'height', 'anchor', 'origin', 'transparent', 'states']);
    identifier(m.id); ids.push(m.id);
    if (m.format !== 'cosmos-vector-v1' || m.transparent !== true) fail('Unsupported character format');
    const width = number(m.width, 16, 512, true), height = number(m.height, 16, 512, true);
    object(m.anchor, ['x', 'y']); object(m.origin, ['x', 'y']);
    number(m.anchor.x, 0, width); number(m.anchor.y, 0, height);
    if (m.origin.x !== m.anchor.x / width || m.origin.y !== m.anchor.y / height) fail('Character anchor/origin mismatch');
    list(m.states, 16); unique(m.states.map(state => identifier(state.name)));
    let frameCount = 0;
    for (const state of m.states) {
      object(state, ['name', 'fps', 'loop', 'frames']); number(state.fps, 1, 60); boolean(state.loop); list(state.frames, 64);
      for (const [index, frame] of state.frames.entries()) {
        if (frame !== `${state.name}-${String(index).padStart(3, '0')}.svg`) fail('Character state/frame order mismatch');
        const file = `${character.directory}/${frame}`;
        used.push(file); frameCount++;
        if (!declaredFiles.includes(file)) fail(`Missing media file: ${file}`);
        safeSvg(await regularFile(root, file), width, height);
      }
    }
    if (frameCount > 256) fail('Too many character frames');
  }
  for (const audio of media.audio) {
    object(audio, ['directory', 'manifest']); pathName(audio.directory);
    const m = audio.manifest; object(m, ['format', 'id', 'file', 'sampleRate', 'channels', 'duration', 'loop', 'peak']);
    identifier(m.id); ids.push(m.id); boolean(m.loop); number(m.duration, 0.02, 30); number(m.peak, 0, 0.9 + 1e-9);
    if (m.format !== 'pcm-s16le' || m.channels !== 1 || ![22050, 44100, 48000].includes(m.sampleRate) || m.file !== `${m.id}.wav`) fail('Invalid audio format');
    const file = `${audio.directory}/${m.file}`; used.push(file);
    if (!declaredFiles.includes(file)) fail(`Missing audio file: ${file}`);
    const bytes = await regularFile(root, file);
    if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 16) !== 'WAVEfmt '
      || bytes.toString('ascii', 36, 40) !== 'data' || bytes.readUInt32LE(4) !== bytes.length - 8 || bytes.readUInt32LE(16) !== 16
      || bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 1 || bytes.readUInt16LE(34) !== 16 || bytes.readUInt16LE(32) !== 2
      || bytes.readUInt32LE(24) !== m.sampleRate || bytes.readUInt32LE(28) !== m.sampleRate * 2
      || bytes.readUInt32LE(40) !== bytes.length - 44 || (bytes.length - 44) % 2 !== 0
      || (bytes.length - 44) / 2 / m.sampleRate !== m.duration) fail('WAV header/samples/duration do not match audio manifest');
    let peak = 0;
    for (let offset = 44; offset < bytes.length; offset += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(offset)) / 32767);
    if (Math.abs(peak - m.peak) > 1 / 32767) fail('WAV sample peak does not match audio manifest');
  }
  unique(ids); unique(used);
  if (declaredFiles.some(file => /\.(svg|wav)$/i.test(file) && !used.includes(file))) fail('Unreferenced media file');
}

export function validateMetadata(metadata: CaptureRequest['metadata']): void {
  object(metadata, ['kind', 'provenance', 'media']);
  if (!['code', 'media', 'data'].includes(metadata.kind)) fail('Invalid artifact kind');
  const p = metadata.provenance;
  if (!p || !Array.isArray(p.sourceRefs) || !p.sourceRefs.length || p.sourceRefs.some(ref => typeof ref !== 'string' || !ref.trim())) fail('Missing provenance sources');
  if (p.kind === 'original-procedural') { if (typeof p.generator !== 'string' || !p.generator.trim()) fail('Missing provenance generator'); }
  else if (p.kind === 'licensed' || p.kind === 'generated') {
    if (typeof p.license !== 'string' || !p.license.trim() || /^(unknown|unverified|none|free|n\/a)$/i.test(p.license.trim())
      || typeof p.redistributionEvidence !== 'string' || !p.redistributionEvidence.trim()
      || p.kind === 'generated' && (typeof p.provider !== 'string' || !p.provider.trim())) fail('Unknown provenance/license redistribution rights');
  } else fail('Unknown provenance kind');
  if ((metadata.kind === 'media') !== !!metadata.media) fail('Media artifacts require explicit media interfaces');
}
