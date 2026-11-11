import { realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { regularFile, within } from '../artifacts/paths.ts';
import { readRunSnapshot } from '../cli/control.ts';
import type { ArtifactReference } from '../contracts/types.ts';
import { sameValue } from '../contracts/validation.ts';
import { synthesizeWav } from '../media/audio.ts';
import { renderCharacter } from '../media/vector.ts';
import { APPROVED_DESIGN, checkApprovedDesignImport, type ApprovedDesign } from './approved-design-source.ts';
import { readReferencedRequirements, type ConfirmedRequirementsSource } from './confirmed-requirements-source.ts';
import { validateDeclaredMedia } from './entrypoint-media.ts';
import { ordinaryDraftSha256 } from './ordinary-profile-source.ts';
import { fundingDesignDraftReview } from './reviewed-design-draft.ts';
import type { PublicValidationAuthorization } from './public-validation-funding-types.ts';

export const ART_DRAFT = 'ordinary-art-draft';
export const ART_DRAFT_SELECTION = 'ordinary-art-draft-selection';
export const ART_DRAFT_FILE = 'authors/art/media.json';
export function validateArtDraftSource(ref: ArtifactReference, design?: ArtifactReference) {
  if (design?.artifactId !== APPROVED_DESIGN || !ref || ![ART_DRAFT, ART_DRAFT_SELECTION].includes(ref.artifactId) || typeof ref.version !== 'string' || !/^[a-f0-9]{64}$/.test(ref.version)
    || typeof ref.location !== 'string' || !isAbsolute(ref.location) || resolve(ref.location) !== ref.location
    || !sameValue(Object.keys(ref).sort(), ['artifactId', 'location', 'version'])) throw new Error('An art draft requires a pinned source and approved design.');
}
export function fundingArtDraftSource(payload: PublicValidationAuthorization) {
  const refs = payload.sourceRefs.filter(ref => [ART_DRAFT, ART_DRAFT_SELECTION].includes(ref.artifactId));
  if (!refs.length) return undefined;
  if (refs.length !== 1 || payload.formatVersion !== 'public-validation-authorization/2') throw new Error('Select exactly one art draft with the original confirmation.');
  validateArtDraftSource(refs[0], fundingDesignDraftReview(payload));
  return refs[0];
}

const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
type DraftTarget = { root: string; runId?: string; ledgerId?: string };

function draftRoster(declared: { id: string }[], present: { id: string }[]) {
  const existing = present.map(item => item.id);
  return { existing, missing: declared.map(item => item.id).filter(id => !existing.includes(id)) };
}

async function checkAncestors(parent: ArtifactReference | undefined, seen: string[], approved: ApprovedDesign,
  requirements: ConfirmedRequirementsSource): Promise<void> {
  while (parent) {
    if (parent.artifactId === ART_DRAFT_SELECTION) {
      // A selection has two source runs. Authenticate the pinned manifest before following either branch.
      await selectArtDraftSelection(parent.location, approved, requirements, { root: seen.at(-1)! }, parent, seen);
      return;
    }
    const path = parent.location;
    if (seen.some(visited => within(visited, path) || within(path, visited))) throw new Error('Cyclic art draft sources.');
    seen.push(path);
    const ancestor = await readRunSnapshot(path);
    if (!sameValue(ancestor.designDraftReview, approved.reference) || !sameValue(ancestor.requirementsSource, requirements)) throw new Error('Art draft ancestor design changed.');
    parent = ancestor.artDraftSource;
  }
}

/** A historical working file is an operator-selected draft, regardless of who last edited it. */
export async function selectArtDraft(location: string, approved: ApprovedDesign, requirements: ConfirmedRequirementsSource,
  target: DraftTarget, expected?: ArtifactReference, ancestors: string[] = []) {
  const root = resolve(location);
  if (ancestors.some(path => within(path, root) || within(root, path))) throw new Error('Cyclic art draft sources.');
  if (within(root, target.root) || within(target.root, root) || await realpath(root) !== root) throw new Error('Art draft and target require separate canonical roots.');
  const state = await readRunSnapshot(root);
  if (state.formatVersion !== 1 || state.run.runId === target.runId || state.ledger.ledgerId === target.ledgerId
    || state.run.runId === approved.proof.sourceRunId || state.ledger.ledgerId === approved.proof.sourceLedgerId
    || !sameValue(state.requirementsSource, requirements) || !sameValue(state.designDraftReview, approved.reference)) throw new Error('Art draft requires the same approved design and confirmation in an independent source run.');
  await readReferencedRequirements(root, state);
  const { readPublicFundingBinding } = await import('./public-validation-funding.ts');
  await readPublicFundingBinding(root, state, false);
  await checkApprovedDesignImport(root, approved);
  const artId = approved.selection.tasks.find(item => item.role === 'art')!.task.taskId;
  const art = state.tasks.find(task => task.taskId === artId);
  if (!art || !art.attempts.length || art.attempts.some(attempt => attempt.outcome === 'running') || art.artifacts.length || art.review.verdict !== 'pending'
    || !sameValue(art.ownership.writePaths, [ART_DRAFT_FILE]) || !art.inputs.some(ref => sameValue(ref, approved.proof.design))) throw new Error('Select an unfinished art working file without a capture or review.');

  await checkAncestors(state.artDraftSource, [...ancestors, target.root, root], approved, requirements);
  const bytes = await regularFile(root, ART_DRAFT_FILE), design = decode(approved.files.get('_cosmos/design.json')!);
  const spec = validateDeclaredMedia(decode(bytes), design, 'draft-subset');
  for (const character of spec.characters) renderCharacter(character);
  for (const clip of spec.audio) if (synthesizeWav(clip).manifest.peak <= 0.001) throw new Error('Art draft audio is silent.');
  const proof = { runId: state.run.runId, ledgerId: state.ledger.ledgerId, taskId: artId, design: approved.reference, requirements,
    ...(state.artDraftSource ? { previous: state.artDraftSource } : {}), sha256: ordinaryDraftSha256(bytes) };
  const reference = { artifactId: ART_DRAFT, version: ordinaryDraftSha256(Buffer.from(JSON.stringify(proof))), location: root };
  if (expected && !sameValue(reference, expected)) throw new Error('Pinned art draft source changed.');
  return { reference, bytes, proof, spec, origins: [{ runId: proof.runId, ledgerId: proof.ledgerId }],
    roster: { characters: draftRoster(design.characters, spec.characters), audio: draftRoster(design.audio, spec.audio) } };
}

interface DraftSelection {
  formatVersion: 'ordinary-art-draft-selection/1';
  base: ArtifactReference;
  overlay: ArtifactReference;
  characterIds: string[];
  audioIds: string[];
}

function selectedItems<T extends { id: string }>(base: T[], overlay: T[], ids: string[]) {
  const items = new Map(base.map(item => [item.id, item]));
  for (const id of ids) {
    const item = overlay.find(candidate => candidate.id === id);
    if (!item) throw new Error('Selected media ID is missing from its overlay: ' + id);
    items.set(id, item);
  }
  return [...items.values()];
}

/** Only whole validated items can cross the two working-file boundaries. */
export async function selectArtDraftSelection(location: string, approved: ApprovedDesign, requirements: ConfirmedRequirementsSource,
  target: DraftTarget, expected?: ArtifactReference, ancestors: string[] = []) {
  const path = resolve(location);
  if (within(target.root, path)) throw new Error('Art selection manifest must be outside the target run.');
  const manifestBytes = await regularFile(dirname(path), basename(path));
  const manifest: DraftSelection = decode(manifestBytes);
  if (manifest?.formatVersion !== 'ordinary-art-draft-selection/1'
    || !sameValue(Object.keys(manifest).sort(), ['audioIds', 'base', 'characterIds', 'formatVersion', 'overlay'])
    || ![manifest.characterIds, manifest.audioIds].every(ids => Array.isArray(ids) && ids.every(id => typeof id === 'string'))
    || !manifest.characterIds.length && !manifest.audioIds.length) throw new Error('Invalid art draft selection manifest.');
  const selectedIds = [...manifest.characterIds, ...manifest.audioIds];
  if (new Set(selectedIds).size !== selectedIds.length) throw new Error('Duplicate selected media ID.');
  for (const ref of [manifest.base, manifest.overlay]) {
    validateArtDraftSource(ref, approved.reference);
    if (ref.artifactId !== ART_DRAFT) throw new Error('Select pinned working files for the base and overlay.');
  }
  if (within(manifest.base.location, manifest.overlay.location) || within(manifest.overlay.location, manifest.base.location)) throw new Error('Select separate base and overlay source runs.');
  const base = await selectArtDraft(manifest.base.location, approved, requirements, target, manifest.base, ancestors);
  const overlay = await selectArtDraft(manifest.overlay.location, approved, requirements, target, manifest.overlay, ancestors);
  if (base.proof.runId === overlay.proof.runId || base.proof.ledgerId === overlay.proof.ledgerId) throw new Error('Select independent base and overlay runs and ledgers.');
  const characters = selectedItems(base.spec.characters, overlay.spec.characters, manifest.characterIds);
  const audio = selectedItems(base.spec.audio, overlay.spec.audio, manifest.audioIds);
  const batches = [];
  for (let i = 0; i < Math.max(characters.length, audio.length); i += 16) {
    batches.push({ characters: characters.slice(i, i + 16), audio: audio.slice(i, i + 16) });
  }
  const media = batches.length === 1 ? batches[0] : { formatVersion: 'batched-media/1', batches };
  const design = decode(approved.files.get('_cosmos/design.json')!);
  validateDeclaredMedia(media, design, 'draft-subset');
  const bytes = Buffer.from(JSON.stringify(media, null, 2) + '\n');
  const proof = { manifestSha256: ordinaryDraftSha256(manifestBytes), base: base.reference, overlay: overlay.reference,
    characterIds: manifest.characterIds, audioIds: manifest.audioIds, sha256: ordinaryDraftSha256(bytes) };
  const reference = { artifactId: ART_DRAFT_SELECTION, version: ordinaryDraftSha256(Buffer.from(JSON.stringify(proof))), location: path };
  if (expected && !sameValue(reference, expected)) throw new Error('Pinned art draft selection changed.');
  return { reference, bytes, proof, origins: [...base.origins, ...overlay.origins],
    roster: { characters: draftRoster(design.characters, characters), audio: draftRoster(design.audio, audio) } };
}

export function readPinnedArtDraft(ref: ArtifactReference, approved: ApprovedDesign, requirements: ConfirmedRequirementsSource, target: DraftTarget) {
  validateArtDraftSource(ref, approved.reference);
  const select = ref.artifactId === ART_DRAFT_SELECTION ? selectArtDraftSelection : selectArtDraft;
  return select(ref.location, approved, requirements, target, ref);
}
