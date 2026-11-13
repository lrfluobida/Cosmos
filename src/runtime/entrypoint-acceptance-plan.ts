import { parseProposal, type AuthorProposal } from './orchestrator.ts';
import { ordinaryCodingOrigin, requirePassedCodingConcerns, type OrdinaryCodingPolicy } from './repair/coding-concerns.ts';
import type { PreparedTask } from './orchestrator.ts';
import { requireApprovedArtCandidate, selectApprovedArt } from './approved-art-source.ts';
import { APPROVED_ART, ART_REVIEW_INPUT, selectArtReviewInput } from './art-draft-source.ts';
import { requireFixedArtApproval } from './fixed-art-review.ts';
import { APPROVED_DESIGN, checkApprovedDesignImport, selectApprovedDesign } from './approved-design-source.ts';
import { join } from 'node:path';
import type { ArtifactReference, EvidenceContract, RequirementContract, TaskContract } from '../contracts/types.ts';
import { sameValue } from '../contracts/validation.ts';
import { checkShape, referenceShape } from '../contracts/structure.ts';
import { ArtifactRegistry } from '../artifacts/index.ts';
import { regularFile } from '../artifacts/paths.ts';
import type { RunController } from './run.ts';
import type { RunSnapshot } from './run-types.ts';
import { TaskJournal, requireOriginalTask } from './recovery/task-journal.ts';
import type { ContentSignature, RecoveryOrigin } from './recovery/task-journal.ts';
import { validateBrowserScenario } from '../roles/requirements.ts';
import type { BrowserScenario, OrdinaryGameDraft } from '../roles/requirements.ts';

export const ORDINARY_PLAN_FILE = '_cosmos/acceptance-plan.json';
export const ORDINARY_PLAN_SOURCE = 'authors/design/acceptance-plan.json';
export interface OrdinaryAcceptancePlan {
  formatVersion: 'ordinary-acceptance-plan/1'; requirement: ArtifactReference; scenario: BrowserScenario;
}
/** Validates author data only. The host separately authenticates its requirement and design sources. */
export function validateOrdinaryAcceptancePlan(value: unknown, draft: OrdinaryGameDraft): asserts value is OrdinaryAcceptancePlan {
  const plan = value as OrdinaryAcceptancePlan, ref = plan?.requirement;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || plan.formatVersion !== 'ordinary-acceptance-plan/1'
    || Object.keys(plan).some(key => !['formatVersion', 'requirement', 'scenario'].includes(key))
    || !ref || typeof ref !== 'object' || Array.isArray(ref) || Object.keys(ref).some(key => !['artifactId', 'version', 'location'].includes(key))
    || checkShape(ref, referenceShape).length) throw new Error('Invalid ordinary acceptance plan envelope.');
  validateBrowserScenario({ acceptance: draft.acceptance, codeProfile: draft.codeProfile, scenario: plan.scenario });
  if (draft.benchmark && !plan.scenario.reopen) throw new Error('Classic ordinary acceptance requires the normal save/reopen plan.');
}

const json = async (root: string, path: string) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, path)));
/** The ordinary seam authenticates existing sources and receipts; it never creates approval or execution authority. */
export function createOrdinaryAcceptanceScope(input: { root: string; controller: Pick<RunController, 'read'>; registry: ArtifactRegistry;
  draft: OrdinaryGameDraft; requirement: RequirementContract; requirementCapture: ArtifactReference; dependencies: ArtifactReference[] }) {
  const { root, controller, registry, requirementCapture } = input, draft = structuredClone(input.draft), requirement = structuredClone(input.requirement);
  const requireCurrent = async () => {
    const { readConfirmedGeneration } = await import('../cli/session.ts');
    const confirmed = await readConfirmedGeneration(root, await controller.read());
    if (!sameValue(confirmed.draft, draft) || !sameValue(confirmed.requirement, requirement)) throw new Error('Ordinary complete confirmation source changed.');
    await registry.getCapture(requirementCapture);
    for (const source of requirement.sources) if (!(await regularFile(root, source.location)).equals(await regularFile(root, `${requirementCapture.location}/_cosmos/${source.artifactId}.json`))) {
      throw new Error('Ordinary captured confirmation bytes changed.');
    }
  };
  const requireRequirement = (plan: OrdinaryAcceptancePlan) => {
    if (!sameValue(plan.requirement, requirementCapture)) throw new Error('Ordinary plan requirement source differs from the fixed capture.');
  };
  const read = async (design: ArtifactReference) => {
    await requireCurrent(); await registry.getCapture(design);
    const plan = await json(root, `${design.location}/${ORDINARY_PLAN_FILE}`);
    validateOrdinaryAcceptancePlan(plan, draft); requireRequirement(plan); return plan;
  };
  const approved = async (design: ArtifactReference, consumer?: TaskContract) => {
    const plan = await read(design), state = await controller.read(), task = state.tasks.find(task => task.artifacts.some(ref => sameValue(ref, design)));
    if (state.designDraftReview?.artifactId === APPROVED_DESIGN) {
      const source = await selectApprovedDesign(state.designDraftReview.location, state.requirementsSource!, { root, runId: state.run.runId, ledgerId: state.ledger.ledgerId }, state.designDraftReview);
      await checkApprovedDesignImport(root, source);
      if (task || !sameValue(design, source.proof.design) || consumer && !consumer.inputs.some(ref => sameValue(ref, design))) throw new Error('Historical design input binding changed.');
      return plan;
    }
    if (!task || task.state !== 'passed' || task.review.verdict !== 'approved' || task.attempts.at(-1)?.outcome !== 'passed'
      || task.review.reviewerId === task.authorId || task.review.contextId === task.context.contextId
      || consumer && (!consumer.inputs.some(ref => sameValue(ref, design)) || !consumer.dependsOn.some(dep => dep.taskId === task.taskId))) throw new Error('Ordinary plan requires its independently approved design dependency.');
    const capture = await registry.getCapture(design), attempt = task.attempts.at(-1)!;
    if (capture.taskId !== task.taskId || !capture.metadata.provenance.sourceRefs.includes(attempt.sessionRef)
      || !sameValue(capture.dependencies, input.dependencies)) throw new Error('Ordinary design capture identity or dependencies changed.');
    const origin = await json(root, `journal/task-${task.taskId}/origin.json`) as RecoveryOrigin;
    if (!sameValue(origin.requirement, requirement)) throw new Error('Ordinary design journal requirement changed.');
    requireOriginalTask(origin.prepared.task, task);
    const journal = await TaskJournal.open({ artifactRoot: root, journalRoot: join(root, 'journal') }, origin, true);
    const verified = await journal.read<{ evidence: EvidenceContract[]; signature: ContentSignature }>('verified', attempt.attemptId);
    const started = await journal.read<{ reviewerId: string; contextId: string }>('review-started', attempt.attemptId);
    const review = await journal.read<{ reviewerId: string; contextId: string; completedAt: string; signature: ContentSignature;
      verdict: { verdict: string; findings: string[]; inputVersions: ArtifactReference[]; evidenceIds: string[] } }>('review', attempt.attemptId);
    if (!verified || !started || !review || !sameValue(verified.evidence, task.evidence)
      || started.reviewerId !== task.review.reviewerId || started.contextId !== task.review.contextId
      || review.reviewerId !== started.reviewerId || review.contextId !== started.contextId || review.completedAt !== attempt.endedAt
      || review.verdict.verdict !== 'approved' || !Array.isArray(review.verdict.findings) || review.verdict.findings.length
      || !sameValue(review.verdict.inputVersions, [...task.inputs, ...task.artifacts]) || !sameValue(review.verdict.inputVersions, task.review.inputVersions)
      || !sameValue(review.verdict.evidenceIds, task.review.evidenceIds)
      || task.acceptanceIds.some(id => !verified.evidence.some(item => item.outcome === 'passed' && item.acceptanceIds.includes(id) && task.review.evidenceIds.includes(item.evidenceId)))) {
      throw new Error('Ordinary design original independent approval receipts are unavailable or changed.');
    }
    const refs = [...task.inputs, ...task.artifacts, ...task.evidence.map(item => item.source)];
    await journal.requireSignature(verified.signature, refs); await journal.requireSignature(review.signature, refs);
    const execution = await json(root, 'execution.json');
    if (execution.ordinaryDesignRevisionPolicy === 'independent-review/2') {
      const { authenticateDesign } = await import('./entrypoint-design-revision.ts');
      await authenticateDesign(root, controller, execution, origin.prepared);
    }
    return plan;
  };
  const bindCandidate = async (task: TaskContract, design: ArtifactReference, candidate: ArtifactReference) => {
    const plan = await approved(design, task), fixed = await registry.getCandidate(candidate);
    if (fixed.taskId !== task.taskId || fixed.authorId !== task.authorId || fixed.contextId !== task.context.contextId
      || !fixed.inputs.some(ref => sameValue(ref, design)) || !fixed.inputs.some(ref => sameValue(ref, requirementCapture))
      || !fixed.files.some(file => file.destination === ORDINARY_PLAN_FILE && sameValue(file.artifactRef, design))
      || !(await regularFile(root, `${candidate.location}/${ORDINARY_PLAN_FILE}`)).equals(await regularFile(root, `${design.location}/${ORDINARY_PLAN_FILE}`))) {
      throw new Error('Ordinary candidate does not consume its fixed approved plan.');
    }
    return { formatVersion: 'ordinary-execution-binding/1' as const, requirement: requirementCapture, design,
      plan: { artifact: design, path: ORDINARY_PLAN_FILE }, candidate, taskId: task.taskId, runId: task.runId, scenario: structuredClone(plan.scenario) };
  };
  return { requireCurrent, requireRequirement, read, approved, bindCandidate };
}

/** Bind the exact concern verdict to the delivered game. Older and clear handoffs retain their ordinary report shape. */
export async function ordinaryCodingDeliveryProof(root: string, state: RunSnapshot, task: TaskContract, requirement: RequirementContract,
  execution: OrdinaryCodingPolicy & { tasks: PreparedTask[] }) {
  if (execution.ordinaryCodingHandoffPolicy === undefined) return {};
  const prepared = execution.tasks.find(item => item.role === 'coding' && item.task.taskId === task.taskId);
  if (!prepared) return {};
  const { ordinaryCodingHandoffPolicy } = ordinaryCodingOrigin(execution, prepared);
  const origin = await json(root, `journal/task-${encodeURIComponent(task.taskId)}/origin.json`) as RecoveryOrigin;
  if (ordinaryCodingHandoffPolicy !== origin.ordinaryCodingHandoffPolicy) throw new Error('Original ordinary coding handoff policy changed.');
  if (!ordinaryCodingHandoffPolicy) return {};
  if (origin.runId !== state.run.runId || origin.ledgerId !== state.ledger.ledgerId || !sameValue(origin.requirement, requirement)
    || origin.prepared.task.taskId !== task.taskId || !sameValue(origin.prepared.expectedArtifacts, task.artifacts)
    || !sameValue(prepared.expectedArtifacts, task.artifacts)) throw new Error('Ordinary coding origin or candidate changed.');
  requireOriginalTask(origin.prepared.task, task);
  const journal = await TaskJournal.open({ artifactRoot: root, journalRoot: join(root, 'journal') }, origin, true);
  const attempt = task.attempts.at(-1)!, author = await journal.read<{ proposal: AuthorProposal }>('author', attempt.attemptId);
  const proposal = parseProposal(JSON.stringify(author?.proposal));
  if (proposal.remaining.length) throw new Error('Passed ordinary coding candidate has unfinished work.');
  if (!proposal.uncertainty.length) {
    if (await journal.read('coding-concerns', attempt.attemptId)) throw new Error('Original ordinary coding concerns changed.');
    return {};
  }
  return { codingConcernReviewSha256: await requirePassedCodingConcerns(task, requirement, journal, origin.prepared.workspace, proposal, false, root) };
}

/** Completed delivery reads use the same approval gate without reopening a controller or writing a receipt. */
export async function verifyOrdinaryDelivery(root: string, state: RunSnapshot, task: TaskContract, candidate: ArtifactReference, binding: unknown, historicalDesign?: unknown, historicalArt?: unknown) {
  const { readConfirmedGeneration } = await import('../cli/session.ts'), confirmed = await readConfirmedGeneration(root, state);
  if (!confirmed.draft.ordinaryProfile) throw new Error('Ordinary delivery lacks its original profile.');
  const requirementCapture = task.inputs.find(ref => ref.artifactId === 'requirement-bundle'), design = task.inputs.find(ref => ref.artifactId === 'design');
  const author = design && state.tasks.find(item => item.artifacts.some(ref => sameValue(ref, design)));
  const historical = state.designDraftReview?.artifactId === APPROVED_DESIGN ? await selectApprovedDesign(state.designDraftReview.location, state.requirementsSource!, {
    root, runId: state.run.runId, ledgerId: state.ledger.ledgerId }, state.designDraftReview) : undefined;
  if (!sameValue(historicalDesign, historical?.proof)) throw new Error('Delivery historical design proof changed.');
  if (!requirementCapture || !design || (!historical && !author)) throw new Error('Ordinary delivery is missing its original plan sources.');
  let dependencies = author?.inputs.filter(ref => !confirmed.requirement.sources.some(source => sameValue(source, ref))) ?? [];
  const execution = await json(root, 'execution.json');
  let mediaIds: string[] = [];
  if (state.artDraftSource?.artifactId === APPROVED_ART) {
    if (!historical) throw new Error('Historical art requires the original approved design.');
    const ref = state.artDraftSource;
    const media = await selectApprovedArt(ref.location, historical, state.requirementsSource!, { root, runId: state.run.runId, ledgerId: state.ledger.ledgerId }, ref);
    if (!sameValue(historicalArt, media.proof)) throw new Error('Delivery historical art proof changed.');
    await requireApprovedArtCandidate(root, media, task, candidate);
    mediaIds = media.acceptanceIds;
  } else if (historicalArt !== undefined) throw new Error('Unexpected historical art proof.');
  if (state.artDraftSource?.artifactId === ART_REVIEW_INPUT) {
    const ref = state.artDraftSource, prepared = execution.tasks.find((item: PreparedTask) => item.role === 'art');
    if (!historical || !prepared || !task.inputs.some(input => sameValue(input, prepared.expectedArtifacts?.[0]))) throw new Error('Delivery fixed art binding changed.');
    const source = await selectArtReviewInput(ref.location, historical, state.requirementsSource!, { root, runId: state.run.runId, ledgerId: state.ledger.ledgerId }, ref);
    await requireFixedArtApproval(root, state, source, prepared, confirmed.requirement);
  }
  if (execution.ordinaryDesignRevisionPolicy !== undefined) {
    const { readDesignSelection } = await import('./entrypoint-design-revision.ts');
    const selected = await readDesignSelection(root, { read: async () => structuredClone(state) }, execution);
    if (!sameValue(selected.design, design)) throw new Error('Ordinary delivery differs from its authenticated design selection.');
    // The ordinary host captures design against its original available capture set.
    dependencies = execution.availableArtifacts.filter((ref: ArtifactReference) => !confirmed.requirement.sources.some(source => sameValue(source, ref)));
  }
  const scope = createOrdinaryAcceptanceScope({ root, controller: { read: async () => structuredClone(state) }, registry: new ArtifactRegistry(root, 'registry'),
    requirement: confirmed.requirement, draft: confirmed.draft, requirementCapture,
    dependencies });
  const expected = { ...await scope.bindCandidate(task, design, candidate), ...await ordinaryCodingDeliveryProof(root, state, task, confirmed.requirement, execution) };
  if (!sameValue(binding, expected)) throw new Error('Ordinary delivery report plan binding changed.');
  return [...(historical?.acceptanceIds ?? []), ...mediaIds];
}
