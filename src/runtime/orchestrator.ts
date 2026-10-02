import { randomUUID } from 'node:crypto';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ImageContent } from '@earendil-works/pi-ai';
import { validateTask, validateTaskInputs } from '../contracts/index.ts';
import { sameValue } from '../contracts/validation.ts';
import type { ArtifactReference, EvidenceContract, TaskContract } from '../contracts/index.ts';
import type { RunController, RunSnapshot } from './run.ts';
import { assertOwnership, pathsOverlap } from '../roles/factory.ts';
import type { AuthorRole, CreatedRole, RoleFactory } from '../roles/factory.ts';
import { freeze } from '../roles/requirements.ts';
import { decodeModelJson } from '../roles/protocol.ts';
import { requestReview, validateProtocolCorrections } from './repair/protocol.ts';
import { buildRepairFeedback, failureRecord } from './repair/feedback.ts';
import type { FailureStage, HostFailure } from './repair/feedback.ts';
import { TaskJournal, RecoveryBlocked, hasHostRecord, requireOriginalTask, requireCorrectionIdentity } from './recovery/task-journal.ts';
import type { CapturedTask, ContentSignature, RecoveryOptions, RecoveryReport } from './recovery/task-journal.ts';
import { assertTaskWriteIsolation, scheduleTasks, validateScheduling, withDagOwner } from './scheduler/index.ts';
import type { SchedulingOptions } from './scheduler/index.ts';
import { executionWindowView, taskWindowBinding } from './execution-window.ts';
import { requireContinuationTask } from './continuation-validation.ts';
import { requireContinuationInputs } from './continuation-inputs.ts';
import { validateExecutionInput, validateExecutionRequirement } from '../roles/execution-input.ts';
import type { ExecutionRequirement } from '../roles/execution-input.ts';
import { requireValidationScope, validationJournalBinding } from './validation-scope.ts';
import type { ValidationExecutionBinding } from './validation-scope.ts';
import { currentValidationCase, requireValidationTask, validationRole } from './validation-validation.ts';

export interface PreparedTask { task: TaskContract; role: AuthorRole; workspace: string; expectedArtifacts?: ArtifactReference[] }
export interface AuthorProposal { summary: string; remaining: string[]; uncertainty: string[] }
export interface DagOptions {
  controller: RunController;
  /** Exact already-authorized window. Omitted retains the original v1 execution API. */
  windowId?: string;
  requirement: ExecutionRequirement;
  validation?: ValidationExecutionBinding;
  tasks: PreparedTask[];
  sessionRoot: string;
  availableArtifacts: ArtifactReference[];
  roleFactory: RoleFactory;
  /** Host prepares fixed inputs only for a fresh author, before recording its attempt. */
  preAuthor?: (task: Readonly<TaskContract>, signal: AbortSignal) => Promise<void>;
  /** Trusted host snapshots the outputs and supplies a separate frozen reviewer workspace. */
  capture(task: TaskContract, proposal: AuthorProposal, signal: AbortSignal): Promise<{ artifacts: ArtifactReference[]; reviewWorkspace: string }>;
  /** Host executes real checks and returns evidence for the captured versions, never model assertions. */
  verify(task: TaskContract, signal: AbortSignal): Promise<EvidenceContract[]>;
  /** Actual image bytes loaded by the host from fixed artifacts/evidence in the review snapshot. */
  reviewImages?: (task: TaskContract, signal: AbortSignal) => Promise<{ source: ArtifactReference; image: ImageContent }[]>;
  signal?: AbortSignal;
  now?: () => number;
  /** Opt-in correction of review JSON only, within the same live reviewer session. */
  reviewProtocolCorrections?: 0 | 1;
  /** Trusted report adapter only. Receives fixed task data, never raw exceptions. */
  diagnoseFailure?: (task: TaskContract, stage: FailureStage) => HostFailure | undefined;
  /** Explicit opt-in host receipts. Existing callers retain their original behavior. */
  recovery?: RecoveryOptions;
  /** Explicit parallel host scheduling; omitted preserves the serial API. */
  scheduling?: SchedulingOptions;
}

function checked(issues: { message: string }[]): void {
  if (issues.length) throw new Error(issues.map(issue => issue.message).join('; '));
}
function parseProposal(text: string): AuthorProposal {
  const value = decodeModelJson(text) as AuthorProposal;
  if (!value || typeof value.summary !== 'string' || !value.summary.trim() || !(['remaining', 'uncertainty'] as const).every(key => Array.isArray(value[key]) && value[key].every((s: unknown) => typeof s === 'string')) || Object.keys(value).some(key => !['summary', 'remaining', 'uncertainty'].includes(key))) throw new Error('Invalid author proposal.');
  return value;
}
function parseReview(text: string, task: TaskContract) {
  const value = decodeModelJson(text) as { verdict: 'approved' | 'changes_requested'; inputVersions: ArtifactReference[]; evidenceIds: string[]; findings: string[] };
  if (!value || !['approved', 'changes_requested'].includes(value.verdict) || !Array.isArray(value.findings) || !value.findings.every((s: unknown) => typeof s === 'string') || Object.keys(value).some(key => !['verdict', 'inputVersions', 'evidenceIds', 'findings'].includes(key))) throw new Error('Invalid independent review proposal.');
  if (!sameValue(value.inputVersions, [...task.inputs, ...task.artifacts])) throw new Error('Review input versions are stale or incomplete.');
  if (!Array.isArray(value.evidenceIds) || !value.evidenceIds.length || value.evidenceIds.some((id: string) => !task.evidence.some(e => e.evidenceId === id))) throw new Error('Review must reference host evidence.');
  if (value.verdict === 'approved' && value.findings.length) throw new Error('Unresolved review findings cannot approve a task.');
  if (value.verdict === 'changes_requested' && !value.findings.length) throw new Error('Requested changes require findings.');
  return value as { verdict: 'approved' | 'changes_requested'; inputVersions: ArtifactReference[]; evidenceIds: string[]; findings: string[] };
}

function requirePassingEvidence(task: TaskContract, requirement: ExecutionRequirement, selectedIds = task.evidence.map(e => e.evidenceId)): void {
  for (const id of task.acceptanceIds) {
    const accepted = requirement.acceptance.find(a => a.acceptanceId === id)!;
    if (!task.evidence.some(e => selectedIds.includes(e.evidenceId) && e.outcome === 'passed' && e.acceptanceIds.includes(id) && accepted.evidenceKinds.includes(e.kind) && [...task.inputs, ...task.artifacts].every(ref => e.artifactVersions.some(version => sameValue(ref, version))))) throw new Error(`Missing selected host evidence for ${id} at the fixed input and output versions.`);
  }
}

/** Original v1 execution. Windows use complete-DAG recovery checks even for a first attempt. */
export async function executeTaskDag(options: DagOptions): Promise<TaskContract[]> {
  await checkProfile(options);
  if (options.windowId) throw new Error('Execution window requires resumeTaskDag with a complete dependency DAG and host recovery journal.');
  return withDagOwner(options.controller, async () => (await executeDag(options, false)).tasks, options.windowId, options.validation);
}

/** Resume only independently identifiable unfinished phases of the original tasks. */
export async function resumeTaskDag(options: DagOptions): Promise<RecoveryReport> {
  await checkProfile(options);
  if (!options.recovery) throw new Error('Recovery requires the original explicit host journal configuration.');
  return withDagOwner(options.controller, () => executeDag(options, true), options.windowId, options.validation);
}

async function checkProfile(options: DagOptions): Promise<void> {
  if (!options.validation) { options.controller.requireExecutionWindow(options.windowId); return; }
  if (options.windowId !== undefined || options.scheduling || !options.recovery) throw new Error('Validation execution requires its explicit serial case and durable host journal.');
  await requireValidationScope(options.controller, options.requirement, options.validation);
}

async function executeDag(options: DagOptions, resume: boolean): Promise<RecoveryReport> {
  const { controller } = options;
  validateProtocolCorrections(options.reviewProtocolCorrections ?? 0);
  const requirement = freeze(structuredClone(options.requirement));
  checked(validateExecutionRequirement(requirement, options.validation ? 'operator_validation' : 'human'));
  const prepared = structuredClone(options.tasks);
  if (!prepared.length || prepared.length > 100 || new Set(prepared.map(p => p.task.taskId)).size !== prepared.length) throw new Error('DAG requires 1 to 100 unique tasks.');
  if (options.scheduling) validateScheduling(prepared, options.scheduling);
  const initial = await controller.read();
  if (options.validation) {
    const window = currentValidationCase(initial);
    if (options.reviewProtocolCorrections !== window.quote.declaration.limits.reviewProtocolCorrections) throw new Error('Validation review correction policy differs from its declaration.');
    for (const item of prepared) {
      requireValidationTask(initial, item.task);
      let role = validationRole(window, item.task.taskId);
      if (role === 'repair') role = validationRole(window, window.repair!.sourceTaskId);
      if (role !== item.role || item.task.dependsOn.some(dep => !prepared.some(candidate => candidate.task.taskId === dep.taskId))) throw new Error('Validation requires every current-case dependency and its fixed role.');
      checked(validateExecutionInput({ requirement, task: item.task, ledger: initial.ledger, run: initial.run }));
    }
  }
  if (options.windowId) await requireContinuationInputs(initial, prepared, options.recovery!.artifactRoot);
  const prior = new Map(initial.tasks.map(task => [task.taskId, task]));
  const journals = new Map<string, TaskJournal>(), blocked = new Map<string, string>();
  for (const item of prepared) {
    item.workspace = await realpath(item.workspace);
    checked(validateTask(item.task)); assertOwnership(item.task, item.workspace);
    if (!['cosmos', 'design', 'coding', 'art'].includes(item.role)) throw new Error('Invalid author role.');
    if (!resume && prior.has(item.task.taskId)) throw new Error('Task already recorded; reuse its result or create explicit new work.');
    if (item.task.state !== 'not_started') throw new Error('Prepared tasks must be not_started.');
    if (item.task.dependsOn.some(dep => !prior.has(dep.taskId) && !prepared.some(p => p.task.taskId === dep.taskId))) throw new Error('Missing dependency task.');
    const simulation = structuredClone(initial);
    const binding = options.validation ? undefined : taskWindowBinding(initial, item.task.taskId);
    if (binding) requireContinuationTask(initial, item.task);
    else if (options.windowId && prior.get(item.task.taskId)?.state !== 'passed') throw new Error('Execution window can only dispatch its quoted tasks or reuse historical passed evidence.');
    if (!simulation.ledger.allocations.some(a => a.taskId === item.task.taskId)) {
      simulation.ledger.allocations.push({ taskId: item.task.taskId, amountMicroCny: item.task.budget.allocationMicroCny });
      simulation.run.taskIds.push(item.task.taskId);
    }
    try { checked(validateExecutionInput({ requirement, task: item.task, ledger: simulation.ledger, run: simulation.run })); }
    catch (error) { if (!resume) throw error; blocked.set(item.task.taskId, 'Original task does not match the supplied execution requirements.'); }
    if (options.recovery) {
      try {
        if (!item.expectedArtifacts?.length || item.task.ownership.writePaths.some(path => pathsOverlap(path, options.recovery!.journalRoot, item.workspace))) throw new RecoveryBlocked('Recovery requires exact expected outputs and a journal outside author write paths.');
        journals.set(item.task.taskId, await TaskJournal.open(options.recovery, {
          ...(options.validation ? { formatVersion: 3 as const, validationCase: validationJournalBinding(currentValidationCase(initial)) } : binding ? { formatVersion: 2 as const, executionWindow: binding } : { formatVersion: 1 as const }),
          runId: initial.run.runId, ledgerId: initial.ledger.ledgerId, originalStartedAt: initial.run.originalStartedAt,
          originalDeadlineAt: initial.run.originalDeadlineAt, limitMicroCny: initial.ledger.limitMicroCny, requirement, prepared: item,
          reviewProtocolCorrections: options.reviewProtocolCorrections ?? 0, artifactRoot: options.recovery.artifactRoot, sessionRoot: resolve(options.sessionRoot),
        }, resume));
        const current = prior.get(item.task.taskId);
        if (resume && current) requireOriginalTask(item.task, current);
      } catch (error) {
        if (!resume) throw error;
        blocked.set(item.task.taskId, error instanceof RecoveryBlocked ? error.message : 'Recovery origin cannot be verified.');
      }
    }
    if (resume && prior.has(item.task.taskId)) item.task = structuredClone(prior.get(item.task.taskId)!);
  }
  const ordered: PreparedTask[] = [], remaining = [...prepared];
  while (remaining.length) {
    const index = remaining.findIndex(item => item.task.dependsOn.every(dep => (!resume && prior.get(dep.taskId)?.state === 'passed') || (!prepared.some(p => p.task.taskId === dep.taskId) && prior.has(dep.taskId)) || ordered.some(p => p.task.taskId === dep.taskId)));
    if (index < 0) throw new Error('Dependency cycle.');
    ordered.push(remaining.splice(index, 1)[0]);
  }
  await assertTaskWriteIsolation(prepared);
  const fresh = prepared.filter(p => !prior.has(p.task.taskId) && !blocked.has(p.task.taskId));
  if (fresh.length && !resume) await controller.registerTasks(fresh.map(p => p.task));
  const signal = AbortSignal.any([controller.signal, ...(options.signal ? [options.signal] : [])]);
  const available = structuredClone(options.availableArtifacts);
  const finished = new Map(prior);
  const results: TaskContract[] = [];
  const reusedTaskIds: string[] = [];
  const validatedDependencies = new Set<string>();
  const at = () => new Date((options.now ?? Date.now)()).toISOString();
  async function save(task: TaskContract) { await controller.saveTask(task, { role: 'system', actorId: 'orchestrator' }); }
  async function validate(task: TaskContract) {
    const current = await controller.read();
    checked(validateExecutionInput({ requirement, task, ledger: current.ledger, run: current.run }));
  }
  async function inspectCaptured(task: TaskContract, proposal: AuthorProposal, expected: ArtifactReference[] | undefined): Promise<CapturedTask> {
    if (signal.aborted) throw new RecoveryBlocked('Recovery cancelled before capture inspection; no host callback was dispatched.');
    let recovered: CapturedTask | null | undefined;
    try { recovered = await options.recovery!.recoverCapture?.(freeze(structuredClone(task)), freeze(proposal), signal); }
    catch { throw new RecoveryBlocked('The host could not verify the fixed capture or its required registry authority.'); }
    if (signal.aborted) throw new RecoveryBlocked('Recovery cancelled during capture inspection; preserve the original task result.');
    if (!recovered) throw new RecoveryBlocked('Exact completed capture or required registry authority cannot be established.');
    if (!expected || !Array.isArray(recovered.artifacts) || recovered.artifacts.length !== expected.length || expected.some(ref => !recovered!.artifacts.some(actual => sameValue(ref, actual)))) throw new RecoveryBlocked('Recovered capture differs from the planned output versions.');
    return recovered;
  }
  async function persistFeedback(task: TaskContract, error: unknown, stage: FailureStage, snapshot: RunSnapshot) {
    let feedback: ReturnType<typeof buildRepairFeedback>;
    try {
      const diagnostic = options.diagnoseFailure?.(freeze(structuredClone(task)), stage) ?? error;
      feedback = buildRepairFeedback(task, diagnostic, stage, snapshot);
    } catch {
      // Malformed host diagnostics cannot replace fixed acceptance or prevent
      // feedback from being saved. Never persist the adapter's exception.
      feedback = buildRepairFeedback(task, undefined, stage, snapshot);
    }
    await writeFile(join(task.attempts.at(-1)!.sessionRef, 'failure.json'), JSON.stringify(feedback, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    return feedback;
  }

  async function reusePassed(item: PreparedTask) {
    const task = item.task, journal = journals.get(task.taskId)!;
    if (blocked.has(task.taskId)) throw new RecoveryBlocked(blocked.get(task.taskId));
    if (task.dependsOn.some(dep => !validatedDependencies.has(dep.taskId))) throw new RecoveryBlocked('Passed ancestor dependencies were not validated.');
    const authored = await journal.read<{ proposal: AuthorProposal }>('author', task.attempts.at(-1)!.attemptId);
    if (!authored) throw new RecoveryBlocked('Passed task has no matching durable author handoff.');
    let proposal: AuthorProposal;
    try { proposal = parseProposal(JSON.stringify(authored.proposal)); }
    catch { throw new RecoveryBlocked('Passed task author handoff cannot be verified.'); }
    await inspectCaptured(task, proposal, item.expectedArtifacts);
    const verified = await journal.read<{ evidence: EvidenceContract[]; signature: ContentSignature }>('verified', task.attempts.at(-1)!.attemptId);
    if (!verified || !sameValue(verified.evidence, task.evidence)) throw new RecoveryBlocked('Passed task has no matching durable host evidence.');
    requirePassingEvidence(task, requirement, task.review.evidenceIds);
    await journal.requireSignature(verified.signature, [...task.inputs, ...task.artifacts, ...task.evidence.map(e => e.source)]);
    reusedTaskIds.push(task.taskId); validatedDependencies.add(task.taskId);
    for (const ref of task.artifacts) if (!available.some(existing => sameValue(existing, ref))) available.push(ref);
  }

  // A v2 call validates every reused ancestor before any new task phase can register, write or charge.
  if ((options.windowId || options.validation) && !signal.aborted) for (const item of ordered) if (item.task.state === 'passed') await reusePassed(item);

  async function executeOne(item: PreparedTask) {
    const task = item.task;
    const journal = journals.get(task.taskId);
    let author: CreatedRole | undefined, reviewer: CreatedRole | undefined;
    let failureStage: FailureStage = 'execution';
    try {
      if (resume) {
        if (signal.aborted) throw new RecoveryBlocked(prior.has(task.taskId) ? 'Recovery cancelled before phase dispatch; preserve the original task result.' : 'Recovery cancelled before task registration; no work was dispatched.');
        if (blocked.has(task.taskId)) throw new RecoveryBlocked(blocked.get(task.taskId));
        if (task.dependsOn.some(dep => !validatedDependencies.has(dep.taskId))) throw new RecoveryBlocked('Required dependency was not validated in this recovery; include every required ancestor and resolve its blocked result first.');
        if (task.state === 'passed') {
          if (!validatedDependencies.has(task.taskId)) await reusePassed(item);
          return;
        }
        if (!['not_started', 'ready', 'running', 'awaiting_review'].includes(task.state)) throw new RecoveryBlocked('Task retains its prior outcome; use the existing constrained repair policy for new work.');
        const current = await controller.read();
        const active = options.validation ? { ...currentValidationCase(current), state: currentValidationCase(current).stopReason ? 'waiting_user' : 'running' } : executionWindowView(current).executionWindow;
        if (active.stopReason || active.state !== 'running' || current.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny > 0)) throw new RecoveryBlocked('Execution window is stopped or has unresolved requests; reconcile before dispatch.');
        if (task.attempts.length > 1 || (task.attempts.length && (task.attempts[0].failure || !['running', 'passed'].includes(task.attempts[0].outcome)))) throw new RecoveryBlocked('Prior attempt requires its existing failure/repair path.');
        if (task.attempts.length && await hasHostRecord(task.attempts[0].sessionRef, 'failure.json')) throw new RecoveryBlocked('Existing COS-11 failure handoff must remain on its repair path.');
      }
      if (options.windowId && !(await controller.executionAuthority(task.taskId)).admissionAllowed) throw new RecoveryBlocked('Task has no active execution window authority; historical work is read-only.');
      if (options.validation && !(await controller.validationAuthority(task.taskId, task.attempts.length ? 'reviewer' : 'author')).executionAllowed) throw new RecoveryBlocked('Task has no active validation case authority.');
      if (options.validation) {
        try { await requireValidationScope(controller, requirement, options.validation); }
        catch { throw new RecoveryBlocked('Validation scope or operator source could not be authenticated before this task phase.'); }
      }
      signal.throwIfAborted();
      task.dependsOn = task.dependsOn.map(dep => ({ ...dep, state: finished.get(dep.taskId)!.state }));
      if (task.dependsOn.some(dep => dep.state !== 'passed')) {
        if (resume || options.validation) throw new RecoveryBlocked('Required dependency has not passed.');
        task.state = 'waiting_user'; task.stateReason = 'Required dependency has not passed.';
        task.handoff.remaining = [task.objective]; await save(task); return;
      }
      try { checked(validateTaskInputs(task, available)); }
      catch (error) { if (resume) throw new RecoveryBlocked('Fixed task inputs are not available from validated dependencies.'); throw error; }
      if (resume && !prior.has(task.taskId)) await controller.registerTasks([task]);
      const continuing = resume && task.attempts.length > 0;
      const attemptId = continuing ? task.attempts[0].attemptId : randomUUID(), directory = join(options.sessionRoot, attemptId);
      if (continuing && resolve(task.attempts[0].sessionRef) !== resolve(directory)) throw new RecoveryBlocked('Original attempt session location changed.');
      let proposal: AuthorProposal, captured: CapturedTask;
      if (continuing) {
        try {
          const authored = await journal!.read<{ proposal: AuthorProposal; signature: ContentSignature }>('author', attemptId);
          if (!authored) throw new RecoveryBlocked('Author response is not durably recorded; do not repeat paid generation.');
          proposal = parseProposal(JSON.stringify(authored.proposal));
          await journal!.requireSignature(authored.signature, task.inputs);
          let capture = await journal!.read<{ captured: CapturedTask; signature: ContentSignature }>('capture', attemptId);
          if (!capture && !await journal!.read('capture-started', attemptId)) throw new RecoveryBlocked('Capture was never durably started; no completed output can be inferred.');
          const recovered = await inspectCaptured(task, proposal, item.expectedArtifacts);
          if (!capture) {
            capture = { captured: recovered, signature: await journal!.signature(recovered.artifacts) };
            await journal!.write('capture', attemptId, capture);
          }
          if (!sameValue(recovered, capture.captured)) throw new RecoveryBlocked('Recovered capture differs from its durable snapshot handoff.');
          captured = capture.captured;
          await journal!.requireSignature(capture.signature, captured.artifacts);
          if (task.artifacts.length && !sameValue(task.artifacts, captured.artifacts)) throw new RecoveryBlocked('Capture conflicts with already recorded task artifacts.');
        } catch (error) { throw error instanceof RecoveryBlocked ? error : new RecoveryBlocked('Author or capture receipt cannot be validated.'); }
      } else {
        if (options.preAuthor) {
          try {
            signal.throwIfAborted();
            await options.preAuthor(freeze(structuredClone(task)), signal);
            signal.throwIfAborted();
          } catch { throw new RecoveryBlocked('Author preparation did not complete; no attempt was started.'); }
        }
        task.state = 'ready'; await save(task);
        signal.throwIfAborted();
        await mkdir(directory, { recursive: true });
        task.state = 'running';
        task.attempts.push({ attemptId, sessionRef: directory, startedAt: at(), endedAt: null, outcome: 'running', failure: null });
        await save(task);
        signal.throwIfAborted();
        author = await options.roleFactory({ role: item.role, task: freeze(structuredClone(task)), requirement, validation: options.validation, workspace: item.workspace, stateDirectory: join(directory, 'author'), controller });
        proposal = parseProposal((await author.prompt('Execute this scoped task and return the required JSON proposal.', { signal })).text);
        if (journal) await journal.write('author', attemptId, { proposal, signature: await journal.signature(task.inputs) });
        await author.close(); author = undefined;
        signal.throwIfAborted();
        if (journal) await journal.write('capture-started', attemptId, {});
        captured = await options.capture(freeze(structuredClone(task)), freeze(proposal), signal);
      }
      const hadArtifacts = task.artifacts.length > 0;
      task.artifacts = structuredClone(captured.artifacts);
      if (!continuing || !hadArtifacts) task.handoff = { completed: [proposal.summary], remaining: ['Host verification and independent review', ...proposal.remaining], uncertainty: [...proposal.uncertainty], resumeFrom: task.artifacts[0]?.location ?? directory };
      checked(validateTask(task));
      if (item.expectedArtifacts && (item.expectedArtifacts.length !== task.artifacts.length || item.expectedArtifacts.some(ref => !task.artifacts.some(actual => sameValue(ref, actual))))) throw new Error('Captured outputs do not match the fixed planned artifact versions.');
      if (journal && !continuing) await journal.write('capture', attemptId, { captured, signature: await journal.signature(task.artifacts) });
      if (!sameValue(task, (await controller.read()).tasks.find(t => t.taskId === task.taskId))) await save(task);
      signal.throwIfAborted();
      if (!task.artifacts.length) throw new Error('Host capture returned no versioned output artifacts.');
      failureStage = 'author_handoff';
      if (proposal.remaining.length || proposal.uncertainty.length) throw new Error('Author handoff still has unresolved assigned work or uncertainty.');
      failureStage = 'host_verification';
      const verified = continuing ? await journal!.read<{ evidence: EvidenceContract[]; signature: ContentSignature }>('verified', attemptId) : null;
      if (verified) {
        if (!Array.isArray(verified.evidence) || !Array.isArray(verified.signature)) throw new RecoveryBlocked('Incomplete host evidence receipt.');
        if (task.evidence.length && !sameValue(task.evidence, verified.evidence)) throw new RecoveryBlocked('Recorded host evidence conflicts with the verification receipt.');
        task.evidence = structuredClone(verified.evidence);
        await journal!.requireSignature(verified.signature, [...task.inputs, ...task.artifacts, ...task.evidence.map(e => e.source)]);
      } else {
        if (continuing && (task.evidence.length || await journal!.read('verify-started', attemptId))) throw new RecoveryBlocked('Host verification started without a durable result; do not repeat completed checks blindly.');
        if (journal) await journal.write('verify-started', attemptId, {});
        task.evidence = structuredClone(await options.verify(freeze(structuredClone(task)), signal));
      }
      signal.throwIfAborted();
      try { checked(validateTask(task)); requirePassingEvidence(task, requirement); }
      catch (error) { if (verified) throw new RecoveryBlocked('Recovered host evidence does not satisfy the original acceptance.'); throw error; }
      if (await realpath(item.workspace) === await realpath(captured.reviewWorkspace)) throw new Error('Independent review requires a separate frozen snapshot workspace.');
      if (journal && !verified) await journal.write('verified', attemptId, { evidence: task.evidence, signature: await journal.signature([...task.inputs, ...task.artifacts, ...task.evidence.map(e => e.source)]) });
      if (!sameValue(task, (await controller.read()).tasks.find(t => t.taskId === task.taskId))) await save(task);
      signal.throwIfAborted();
      failureStage = 'independent_review';
      type ReviewReceipt = { verdict: ReturnType<typeof parseReview>; reviewerId: string; contextId: string; completedAt: string; signature: ContentSignature };
      let review = continuing ? await journal!.read<ReviewReceipt>('review', attemptId) : null;
      if (review) {
        try {
          parseReview(JSON.stringify(review.verdict), task);
          if (!review.reviewerId?.trim() || !review.contextId?.trim() || review.reviewerId === task.authorId || review.contextId === task.context.contextId
            || !Number.isFinite(Date.parse(review.completedAt)) || new Date(review.completedAt).toISOString() !== review.completedAt) throw new Error();
          const started = await journal!.read<{ reviewerId: string; contextId: string }>('review-started', attemptId);
          if (task.state !== 'awaiting_review' || !started || started.reviewerId !== review.reviewerId || started.contextId !== review.contextId) throw new Error();
          await requireCorrectionIdentity(directory, { taskId: task.taskId, attemptId, reviewerId: review.reviewerId, contextId: review.contextId });
          await journal!.requireSignature(review.signature, [...task.inputs, ...task.artifacts, ...task.evidence.map(e => e.source)]);
        } catch { throw new RecoveryBlocked('Durable verdict does not establish the exact original versions, evidence and independent reviewer.'); }
      } else {
        if (continuing && (await journal!.read('review-started', attemptId) || await hasHostRecord(directory, 'review-correction.json'))) throw new RecoveryBlocked('Independent review started without a durable valid verdict; do not repeat paid review or reset correction use.');
        const images = structuredClone(await options.reviewImages?.(freeze(structuredClone(task)), signal) ?? []);
        const imageSources = [...task.inputs, ...task.artifacts, ...task.evidence.map(e => e.source)];
        if (images.length > 8 || images.some(item => !imageSources.some(ref => sameValue(ref, item.source)) || item.image.type !== 'image' || !['image/png', 'image/jpeg', 'image/webp'].includes(item.image.mimeType) || typeof item.image.data !== 'string' || !item.image.data.length || item.image.data.length > 8_000_000)) throw new Error('Review images require bounded bytes and fixed artifact or evidence sources.');
        signal.throwIfAborted();
        reviewer = await options.roleFactory({ role: 'reviewer', task: freeze(structuredClone(task)), requirement, validation: options.validation, workspace: captured.reviewWorkspace, stateDirectory: join(directory, 'review'), controller });
        if (reviewer.actorId === task.authorId || reviewer.contextId === task.context.contextId) throw new Error('Reviewer must have an independent actor and context.');
        task.state = 'awaiting_review'; await save(task);
        if (journal) await journal.write('review-started', attemptId, { reviewerId: reviewer.actorId, contextId: reviewer.contextId });
        const verdict = await requestReview({ reviewer, controller, taskId: task.taskId, signal, now: options.now, validation: options.validation ? { binding: options.validation, requirement } : undefined,
          attemptId, correctionRecordPath: join(directory, 'review-correction.json'),
          maxCorrections: options.reviewProtocolCorrections ?? 0, parse: text => parseReview(text, task),
          prompt: `Review the frozen outputs against the supplied acceptance and host evidence. Return the required JSON. Image sources in attachment order: ${JSON.stringify(images.map(item => item.source))}`,
          images: images.length ? images.map(item => item.image) : undefined });
        if (verdict.verdict === 'approved') requirePassingEvidence(task, requirement, verdict.evidenceIds);
        const fixed = journal ? await journal.read<{ signature: ContentSignature }>('verified', attemptId) : null;
        if (journal) await journal.requireSignature(fixed!.signature, [...task.inputs, ...task.artifacts, ...task.evidence.map(e => e.source)]);
        review = { verdict, reviewerId: reviewer.actorId, contextId: reviewer.contextId, completedAt: at(), signature: fixed?.signature ?? [] };
        if (journal) await journal.write('review', attemptId, review);
      }
      const verdict = review.verdict;
      signal.throwIfAborted();
      if (verdict.verdict === 'approved') requirePassingEvidence(task, requirement, verdict.evidenceIds);
      const attempt = task.attempts.at(-1)!;
      if (continuing && attempt.outcome === 'passed' && attempt.endedAt !== review.completedAt) throw new RecoveryBlocked('Completed attempt time conflicts with the original verdict receipt.');
      attempt.endedAt = review.completedAt; attempt.outcome = 'passed';
      task.handoff.remaining = verdict.verdict === 'approved' ? proposal.remaining : verdict.findings;
      await save(task);
      task.review = { reviewerId: review.reviewerId, contextId: review.contextId, inputVersions: verdict.inputVersions, verdict: verdict.verdict, evidenceIds: verdict.evidenceIds };
      task.state = verdict.verdict === 'approved' ? 'passed' : 'needs_changes';
      await validate(task);
      await controller.saveTask(task, { role: 'reviewer', actorId: review.reviewerId });
      if (task.state === 'needs_changes') await persistFeedback(task, undefined, 'independent_review', await controller.read());
      if (task.state === 'passed') { available.push(...task.artifacts); validatedDependencies.add(task.taskId); }
    } catch (error) {
      if (error instanceof RecoveryBlocked) {
        blocked.set(task.taskId, error.message);
        const persisted = (await controller.read()).tasks.find(t => t.taskId === task.taskId);
        if (persisted) Object.assign(task, persisted);
        return;
      }
      // Session/provider messages may contain secrets. Persist stable categories and host-owned context only.
      const cancelled = signal.aborted;
      const reason = cancelled ? 'Task cancelled by the caller or original run limit.' : 'Task failed host validation, execution or independent review; inspect its session and evidence.';
      // Revert only the uncommitted verdict; prior accepted evidence and attempt history stay intact.
      const snapshot = await controller.read();
      const persisted = snapshot.tasks.find(t => t.taskId === task.taskId)!;
      if (resume && !persisted) {
        blocked.set(task.taskId, cancelled ? 'Recovery cancelled before task registration; no work was dispatched.' : 'Recovery stopped before task registration; preserve the original origin and run state.');
        return;
      }
      task.review = persisted.review;
      task.state = cancelled ? 'cancelled' : persisted.state === 'awaiting_review' ? 'waiting_user' : ['ready', 'not_started'].includes(persisted.state) ? 'waiting_user' : 'failed';
      task.stateReason = reason;
      task.handoff.remaining = [task.objective, ...task.handoff.remaining];
      task.handoff.uncertainty.push(reason);
      const attempt = task.attempts.at(-1);
      // Invalid callback data must not poison the durable handoff or feedback.
      if (validateTask(task).length) { task.artifacts = persisted.artifacts; task.evidence = persisted.evidence; }
      if (attempt && persisted.attempts.at(-1)?.outcome === 'running') {
        if (!cancelled) {
          const feedback = await persistFeedback(task, error, failureStage, snapshot);
          attempt.failure = failureRecord(feedback.issues);
        }
        attempt.endedAt = at(); attempt.outcome = cancelled ? 'cancelled' : 'failed';
      }
      await save(task);
    } finally {
      await author?.close(); await reviewer?.close();
      finished.set(task.taskId, task); results.push(structuredClone(task));
    }
  }
  if (options.scheduling) await scheduleTasks({ tasks: ordered, controller, windowId: options.windowId, options: options.scheduling, signal, now: options.now,
    exclusiveReason: resume ? 'recovery' : options.reviewProtocolCorrections === 1 ? 'review_protocol_correction' : null, execute: executeOne });
  else for (const item of ordered) await executeOne(item);
  return { tasks: results, reusedTaskIds, blocked: [...blocked].map(([taskId, reason]) => ({ taskId, reason })) };
}
