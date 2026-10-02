import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type test from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { prepareValidationCase, validationInputHash } from '../../src/runtime/validation-window.ts';
import { createValidationRequirement } from '../../src/roles/execution-input.ts';
import { createRoleFactory } from '../../src/roles/factory.ts';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';
import { VALIDATION_CASE } from '../../probes/e2e/validation-declaration.ts';
import { readValidationInput } from '../../probes/e2e/validation-input.ts';
import { stageAcceptance } from '../../probes/e2e/policy.ts';
import { requestReservation } from '../../probes/e2e/admission.ts';
import type { EvidenceContract, TaskContract } from '../../src/contracts/index.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';
import type { RoleSession } from '../../src/roles/factory.ts';

/** generatedByCosmos:false. Real controller/registry, explicitly fake identity, SDK and host checks. */
export async function validationRoutingFixture(t: test.TestContext) {
  const base = await mkdtemp(join(tmpdir(), 'cosmos-validation-routing-')), root = join(base, 'ledger'), repositoryRoot = join(base, 'platform'), artifactRoot = join(base, 'case');
  const oldStart = Date.now() - 2000;
  const old = await RunController.create({ root, runId: 'offline-validation', ledgerId: 'offline-ledger', kind: 'evaluation', scope: 'validation', specVersion: '1.0', durationMs: 1000,
    allocations: [{ taskId: 'legacy', amountMicroCny: 1_000_000 }], now: () => oldStart });
  await old.importSettled({ requestId: 'offline-prior', taskId: 'legacy', provider: 'offline', pricingVersion: 'fixture', actualCostMicroCny: 100,
    evidence: [{ artifactId: 'offline-prior', version: 'v1', location: 'offline.json' }] });
  const original = await old.read(); await old.close();
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  for (const file of [VALIDATION_CASE.inputs.requirements, ...VALIDATION_CASE.inputs.template.files]) {
    await mkdir(dirname(join(repositoryRoot, file.path)), { recursive: true }); await writeFile(join(repositoryRoot, file.path), await readFile(join(repository, file.path)));
  }
  const identity = { reviewedPlatformSha: 'a'.repeat(40), frozenCaseInputHash: validationInputHash(VALIDATION_CASE) };
  let checkIdentity: (() => Promise<void>) | undefined;
  const context = { root, repositoryRoot, identityReader: async () => { await checkIdentity?.(); return structuredClone(identity); } };
  const quote = await prepareValidationCase({ ...context, declaration: VALIDATION_CASE });
  const decision = { kind: 'operator_validation' as const, decisionId: 'offline-decision', actorId: 'offline-operator', decidedAt: new Date().toISOString(),
    source: { artifactId: 'operator-decision', version: 'v1', location: 'operator.json' }, sourceRefs: [{ artifactId: 'offline-authorization', version: 'v1', location: 'offline-source.json' }] };
  const operatorPath = join(root, decision.source.location);
  await writeFile(operatorPath, JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...decision, source: undefined, quote }), 'utf8');
  const window = await RunController.claimValidationCase({ ...context, quote, decision });
  const controller = await RunController.openValidationCase({ ...context, caseId: window.caseId, windowId: window.windowId });
  t.after(async () => { await controller.close().catch(() => {}); await rm(base, { recursive: true, force: true }); });
  await mkdir(join(artifactRoot, 'inputs'), { recursive: true });
  await writeFile(join(artifactRoot, 'inputs/requirements.json'), await readFile(join(repositoryRoot, VALIDATION_CASE.inputs.requirements.path)));
  const registry = await createArtifactRegistry({ workspaceRoot: artifactRoot, registryRoot: 'registry' });
  const source = registry.artifactRef('offline-requirements', VALIDATION_CASE.inputs.requirements.version);
  await registry.registerCapture({ taskId: 'offline-host', artifactRef: source, sourceRoot: 'inputs', files: [{ source: 'requirements.json', destination: 'requirements.json' }],
    ownership: { writePaths: ['.'], readOnlyPaths: [] }, dependencies: [], metadata: { kind: 'data', provenance: { kind: 'original-procedural', generator: 'Offline input fixture', sourceRefs: ['offline-source'] } } });
  const readScope = async (signal: AbortSignal) => {
    signal.throwIfAborted(); const frozen = await readValidationInput(repositoryRoot);
    const capture = await registry.getCapture(source), bytes = await readFile(join(artifactRoot, source.location, 'requirements.json'));
    if (capture.taskId !== 'offline-host' || createHash('sha256').update(bytes).digest('hex') !== VALIDATION_CASE.inputs.requirements.sha256) throw new Error('Offline fixed source changed');
    return { requirement: createValidationRequirement({ specVersion: frozen.requirements.specVersion, sources: [source], acceptance: stageAcceptance(frozen.requirements.acceptanceIds),
      validation: { runId: original.run.runId, ledgerId: original.ledger.ledgerId, caseId: window.caseId, windowId: window.windowId, ...identity, decision } }), operatorReceipt: await readFile(operatorPath) };
  };
  const binding = { caseId: window.caseId, windowId: window.windowId, readScope }, requirement = (await readScope(controller.signal)).requirement;
  const configs: PiSessionOptions[] = [], packets: any[] = [], requests: string[] = [];
  let number = 0;
  const sessionFactory = async (config: PiSessionOptions): Promise<RoleSession> => {
    configs.push(config); const packet = JSON.parse(config.context); packets.push(packet); let reviews = 0;
    const request = async () => {
      const requestId = `offline-${++number}`, value = { requestId, modelId: 'deepseek-flash' as const, maxOutputTokens: config.maxOutputTokens, inputBytes: 100, hasImages: false };
      await config.budget.beforeRequest({ ...value, estimatedMaxCostMicroCny: requestReservation(value) }); requests.push(requestId);
      await config.budget.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
    };
    return { close: async () => {}, compact: async () => { await request(); }, prompt: async () => {
      await request();
      if (packet.role === 'cosmos') return { text: JSON.stringify({ tasks: ['design', 'art', 'coding'].map(role => ({ taskId: `${window.caseId}-${role}`, role,
        objective: `Offline ${role}`, acceptanceIds: role === 'design' ? ['PILOT-DESIGN'] : role === 'art' ? ['PILOT-MEDIA'] : quote.requirements.acceptanceIds,
        dependsOn: role === 'coding' ? [`${window.caseId}-design`, `${window.caseId}-art`] : [] })) }) };
      if (packet.role === 'reviewer') return { text: JSON.stringify({ verdict: 'approved', inputVersions: packet.inputs, evidenceIds: packet.evidence.map((item: any) => item.evidenceId), findings: packet.taskId.endsWith('-coding') && ++reviews === 1 ? ['Invalid positive finding'] : [] }) };
      await writeFile(join(config.workspace, 'authors', `${packet.role}.txt`), `Offline fixture for ${packet.taskId}`, 'utf8');
      return { text: JSON.stringify({ summary: 'Offline scoped data', remaining: [], uncertainty: [] }) };
    } };
  };
  const roleFactory = createRoleFactory({ maxOutputTokens: 16384, authorMaxOutputTokens: { art: 65536, coding: 65536 }, maxRequests: 40,
    requestTimeoutMs: 1000, estimatedMaxCostMicroCny: requestReservation, sessionFactory });
  await mkdir(join(artifactRoot, 'authors'));
  const roles = Object.fromEntries(['design', 'art', 'coding'].map(role => [role, { workspace: artifactRoot, allocationMicroCny: VALIDATION_CASE.grants[role as 'design' | 'art' | 'coding'].amountMicroCny,
    writePaths: [`authors/${role}.txt`], readOnlyPaths: [], tools: [], outputs: [{ artifactId: role, version: 'v1', destination: registry.artifactRef(role, 'v1').location, type: 'fixture', schema: 'offline/1' }], rules: ['Offline fixture only; generatedByCosmos:false'] }]));
  const reference = (task: TaskContract) => ({ artifactId: task.taskId.split('-').at(-1)!, version: 'v1', location: task.outputs[0].destination });
  const capture = async (task: TaskContract) => {
    const role = task.taskId.split('-').at(-1)!;
    await registry.registerCapture({ taskId: task.taskId, artifactRef: reference(task), sourceRoot: 'authors', files: [{ source: `${role}.txt`, destination: 'fixture.txt' }],
      ownership: { writePaths: ['.'], readOnlyPaths: [] }, dependencies: task.inputs, metadata: { kind: 'data', provenance: { kind: 'original-procedural', generator: 'Offline fake SDK fixture', sourceRefs: [task.attempts.at(-1)!.sessionRef] } } });
    const reviewWorkspace = join(artifactRoot, 'reviews', task.taskId); await mkdir(reviewWorkspace, { recursive: true }); return { artifacts: [reference(task)], reviewWorkspace };
  };
  const verify = async (task: TaskContract): Promise<EvidenceContract[]> => {
    const source = { artifactId: `${task.taskId}-evidence`, version: 'v1', location: `evidence/${task.taskId}.json` }; await mkdir(join(artifactRoot, 'evidence'), { recursive: true });
    await writeFile(join(artifactRoot, source.location), JSON.stringify({ generatedByCosmos: false, fakeBuild: true, fakeBrowser: true }), 'utf8');
    return [{ contractVersion: '1.0.0', taskId: task.taskId, evidenceId: `${task.taskId}-fixture`, acceptanceIds: task.acceptanceIds, kind: 'test_report', source,
      artifactVersions: [...task.inputs, ...task.artifacts], outcome: 'passed', recordedAt: new Date().toISOString(), summary: 'Offline host fixture, no game claim' }];
  };
  const recoverCapture = async (task: TaskContract) => {
    try { const value = await registry.getCapture(reference(task)); if (value.taskId !== task.taskId || !value.metadata.provenance.sourceRefs.includes(task.attempts.at(-1)!.sessionRef)) return null;
      return { artifacts: [reference(task)], reviewWorkspace: join(artifactRoot, 'reviews', task.taskId) }; } catch { return null; }
  };
  return { ...context, artifactRoot, original, controller, window, binding, requirement, operatorPath, configs, packets, requests, roleFactory, roles, capture, verify, source,
    setIdentityCheck: (check: () => Promise<void>) => { checkIdentity = check; },
    planning: { controller, validation: binding, requirement, planningTaskId: VALIDATION_CASE.grants.planning.taskId, workspace: artifactRoot, sessionRoot: join(artifactRoot, 'sessions'), availableArtifacts: [source], roles, roleFactory },
    recovery: { artifactRoot, journalRoot: join(artifactRoot, 'journal'), recoverCapture } };
}
