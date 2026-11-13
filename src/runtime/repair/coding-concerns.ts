import { ArtifactRegistry } from '../../artifacts/index.ts';
import { createHash } from 'node:crypto';
import { sameValue } from '../../contracts/validation.ts';
import type { ArtifactReference, EvidenceContract, TaskContract } from '../../contracts/types.ts';
import { decodeModelJson } from '../../roles/protocol.ts';
import type { ExecutionRequirement } from '../../roles/execution-input.ts';
import { parseProposal, parseReview, requirePassingEvidence, type AuthorProposal, type PreparedTask } from '../orchestrator.ts';
import { requireCorrectionIdentity, type CapturedTask } from '../recovery/task-journal.ts';
import { RecoveryBlocked } from '../recovery/task-journal.ts';
import type { ContentSignature, TaskJournal } from '../recovery/task-journal.ts';
import { recoverAuthorProposal } from './author-protocol.ts';
import type { AuthorCorrectionStarted, AuthorScopeClarificationStarted } from './author-protocol.ts';

export const ORDINARY_CODING_HANDOFF = 'host-evidence/1' as const;
export interface OrdinaryCodingPolicy { ordinaryCodingHandoffPolicy?: typeof ORDINARY_CODING_HANDOFF }

/** Only the original game candidate can use this policy. Repair and window grants keep their own origins. */
export function ordinaryCodingOrigin(execution: OrdinaryCodingPolicy & { tasks: PreparedTask[] }, item: PreparedTask): OrdinaryCodingPolicy {
  if (execution.ordinaryCodingHandoffPolicy === undefined || item.role !== 'coding') return {};
  if (execution.ordinaryCodingHandoffPolicy !== ORDINARY_CODING_HANDOFF) throw new RecoveryBlocked('Unknown ordinary coding handoff policy.');
  return execution.tasks.some(source => source.role === 'coding' && source.task.taskId === item.task.taskId && sameValue(source.expectedArtifacts, item.expectedArtifacts))
    ? { ordinaryCodingHandoffPolicy: ORDINARY_CODING_HANDOFF } : {};
}

export interface CodingConcernReview {
  taskId: string; attemptId: string; authorId: string; contextId: string;
  originalProposal: AuthorProposal; originalProposalSha256: string;
  proposal: AuthorProposal; proposalSha256: string;
  capturedAt: string;
  concerns: { concernId: string; text: string; source: 'original' | 'handoff'; index: number }[];
  signature: ContentSignature;
}
export interface ConcernResolution {
  concernId: string; concernText: string; status: 'resolved' | 'unresolved'; basis: 'fixed_input' | 'host_evidence';
  rationale: string; acceptanceIds: string[]; inputVersions: ArtifactReference[]; evidenceIds: string[]; evidenceRefs: ArtifactReference[];
}
export interface ReviewProposal {
  verdict: 'approved' | 'changes_requested'; inputVersions: ArtifactReference[]; evidenceIds: string[]; findings: string[];
  concernResolutions?: ConcernResolution[];
}
const hash = (value: AuthorProposal) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const references = (task: TaskContract, requirement: ExecutionRequirement) => [...task.inputs, ...task.artifacts, ...task.context.interfaces, ...requirement.sources];

/** Ordinary verification adds the launcher and dist to the candidate. The manifest enumerates the files captured before that build. */
export async function codingCaptureSignature(journal: TaskJournal, refs: ArtifactReference[], candidate: ArtifactReference, root: string) {
  const manifest = await new ArtifactRegistry(root, 'registry').getCandidate(candidate);
  const paths = new Set(manifest.files.map(file => file.destination));
  const signature = await journal.signature(refs), output = signature.find(row => row.location === candidate.location);
  if (!output || !paths.size || paths.size !== manifest.files.length) throw new RecoveryBlocked('Ordinary coding candidate lacks its original source manifest.');
  output.files = output.files.filter(file => paths.has(file.path));
  if (output.files.length !== paths.size) throw new RecoveryBlocked('Ordinary coding candidate lost a captured source file.');
  return signature;
}

/** Preserve every structured original concern, including concerns moved to summary by the one scope follow-up. */
export async function codingConcernPacket(options: {
  task: TaskContract; proposal: AuthorProposal; requirement: ExecutionRequirement; journal: TaskJournal;
  workspace: string; parseProposal: (text: string) => AuthorProposal; allowScope: boolean; ordinaryRoot?: string; reuse?: boolean;
}): Promise<CodingConcernReview> {
  const { task, proposal, journal } = options, attemptId = task.attempts.at(-1)!.attemptId;
  const captured = await journal.read<{ capturedAt?: string }>('capture', attemptId), capturedAt = captured?.capturedAt;
  if (typeof capturedAt !== 'string' || !Number.isFinite(Date.parse(capturedAt)) || new Date(capturedAt).toISOString() !== capturedAt
    || Date.parse(capturedAt) < Date.parse(task.attempts.at(-1)!.startedAt) || Date.parse(capturedAt) > Date.now()) throw new RecoveryBlocked('Coding concerns require the original completed capture time.');
  let original = proposal;
  const started = await journal.read<AuthorCorrectionStarted | AuthorScopeClarificationStarted>('author-correction-started', attemptId);
  if (started) {
    const recovered = await recoverAuthorProposal({ journal, task, workspace: options.workspace, parse: options.parseProposal, allowCodingScope: options.allowScope });
    if (!recovered || !sameValue(recovered.proposal, proposal)) throw new RecoveryBlocked('Coding concern source does not match its original scope response.');
    if (started.kind === 'coding_scope') original = started.originalProposal;
  }
  const concerns: CodingConcernReview['concerns'] = original.uncertainty.map((text, index) => ({ concernId: `coding-concern-${index + 1}`, text, source: 'original', index }));
  proposal.uncertainty.forEach((text, index) => {
    if (!original.uncertainty.includes(text)) concerns.push({ concernId: `coding-concern-${concerns.length + 1}`, text, source: 'handoff', index });
  });
  const expected: CodingConcernReview = { taskId: task.taskId, attemptId, authorId: task.authorId, contextId: task.context.contextId,
    originalProposal: original, originalProposalSha256: hash(original), proposal, proposalSha256: hash(proposal), concerns, capturedAt,
    signature: options.ordinaryRoot ? await codingCaptureSignature(journal, [...references(task, options.requirement), {
      ...task.artifacts[0], location: task.artifacts[0].location.replace(/\/project$/, '/candidate.json') }], task.artifacts[0], options.ordinaryRoot)
      : await journal.signature(references(task, options.requirement)) };
  const stored = await journal.read<CodingConcernReview>('coding-concerns', attemptId);
  if (stored) {
    if (!sameValue(stored, expected)) throw new RecoveryBlocked('Coding concern receipt changed from the original proposal, identity or fixed versions.');
    return stored;
  }
  if (options.reuse) throw new RecoveryBlocked('Passed coding task has no durable original concern receipt.');
  await journal.write('coding-concerns', attemptId, expected); return expected;
}

export const codingConcernReviewProtocol = 'Return only JSON {verdict:"approved"|"changes_requested",inputVersions:all fixed packet inputs,evidenceIds:recorded host evidence IDs,findings:string[],concernResolutions:[{concernId:string,concernText:exact original concern text,status:"resolved"|"unresolved",basis:"fixed_input"|"host_evidence",rationale:string,acceptanceIds:current fixed acceptance IDs,inputVersions:fixed references,evidenceIds:passed host evidence IDs,evidenceRefs:exact sources of those evidence IDs}]}. Independently address every codingConcernReview concern exactly once, including original concerns moved into summary. For fixed_input, cite current requirements or fixed task inputs and use empty evidenceIds/evidenceRefs. For host_evidence, cite current passing host evidence, its exact sources and all fixed input/output versions. Explain how each cited requirement or actual result resolves that concern. Author assertions and pending future checks are not proof. Preserve genuine unresolved concerns as unresolved and request changes with findings. Approval requires every concern explicitly resolved and findings:[]. Do not change requirements or reinterpret failed host checks.';

export function codingReviewInstructions(policy?: typeof ORDINARY_CODING_HANDOFF) {
  return codingConcernReviewProtocol + (policy ? ' For this ordinary coding candidate, every resolved concern must use host_evidence. Inspect the actual browser observations or screenshots relevant to each concern. Request changes if current evidence does not establish the claimed behavior.' : '');
}

export function requireCodingHostEvidence(task: TaskContract, capturedAt: string): void {
  if (task.evidence.some(e => e.outcome === 'failed')) throw new Error('Coding host checks contain failed evidence.');
  for (const evidence of task.evidence) {
    if (evidence.taskId !== task.taskId || Date.parse(evidence.recordedAt) < Date.parse(capturedAt) || Date.parse(evidence.recordedAt) > Date.now()
      || ![...task.inputs, ...task.artifacts].every(ref => evidence.artifactVersions.some(v => sameValue(v, ref)))) throw new Error('Coding host evidence must belong to the current attempt and fixed versions.');
  }
}

/** Authenticate the same original proposal, fixed outputs, host checks and independent verdict on reuse. */
export async function requirePassedCodingConcerns(task: TaskContract, requirement: ExecutionRequirement, journal: TaskJournal,
  workspace: string, proposal: AuthorProposal, allowScope: boolean, ordinaryRoot?: string) {
  const attempt = task.attempts.at(-1)!, attemptId = attempt.attemptId;
  const packet = await codingConcernPacket({ task, requirement, journal, workspace, proposal, parseProposal, allowScope, ordinaryRoot, reuse: true });
  const review = await journal.read<{ verdict: ReviewProposal; reviewerId: string; contextId: string; completedAt: string; signature: ContentSignature }>('review', attemptId);
  const started = await journal.read<{ reviewerId: string; contextId: string }>('review-started', attemptId);
  if (!review || !started || review.reviewerId !== task.review.reviewerId || review.contextId !== task.review.contextId
    || started.reviewerId !== review.reviewerId || started.contextId !== review.contextId || review.reviewerId === task.authorId || review.contextId === task.context.contextId
    || review.completedAt !== attempt.endedAt || task.handoff.uncertainty.length || task.handoff.remaining.length) throw new RecoveryBlocked('Passed coding task lacks its exact independent concern verdict.');
  try { parseCodingConcernReview(JSON.stringify(review.verdict), task, requirement, packet, parseReview, ordinaryRoot ? ORDINARY_CODING_HANDOFF : undefined); }
  catch { throw new RecoveryBlocked('Passed coding concern verdict cannot be verified.'); }
  const { verdict, inputVersions, evidenceIds } = review.verdict;
  if (verdict !== 'approved' || !sameValue(inputVersions, task.review.inputVersions) || !sameValue(evidenceIds, task.review.evidenceIds)) throw new RecoveryBlocked('Passed coding concern verdict differs from the recorded review.');
  await requireCorrectionIdentity(attempt.sessionRef, { taskId: task.taskId, attemptId, reviewerId: review.reviewerId, contextId: review.contextId });
  const refs = [...task.inputs, ...task.artifacts, ...task.evidence.map(e => e.source)];
  await journal.requireSignature(review.signature, refs);
  if (ordinaryRoot) {
    const author = await journal.read<{ proposal: AuthorProposal; signature: ContentSignature }>('author', attemptId);
    const capture = await journal.read<{ captured: CapturedTask; signature: ContentSignature }>('capture', attemptId);
    const verified = await journal.read<{ evidence: EvidenceContract[]; signature: ContentSignature }>('verified', attemptId);
    if (proposal.remaining.length || !sameValue(author?.proposal, proposal) || !sameValue(capture?.captured.artifacts, task.artifacts)
      || !sameValue(verified?.evidence, task.evidence)) throw new RecoveryBlocked('Passed ordinary coding source, candidate or verification receipt changed.');
    await journal.requireSignature(author!.signature, task.inputs);
    if (!sameValue(capture!.signature, packet.signature.filter(row => task.artifacts.some(ref => ref.location === row.location)))) throw new RecoveryBlocked('Ordinary coding source differs from the original capture.');
    requirePassingEvidence(task, requirement, evidenceIds); await journal.requireSignature(verified!.signature, refs);
  }
  if (ordinaryRoot) return createHash('sha256').update(JSON.stringify({ packet, review })).digest('hex');
}

/** This schema is exclusive to the explicit coding policy; the historical four-field parser stays unchanged. */
export function parseCodingConcernReview(text: string, task: TaskContract, requirement: ExecutionRequirement, packet: CodingConcernReview,
  parseOriginal: (text: string, task: TaskContract) => ReviewProposal, ordinaryPolicy?: typeof ORDINARY_CODING_HANDOFF): ReviewProposal {
  const value = decodeModelJson(text) as ReviewProposal;
  if (!value || Object.keys(value).some(key => !['verdict', 'inputVersions', 'evidenceIds', 'findings', 'concernResolutions'].includes(key))) throw new Error('Invalid coding concern review fields.');
  const { concernResolutions, ...base } = value; parseOriginal(JSON.stringify(base), task);
  if (new Set(value.evidenceIds).size !== value.evidenceIds.length) throw new Error('Coding concern review evidence IDs must be unique.');
  requireCodingHostEvidence(task, packet.capturedAt);
  if (!Array.isArray(concernResolutions) || concernResolutions.length !== packet.concerns.length) throw new Error('Independent review must address every original coding concern.');
  const seen = new Set<string>();
  for (const resolution of concernResolutions) {
    const concern = packet.concerns.find(c => c.concernId === resolution?.concernId);
    if (!concern || seen.has(resolution.concernId) || resolution.concernText !== concern.text
      || Object.keys(resolution).some(key => !['concernId', 'concernText', 'status', 'basis', 'rationale', 'acceptanceIds', 'inputVersions', 'evidenceIds', 'evidenceRefs'].includes(key))
      || !['resolved', 'unresolved'].includes(resolution.status) || !['fixed_input', 'host_evidence'].includes(resolution.basis)
      || typeof resolution.rationale !== 'string' || !resolution.rationale.trim()) throw new Error('Concern resolution identity, status or rationale is invalid.');
    seen.add(resolution.concernId);
    for (const field of ['acceptanceIds', 'evidenceIds'] as const) if (!Array.isArray(resolution[field]) || resolution[field].some(id => typeof id !== 'string') || new Set(resolution[field]).size !== resolution[field].length) throw new Error('Concern resolution identifiers must be unique arrays.');
    if (!resolution.acceptanceIds.length || resolution.acceptanceIds.some(id => !task.acceptanceIds.includes(id) || !requirement.acceptance.some(a => a.acceptanceId === id))) throw new Error('Concern resolution requires current fixed acceptance IDs.');
    if (!Array.isArray(resolution.inputVersions) || !resolution.inputVersions.length || !Array.isArray(resolution.evidenceRefs)) throw new Error('Concern resolution requires fixed version references.');
    if (ordinaryPolicy && resolution.status === 'resolved' && resolution.basis !== 'host_evidence') throw new Error('Resolving an ordinary coding concern requires current passing host evidence.');
    if (resolution.basis === 'fixed_input') {
      if (resolution.evidenceIds.length || resolution.evidenceRefs.length || new Set(resolution.inputVersions.map(r => r.artifactId)).size !== resolution.inputVersions.length
        || resolution.inputVersions.some(ref => !task.inputs.some(v => sameValue(v, ref)))) throw new Error('Fixed-input concern resolution must cite current fixed task inputs.');
    } else {
      if (!sameValue(resolution.inputVersions, [...task.inputs, ...task.artifacts]) || !resolution.evidenceIds.length) throw new Error('Host concern resolution requires all current versions and passing evidence.');
      const evidence = resolution.evidenceIds.map(id => task.evidence.find(e => e.evidenceId === id));
      if (evidence.some(e => !e || e.outcome !== 'passed' || !value.evidenceIds.includes(e.evidenceId))
        || !sameValue(resolution.evidenceRefs, evidence.map(e => e!.source))
        || resolution.acceptanceIds.some(id => !evidence.some(e => e!.acceptanceIds.includes(id)))) throw new Error('Concern resolution references missing, unselected or nonpassing host proof.');
    }
    if (value.verdict === 'approved' && resolution.status !== 'resolved') throw new Error('Unresolved coding concerns cannot approve a task.');
  }
  return value;
}
