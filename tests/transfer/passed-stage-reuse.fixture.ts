import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { transferFixture, hash } from './runtime-host.fixture.ts';
import { createTransferRuntimeHost } from '../../src/runtime/adapters/transfer/runtime-host.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
import { TaskJournal } from '../../src/runtime/recovery/task-journal.ts';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';
import { prepareValidationAllocationClosure, applyValidationAllocationClosure } from '../../src/runtime/validation-allocations.ts';
import { prepareValidationCase, validationInputHash } from '../../src/runtime/validation-window.ts';
import { RunController } from '../../src/runtime/run.ts';
import { createValidationRequirement } from '../../src/roles/execution-input.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { regularFile } from '../../src/artifacts/paths.ts';
import type { ArtifactReference, TaskContract } from '../../src/contracts/types.ts';
import type { ValidationRequirement } from '../../src/roles/execution-input.ts';
import type { ValidationCaseWindow } from '../../src/runtime/validation-types.ts';
import type { RecoveryOptions } from '../../src/runtime/recovery/task-journal.ts';
import type { ArtifactRegistry } from '../../src/artifacts/index.ts';
import type { HistoricalPassedManifest } from '../../src/runtime/historical-passed-stages.ts';

/** All source, receipts, captures and ledgers live in this synthetic TEMP fixture. */
export async function passedStageFixture(t: TestContext, templateRoot?: string) {
  const f = await transferFixture(t, true, templateRoot), host = await createTransferRuntimeHost(f.input);
  const tasks = f.prepare(host); host.validateTasks!(tasks);
  const recovery = { artifactRoot: f.root, journalRoot: join(f.root, 'journal'), recoverCapture: host.recoverCapture };
  const result = await host.withPreparation(() => executeTaskDag({ controller: f.controller, requirement: f.requirement, validation: f.validation,
    tasks: tasks.slice(0, 2), sessionRoot: join(f.root, 'sessions'), availableArtifacts: host.availableArtifacts, roleFactory: host.roleFactory,
    preAuthor: host.preAuthor, capture: host.capture, verify: host.verify, reviewImages: host.reviewImages, recovery,
    reviewProtocolCorrections: 1, authorProtocolCorrections: 1 }));
  await f.controller.stop('Synthetic old case closed after passed design/art');
  await f.controller.close();
  const context = { root: f.ledgerRoot, repositoryRoot: f.repositoryRoot, identityReader: async () => ({ reviewedPlatformSha: f.requirement.validation.reviewedPlatformSha, frozenCaseInputHash: f.requirement.validation.frozenCaseInputHash }) };
  const closure = await prepareValidationAllocationClosure({ ...context, caseIds: [f.window.caseId] });
  const closeDecision = { kind: 'operator_validation_allocation_closure' as const, decisionId: 'synthetic-close', actorId: 'offline-operator', decidedAt: new Date().toISOString(),
    source: { artifactId: 'synthetic-close', version: 'v1', location: 'synthetic-close.json' }, sourceRefs: f.requirement.validation.decision.sourceRefs };
  await writeFile(join(f.ledgerRoot, closeDecision.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', ...closeDecision, source: undefined, quote: closure }), 'utf8');
  await applyValidationAllocationClosure({ ...context, quote: closure, decision: closeDecision });
  const registry = await createArtifactRegistry({ workspaceRoot: f.root, registryRoot: 'registry' });
  const { manifest, expected } = await buildPassedStageManifest({ root: f.root, requirement: f.requirement, window: f.window,
    availableArtifacts: host.availableArtifacts, result, recovery, registry });
  let manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  const manifestRef = { artifactId: 'synthetic-passed-manifest', version: hash(manifestBytes), location: 'synthetic-passed-stages.json' };
  await writeFile(join(f.ledgerRoot, manifestRef.location), manifestBytes);
  const targetRoot = join(f.root, '..', 'cos20-synthetic-successor'); await mkdir(targetRoot);
  const input = { originalRoot: f.root, targetRoot, expected, manifestRef, readManifest: async (signal: AbortSignal) => { signal.throwIfAborted(); return regularFile(f.ledgerRoot, manifestRef.location); } };
  return { ...f, hostInput: f.input, host, tasks, result, registry, recovery, manifest, manifestRef, targetRoot, input,
    async changeManifest(value: typeof manifest) { manifestBytes = Buffer.from(JSON.stringify(value, null, 2) + '\n'); await writeFile(join(f.ledgerRoot, manifestRef.location), manifestBytes); },
    async resignManifest(value: typeof manifest) { manifestBytes = Buffer.from(JSON.stringify(value, null, 2) + '\n'); await writeFile(join(f.ledgerRoot, manifestRef.location), manifestBytes); input.manifestRef = { ...manifestRef, version: hash(manifestBytes) }; },
    async corrupt(path: string) { await writeFile(join(f.root, path), '{}\n', 'utf8'); } };
}

/** Read-only manifest builder for already-produced genuine SOURCE/TEMP stages; never relabel their origins. */
export async function buildPassedStageManifest(input: { root: string; requirement: ValidationRequirement; window: ValidationCaseWindow;
  availableArtifacts: ArtifactReference[]; result: TaskContract[]; recovery: RecoveryOptions; registry: ArtifactRegistry }) {
  const { root, requirement, window, availableArtifacts, result, recovery, registry } = input;
  const captures: HistoricalPassedManifest['captures'] = [];
  for (const ref of [...availableArtifacts, ...result.flatMap(task => task.artifacts)].filter(ref => ref.location.startsWith('registry/captures/'))) {
    if (captures.some(item => item.ref.artifactId === ref.artifactId)) continue;
    const capture = await registry.getCapture(ref), path = ref.location.slice(0, -'/files'.length) + '/capture.json';
    const origin = JSON.parse(await readFile(join(root, 'journal/task-' + result[0].taskId + '/origin.json'), 'utf8'));
    const journal = await TaskJournal.open(recovery, origin, true);
    captures.push({ ref, manifestSha256: hash(await readFile(join(root, path))), signature: await journal.signature([ref]) });
  }
  const receiptNames = ['origin', 'author', 'capture-started', 'capture', 'verify-started', 'verified', 'review-started', 'review'] as const;
  const stages = [];
  for (const [index, task] of result.entries()) {
    const receipts: Record<string, string> = {};
    for (const name of receiptNames) receipts[name] = hash(await readFile(join(root, `journal/task-${task.taskId}/${name}.json`)));
    stages.push({ role: index === 0 ? 'design' : 'art', task, receipts });
  }
  const audit = `host-transfer-design-validation/${result[0].taskId}/${result[0].attempts[0].attemptId}/check-1-`;
  const expected = { caseId: window.caseId, windowId: window.windowId, reviewedPlatformSha: requirement.validation.reviewedPlatformSha,
    frozenCaseInputHash: requirement.validation.frozenCaseInputHash, designTaskId: result[0].taskId, artTaskId: result[1].taskId };
  const manifest = { formatVersion: 'historical-passed-stages/1', originalRoot: root, ...expected, requirement: requirement,
    stages, captures, preparedSha256: hash(await readFile(join(root, 'host-transfer-prepared-inputs.json'))),
    designAudit: { startedSha256: hash(await readFile(join(root, audit + 'started.json'))),
      resultSha256: hash(await readFile(join(root, audit + 'result.json'))), rawSha256: hash(await readFile(join(root, audit + 'raw.json'))) } };
  return { manifest, expected };
}

export async function successorFixture(t: TestContext, f: Awaited<ReturnType<typeof passedStageFixture>>, changedInput = false) {
  const declaration: any = structuredClone(f.window.quote.declaration); declaration.caseId = 'cos20-synthetic-successor';
  const old = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8'));
  for (const [role, grant] of Object.entries(declaration.grants) as [string, any][]) {
    grant.amountMicroCny -= old.ledger.entries.filter((entry: any) => entry.taskId === grant.taskId).reduce((sum: number, entry: any) => sum + entry.settledMicroCny, 0);
    grant.taskId = `${declaration.caseId}-${role}`;
  }
  if (changedInput) {
    const data = JSON.parse(await readFile(join(f.repositoryRoot, declaration.inputs.requirements.path), 'utf8'));
    data.requirementVersion = 'fixture-v2'; const bytes = JSON.stringify(data);
    declaration.inputs.requirements = { version: 'fixture-v2', path: 'requirements-next.json', sha256: hash(bytes) };
    await writeFile(join(f.repositoryRoot, declaration.inputs.requirements.path), bytes, 'utf8');
  }
  const identity = { reviewedPlatformSha: 'b'.repeat(40), frozenCaseInputHash: validationInputHash(declaration) };
  const context = { root: f.ledgerRoot, repositoryRoot: f.repositoryRoot, identityReader: async () => identity };
  const quote = await prepareValidationCase({ ...context, declaration });
  const decision = { kind: 'operator_validation' as const, decisionId: 'synthetic-successor-decision', actorId: 'offline-operator', decidedAt: new Date().toISOString(),
    source: { artifactId: 'synthetic-successor-operator', version: 'v1', location: 'synthetic-successor-operator.json' }, sourceRefs: [f.manifestRef] };
  const operatorPath = join(f.ledgerRoot, decision.source.location);
  await writeFile(operatorPath, JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...decision, source: undefined, quote }), 'utf8');
  const window = await RunController.claimValidationCase({ ...context, quote, decision });
  const controller = await RunController.openValidationCase({ ...context, caseId: declaration.caseId, windowId: window.windowId });
  f.onCleanup(() => controller.close());
  await cp(join(f.root, 'toolchain'), join(f.targetRoot, 'toolchain'), { recursive: true });
  await mkdir(join(f.targetRoot, 'requirements')); await cp(join(f.repositoryRoot, declaration.inputs.requirements.path), join(f.targetRoot, 'requirements/fixed.json'));
  const requirement = createValidationRequirement({ specVersion: f.requirement.specVersion, acceptance: f.requirement.acceptance,
    sources: [{ artifactId: `${declaration.caseId}-input`, version: declaration.inputs.requirements.version, location: 'requirements/fixed.json' }],
    validation: { runId: f.requirement.validation.runId, ledgerId: f.requirement.validation.ledgerId, caseId: declaration.caseId, windowId: window.windowId, ...identity, decision } });
  const validation = { caseId: declaration.caseId, windowId: window.windowId, historicalManifest: { reference: f.manifestRef, readBytes: f.input.readManifest },
    readScope: async (signal: AbortSignal) => { signal.throwIfAborted(); return { requirement, operatorReceipt: await readFile(operatorPath) }; } };
  return { controller, requirement, validation, window, input: { ...f.hostInput, root: f.targetRoot, controller, requirement, validation, resume: false, work: new OwnedWork(controller.signal) } };
}
