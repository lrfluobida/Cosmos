import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type test from 'node:test';
import { createValidationRequirement } from '../../src/roles/execution-input.ts';
import { HOST_STAGE_ACCEPTANCE } from '../../src/roles/requirements.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { prepareValidationCase, validationInputHash } from '../../src/runtime/validation-window.ts';
import { VALIDATION_CASE } from '../../probes/e2e/validation-declaration.ts';
import * as hosts from '../../src/runtime/entrypoint-host.ts';
import { task as taskFixture } from '../contracts/fixtures.ts';
import type { PreparedTask } from '../../src/runtime/orchestrator.ts';
import type { TaskContract } from '../../src/contracts/index.ts';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const design = { summary: '离线接口数据', implementationNotes: ['保留冻结规则'], acceptanceMapping: { observe: '离线观测' }, characters: [{ id: 'marker', purpose: '接口数据', states: ['idle'] }], audio: [] };
const media = { characters: [{ id: 'marker', width: 32, height: 32, anchor: { x: 16, y: 16 }, layers: [{ id: 'body', shape: 'rect', x: 2, y: 2, width: 28, height: 28, fill: '#ffee22', stroke: '#222222', strokeWidth: 1 }], states: [{ name: 'idle', fps: 1, loop: true, frames: [{}] }] }], audio: [] };

/** generatedByCosmos:false. Temporary ledger, synthetic provider/build/browser; no target game. */
export async function validationBrowserFixture(t: test.TestContext, options: { templateRoot?: string } = {}) {
  const base = await mkdtemp(join(tmpdir(), 'cosmos-generic-validation-')), ledgerRoot = join(base, 'ledger'), repositoryRoot = join(base, 'platform');
  const caseId = 'cos20-browser-host-fixture', root = join(repositoryRoot, '.cosmos/e2e', caseId);
  const old = await RunController.create({ root: ledgerRoot, runId: 'offline-shared', ledgerId: 'offline-ledger', kind: 'evaluation', scope: 'validation', specVersion: '1.0',
    allocations: [{ taskId: 'legacy', amountMicroCny: 1_000_000 }], durationMs: 1000, now: () => Date.now() - 2000 });
  await old.importSettled({ requestId: 'prior', taskId: 'legacy', provider: 'offline', pricingVersion: 'fixture', actualCostMicroCny: 100,
    evidence: [{ artifactId: 'prior', version: 'v1', location: 'prior.json' }] });
  await old.close();
  const acceptance = [{ acceptanceId: 'observe', description: '离线接口观测', steps: ['点击可见按钮'], expected: '观测完成', evidenceKinds: ['test_report'] }, ...HOST_STAGE_ACCEPTANCE];
  const proposal = { profile: 'operator_validation', brief: '离线通用接口 fixture', acceptance, unsupported: [],
    scenario: { viewport: { width: 1280, height: 720 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#button', timeoutMs: 1000 },
      { id: 'observe', kind: 'assert', acceptanceId: 'observe', observation: { kind: 'text', selector: '#result' }, expected: '观测完成', timeoutMs: 1000 }] } };
  const requirements = JSON.stringify({ requirementVersion: 'fixture-v1', specVersion: '1.0', acceptanceIds: ['observe'], stageAcceptanceIds: HOST_STAGE_ACCEPTANCE.map(item => item.acceptanceId), browser: proposal });
  const declaration: any = structuredClone(VALIDATION_CASE); declaration.caseId = caseId;
  for (const [role, grant] of Object.entries(declaration.grants) as [string, any][]) grant.taskId = `${caseId}-${role}`;
  declaration.inputs.requirements = { version: 'fixture-v1', path: 'requirements.json', sha256: hash(requirements) };
  const templateNames = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts'];
  const templateBytes = new Map<string, Buffer>();
  for (const name of templateNames) templateBytes.set(name, options.templateRoot ? await readFile(join(options.templateRoot, name)) : Buffer.from(name.endsWith('.ts') ? 'export default {}\n' : '{}\n'));
  declaration.inputs.template.files = templateNames.map(name => ({ path: `template/${name}`, sha256: hash(templateBytes.get(name)!) }));
  declaration.inputs.template.sha256 = hash(JSON.stringify(declaration.inputs.template.files));
  await mkdir(repositoryRoot, { recursive: true }); await writeFile(join(repositoryRoot, 'requirements.json'), requirements, 'utf8');
  for (const name of templateNames) { await mkdir(join(repositoryRoot, 'template'), { recursive: true }); await writeFile(join(repositoryRoot, 'template', name), templateBytes.get(name)!); }
  let identity = { reviewedPlatformSha: 'a'.repeat(40), frozenCaseInputHash: validationInputHash(declaration) };
  let clock = Date.now();
  const context = { root: ledgerRoot, repositoryRoot, identityReader: async () => ({ ...identity }), now: () => clock };
  const quote = await prepareValidationCase({ ...context, declaration });
  const decision = { kind: 'operator_validation' as const, decisionId: 'offline-decision', actorId: 'offline-operator', decidedAt: new Date(clock).toISOString(),
    source: { artifactId: 'operator', version: 'v1', location: 'operator.json' }, sourceRefs: [{ artifactId: 'offline-source', version: 'v1', location: 'offline-source.json' }] };
  const operatorPath = join(ledgerRoot, decision.source.location);
  await writeFile(operatorPath, JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...decision, source: undefined, quote }), 'utf8');
  const window = await RunController.claimValidationCase({ ...context, quote, decision });
  const controller = await RunController.openValidationCase({ ...context, caseId, windowId: window.windowId });
  t.after(async () => { await controller.close().catch(() => {}); const target = join(base); assert.ok(target.startsWith(tmpdir())); await rm(target, { recursive: true, force: true }); });
  await mkdir(join(root, 'requirements'), { recursive: true }); await writeFile(join(root, 'requirements/fixed.json'), requirements, 'utf8');
  await mkdir(join(root, 'toolchain'));
  for (const name of templateNames) await writeFile(join(root, 'toolchain', name), await readFile(join(repositoryRoot, 'template', name)));
  const requirement = createValidationRequirement({ specVersion: '1.0', sources: [{ artifactId: `${caseId}-input`, version: 'fixture-v1', location: 'requirements/fixed.json' }], acceptance,
    validation: { runId: 'offline-shared', ledgerId: 'offline-ledger', caseId, windowId: window.windowId, ...identity, decision } });
  const validation = { caseId, windowId: window.windowId, readScope: async (signal: AbortSignal) => { signal.throwIfAborted(); return { requirement, operatorReceipt: await readFile(operatorPath) }; } };
  const configs: PiSessionOptions[] = [], calls: any[] = []; let requests = 0, failBuild = false;
  const sessionFactory = async (config: PiSessionOptions) => {
    configs.push(config); const packet = JSON.parse(config.context);
    return { close: async () => {}, prompt: async () => {
      const requestId = `offline-${++requests}`, request = { requestId, modelId: 'deepseek-flash' as const, maxOutputTokens: config.maxOutputTokens, inputBytes: 100, hasImages: false };
      await config.budget.beforeRequest({ ...request, estimatedMaxCostMicroCny: 200 + config.maxOutputTokens * 8 });
      await config.budget.afterResponse({ requestId, outcome: 'settled' as const, responseModel: 'deepseek-flash', elapsedMs: 1,
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
      calls.push({ kind: packet.role, taskId: packet.taskId });
      if (packet.role === 'reviewer') return { text: JSON.stringify({ verdict: 'approved', findings: [], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((item: any) => item.evidenceId) }) };
      if (packet.role === 'design') await writeFile(join(config.workspace, 'authors/design/design.json'), JSON.stringify(design), 'utf8');
      if (packet.role === 'art') await writeFile(join(config.workspace, 'authors/art/media.json'), JSON.stringify(media), 'utf8');
      if (packet.role === 'coding') { await writeFile(join(config.workspace, 'authors/coding/index.html'), '<p>Offline interface fixture</p>', 'utf8'); await writeFile(join(config.workspace, 'authors/coding/src/main.ts'), '// Offline interface fixture, no game\n', 'utf8'); }
      return { text: JSON.stringify({ summary: 'Offline fixture only', remaining: [], uncertainty: [] }) };
    } };
  };
  const io = { async build(project: string, taskId: string, _signal: AbortSignal, authority: any) { calls.push({ kind: 'build', taskId, authority });
    if (failBuild) return { passed: false, diagnostics: 'src/main.ts(1,1): error TS1000: Offline fixture defect' };
    await mkdir(join(project, 'dist')); await writeFile(join(project, 'dist/index.html'), '<p>Offline build</p>', 'utf8'); return { passed: true, diagnostics: 'Offline fixture' }; },
    async play(plan: any, _signal: AbortSignal, authority: any) { calls.push({ kind: 'play', taskId: plan.taskId, authority }); return { formatVersion: '1.0.0', kind: 'normal_browser_input', plan, outcome: 'passed', browser: { version: 'offline' }, cleanup: { processExited: true }, errors: [], files: [], evidence: [], reportPath: 'offline.json',
      steps: plan.steps.map((step: any) => ({ id: step.id, kind: step.kind, acceptanceId: step.acceptanceId, outcome: 'passed', expected: step.expected ?? 'input', actual: step.expected ?? 'input', screenshot: null })) }; } };
  const input: any = { root, controller, requirement, proposal, validation, resume: false, work: new OwnedWork(controller.signal), io, sessionFactory };
  const create = (extra: any = {}) => (hosts as any).createValidationBrowserHost({ ...input, ...extra });
  const prepare = (host: any): PreparedTask[] => host.taskPolicies.map((policy: any, index: number) => {
    const task = taskFixture() as TaskContract, prior = index === 0 ? [] : host.taskPolicies.slice(0, index), acceptanceIds = index === 0 ? [HOST_STAGE_ACCEPTANCE[0].acceptanceId] : index === 1 ? [HOST_STAGE_ACCEPTANCE[1].acceptanceId] : ['observe'];
    Object.assign(task, { taskId: declaration.grants[policy.role].taskId, runId: 'offline-shared', kind: 'evaluation', specVersion: '1.0', authorId: `author-${policy.role}`, objective: 'Offline host fixture', acceptanceIds,
      acceptance: acceptance.filter(item => acceptanceIds.includes(item.acceptanceId)).map(item => ({ acceptanceId: item.acceptanceId, steps: item.steps, expected: item.expected, evidenceDestinations: [`evidence/${policy.role}.json`] })),
      inputs: [...host.availableArtifacts, ...prior.map((item: any) => ({ artifactId: item.outputs[0].artifactId, version: item.outputs[0].version, location: item.outputs[0].location }))],
      dependsOn: prior.map((item: any) => ({ taskId: declaration.grants[item.role].taskId, requiredState: 'passed', state: 'not_started' })), context: { contextId: `context-${policy.role}`, rules: policy.rules, interfaces: [], knownFailures: [], tools: policy.tools }, ownership: { writePaths: policy.writePaths, readOnlyPaths: policy.readOnlyPaths },
      outputs: policy.outputs.map((item: any) => ({ type: item.type, schema: item.schema, destination: item.destination })), budget: { ledgerId: 'offline-ledger', allocationMicroCny: policy.allocationMicroCny, originalDeadlineAt: quote.basis.originalDeadlineAt },
      state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [], handoff: { completed: [], remaining: ['Offline host fixture'], uncertainty: [], resumeFrom: null }, review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] } });
    return { role: policy.role, workspace: policy.workspace, task, expectedArtifacts: policy.outputs.map((item: any) => ({ artifactId: item.artifactId, version: item.version, location: item.location })) };
  });
  return { root, ledgerRoot, repositoryRoot, input, controller, requirement, window, declaration, validation, configs, calls, create, prepare, advance: (ms: number) => { clock += ms; }, changeIdentity: () => { identity = { ...identity, reviewedPlatformSha: 'b'.repeat(40) }; }, failBuild: (value: boolean) => { failBuild = value; } };
}
