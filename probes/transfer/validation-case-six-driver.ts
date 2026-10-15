import { join, resolve, relative, sep } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sameValue } from '../../src/contracts/validation.ts';
import { directory, regularFile, safePath } from '../../src/artifacts/paths.ts';
import { createValidationRequirement } from '../../src/roles/execution-input.ts';
import type { HistoricalPassedStages } from '../../src/runtime/historical-passed-stages.ts';
import type { ValidationExecutionBinding } from '../../src/runtime/validation-scope.ts';
import { validationHash } from '../../src/runtime/validation-validation.ts';
import { runOwnedNode } from '../../src/runtime/recovery/owned-command.ts';
import { publishReceipt } from '../../src/runtime/recovery/receipt-file.ts';
import type { ValidationHostInput } from '../e2e/validation-run.ts';
import { TRANSFER_VALIDATION_CASE_SIX as D6 } from './validation-case-six-declaration.ts';
import { TRANSFER_VALIDATION_CASE_FIVE as OLD } from './validation-case-five-declaration.ts';
import { createTransferReusedConsumerHost } from '../../src/runtime/adapters/transfer/runtime-host.ts';
import { requireValidationScope } from '../../src/runtime/validation-scope.ts';
import { executeTaskDag, resumeTaskDag } from '../../src/runtime/orchestrator.ts';
import type { PreparedTask, DagOptions } from '../../src/runtime/orchestrator.ts';
import type { PreparedBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import type { ValidationRequirement } from '../../src/roles/execution-input.ts';
import type { ValidationHostResult } from '../e2e/validation-run.ts';
import type { RepairFeedback } from '../../src/runtime/repair/feedback.ts';
import { TaskJournal } from '../../src/runtime/recovery/task-journal.ts';
import type { RecoveryOrigin } from '../../src/runtime/recovery/task-journal.ts';
import type { ValidationDeclaration } from '../../src/runtime/validation-types.ts';
import { fixedTransferValidationInput } from './validation-input.ts';
import { createFixedTransferCodingOnlyTasks } from './validation-case-six-task.ts';
import type { prepareTransferValidationCaseSixExecution } from './validation-case-six-task.ts';

export function createFixedTransferCodingOnlyDriver(D: ValidationDeclaration, manifestLocation: string,
  requireOwnSource: (input: ValidationHostInput, signal: AbortSignal) => Promise<void> = async () => {},
  prepareExecution?: typeof prepareTransferValidationCaseSixExecution, workerURL?: URL) {
const { readTransferValidationInput: readTransferValidationCaseSixInput, createTransferValidationIdentityReader: createTransferValidationCaseSixIdentityReader } = fixedTransferValidationInput(D);
const prepareTransferValidationCaseSixExecution = prepareExecution ?? createFixedTransferCodingOnlyTasks(D, manifestLocation).prepareTransferValidationCaseSixExecution;
function fixed(input: ValidationHostInput) {
  input.controller.requireValidationCase(input.window.caseId, input.window.windowId);
  if (input.window.caseId !== D.caseId || !sameValue(input.window.quote.declaration, D)
    || resolve(input.root) !== join(resolve(input.repository), '.cosmos/e2e', D.caseId)
    || resolve(input.ledgerRoot) !== join(resolve(input.repository), '.cosmos/validation-shared')) throw new Error('Case6 driver requires fixed declaration, scope and roots.');
  input.signal.throwIfAborted();
}
/** Current planning grant authorizes one host bootstrap; it creates no planning session or SDK request. */
async function bootstrapTransferValidationCaseSixToolchain(input: ValidationHostInput, execute: typeof runOwnedNode = runOwnedNode) {
  fixed(input);
  const folder = await directory(input.root, 'host-jobs'); input.signal.throwIfAborted();
  const request = join(folder, 'transfer-bootstrap.json'), response = join(folder, 'transfer-bootstrap-result.json');
  await publishReceipt(request, { formatVersion: 'validation-worker-1', operation: 'bootstrap', root: input.root, repository: input.repository, response }, input.signal);
  input.signal.throwIfAborted();
  const remaining = Date.parse(input.window.deadlineAt) - Date.now() - 5000;
  if (remaining < 1000) throw new Error('Case6 bootstrap cannot cover the current deadline and cleanup.');
  const worker = workerURL ?? new URL('../e2e/validation-worker.ts', import.meta.url);
  const result = await input.work.run(signal => execute({ controller: input.controller,
    authority: { caseId: D.caseId, windowId: input.window.windowId, taskId: D.grants.planning.taskId, deadlineAt: input.window.deadlineAt },
    args: ['--experimental-strip-types', fileURLToPath(worker), request], cwd: input.root,
    signal: AbortSignal.any([signal, input.signal]), timeoutMs: Math.min(190000, remaining) }));
  input.signal.throwIfAborted(); if (!result.passed) throw new Error('Case6 fixed bootstrap worker did not complete.');
  const bytes = await regularFile(input.root, 'host-jobs/transfer-bootstrap-result.json', input.signal); input.signal.throwIfAborted();
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (value?.formatVersion !== 'validation-worker-result-1' || value.operation !== 'bootstrap' || value.outcome !== 'completed'
    || typeof value.result !== 'string' || resolve(value.result) !== join(resolve(input.root), 'toolchain')) throw new Error('Case6 fixed bootstrap result changed.');
  fixed(input); return value.result as string;
}

async function requireHistorical(input: ValidationHostInput, historical: HistoricalPassedStages, signal: AbortSignal) {
  signal.throwIfAborted(); fixed(input);
  const ref = historical.manifestRef, refs = input.window.operatorDecision.sourceRefs.filter(item => item.artifactId === `${D.caseId}-historical-stages`);
  if (resolve(historical.originalRoot) !== join(resolve(input.repository), '.cosmos/e2e', OLD.caseId) || resolve(historical.targetRoot) !== resolve(input.root)
    || ref.artifactId !== `${D.caseId}-historical-stages` || ref.location !== manifestLocation || !/^[a-f0-9]{64}$/.test(ref.version)
    || refs.length !== 1 || !sameValue(refs[0], ref)) throw new Error('Case6 requires the exact operator-covered historical manifest digest and fixed roots.');
  const bytes = await historical.readManifest(signal); signal.throwIfAborted();
  if (validationHash(Buffer.from(bytes)) !== ref.version) throw new Error('Case6 requires the exact operator-covered historical manifest digest and fixed roots.');
  await historical.verify(signal); signal.throwIfAborted();
  await requireOwnSource(input, signal); signal.throwIfAborted();
}
/** Current input and immutable operator-covered source exist before host capture/context creation. */
async function stageTransferValidationCaseSixInput(input: ValidationHostInput, historical: HistoricalPassedStages, resume = false) {
  await requireHistorical(input, historical, input.signal); input.signal.throwIfAborted();
  const frozen = await readTransferValidationCaseSixInput(input.repository, input.signal); input.signal.throwIfAborted();
  const bytes = await regularFile(input.repository, D.inputs.requirements.path, input.signal); input.signal.throwIfAborted();
  if (resume) {
    const actual = await regularFile(input.root, 'requirements/fixed.json', input.signal); input.signal.throwIfAborted();
    if (!actual.equals(bytes)) throw new Error('Resumed C6 fixed input changed.');
  } else {
    await directory(input.root, 'requirements'); input.signal.throwIfAborted();
    const path = await safePath(input.root, 'requirements/fixed.json', input.signal); input.signal.throwIfAborted();
    await writeFile(path, bytes, { flag: 'wx', signal: input.signal }); input.signal.throwIfAborted();
  }
  const sources = [{ artifactId: `${D.caseId}-input`, version: D.inputs.requirements.version, location: 'requirements/fixed.json' }];
  const identityReader = createTransferValidationCaseSixIdentityReader({ repository: input.repository, reviewedPlatformSha: input.window.quote.identity.reviewedPlatformSha });
  const binding: ValidationExecutionBinding & { historicalManifest: { reference: HistoricalPassedStages['manifestRef']; readBytes: HistoricalPassedStages['readManifest'] } } = {
    caseId: D.caseId, windowId: input.window.windowId, historicalManifest: { reference: historical.manifestRef,
      readBytes: async signal => { signal.throwIfAborted(); const bytes = await historical.readManifest(signal); signal.throwIfAborted(); return bytes; } },
    async readScope(signal) {
      signal.throwIfAborted(); await requireHistorical(input, historical, signal); signal.throwIfAborted();
      const identity = await identityReader(signal); signal.throwIfAborted();
      const current = await readTransferValidationCaseSixInput(input.repository, signal); signal.throwIfAborted();
      if (!sameValue(identity, input.window.quote.identity) || !sameValue(current.manifest, frozen.manifest)) throw new Error('Current C6 frozen source or input changed.');
      const fixedBytes = await regularFile(input.root, 'requirements/fixed.json', signal); signal.throwIfAborted();
      const requirementBytes = await regularFile(input.repository, D.inputs.requirements.path, signal); signal.throwIfAborted();
      if (!fixedBytes.equals(requirementBytes)) throw new Error('Current C6 frozen source or input changed.');
      for (const file of D.inputs.template.files) {
        signal.throwIfAborted();
        const installed = await regularFile(input.root, 'toolchain/' + file.path.slice('templates/2d/'.length), signal); signal.throwIfAborted();
        const source = await regularFile(input.repository, file.path, signal); signal.throwIfAborted();
        if (!installed.equals(source)) throw new Error('Current C6 fixed toolchain input changed.');
      }
      const { sourceSha256, ...decision } = input.window.operatorDecision, operatorReceipt = await regularFile(input.ledgerRoot, decision.source.location, signal);
      signal.throwIfAborted();
      if (validationHash(operatorReceipt) !== sourceSha256 || !sameValue(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(operatorReceipt)), {
        formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId: decision.decisionId, actorId: decision.actorId,
        decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote: input.window.quote })) throw new Error('Current C6 operator source bytes changed.');
      signal.throwIfAborted();
      return { requirement: createValidationRequirement({ specVersion: current.requirements.specVersion, sources, acceptance: current.requirements.preparation.acceptance,
        validation: { runId: input.window.quote.basis.runId, ledgerId: input.window.quote.basis.ledgerId, caseId: D.caseId, windowId: input.window.windowId, ...identity, decision } }), operatorReceipt };
    },
  };
  const { requirement } = await binding.readScope(input.signal); input.signal.throwIfAborted(); return { requirement, binding, proposal: frozen.requirements.preparation };
}

/** Real current coding DAG and its own bounded repair; historical tasks are dependencies only. */
async function executeTransferValidationCaseSixDag(input: ValidationHostInput, requirement: ValidationRequirement, validation: ValidationExecutionBinding,
  host: PreparedBrowserHost, historical: HistoricalPassedStages, resume = false): Promise<ValidationHostResult> {
  return host.withPreparation(async () => {
    input.signal.throwIfAborted(); await requireHistorical(input, historical, input.signal); input.signal.throwIfAborted();
    await requireValidationScope(input.controller, requirement, validation, input.signal); input.signal.throwIfAborted();
    const inherited = await historical.verify(input.signal); input.signal.throwIfAborted();
    const initial = await input.controller.read(input.signal); input.signal.throwIfAborted();
    const execution = await prepareTransferValidationCaseSixExecution({ state: initial, window: input.window, requirement, host, historical: inherited,
      root: input.root, manifestRef: historical.manifestRef, capability: host.capability, signal: input.signal }, resume);
    const coding = execution.tasks[0]; await host.bindPreparedTasks([coding]);
    const recovery = { artifactRoot: input.root, journalRoot: join(input.root, 'journal'), recoverCapture: host.recoverCapture };
    const common: Omit<DagOptions, 'tasks' | 'availableArtifacts'> = { controller: input.controller, requirement, validation, historicalDependencies: historical,
      sessionRoot: join(input.root, 'sessions'), roleFactory: host.roleFactory, preAuthor: host.preAuthor, capture: host.capture, verify: host.verify,
      reviewImages: host.reviewImages, diagnoseFailure: host.diagnoseFailure, signal: input.signal, recovery,
      reviewProtocolCorrections: 1, authorProtocolCorrections: 1, codingHandoffClarifications: 1, hostEvidencedCodingHandoff: 1 };
    const gaps: string[] = []; let effective = coding;
    const claimed = initial.validation!.cases.find(window => window.caseId === D.caseId)!.repair;
    if (claimed) {
      if (!resume || claimed.sourceTaskId !== D.grants.coding.taskId || claimed.taskId !== D.grants.repair.taskId) throw new Error('C6 repair must retain its own current coding source.');
      const originBytes = await regularFile(input.root, `journal/task-${claimed.taskId}/origin.json`, input.signal); input.signal.throwIfAborted();
      const origin = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(originBytes)) as RecoveryOrigin;
      if (origin.validationCase?.caseId !== D.caseId || origin.validationCase.windowId !== input.window.windowId || !sameValue(origin.requirement, requirement)
        || origin.artifactRoot !== input.root || origin.sessionRoot !== join(input.root, 'sessions') || origin.prepared.role !== 'coding'
        || origin.prepared.task.taskId !== D.grants.repair.taskId) throw new Error('Cold C6 repair origin changed.');
      await TaskJournal.open(recovery, origin, true, input.signal); input.signal.throwIfAborted(); effective = origin.prepared; await host.bindPreparedTasks([effective]);
      const result = await resumeTaskDag({ ...common, tasks: [effective], availableArtifacts: host.availableArtifacts }); gaps.push(...result.blocked.map(item => `${item.taskId}: ${item.reason}`));
    } else {
      if (resume && initial.tasks.some(task => task.taskId === coding.task.taskId)) {
        const result = await resumeTaskDag({ ...common, tasks: [coding], availableArtifacts: host.availableArtifacts }); gaps.push(...result.blocked.map(item => `${item.taskId}: ${item.reason}`));
      } else await executeTaskDag({ ...common, tasks: [coding], availableArtifacts: host.availableArtifacts });
      const snapshot = await input.controller.read(input.signal); input.signal.throwIfAborted();
      const current = snapshot.tasks.find(task => task.taskId === coding.task.taskId)!;
      if (current && ['failed', 'needs_changes'].includes(current.state) && current.attempts.length === 1 && current.attempts[0].failure?.classification === 'code_defect' && !input.signal.aborted) {
        const path = relative(input.root, join(current.attempts[0].sessionRef, 'failure.json')).split(sep).join('/');
        const feedbackBytes = await regularFile(input.root, path, input.signal); input.signal.throwIfAborted();
        const feedback = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(feedbackBytes)) as RepairFeedback;
        try {
          effective = await host.prepareValidationRepair({ ...coding, task: current }, feedback, recovery); await host.bindPreparedTasks([effective]);
          await publishReceipt(join(input.root, 'repair-dispatch.json'), { sourceTaskId: D.grants.coding.taskId, sourceAttemptId: current.attempts[0].attemptId,
            newTaskId: effective.task.taskId, feedback: feedback.reference, expectedArtifacts: effective.expectedArtifacts, maxCodingRepairs: 1, deadlineAt: input.window.deadlineAt }, input.signal);
          const result = await resumeTaskDag({ ...common, tasks: [effective], availableArtifacts: host.availableArtifacts }); gaps.push(...result.blocked.map(item => `${item.taskId}: ${item.reason}`));
        } catch { gaps.push('The current bounded coding repair did not complete; retain its source attempt and feedback.'); }
      }
    }
    input.signal.throwIfAborted(); await requireValidationScope(input.controller, requirement, validation, input.signal); input.signal.throwIfAborted();
    const verified = await historical.verify(input.signal); input.signal.throwIfAborted();
    const snapshot = await input.controller.read(input.signal); input.signal.throwIfAborted();
    const current = snapshot.tasks.find(task => task.taskId === effective.task.taskId);
    if (!current) throw new Error('Current C6 coding result is missing.');
    const final = await host.finish([current]); gaps.push(...final.gaps);
    if (current.state !== 'passed' || current.review.verdict !== 'approved') gaps.push(...current.handoff.remaining);
    if (!final.delivery || !final.acceptedCandidate) gaps.push('No exact accepted current C6 candidate is available.');
    input.signal.throwIfAborted(); await requireValidationScope(input.controller, requirement, validation, input.signal); input.signal.throwIfAborted();
    await historical.verify(input.signal); input.signal.throwIfAborted();
    const tasks = [...verified.stages.map(stage => stage.task), current];
    await publishReceipt(join(input.root, 'host-result.json'), { outcome: gaps.length ? 'failed' : 'passed', plan: execution.plan,
      inheritedSource: historical.manifestRef, inheritedTaskIds: verified.stages.map(stage => stage.task.taskId), effectiveTaskId: current.taskId,
      tasks, gaps, ...(final.acceptedCandidate ? { accepted: final.acceptedCandidate } : {}), userExperience: 'not_confirmed' }, input.signal);
    return { outcome: gaps.length ? 'failed' : 'passed', gaps, tasks, plan: execution.plan,
      ...(final.acceptedCandidate ? { accepted: final.acceptedCandidate.candidateRef } : {}) };
  });
}
/** Fixed native caller; no planner, role, session, map, path or fixture selector is accepted. */
async function generateTransferValidationCaseSix(input: ValidationHostInput, historical: HistoricalPassedStages, resume = false): Promise<ValidationHostResult> {
  await requireHistorical(input, historical, input.signal); input.signal.throwIfAborted();
  if (!resume) await bootstrapTransferValidationCaseSixToolchain(input);
  input.signal.throwIfAborted();
  const { requirement, binding, proposal } = await stageTransferValidationCaseSixInput(input, historical, resume);
  input.signal.throwIfAborted();
  const host = await createTransferReusedConsumerHost({ root: input.root, controller: input.controller, requirement, proposal, validation: binding, work: input.work, resume, historicalStages: historical });
  return executeTransferValidationCaseSixDag(input, requirement, binding, host, historical, resume);
}

return { bootstrapTransferValidationCaseSixToolchain, stageTransferValidationCaseSixInput, executeTransferValidationCaseSixDag, generateTransferValidationCaseSix };
}
export const { bootstrapTransferValidationCaseSixToolchain, stageTransferValidationCaseSixInput, executeTransferValidationCaseSixDag, generateTransferValidationCaseSix }
  = createFixedTransferCodingOnlyDriver(D6, 'cos20-transfer-validation-6-reuse.json');
