import { createHash } from 'node:crypto';
import { sameValue } from '../../contracts/validation.ts';
import type { ArtifactReference, TaskContract } from '../../contracts/types.ts';
import { decodeModelJson } from '../../roles/protocol.ts';
import type { ExecutionRequirement } from '../../roles/execution-input.ts';
import type { AuthorProposal } from '../orchestrator.ts';
import { RecoveryBlocked } from '../recovery/task-journal.ts';
import type { ContentSignature, TaskJournal } from '../recovery/task-journal.ts';
import { recoverAuthorProposal } from './author-protocol.ts';
import type { AuthorCorrectionStarted, AuthorScopeClarificationStarted } from './author-protocol.ts';

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

/** Preserve every structured original concern, including concerns moved to summary by the one scope follow-up. */
export async function codingConcernPacket(options: {
  task: TaskContract; proposal: AuthorProposal; requirement: ExecutionRequirement; journal: TaskJournal;
  workspace: string; parseProposal: (text: string) => AuthorProposal; allowScope: boolean; reuse?: boolean;
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
    signature: await journal.signature(references(task, options.requirement)) };
  const stored = await journal.read<CodingConcernReview>('coding-concerns', attemptId);
  if (stored) {
    if (!sameValue(stored, expected)) throw new RecoveryBlocked('Coding concern receipt changed from the original proposal, identity or fixed versions.');
    await journal.requireSignature(stored.signature, references(task, options.requirement)); return stored;
  }
  if (options.reuse) throw new RecoveryBlocked('Passed coding task has no durable original concern receipt.');
  await journal.write('coding-concerns', attemptId, expected); return expected;
}

export const codingConcernReviewProtocol = 'Return only JSON {verdict:"approved"|"changes_requested",inputVersions:all fixed packet inputs,evidenceIds:recorded host evidence IDs,findings:string[],concernResolutions:[{concernId:string,concernText:exact original concern text,status:"resolved"|"unresolved",basis:"fixed_input"|"host_evidence",rationale:string,acceptanceIds:current fixed acceptance IDs,inputVersions:fixed references,evidenceIds:passed host evidence IDs,evidenceRefs:exact sources of those evidence IDs}]}. Independently address every codingConcernReview concern exactly once, including original concerns moved into summary. For fixed_input, cite current requirements or fixed task inputs and use empty evidenceIds/evidenceRefs. For host_evidence, cite current passing host evidence, its exact sources and all fixed input/output versions. Explain how each cited requirement or actual result resolves that concern. Author assertions and pending future checks are not proof. Preserve genuine unresolved concerns as unresolved and request changes with findings. Approval requires every concern explicitly resolved and findings:[]. Do not change requirements or reinterpret failed host checks.';

export function requireCodingHostEvidence(task: TaskContract, capturedAt: string): void {
  if (task.evidence.some(e => e.outcome === 'failed')) throw new Error('Coding host checks contain failed evidence.');
  for (const evidence of task.evidence) {
    if (evidence.taskId !== task.taskId || Date.parse(evidence.recordedAt) < Date.parse(capturedAt) || Date.parse(evidence.recordedAt) > Date.now()
      || ![...task.inputs, ...task.artifacts].every(ref => evidence.artifactVersions.some(v => sameValue(v, ref)))) throw new Error('Coding host evidence must belong to the current attempt and fixed versions.');
  }
}

/** This schema is exclusive to the explicit coding policy; the historical four-field parser stays unchanged. */
export function parseCodingConcernReview(text: string, task: TaskContract, requirement: ExecutionRequirement, packet: CodingConcernReview,
  parseOriginal: (text: string, task: TaskContract) => ReviewProposal): ReviewProposal {
  const value = decodeModelJson(text) as ReviewProposal;
  if (!value || Object.keys(value).some(key => !['verdict', 'inputVersions', 'evidenceIds', 'findings', 'concernResolutions'].includes(key))) throw new Error('Invalid coding concern review fields.');
  const { concernResolutions, ...base } = value; parseOriginal(JSON.stringify(base), task);
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
