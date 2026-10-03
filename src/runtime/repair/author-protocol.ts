import { createHash } from 'node:crypto';
import type { CreatedRole } from '../../roles/factory.ts';
import type { ExecutionRequirement } from '../../roles/execution-input.ts';
import type { TaskContract } from '../../contracts/types.ts';
import type { RunController } from '../run.ts';
import { executionWindowView } from '../execution-window.ts';
import { requireValidationScope } from '../validation-scope.ts';
import type { ValidationExecutionBinding } from '../validation-scope.ts';
import { RecoveryBlocked } from '../recovery/task-journal.ts';
import type { ContentSignature, TaskJournal } from '../recovery/task-journal.ts';

export class AuthorProtocolError extends Error {
  readonly code: 'invalid_proposal' | 'correction_unavailable' | 'authority_exhausted' | 'workspace_changed';
  constructor(code: AuthorProtocolError['code'], cause?: unknown) {
    super(`Author protocol_failure: ${code}.`, { cause });
    this.code = code;
  }
}
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
type Identity = { taskId: string; attemptId: string; authorId: string; contextId: string };
const parseReasons = new Map([
  ['Model response requires one complete JSON object.', 'requires_complete_json'],
  ['Model response contains ambiguous JSON or code blocks.', 'ambiguous_json'],
  ['Model JSON code block is incomplete or invalid.', 'invalid_json_block'],
  ['Model response must contain a JSON object.', 'object_required'],
  ['Invalid author proposal.', 'invalid_fields'],
]);
export interface AuthorCorrectionStarted extends Identity {
  used: 1; recordedAt: string; originalReply: string; originalReplySha256: string;
  parseFailure: { code: 'invalid_proposal'; reason: string }; inputSignature: ContentSignature; workspaceSignature: ContentSignature;
}
export interface AuthorCorrectionResponse extends Identity {
  reply: string; replySha256: string; inputSignature: ContentSignature; workspaceSignature: ContentSignature;
}
const correction = 'Your previous response did not satisfy the fixed author JSON protocol. Reformat only your own existing facts into JSON {summary:string,remaining:string[],uncertainty:string[]}. Return only that complete JSON object with no surrounding prose or code. Preserve every genuine unfinished assigned deliverable and unresolved blocking uncertainty; do not invent facts, perform work, change requirements, or hide a genuine defect to obtain empty arrays. Pending host capture, verification, independent review and other roles belong in summary only. This is the single format correction allowed in this same author attempt. All tools are disabled.';

function identity(task: TaskContract): Identity {
  return { taskId: task.taskId, attemptId: task.attempts.at(-1)!.attemptId, authorId: task.authorId, contextId: task.context.contextId };
}
function requireIdentity(record: Identity, expected: Identity): void {
  if (!record || Object.entries(expected).some(([key, value]) => record[key as keyof Identity] !== value)) throw new RecoveryBlocked('Author correction identity differs from the original attempt.');
}

/** Only a JSON/shape failure is eligible. Native admission still owns cost and request limits. */
export async function requestAuthorProposal<T>(options: {
  author: CreatedRole; controller: RunController; task: TaskContract; workspace: string; journal?: TaskJournal;
  signal: AbortSignal; maxCorrections: 0 | 1; parse: (text: string) => T; now?: () => number;
  validation?: { binding: ValidationExecutionBinding; requirement: ExecutionRequirement };
}): Promise<T> {
  options.signal.throwIfAborted();
  const original = await options.author.prompt('Execute this scoped task and return the required JSON proposal.', { signal: options.signal });
  options.signal.throwIfAborted();
  let parseCause: unknown;
  try { return options.parse(original.text); } catch (error) { parseCause = error; }
  if (options.maxCorrections !== 1) throw new AuthorProtocolError('invalid_proposal', parseCause);
  if (!options.journal || !options.author.readonlyPrompt) throw new AuthorProtocolError('correction_unavailable', parseCause);
  if (options.validation) await requireValidationScope(options.controller, options.validation.requirement, options.validation.binding);
  const state = await options.controller.read(), task = state.tasks.find(task => task.taskId === options.task.taskId);
  const validation = options.validation ? await options.controller.validationAuthority(options.task.taskId, 'author') : undefined;
  const authority = validation ?? await options.controller.executionAuthority(options.task.taskId);
  const active = validation ? null : executionWindowView(state).executionWindow;
  const committed = state.ledger.entries.reduce((sum, entry) => sum + entry.settledMicroCny + entry.reservedMicroCny, 0);
  const taskCommitted = state.ledger.entries.filter(entry => entry.taskId === options.task.taskId).reduce((sum, entry) => sum + entry.settledMicroCny + entry.reservedMicroCny, 0);
  if (!task || task.state !== 'running' || task.attempts.at(-1)?.outcome !== 'running'
    || task.attempts.at(-1)?.attemptId !== options.task.attempts.at(-1)?.attemptId
    || !authority.admissionAllowed || active && (active.stopReason || active.state !== 'running')
    || Date.parse(authority.deadlineAt) <= (options.now ?? Date.now)()
    || state.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny > 0)
    || (validation ? validation.remainingMicroCny <= 0 || validation.requestsRemaining < 1 : committed >= ('effectiveLimitMicroCny' in authority ? authority.effectiveLimitMicroCny : 0))
    || taskCommitted >= authority.taskGrantMicroCny) throw new AuthorProtocolError('authority_exhausted', parseCause);
  const fixed = identity(options.task);
  if (options.author.actorId !== fixed.authorId || options.author.contextId !== fixed.contextId) throw new AuthorProtocolError('correction_unavailable', parseCause);
  const started: AuthorCorrectionStarted = { ...fixed, used: 1, recordedAt: new Date((options.now ?? Date.now)()).toISOString(),
    originalReply: original.text, originalReplySha256: sha256(original.text), parseFailure: { code: 'invalid_proposal', reason: parseCause instanceof Error ? parseReasons.get(parseCause.message) ?? 'invalid_fields' : 'invalid_fields' },
    inputSignature: await options.journal.signature([...options.task.inputs, ...options.task.context.interfaces]), workspaceSignature: await options.journal.workspaceSignature(options.workspace, options.task.ownership.writePaths) };
  // Write-once publication consumes the slot before dispatch, including interrupted or unknown requests.
  await options.journal.write('author-correction-started', fixed.attemptId, started);
  options.signal.throwIfAborted();
  let answer: { text: string };
  try { answer = await options.author.readonlyPrompt(correction, { signal: options.signal }); }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'readonly_unavailable') throw new AuthorProtocolError('correction_unavailable', error);
    throw error;
  }
  const response: AuthorCorrectionResponse = { ...fixed, reply: answer.text, replySha256: sha256(answer.text),
    inputSignature: await options.journal.signature([...options.task.inputs, ...options.task.context.interfaces]), workspaceSignature: await options.journal.workspaceSignature(options.workspace, options.task.ownership.writePaths) };
  await options.journal.write('author-correction-response', fixed.attemptId, response);
  options.signal.throwIfAborted();
  try {
    await options.journal.requireSignature(started.inputSignature, [...options.task.inputs, ...options.task.context.interfaces]);
    await options.journal.requireWorkspaceSignature(started.workspaceSignature, options.workspace, options.task.ownership.writePaths);
  } catch (error) { throw new AuthorProtocolError('workspace_changed', error); }
  try { return options.parse(answer.text); } catch (error) { throw new AuthorProtocolError('invalid_proposal', error); }
}

/** Reuse only a complete response at the original bytes; never dispatch a model during recovery. */
export async function recoverAuthorProposal<T>(options: { journal: TaskJournal; task: TaskContract; workspace: string; parse: (text: string) => T }): Promise<{ proposal: T; signature: ContentSignature } | null> {
  const fixed = identity(options.task);
  const started = await options.journal.read<AuthorCorrectionStarted>('author-correction-started', fixed.attemptId);
  if (!started) return null;
  requireIdentity(started, fixed);
  if (started.used !== 1 || started.parseFailure?.code !== 'invalid_proposal' || ![...parseReasons.values()].includes(started.parseFailure.reason) || typeof started.originalReply !== 'string'
    || started.originalReplySha256 !== sha256(started.originalReply)) throw new RecoveryBlocked('Incomplete original author correction receipt.');
  let originalInvalid = false;
  try { options.parse(started.originalReply); } catch { originalInvalid = true; }
  if (!originalInvalid) throw new RecoveryBlocked('Correction receipt does not establish an original protocol failure.');
  const response = await options.journal.read<AuthorCorrectionResponse>('author-correction-response', fixed.attemptId);
  if (!response) throw new RecoveryBlocked('Author correction started without a durable response; do not repeat paid formatting.');
  requireIdentity(response, fixed);
  if (typeof response.reply !== 'string' || response.replySha256 !== sha256(response.reply)) throw new RecoveryBlocked('Incomplete author correction response.');
  await options.journal.requireSignature(started.inputSignature, [...options.task.inputs, ...options.task.context.interfaces]);
  await options.journal.requireSignature(response.inputSignature, [...options.task.inputs, ...options.task.context.interfaces]);
  await options.journal.requireWorkspaceSignature(started.workspaceSignature, options.workspace, options.task.ownership.writePaths);
  await options.journal.requireWorkspaceSignature(response.workspaceSignature, options.workspace, options.task.ownership.writePaths);
  let proposal: T;
  try { proposal = options.parse(response.reply); } catch { throw new RecoveryBlocked('Stored author correction does not satisfy the strict proposal protocol.'); }
  return { proposal, signature: await options.journal.signature(options.task.inputs) };
}
