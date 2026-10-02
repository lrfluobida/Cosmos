import { createHash } from 'node:crypto';
import { lstat, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { ArtifactRegistry } from '../artifacts/index.ts';
import { directory, id, regularFile, safePath, snapshot as files, within } from '../artifacts/paths.ts';
import { validateExecution, validateTask } from '../contracts/index.ts';
import type { ArtifactReference, RequirementContract, TaskContract } from '../contracts/index.ts';
import { sameValue } from '../contracts/validation.ts';
import type { PreparedTask, AuthorProposal } from './orchestrator.ts';
import type { RunController } from './run.ts';
import type { RunSnapshot, ExecutionWindow } from './run-types.ts';
import { requireContinuationInputs } from './continuation-inputs.ts';
import { requireContinuationTask } from './continuation-validation.ts';
import { taskWindowBinding } from './execution-window.ts';
import { TaskJournal, RecoveryBlocked, requireOriginalTask } from './recovery/task-journal.ts';
import type { RecoveryOptions, ContentSignature, RecoveryOrigin } from './recovery/task-journal.ts';
import { publishReceipt } from './recovery/receipt-file.ts';

export interface ContinuationPlan {
  formatVersion: 'continuation-plan-1'; runId: string; ledgerId: string; windowId: string; decisionId: string; quoteId: string;
  capability: string; requirement: RequirementContract; availableArtifacts: ArtifactReference[];
  sources: { path: string; sha256: string }[]; tasks: PreparedTask[];
  replacements: { sourceTaskId: string; replacementTaskId: string }[]; reviewProtocolCorrections: 1;
}
interface Input { root: string; controller: RunController; requirement: RequirementContract; windowId: string }
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
function fail(message: string): never { throw new RecoveryBlocked(message); }
const decode = (bytes: Uint8Array): any => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
function name(root: string, path: string) {
  const absolute = resolve(root, path); if (absolute === resolve(root) || !within(root, absolute)) return fail('Continuation source escapes its original run.');
  return relative(root, absolute).split(sep).join('/');
}
async function exists(root: string, path: string) {
  try { return await lstat(await safePath(root, path)); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export const continuationPlanPath = (decisionId: string) => `continuations/${id(decisionId)}/plan.json`;
async function windowState(input: Input) {
  input.controller.requireExecutionWindow(input.windowId); const state = await input.controller.read();
  const window = state.continuation!.windows.find(item => item.windowId === input.windowId)!;
  if (window.stopReason || state.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny)) fail('Current continuation window is stopped or requires charge reconciliation.');
  const proof = await regularFile(input.root, window.confirmation.source.location);
  if (hash(proof) !== window.confirmation.sourceSha256) fail('Original continuation confirmation source changed or is missing.');
  return { state, window };
}
function origin(root: string, state: RunSnapshot, requirement: RequirementContract, prepared: PreparedTask): RecoveryOrigin {
  const binding = taskWindowBinding(state, prepared.task.taskId);
  return { ...(binding ? { formatVersion: 2 as const, executionWindow: binding } : { formatVersion: 1 as const }),
    runId: state.run.runId, ledgerId: state.ledger.ledgerId, originalStartedAt: state.run.originalStartedAt, originalDeadlineAt: state.run.originalDeadlineAt,
    limitMicroCny: state.ledger.limitMicroCny, requirement, prepared, reviewProtocolCorrections: 1, artifactRoot: root, sessionRoot: join(root, 'sessions') };
}

async function derive(input: Input, state: RunSnapshot, window: ExecutionWindow): Promise<{ plan: ContinuationPlan; originalSources: PreparedTask[] }> {
  const { root, requirement } = input, sources: ContinuationPlan['sources'] = [];
  const read = async (path: string) => { const fixed = name(root, path), bytes = await regularFile(root, fixed); sources.push({ path: fixed, sha256: hash(bytes) }); return decode(bytes); };
  const execution = await read('execution.json');
  if (!sameValue(execution.requirement, requirement) || !Array.isArray(execution.tasks) || !execution.tasks.length || execution.tasks.length > 3
    || typeof execution.capability !== 'string' || !Array.isArray(execution.availableArtifacts)) fail('Original fixed execution plan is unavailable.');
  const native = await read(execution.plan.location);
  if (native.status !== 'validated_proposal' || native.specVersion !== requirement.specVersion || !sameValue(native.tasks, execution.tasks)) fail('Original native plan changed.');
  const pool = new Map<string, PreparedTask>((execution.tasks as PreparedTask[]).map(item => [item.task.taskId, item]));
  const aliases = new Map<string, string>();
  const repairSource = window.quote.auxiliarySources.find(item => item.path === 'repair-plan.json');
  if (repairSource) {
    const repair = await read(repairSource.path);
    if (sources.at(-1)!.sha256 !== repairSource.sha256 || !Array.isArray(repair.tasks)) fail('Quoted repair plan changed.');
    for (const item of repair.tasks as PreparedTask[]) pool.set(item.task.taskId, item);
    const mappings = repair.formatVersion === 2 ? repair.replacements : [{ sourceTaskId: repair.sourceTaskId, replacementTaskId: repair.replacementTaskId }];
    for (const mapping of mappings) aliases.set(mapping.sourceTaskId, mapping.replacementTaskId);
    for (const signature of repair.diagnosticSignatures ?? []) for (const file of signature.files) {
      if (hash(await regularFile(root, `${signature.reference.location}/${file.path}`)) !== file.sha256) fail('Fixed historical repair diagnostic changed.');
    }
  }
  const originals = (execution.tasks as PreparedTask[]).map(item => pool.get(aliases.get(item.task.taskId) ?? item.task.taskId) ?? fail('Effective source task is missing.'));
  if (new Set(originals.map(item => item.role)).size !== originals.length) fail('Continuation requires distinct original role tasks.');
  const registry = new ArtifactRegistry(root, 'registry'), workspace = join(root, 'continuations', id(window.decisionId), 'workspace');
  for (const item of pool.values()) {
    const current = state.tasks.find(task => task.taskId === item.task.taskId);
    if (!current || validateTask(item.task).length || item.task.state !== 'not_started' || resolve(item.workspace) !== resolve(root)) fail('Original prepared source contract is invalid.');
    requireOriginalTask(item.task, current);
  }
  const tasks = originals.map(item => {
    const grant = window.grants.find(grant => grant.sourceTaskId === item.task.taskId);
    if (!grant) {
      if (state.tasks.find(task => task.taskId === item.task.taskId)!.state !== 'passed') fail('Unchanged source task is not passed.');
      return structuredClone(item);
    }
    const task = structuredClone(item.task);
    task.taskId = grant.taskId; task.authorId = `${grant.taskId}-author`; task.context.contextId = `${grant.taskId}-context`; task.budget.allocationMicroCny = grant.amountMicroCny;
    const expectedArtifacts = item.expectedArtifacts!.map(ref => {
      if (sameValue(ref, registry.artifactRef(ref.artifactId, ref.version))) return registry.artifactRef(ref.artifactId, window.windowId);
      if (sameValue(ref, registry.candidateRef(ref.artifactId, ref.version))) return registry.candidateRef(ref.artifactId, window.windowId);
      return fail('Original output is not a fixed canonical registry reference.');
    });
    task.outputs = task.outputs.map((output, index) => ({ ...output, destination: expectedArtifacts[index].location }));
    task.context.rules.push('This is one explicitly authorized new attempt. Use only fixed inputs; historical partial author files are not accepted outputs. No automatic semantic repair is authorized.');
    task.handoff = { completed: [], remaining: [task.objective], uncertainty: [], resumeFrom: null };
    return { ...structuredClone(item), task, workspace, expectedArtifacts };
  });
  const replacements = window.grants.map(grant => ({ sourceTaskId: grant.sourceTaskId, replacementTaskId: grant.taskId }));
  const effectiveId = (old: string) => { const prior = aliases.get(old) ?? old; return replacements.find(item => item.sourceTaskId === prior)?.replacementTaskId ?? prior; };
  for (const item of tasks.filter(item => window.grants.some(grant => grant.taskId === item.task.taskId))) {
    const grant = window.grants.find(grant => grant.taskId === item.task.taskId)!, source = pool.get(grant.sourceTaskId)!;
    const mappings: { from: ArtifactReference; to: ArtifactReference }[] = [];
    for (const dependency of source.task.dependsOn) {
      const previous = pool.get(dependency.taskId) ?? fail('Original dependency source is unavailable.'), next = tasks.find(item => item.task.taskId === effectiveId(dependency.taskId)) ?? fail('Effective dependency is missing.');
      previous.expectedArtifacts!.forEach((from, index) => mappings.push({ from, to: next.expectedArtifacts![index] }));
    }
    const rebound = (refs: ArtifactReference[]) => refs.map(ref => {
      const mapping = mappings.find(item => item.from.artifactId === ref.artifactId);
      if (!mapping) return ref;
      if (!sameValue(mapping.from, ref)) return fail('Original fixed dependency input cannot be rebound by ID alone.');
      return mapping.to;
    });
    item.task.inputs = structuredClone(rebound(item.task.inputs)); item.task.context.interfaces = structuredClone(rebound(item.task.context.interfaces));
    item.task.dependsOn = item.task.dependsOn.map(dep => ({ ...dep, taskId: effectiveId(dep.taskId), state: tasks.find(item => item.task.taskId === effectiveId(dep.taskId))!.task.state }));
    requireContinuationTask(state, item.task);
  }
  if (window.grants.length !== tasks.filter(item => window.grants.some(grant => grant.taskId === item.task.taskId)).length) fail('Quoted task mapping is incomplete.');
  await requireContinuationInputs(state, tasks, root);
  for (const item of tasks) if (validateExecution({ requirement, task: item.task, ledger: state.ledger, run: state.run }).length) fail('Continuation task does not preserve its execution contract.');
  return { originalSources: [...pool.values()], plan: { formatVersion: 'continuation-plan-1', runId: state.run.runId, ledgerId: state.ledger.ledgerId,
    windowId: window.windowId, decisionId: window.decisionId, quoteId: window.quote.quoteId, capability: execution.capability,
    requirement: structuredClone(requirement), availableArtifacts: execution.availableArtifacts, sources, tasks,
    replacements: [...aliases].map(([sourceTaskId, replacementTaskId]) => ({ sourceTaskId, replacementTaskId })).concat(replacements), reviewProtocolCorrections: 1 } };
}

/** Builds or reads fixed plan data only; author preparation and paid work do not run here. */
export async function loadContinuationPlan(input: Input): Promise<ContinuationPlan> {
  const { state, window } = await windowState(input), { plan } = await derive(input, state, window), path = continuationPlanPath(window.decisionId);
  if (await exists(input.root, path)) {
    const previous = decode(await regularFile(input.root, path)); if (!sameValue(previous, plan)) fail('Immutable continuation plan or original sources changed.'); return previous;
  }
  return plan;
}

export async function prepareContinuationPlan(input: Input & { plan: ContinuationPlan; recoverCapture: NonNullable<RecoveryOptions['recoverCapture']> }): Promise<void> {
  const { root, controller, requirement } = input, { state, window } = await windowState(input), { plan, originalSources } = await derive(input, state, window);
  if (!sameValue(input.plan, plan)) fail('Continuation plan differs from the exact authorized source mapping.');
  const path = continuationPlanPath(window.decisionId), published = await exists(root, path);
  if (published && !sameValue(decode(await regularFile(root, path)), plan)) fail('Immutable continuation plan changed.');
  const recovery = { journalRoot: join(root, 'journal'), artifactRoot: root };
  for (const item of originalSources) await TaskJournal.open(recovery, origin(root, state, requirement, item), true);
  // Authentication precedes every new origin or registration. Copying fixed bytes is handled later by preAuthor.
  for (const item of plan.tasks.filter(item => !window.grants.some(grant => grant.taskId === item.task.taskId))) {
    const task = state.tasks.find(task => task.taskId === item.task.taskId)!, journal = await TaskJournal.open(recovery, origin(root, state, requirement, item), true), attempt = task.attempts.at(-1)!;
    const authored = await journal.read<{ proposal: AuthorProposal }>('author', attempt.attemptId), verified = await journal.read<{ evidence: TaskContract['evidence']; signature: ContentSignature }>('verified', attempt.attemptId);
    if (!authored?.proposal?.summary || !Array.isArray(authored.proposal.remaining) || authored.proposal.remaining.length || !Array.isArray(authored.proposal.uncertainty) || authored.proposal.uncertainty.length
      || !verified || !sameValue(verified.evidence, task.evidence) || task.review.verdict !== 'approved') fail('Passed ancestor evidence or author handoff is incomplete.');
    const capture = await input.recoverCapture(task, authored.proposal, controller.signal);
    if (!capture || !sameValue(capture.artifacts, task.artifacts) || !sameValue(task.artifacts, item.expectedArtifacts)) fail('Passed ancestor registry provenance cannot be established.');
    for (const acceptance of task.acceptanceIds) {
      const fixed = requirement.acceptance.find(item => item.acceptanceId === acceptance)!;
      if (!task.evidence.some(evidence => task.review.evidenceIds.includes(evidence.evidenceId) && evidence.outcome === 'passed' && evidence.acceptanceIds.includes(acceptance)
        && fixed.evidenceKinds.includes(evidence.kind) && [...task.inputs, ...task.artifacts].every(ref => evidence.artifactVersions.some(version => sameValue(ref, version))))) fail('Passed ancestor lacks fixed input evidence.');
    }
    await journal.requireSignature(verified.signature, [...task.inputs, ...task.artifacts, ...task.evidence.map(item => item.source)]);
  }
  const additions = plan.tasks.filter(item => window.grants.some(grant => grant.taskId === item.task.taskId)), registered = additions.filter(item => state.tasks.some(task => task.taskId === item.task.taskId));
  if (registered.length && (!published || registered.length !== additions.length)) fail('Missing plan or partial task registration requires investigation.');
  const existingOrigins = new Set<string>();
  for (const item of additions) {
    const current = state.tasks.find(task => task.taskId === item.task.taskId), folder = `journal/task-${encodeURIComponent(item.task.taskId)}`;
    if (current) requireOriginalTask(item.task, current);
    if (await exists(root, `${folder}/origin.json`)) { await TaskJournal.open(recovery, origin(root, state, requirement, item), true); existingOrigins.add(item.task.taskId); }
    else if (current) fail('Registered continuation origin is missing; no origin may be fabricated.');
    if (!current?.attempts.length) {
      if (state.ledger.entries.some(entry => entry.taskId === item.task.taskId) || current && (current.artifacts.length || current.evidence.length || current.review.verdict !== 'pending')) fail('Unstarted continuation has prior execution or charges.');
      if (await exists(root, folder) && (await readdir(join(root, folder))).some(name => name !== 'origin.json')) fail('Unstarted continuation has prior phase receipts.');
      for (const ref of item.expectedArtifacts!) if (await exists(root, ref.location)) fail('Unstarted continuation has prior fixed output.');
      for (const scope of item.task.ownership.writePaths) {
        const info = await exists(item.workspace, scope);
        if (info && (!info.isDirectory() || (await files(await safePath(item.workspace, scope))).size)) fail('Fresh author workspace has unknown partial output.');
      }
    }
  }
  if (!published) { await directory(root, `continuations/${id(window.decisionId)}`); await publishReceipt(join(root, path), plan); }
  if (!registered.length) {
    for (const item of additions) if (!existingOrigins.has(item.task.taskId)) await TaskJournal.open(recovery, origin(root, state, requirement, item), false);
    await controller.registerTasks(additions.map(item => item.task));
  }
}
