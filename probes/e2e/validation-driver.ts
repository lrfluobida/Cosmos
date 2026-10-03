import { createHash } from 'node:crypto';
import { cp, mkdir, open } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { ArtifactRegistry } from '../../src/artifacts/index.ts';
import { directory, regularFile, safePath } from '../../src/artifacts/paths.ts';
import { sameValue } from '../../src/contracts/validation.ts';
import { createValidationRequirement } from '../../src/roles/execution-input.ts';
import type { ValidationCaseWindow } from '../../src/runtime/validation-types.ts';
import type { ValidationExecutionBinding } from '../../src/runtime/validation-scope.ts';
import { VALIDATION_CASE } from './validation-declaration.ts';
import { createValidationIdentityReader } from './validation-identity.ts';
import { readValidationInput } from './validation-input.ts';
import { stageAcceptance } from './policy.ts';
import type { ValidationHostInput, ValidationHostResult } from './validation-run.ts';
import type { ValidationHostIO } from './validation-host.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';
import type { RoleSession } from '../../src/roles/factory.ts';
import type { PreparedTask } from '../../src/runtime/orchestrator.ts';
import type { ValidationRequirement } from '../../src/roles/execution-input.ts';
import type { RepairFeedback } from '../../src/runtime/repair/feedback.ts';
import { failureRecord, feedbackReference } from '../../src/runtime/repair/feedback.ts';
import { assessRepair, createLinkedRepairTask, DEFAULT_REPAIR_POLICY } from '../../src/runtime/repair/policy.ts';
import { TaskJournal, requireOriginalTask } from '../../src/runtime/recovery/task-journal.ts';
import type { ContentSignature } from '../../src/runtime/recovery/task-journal.ts';
import { requireValidationScope, validationJournalBinding } from '../../src/runtime/validation-scope.ts';
import { generatePilot } from './driver.ts';
import { copyReviewInputs, writeJson } from './host.ts';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** The fixed production reader: callers cannot replace requirements, policy or accepted source data. */
export function createValidationScopeReader(input: { repository: string; ledgerRoot: string; root: string; window: ValidationCaseWindow }): ValidationExecutionBinding {
  const repository = resolve(input.repository), ledgerRoot = resolve(input.ledgerRoot), root = resolve(input.root), window = structuredClone(input.window);
  if (!sameValue(window.quote.declaration, VALIDATION_CASE) || window.caseId !== VALIDATION_CASE.caseId
    || root !== join(repository, '.cosmos/e2e', VALIDATION_CASE.caseId) || ledgerRoot !== join(repository, '.cosmos/validation-shared')) throw new Error('Validation scope reader requires its fixed declaration and roots.');
  const identityReader = createValidationIdentityReader({ repository, reviewedPlatformSha: window.quote.identity.reviewedPlatformSha });
  const registry = new ArtifactRegistry(root, 'registry');
  const sources = [registry.artifactRef(`${window.caseId}-requirements`, VALIDATION_CASE.inputs.requirements.version)];
  const template = registry.artifactRef(`${window.caseId}-template`, 'v1');
  return { caseId: window.caseId, windowId: window.windowId, async readScope(signal) {
    signal.throwIfAborted();
    const identity = await identityReader(signal), frozen = await readValidationInput(repository);
    if (!sameValue(identity, window.quote.identity) || frozen.requirements.specVersion !== window.quote.requirements.specVersion
      || !sameValue(frozen.requirements.acceptanceIds, window.quote.requirements.acceptanceIds) || !sameValue(frozen.requirements.stageAcceptanceIds, window.quote.requirements.stageAcceptanceIds)) throw new Error('Frozen validation scope identity changed.');
    const expected = [
      { ref: sources[0], paths: ['requirements.json', 'character-format.ts', 'audio-format.ts'].map((name, index) => ({ capture: `_cosmos/${name}`,
        repository: index === 0 ? VALIDATION_CASE.inputs.requirements.path : index === 1 ? 'src/media/vector.ts' : 'src/media/audio.ts' })),
        generator: 'Frozen validation input and generic media format', sourceRefs: [VALIDATION_CASE.inputs.requirements.path, 'src/media/vector.ts', 'src/media/audio.ts'] },
      { ref: template, paths: ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts'].map(name => ({ capture: name, repository: `templates/2d/${name}` })),
        generator: 'Unchanged generic Phaser toolchain baseline', sourceRefs: ['templates/2d'] },
    ];
    for (const fixed of expected) {
      signal.throwIfAborted(); const capture = await registry.getCapture(fixed.ref);
      if (capture.taskId !== VALIDATION_CASE.grants.planning.taskId || capture.dependencies.length || capture.metadata.kind !== (fixed.ref === template ? 'code' : 'data')
        || !sameValue(capture.files.map(file => file.destination).sort(), fixed.paths.map(file => file.capture).sort())
        || !sameValue(capture.metadata.provenance, { kind: 'original-procedural', generator: fixed.generator, sourceRefs: fixed.sourceRefs })) throw new Error('Validation input capture provenance changed.');
      for (const file of fixed.paths) if (!(await regularFile(root, `${fixed.ref.location}/${file.capture}`)).equals(await regularFile(repository, file.repository))) throw new Error('Registered validation input bytes differ from the fixed repository.');
    }
    const { sourceSha256, ...decision } = window.operatorDecision, operatorReceipt = await regularFile(ledgerRoot, decision.source.location);
    if (hash(operatorReceipt) !== sourceSha256 || !sameValue(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(operatorReceipt)), {
      formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId: decision.decisionId, actorId: decision.actorId,
      decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote: window.quote })) throw new Error('Actual operator validation source changed.');
    signal.throwIfAborted();
    return { requirement: createValidationRequirement({ specVersion: frozen.requirements.specVersion, sources, acceptance: stageAcceptance(frozen.requirements.acceptanceIds),
      validation: { runId: window.quote.basis.runId, ledgerId: window.quote.basis.ledgerId, caseId: window.caseId, windowId: window.windowId, ...identity, decision } }), operatorReceipt };
  } };
}

/** Same native planner, roles and host pipeline. Optional session factory is for explicit offline tests only. */
export async function generateValidationCase(input: ValidationHostInput, io: ValidationHostIO, sessionFactory?: (config: PiSessionOptions) => Promise<RoleSession>, policy: { authorProtocolCorrections?: 0 | 1 } = {}): Promise<ValidationHostResult> {
  const { controller, window, root } = input;
  controller.requireValidationCase(window.caseId, window.windowId);
  if (!sameValue(window.quote.declaration, VALIDATION_CASE)) throw new Error('Only the reviewed fixed validation declaration can execute.');
  const binding = createValidationScopeReader(input), toolchain = await io.bootstrap();
  const guard = { signal: input.signal, deadlineAt: window.deadlineAt,
    committedCapMicroCny: Math.min(VALIDATION_CASE.limits.cumulativeMicroCny, window.quote.basis.committedMicroCny + VALIDATION_CASE.limits.incrementalMicroCny),
    remainingMs() { input.signal.throwIfAborted(); const remaining = Date.parse(window.deadlineAt) - Date.now() - 5000; if (remaining <= 0) throw new Error('Validation cleanup cutoff reached.'); return remaining; },
    close() {}, wrap<T>(budget: T): T { return budget; } };
  const result = await generatePilot({ repository: input.repository, root, prefix: window.caseId, controller, guard, toolchain,
    ...(policy.authorProtocolCorrections !== undefined ? { authorProtocolCorrections: policy.authorProtocolCorrections } : {}),
    childAllocationCapMicroCny: Object.entries(VALIDATION_CASE.grants).filter(([role]) => role !== 'planning').reduce((sum, [, grant]) => sum + grant.amountMicroCny, 0), confirmedAt: window.startedAt,
    sessionFactory, validation: { window, binding, work: input.work, prepareRepair: (source, original, requirement, registry) => prepareValidationRepair(input, binding, source, original, requirement, registry, policy.authorProtocolCorrections) },
    host: {
      buildProject: (_root, project, _toolchain, name, signal, taskId) => io.build(project, name, signal, taskId!),
      renderMedia: (_root, folder, value, signal, taskId) => io.media(folder, value, signal, taskId!),
      runAcceptance: (plan, _options, taskId) => io.play(plan as import('../../src/acceptance/plan.ts').AcceptancePlan, input.signal, taskId!),
    },
  });
  return { outcome: result.outcome === 'passed' ? 'passed' : 'failed', tasks: result.tasks, plan: result.plan,
    gaps: result.outcome === 'passed' ? [] : [result.remaining ?? 'No complete accepted candidate; preserve original role failures and case evidence.'],
    ...(result.accepted ? { accepted: result.accepted.candidateRef } : {}) };
}

/** Authenticate the real host failure before consuming the one predeclared coding repair. */
async function prepareValidationRepair(input: ValidationHostInput, binding: ValidationExecutionBinding, source: PreparedTask, original: PreparedTask,
  requirement: ValidationRequirement, registry: ArtifactRegistry, authorProtocolCorrections?: 0 | 1): Promise<PreparedTask | null> {
  const { root, controller } = input, { snapshot, window } = await requireValidationScope(controller, requirement, binding);
  const task = snapshot.tasks.find(task => task.taskId === source.task.taskId)!; requireOriginalTask(original.task, task);
  if (task.taskId !== VALIDATION_CASE.grants.coding.taskId || !['failed', 'needs_changes'].includes(task.state) || task.attempts.length !== 1
    || !task.attempts[0].endedAt || !sameValue(task, source.task) || window.repair) return null;
  const attempt = task.attempts[0], session = `sessions/${attempt.attemptId}`;
  if (resolve(attempt.sessionRef) !== resolve(root, session)) throw new Error('Failure session is outside the fixed case sessions.');
  const bytes = await regularFile(root, `${session}/failure.json`), feedback = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as RepairFeedback;
  if (!sameValue(feedback.reference, feedbackReference(task)) || feedback.sourceAttemptId !== attempt.attemptId || feedback.sourceTaskId !== task.taskId || feedback.sessionRef !== attempt.sessionRef
    || feedback.runId !== snapshot.run.runId || feedback.specVersion !== requirement.specVersion || feedback.originalDeadlineAt !== snapshot.run.originalDeadlineAt
    || !sameValue(feedback.acceptance, task.acceptance) || !sameValue(feedback.artifactVersions, [...task.inputs, ...task.artifacts])) throw new Error('Original failure feedback does not bind the exact source attempt and scope.');
  const estimate = { costMicroCny: 3_000_000, durationMs: 10 * 60 * 1000, cleanupMs: 5000 };
  const policy = { snapshot, requirement, validation: binding, history: [feedback], policy: DEFAULT_REPAIR_POLICY, now: Date.now(), estimate, cancelled: input.signal.aborted };
  const assessment = assessRepair(policy), authority = await controller.validationAuthority(task.taskId, 'reviewer');
  if (assessment.action !== 'repair' || authority.requestsRemaining < 8) { await writeJson(root, 'repair-decision.json', { action: 'stop', reason: assessment.reason, gaps: assessment.gaps, estimate }); return null; }
  if (attempt.outcome !== 'failed' || attempt.failure?.classification !== 'code_defect') return null;
  const recordedFailure = failureRecord(feedback.issues); if (!recordedFailure.evidenceRefs.includes(feedback.reference.location)) recordedFailure.evidenceRefs.push(feedback.reference.location);
  if (!sameValue(recordedFailure, attempt.failure)) throw new Error('Failure classification differs from the persisted attempt.');
  const recovery = { artifactRoot: root, journalRoot: join(root, 'journal') };
  const origin = { formatVersion: 3 as const, validationCase: validationJournalBinding(window), runId: snapshot.run.runId, ledgerId: snapshot.ledger.ledgerId,
    originalStartedAt: snapshot.run.originalStartedAt, originalDeadlineAt: snapshot.run.originalDeadlineAt, limitMicroCny: snapshot.ledger.limitMicroCny,
    requirement, prepared: original, reviewProtocolCorrections: 1 as const, artifactRoot: root, sessionRoot: join(root, 'sessions'),
    ...(authorProtocolCorrections !== undefined ? { authorProtocolCorrections } : {}) };
  const journal = await TaskJournal.open(recovery, origin, true), author = await journal.read<{ signature: ContentSignature }>('author', attempt.attemptId);
  const captured = await journal.read<{ captured: { artifacts: typeof task.artifacts }; signature: ContentSignature }>('capture', attempt.attemptId);
  if (!author || !captured || !sameValue(captured.captured.artifacts, task.artifacts)) throw new Error('Failure author/capture receipts are incomplete.');
  await journal.requireSignature(author.signature, task.inputs);
  const failed = await journal.read<{ taskId: string; attemptId: string; feedback: RepairFeedback['reference']; feedbackSha256: string; signature: ContentSignature }>('failure-snapshot', attempt.attemptId);
  if (!failed || failed.taskId !== task.taskId || failed.attemptId !== attempt.attemptId || failed.feedbackSha256 !== hash(bytes) || !sameValue(failed.feedback, feedback.reference)) throw new Error('Failure source signature does not bind the durable feedback.');
  await journal.requireSignature(failed.signature, [...task.inputs, ...task.artifacts, ...task.evidence.map(evidence => evidence.source)]);
  for (const original of captured.signature) for (const file of original.files) {
    const location = `${original.location}${file.path ? '/' + file.path : ''}`;
    if (hash(await regularFile(root, location)) !== file.sha256) throw new Error('An original captured input or source file changed before repair.');
  }
  const candidate = await registry.getCandidate(task.artifacts[0]), codeRef = registry.artifactRef(`${window.caseId}-code`, task.artifacts[0].version), code = await registry.getCapture(codeRef);
  if (candidate.taskId !== task.taskId || candidate.authorId !== task.authorId || candidate.contextId !== task.context.contextId || !sameValue(candidate.inputs, [...task.inputs, codeRef])
    || code.taskId !== task.taskId || !sameValue(code.dependencies, task.inputs) || !code.metadata.provenance.sourceRefs.includes(attempt.sessionRef)) throw new Error('Failure candidate or code provenance changed.');
  const destination = await safePath(root, feedback.reference.location); await mkdir(dirname(destination), { recursive: true });
  const staged = await open(destination, 'wx'); try { await staged.writeFile(bytes); await staged.sync(); } finally { await staged.close(); }
  if (!(await regularFile(root, feedback.reference.location)).equals(bytes)) throw new Error('Staged repair feedback differs from its exact source bytes.');
  await controller.claimValidationRepair({ sourceTaskId: task.taskId, feedback: feedback.reference });
  const state = await controller.read(), repairedRef = registry.candidateRef(`${window.caseId}-game`, 'v2');
  const repair = createLinkedRepairTask({ ...policy, snapshot: state, source, taskId: VALIDATION_CASE.grants.repair.taskId, allocationMicroCny: VALIDATION_CASE.grants.repair.amountMicroCny,
    outputs: task.outputs.map(output => ({ ...output, destination: repairedRef.location })), expectedArtifacts: [repairedRef] });
  repair.workspace = await directory(root, 'repair-workspace');
  for (const evidence of task.evidence.filter(evidence => ['test_report', 'log'].includes(evidence.kind))) if (!repair.task.context.interfaces.some(ref => ref.artifactId === evidence.source.artifactId)) repair.task.context.interfaces.push(evidence.source);
  await copyReviewInputs(root, repair.workspace, [...repair.task.inputs, ...repair.task.context.interfaces]);
  await directory(repair.workspace, 'authors');
  await cp(join(root, codeRef.location), join(repair.workspace, 'authors/coding'), { recursive: true, errorOnExist: true, force: false });
  await writeJson(root, 'repair-dispatch.json', { sourceTaskId: task.taskId, sourceAttemptId: attempt.attemptId, newTaskId: repair.task.taskId, feedback: feedback.reference,
    sourceSha256: hash(bytes), expectedArtifacts: repair.expectedArtifacts, semanticRepairUsed: 1, maxSemanticRepairs: 1, deadlineAt: window.deadlineAt });
  await TaskJournal.open(recovery, { ...origin, prepared: repair }, false); await controller.registerTasks([repair.task]);
  return repair;
}
