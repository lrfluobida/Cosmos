import { randomUUID } from 'node:crypto';
import type { ArtifactReference, BudgetLedger, RequirementContract, TaskContract } from '../contracts/index.ts';
import { validateContext, validateExecution, validateTask } from '../contracts/index.ts';
import { sameValue } from '../contracts/validation.ts';
import { pathsOverlap } from '../roles/factory.ts';
import type { PreparedTask } from './orchestrator.ts';
import type { RunSnapshot } from './run-types.ts';
import { requireOriginalTask } from './recovery/task-journal.ts';
import { createLinkedRepairTask, DEFAULT_REPAIR_POLICY } from './repair/policy.ts';
import type { RepairFeedback } from './repair/feedback.ts';

export interface SuccessorTarget {
  sourceTaskId: string; taskId: string; allocationMicroCny: number;
  outputs: TaskContract['outputs']; expectedArtifacts: ArtifactReference[];
  /** Only the repaired author needs the fixed raw failure diagnostics. */
  interfaces?: ArtifactReference[];
}
export interface TaskReplacement {
  sourceTaskId: string; replacementTaskId: string; kind: 'repair' | 'unstarted_successor';
  fromArtifacts: ArtifactReference[]; toArtifacts: ArtifactReference[];
}
export interface RepairContinuationPlan {
  formatVersion: 2;
  runId: string; ledgerId: string; originalStartedAt: string; originalDeadlineAt: string; limitMicroCny: number;
  originalPlan: ArtifactReference; requirement: RequirementContract; failedTaskId: string; feedback: ArtifactReference;
  allocationsBefore: BudgetLedger['allocations']; replacements: TaskReplacement[]; newTaskIds: string[];
  /** Complete effective DAG; unchanged ancestors retain their original prepared contracts. */
  tasks: PreparedTask[];
  reviewProtocolCorrections: 1;
}
export class SuccessorBlocked extends Error {}
const blocked = (message: string): never => { throw new SuccessorBlocked(message); };
const currentTask = (snapshot: RunSnapshot, id: string) => snapshot.tasks.find(task => task.taskId === id) ?? blocked(`Original task is missing: ${id}`);

function ordered(originals: readonly PreparedTask[]): PreparedTask[] {
  if (!originals.length || originals.length > 3 || new Set(originals.map(item => item.task.taskId)).size !== originals.length
    || new Set(originals.map(item => item.role)).size !== originals.length || originals.some(item => !['design', 'art', 'coding'].includes(item.role))) blocked('Successors support only the existing bounded design/art/coding DAG.');
  const result: PreparedTask[] = [], remaining = [...originals];
  while (remaining.length) {
    const index = remaining.findIndex(item => item.task.dependsOn.every(dependency => result.some(parent => parent.task.taskId === dependency.taskId)));
    if (index < 0) blocked('Original dependency graph is missing a task or contains a cycle.');
    const item = remaining.splice(index, 1)[0];
    if (item.task.state !== 'not_started' || item.task.attempts.length || item.task.artifacts.length || item.task.evidence.length || item.task.review.verdict !== 'pending'
      || item.task.review.reviewerId !== null || item.task.review.contextId !== null || item.task.review.inputVersions.length || item.task.review.evidenceIds.length
      || validateTask(item.task).length || !item.expectedArtifacts?.length
      || item.expectedArtifacts.length !== item.task.outputs.length || item.expectedArtifacts.some((ref, i) => ref.location !== item.task.outputs[i].destination)) blocked('Original prepared task or output contract is invalid.');
    result.push(item);
  }
  return result;
}

/** Data qualification only. The caller must separately inspect the original journals and output paths. */
export function findUnstartedSuccessors(snapshot: RunSnapshot, originals: readonly PreparedTask[], failedId: string): PreparedTask[] {
  const tasks = ordered(originals), affected = new Set([failedId]);
  if (!tasks.some(item => item.task.taskId === failedId)) blocked('Failed task does not belong to the original plan.');
  const result: PreparedTask[] = [];
  for (const item of tasks) {
    const current = currentTask(snapshot, item.task.taskId);
    requireOriginalTask(item.task, current);
    if (item.task.taskId === failedId || !item.task.dependsOn.some(dependency => affected.has(dependency.taskId))) continue;
    affected.add(item.task.taskId);
    if (current.state !== 'not_started' && !(current.state === 'waiting_user' && current.stateReason === 'Required dependency has not passed.')) blocked(`Task is not waiting solely on its upstream dependency: ${current.taskId}`);
    if (current.attempts.length || current.artifacts.length || current.evidence.length || current.review.verdict !== 'pending'
      || current.review.reviewerId !== null || current.review.contextId !== null || current.review.inputVersions.length || current.review.evidenceIds.length) blocked(`Successor source already has execution records: ${current.taskId}`);
    if (snapshot.ledger.entries.some(entry => entry.taskId === current.taskId)) blocked(`Successor source already has a request: ${current.taskId}`);
    if (validateTask(current).length) blocked(`Invalid unstarted successor source: ${current.taskId}`);
    result.push(structuredClone(item));
  }
  return result;
}

/** Integer weighted grants from the unused allocation pool; no old grant is reclaimed. */
export function allocateRepairGrants(snapshot: RunSnapshot, sources: readonly PreparedTask[]): Record<string, number> {
  const unused = snapshot.ledger.limitMicroCny - snapshot.ledger.allocations.reduce((sum, entry) => sum + entry.amountMicroCny, 0);
  if (!Number.isSafeInteger(unused) || unused <= 0 || !sources.length || sources.length > 3 || new Set(sources.map(item => item.task.taskId)).size !== sources.length
    || sources.some(item => !Number.isSafeInteger(item.task.budget.allocationMicroCny) || item.task.budget.allocationMicroCny <= 0)) blocked('No valid unallocated group budget.');
  const weight = sources.reduce((sum, item) => sum + BigInt(item.task.budget.allocationMicroCny), 0n);
  const result: Record<string, number> = {}; let used = 0;
  sources.forEach((item, index) => {
    const amount = index === sources.length - 1 ? unused - used : Number(BigInt(unused) * BigInt(item.task.budget.allocationMicroCny) / weight);
    if (amount <= 0) blocked('Unallocated budget cannot give every group member a positive grant.');
    result[item.task.taskId] = amount; used += amount;
  });
  return result;
}

function validateTarget(source: PreparedTask, target: SuccessorTarget, all: readonly PreparedTask[]) {
  const previous = source.expectedArtifacts!;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(target.taskId) || target.outputs.length !== source.task.outputs.length || target.expectedArtifacts.length !== previous.length
    || !Number.isSafeInteger(target.allocationMicroCny) || target.allocationMicroCny <= 0) blocked('Invalid successor identity, grant or output count.');
  const protectedRefs = all.flatMap(item => [...item.task.inputs, ...item.task.context.interfaces, ...item.expectedArtifacts!]);
  if (validateContext({ contextId: 'continuation-output', rules: [], interfaces: target.expectedArtifacts, knownFailures: [], tools: [] }).length) blocked('Invalid fixed continuation outputs.');
  for (const [index, ref] of target.expectedArtifacts.entries()) {
    if (ref.artifactId !== previous[index].artifactId || ref.version === previous[index].version || ref.location !== target.outputs[index].destination
      || target.outputs[index].type !== source.task.outputs[index].type || target.outputs[index].schema !== source.task.outputs[index].schema
      || protectedRefs.some(old => pathsOverlap(old.location, ref.location, source.workspace))) blocked('Continuation output must use a new fixed version without replacing an old destination.');
  }
}
function rebind(refs: ArtifactReference[], replacements: TaskReplacement[]): ArtifactReference[] {
  return refs.map(ref => {
    for (const replacement of replacements) {
      const index = replacement.fromArtifacts.findIndex(old => old.artifactId === ref.artifactId);
      if (index < 0) continue;
      if (!sameValue(ref, replacement.fromArtifacts[index])) blocked(`Cannot prove the original input version for ${ref.artifactId}.`);
      return structuredClone(replacement.toArtifacts[index]);
    }
    return structuredClone(ref);
  });
}

/** Creates a proposal only. The host persists the plan, proves journal safety, and atomically registers its grants. */
export function buildRepairContinuation(options: {
  snapshot: RunSnapshot; originals: readonly PreparedTask[]; requirement: RequirementContract; originalPlan: ArtifactReference;
  failedId: string; feedback: RepairFeedback; targets: readonly SuccessorTarget[]; now: number;
}): RepairContinuationPlan {
  const { snapshot, requirement, failedId, feedback } = options, originals = ordered(options.originals);
  if (snapshot.stopReason || snapshot.run.state !== 'running') blocked('Original run is stopped.');
  if (snapshot.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny)) blocked('Unknown or reserved requests block continuation.');
  const source = originals.find(item => item.task.taskId === failedId) ?? blocked('Missing original repair source.');
  const descendants = findUnstartedSuccessors(snapshot, originals, failedId), sources = [source, ...descendants];
  if (!Number.isSafeInteger(options.now) || options.now + sources.length * 60000 + 5000 >= Date.parse(snapshot.run.originalDeadlineAt)) blocked('Original deadline cannot admit this bounded group.');
  const grants = allocateRepairGrants(snapshot, sources), targets = structuredClone([...options.targets]);
  if (targets.length !== sources.length || new Set(targets.map(item => item.sourceTaskId)).size !== sources.length
    || new Set(targets.map(item => item.taskId)).size !== targets.length || targets.some(target => !sources.some(item => item.task.taskId === target.sourceTaskId)
      || snapshot.run.taskIds.includes(target.taskId) || target.allocationMicroCny !== grants[target.sourceTaskId])) blocked('Continuation target identities or weighted grants do not match the group.');
  for (const item of sources) validateTarget(item, targets.find(target => target.sourceTaskId === item.task.taskId)!, originals);
  for (const item of originals.filter(item => !sources.some(source => source.task.taskId === item.task.taskId))) {
    if (currentTask(snapshot, item.task.taskId).state !== 'passed') blocked('Unchanged ancestors must already have passed.');
  }
  const target = targets.find(item => item.sourceTaskId === failedId)!;
  const repaired = createLinkedRepairTask({ snapshot, requirement, history: [feedback], policy: DEFAULT_REPAIR_POLICY, now: options.now,
    estimate: { costMicroCny: target.allocationMicroCny, durationMs: 60000, cleanupMs: 5000 }, source: { ...source, task: currentTask(snapshot, failedId) },
    taskId: target.taskId, allocationMicroCny: target.allocationMicroCny, outputs: target.outputs, expectedArtifacts: target.expectedArtifacts });
  if (target.interfaces?.length) repaired.task.context.interfaces.push(...structuredClone(target.interfaces));
  const replacements: TaskReplacement[] = [{ sourceTaskId: failedId, replacementTaskId: repaired.task.taskId, kind: 'repair', fromArtifacts: structuredClone(source.expectedArtifacts!), toArtifacts: structuredClone(target.expectedArtifacts) }];
  const created = [repaired];
  for (const item of descendants) {
    const offer = targets.find(target => target.sourceTaskId === item.task.taskId)!;
    if (offer.interfaces?.length) blocked('Unstarted successors cannot add unrelated interfaces.');
    const task = structuredClone(item.task);
    task.taskId = offer.taskId; task.authorId = `author-${randomUUID()}`; task.context.contextId = `author-${randomUUID()}`;
    task.inputs = rebind(task.inputs, replacements); task.context.interfaces = rebind(task.context.interfaces, replacements);
    task.dependsOn = task.dependsOn.map(dependency => {
      const replacement = replacements.find(item => item.sourceTaskId === dependency.taskId);
      return { ...dependency, taskId: replacement?.replacementTaskId ?? dependency.taskId,
        state: replacement ? 'not_started' : currentTask(snapshot, dependency.taskId).state };
    });
    task.outputs = structuredClone(offer.outputs); task.budget.allocationMicroCny = offer.allocationMicroCny;
    task.context.rules.push(`This is the first attempt of original logical task ${item.task.taskId}, after its upstream repair. Use only the exact listed dependency versions; original requirements and write scope are unchanged.`);
    created.push({ ...structuredClone(item), task, expectedArtifacts: structuredClone(offer.expectedArtifacts) });
    replacements.push({ sourceTaskId: item.task.taskId, replacementTaskId: task.taskId, kind: 'unstarted_successor', fromArtifacts: structuredClone(item.expectedArtifacts!), toArtifacts: structuredClone(offer.expectedArtifacts) });
  }
  const ledger = structuredClone(snapshot.ledger), run = structuredClone(snapshot.run);
  for (const item of created) { ledger.allocations.push({ taskId: item.task.taskId, amountMicroCny: item.task.budget.allocationMicroCny }); run.taskIds.push(item.task.taskId); }
  for (const item of created) if (validateExecution({ requirement, task: item.task, ledger, run }).length) blocked('Derived continuation task failed the original execution contract.');
  const tasks = originals.map(item => created.find(created => replacements.some(replacement => replacement.sourceTaskId === item.task.taskId && replacement.replacementTaskId === created.task.taskId)) ?? structuredClone(item));
  return { formatVersion: 2, runId: run.runId, ledgerId: ledger.ledgerId, originalStartedAt: run.originalStartedAt, originalDeadlineAt: run.originalDeadlineAt, limitMicroCny: ledger.limitMicroCny,
    originalPlan: structuredClone(options.originalPlan), requirement: structuredClone(requirement), failedTaskId: failedId, feedback: structuredClone(feedback.reference),
    allocationsBefore: structuredClone(snapshot.ledger.allocations), replacements, newTaskIds: created.map(item => item.task.taskId), tasks, reviewProtocolCorrections: 1 };
}
