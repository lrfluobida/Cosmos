import { randomUUID } from 'node:crypto';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateRequirement, validateTaskInputs } from '../contracts/index.ts';
import { sameValue } from '../contracts/validation.ts';
import type { ArtifactReference, RequirementContract, TaskContract } from '../contracts/index.ts';
import type { RunController } from '../runtime/run.ts';
import type { PreparedTask } from '../runtime/orchestrator.ts';
import { assertOwnership } from './factory.ts';
import type { AuthorRole, RoleFactory } from './factory.ts';
import { freeze } from './requirements.ts';
import { decodeModelJson } from './protocol.ts';

export interface PlanningRolePolicy {
  workspace: string;
  allocationMicroCny: number;
  writePaths: string[];
  readOnlyPaths: string[];
  tools: string[];
  outputs: { artifactId: string; version: string; destination: string; type: string; schema: string }[];
  interfaces?: ArtifactReference[];
  rules?: string[];
}
export interface PlanningTaskPolicy extends PlanningRolePolicy { policyId: string; role: AuthorRole }
export interface PlanOptions {
  controller: RunController;
  requirement: RequirementContract;
  /** Predeclared in the same ledger, so planning cannot create a second budget. */
  planningTaskId: string;
  workspace: string;
  sessionRoot: string;
  availableArtifacts: ArtifactReference[];
  roles?: Partial<Record<AuthorRole, PlanningRolePolicy>>;
  /** Host-owned slots; each may be selected once, including several of one role. */
  taskPolicies?: PlanningTaskPolicy[];
  roleFactory: RoleFactory;
  signal?: AbortSignal;
}
interface Draft { taskId: string; policyId?: string; role: AuthorRole; objective: string; acceptanceIds: string[]; dependsOn: string[] }

/** One native Cosmos planning session, then host binding of all authority-bearing fields. */
export async function planTaskDag(options: PlanOptions): Promise<{ tasks: PreparedTask[]; plan: ArtifactReference; sessionDirectory: string }> {
  const requirement = freeze(structuredClone(options.requirement));
  const errors = validateRequirement(requirement);
  if (errors.length) throw new Error('Planning requires an explicitly confirmed valid requirement.');
  const snapshot = await options.controller.read();
  if (snapshot.run.specVersion !== requirement.specVersion) throw new Error('Planning must use the original run requirement version.');
  const allocation = snapshot.ledger.allocations.find(a => a.taskId === options.planningTaskId);
  if (!allocation) throw new Error('Planning needs its existing shared ledger allocation.');
  if (Boolean(options.roles) === Boolean(options.taskPolicies)) throw new Error('Declare either role policies or task policy slots.');
  const slots = structuredClone(options.taskPolicies ?? Object.entries(options.roles!).map(([role, policy]) => ({ ...policy, role: role as AuthorRole, policyId: role })));
  const available = structuredClone(options.availableArtifacts);
  if (requirement.sources.some(source => !available.some(ref => sameValue(ref, source)))) throw new Error('Planning requires every confirmed requirement source at its exact version and location.');
  if (!slots.length || slots.length > 100 || new Set(slots.map(p => p.policyId)).size !== slots.length
    || slots.some(p => !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(p.policyId) || !['cosmos', 'design', 'coding', 'art'].includes(p.role))) throw new Error('Declare 1 to 100 unique host policy slots before planning.');
  const policiesById = new Map(slots.map(policy => [policy.policyId, policy]));
  const policyFor = (draft: Draft) => policiesById.get(options.taskPolicies ? draft.policyId! : draft.role);
  for (const policy of slots) {
    if (!Number.isSafeInteger(policy.allocationMicroCny) || policy.allocationMicroCny < 0 || !policy.outputs.length) throw new Error('Invalid host role allocation or outputs.');
    policy.workspace = await realpath(policy.workspace);
  }
  const contextId = `planning-${randomUUID()}`, directory = join(options.sessionRoot, contextId);
  const planningTask: TaskContract = {
    contractVersion: '1.0.0', taskId: options.planningTaskId, kind: snapshot.run.kind, runId: snapshot.run.runId, specVersion: requirement.specVersion,
    authorId: contextId, acceptanceIds: requirement.acceptance.map(a => a.acceptanceId), objective: 'Propose bounded role tasks that cover the confirmed requirements.',
    dependsOn: [], inputs: available, context: { contextId, rules: ['Requirements are fixed; planning is a proposal.'], interfaces: [], knownFailures: [], tools: ['read'] },
    ownership: { writePaths: [], readOnlyPaths: available.map(ref => ref.location) }, outputs: [{ type: 'plan', schema: 'cosmos-plan/1', destination: join(directory, 'plan.json') }],
    acceptance: requirement.acceptance.map(a => ({ acceptanceId: a.acceptanceId, steps: a.steps, expected: a.expected, evidenceDestinations: [join(directory, 'plan.json')] })),
    budget: { ledgerId: snapshot.ledger.ledgerId, allocationMicroCny: allocation.amountMicroCny, originalDeadlineAt: snapshot.run.originalDeadlineAt },
    state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [], handoff: { completed: [], remaining: ['Planning proposal and game generation'], uncertainty: [], resumeFrom: null },
    review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] },
  };
  const signal = AbortSignal.any([options.controller.signal, ...(options.signal ? [options.signal] : [])]);
  signal.throwIfAborted();
  await mkdir(directory, { recursive: true });
  const session = await options.roleFactory({ role: 'cosmos', purpose: 'planning', task: planningTask, requirement, workspace: options.workspace, stateDirectory: directory, controller: options.controller });
  try {
    const policies = slots.map(policy => ({ ...(options.taskPolicies ? { policyId: policy.policyId } : {}), role: policy.role, outputs: policy.outputs, writePaths: policy.writePaths, rules: policy.rules ?? [] }));
    const response = await session.prompt(`Plan only within these host policies: ${JSON.stringify(policies)}. Task IDs must match /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/. Return the required task draft JSON.`, { signal });
    signal.throwIfAborted();
    const value = decodeModelJson(response.text) as { tasks: Draft[] };
    if (!value || Object.keys(value).some(key => key !== 'tasks') || !Array.isArray(value.tasks) || !value.tasks.length || value.tasks.length > slots.length) throw new Error('Invalid bounded task plan.');
    const drafts = value.tasks;
    for (const draft of drafts) {
      if (!draft || Object.keys(draft).some(key => !['taskId', 'role', 'objective', 'acceptanceIds', 'dependsOn', ...(options.taskPolicies ? ['policyId'] : [])].includes(key)) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(draft.taskId) || !policyFor(draft) || policyFor(draft)!.role !== draft.role || typeof draft.objective !== 'string' || !draft.objective.trim() || !Array.isArray(draft.acceptanceIds) || !draft.acceptanceIds.length || draft.acceptanceIds.some(id => !requirement.acceptance.some(a => a.acceptanceId === id)) || !Array.isArray(draft.dependsOn) || draft.dependsOn.some(id => !drafts.some(d => d.taskId === id) || id === draft.taskId)) throw new Error('Invalid task draft or acceptance coverage.');
    }
    if (new Set(drafts.map(d => d.taskId)).size !== drafts.length || new Set(drafts.map(d => policyFor(d)!.policyId)).size !== drafts.length || drafts.some(d => snapshot.run.taskIds.includes(d.taskId))) throw new Error('Plan tasks and policy slots must be unique and new.');
    if (requirement.acceptance.some(a => !drafts.some(d => d.acceptanceIds.includes(a.acceptanceId)))) throw new Error('Plan acceptance coverage is incomplete.');
    const visited = new Set<string>();
    while (visited.size < drafts.length) {
      const ready = drafts.find(d => !visited.has(d.taskId) && d.dependsOn.every(id => visited.has(id)));
      if (!ready) throw new Error('Task plan has a dependency cycle.');
      visited.add(ready.taskId);
    }
    const total = drafts.reduce((sum, d) => sum + policyFor(d)!.allocationMicroCny, snapshot.ledger.allocations.reduce((sum, a) => sum + a.amountMicroCny, 0));
    if (total > snapshot.ledger.limitMicroCny) throw new Error('Plan exceeds unallocated shared budget.');
    const outputs = (draft: Draft) => policyFor(draft)!.outputs.map(output => ({ artifactId: output.artifactId, version: output.version, location: output.destination }));
    const tasks: PreparedTask[] = drafts.map(draft => {
      const policy = policyFor(draft)!;
      const inputs = [...available, ...draft.dependsOn.flatMap(id => outputs(drafts.find(d => d.taskId === id)!))];
      const task: TaskContract = {
        ...structuredClone(planningTask), taskId: draft.taskId, authorId: `${draft.role}-${randomUUID()}`, objective: draft.objective, acceptanceIds: draft.acceptanceIds,
        dependsOn: draft.dependsOn.map(taskId => ({ taskId, requiredState: 'passed', state: 'not_started' })), inputs,
        context: { contextId: `author-${randomUUID()}`, rules: policy.rules ?? [], interfaces: policy.interfaces ?? [], knownFailures: [], tools: policy.tools },
        ownership: { writePaths: policy.writePaths, readOnlyPaths: policy.readOnlyPaths },
        outputs: policy.outputs.map(({ type, schema, destination }) => ({ type, schema, destination })),
        acceptance: requirement.acceptance.filter(a => draft.acceptanceIds.includes(a.acceptanceId)).map(a => ({ acceptanceId: a.acceptanceId, steps: a.steps, expected: a.expected, evidenceDestinations: [`evidence/${draft.taskId}/report.json`] })),
        budget: { ...planningTask.budget, allocationMicroCny: policy.allocationMicroCny },
        handoff: { completed: [], remaining: [draft.objective], uncertainty: [], resumeFrom: null },
      };
      assertOwnership(task, policy.workspace);
      const issues = validateTaskInputs(task, inputs);
      if (issues.length) throw new Error(`Invalid planned contract: ${issues.map(e => e.message).join('; ')}`);
      return { role: draft.role, workspace: policy.workspace, task, expectedArtifacts: outputs(draft) };
    });
    const plan = { artifactId: contextId, version: 'v1', location: join(directory, 'plan.json') };
    await writeFile(plan.location, JSON.stringify({ status: 'validated_proposal', specVersion: requirement.specVersion, sessionDirectory: directory, expectedOutputs: drafts.map(d => ({ taskId: d.taskId, artifacts: outputs(d) })), tasks }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    return { tasks, plan, sessionDirectory: directory };
  } catch (error) {
    await writeFile(join(directory, 'handoff.json'), JSON.stringify({ status: signal.aborted ? 'cancelled' : 'failed', specVersion: requirement.specVersion, remaining: ['Obtain a valid bounded plan covering the fixed requirements.'], sessionDirectory: directory }) + '\n', { encoding: 'utf8', flag: 'wx' });
    throw error;
  } finally { await session.close(); }
}
