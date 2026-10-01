import { randomUUID } from 'node:crypto';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ImageContent } from '@earendil-works/pi-ai';
import { validateExecution, validateRequirement, validateTask, validateTaskInputs } from '../contracts/index.ts';
import { sameValue } from '../contracts/validation.ts';
import type { ArtifactReference, EvidenceContract, RequirementContract, TaskContract } from '../contracts/index.ts';
import type { RunController } from './run.ts';
import { assertOwnership, pathsOverlap } from '../roles/factory.ts';
import type { AuthorRole, CreatedRole, RoleFactory } from '../roles/factory.ts';
import { freeze } from '../roles/requirements.ts';
import { requestReview, validateProtocolCorrections } from './repair/protocol.ts';
import { buildRepairFeedback, failureRecord } from './repair/feedback.ts';
import type { FailureStage, HostFailure } from './repair/feedback.ts';

export interface PreparedTask { task: TaskContract; role: AuthorRole; workspace: string; expectedArtifacts?: ArtifactReference[] }
export interface AuthorProposal { summary: string; remaining: string[]; uncertainty: string[] }
export interface DagOptions {
  controller: RunController;
  requirement: RequirementContract;
  tasks: PreparedTask[];
  sessionRoot: string;
  availableArtifacts: ArtifactReference[];
  roleFactory: RoleFactory;
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
}

function checked(issues: { message: string }[]): void {
  if (issues.length) throw new Error(issues.map(issue => issue.message).join('; '));
}
function parseProposal(text: string): AuthorProposal {
  const value = JSON.parse(text);
  if (!value || typeof value.summary !== 'string' || !value.summary.trim() || !['remaining', 'uncertainty'].every(key => Array.isArray(value[key]) && value[key].every((s: unknown) => typeof s === 'string')) || Object.keys(value).some(key => !['summary', 'remaining', 'uncertainty'].includes(key))) throw new Error('Invalid author proposal.');
  return value;
}
function parseReview(text: string, task: TaskContract) {
  const value = JSON.parse(text);
  if (!value || !['approved', 'changes_requested'].includes(value.verdict) || !Array.isArray(value.findings) || !value.findings.every((s: unknown) => typeof s === 'string') || Object.keys(value).some(key => !['verdict', 'inputVersions', 'evidenceIds', 'findings'].includes(key))) throw new Error('Invalid independent review proposal.');
  if (!sameValue(value.inputVersions, [...task.inputs, ...task.artifacts])) throw new Error('Review input versions are stale or incomplete.');
  if (!Array.isArray(value.evidenceIds) || !value.evidenceIds.length || value.evidenceIds.some((id: string) => !task.evidence.some(e => e.evidenceId === id))) throw new Error('Review must reference host evidence.');
  if (value.verdict === 'approved' && value.findings.length) throw new Error('Unresolved review findings cannot approve a task.');
  if (value.verdict === 'changes_requested' && !value.findings.length) throw new Error('Requested changes require findings.');
  return value as { verdict: 'approved' | 'changes_requested'; inputVersions: ArtifactReference[]; evidenceIds: string[]; findings: string[] };
}

function requirePassingEvidence(task: TaskContract, requirement: RequirementContract, selectedIds = task.evidence.map(e => e.evidenceId)): void {
  for (const id of task.acceptanceIds) {
    const accepted = requirement.acceptance.find(a => a.acceptanceId === id)!;
    if (!task.evidence.some(e => selectedIds.includes(e.evidenceId) && e.outcome === 'passed' && e.acceptanceIds.includes(id) && accepted.evidenceKinds.includes(e.kind) && [...task.inputs, ...task.artifacts].every(ref => e.artifactVersions.some(version => sameValue(ref, version))))) throw new Error(`Missing selected host evidence for ${id} at the fixed input and output versions.`);
  }
}

/** One bounded attempt per prepared task. Repairs/replanning create explicit subsequent work. */
export async function executeTaskDag(options: DagOptions): Promise<TaskContract[]> {
  const { controller } = options;
  validateProtocolCorrections(options.reviewProtocolCorrections ?? 0);
  const requirement = freeze(structuredClone(options.requirement));
  checked(validateRequirement(requirement));
  const prepared = structuredClone(options.tasks);
  if (!prepared.length || prepared.length > 100 || new Set(prepared.map(p => p.task.taskId)).size !== prepared.length) throw new Error('DAG requires 1 to 100 unique tasks.');
  const initial = await controller.read();
  const prior = new Map(initial.tasks.map(task => [task.taskId, task]));
  for (const item of prepared) {
    item.workspace = await realpath(item.workspace);
    checked(validateTask(item.task)); assertOwnership(item.task, item.workspace);
    if (!['cosmos', 'design', 'coding', 'art'].includes(item.role)) throw new Error('Invalid author role.');
    if (prior.has(item.task.taskId)) throw new Error('Task already recorded; reuse its result or create explicit new work.');
    if (item.task.state !== 'not_started') throw new Error('Prepared tasks must be not_started.');
    if (item.task.dependsOn.some(dep => !prior.has(dep.taskId) && !prepared.some(p => p.task.taskId === dep.taskId))) throw new Error('Missing dependency task.');
    const simulation = structuredClone(initial);
    if (!simulation.ledger.allocations.some(a => a.taskId === item.task.taskId)) {
      simulation.ledger.allocations.push({ taskId: item.task.taskId, amountMicroCny: item.task.budget.allocationMicroCny });
      simulation.run.taskIds.push(item.task.taskId);
    }
    checked(validateExecution({ requirement, task: item.task, ledger: simulation.ledger, run: simulation.run }));
  }
  const ordered: PreparedTask[] = [], remaining = [...prepared];
  while (remaining.length) {
    const index = remaining.findIndex(item => item.task.dependsOn.every(dep => prior.has(dep.taskId) || ordered.some(p => p.task.taskId === dep.taskId)));
    if (index < 0) throw new Error('Dependency cycle.');
    ordered.push(remaining.splice(index, 1)[0]);
  }
  for (let i = 0; i < prepared.length; i++) for (let j = i + 1; j < prepared.length; j++) {
    if (prepared[i].workspace === prepared[j].workspace && prepared[i].task.ownership.writePaths.some(a => prepared[j].task.ownership.writePaths.some(b => pathsOverlap(a, b, prepared[i].workspace)))) throw new Error('Task write paths conflict in the same workspace.');
  }
  await controller.registerTasks(prepared.map(p => p.task));
  const signal = AbortSignal.any([controller.signal, ...(options.signal ? [options.signal] : [])]);
  const available = structuredClone(options.availableArtifacts);
  const finished = new Map(prior);
  const results: TaskContract[] = [];
  const at = () => new Date((options.now ?? Date.now)()).toISOString();
  async function save(task: TaskContract) { await controller.saveTask(task, { role: 'system', actorId: 'orchestrator' }); }
  async function validate(task: TaskContract) {
    const current = await controller.read();
    checked(validateExecution({ requirement, task, ledger: current.ledger, run: current.run }));
  }

  for (const item of ordered) {
    const task = item.task;
    task.dependsOn = task.dependsOn.map(dep => ({ ...dep, state: finished.get(dep.taskId)!.state }));
    let author: CreatedRole | undefined, reviewer: CreatedRole | undefined;
    let failureStage: FailureStage = 'execution';
    try {
      signal.throwIfAborted();
      if (task.dependsOn.some(dep => dep.state !== 'passed')) {
        task.state = 'waiting_user'; task.stateReason = 'Required dependency has not passed.';
        task.handoff.remaining = [task.objective]; await save(task); continue;
      }
      checked(validateTaskInputs(task, available));
      task.state = 'ready'; await save(task);
      signal.throwIfAborted();
      const attemptId = randomUUID(), directory = join(options.sessionRoot, attemptId);
      await mkdir(directory, { recursive: true });
      task.state = 'running';
      task.attempts.push({ attemptId, sessionRef: directory, startedAt: at(), endedAt: null, outcome: 'running', failure: null });
      await save(task);
      signal.throwIfAborted();
      author = await options.roleFactory({ role: item.role, task: freeze(structuredClone(task)), requirement, workspace: item.workspace, stateDirectory: join(directory, 'author'), controller });
      const proposal = parseProposal((await author.prompt('Execute this scoped task and return the required JSON proposal.', { signal })).text);
      await author.close(); author = undefined;
      signal.throwIfAborted();
      const captured = await options.capture(freeze(structuredClone(task)), freeze(proposal), signal);
      task.artifacts = structuredClone(captured.artifacts);
      task.handoff = { completed: [proposal.summary], remaining: ['Host verification and independent review', ...proposal.remaining], uncertainty: [...proposal.uncertainty], resumeFrom: task.artifacts[0]?.location ?? directory };
      checked(validateTask(task));
      if (item.expectedArtifacts && (item.expectedArtifacts.length !== task.artifacts.length || item.expectedArtifacts.some(ref => !task.artifacts.some(actual => sameValue(ref, actual))))) throw new Error('Captured outputs do not match the fixed planned artifact versions.');
      await save(task);
      signal.throwIfAborted();
      if (!task.artifacts.length) throw new Error('Host capture returned no versioned output artifacts.');
      failureStage = 'author_handoff';
      if (proposal.remaining.length || proposal.uncertainty.length) throw new Error('Author handoff still has unresolved assigned work or uncertainty.');
      failureStage = 'host_verification';
      task.evidence = structuredClone(await options.verify(freeze(structuredClone(task)), signal));
      signal.throwIfAborted();
      checked(validateTask(task));
      requirePassingEvidence(task, requirement);
      if (await realpath(item.workspace) === await realpath(captured.reviewWorkspace)) throw new Error('Independent review requires a separate frozen snapshot workspace.');
      await save(task);
      signal.throwIfAborted();
      const images = structuredClone(await options.reviewImages?.(freeze(structuredClone(task)), signal) ?? []);
      const imageSources = [...task.inputs, ...task.artifacts, ...task.evidence.map(e => e.source)];
      if (images.length > 8 || images.some(item => !imageSources.some(ref => sameValue(ref, item.source)) || item.image.type !== 'image' || !['image/png', 'image/jpeg', 'image/webp'].includes(item.image.mimeType) || typeof item.image.data !== 'string' || !item.image.data.length || item.image.data.length > 8_000_000)) throw new Error('Review images require bounded bytes and fixed artifact or evidence sources.');
      signal.throwIfAborted();
      reviewer = await options.roleFactory({ role: 'reviewer', task: freeze(structuredClone(task)), requirement, workspace: captured.reviewWorkspace, stateDirectory: join(directory, 'review'), controller });
      if (reviewer.actorId === task.authorId || reviewer.contextId === task.context.contextId) throw new Error('Reviewer must have an independent actor and context.');
      task.state = 'awaiting_review'; await save(task);
      failureStage = 'independent_review';
      const verdict = await requestReview({ reviewer, controller, taskId: task.taskId, signal, now: options.now,
        attemptId, correctionRecordPath: join(directory, 'review-correction.json'),
        maxCorrections: options.reviewProtocolCorrections ?? 0, parse: text => parseReview(text, task),
        prompt: `Review the frozen outputs against the supplied acceptance and host evidence. Return the required JSON. Image sources in attachment order: ${JSON.stringify(images.map(item => item.source))}`,
        images: images.length ? images.map(item => item.image) : undefined });
      signal.throwIfAborted();
      if (verdict.verdict === 'approved') requirePassingEvidence(task, requirement, verdict.evidenceIds);
      const attempt = task.attempts.at(-1)!;
      attempt.endedAt = at(); attempt.outcome = 'passed';
      task.handoff.remaining = verdict.verdict === 'approved' ? proposal.remaining : verdict.findings;
      await save(task);
      task.review = { reviewerId: reviewer.actorId, contextId: reviewer.contextId, inputVersions: verdict.inputVersions, verdict: verdict.verdict, evidenceIds: verdict.evidenceIds };
      task.state = verdict.verdict === 'approved' ? 'passed' : 'needs_changes';
      await validate(task);
      await controller.saveTask(task, { role: 'reviewer', actorId: reviewer.actorId });
      if (task.state === 'passed') available.push(...task.artifacts);
    } catch (error) {
      // Session/provider messages may contain secrets. Persist stable categories and host-owned context only.
      const cancelled = signal.aborted;
      const reason = cancelled ? 'Task cancelled by the caller or original run limit.' : 'Task failed host validation, execution or independent review; inspect its session and evidence.';
      // Revert only the uncommitted verdict; prior accepted evidence and attempt history stay intact.
      const snapshot = await controller.read();
      const persisted = snapshot.tasks.find(t => t.taskId === task.taskId)!;
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
          let feedback: ReturnType<typeof buildRepairFeedback>;
          try {
            const diagnostic = options.diagnoseFailure?.(freeze(structuredClone(task)), failureStage) ?? error;
            feedback = buildRepairFeedback(task, diagnostic, failureStage, snapshot);
          } catch {
            // A malformed host adapter cannot replace fixed acceptance or prevent
            // the failed attempt from being saved. Never persist its exception.
            feedback = buildRepairFeedback(task, undefined, failureStage, snapshot);
          }
          await writeFile(join(attempt.sessionRef, 'failure.json'), JSON.stringify(feedback, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
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
  return results;
}
