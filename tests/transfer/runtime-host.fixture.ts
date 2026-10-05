import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { TestContext } from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { prepareValidationCase, validationInputHash } from '../../src/runtime/validation-window.ts';
import { VALIDATION_CASE } from '../../probes/e2e/validation-declaration.ts';
import { createValidationRequirement } from '../../src/roles/execution-input.ts';
import { HOST_STAGE_ACCEPTANCE } from '../../src/roles/requirements.ts';
import { task as taskFixture } from '../contracts/fixtures.ts';
import type { PreparedTask } from '../../src/runtime/orchestrator.ts';
import type { ArtifactReference, TaskContract } from '../../src/contracts/index.ts';
import { prepareValidationAllocationClosure, applyValidationAllocationClosure } from '../../src/runtime/validation-allocations.ts';

export const ids = ['T16-01', 'T16-02', 'T16-03', 'T16-04', 'T16-05', 'T16-06'];
export const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
/** Synthetic map stays in tests. It is never a runtime prompt, game or template. */
export function syntheticMap(requirement: ArtifactReference) {
  const restore = ['up', 'right', 'up', 'right', 'down'];
  return { formatVersion: 'cos16-design/1', requirement, mapVersion: 'synthetic-v1',
    map: { tiles: ['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#######'],
      player: [1, 4], boxes: [[3, 3], [4, 3]], targets: [[3, 5], [4, 5]] },
    solution: [...restore, 'down', 'up', 'up', 'right', 'down', 'down'],
    paths: { wall: ['up', 'left'], push: restore, boxWall: [...restore, 'down', 'down'],
      doubleBox: ['up', 'right', 'right'], restart: restore, restore } };
}

/** Real isolated contracts/registry with a synthetic provider and no target game. */
export async function transferFixture(t: TestContext, grouped = false, templateRoot?: string) {
  const cleanup: (() => Promise<unknown>)[] = [];
  const base = await mkdtemp(join(tmpdir(), 'cosmos-transfer-host-'));
  const ledgerRoot = join(base, 'ledger'), repositoryRoot = join(base, 'platform');
  const caseId = 'cos20-transfer-preparation-fixture', root = join(repositoryRoot, '.cosmos/e2e', caseId);
  const old = await RunController.create({ root: ledgerRoot, runId: 'offline-shared', ledgerId: 'offline-ledger', kind: 'evaluation', scope: 'validation', specVersion: '1.0',
    allocations: [{ taskId: 'legacy', amountMicroCny: 1_000_000 }, ...(grouped ? [{ taskId: 'COS-16', amountMicroCny: 10_000_000 }] : [])], durationMs: 1000, now: () => Date.now() - 2000 });
  await old.importSettled({ requestId: 'prior', taskId: 'legacy', provider: 'offline', pricingVersion: 'fixture', actualCostMicroCny: 100,
    evidence: [{ artifactId: 'prior', version: 'v1', location: 'prior.json' }] }); await old.close();
  const acceptance = [...ids.map(acceptanceId => ({ acceptanceId, description: '固定迁移验收', steps: ['正常鼠标输入'], expected: '遵循固定规则', evidenceKinds: ['test_report' as const] })), ...HOST_STAGE_ACCEPTANCE];
  const proposal = { profile: 'operator_validation' as const, adapterId: 'cos16-input/1', brief: '固定鼠标推箱子源码接口 fixture', acceptance, unsupported: [] };
  const requirements = JSON.stringify({ requirementVersion: 'fixture-v1', specVersion: '1.0', acceptanceIds: ids,
    stageAcceptanceIds: HOST_STAGE_ACCEPTANCE.map(item => item.acceptanceId), preparation: proposal,
    ...(grouped ? { budgetGroup: { parentTaskId: 'COS-16', allocationMicroCny: 10_000_000 } } : {}) });
  const declaration: any = structuredClone(VALIDATION_CASE); declaration.caseId = caseId;
  if (grouped) {
    declaration.formatVersion = 'validation-declaration-3'; declaration.budgetGroup = { parentTaskId: 'COS-16', allocationMicroCny: 10_000_000 };
    for (const [role, amountMicroCny] of Object.entries({ planning: 400_000, design: 1_200_000, art: 2_800_000, coding: 2_800_000, repair: 2_800_000 })) declaration.grants[role].amountMicroCny = amountMicroCny;
  }
  for (const [role, grant] of Object.entries(declaration.grants) as [string, any][]) grant.taskId = `${caseId}-${role}`;
  declaration.inputs.requirements = { version: 'fixture-v1', path: 'requirements.json', sha256: hash(requirements) };
  const templateNames = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts'];
  const templateBytes = await Promise.all(templateNames.map(async name => templateRoot ? await readFile(join(templateRoot, name)) : Buffer.from(name.endsWith('.ts') ? 'export default {}\n' : '{}\n')));
  declaration.inputs.template.files = templateNames.map((name, index) => ({ path: `template/${name}`, sha256: hash(templateBytes[index]) }));
  declaration.inputs.template.sha256 = hash(JSON.stringify(declaration.inputs.template.files));
  await mkdir(repositoryRoot, { recursive: true }); await writeFile(join(repositoryRoot, 'requirements.json'), requirements, 'utf8');
  for (const [index, file] of declaration.inputs.template.files.entries()) { await mkdir(dirname(join(repositoryRoot, file.path)), { recursive: true }); await writeFile(join(repositoryRoot, file.path), templateBytes[index]); }
  let identity = { reviewedPlatformSha: 'a'.repeat(40), frozenCaseInputHash: validationInputHash(declaration) }, clock = Date.now();
  const context = { root: ledgerRoot, repositoryRoot, identityReader: async () => ({ ...identity }), now: () => clock };
  if (grouped) {
    const seed: any = structuredClone(VALIDATION_CASE); seed.caseId = 'cos20-synthetic-seed';
    for (const [role, grant] of Object.entries(seed.grants) as [string, any][]) grant.taskId = `${seed.caseId}-${role}`;
    const data = JSON.parse(requirements); delete data.budgetGroup; const bytes = JSON.stringify(data);
    await writeFile(join(repositoryRoot, 'seed-requirements.json'), bytes, 'utf8');
    seed.inputs = { ...declaration.inputs, requirements: { version: 'fixture-v1', path: 'seed-requirements.json', sha256: hash(bytes) } };
    const ctx = { ...context, identityReader: async () => ({ reviewedPlatformSha: '0'.repeat(40), frozenCaseInputHash: validationInputHash(seed) }) };
    const quote = await prepareValidationCase({ ...ctx, declaration: seed });
    const decision = { kind: 'operator_validation' as const, decisionId: 'synthetic-seed-decision', actorId: 'offline-operator', decidedAt: new Date(clock).toISOString(),
      source: { artifactId: 'synthetic-seed-operator', version: 'v1', location: 'synthetic-seed-operator.json' }, sourceRefs: [{ artifactId: 'synthetic-seed', version: 'v1', location: 'seed-requirements.json' }] };
    await writeFile(join(ledgerRoot, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...decision, source: undefined, quote }), 'utf8');
    const window = await RunController.claimValidationCase({ ...ctx, quote, decision });
    const controller = await RunController.openValidationCase({ ...ctx, caseId: seed.caseId, windowId: window.windowId });
    await controller.stop('Synthetic seed to establish audited ledger3'); await controller.close();
    await mkdir(join(repositoryRoot, '.cosmos/e2e', seed.caseId), { recursive: true });
    const closure = await prepareValidationAllocationClosure({ ...ctx, caseIds: [seed.caseId] });
    const closeDecision = { ...decision, kind: 'operator_validation_allocation_closure' as const, decisionId: 'synthetic-seed-closure',
      source: { artifactId: 'synthetic-seed-closure', version: 'v1', location: 'synthetic-seed-closure.json' } };
    await writeFile(join(ledgerRoot, closeDecision.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', ...closeDecision, source: undefined, quote: closure }), 'utf8');
    await applyValidationAllocationClosure({ ...ctx, quote: closure, decision: closeDecision });
  }
  const quote = await prepareValidationCase({ ...context, declaration });
  const decision = { kind: 'operator_validation' as const, decisionId: 'offline-decision', actorId: 'offline-operator', decidedAt: new Date(clock).toISOString(),
    source: { artifactId: 'operator', version: 'v1', location: 'operator.json' }, sourceRefs: [{ artifactId: 'offline-source', version: 'v1', location: 'offline-source.json' }] };
  const operatorPath = join(ledgerRoot, decision.source.location);
  await writeFile(operatorPath, JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...decision, source: undefined, quote }), 'utf8');
  const window = await RunController.claimValidationCase({ ...context, quote, decision });
  const controller = await RunController.openValidationCase({ ...context, caseId, windowId: window.windowId });
  t.after(async () => { for (const operation of cleanup.reverse()) await operation(); await controller.close().catch(() => {}); assert.ok(base.startsWith(tmpdir())); await rm(base, { recursive: true, force: true }); });
  await mkdir(join(root, 'requirements'), { recursive: true }); await writeFile(join(root, 'requirements/fixed.json'), requirements, 'utf8');
  await mkdir(join(root, 'toolchain')); for (const name of templateNames) await writeFile(join(root, 'toolchain', name), await readFile(join(repositoryRoot, 'template', name)));
  const requirement = createValidationRequirement({ specVersion: '1.0', sources: [{ artifactId: `${caseId}-input`, version: 'fixture-v1', location: 'requirements/fixed.json' }], acceptance,
    validation: { runId: 'offline-shared', ledgerId: 'offline-ledger', caseId, windowId: window.windowId, ...identity, decision } });
  const validation = { caseId, windowId: window.windowId, readScope: async (signal: AbortSignal) => { signal.throwIfAborted(); return { requirement, operatorReceipt: await readFile(operatorPath) }; } };
  const calls: { kind: string; taskId?: string; inputs?: ArtifactReference[] }[] = [], configs: any[] = [];
  let invalidMap = false, missingMap = false, requests = 0;
  let designAction: ((config: any) => Promise<void>) | undefined;
  const sessionFactory = async (config: any) => {
    configs.push(config); const packet = JSON.parse(config.context);
    return { close: async () => {}, prompt: async () => {
      const requestId = `offline-${++requests}`, request = { requestId, modelId: 'deepseek-flash', maxOutputTokens: config.maxOutputTokens, inputBytes: 100, hasImages: false };
      await config.budget.beforeRequest({ ...request, estimatedMaxCostMicroCny: 200 + config.maxOutputTokens * 8 });
      await config.budget.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
      calls.push({ kind: packet.role, taskId: packet.taskId, inputs: packet.inputs });
      if (packet.role === 'reviewer') return { text: JSON.stringify({ verdict: 'approved', findings: [], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((item: any) => item.evidenceId) }) };
      if (packet.role === 'design') {
        const design = { summary: '合成接口设计', implementationNotes: ['固定需求与地图'], acceptanceMapping: Object.fromEntries(ids.map(id => [id, '保持固定玩法'])), characters: [{ id: 'marker', purpose: '合成接口媒体', states: ['idle'] }], audio: [] };
        await writeFile(join(config.workspace, 'authors/design/design.json'), JSON.stringify(design), 'utf8');
        const requirementRef = { artifactId: `${caseId}-requirement-bundle`, version: 'fixture-v1', location: `registry/captures/${caseId}-requirement-bundle/fixture-v1/files` };
        const map = syntheticMap(requirementRef); if (invalidMap) map.map.boxes.pop();
        if (!missingMap) await writeFile(join(config.workspace, 'authors/design/transfer-design.json'), JSON.stringify(map), 'utf8');
        if (designAction) await designAction(config);
        else {
          const validator = config.tools.find((tool: any) => tool.name === 'validate-transfer-design');
          if (validator) await validator.execute('fixture-design-check', {}, undefined, undefined, undefined);
        }
      }
      if (packet.role === 'art') await writeFile(join(config.workspace, 'authors/art/media.json'), JSON.stringify({ characters: [{ id: 'marker', width: 32, height: 32, anchor: { x: 16, y: 16 },
        layers: [{ id: 'body', shape: 'rect', x: 2, y: 2, width: 28, height: 28, fill: '#ffee22', stroke: '#222222', strokeWidth: 1 }], states: [{ name: 'idle', fps: 1, loop: true, frames: [{}] }] }], audio: [] }), 'utf8');
      if (packet.role === 'coding') { await writeFile(join(config.workspace, 'authors/coding/index.html'), '<p>合成接口</p>', 'utf8'); await writeFile(join(config.workspace, 'authors/coding/src/main.ts'), '// 合成接口，无目标游戏\n', 'utf8'); }
      return { text: JSON.stringify({ summary: 'Synthetic source fixture', remaining: [], uncertainty: [] }) };
    } };
  };
  const io = { async build() { calls.push({ kind: 'build' }); throw new Error('Preparation cannot build'); }, async play() { calls.push({ kind: 'play' }); throw new Error('Preparation cannot play'); } };
  const input = { root, controller, requirement, proposal, validation, resume: false, work: new OwnedWork(controller.signal), sessionFactory, io };
  function prepare(host: any): PreparedTask[] {
    return host.taskPolicies.map((policy: any, index: number) => {
      const task = taskFixture() as TaskContract, prior = host.taskPolicies.slice(0, index), acceptanceIds = index === 0 ? [HOST_STAGE_ACCEPTANCE[0].acceptanceId] : index === 1 ? [HOST_STAGE_ACCEPTANCE[1].acceptanceId] : ids;
      const refs = (p: any) => p.outputs.map((output: any) => ({ artifactId: output.artifactId, version: output.version, location: output.destination }));
      Object.assign(task, { taskId: declaration.grants[policy.role].taskId, runId: 'offline-shared', kind: 'evaluation', specVersion: '1.0', authorId: `author-${policy.role}`, objective: 'Synthetic preparation', acceptanceIds,
        acceptance: acceptance.filter(item => acceptanceIds.includes(item.acceptanceId)).map(item => ({ acceptanceId: item.acceptanceId, steps: item.steps, expected: item.expected, evidenceDestinations: [`evidence/${policy.role}.json`] })),
        inputs: [...host.availableArtifacts, ...prior.flatMap(refs)], dependsOn: prior.map((item: any) => ({ taskId: declaration.grants[item.role].taskId, requiredState: 'passed', state: 'not_started' })),
        context: { contextId: `context-${policy.role}`, rules: policy.rules, interfaces: [], knownFailures: [], tools: policy.tools }, ownership: { writePaths: policy.writePaths, readOnlyPaths: policy.readOnlyPaths },
        outputs: policy.outputs.map(({ type, schema, destination }: any) => ({ type, schema, destination })), budget: { ledgerId: 'offline-ledger', allocationMicroCny: policy.allocationMicroCny, originalDeadlineAt: quote.basis.originalDeadlineAt },
        state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [], handoff: { completed: [], remaining: ['Synthetic preparation'], uncertainty: [], resumeFrom: null },
        review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] } });
      return { role: policy.role, workspace: policy.workspace, task, expectedArtifacts: refs(policy) };
    });
  }
  return { input, root, ledgerRoot, repositoryRoot, controller, requirement, validation, window, calls, configs, prepare, onCleanup: (operation: () => Promise<unknown>) => cleanup.push(operation), invalidateMap: () => { invalidMap = true; },
    omitMap: () => { missingMap = true; },
    setDesignAction: (action: (config: any) => Promise<void>) => { designAction = action; },
    changeIdentity: () => { identity = { ...identity, reviewedPlatformSha: 'b'.repeat(40) }; }, advance: (ms: number) => { clock += ms; } };
}
