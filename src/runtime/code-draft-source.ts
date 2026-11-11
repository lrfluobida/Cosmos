import { realpath } from 'node:fs/promises';
import { isAbsolute, posix, resolve } from 'node:path';
import { directory, owns, regularFile, snapshot, within } from '../artifacts/paths.ts';
import { readRunSnapshot } from '../cli/control.ts';
import type { ArtifactReference } from '../contracts/types.ts';
import { sameValue } from '../contracts/validation.ts';
import { checkApprovedArtImport, type ApprovedArt } from './approved-art-source.ts';
import { checkApprovedDesignImport, type ApprovedDesign } from './approved-design-source.ts';
import { APPROVED_ART, fundingArtDraftSource } from './art-draft-source.ts';
import { readReferencedRequirements, type ConfirmedRequirementsSource } from './confirmed-requirements-source.ts';
import { publishMatchingBytes } from './fixed-host-input.ts';
import { ordinaryDraftSha256 } from './ordinary-profile-source.ts';
import type { PublicValidationAuthorization } from './public-validation-funding-types.ts';

export const CODE_DRAFT = 'ordinary-code-draft';
const entry = 'authors/coding/index.html';
const sourceDirectory = 'authors/coding/src';

export function validateCodeDraftSource(ref: ArtifactReference, art?: ArtifactReference) {
  if (art?.artifactId !== APPROVED_ART || ref?.artifactId !== CODE_DRAFT || typeof ref.version !== 'string' || !/^[a-f0-9]{64}$/.test(ref.version)
    || typeof ref.location !== 'string' || !isAbsolute(ref.location) || resolve(ref.location) !== ref.location
    || !sameValue(Object.keys(ref).sort(), ['artifactId', 'location', 'version'])) throw new Error('A code draft requires a pinned source and approved art.');
}

export function fundingCodeDraftSource(payload: PublicValidationAuthorization) {
  const refs = payload.sourceRefs.filter(ref => ref.artifactId === CODE_DRAFT);
  if (!refs.length) return undefined;
  if (refs.length !== 1) throw new Error('Select one code draft.');
  validateCodeDraftSource(refs[0], fundingArtDraftSource(payload));
  return refs[0];
}

async function workingFiles(root: string) {
  const files = new Map<string, Buffer>();
  const html = await regularFile(root, entry).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return undefined; throw error; });
  if (html) files.set(entry, html);
  const sources = await snapshot(resolve(root, sourceDirectory));
  for (const name of [...sources.keys()].sort()) files.set(sourceDirectory + '/' + name, sources.get(name)!);
  return files;
}

/** A selected working tree supplies editable bytes. The new author still owns its complete output. */
export async function selectCodeDraft(location: string, design: ApprovedDesign, art: ApprovedArt, requirements: ConfirmedRequirementsSource,
  target: { root: string; runId?: string; ledgerId?: string }, expected?: ArtifactReference) {
  const root = resolve(location);
  if (within(root, target.root) || within(target.root, root) || await realpath(root) !== root) throw new Error('Code draft requires separate canonical roots.');
  const state = await readRunSnapshot(root);
  if (state.formatVersion !== 1 || state.run.runId === target.runId || state.ledger.ledgerId === target.ledgerId
    || !sameValue(state.requirementsSource, requirements) || !sameValue(state.designDraftReview, design.reference)
    || !sameValue(state.artDraftSource, art.reference)) throw new Error('Code draft requires the same confirmed requirements, approved design and approved art in an independent run.');
  const confirmed = await readReferencedRequirements(root, state);
  const { readPublicFundingBinding } = await import('./public-validation-funding.ts');
  await readPublicFundingBinding(root, state, false);
  await checkApprovedDesignImport(root, design);
  await checkApprovedArtImport(root, art);

  const id = design.selection.tasks.find(item => item.role === 'coding')!.task.taskId;
  const task = state.tasks.find(task => task.taskId === id);
  const inputs = [...confirmed.requirement.sources, ...design.dependencies.map(item => item.ref), design.proof.design, art.proof.media];
  if (!task || !task.attempts.length || task.attempts.some(attempt => attempt.outcome === 'running') || task.artifacts.length
    || task.review.verdict !== 'pending' || !sameValue(task.inputs, inputs) || !sameValue(task.ownership.writePaths, [sourceDirectory, entry])) {
    throw new Error('Select an unfinished ordinary coding task without a capture or review.');
  }
  const files = await workingFiles(root);
  if (!files.size) throw new Error('No editable code draft files.');
  for (const path of files.keys()) owns(task.ownership, path);
  const proof = { runId: state.run.runId, ledgerId: state.ledger.ledgerId, taskId: id, attemptId: task.attempts.at(-1)!.attemptId,
    requirements, design: design.reference, art: art.reference, files: [...files].map(([path, bytes]) => ({ path, sha256: ordinaryDraftSha256(bytes) })) };
  const reference = { artifactId: CODE_DRAFT, version: ordinaryDraftSha256(Buffer.from(JSON.stringify(proof))), location: root };
  if (expected && !sameValue(reference, expected)) throw new Error('Pinned code draft changed.');
  return { reference, files, proof };
}

export async function stageCodeDraft(root: string, files: Map<string, Buffer>, create: boolean) {
  if (create) {
    await directory(root, sourceDirectory);
    for (const [path, bytes] of files) {
      await directory(root, posix.dirname(path));
      await publishMatchingBytes(root, path, bytes);
    }
  }
  const staged = await workingFiles(root);
  if (staged.size !== files.size || [...files].some(([path, bytes]) => !staged.get(path)?.equals(bytes))) throw new Error('Staged code draft changed before the first coding attempt.');
}
