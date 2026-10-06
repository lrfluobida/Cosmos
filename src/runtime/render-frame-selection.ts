import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import type { ArtifactReference } from '../contracts/types.ts';
import { regularFile } from '../artifacts/paths.ts';
import { validationHash } from './validation-validation.ts';
import type { IntakeSnapshot } from './intake.ts';
import type { RunSnapshot } from './run-types.ts';

const observer: ArtifactReference = { artifactId: 'render-frame-observer', version: 'v1', location: 'registry/captures/render-frame-observer/v1/files' };
export interface RenderFrameSelection { enabled: true; observer: ArtifactReference; observerSha256: string }
export function validateFrameSelection(value: unknown): asserts value is RenderFrameSelection | undefined {
  if (value === undefined) return;
  const selection = value as RenderFrameSelection;
  if (!selection || selection.enabled !== true || !isDeepStrictEqual(selection.observer, observer)
    || !/^[a-f0-9]{64}$/.test(selection.observerSha256) || Object.keys(selection).some(key => !['enabled', 'observer', 'observerSha256'].includes(key))) throw new Error('Original render-frame selection is invalid.');
}
export async function selectRenderFrames(): Promise<RenderFrameSelection> {
  const bytes = await regularFile(fileURLToPath(new URL('../../templates/2d/', import.meta.url)), 'render-frame-observer.ts');
  new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return { enabled: true, observer: { ...observer }, observerSha256: validationHash(bytes) };
}
/** Execution needs the same installed source; historical reads authenticate original captures. */
export async function requireCurrentFrameSource(selection?: RenderFrameSelection): Promise<void> {
  validateFrameSelection(selection);
  if (selection && !isDeepStrictEqual(selection, await selectRenderFrames())) throw new Error('Original render-frame observer source bytes changed.');
}
export function frameConfirmationVersion(revision: number, selection?: RenderFrameSelection) {
  validateFrameSelection(selection);
  return `v${revision}${selection ? `-frames-${selection.observerSha256}` : ''}`;
}
export function frameIntakeReason(selection?: RenderFrameSelection) {
  validateFrameSelection(selection);
  return `Intake budget fixed; formal generation has not started.${selection ? ` Render-frame observer: ${selection.observerSha256}.` : ''}`;
}
async function optionalJson(root: string, path: string): Promise<any | undefined> {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, path))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
/** Original confirmation reference binds selection even when its source fields are deleted. */
export async function readFrameSelection(root: string, state: IntakeSnapshot | RunSnapshot, explicit?: boolean): Promise<RenderFrameSelection | undefined> {
  if (explicit !== undefined && typeof explicit !== 'boolean') throw new Error('Render-frame selection must be boolean.');
  const origin = await optionalJson(root, 'intake-origin.json');
  let selection: RenderFrameSelection | undefined;
  if (state.formatVersion === 'intake-1') {
    selection = state.renderFrames; validateFrameSelection(selection);
    if (!isDeepStrictEqual(selection, origin?.renderFrames)) throw new Error('Original intake render-frame selection changed.');
  } else {
    const decision = state.run.humanDecisions.find(row => row.decisionId.startsWith('requirements-v'));
    const ref = decision?.evidence.find(ref => ref.artifactId === 'user-confirmation');
    const receipt = ref ? await optionalJson(root, ref.location) : undefined;
    selection = receipt?.renderFrames; validateFrameSelection(selection);
    if (!isDeepStrictEqual(selection, origin?.renderFrames) || (selection ? ref?.version !== frameConfirmationVersion(receipt.revision, selection)
      : ref?.version.includes('-frames-'))) throw new Error('Original confirmed render-frame selection/source changed.');
    if (selection && (!decision || receipt.confirmed !== true || receipt.runId !== state.run.runId || receipt.actorId !== decision.actorId || receipt.at !== decision.decidedAt
      || !Number.isSafeInteger(receipt.revision) || receipt.revision < 1 || !isDeepStrictEqual(receipt.draft, decision.evidence[0]))) throw new Error('Original render-frame confirmation identity changed.');
  }
  if (explicit !== undefined && explicit !== !!selection) throw new Error('Cannot replace the original render-frame selection.');
  const created = state.events[0]?.reason;
  if ((selection || created?.includes(' Render-frame observer: ')) && created !== frameIntakeReason(selection)) throw new Error('Original created render-frame selection changed.');
  if (!selection) return undefined;
  if (!origin || origin.runId !== state.run.runId || typeof origin.brief !== 'string' || origin.draftMode !== undefined
    || Object.keys(origin).some(key => !['runId', 'brief', 'renderFrames'].includes(key))) throw new Error('Original render-frame intake identity changed.');
  const execution = await optionalJson(root, 'execution.json');
  if (execution) {
    const refs = execution.availableArtifacts?.filter((ref: ArtifactReference) => ref.artifactId === observer.artifactId);
    if (!Array.isArray(refs) || refs.length !== 1 || !isDeepStrictEqual(refs[0], observer)) throw new Error('Original available render-frame observer changed.');
    const bytes = await regularFile(root, `${observer.location}/_cosmos/render-frame-observer.ts`);
    if (validationHash(bytes) !== selection.observerSha256) throw new Error('Original render-frame observer capture bytes changed.');
  }
  return structuredClone(selection);
}
