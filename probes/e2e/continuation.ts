import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import type { TaskContract, RequirementContract, ArtifactReference } from '../../src/contracts/types.ts';
import type { PreparedTask } from '../../src/runtime/orchestrator.ts';
import type { RunController } from '../../src/runtime/run.ts';
import { ArtifactRegistry } from '../../src/artifacts/index.ts';
import { regularFile } from '../../src/artifacts/paths.ts';
import { PILOT_LIMITS } from './admission.ts';
import { files, jsonFile } from './host.ts';
import type { PilotJournal } from './budget.ts';

function need(value: unknown, message: string): asserts value { if (!value) throw new Error(`Continuation: ${message}`); }
const fixedKeys = ['contractVersion', 'taskId', 'kind', 'runId', 'specVersion', 'authorId', 'acceptanceIds', 'objective', 'inputs', 'context', 'ownership', 'outputs', 'acceptance', 'budget'] as const;

/** Only the observed captured-design / zero-attempt dependent shape is eligible; this is not general recovery. */
export function validateContinuationRecords(value: { root: string; marker: any; origin: any; journal: PilotJournal; result: any; snapshot: any; planned: PreparedTask[]; now: number }) {
  const { root, marker, origin, journal, result, snapshot, planned, now } = value;
  need(resolve(marker.root) === resolve(root) && resolve(result.root) === resolve(root), 'original root mismatch');
  need(marker.startedAt === origin.startedAt && result.startedAt === origin.startedAt && marker.platformHead === origin.platformHead && result.platformHead === origin.platformHead, 'original origin mismatch');
  need(same(origin.limits, PILOT_LIMITS) && journal.maxRequests === 40 && origin.budgets.cumulativePilotMicroCny === 30_000_000, 'original limits mismatch');
  need(marker.deadlineAt === origin.deadlineAt && journal.deadlineAt === origin.deadlineAt && Date.parse(journal.deadlineAt) > now + 5000, 'original deadline expired or changed');
  need(Date.parse(journal.startedAt) >= Date.parse(origin.startedAt) && Date.parse(journal.startedAt) < Date.parse(journal.deadlineAt), 'journal start changed');
  need(same(result.pilotBudget, journal) && journal.requestIds.length > 0 && journal.requestIds.length < journal.maxRequests && new Set(journal.requestIds).size === journal.requestIds.length, 'original request counter changed');
  need(snapshot.run.state === 'running' && !snapshot.stopReason && snapshot.run.runId === origin.runId && snapshot.run.ledgerId === origin.ledgerId, 'shared run changed or stopped');
  need(snapshot.ledger.limitMicroCny === 150_000_000 && !snapshot.ledger.entries.some((e: any) => e.unknown || e.reservedMicroCny > 0 || ['reserved', 'unknown'].includes(e.status)), 'unknown or in-flight exposure');
  const spent = snapshot.ledger.entries.reduce((sum: number, e: any) => sum + e.settledMicroCny + e.reservedMicroCny, 0);
  need(spent === result.budget.committedMicroCny && spent < 30_000_000, 'original fee record changed or cumulative cap reached');
  need(result.outcome === 'failed' && planned.length === 3 && ['design', 'art', 'coding'].every(role => planned.filter(p => p.role === role).length === 1), 'original three-role plan required');
  const ids = planned.map(p => p.task.taskId);
  need(same(result.tasks, snapshot.tasks.filter((t: TaskContract) => ids.includes(t.taskId))), 'original task records changed');
  for (const item of planned) {
    need(item.expectedArtifacts?.length === 1 && item.expectedArtifacts[0].version === 'v1', 'original capture version changed');
    const current = snapshot.tasks.find((t: TaskContract) => t.taskId === item.task.taskId);
    need(current && fixedKeys.every(key => same(current[key], item.task[key]))
      && same(current.dependsOn.map((d: any) => [d.taskId, d.requiredState]), item.task.dependsOn.map(d => [d.taskId, d.requiredState])), 'native plan contract changed');
    need(resolve(item.workspace) === resolve(root), 'native plan workspace changed');
    if (item.role === 'design') need(current.state === 'failed' && current.attempts.length === 1 && current.evidence.length === 0 && current.review.verdict === 'pending'
      && same(current.artifacts, item.expectedArtifacts) && current.artifacts.length === 1, 'failed design capture/version changed');
    else need(current.state === 'waiting_user' && current.attempts.length === 0 && current.artifacts.length === 0 && current.evidence.length === 0 && current.review.verdict === 'pending', 'dependent already has an attempt, artifact or review');
  }
  const requests = snapshot.ledger.entries.filter((e: any) => e.taskId === 'COS-10' || ids.includes(e.taskId));
  need(requests.length === journal.requestIds.length && requests.every((e: any) => journal.requestIds.includes(e.requestId) && e.status === 'settled'), 'journal counter differs from original paid requests');
}

export function createSuccessors(planned: PreparedTask[], original: TaskContract[]) {
  const mapping = Object.fromEntries(planned.map(item => [item.task.taskId, `${item.task.taskId}-c1`]));
  const design = planned.find(item => item.role === 'design')!, designRef = design.expectedArtifacts![0];
  const tasks = planned.map(item => {
    const next = structuredClone(item), task = next.task;
    task.taskId = mapping[item.task.taskId]; task.authorId = `${item.role}-${randomUUID()}`; task.context.contextId = `author-${randomUUID()}`;
    task.dependsOn = task.dependsOn.map(dep => ({ ...dep, taskId: mapping[dep.taskId] ?? dep.taskId, state: 'not_started' }));
    task.context.rules.push(`One-shot continuation of native plan task ${item.task.taskId}; original record is retained. Output versions, requirements and original deadline stay fixed. No additional repair is permitted.`);
    if (item.role === 'design') {
      task.objective = `Read only the existing captured design ${designRef.location}/_cosmos/design.json and judge PILOT-DESIGN only. Do not edit or regenerate it. Return a new scoped handoff: host capture/verification/independent review and downstream art/code/build/browser work are not unfinished design work; permitted future implementation choices are not design blockers. Actual missing design requirements or unresolved facts blocking this design must remain in remaining/uncertainty; never empty these arrays just to advance. This is logical design attempt 2 of 2, reusing the exact v1 capture.`;
      task.ownership = { writePaths: [], readOnlyPaths: [...task.ownership.readOnlyPaths, designRef.location] };
      task.context.tools = ['read']; task.context.interfaces.push(designRef);
      task.context.rules.push('This read-only clarification replaces earlier instructions to write authors/design/design.json. Assess the frozen captured output only; mention pending host/downstream work in summary.');
      task.budget.allocationMicroCny = 500_000;
    }
    return next;
  });
  const allocated = tasks.reduce((sum, item) => sum + item.task.budget.allocationMicroCny, 0);
  return { tasks, mapping, designRef, allocated, replaced: original.filter(task => task.taskId !== design.task.taskId) };
}

export interface Continuation {
  root: string; prefix: string; origin: any; journal: PilotJournal; originalTasks: TaskContract[];
  tasks: PreparedTask[]; mapping: Record<string, string>; designRef: ArtifactReference; allocated: number; replaced: TaskContract[];
  plan: ArtifactReference; requirement: RequirementContract; frozen: any; available: ArtifactReference[];
}

/** All reads precede the one-shot marker and any cancellation/registration. The controller is already locked. */
export async function readContinuation(repository: string, ledgerRoot: string, controller: RunController): Promise<Continuation> {
  const marker = await jsonFile(ledgerRoot, 'cos10-pilot.json');
  const root = resolve(marker.root), prefix = basename(root);
  need(/^pilot-\d{17}$/.test(prefix) && root === resolve(repository, '.cosmos/e2e', prefix), 'marker root is outside this original pilot');
  try { await access(join(root, 'continuation-origin.json')); throw new Error('Continuation already used'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const [origin, journal, result, plan, confirmed, snapshot] = await Promise.all([
    jsonFile(root, 'origin.json'), jsonFile(root, 'pilot-budget.json'), jsonFile(root, 'result.json'), jsonFile(root, 'plan-reference.json'), jsonFile(root, 'confirmed-requirement.json'), controller.read(),
  ]);
  const planPath = relative(root, resolve(plan.location)).replaceAll('\\', '/');
  need(planPath.startsWith('sessions/planning-') && planPath.endsWith('/plan.json'), 'native plan reference changed');
  const native = await jsonFile(root, planPath);
  need(native.status === 'validated_proposal' && native.specVersion === confirmed.requirement.specVersion, 'native plan status/spec changed');
  validateContinuationRecords({ root, marker, origin, journal, result, snapshot, planned: native.tasks, now: Date.now() });
  need(resolve(origin.budgets.sharedLedger) === resolve(ledgerRoot), 'original ledger path changed');
  const originalTasks: TaskContract[] = native.tasks.map((item: PreparedTask) => snapshot.tasks.find(task => task.taskId === item.task.taskId)!);
  const successors = createSuccessors(native.tasks, originalTasks);
  need(snapshot.ledger.allocations.reduce((sum, a) => sum + a.amountMicroCny, 0) + successors.allocated <= snapshot.ledger.limitMicroCny, 'shared unallocated budget is insufficient');
  need(successors.tasks.every(item => !snapshot.run.taskIds.includes(item.task.taskId)), 'continuation task IDs already used');
  const available = native.tasks.find((item: PreparedTask) => item.role === 'design').task.inputs as ArtifactReference[];
  need(same(confirmed.requirement.sources, [available[0]]), 'confirmed source references changed');
  const registry = new ArtifactRegistry(root, 'registry');
  for (const item of native.tasks as PreparedTask[]) {
    const expected = item.role === 'coding' ? registry.candidateRef(`${prefix}-game`, 'v1') : registry.artifactRef(`${prefix}-${item.role}`, 'v1');
    need(same(item.expectedArtifacts, [expected]) && item.task.outputs.length === 1 && item.task.outputs[0].destination === expected.location, 'original planned output reference changed');
    if (item.role !== 'design') {
      try { await access(join(root, expected.location)); throw new Error('Continuation: unattempted role already has an output version'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
  }
  need((await files(join(root, 'authors/art'))).length === 0, 'unattempted art input directory changed');
  const genericFiles = ['index.html', ...(await files(join(root, 'toolchain/src'))).map(name => `src/${name}`)].sort();
  need(same(await files(join(root, 'authors/coding')), genericFiles), 'unattempted coding input files changed');
  for (const name of genericFiles) need((await regularFile(root, `authors/coding/${name}`)).equals(await regularFile(root, `toolchain/${name}`))
    && (await regularFile(root, `toolchain/${name}`)).equals(await regularFile(repository, `templates/2d/${name}`)), 'generic coding input bytes changed');
  const designCapture = await registry.getCapture(successors.designRef);
  need(designCapture.taskId === originalTasks.find(task => task.taskId === native.tasks.find((i: PreparedTask) => i.role === 'design').task.taskId)!.taskId, 'design capture owner changed');
  need((await regularFile(root, `${successors.designRef.location}/_cosmos/design.json`)).equals(await regularFile(root, 'authors/design/design.json')), 'captured design bytes changed');
  for (const ref of available) await registry.getCapture(ref);
  const frozen = await jsonFile(root, `${available[0].location}/_cosmos/requirements.json`);
  need(same(frozen, await jsonFile(repository, 'probes/e2e/requirements.json')), 'frozen requirement changed');
  return { root, prefix, origin, journal, originalTasks, ...successors, plan, requirement: confirmed.requirement, frozen, available };
}

export async function cancelReplacedTasks(controller: RunController, continuation: Continuation): Promise<void> {
  for (const old of continuation.replaced) {
    const current = (await controller.read()).tasks.find(task => task.taskId === old.taskId);
    need(same(current, old) && current!.state === 'waiting_user' && current!.attempts.length === 0, 'replacement task changed before cancellation');
    const cancelled = structuredClone(current!); cancelled.state = 'cancelled';
    cancelled.stateReason = `Replaced before its first attempt by ${continuation.mapping[old.taskId]} after the captured design handoff failure. Original allocation retained for audit; no new requests may use this replaced task.`;
    await controller.saveTask(cancelled, { role: 'system', actorId: 'cos10-continuation' });
  }
}
