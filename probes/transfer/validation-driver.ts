import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { regularFile, safePath, directory } from '../../src/artifacts/paths.ts';
import { sameValue } from '../../src/contracts/validation.ts';
import { createValidationRequirement } from '../../src/roles/execution-input.ts';
import type { ValidationRequirement } from '../../src/roles/execution-input.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import { executeTaskDag, resumeTaskDag } from '../../src/runtime/orchestrator.ts';
import type { DagOptions } from '../../src/runtime/orchestrator.ts';
import { runOwnedNode } from '../../src/runtime/recovery/owned-command.ts';
import { publishReceipt } from '../../src/runtime/recovery/receipt-file.ts';
import { validationHash } from '../../src/runtime/validation-validation.ts';
import { requireValidationScope } from '../../src/runtime/validation-scope.ts';
import type { ValidationExecutionBinding } from '../../src/runtime/validation-scope.ts';
import type { PreparedBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import type { RepairFeedback } from '../../src/runtime/repair/feedback.ts';
import type { ValidationHostInput, ValidationHostResult } from '../e2e/validation-run.ts';
import { createTransferConsumerHost } from './runtime-host.ts';
import { TRANSFER_VALIDATION_CASE } from './validation-declaration.ts';
import { TRANSFER_VALIDATION_CASE_TWO } from './validation-case-two-declaration.ts';
import { TRANSFER_VALIDATION_CASE_THREE } from './validation-case-three-declaration.ts';
import { TRANSFER_VALIDATION_CASE_FOUR } from './validation-case-four-declaration.ts';
import { readTransferValidationInput, createTransferValidationIdentityReader,
  readTransferValidationCaseTwoInput, createTransferValidationCaseTwoIdentityReader,
  readTransferValidationCaseThreeInput, createTransferValidationCaseThreeIdentityReader,
  readTransferValidationCaseFourInput, createTransferValidationCaseFourIdentityReader } from './validation-input.ts';

function fixedDriver(D: typeof TRANSFER_VALIDATION_CASE, readInput: typeof readTransferValidationInput, identity: typeof createTransferValidationIdentityReader, bindProposalAliases = false) {
function fixed(input: ValidationHostInput) {
  input.controller.requireValidationCase(input.window.caseId, input.window.windowId);
  if (!sameValue(input.window.quote.declaration, D) || input.window.caseId !== D.caseId
    || resolve(input.root) !== join(resolve(input.repository), '.cosmos/e2e', D.caseId)
    || resolve(input.ledgerRoot) !== join(resolve(input.repository), '.cosmos/validation-shared')) throw new Error('Transfer driver requires its fixed declaration, case and roots.');
  input.signal.throwIfAborted();
}
/** Fixed worker and new planning authority. The optional trusted executor is for pure transport tests only. */
async function bootstrapTransferToolchain(input: ValidationHostInput, execute: typeof runOwnedNode = runOwnedNode) {
  fixed(input);
  const folder = await directory(input.root, 'host-jobs'), request = join(folder, 'transfer-bootstrap.json'), response = join(folder, 'transfer-bootstrap-result.json');
  await publishReceipt(request, { formatVersion: 'validation-worker-1', operation: 'bootstrap', root: input.root, repository: input.repository, response });
  const remaining = Date.parse(input.window.deadlineAt) - Date.now() - 5000;
  if (remaining < 1000) throw new Error('Transfer bootstrap cannot cover original deadline and cleanup.');
  const worker = new URL('../e2e/validation-worker.ts', import.meta.url);
  const result = await input.work.run(signal => execute({ controller: input.controller,
    authority: { caseId: D.caseId, windowId: input.window.windowId, taskId: D.grants.planning.taskId, deadlineAt: input.window.deadlineAt },
    args: ['--experimental-strip-types', fileURLToPath(worker), request], cwd: input.root,
    signal: AbortSignal.any([signal, input.signal]), timeoutMs: Math.min(190000, remaining) }));
  if (!result.passed) throw new Error('Fixed transfer bootstrap worker did not complete.');
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(input.root, 'host-jobs/transfer-bootstrap-result.json')));
  if (value?.formatVersion !== 'validation-worker-result-1' || value.operation !== 'bootstrap' || value.outcome !== 'completed'
    || typeof value.result !== 'string' || resolve(value.result) !== join(resolve(input.root), 'toolchain')) throw new Error('Fixed transfer bootstrap result changed.');
  fixed(input); return value.result as string;
}
/** A complete read-only scope exists before host registry captures are created. */
async function stageTransferValidationInput(input: ValidationHostInput) {
  fixed(input); const frozen = await readInput(input.repository);
  await directory(input.root, 'requirements');
  await writeFile(await safePath(input.root, 'requirements/fixed.json'), await regularFile(input.repository, D.inputs.requirements.path), { flag: 'wx', signal: input.signal });
  const sources = [{ artifactId: `${D.caseId}-input`, version: D.inputs.requirements.version, location: 'requirements/fixed.json' }];
  const identityReader = identity({ repository: input.repository, reviewedPlatformSha: input.window.quote.identity.reviewedPlatformSha });
  const binding: ValidationExecutionBinding = { caseId: D.caseId, windowId: input.window.windowId, async readScope(signal) {
    signal.throwIfAborted(); fixed(input);
    const identity = await identityReader(signal), current = await readInput(input.repository);
    if (!sameValue(identity, input.window.quote.identity) || !sameValue(current.manifest, frozen.manifest)) throw new Error('Transfer frozen source identity changed.');
    if (!(await regularFile(input.root, sources[0].location)).equals(await regularFile(input.repository, D.inputs.requirements.path))) throw new Error('Fixed transfer preparation input changed.');
    for (const file of D.inputs.template.files) {
      if (!(await regularFile(input.root, 'toolchain/' + file.path.slice('templates/2d/'.length))).equals(await regularFile(input.repository, file.path))) throw new Error('Fixed transfer toolchain input changed.');
    }
    const { sourceSha256, ...decision } = input.window.operatorDecision, operatorReceipt = await regularFile(input.ledgerRoot, decision.source.location);
    if (validationHash(operatorReceipt) !== sourceSha256 || !sameValue(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(operatorReceipt)), {
      formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId: decision.decisionId, actorId: decision.actorId,
      decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote: input.window.quote })) throw new Error('Transfer actual operator source bytes changed.');
    signal.throwIfAborted();
    return { requirement: createValidationRequirement({ specVersion: current.requirements.specVersion, sources,
      acceptance: current.requirements.preparation.acceptance, validation: { runId: input.window.quote.basis.runId, ledgerId: input.window.quote.basis.ledgerId,
        caseId: D.caseId, windowId: input.window.windowId, ...identity, decision } }), operatorReceipt };
  } };
  const { requirement } = await binding.readScope(input.signal); return { requirement, binding, proposal: frozen.requirements.preparation };
}
/** Trusted host assembly only. Real execution below supplies the native consumer host with no session override. */
async function executeTransferValidationDag(input: ValidationHostInput, requirement: ValidationRequirement, validation: ValidationExecutionBinding, host: PreparedBrowserHost): Promise<ValidationHostResult> {
  return host.withPreparation(async () => {
    fixed(input);
    await requireValidationScope(input.controller, requirement, validation);
    await publishReceipt(join(input.root, 'planning-started.json'), { caseId: D.caseId, windowId: input.window.windowId, requirement, capability: host.capability }, input.signal);
    const planned = await planTaskDag({ controller: input.controller, requirement, validation, planningTaskId: D.grants.planning.taskId,
      workspace: input.root, sessionRoot: join(input.root, 'sessions'), availableArtifacts: host.availableArtifacts, taskPolicies: host.taskPolicies, roleFactory: host.roleFactory, signal: input.signal,
      ...(bindProposalAliases ? { proposalIdentity: 'validation-policy-aliases/1' as const } : {}) });
    host.validateTasks?.(planned.tasks);
    await publishReceipt(join(input.root, 'execution.json'), { capability: host.capability, requirement, tasks: planned.tasks,
      availableArtifacts: host.availableArtifacts, plan: planned.plan }, input.signal);
    const recovery = { journalRoot: join(input.root, 'journal'), artifactRoot: input.root, recoverCapture: host.recoverCapture };
    const common: Omit<DagOptions, 'tasks' | 'availableArtifacts'> = { controller: input.controller, requirement, validation, sessionRoot: join(input.root, 'sessions'),
      roleFactory: host.roleFactory, preAuthor: host.preAuthor, capture: host.capture, verify: host.verify, reviewImages: host.reviewImages, diagnoseFailure: host.diagnoseFailure,
      signal: input.signal, recovery, reviewProtocolCorrections: 1, authorProtocolCorrections: 1, codingHandoffClarifications: 1, hostEvidencedCodingHandoff: 1 };
    const tasks = await executeTaskDag({ ...common, tasks: planned.tasks, availableArtifacts: host.availableArtifacts });
    let replacement: string | null = null;
    const gaps: string[] = [], failed = tasks.find(task => task.taskId === D.grants.coding.taskId && ['failed', 'needs_changes'].includes(task.state)
      && task.attempts.length === 1 && task.attempts[0].failure?.classification === 'code_defect');
    if (failed && !input.signal.aborted) {
      const original = planned.tasks.find(item => item.task.taskId === failed.taskId)!;
      const feedbackPath = relative(input.root, join(failed.attempts[0].sessionRef, 'failure.json')).split(sep).join('/');
      const feedback = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(input.root, feedbackPath))) as RepairFeedback;
      try {
        const repair = await host.prepareValidationRepair({ ...original, task: failed }, feedback, recovery);
        replacement = repair.task.taskId;
        await publishReceipt(join(input.root, 'repair-dispatch.json'), { sourceTaskId: failed.taskId, sourceAttemptId: failed.attempts[0].attemptId,
          newTaskId: replacement, feedback: feedback.reference, expectedArtifacts: repair.expectedArtifacts, maxCodingRepairs: 1, deadlineAt: input.window.deadlineAt }, input.signal);
        const resumed = await resumeTaskDag({ ...common, tasks: planned.tasks.map(item => item.task.taskId === failed.taskId ? repair : item), availableArtifacts: host.availableArtifacts });
        gaps.push(...resumed.blocked.map(item => `${item.taskId}: ${item.reason}`));
      } catch { gaps.push('The original bounded coding repair did not complete; retain its source attempt and durable feedback.'); }
    }
    await requireValidationScope(input.controller, requirement, validation);
    const state = await input.controller.read(), effective = planned.tasks.map(item => {
      const taskId = item.task.taskId === D.grants.coding.taskId && replacement ? replacement : item.task.taskId;
      const current = state.tasks.find(task => task.taskId === taskId); if (!current) throw new Error('A fixed effective transfer task is missing.'); return current;
    });
    const final = await host.finish(effective);
    gaps.push(...final.gaps, ...effective.filter(task => task.state !== 'passed' || task.review.verdict !== 'approved').flatMap(task => task.handoff.remaining));
    if (!final.delivery || !final.acceptedCandidate) gaps.push('No exact accepted transfer candidate is available.');
    await requireValidationScope(input.controller, requirement, validation);
    const current = await input.controller.read(), ids = Object.values(D.grants).map(grant => grant.taskId);
    await publishReceipt(join(input.root, 'host-result.json'), { outcome: gaps.length ? 'failed' : 'passed', plan: planned.plan, replacement,
      effectiveTaskIds: effective.map(task => task.taskId), taskHistory: current.tasks.filter(task => ids.includes(task.taskId)),
      ...(final.delivery ? { delivery: final.delivery } : {}), ...(final.acceptedCandidate ? { accepted: final.acceptedCandidate } : {}),
      gaps, userExperience: 'not_confirmed', humanIntervention: ['Implementation agents prepared fixed requirements and generic platform tools; game-specific output is assigned to runtime roles.'] }, input.signal);
    return { outcome: gaps.length ? 'failed' : 'passed', gaps, tasks: effective, plan: planned.plan,
      ...(final.acceptedCandidate ? { accepted: final.acceptedCandidate.candidateRef } : {}) };
  });
}
/** The production entry has one fixed native bootstrap and consumer factory, with no fixture/session selection. */
async function generateTransferValidationCase(input: ValidationHostInput): Promise<ValidationHostResult> {
  fixed(input); await bootstrapTransferToolchain(input);
  const { requirement, binding, proposal } = await stageTransferValidationInput(input);
  const host = await createTransferConsumerHost({ root: input.root, controller: input.controller, requirement, proposal, validation: binding, resume: false, work: input.work });
  return executeTransferValidationDag(input, requirement, binding, host);
}
return { bootstrapTransferToolchain, stageTransferValidationInput, executeTransferValidationDag, generateTransferValidationCase };
}
export const { bootstrapTransferToolchain, stageTransferValidationInput, executeTransferValidationDag, generateTransferValidationCase }
  = fixedDriver(TRANSFER_VALIDATION_CASE, readTransferValidationInput, createTransferValidationIdentityReader);
export const { bootstrapTransferToolchain: bootstrapTransferValidationCaseTwoToolchain, stageTransferValidationInput: stageTransferValidationCaseTwoInput,
  executeTransferValidationDag: executeTransferValidationCaseTwoDag, generateTransferValidationCase: generateTransferValidationCaseTwo }
  = fixedDriver(TRANSFER_VALIDATION_CASE_TWO, readTransferValidationCaseTwoInput, createTransferValidationCaseTwoIdentityReader);
export const { bootstrapTransferToolchain: bootstrapTransferValidationCaseThreeToolchain, stageTransferValidationInput: stageTransferValidationCaseThreeInput,
  executeTransferValidationDag: executeTransferValidationCaseThreeDag, generateTransferValidationCase: generateTransferValidationCaseThree }
  = fixedDriver(TRANSFER_VALIDATION_CASE_THREE, readTransferValidationCaseThreeInput, createTransferValidationCaseThreeIdentityReader);
export const { bootstrapTransferToolchain: bootstrapTransferValidationCaseFourToolchain, stageTransferValidationInput: stageTransferValidationCaseFourInput,
  executeTransferValidationDag: executeTransferValidationCaseFourDag, generateTransferValidationCase: generateTransferValidationCaseFour }
  = fixedDriver(TRANSFER_VALIDATION_CASE_FOUR, readTransferValidationCaseFourInput, createTransferValidationCaseFourIdentityReader, true);
