import { randomUUID } from 'node:crypto';
import { validateContext, validateExecution, validateTask } from '../../contracts/index.ts';
import { sameValue } from '../../contracts/validation.ts';
import type { ArtifactReference, RequirementContract, TaskContract } from '../../contracts/types.ts';
import type { PreparedTask } from '../orchestrator.ts';
import type { RunSnapshot } from '../run-types.ts';
import { assertOwnership } from '../../roles/factory.ts';
import { FEEDBACK_PREFIX, failureRecord, feedbackReference, validateHostIssues, validatePassedChecks } from './feedback.ts';
import type { RepairFeedback } from './feedback.ts';

export interface RepairPolicy { maxRepairTasks: number; maxTaskAttempts: number; maxNoProgressRounds: number }
/** Conservative initial policy; live game-repair effectiveness is unverified. */
export const DEFAULT_REPAIR_POLICY: Readonly<RepairPolicy> = Object.freeze({ maxRepairTasks: 1, maxTaskAttempts: 2, maxNoProgressRounds: 1 });
export interface RepairOptions {
  snapshot: RunSnapshot; requirement: RequirementContract; history: RepairFeedback[];
  policy: RepairPolicy; now: number; cancelled?: boolean;
  estimate: { costMicroCny: number; durationMs: number; cleanupMs: number };
}
export interface RepairDecision {
  action: 'repair' | 'retry_service' | 'collect_evidence' | 'wait_user' | 'stop' | 'replan';
  reason: string; gaps: RepairFeedback['issues']; artifactVersions: ArtifactReference[];
  preservedPassedTaskIds: string[];
}

function checkHistory(options: RepairOptions): TaskContract[] {
  const { snapshot, history, requirement } = options;
  if (!history.length || new Set(history.map(item => item.sourceTaskId)).size !== history.length) throw new Error('Provide the complete unique repair history.');
  return history.map((feedback, index) => {
    const task = snapshot.tasks.find(item => item.taskId === feedback.sourceTaskId);
    if (!task || validateTask(task).length || feedback.formatVersion !== 1 || !sameValue(feedback.reference, feedbackReference(task))
      || feedback.sourceAttemptId !== task.attempts.at(-1)?.attemptId || feedback.sessionRef !== task.attempts.at(-1)?.sessionRef
      || feedback.runId !== snapshot.run.runId || feedback.specVersion !== requirement.specVersion
      || task.runId !== feedback.runId || task.specVersion !== feedback.specVersion
      || feedback.originalDeadlineAt !== snapshot.run.originalDeadlineAt || feedback.originalDeadlineAt !== task.budget.originalDeadlineAt
      || !sameValue(feedback.artifactVersions, [...task.inputs, ...task.artifacts]) || !sameValue(feedback.acceptance, task.acceptance)) throw new Error('Repair feedback must match the original task, attempt, acceptance and exact snapshot versions.');
    if (!['failed', 'needs_changes', 'waiting_user'].includes(task.state) || task.attempts.at(-1)?.outcome === 'running') throw new Error('Repair history must describe completed unsuccessful attempts.');
    if (!sameValue(task.context.interfaces.filter(ref => ref.artifactId.startsWith(FEEDBACK_PREFIX)), history.slice(0, index).map(item => item.reference))) throw new Error('Repair lineage is incomplete or reordered; task IDs cannot reset history.');
    if (!sameValue(task.acceptanceIds, history[0].acceptance.map(item => item.acceptanceId))
      || task.acceptance.some(item => { const fixed = requirement.acceptance.find(a => a.acceptanceId === item.acceptanceId); return !fixed || !sameValue(fixed.steps, item.steps) || fixed.expected !== item.expected; })) throw new Error('Repair cannot change the fixed acceptance scope or requirements.');
    validateHostIssues(task, feedback.issues);
    validatePassedChecks(task, feedback.issues, feedback.passedChecks);
    return task;
  });
}

/** A pure host decision, not paid admission. The caller persists its gap report;
 * native provider requests must still reserve and admit through RunController. */
export function assessRepair(options: RepairOptions): RepairDecision {
  const { snapshot, history, policy, estimate, now } = options;
  if (![policy.maxRepairTasks, policy.maxTaskAttempts, policy.maxNoProgressRounds, estimate.costMicroCny, estimate.durationMs, estimate.cleanupMs, now].every(value => Number.isSafeInteger(value) && value >= 0)
    || policy.maxTaskAttempts < 1 || policy.maxNoProgressRounds < 1 || estimate.durationMs < 1) throw new Error('Invalid bounded repair policy or estimate.');
  const tasks = checkHistory(options), current = history.at(-1)!;
  const decision = (action: RepairDecision['action'], reason: string): RepairDecision => ({ action, reason,
    gaps: structuredClone(current.issues), artifactVersions: structuredClone(current.artifactVersions), preservedPassedTaskIds: snapshot.tasks.filter(task => task.state === 'passed').map(task => task.taskId) });
  if (options.cancelled || snapshot.stopReason || snapshot.run.state !== 'running') return decision('stop', 'cancelled');
  if (snapshot.ledger.entries.some(entry => entry.unknown || entry.status === 'unknown' || entry.reservedMicroCny > 0)) return decision('stop', 'unknown_charges');
  if (now + estimate.durationMs + estimate.cleanupMs >= Date.parse(snapshot.run.originalDeadlineAt)) return decision('stop', 'deadline');
  if (tasks.reduce((sum, task) => sum + task.attempts.length, 0) >= policy.maxTaskAttempts) return decision('stop', 'attempt_limit');
  if (history.length - 1 >= policy.maxRepairTasks) return decision('stop', 'repair_limit');
  if (snapshot.tasks.some(task => !tasks.includes(task) && task.context.interfaces.some(ref => sameValue(ref, current.reference)))) return decision('stop', 'already_dispatched');
  const committed = snapshot.ledger.entries.reduce((sum, entry) => sum + entry.settledMicroCny + entry.reservedMicroCny, 0);
  const unallocated = snapshot.ledger.limitMicroCny - snapshot.ledger.allocations.reduce((sum, entry) => sum + entry.amountMicroCny, 0);
  if (estimate.costMicroCny > snapshot.ledger.limitMicroCny - committed || estimate.costMicroCny > unallocated) return decision('stop', 'budget');
  let unchanged = 0;
  for (let index = history.length - 1; index > 0; index--) {
    const keys = (item: RepairFeedback) => new Set(item.issues.map(issue => JSON.stringify([issue.acceptanceId, issue.checkId])));
    const prior = keys(history[index - 1]), latest = keys(history[index]);
    // A later check or another execution path may fail after fixing an old one.
    // Only explicit passing host evidence for an old failure proves progress.
    if (history[index].passedChecks.some(check => { const key = JSON.stringify([check.acceptanceId, check.checkId]); return prior.has(key) && !latest.has(key); })) break;
    unchanged++;
  }
  if (unchanged >= policy.maxNoProgressRounds) return decision('replan', 'no_progress');
  if (current.issues.some(issue => issue.classification === 'requirement_conflict')) return decision('wait_user', 'requirement_conflict');
  if (current.issues.some(issue => issue.classification === 'insufficient_evidence')) return decision('collect_evidence', 'insufficient_evidence');
  if (current.issues.some(issue => issue.classification === 'external_service')) return decision('retry_service', 'external_service');
  return decision('repair', 'code_defect');
}

/** Build fresh explicit work; never reopen the source or rewrite its allocation.
 * The source feedback files must be staged as read-only interfaces by the host. */
export function createLinkedRepairTask(options: RepairOptions & {
  source: PreparedTask; taskId: string; allocationMicroCny: number;
  outputs: TaskContract['outputs']; expectedArtifacts: ArtifactReference[];
}): PreparedTask {
  const decision = assessRepair(options);
  if (!['repair', 'retry_service'].includes(decision.action)) throw new Error(`Repair dispatch blocked: ${decision.reason}.`);
  const { snapshot, source } = options, current = options.history.at(-1)!;
  if (!sameValue(source.task, snapshot.tasks.find(task => task.taskId === current.sourceTaskId))) throw new Error('Use the exact persisted source task.');
  if (!options.taskId.trim() || snapshot.run.taskIds.includes(options.taskId)) throw new Error('Repair requires a new task ID.');
  if (!Number.isSafeInteger(options.allocationMicroCny) || options.allocationMicroCny < options.estimate.costMicroCny
    || options.allocationMicroCny > snapshot.ledger.limitMicroCny - snapshot.ledger.allocations.reduce((sum, entry) => sum + entry.amountMicroCny, 0)) throw new Error('Repair needs an explicit available allocation; no reallocation is performed.');
  if (!options.expectedArtifacts.length || options.expectedArtifacts.length !== options.outputs.length
    || validateContext({ contextId: 'outputs', rules: [], interfaces: options.expectedArtifacts, knownFailures: [], tools: [] }).length
    || options.expectedArtifacts.some((ref, index) => ref.location !== options.outputs[index].destination || source.task.artifacts.some(old => old.artifactId === ref.artifactId && (old.version === ref.version || old.location === ref.location)))) throw new Error('Repair outputs require new fixed versions and locations.');
  const task = structuredClone(source.task);
  task.taskId = options.taskId; task.authorId = `author-${randomUUID()}`; task.context.contextId = `author-${randomUUID()}`;
  task.context.interfaces.push(structuredClone(current.reference));
  for (const ref of source.task.artifacts) if (!task.context.interfaces.some(item => sameValue(item, ref))) task.context.interfaces.push(structuredClone(ref));
  task.context.knownFailures.push(failureRecord(current.issues));
  task.context.rules.push(`Read the fixed repair feedback ${current.reference.location}; preserve its acceptance and source attempt. This is logical attempt ${options.history.reduce((sum, item) => sum + snapshot.tasks.find(t => t.taskId === item.sourceTaskId)!.attempts.length, 0) + 1} of ${options.policy.maxTaskAttempts}. New output versions require fresh host checks and independent review.`);
  task.outputs = structuredClone(options.outputs); task.budget.allocationMicroCny = options.allocationMicroCny;
  task.dependsOn = task.dependsOn.map(dep => ({ ...dep, state: snapshot.tasks.find(item => item.taskId === dep.taskId)?.state ?? dep.state }));
  if (task.dependsOn.some(dep => dep.state !== 'passed')) throw new Error('Repair cannot bypass an unpassed dependency.');
  task.state = 'not_started'; task.stateReason = null; task.attempts = []; task.evidence = []; task.artifacts = [];
  task.review = { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] };
  task.handoff = { completed: [], remaining: [task.objective], uncertainty: [], resumeFrom: current.reference.location };
  assertOwnership(task, source.workspace);
  const ledger = structuredClone(snapshot.ledger), run = structuredClone(snapshot.run);
  ledger.allocations.push({ taskId: task.taskId, amountMicroCny: task.budget.allocationMicroCny }); run.taskIds.push(task.taskId);
  const issues = validateExecution({ requirement: options.requirement, task, ledger, run });
  if (issues.length) throw new Error(`Invalid linked repair task: ${issues.map(issue => issue.message).join('; ')}`);
  return { task, role: source.role, workspace: source.workspace, expectedArtifacts: structuredClone(options.expectedArtifacts) };
}
