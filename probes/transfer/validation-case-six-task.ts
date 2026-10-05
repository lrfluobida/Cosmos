import { sameValue } from '../../src/contracts/validation.ts';
import { regularFile, safePath } from '../../src/artifacts/paths.ts';
import { publishReceipt } from '../../src/runtime/recovery/receipt-file.ts';
import { validateTaskInputs } from '../../src/contracts/index.ts';
import type { TaskContract } from '../../src/contracts/types.ts';
import type { PlanningTaskPolicy } from '../../src/roles/planner.ts';
import type { ValidationRequirement } from '../../src/roles/execution-input.ts';
import type { PreparedTask } from '../../src/runtime/orchestrator.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import type { ValidationCaseWindow } from '../../src/runtime/validation-types.ts';
import type { VerifiedHistoricalStages } from '../../src/runtime/historical-passed-stages.ts';
import type { ArtifactReference } from '../../src/contracts/types.ts';
import { requireValidationTask, validationHash } from '../../src/runtime/validation-validation.ts';
import type { ValidationDeclaration } from '../../src/runtime/validation-types.ts';
import { TRANSFER_VALIDATION_CASE_SIX as D6 } from './validation-case-six-declaration.ts';
import { TRANSFER_VALIDATION_CASE_FIVE as OLD } from './validation-case-five-declaration.ts';

export function createFixedTransferCodingOnlyTasks(D: ValidationDeclaration, manifestLocation: string) {
/** Deterministic current contract only; the caller separately authenticates historical bytes and current scope. */
function deriveTransferValidationCaseSixCodingTask(input: {
  state: RunSnapshot; window: ValidationCaseWindow; requirement: ValidationRequirement;
  host: { availableArtifacts: ArtifactReference[]; taskPolicies: PlanningTaskPolicy[] };
  historical: Pick<VerifiedHistoricalStages, 'stages' | 'designArtifacts' | 'mediaArtifact'>;
}): PreparedTask {
  const { state, window, requirement, host, historical } = input;
  if (window.caseId !== D.caseId || !sameValue(window.quote.declaration, D) || requirement.validation.caseId !== D.caseId
    || requirement.validation.windowId !== window.windowId || requirement.validation.runId !== state.run.runId
    || requirement.validation.ledgerId !== state.ledger.ledgerId || !sameValue(window.quote.identity, {
      reviewedPlatformSha: requirement.validation.reviewedPlatformSha, frozenCaseInputHash: requirement.validation.frozenCaseInputHash })) {
    throw new Error('Derived coding requires the fixed current C6 scope.');
  }
  const policy = host.taskPolicies[0];
  if (host.taskPolicies.length !== 1 || policy.policyId !== 'game-code' || policy.role !== 'coding'
    || policy.allocationMicroCny !== D.grants.coding.amountMicroCny || !policy.outputs.length
    || historical.stages.length !== 2 || historical.stages[0].role !== 'design' || historical.stages[1].role !== 'art'
    || historical.stages.some(item => item.task.taskId !== OLD.grants[item.role].taskId)
    || historical.designArtifacts.length !== 4) throw new Error('Derived coding requires the one current coding policy and exact inherited design/art topology.');
  if (requirement.sources.some(ref => !host.availableArtifacts.some(item => sameValue(ref, item)))) throw new Error('Current requirement source is absent from coding policy inputs.');
  const inputs = structuredClone([...host.availableArtifacts, ...historical.designArtifacts, historical.mediaArtifact]);
  const acceptanceIds = [...window.quote.requirements.acceptanceIds], objective = 'Implement the fixed requirements using the verified original design and media.';
  const contextId = `${D.caseId}-coding-${validationHash(JSON.stringify({ windowId: window.windowId, inputs, policy }))}`;
  const task: TaskContract = {
    contractVersion: '1.0.0', taskId: D.grants.coding.taskId, kind: state.run.kind, runId: state.run.runId, specVersion: requirement.specVersion,
    authorId: `${D.caseId}-coding-author`, acceptanceIds, objective,
    dependsOn: historical.stages.map(item => ({ taskId: item.task.taskId, requiredState: 'passed', state: 'passed' })), inputs,
    context: { contextId, rules: structuredClone(policy.rules ?? []), interfaces: structuredClone(policy.interfaces ?? []), knownFailures: [], tools: [...policy.tools] },
    ownership: { writePaths: [...policy.writePaths], readOnlyPaths: [...policy.readOnlyPaths] },
    outputs: policy.outputs.map(({ type, schema, destination }) => ({ type, schema, destination })),
    acceptance: requirement.acceptance.filter(item => acceptanceIds.includes(item.acceptanceId)).map(item => ({ acceptanceId: item.acceptanceId,
      steps: [...item.steps], expected: item.expected, evidenceDestinations: [`evidence/${D.grants.coding.taskId}/report.json`] })),
    budget: { ledgerId: state.ledger.ledgerId, allocationMicroCny: policy.allocationMicroCny, originalDeadlineAt: state.run.originalDeadlineAt },
    state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [],
    handoff: { completed: [], remaining: [objective], uncertainty: [], resumeFrom: null },
    review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] },
  };
  requireValidationTask(state, task, window);
  const errors = validateTaskInputs(task, inputs);
  if (errors.length) throw new Error(`Invalid derived coding contract: ${errors.map(error => error.message).join('; ')}`);
  return { role: 'coding', workspace: policy.workspace, task,
    expectedArtifacts: policy.outputs.map(output => ({ artifactId: output.artifactId, version: output.version, location: output.destination })) };
}

/** Own immutable execution data, not a planner result; cold resume derives current policy again. */
async function prepareTransferValidationCaseSixExecution(input: Parameters<typeof deriveTransferValidationCaseSixCodingTask>[0] & {
  root: string; manifestRef: ArtifactReference; capability: string; signal: AbortSignal;
}, resume: boolean) {
  input.signal.throwIfAborted();
  if (input.manifestRef.artifactId !== `${D.caseId}-historical-stages` || input.manifestRef.location !== manifestLocation
    || !/^[a-f0-9]{64}$/.test(input.manifestRef.version)) throw new Error('Current execution requires the fixed historical manifest reference.');
  const item = deriveTransferValidationCaseSixCodingTask(input), value = {
    formatVersion: 'transfer-reused-execution/1', caseId: D.caseId, windowId: input.window.windowId, declaration: D, requirement: input.requirement,
    capability: input.capability, manifestRef: input.manifestRef, inheritedTaskIds: input.historical.stages.map(stage => stage.task.taskId),
    tasks: [item], availableArtifacts: input.host.availableArtifacts,
  };
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n'), name = 'execution-reused.json';
  if (resume) {
    if (!(await regularFile(input.root, name)).equals(bytes)) throw new Error('Current C6 execution bytes or derived policy changed.');
  } else await publishReceipt(await safePath(input.root, name), value, input.signal);
  input.signal.throwIfAborted();
  return { tasks: [item], plan: { artifactId: `${D.caseId}-current-execution`, version: validationHash(bytes), location: name } };
}

return { deriveTransferValidationCaseSixCodingTask, prepareTransferValidationCaseSixExecution };
}
export const { deriveTransferValidationCaseSixCodingTask, prepareTransferValidationCaseSixExecution }
  = createFixedTransferCodingOnlyTasks(D6, 'cos20-transfer-validation-6-reuse.json');
