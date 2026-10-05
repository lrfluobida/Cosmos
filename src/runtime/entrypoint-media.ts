import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { join } from 'node:path';
import { directory, snapshot } from '../artifacts/paths.ts';
import type { MediaMetadata } from '../artifacts/types.ts';
import { renderCharacter, validateCharacter } from '../media/vector.ts';
import { synthesizeWav, validateAudio } from '../media/audio.ts';
import { identifier } from '../media/validation.ts';
import { publishReceipt } from './recovery/receipt-file.ts';
import { validatePlan } from '../acceptance/plan.ts';
import type { AcceptancePlan, Scalar } from '../acceptance/plan.ts';
import type { GenericMediaObservationRequest, MediaObservationRequest, ReadonlyMediaObservationRequest, MediaObservationSample } from '../acceptance/browser.ts';
import type { GenericPersistentAcceptanceSeries, PersistentAcceptanceReport } from '../acceptance/persistent.ts';
import type { ArtifactReference } from '../contracts/types.ts';

export interface RuntimeMediaCheck { stepId: string; kind: 'character_id' | 'loaded_frames' | 'state_name' | 'state_seen' | 'audio_id' | 'audio_decoded' | 'audio_started'; mediaId: string; state?: string }
export interface MediaObservationDefinition extends Omit<RuntimeMediaCheck, 'stepId'> { id: string; path: string[]; expected: Scalar }
export function mediaObservationDefinitions(media: MediaMetadata): MediaObservationDefinition[] {
  const definitions: MediaObservationDefinition[] = [];
  const field = (path: string[], expected: Scalar, kind: RuntimeMediaCheck['kind'], mediaId: string, state?: string) => {
    definitions.push({ id: `host-media-${definitions.length + 1}`, path: ['media', ...path], expected, kind, mediaId, ...(state ? { state } : {}) });
  };
  media.characters.forEach((character, index) => {
    const path = ['characters', String(index)], id = character.manifest.id;
    field([...path, 'id'], id, 'character_id', id);
    field([...path, 'loadedFrames'], character.manifest.states.reduce((sum, state) => sum + state.frames.length, 0), 'loaded_frames', id);
    character.manifest.states.forEach((state, number) => {
      field([...path, 'states', String(number), 'name'], state.name, 'state_name', id, state.name);
      field([...path, 'states', String(number), 'seen'], true, 'state_seen', id, state.name);
    });
  });
  media.audio.forEach((audio, index) => {
    const path = ['audio', String(index)], id = audio.manifest.id;
    field([...path, 'id'], id, 'audio_id', id); field([...path, 'decoded'], true, 'audio_decoded', id); field([...path, 'started'], true, 'audio_started', id);
  });
  return definitions;
}
export function createMediaObservationRequest(media: MediaMetadata, binding: Omit<MediaObservationRequest, 'formatVersion' | 'fields'>): MediaObservationRequest {
  return { formatVersion: 'readonly-media/1', ...structuredClone(binding),
    fields: mediaObservationDefinitions(media).map(({ id, path }) => ({ id, path })) };
}
export function createGenericMediaObservationRequest(media: MediaMetadata, binding: Pick<GenericMediaObservationRequest, 'media' | 'manifestSha256' | 'collection'> & { plan: AcceptancePlan }): GenericMediaObservationRequest {
  if (validatePlan(binding.plan).length) throw new Error('Invalid fixed normal-input media plan.');
  return { formatVersion: 'readonly-media/generic-1', media: structuredClone(binding.media), manifestSha256: binding.manifestSha256,
    candidate: structuredClone(binding.plan.artifact), planBindingSha256: createHash('sha256').update(JSON.stringify(binding.plan)).digest('hex'),
    fields: mediaObservationDefinitions(media).map(({ id, path, expected }) => ({ id, path, expected })), ...(binding.collection ? { collection: structuredClone(binding.collection) } : {}) };
}
export interface MediaSampleRow { segmentId: string; reportPath: string; sample: MediaObservationSample }
export interface MediaCoverageCheck extends MediaObservationDefinition {
  actual: Scalar; witnesses: { segmentId: string; reportPath: string }[];
  observations: { segmentId: string; reportPath: string; value: Scalar }[];
}
/** Samples remain per-document facts. Coverage never changes a game, report or frozen plan. */
export function assessMediaCoverage(media: MediaMetadata, request: ReadonlyMediaObservationRequest, rows: MediaSampleRow[]): { valid: boolean; complete: boolean; checks: MediaCoverageCheck[] } {
  return assessBoundMediaCoverage(media, rows.map(() => request), rows);
}
function assessBoundMediaCoverage(media: MediaMetadata, requests: ReadonlyMediaObservationRequest[], rows: MediaSampleRow[]): { valid: boolean; complete: boolean; checks: MediaCoverageCheck[] } {
  const invalid = () => ({ valid: false, complete: false, checks: [] });
  const definitions = mediaObservationDefinitions(media), only = (value: object, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
  if (!rows.length || requests.length !== rows.length || requests.some(request => !['readonly-media/1', 'readonly-media/generic-1'].includes(request.formatVersion) || !/^[a-f0-9]{64}$/.test(request.manifestSha256)
    || !isDeepStrictEqual(request.fields, definitions.map(({ id, path, expected }) => request.formatVersion === 'readonly-media/generic-1' ? { id, path, expected } : { id, path })))) return invalid();
  const segments = new Set(), reports = new Set();
  for (const [rowIndex, row] of rows.entries()) {
    const sample = row?.sample;
    if (!row || !only(row, ['segmentId', 'reportPath', 'sample']) || typeof row.segmentId !== 'string' || !row.segmentId
      || typeof row.reportPath !== 'string' || !row.reportPath || segments.has(row.segmentId) || reports.has(row.reportPath)
      || !sample || !only(sample, ['request', 'recordedAt', 'values']) || !isDeepStrictEqual(sample.request, requests[rowIndex])
      || typeof sample.recordedAt !== 'string' || !Number.isFinite(Date.parse(sample.recordedAt))
      || !Array.isArray(sample.values) || sample.values.length !== definitions.length) return invalid();
    segments.add(row.segmentId); reports.add(row.reportPath);
    for (const [index, definition] of definitions.entries()) {
      const value = sample.values[index];
      if (definition.kind === 'loaded_frames') {
        if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > Number(definition.expected)) return invalid();
      } else if (['state_seen', 'audio_decoded', 'audio_started'].includes(definition.kind)) {
        if (typeof value !== 'boolean') return invalid();
        if (definition.kind === 'audio_started' && value && sample.values[index - 1] !== true) return invalid();
      } else if (typeof value !== 'string') return invalid();
    }
  }
  const checks = definitions.map((definition, index): MediaCoverageCheck => {
    const values = rows.map(row => row.sample.values[index]);
    const actual = definition.kind === 'loaded_frames' ? Math.max(...values.map(Number))
      : typeof definition.expected === 'boolean' ? values.some(value => value === true) : values.find(value => value !== definition.expected) ?? definition.expected;
    return { ...definition, actual, observations: rows.map(row => ({ segmentId: row.segmentId, reportPath: row.reportPath, value: row.sample.values[index] })), witnesses: rows.filter(row => row.sample.values[index] === definition.expected)
      .map(({ segmentId, reportPath }) => ({ segmentId, reportPath })) };
  });
  return { valid: true, complete: checks.every(check => check.actual === check.expected), checks };
}
/** Authenticate each actual document before combining its partial observations. */
export function assessGenericSeriesMediaCoverage(media: MediaMetadata, binding: { series: GenericPersistentAcceptanceSeries; media: ArtifactReference; manifestSha256: string; deadlineAt: number }, report: PersistentAcceptanceReport) {
  const invalid = () => ({ valid: false, complete: false, checks: [] as MediaCoverageCheck[] });
  const { series } = binding, start = Date.parse(report?.startedAt), end = Date.parse(report?.endedAt);
  if (!report || !isDeepStrictEqual(report.series, series) || report.deadlineAt !== binding.deadlineAt || report.outcome !== 'passed'
    || !Array.isArray(report.errors) || report.errors.length || !Number.isFinite(start) || !Number.isFinite(end) || start > end || end > binding.deadlineAt
    || !Array.isArray(report.segments) || report.segments.length !== series.segments.length || series.segments.length !== 2) return invalid();
  const rows: MediaSampleRow[] = [], requests: GenericMediaObservationRequest[] = []; let previousEnd = start;
  for (const [index, segment] of series.segments.entries()) {
    const current = report.segments[index], raw = current?.report, sample = raw?.mediaObservations;
    const segmentStart = Date.parse(raw?.startedAt), segmentEnd = Date.parse(raw?.endedAt), recorded = Date.parse(sample?.recordedAt ?? '');
    if (!raw || current.id !== segment.id || !isDeepStrictEqual(raw.plan, segment.plan) || raw.formatVersion !== '1.0.0' || raw.kind !== 'normal_browser_input'
      || raw.outcome !== 'passed' || !Array.isArray(raw.errors) || raw.errors.length || raw.cleanup?.processExited !== true
      || !Array.isArray(raw.steps) || raw.steps.length !== segment.plan.steps.length || raw.steps.some((row, stepIndex) => {
        const step = segment.plan.steps[stepIndex], expected = 'expected' in step ? step.expected : 'input delivered';
        return row.id !== step.id || row.kind !== step.kind || row.acceptanceId !== ('acceptanceId' in step ? step.acceptanceId : undefined)
          || row.outcome !== 'passed' || row.error !== null || row.actual !== expected || row.expected !== expected;
      }) || !sample || !Number.isFinite(segmentStart) || !Number.isFinite(segmentEnd) || !Number.isFinite(recorded)
      || segmentStart < previousEnd || segmentStart > recorded || recorded > segmentEnd || segmentEnd > end) return invalid();
    previousEnd = segmentEnd;
    const request = createGenericMediaObservationRequest(media, { media: binding.media, manifestSha256: binding.manifestSha256, plan: segment.plan,
      collection: { kind: 'persistent-segment', seriesBindingSha256: series.bindingSha256, segmentId: segment.id } });
    requests.push(request); rows.push({ segmentId: segment.id, reportPath: raw.reportPath, sample });
  }
  return assessBoundMediaCoverage(media, requests, rows);
}
/** Same read-only observation boundary as COS-10, bound to this candidate's dynamic manifest. */
export function withMediaObservations(input: AcceptancePlan, media: MediaMetadata) {
  const plan = structuredClone(input), checks: RuntimeMediaCheck[] = [];
  const originalIssues = validatePlan(plan);
  if (originalIssues.length) throw new Error(`Invalid confirmed input path: ${originalIssues.join('; ')}`);
  const definitions = mediaObservationDefinitions(media);
  if (plan.steps.length + definitions.length > 200) return { plan, checks, collectionRequired: true };
  let sequence = 0;
  const check = (path: string[], expected: Scalar, kind: RuntimeMediaCheck['kind'], mediaId: string, state?: string) => {
    let id: string; do { id = `host-media-${++sequence}`; } while (plan.steps.some(step => step.id === id));
    plan.steps.push({ id, kind: 'wait-for', acceptanceId: plan.acceptanceIds[0], observation: { kind: 'debug', path: ['media', ...path] }, expected, timeoutMs: 1500 });
    checks.push({ stepId: id, kind, mediaId, ...(state ? { state } : {}) });
  };
  for (const definition of definitions) check(definition.path.slice(1), definition.expected, definition.kind, definition.mediaId, definition.state);
  const issues = validatePlan(plan);
  if (issues.length) throw new Error(`Host cannot cover this media roster with the confirmed input path: ${issues.join('; ')}`);
  return { plan, checks, collectionRequired: false };
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
    || !Array.isArray(design.characters) || !design.characters.length || design.characters.length > 128 || !Array.isArray(design.audio) || design.audio.length > 64) throw new Error('Design must cover the exact gameplay requirements and bounded media roster.');
  for (const character of design.characters) {
    identifier(character.id);
    if (Object.keys(character).some(key => !['id', 'purpose', 'states'].includes(key)) || !text(character.purpose) || !Array.isArray(character.states) || !character.states.length || character.states.length > 16 || new Set(character.states).size !== character.states.length) throw new Error('Invalid design character/state declaration.');
    character.states.forEach(identifier);
  }
  for (const audio of design.audio) {
    identifier(audio.id);
    if (Object.keys(audio).some(key => !['id', 'trigger', 'loop'].includes(key)) || !text(audio.trigger) || typeof audio.loop !== 'boolean') throw new Error('Invalid design audio declaration.');
  }
  const ids = [...design.characters.map(item => item.id), ...design.audio.map(item => item.id)];
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate design media IDs.');
}
export function validateDeclaredMedia(value: unknown, design: DesignDocument) {
  const spec = value as { formatVersion?: string; batches?: unknown[]; characters?: unknown[]; audio?: unknown[] };
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('Invalid bounded art batch.');
  let batches: unknown[];
  if ('formatVersion' in spec || 'batches' in spec) {
    if (Object.keys(spec).some(key => !['formatVersion', 'batches'].includes(key)) || spec.formatVersion !== 'batched-media/1'
      || !Array.isArray(spec.batches) || !spec.batches.length || spec.batches.length > 8) throw new Error('Art requires 1..8 bounded batches.');
    batches = Array.from(spec.batches);
  } else batches = [spec];
  const charactersInput: unknown[] = [], audioInput: unknown[] = [];
  for (const value of batches) {
    const batch = value as { characters: unknown[]; audio: unknown[] };
    if (!batch || typeof batch !== 'object' || Array.isArray(batch) || Object.keys(batch).some(key => !['characters', 'audio'].includes(key))
      || !Array.isArray(batch.characters) || !Array.isArray(batch.audio) || batch.characters.length > 16 || batch.audio.length > 16
      || !batch.characters.length && !batch.audio.length) throw new Error('Each bounded art batch requires at most 16 characters/16 clips and some media.');
    charactersInput.push(...batch.characters); audioInput.push(...batch.audio);
  }
  if (charactersInput.length > 128 || audioInput.length > 64 || charactersInput.length !== design.characters.length || audioInput.length !== design.audio.length) throw new Error('Art media roster must match the bounded design.');
  const characters = charactersInput.map(validateCharacter), audio = audioInput.map(validateAudio);
  const ids = [...characters.map(item => item.id), ...audio.map(item => item.id)];
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate art media IDs.');
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
