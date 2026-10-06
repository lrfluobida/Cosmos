import { createHash, randomUUID } from 'node:crypto';
import { lstat, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { regularFile, safePath, snapshot as fileSnapshot, within } from '../artifacts/paths.ts';
import type { ArtifactReference, BudgetLedger, RequirementContract, TaskContract } from '../contracts/index.ts';
import { validateContext, validateExecution, validateTask } from '../contracts/index.ts';
import { sameValue } from '../contracts/validation.ts';
import { pathsOverlap } from '../roles/factory.ts';
import type { PreparedTask } from './orchestrator.ts';
import type { RunSnapshot } from './run-types.ts';
import { requireOriginalTask, TaskJournal } from './recovery/task-journal.ts';
import { publishReceipt } from './recovery/receipt-file.ts';
import type { RunController } from './run.ts';
import { createLinkedRepairTask, DEFAULT_REPAIR_POLICY } from './repair/policy.ts';
import { failureRecord, feedbackReference, validateHostIssues, validatePassedChecks } from './repair/feedback.ts';
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
  /** Sealed before publication; only the preserved diagnostic manifest and its raw files are hashed. */
  diagnosticSignatures?: { reference: ArtifactReference; files: { path: string; sha256: string }[] }[];
}
export class SuccessorBlocked extends Error {}
const blocked = (message: string): never => { throw new SuccessorBlocked(message); };
const currentTask = (snapshot: RunSnapshot, id: string) => snapshot.tasks.find(task => task.taskId === id) ?? blocked(`Original task is missing: ${id}`);
const moduleIds = ['COSMOS-MODULE-A', 'COSMOS-MODULE-B'];
const isModule = (item: PreparedTask) => item.role === 'coding' && item.task.acceptanceIds.length === 1 && moduleIds.includes(item.task.acceptanceIds[0]);
function modularDag(originals: readonly PreparedTask[]): boolean {
  return originals.length === 5 && ['design', 'art'].every(role => originals.filter(item => item.role === role).length === 1)
    && originals.filter(item => item.role === 'coding' && !isModule(item)).length === 1 && moduleIds.every((id, index) => originals.filter(item => isModule(item)
      && item.task.acceptanceIds[0] === id && item.expectedArtifacts?.length === 1 && item.expectedArtifacts[0].artifactId === `module-${index ? 'b' : 'a'}`
      && item.expectedArtifacts[0].version === 'v1' && item.task.outputs[0].schema === 'modular-code/1').length === 1);
}

function ordered(originals: readonly PreparedTask[]): PreparedTask[] {
  const modular = modularDag(originals);
  if (!originals.length || !modular && (originals.length > 3 || new Set(originals.map(item => item.role)).size !== originals.length)
    || new Set(originals.map(item => item.task.taskId)).size !== originals.length || originals.some(item => !['design', 'art', 'coding'].includes(item.role))) blocked('Successors require the original bounded role DAG or fixed five-task modular DAG.');
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
  if (modularDag(originals) && !originals.some(item => item.task.taskId === failedId && item.role === 'coding' && !isModule(item))) blocked('Modular repairs support only final integration; preserve module failures without rebinding.');
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
  return weightedGrants(unused, sources);
}
function weightedGrants(unused: number, sources: readonly PreparedTask[]): Record<string, number> {
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
  requireDistinctOutputs(targets.flatMap(target => target.expectedArtifacts), source.workspace);
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
    task.context.rules.push(successorRule(item.task.taskId));
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

function relativeName(root: string, path: string): string {
  const absolute = resolve(root, path);
  if (absolute === resolve(root) || !within(root, absolute)) blocked('Continuation reference escapes its host root.');
  return relative(root, absolute).split(sep).join('/');
}
async function readJson(root: string, name: string): Promise<any> {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, relativeName(root, name))));
}
async function exists(root: string, name: string): Promise<boolean> {
  try { await lstat(await safePath(root, relativeName(root, name))); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
async function requireEmptyScope(root: string, name: string): Promise<void> {
  if (!await exists(root, name)) return;
  const path = await safePath(root, relativeName(root, name));
  if (!(await lstat(path)).isDirectory() || (await fileSnapshot(path)).size) blocked('Unstarted source has prior author writes.');
}
const successorRule = (taskId: string) => `This is the first attempt of original logical task ${taskId}, after its upstream repair. Use only the exact listed dependency versions; original requirements and write scope are unchanged.`;
function requireDistinctOutputs(refs: ArtifactReference[], workspace: string) {
  if (refs.some((ref, index) => refs.slice(0, index).some(prior => pathsOverlap(prior.location, ref.location, workspace)))) blocked('Continuation output destinations overlap.');
}

async function diagnosticSignatures(root: string, plan: RepairContinuationPlan) {
  const repairedId = plan.replacements.find(item => item.sourceTaskId === plan.failedTaskId)?.replacementTaskId;
  const repaired = plan.tasks.find(item => item.task.taskId === repairedId) ?? blocked('Missing repair diagnostic owner.');
  const references = repaired.task.context.interfaces.filter(ref => ref.artifactId === `failure-source-${plan.failedTaskId}`);
  const signatures: NonNullable<RepairContinuationPlan['diagnosticSignatures']> = [];
  for (const reference of references) {
    const folder = await safePath(root, reference.location), manifestBytes = await regularFile(folder, 'manifest.json');
    const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes));
    if (!Array.isArray(manifest.files) || !manifest.files.length || manifest.files.some((file: any) => typeof file.present !== 'boolean')) blocked('Incomplete fixed diagnostic manifest.');
    const files = [{ path: 'manifest.json', sha256: createHash('sha256').update(manifestBytes).digest('hex') }];
    for (const file of manifest.files.filter((file: any) => file.present)) {
      if (files.some(item => item.path === file.snapshotPath)) blocked('Duplicate fixed diagnostic path.');
      const bytes = await regularFile(folder, file.snapshotPath); new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      files.push({ path: file.snapshotPath, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    signatures.push({ reference: structuredClone(reference), files });
  }
  return signatures;
}

/** Seal the narrow raw diagnostic inputs once, before the write-once group plan exists. */
export async function sealRepairDiagnostics(root: string, plan: RepairContinuationPlan): Promise<RepairContinuationPlan> {
  if (plan.diagnosticSignatures !== undefined || await exists(root, 'repair-plan.json')) blocked('Repair diagnostic signatures are already fixed.');
  const state = await readJson(root, 'snapshot.json') as RunSnapshot;
  if (plan.newTaskIds.some(id => state.tasks.some(task => task.taskId === id))) blocked('Cannot seal diagnostic content after group registration.');
  return { ...structuredClone(plan), diagnosticSignatures: await diagnosticSignatures(root, plan) };
}

/** Checks the fixed proposal against the original contracts, even after its tasks have run. */
function validateContinuation(plan: RepairContinuationPlan, state: RunSnapshot, originals: readonly PreparedTask[], requirement: RequirementContract, originalPlan: ArtifactReference, feedback: RepairFeedback) {
  if (plan.formatVersion !== 2 || plan.runId !== state.run.runId || plan.ledgerId !== state.ledger.ledgerId || plan.originalStartedAt !== state.run.originalStartedAt
    || plan.originalDeadlineAt !== state.run.originalDeadlineAt || plan.limitMicroCny !== state.ledger.limitMicroCny || plan.reviewProtocolCorrections !== 1
    || !sameValue(plan.requirement, requirement) || !sameValue(plan.originalPlan, originalPlan) || !Array.isArray(plan.replacements) || !Array.isArray(plan.newTaskIds)
    || !Array.isArray(plan.tasks) || plan.tasks.length !== originals.length || !Array.isArray(plan.allocationsBefore)) blocked('Continuation identity or original plan changed.');
  const source = originals.find(item => item.task.taskId === plan.failedTaskId) ?? blocked('Missing original repair source.');
  const failed = currentTask(state, source.task.taskId), attempt = failed.attempts.at(-1);
  if (!attempt || attempt.outcome === 'running' || !['failed', 'needs_changes', 'waiting_user'].includes(failed.state)
    || failed.context.interfaces.some(ref => ref.artifactId.startsWith('repair-feedback-')) || failed.attempts.length >= DEFAULT_REPAIR_POLICY.maxTaskAttempts
    || feedback.formatVersion !== 1 || !sameValue(feedback.reference, plan.feedback) || !sameValue(feedback.reference, feedbackReference(failed))
    || feedback.sourceTaskId !== failed.taskId || feedback.sourceAttemptId !== attempt.attemptId || feedback.sessionRef !== attempt.sessionRef
    || feedback.runId !== plan.runId || feedback.specVersion !== requirement.specVersion || feedback.originalDeadlineAt !== plan.originalDeadlineAt
    || !sameValue(feedback.acceptance, failed.acceptance) || !sameValue(feedback.artifactVersions, [...failed.inputs, ...failed.artifacts])
    || feedback.issues.some(issue => issue.classification !== 'code_defect')) blocked('Continuation must retain its one completed semantic repair and exact feedback.');
  validateHostIssues(failed, feedback.issues); validatePassedChecks(failed, feedback.issues, feedback.passedChecks);
  const sources = [source, ...findUnstartedSuccessors(state, originals, plan.failedTaskId)];
  if (!sameValue(plan.replacements.map(item => item.sourceTaskId), sources.map(item => item.task.taskId))
    || !sameValue(plan.newTaskIds, plan.replacements.map(item => item.replacementTaskId)) || new Set(plan.newTaskIds).size !== sources.length
    || plan.newTaskIds.some(id => originals.some(item => item.task.taskId === id))) blocked('Continuation replacement map changed.');
  const registered = plan.newTaskIds.filter(id => state.tasks.some(task => task.taskId === id));
  if (registered.length && registered.length !== plan.newTaskIds.length) blocked('Partial group registration is not recoverable.');
  const additions = plan.newTaskIds.map(id => plan.tasks.find(item => item.task.taskId === id) ?? blocked('Missing planned successor.'));
  if (!sameValue(plan.tasks.map(item => item.task.taskId), originals.map(item => plan.replacements.find(replacement => replacement.sourceTaskId === item.task.taskId)?.replacementTaskId ?? item.task.taskId))) blocked('Effective DAG order changed.');
  for (const key of ['authorId', 'contextId'] as const) {
    const id = (item: PreparedTask) => key === 'authorId' ? item.task.authorId : item.task.context.contextId;
    const fresh = additions.map(id), old = originals.map(id);
    if (new Set(fresh).size !== fresh.length || fresh.some(value => old.includes(value))) blocked('Continuation authors and contexts must be fresh.');
  }
  requireDistinctOutputs(additions.flatMap(item => item.expectedArtifacts!), source.workspace);
  const allocations = [...plan.allocationsBefore, ...additions.map(item => ({ taskId: item.task.taskId, amountMicroCny: item.task.budget.allocationMicroCny }))];
  if (!sameValue(state.ledger.allocations, registered.length ? allocations : plan.allocationsBefore)) blocked('Continuation allocations or registration changed.');
  // This is allocation arithmetic only; settled requests and the live ledger are never removed or rewritten.
  const grants = weightedGrants(plan.limitMicroCny - plan.allocationsBefore.reduce((sum, allocation) => sum + allocation.amountMicroCny, 0), sources);
  const projected = registered.length ? state : { ...state, ledger: { ...state.ledger, allocations }, run: { ...state.run, taskIds: [...state.run.taskIds, ...plan.newTaskIds] } };
  const previous: TaskReplacement[] = [];
  for (const [index, item] of sources.entries()) {
    const replacement = plan.replacements[index], proposed = additions[index], next = proposed.task;
    if (replacement.kind !== (index === 0 ? 'repair' : 'unstarted_successor') || !sameValue(replacement.fromArtifacts, item.expectedArtifacts)
      || !sameValue(replacement.toArtifacts, proposed.expectedArtifacts) || next.budget.allocationMicroCny !== grants[item.task.taskId]
      || next.authorId === item.task.authorId || next.context.contextId === item.task.context.contextId) blocked('Continuation lineage or weighted grant changed.');
    validateTarget(item, { sourceTaskId: item.task.taskId, taskId: next.taskId, allocationMicroCny: next.budget.allocationMicroCny, outputs: next.outputs, expectedArtifacts: proposed.expectedArtifacts! }, originals);
    const expected = structuredClone(index === 0 ? failed : item.task);
    expected.taskId = next.taskId; expected.authorId = next.authorId; expected.context.contextId = next.context.contextId;
    expected.outputs = structuredClone(next.outputs); expected.budget.allocationMicroCny = grants[item.task.taskId];
    expected.dependsOn = expected.dependsOn.map(dep => ({ ...dep, taskId: previous.find(prior => prior.sourceTaskId === dep.taskId)?.replacementTaskId ?? dep.taskId,
      state: previous.some(prior => prior.sourceTaskId === dep.taskId) ? 'not_started' : currentTask(state, dep.taskId).state }));
    if (index === 0) {
      expected.context.interfaces.push(structuredClone(feedback.reference));
      for (const ref of failed.artifacts) {
        const at = expected.context.interfaces.findIndex(item => item.artifactId === ref.artifactId);
        if (at < 0) expected.context.interfaces.push(structuredClone(ref)); else expected.context.interfaces[at] = structuredClone(ref);
      }
      const diagnostics = next.context.interfaces.slice(expected.context.interfaces.length);
      if (diagnostics.some(ref => ref.artifactId !== `failure-source-${failed.taskId}` || ref.version !== attempt!.attemptId)) blocked('Unrelated repair diagnostics.');
      expected.context.interfaces.push(...structuredClone(diagnostics));
      expected.context.knownFailures.push(failureRecord(feedback.issues));
      expected.context.rules.push(`Read the fixed repair feedback ${feedback.reference.location}; preserve its acceptance and source attempt. This is logical attempt ${failed.attempts.length + 1} of ${DEFAULT_REPAIR_POLICY.maxTaskAttempts}. New output versions require fresh host checks and independent review.`);
      expected.state = 'not_started'; expected.stateReason = null; expected.attempts = []; expected.artifacts = []; expected.evidence = [];
      expected.review = { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] };
      expected.handoff = { completed: [], remaining: [expected.objective], uncertainty: [], resumeFrom: feedback.reference.location };
    } else {
      expected.inputs = rebind(expected.inputs, previous); expected.context.interfaces = rebind(expected.context.interfaces, previous);
      expected.context.rules.push(successorRule(item.task.taskId));
    }
    if (!sameValue(proposed, { ...item, task: expected, expectedArtifacts: replacement.toArtifacts })
      || validateExecution({ requirement, task: next, ledger: projected.ledger, run: projected.run }).length) blocked('Derived continuation contract changed.');
    if (registered.length) requireOriginalTask(next, currentTask(state, next.taskId));
    previous.push(replacement);
  }
  for (const item of originals.filter(item => !sources.some(source => source.task.taskId === item.task.taskId))) {
    if (currentTask(state, item.task.taskId).state !== 'passed' || !sameValue(plan.tasks.find(task => task.task.taskId === item.task.taskId), item)) blocked('Unchanged passed ancestor changed.');
  }
  return { additions, registered: registered.length > 0, failed };
}

/** Complete only provably unstarted origins, then append the entire group in one snapshot commit. */
export async function prepareRepairContinuation(options: { root: string; controller: RunController; plan: RepairContinuationPlan;
  originals: readonly PreparedTask[]; requirement: RequirementContract; originalPlan: ArtifactReference; now: number }): Promise<void> {
  const { root, controller, plan, requirement, originalPlan } = options, originals = ordered(options.originals), state = await controller.read();
  const native = await readJson(root, originalPlan.location);
  if (native.status !== 'validated_proposal' || native.specVersion !== requirement.specVersion || !sameValue(native.tasks, options.originals)) blocked('Original native plan is missing or changed.');
  const prior = await exists(root, 'repair-plan.json') ? await readJson(root, 'repair-plan.json') : null;
  if (prior && !sameValue(prior, plan)) blocked('Write-once repair plan changed.');
  const feedback = await readJson(root, plan.feedback.location) as RepairFeedback;
  const { additions, registered, failed } = validateContinuation(plan, state, originals, requirement, originalPlan, feedback);
  if (registered && !prior) blocked('Registered group has no fixed repair plan.');
  if (!Array.isArray(plan.diagnosticSignatures) || !sameValue(plan.diagnosticSignatures, await diagnosticSignatures(root, plan))) blocked('Fixed diagnostic content signature changed.');
  if (state.stopReason || state.run.state !== 'running' || state.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny)
    || options.now >= Date.parse(state.run.originalDeadlineAt) || !registered && options.now + additions.length * 60000 + 5000 >= Date.parse(state.run.originalDeadlineAt)) blocked('Original admission, charges or deadline block continuation.');
  const recovery = { journalRoot: join(root, 'journal'), artifactRoot: root };
  const origin = (prepared: PreparedTask) => ({ formatVersion: 1 as const, runId: plan.runId, ledgerId: plan.ledgerId, originalStartedAt: plan.originalStartedAt,
    originalDeadlineAt: plan.originalDeadlineAt, limitMicroCny: plan.limitMicroCny, requirement, prepared, reviewProtocolCorrections: plan.reviewProtocolCorrections,
    artifactRoot: root, sessionRoot: join(root, 'sessions') });
  for (const item of originals) await TaskJournal.open(recovery, origin(item), true);
  for (const replacement of plan.replacements.filter(item => item.kind === 'unstarted_successor')) {
    const source = originals.find(item => item.task.taskId === replacement.sourceTaskId)!;
    const folder = await safePath(recovery.journalRoot, `task-${encodeURIComponent(source.task.taskId)}`);
    if ((await readdir(folder)).some(name => name !== 'origin.json')) blocked('Unstarted source has execution receipts.');
    for (const ref of source.expectedArtifacts!) if (await exists(root, ref.location)) blocked('Unstarted source has prior output.');
    const next = state.tasks.find(item => item.taskId === replacement.replacementTaskId);
    if (!next?.attempts.length) {
      if (state.ledger.entries.some(entry => entry.taskId === replacement.replacementTaskId)) blocked('Unstarted successor already has a request.');
      for (const path of source.task.ownership.writePaths) await requireEmptyScope(root, path);
    }
  }
  const repaired = additions[0], diagnostics = repaired.task.context.interfaces.filter(ref => ref.artifactId === `failure-source-${failed.taskId}`);
  if (!failed.artifacts.length && !diagnostics.length) blocked('Original failed output or raw failure source is not preserved.');
  for (const ref of failed.artifacts) if (!await exists(root, ref.location)) blocked('Original failed artifact is missing.');
  for (const ref of diagnostics) {
    const manifest = await readJson(root, `${ref.location}/manifest.json`), attempt = failed.attempts.at(-1)!;
    if (manifest.formatVersion !== 1 || manifest.runId !== plan.runId || manifest.taskId !== failed.taskId || manifest.attemptId !== attempt.attemptId
      || manifest.sessionRef !== attempt.sessionRef || !sameValue(manifest.inputs, failed.inputs) || !Array.isArray(manifest.files) || !manifest.files.length
      || !['missing_output', 'invalid_json', 'invalid_schema'].includes(manifest.diagnosis?.kind)
      || !feedback.issues.some(issue => issue.evidenceRefs.includes(`${ref.location}/manifest.json`))) blocked('Raw failure source identity or evidence binding changed.');
    for (const file of manifest.files) {
      if (typeof file.present !== 'boolean' || !failed.ownership.writePaths.some(path => file.sourcePath === path || file.sourcePath.startsWith(`${path}/`))) blocked('Raw failure source is outside original write scope.');
      if (file.present) {
        const raw = await regularFile(await safePath(root, ref.location), file.snapshotPath);
        new TextDecoder('utf-8', { fatal: true }).decode(raw);
        if (!state.tasks.find(task => task.taskId === repaired.task.taskId)?.attempts.length && !raw.equals(await regularFile(root, file.sourcePath))) blocked('Original failed author bytes differ from their preserved source.');
      }
      else if (manifest.diagnosis.kind !== 'missing_output') blocked('Missing raw bytes cannot prove a JSON or schema failure.');
      else if (!state.tasks.find(task => task.taskId === repaired.task.taskId)?.attempts.length && await exists(root, file.sourcePath)) blocked('Missing-output source changed before repair.');
    }
  }
  const existingOrigins = new Set<string>();
  for (const item of additions) {
    const path = `task-${encodeURIComponent(item.task.taskId)}`, folder = await safePath(recovery.journalRoot, path), current = state.tasks.find(task => task.taskId === item.task.taskId);
    if (await exists(folder, 'origin.json')) {
      await TaskJournal.open(recovery, origin(item), true); existingOrigins.add(item.task.taskId);
    } else if (registered) blocked('Registered continuation origin is missing; execution cannot be inferred.');
    if (!current?.attempts.length) {
      if (await exists(recovery.journalRoot, path) && (await readdir(folder)).some(name => name !== 'origin.json')) blocked('Unstarted continuation has phase receipts.');
      if (state.ledger.entries.some(entry => entry.taskId === item.task.taskId)) blocked('Unstarted continuation has requests.');
      for (const ref of item.expectedArtifacts!) if (await exists(root, ref.location)) blocked('Unstarted continuation has output.');
    }
  }
  if (!prior) await publishReceipt(join(root, 'repair-plan.json'), plan);
  if (!registered) {
    for (const item of additions) if (!existingOrigins.has(item.task.taskId)) await TaskJournal.open(recovery, origin(item), false);
    await controller.registerTasks(additions.map(item => item.task));
  }
}
