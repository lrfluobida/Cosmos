import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { realpath } from 'node:fs/promises';
import { id, regularFile, within } from '../artifacts/paths.ts';
import type { ArtifactReference } from '../contracts/types.ts';
import { sameValue } from '../contracts/validation.ts';
import type { OrdinaryExecution } from './entrypoint-design-revision.ts';
import type { ContentSignature } from './recovery/task-journal.ts';
import type { ConfirmedRequirementsSource } from './confirmed-requirements-source.ts';
import type { PublicValidationAuthorization } from './public-validation-funding-types.ts';
import { ordinaryDraftSha256 } from './ordinary-profile-source.ts';

import { APPROVED_DESIGN } from './approved-design-source.ts';
import { SUPPLIED_DESIGN } from './supplied-design.ts';

const reviewId = 'ordinary-design-draft-review';
export function validateDesignDraftReview(ref: ArtifactReference, requirements?: ConfirmedRequirementsSource) {
  if (!requirements || !ref || ![reviewId, SUPPLIED_DESIGN, APPROVED_DESIGN].includes(ref.artifactId) || typeof ref.version !== 'string' || !/^[a-f0-9]{64}$/.test(ref.version)
    || typeof ref.location !== 'string' || !isAbsolute(ref.location) || resolve(ref.location) !== ref.location
    || !sameValue(Object.keys(ref).sort(), ['artifactId', 'location', 'version'])) throw new Error('Invalid ordinary design draft review reference.');
  if (ref.artifactId !== reviewId) return;
  const directory = dirname(ref.location), name = basename(directory);
  if (basename(ref.location) !== 'review.json' || !name.startsWith('task-') || basename(dirname(directory)) !== 'journal') throw new Error('Select a fixed task journal review.json.');
  return { root: dirname(dirname(directory)), taskId: id(name.slice(5)) };
}
export async function selectDesignDraftReview(location: string, requirements: ConfirmedRequirementsSource) {
  const path = resolve(location);
  const ref = { artifactId: reviewId, location: path, version: ordinaryDraftSha256(await regularFile(dirname(path), basename(path))) };
  validateDesignDraftReview(ref, requirements);
  return ref;
}
export function fundingDesignDraftReview(payload: PublicValidationAuthorization) {
  const refs = payload.sourceRefs.filter(ref => [reviewId, SUPPLIED_DESIGN, APPROVED_DESIGN].includes(ref.artifactId));
  if (!refs.length) return undefined;
  if (refs.length !== 1) throw new Error('Select exactly one supplied design or reviewed draft.');
  validateDesignDraftReview(refs[0], payload.requirementsSource);
  return refs[0];
}

/** Authenticate an old rejected capture without acquiring its controller or funding authority. */
export async function readReviewedDesignDraft(ref: ArtifactReference, requirements: ConfirmedRequirementsSource, target: { root: string; runId: string; ledgerId: string }) {
  const journal = validateDesignDraftReview(ref, requirements);
  if (!journal) throw new Error('Historical draft requires its independent review.');
  const { root, taskId } = journal;
  if (within(root, target.root) || within(target.root, root) || await realpath(root) !== root) throw new Error('The reviewed design and new run require separate canonical roots.');
  const { readRunSnapshot } = await import('../cli/control.ts');
  const state = await readRunSnapshot(root);
  if (state.formatVersion !== 1 || state.run.runId === target.runId || state.ledger.ledgerId === target.ledgerId) throw new Error('Reviewed design requires an independent original generation.');
  if (state.requirementsSource) {
    if (!sameValue(state.requirementsSource, requirements)) throw new Error('Reviewed design belongs to a different confirmed requirements source.');
  } else {
    const { readConfirmedRequirementsSource } = await import('./confirmed-requirements-source.ts');
    await readConfirmedRequirementsSource({ root, revision: requirements.revision, specVersion: '1.0', expected: requirements });
  }
  const { authenticateDesign, readDesignRevisionPlan } = await import('./entrypoint-design-revision.ts');
  const execution: OrdinaryExecution = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, 'execution.json')));
  const reader = { read: async () => state };
  const initial = execution.tasks.find(item => item.role === 'design');
  const prepared = initial?.task.taskId === taskId ? initial : (await readDesignRevisionPlan(root, reader, execution))?.task;
  if (!prepared || prepared.task.taskId !== taskId) throw new Error('Review must select a fixed ordinary design task or its revision.');
  const { task, review, receipts } = await authenticateDesign(root, reader, execution, prepared);
  const capture = task.artifacts[0];
  const receipt = await regularFile(dirname(ref.location), 'review.json');
  if (task.state !== 'needs_changes' || capture.artifactId !== 'design' || receipts.review !== ref.version || ordinaryDraftSha256(receipt) !== ref.version
    || !sameValue(JSON.parse(receipt.toString('utf8')).value, review)) throw new Error('Design draft requires the pinned independent changes_requested review.');
  const contents = new Map<string, Buffer>();
  const signature: ContentSignature = review.signature;
  const signed = signature.find(entry => entry.location === capture.location);
  for (const name of ['design.json', 'acceptance-plan.json']) {
    const path = '_cosmos/' + name, bytes = await regularFile(root, capture.location + '/' + path);
    if (!signed?.files.some(file => file.path === path && file.sha256 === ordinaryDraftSha256(bytes))) throw new Error('Reviewed design draft bytes changed.');
    contents.set(name, bytes);
  }
  const advice = { authority: 'independent_model_review', source: ref, runId: state.run.runId, taskId, attemptId: task.attempts[0].attemptId, capture, findings: review.verdict.findings };
  const feedbackBytes = Buffer.from(JSON.stringify(advice, null, 2) + '\n', 'utf8');
  const feedback = { artifactId: 'ordinary-design-draft-feedback', version: ordinaryDraftSha256(feedbackBytes), location: 'design-draft-feedback.json' };
  return { contents, feedback, feedbackBytes };
}
