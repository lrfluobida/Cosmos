import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { directory, snapshot } from '../artifacts/paths.ts';
import type { MediaMetadata } from '../artifacts/types.ts';
import { renderCharacter, validateCharacter } from '../media/vector.ts';
import { synthesizeWav, validateAudio } from '../media/audio.ts';
import { identifier } from '../media/validation.ts';
import { publishReceipt } from './recovery/receipt-file.ts';
import { validatePlan } from '../acceptance/plan.ts';
import type { AcceptancePlan, Scalar } from '../acceptance/plan.ts';

export interface RuntimeMediaCheck { stepId: string; kind: 'character_id' | 'loaded_frames' | 'state_name' | 'state_seen' | 'audio_id' | 'audio_decoded' | 'audio_started'; mediaId: string; state?: string }
/** Same read-only observation boundary as COS-10, bound to this candidate's dynamic manifest. */
export function withMediaObservations(input: AcceptancePlan, media: MediaMetadata) {
  const plan = structuredClone(input), checks: RuntimeMediaCheck[] = [];
  let sequence = 0;
  const check = (path: string[], expected: Scalar, kind: RuntimeMediaCheck['kind'], mediaId: string, state?: string) => {
    let id: string; do { id = `host-media-${++sequence}`; } while (plan.steps.some(step => step.id === id));
    plan.steps.push({ id, kind: 'wait-for', acceptanceId: plan.acceptanceIds[0], observation: { kind: 'debug', path: ['media', ...path] }, expected, timeoutMs: 1500 });
    checks.push({ stepId: id, kind, mediaId, ...(state ? { state } : {}) });
  };
  media.characters.forEach((character, index) => {
    const path = ['characters', String(index)], id = character.manifest.id;
    check([...path, 'id'], id, 'character_id', id);
    check([...path, 'loadedFrames'], character.manifest.states.reduce((sum, state) => sum + state.frames.length, 0), 'loaded_frames', id);
    character.manifest.states.forEach((state, number) => {
      check([...path, 'states', String(number), 'name'], state.name, 'state_name', id, state.name);
      check([...path, 'states', String(number), 'seen'], true, 'state_seen', id, state.name);
    });
  });
  media.audio.forEach((audio, index) => {
    const path = ['audio', String(index)], id = audio.manifest.id;
    check([...path, 'id'], id, 'audio_id', id); check([...path, 'decoded'], true, 'audio_decoded', id); check([...path, 'started'], true, 'audio_started', id);
  });
  const issues = validatePlan(plan);
  if (issues.length) throw new Error(`Host cannot cover this media roster with the confirmed input path: ${issues.join('; ')}`);
  return { plan, checks };
}

export interface DesignDocument {
  summary: string; implementationNotes: string[]; acceptanceMapping: Record<string, string>;
  characters: { id: string; purpose: string; states: string[] }[];
  audio: { id: string; trigger: string; loop: boolean }[];
}
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 16000;
const sameIds = (left: string[], right: string[]) => left.length === right.length && new Set(left).size === left.length && left.every(id => right.includes(id));

/** Checks design coverage only. Gameplay still needs the separate normal-input host. */
export function validateDesign(value: unknown, gameplayIds: string[]): asserts value is DesignDocument {
  const design = value as DesignDocument;
  if (!design || Object.keys(design).some(key => !['summary', 'implementationNotes', 'acceptanceMapping', 'characters', 'audio'].includes(key))
    || !text(design.summary) || !Array.isArray(design.implementationNotes) || !design.implementationNotes.length || design.implementationNotes.some(note => !text(note))
    || !design.acceptanceMapping || !sameIds(Object.keys(design.acceptanceMapping), gameplayIds) || Object.values(design.acceptanceMapping).some(value => !text(value))
    || !Array.isArray(design.characters) || !design.characters.length || design.characters.length > 16 || !Array.isArray(design.audio) || design.audio.length > 16) throw new Error('Design must cover the exact gameplay requirements and bounded media roster.');
  for (const character of design.characters) {
    identifier(character.id);
    if (Object.keys(character).some(key => !['id', 'purpose', 'states'].includes(key)) || !text(character.purpose) || !Array.isArray(character.states) || !character.states.length || character.states.length > 16 || new Set(character.states).size !== character.states.length) throw new Error('Invalid design character/state declaration.');
    character.states.forEach(identifier);
  }
  for (const audio of design.audio) {
    identifier(audio.id);
    if (Object.keys(audio).some(key => !['id', 'trigger', 'loop'].includes(key)) || !text(audio.trigger) || typeof audio.loop !== 'boolean') throw new Error('Invalid design audio declaration.');
  }
  if (new Set(design.characters.map(item => item.id)).size !== design.characters.length || new Set(design.audio.map(item => item.id)).size !== design.audio.length) throw new Error('Duplicate design media IDs.');
}
export function validateDeclaredMedia(value: unknown, design: DesignDocument) {
  const spec = value as { characters: unknown[]; audio: unknown[] };
  if (!spec || Object.keys(spec).some(key => !['characters', 'audio'].includes(key)) || !Array.isArray(spec.characters) || !Array.isArray(spec.audio)
    || spec.characters.length !== design.characters.length || spec.audio.length !== design.audio.length) throw new Error('Art media roster must match the design.');
  const characters = spec.characters.map(validateCharacter), audio = spec.audio.map(validateAudio);
  if (!sameIds(characters.map(item => item.id), design.characters.map(item => item.id)) || !sameIds(audio.map(item => item.id), design.audio.map(item => item.id))) throw new Error('Art IDs must match the design roster.');
  for (const character of characters) if (!sameIds(character.states.map(state => state.name), design.characters.find(item => item.id === character.id)!.states)) throw new Error('Art states must match the design.');
  for (const clip of audio) if (clip.loop !== design.audio.find(item => item.id === clip.id)!.loop) throw new Error('Art audio loop must match the design.');
  return { characters, audio };
}
/** Renders only runtime art-role data using the existing bounded vector/PCM tools. */
export async function renderDeclaredMedia(root: string, folder: string, value: unknown, design: DesignDocument, signal: AbortSignal) {
  const spec = validateDeclaredMedia(value, design), destination = await directory(root, folder), media: MediaMetadata = { characters: [], audio: [] };
  for (const character of spec.characters) {
    signal.throwIfAborted(); const output = renderCharacter(character), path = `public/assets/${character.id}`; await directory(destination, path);
    for (const file of output.files) await writeFile(join(destination, path, file.name), file.svg, { encoding: 'utf8', flag: 'wx' });
    await publishReceipt(join(destination, path, 'manifest.json'), output.manifest); media.characters.push({ directory: path, manifest: output.manifest });
  }
  for (const clip of spec.audio) {
    signal.throwIfAborted(); const output = synthesizeWav(clip), path = 'public/assets/audio';
    if (output.manifest.peak <= 0.001) throw new Error('Art audio is silent.');
    await directory(destination, path); await writeFile(join(destination, path, output.manifest.file), output.bytes, { flag: 'wx' }); media.audio.push({ directory: path, manifest: output.manifest });
  }
  await publishReceipt(join(destination, 'public/assets/manifest.json'), media);
  await directory(destination, '_cosmos'); await publishReceipt(join(destination, '_cosmos/mediaSpec.json'), value);
  signal.throwIfAborted(); return { media, files: [...(await snapshot(destination)).keys()] };
}
