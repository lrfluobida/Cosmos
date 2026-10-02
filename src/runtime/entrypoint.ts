import { randomUUID } from 'node:crypto';
import { mkdir, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ArtifactReference, RequirementContract, TaskContract } from '../contracts/index.ts';
import { validateRequirement } from '../contracts/index.ts';
import { sameValue } from '../contracts/validation.ts';
import { regularFile } from '../artifacts/paths.ts';
import type { GameDraft } from '../roles/requirements.ts';
import { validateGameDraft } from '../roles/requirements.ts';
import { planTaskDag } from '../roles/planner.ts';
import type { PlanningTaskPolicy } from '../roles/planner.ts';
import type { RoleFactory } from '../roles/factory.ts';
import { reconcileRoleReceipt } from '../roles/provider-budget.ts';
import type { AccountingController } from '../roles/provider-budget.ts';
import { readRunSnapshot, recoverRunOwner, startBudgetWarnings, startControl } from '../cli/control.ts';
import { RunController } from './run.ts';
import { OwnedWork, cancelAndDrain } from './recovery/owned-work.ts';
import { publishReceipt } from './recovery/receipt-file.ts';
import type { RecoveryOptions } from './recovery/task-journal.ts';
import { RecoveryBlocked } from './recovery/task-journal.ts';
import { executeTaskDag, resumeTaskDag } from './orchestrator.ts';
import type { DagOptions, PreparedTask } from './orchestrator.ts';
import { schedulerStatus } from './scheduler/index.ts';
import { assessRepair, createLinkedRepairTask, DEFAULT_REPAIR_POLICY } from './repair/policy.ts';
import type { RepairFeedback } from './repair/feedback.ts';
import { allocateRepairGrants, buildRepairContinuation, findUnstartedSuccessors, prepareRepairContinuation, sealRepairDiagnostics, SuccessorBlocked } from './entrypoint-successors.ts';
import type { RepairContinuationPlan, SuccessorTarget, TaskReplacement } from './entrypoint-successors.ts';

export interface GenerationHost extends Pick<DagOptions, 'capture' | 'verify' | 'reviewImages' | 'diagnoseFailure' | 'preAuthor'> {
  capability: string; availableArtifacts: ArtifactReference[]; taskPolicies: PlanningTaskPolicy[]; roleFactory: RoleFactory;
  validateTasks?(tasks: PreparedTask[]): void;
  recoverCapture: NonNullable<RecoveryOptions['recoverCapture']>;
  finish(tasks: TaskContract[]): Promise<{ delivery?: string; gaps: string[] }>;
  repair(task: TaskContract, feedback: RepairFeedback): Promise<{ outputs: TaskContract['outputs']; expectedArtifacts: ArtifactReference[]; allocationMicroCny: number } | null>;
  continuationTargets?(sources: PreparedTask[], feedback: RepairFeedback, grants: Record<string, number>): Promise<SuccessorTarget[] | null>;
}
export interface HostInput { root: string; controller: RunController; requirement: RequirementContract; draft: GameDraft; resume: boolean; work: OwnedWork }
export interface GenerationOptions { root: string; requirement: RequirementContract; draft: GameDraft; resume: boolean; notify?: (message: string) => void; createHost(input: HostInput): Promise<GenerationHost> }
async function json(root: string, name: string): Promise<any> { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, name))); }
async function optionalJson(root: string, name: string): Promise<any | null> { try { return await json(root, name); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } }

export async function reconcileEntryReceipts(root: string, controller: AccountingController) {
  const state = await controller.read();
  for (const entry of state.ledger.entries.filter(item => item.unknown || item.reservedMicroCny)) {
    if (!/^[\w-]+$/.test(entry.requestId)) continue;
    const candidates: string[] = [];
    async function visit(folder: string, depth: number) {
      const entries = await readdir(join(root, folder), { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; });
      for (const item of entries) {
        if (item.isDirectory() && depth > 0) await visit(`${folder}/${item.name}`, depth - 1);
        else if (item.isFile() && item.name === `billing-${entry.requestId}.json`) candidates.push(join(root, folder));
      }
    }
    await visit('sessions', 2); await visit('intake-sessions', 1);
    if (candidates.length === 1) await reconcileRoleReceipt({ controller, requestId: entry.requestId, evidenceDirectory: candidates[0] });
  }
  if ((await controller.read()).ledger.entries.some(item => item.unknown || item.reservedMicroCny)) throw new Error('Original requests require reconciliation; no new paid dispatch is permitted.');
}

/** Thin assembly of the existing planner, scheduler, recovery and bounded repair policy. */
export async function executeGeneration(options: GenerationOptions) {
  const root = resolve(options.root), requirement = structuredClone(options.requirement), draft = structuredClone(options.draft);
  validateGameDraft(draft);
  if (validateRequirement(requirement).length || !sameValue(requirement.acceptance, draft.acceptance)) throw new Error('Generation requires the exact confirmed acceptance.');
  const original = await readRunSnapshot(root);
  if (original.formatVersion !== 1) throw new Error('Generation has not been activated.');
  if (original.stopReason) throw new Error(`Original run is stopped: ${original.stopReason.code}.`);
  if (Date.now() >= Date.parse(original.run.originalDeadlineAt)) throw new Error('Original deadline expired; no new generation window is allowed.');
  if (!original.run.humanDecisions.some(decision => decision.actorId === requirement.confirmedBy && decision.decidedAt === requirement.confirmedAt && sameValue(decision.evidence, requirement.sources))) throw new Error('Requirement confirmation does not match this original run.');
  if (!sameValue(await json(root, requirement.sources[0].location), draft)) throw new Error('Confirmed draft source changed.');
  if (options.resume) await recoverRunOwner(root);
  const controller = await RunController.open({ root }), work = new OwnedWork(controller.signal);
  const stop = () => cancelAndDrain(controller, work, 'CLI user requested a durable hard stop.');
  const interrupt = () => { void stop().catch(() => {}); };
  let control: Awaited<ReturnType<typeof startControl>> | undefined;
  let warnings: Awaited<ReturnType<typeof startBudgetWarnings>> | undefined;
  try {
    control = await startControl(root, original.run.runId, stop); process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
    if (options.notify) warnings = await startBudgetWarnings(root, options.notify);
    await reconcileEntryReceipts(root, controller);
    if (options.resume && !await optionalJson(root, 'execution.json')) throw new Error('Original planning result is unavailable; resume cannot perform another paid plan.');
    const host = await options.createHost({ root, controller, requirement, draft, resume: options.resume, work });
    let phase = 'planning';
    const outcome = await work.run(async signal => {
      let execution: { capability: string; requirement: RequirementContract; tasks: PreparedTask[]; availableArtifacts: ArtifactReference[]; plan: ArtifactReference };
      if (options.resume) {
        execution = await json(root, 'execution.json');
        if (execution.capability !== host.capability || !sameValue(execution.requirement, requirement) || !sameValue(execution.availableArtifacts, host.availableArtifacts)) throw new Error('Original execution host or fixed requirements changed.');
      } else {
        await publishReceipt(join(root, 'planning-started.json'), { runId: original.run.runId, ledgerId: original.ledger.ledgerId, requirement, capability: host.capability });
        const planned = await planTaskDag({ controller, requirement, planningTaskId: 'planning', workspace: root, sessionRoot: join(root, 'sessions'), availableArtifacts: host.availableArtifacts,
          taskPolicies: host.taskPolicies, roleFactory: host.roleFactory, signal });
        host.validateTasks?.(planned.tasks);
        execution = { capability: host.capability, requirement, tasks: planned.tasks, availableArtifacts: host.availableArtifacts, plan: planned.plan };
        await publishReceipt(join(root, 'execution.json'), execution);
      }
      host.validateTasks?.(execution.tasks);
      phase = options.resume ? 'recovery' : 'execution';
      const run = (tasks: PreparedTask[], resume: boolean, availableArtifacts = execution.availableArtifacts) => {
        const common: DagOptions = { controller, requirement, tasks, sessionRoot: join(root, 'sessions'), availableArtifacts,
          roleFactory: host.roleFactory, preAuthor: host.preAuthor, capture: host.capture, verify: host.verify, reviewImages: host.reviewImages, diagnoseFailure: host.diagnoseFailure, signal,
          reviewProtocolCorrections: 1,
          scheduling: { maxParallel: 2, resources: Object.fromEntries(tasks.map(item => [item.task.taskId, ['browser-build-promotion']])) },
          recovery: { journalRoot: join(root, 'journal'), artifactRoot: root, recoverCapture: host.recoverCapture } };
        return resume ? resumeTaskDag(common) : executeTaskDag(common).then(tasks => ({ tasks, reusedTaskIds: [] as string[], blocked: [] as { taskId: string; reason: string }[] }));
      };
      const existingRepair = options.resume ? await optionalJson(root, 'repair-plan.json') : null;
      if (existingRepair?.formatVersion !== undefined && existingRepair.formatVersion !== 2) throw new SuccessorBlocked('Unknown repair plan version; preserve the original run.');
      let continuation: RepairContinuationPlan | null = existingRepair?.formatVersion === 2 ? existingRepair : null;
      if (continuation) await prepareRepairContinuation({ root, controller, plan: continuation, originals: execution.tasks, requirement, originalPlan: execution.plan, now: Date.now() });
      const prepared: PreparedTask[] = existingRepair?.tasks ?? execution.tasks;
      let result = await run(prepared, options.resume);
      let replacement: { sourceTaskId: string; replacementTaskId: string } | null = existingRepair && !continuation ? { sourceTaskId: existingRepair.sourceTaskId, replacementTaskId: existingRepair.replacementTaskId } : null;
      const failed = result.tasks.find(task => ['failed', 'needs_changes', 'waiting_user'].includes(task.state) && task.attempts.length);
      if (!existingRepair && failed && !signal.aborted) {
        const source = execution.tasks.find(item => item.task.taskId === failed.taskId);
        if (!source) throw new Error('Failed task does not belong to the original prepared DAG.');
        const session = failed.attempts.at(-1)!.sessionRef;
        const feedback = await optionalJson(session, 'failure.json') as RepairFeedback | null;
        if (feedback) {
          if (host.continuationTargets) {
            try {
              const snapshot = await controller.read(), sources = [source, ...findUnstartedSuccessors(snapshot, execution.tasks, failed.taskId)];
              const grants = allocateRepairGrants(snapshot, sources);
              const assessment = assessRepair({ snapshot, requirement, history: [feedback], policy: DEFAULT_REPAIR_POLICY, now: Date.now(),
                estimate: { costMicroCny: Object.values(grants).reduce((sum, amount) => sum + amount, 0), durationMs: sources.length * 60000, cleanupMs: 5000 } });
              if (assessment.action !== 'repair') throw new SuccessorBlocked(`Bounded continuation blocked: ${assessment.reason}.`);
              const targets = await host.continuationTargets(sources, feedback, grants);
              if (!targets) throw new SuccessorBlocked('Host cannot establish safe fixed continuation outputs.');
              const plan = await sealRepairDiagnostics(root, buildRepairContinuation({ snapshot, originals: execution.tasks, requirement, originalPlan: execution.plan, failedId: failed.taskId, feedback, targets, now: Date.now() }));
              await prepareRepairContinuation({ root, controller, plan, originals: execution.tasks, requirement, originalPlan: execution.plan, now: Date.now() });
              continuation = plan;
              const next = await run(plan.tasks, true);
              result = { ...next, reusedTaskIds: [...new Set([...result.reusedTaskIds, ...next.reusedTaskIds])],
                blocked: [...result.blocked.filter(item => !plan.replacements.some(replacement => replacement.sourceTaskId === item.taskId)), ...next.blocked] };
            } catch (error) {
              if (!(error instanceof SuccessorBlocked) && !(error instanceof RecoveryBlocked)) throw error;
              result.blocked.push({ taskId: failed.taskId, reason: error.message });
            }
          } else {
            const target = await host.repair(failed, feedback);
            if (target) {
              const assessment = { snapshot: await controller.read(), requirement, history: [feedback], policy: DEFAULT_REPAIR_POLICY, now: Date.now(),
                estimate: { costMicroCny: target.allocationMicroCny, durationMs: 60000, cleanupMs: 5000 } };
              if (assessRepair(assessment).action === 'repair') {
                const taskId = `${failed.taskId.slice(0, 54)}-repair`;
                const repaired = createLinkedRepairTask({ ...assessment, ...target, source: { ...source, task: failed }, taskId });
                const ancestorIds = new Set<string>();
                const ancestors = (task: TaskContract) => { for (const dependency of task.dependsOn) {
                  if (ancestorIds.has(dependency.taskId)) continue;
                  const parent = execution.tasks.find(item => item.task.taskId === dependency.taskId);
                  if (!parent) throw new Error('Original repair dependency is unavailable.');
                  ancestorIds.add(dependency.taskId); ancestors(parent.task);
                } };
                ancestors(repaired.task);
                const recoveryTasks = [...execution.tasks.filter(item => ancestorIds.has(item.task.taskId)), repaired];
                replacement = { sourceTaskId: failed.taskId, replacementTaskId: taskId };
                await publishReceipt(join(root, 'repair-plan.json'), { tasks: recoveryTasks, ...replacement, feedback: feedback.reference });
                const passedInputs = result.tasks.filter(task => task.state === 'passed').flatMap(task => task.artifacts);
                const next = await run([repaired], false, [...execution.availableArtifacts, ...passedInputs]);
                result = { ...next, reusedTaskIds: [...new Set([...result.reusedTaskIds, ...next.reusedTaskIds])], blocked: [...result.blocked.filter(item => item.taskId !== failed.taskId), ...next.blocked] };
              }
            }
          }
        }
      }
      const beforeDelivery = await controller.read();
      const replacements: Pick<TaskReplacement, 'sourceTaskId' | 'replacementTaskId'>[] = continuation?.replacements ?? (replacement ? [replacement] : []);
      const effective = execution.tasks.map(item => {
        const id = replacements.find(replacement => replacement.sourceTaskId === item.task.taskId)?.replacementTaskId ?? item.task.taskId;
        const current = beforeDelivery.tasks.find(task => task.taskId === id); if (!current) throw new Error('Original DAG task or declared successor is missing.'); return current;
      });
      phase = 'delivery';
      const final = await host.finish(effective);
      const state = await controller.read();
      const passed = !state.stopReason && !result.blocked.length && effective.length > 0 && effective.every(task => task.state === 'passed') && final.gaps.length === 0 && !!final.delivery;
      return { outcome: passed ? 'awaiting_user_experience' : 'incomplete', runId: state.run.runId, ledgerId: state.ledger.ledgerId, currentProject: root, ...final,
        gaps: [...final.gaps, ...result.blocked.map(item => `${item.taskId}: ${item.reason}`), ...effective.filter(task => task.state !== 'passed').flatMap(task => task.handoff.remaining)],
        taskHistory: state.tasks.map(task => ({ taskId: task.taskId, state: task.state, artifacts: task.artifacts, handoff: task.handoff,
          supersededBy: replacements.find(replacement => replacement.sourceTaskId === task.taskId)?.replacementTaskId ?? null })), replacement: replacement ?? continuation?.replacements[0] ?? null, replacements,
        reusedTaskIds: result.reusedTaskIds, status: await schedulerStatus(controller), userExperience: 'not_confirmed' };
    }).catch(async error => {
      const state = await controller.read(), final = await host.finish(state.tasks).catch(() => ({ gaps: ['No accepted candidate can be established.'] }));
      return { ...final, outcome: 'incomplete', runId: state.run.runId, ledgerId: state.ledger.ledgerId, currentProject: root,
        gaps: [...final.gaps, state.stopReason ? `${state.stopReason.code}: ${state.stopReason.reason}` : error instanceof SuccessorBlocked || error instanceof RecoveryBlocked ? error.message : `${phase} did not complete; inspect the preserved host/session handoff before retrying.`],
        taskHistory: state.tasks.map(task => ({ taskId: task.taskId, state: task.state, artifacts: task.artifacts, handoff: task.handoff })),
        replacement: null, reusedTaskIds: [], status: await schedulerStatus(controller), userExperience: 'not_confirmed' };
    });
    await mkdir(join(root, 'delivery'), { recursive: true });
    const report = `delivery/report-${randomUUID()}.json`; await publishReceipt(join(root, report), outcome);
    return { ...outcome, report };
  } finally {
    process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
    await warnings?.close(); await control?.close(); await controller.close();
  }
}
