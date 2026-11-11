import { join } from 'node:path';
import { ArtifactRegistry } from '../artifacts/index.ts';
import { regularFile, snapshot } from '../artifacts/paths.ts';
import type { ArtifactReference, TaskContract } from '../contracts/types.ts';
import { sameValue } from '../contracts/validation.ts';
import type { ExecutionRequirement } from '../roles/execution-input.ts';
import { ART_DRAFT_FILE, type FixedArt } from './art-draft-source.ts';
import { ordinaryDraftSha256 } from './ordinary-profile-source.ts';
import { parseProposal, parseReview, requirePassingEvidence, type PreparedTask } from './orchestrator.ts';
import { requireOriginalTask, requireCorrectionIdentity, TaskJournal, type ContentSignature } from './recovery/task-journal.ts';
import type { RunSnapshot } from './run-types.ts';

export async function fixedArtBytes(root: string, source: FixedArt) {
  const staged = await regularFile(root, ART_DRAFT_FILE);
  if (!staged.equals(source.bytes)) throw new Error('Staged art differs from the fixed review input.');
  return staged;
}

export function fixedArtProvenance(task: TaskContract, source: FixedArt, requirement: ExecutionRequirement) {
  return { kind: 'original-procedural' as const, generator: 'Native art handoff of operator-fixed unreviewed art',
    sourceRefs: [task.attempts.at(-1)!.sessionRef, ...requirement.sources.map(ref => ref.location), source.reference.artifactId + '@' + source.reference.version, source.reference.location] };
}

export async function requireFixedArtCapture(root: string, task: TaskContract, ref: ArtifactReference, source: FixedArt, requirement: ExecutionRequirement) {
  const capture = await new ArtifactRegistry(root, 'registry').getCapture(ref), expected = source.rendered;
  const attempt = task.attempts.at(-1)!;
  const files = await snapshot(join(root, ref.location)), dependencies = task.inputs.filter(ref => !requirement.sources.some(original => sameValue(original, ref)));
  if (attempt.sessionRef !== join(root, 'sessions', attempt.attemptId) || capture.taskId !== task.taskId || !sameValue(capture.dependencies, dependencies)
    || !sameValue(capture.metadata, { kind: 'media', media: expected.media, provenance: fixedArtProvenance(task, source, requirement) })
    || !Array.isArray(capture.files) || capture.files.length !== expected.files.size || new Set(capture.files.map(file => file.destination)).size !== expected.files.size
    || capture.files.some(file => !expected.files.has(file.destination) || !sameValue(file, { source: file.destination, destination: file.destination }))
    || files.size !== expected.files.size || [...files].some(([name, bytes]) => ordinaryDraftSha256(bytes) !== expected.files.get(name))) {
    throw new Error('Capture differs from the fixed art review input or current author provenance.');
  }
  return { capture, files };
}

/** Check the native author, current capture and independent verdict before consuming approved fixed art. */
export async function requireFixedArtApproval(root: string, state: RunSnapshot, source: FixedArt, prepared: PreparedTask, requirement: ExecutionRequirement) {
  const task = state.tasks.find(item => item.taskId === prepared.task.taskId), ref = prepared.expectedArtifacts?.[0];
  if (!task || !ref || prepared.role !== 'art' || !sameValue(task.artifacts, [ref]) || task.state !== 'passed' || task.attempts.length !== 1
    || task.attempts[0].outcome !== 'passed' || task.review.verdict !== 'approved' || !sameValue(state.artDraftSource, source.reference)) throw new Error('Missing approved fixed art task.');
  requireOriginalTask(prepared.task, task);
  await fixedArtBytes(root, source);
  const media = await requireFixedArtCapture(root, task, ref, source, requirement);
  const attempt = task.attempts[0], id = attempt.attemptId;
  const journal = await TaskJournal.open({ artifactRoot: root, journalRoot: join(root, 'journal') }, { formatVersion: 1, runId: state.run.runId,
    ledgerId: state.ledger.ledgerId, originalStartedAt: state.run.originalStartedAt, originalDeadlineAt: state.run.originalDeadlineAt,
    limitMicroCny: state.ledger.limitMicroCny, requirement, prepared, reviewProtocolCorrections: 1, authorProtocolCorrections: 1,
    artifactRoot: root, sessionRoot: join(root, 'sessions') }, true);
  const author = await journal.read<{ proposal: unknown; signature: ContentSignature }>('author', id);
  const captured = await journal.read<{ captured: unknown; signature: ContentSignature }>('capture', id);
  const review = await journal.read<{ verdict: unknown; reviewerId: string; contextId: string; completedAt: string; signature: ContentSignature }>('review', id);
  const started = await journal.read('review-started', id), verified = await journal.read<{ evidence: unknown; signature: ContentSignature }>('verified', id);
  if (!author || !captured || !sameValue(captured.captured, { artifacts: [ref], reviewWorkspace: join(root, 'reviews', task.taskId) })
    || !verified || !review || !sameValue(verified.evidence, task.evidence) || !review.reviewerId || !review.contextId
    || review.reviewerId === task.authorId || review.contextId === task.context.contextId || review.completedAt !== attempt.endedAt
    || !sameValue(started, { reviewerId: review.reviewerId, contextId: review.contextId })) throw new Error('Fixed art review receipts changed.');
  const handoff = parseProposal(JSON.stringify(author.proposal)), verdict = parseReview(JSON.stringify(review.verdict), task);
  if (handoff.remaining.length || handoff.uncertainty.length || verdict.verdict !== 'approved' || !sameValue(task.review, { verdict: verdict.verdict,
    reviewerId: review.reviewerId, contextId: review.contextId, inputVersions: verdict.inputVersions, evidenceIds: verdict.evidenceIds })) throw new Error('Fixed art approval changed.');
  requirePassingEvidence(task, requirement, verdict.evidenceIds);
  await requireCorrectionIdentity(attempt.sessionRef, { taskId: task.taskId, attemptId: id, reviewerId: review.reviewerId, contextId: review.contextId });
  await journal.requireSignature(author.signature, task.inputs);
  const refs = [...task.inputs, ...task.artifacts, ...task.evidence.map(item => item.source)];
  await journal.requireSignature(verified.signature, refs);
  if (!sameValue(captured.signature, verified.signature.filter(item => item.location === ref.location)) || !sameValue(review.signature, verified.signature)) throw new Error('Fixed art review signature changed.');
  return { ...media, task, verified, author: handoff, review };
}
