import { realpath } from 'node:fs/promises';
import { posix, resolve } from 'node:path';
import { ArtifactRegistry } from '../artifacts/index.ts';
import { directory, regularFile, snapshot, within } from '../artifacts/paths.ts';
import { readRunSnapshot } from '../cli/control.ts';
import type { ArtifactReference, TaskContract } from '../contracts/types.ts';
import { sameValue } from '../contracts/validation.ts';
import { MEDIA_ACCEPTANCE_ID } from '../roles/requirements.ts';
import { checkApprovedDesignImport, type ApprovedDesign } from './approved-design-source.ts';
import { APPROVED_ART, ART_REVIEW_INPUT, readPinnedArtDraft, selectArtReviewInput } from './art-draft-source.ts';
import { readReferencedRequirements, type ConfirmedRequirementsSource } from './confirmed-requirements-source.ts';
import { requireFixedArtApproval } from './fixed-art-review.ts';
import { publishMatchingBytes } from './fixed-host-input.ts';
import { ordinaryDraftSha256 } from './ordinary-profile-source.ts';
import type { PreparedTask } from './orchestrator.ts';

type Target = { root: string; runId?: string; ledgerId?: string };

/** Reopen the original fixed handoff and independent verdict without acquiring the source run or its ledger. */
export async function selectApprovedArt(location: string, design: ApprovedDesign, requirements: ConfirmedRequirementsSource,
  target: Target, expected?: ArtifactReference) {
  const root = resolve(location);
  if (within(root, target.root) || within(target.root, root) || await realpath(root) !== root) throw new Error('Historical art requires separate canonical run roots.');
  const state = await readRunSnapshot(root), fixed = state.artDraftSource;
  if (state.formatVersion !== 1 || fixed?.artifactId !== ART_REVIEW_INPUT || !sameValue(state.requirementsSource, requirements)
    || !sameValue(state.designDraftReview, design.reference) || state.run.runId === target.runId || state.ledger.ledgerId === target.ledgerId
    || state.run.runId === design.proof.sourceRunId || state.ledger.ledgerId === design.proof.sourceLedgerId) throw new Error('Historical art requires the same confirmation, approved design and original fixed art run.');
  const confirmed = await readReferencedRequirements(root, state);
  const { readPublicFundingBinding } = await import('./public-validation-funding.ts');
  await readPublicFundingBinding(root, state, false);
  await checkApprovedDesignImport(root, design);
  const input = await selectArtReviewInput(fixed.location, design, requirements, target, fixed);
  const execution = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, 'execution.json')));
  const prepared: PreparedTask | undefined = execution.tasks.find((item: PreparedTask) => item.role === 'art');
  const original = design.selection.tasks.find(item => item.role === 'art');
  const refs = [...confirmed.requirement.sources, ...design.dependencies.map(item => item.ref), design.proof.design];
  if (!prepared || !original || prepared.task.taskId !== original.task.taskId || prepared.workspace !== root || prepared.task.dependsOn.length
    || !sameValue(prepared.task.acceptanceIds, [MEDIA_ACCEPTANCE_ID]) || !sameValue(prepared.task.inputs, refs)
    || !sameValue(prepared.expectedArtifacts, original.expectedArtifacts) || !sameValue(execution.requirement, confirmed.requirement)
    || execution.capability !== 'ordinary-design-execution/1') throw new Error('Historical art approval inputs changed.');
  const { capture, files, task, verified, author, review } = await requireFixedArtApproval(root, state, input, prepared, confirmed.requirement);
  const media = task.artifacts[0], manifestPath = posix.join(posix.dirname(media.location), 'capture.json');
  const manifest = await regularFile(root, manifestPath);
  if (!sameValue(capture, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifest)))) throw new Error('Historical media capture changed during authentication.');
  const proof = { sourceRunId: state.run.runId, sourceLedgerId: state.ledger.ledgerId, sourceTaskId: task.taskId, sourceAttemptId: task.attempts[0].attemptId,
    authorId: task.authorId, approval: task.review, confirmation: requirements, approvedDesign: design.reference, fixedInput: fixed, media,
    captureSha256: ordinaryDraftSha256(manifest), receiptsSha256: ordinaryDraftSha256(Buffer.from(JSON.stringify({ author, verified, review }))) };
  const reference = { artifactId: APPROVED_ART, location: root, version: ordinaryDraftSha256(Buffer.from(JSON.stringify(proof))) };
  if (expected && !sameValue(reference, expected)) throw new Error('Pinned historical art approval changed.');
  return { reference, proof: { ...proof, source: reference }, files, manifest, manifestPath, acceptanceIds: task.acceptanceIds,
    origins: [...input.origins, { runId: state.run.runId, ledgerId: state.ledger.ledgerId }] };
}
export type ApprovedArt = Awaited<ReturnType<typeof selectApprovedArt>>;

export async function readPinnedArtSource(ref: ArtifactReference, design: ApprovedDesign, requirements: ConfirmedRequirementsSource, target: Target) {
  return ref.artifactId === APPROVED_ART ? selectApprovedArt(ref.location, design, requirements, target, ref) : readPinnedArtDraft(ref, design, requirements, target);
}

export async function checkApprovedArtImport(root: string, source: ApprovedArt, create = false) {
  const { media } = source.proof;
  if (create) {
    for (const [path, bytes] of source.files) {
      await directory(root, posix.join(media.location, posix.dirname(path)));
      await publishMatchingBytes(root, posix.join(media.location, path), bytes);
    }
    await publishMatchingBytes(root, source.manifestPath, source.manifest);
  }
  const local = await snapshot(resolve(root, media.location));
  if (!(await regularFile(root, source.manifestPath)).equals(source.manifest) || local.size !== source.files.size
    || [...source.files].some(([name, bytes]) => !local.get(name)?.equals(bytes))) throw new Error('Imported media capture changed.');
}

export async function requireApprovedArtCandidate(root: string, source: ApprovedArt, task: TaskContract, candidate: ArtifactReference) {
  await checkApprovedArtImport(root, source);
  const media = source.proof.media, fixed = await new ArtifactRegistry(root, 'registry').getCandidate(candidate);
  const paths = fixed.files.filter(file => sameValue(file.artifactRef, media)).map(file => file.destination);
  if (!task.inputs.some(ref => sameValue(ref, media)) || !fixed.inputs.some(ref => sameValue(ref, media))
    || !sameValue(paths.sort(), [...source.files.keys()].sort())) throw new Error('Candidate does not consume the approved historical media capture.');
  for (const [name, bytes] of source.files) {
    if (!(await regularFile(root, candidate.location + '/' + name)).equals(bytes)) throw new Error('Candidate historical media bytes changed.');
  }
}
