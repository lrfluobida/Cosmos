import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { createBrowserHost, createProductHost } from '../../src/runtime/entrypoint-host.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { withHostStages } from '../../src/roles/requirements.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
import { buildContinuationQuote } from '../../src/runtime/continuation-quote.ts';
import { currentModularRepairPolicy } from '../../src/runtime/modular-repair-policy.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';

/** Actual product caller/compiler/registry/journal; model/browser/reviewer replies are synthetic. */
export async function modularFixture(t: test.TestContext, fault = '', options: { newModulePolicy?: boolean; pauseRepair?: boolean; badRepair?: boolean; badSuccessor?: boolean; dirtyIntegration?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cos71-host-')); t.after(() => { t.diagnostic(`Source-only pipeline evidence: ${root}`); });
  const draft: any = withHostStages({ codeProfile: 'modular-code/1', brief: '原创点击获胜', questions: [{ id: 'goal', prompt: '目标？' }], answers: { goal: '点击获胜' }, unsupported: [],
    acceptance: [{ acceptanceId: 'win', description: '点击获胜', steps: ['点击目标'], expected: '胜利', evidenceKinds: ['test_report'] }],
    scenario: { viewport: { width: 1280, height: 720 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#target', timeoutMs: 1000 },
      { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] } } as any);
  const intake = await IntakeController.create({ root, runId: 'modular-game', ledgerId: 'modular-budget', specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 2,
    ...(options.newModulePolicy ? { modularRepairPolicy: currentModularRepairPolicy() } : {}),
    allocations: [{ taskId: 'intake', amountMicroCny: 100 }, { taskId: 'planning', amountMicroCny: 100 }] });
  if (options.newModulePolicy) await writeFile(join(root, 'intake-origin.json'), JSON.stringify({ runId: 'modular-game', brief: draft.brief, modularRepairPolicy: currentModularRepairPolicy() }), { encoding: 'utf8', flag: 'wx' });
  const saved = await intake.saveDraft(draft), requirement = await intake.confirm({ revision: saved.revision, confirmed: true, actorId: 'synthetic-user', at: new Date().toISOString() });
  await intake.activateGeneration({ environmentReady: true, executionReady: true }); await intake.close();
  const toolchain = resolve(process.env.COSMOS_TEMPLATE_ROOT ?? fileURLToPath(new URL('../../templates/2d', import.meta.url)));
  await mkdir(join(root, 'toolchain')); for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await cp(join(toolchain, name), join(root, 'toolchain', name));
  await cp(await realpath(join(toolchain, 'node_modules')), join(root, 'toolchain/node_modules'), { recursive: true, dereference: true });
  const packets: any[] = [];
  const hostOptions: Parameters<typeof createProductHost>[1] = { io: {
    async play(plan: any, _signal: any, _authority: any, options: any) { const request = options?.mediaObservations;
      return { formatVersion: '1.0.0', kind: 'normal_browser_input', plan, outcome: 'passed', browser: { version: 'synthetic-browser' }, cleanup: { processExited: true }, errors: [],
        ...(request ? { mediaObservations: { request, recordedAt: new Date().toISOString(), values: request.fields.map((field: any) => field.expected) } } : {}),
        reportPath: 'synthetic.json', files: [], evidence: [], steps: plan.steps.map((step: any) => ({ id: step.id, kind: step.kind, acceptanceId: step.acceptanceId,
          outcome: 'passed', expected: step.expected ?? 'input delivered', actual: step.expected ?? 'input delivered', screenshot: null })) } as any; },
  } as any, sessionFactory: async config => {
    const packet = JSON.parse(config.context!), code = packet.taskId; packets.push(packet);
    return { close: async () => {}, prompt: async () => {
      if (packet.role === 'cosmos') return { text: JSON.stringify({ tasks: [
        { taskId: 'design-task', policyId: 'game-design', role: 'design', objective: '设计', acceptanceIds: ['COSMOS-DESIGN'], dependsOn: [] },
        { taskId: 'art-task', policyId: 'game-art', role: 'art', objective: '素材', acceptanceIds: ['COSMOS-MEDIA'], dependsOn: ['design-task'] },
        { taskId: 'module-a-task', policyId: 'game-module-a', role: 'coding', objective: '数值模块', acceptanceIds: ['COSMOS-MODULE-A'], dependsOn: ['design-task', 'art-task'] },
        { taskId: 'module-b-task', policyId: 'game-module-b', role: 'coding', objective: '显示模块', acceptanceIds: ['COSMOS-MODULE-B'], dependsOn: ['design-task', 'art-task'] },
        { taskId: 'integration-task', policyId: 'game-code', role: 'coding', objective: '完整集成', acceptanceIds: ['win'], dependsOn: ['design-task', 'art-task', 'module-a-task', 'module-b-task'] },
      ] }) };
      if (packet.role === 'reviewer') {
        if (fault === 'module-drift' && code === 'module-b-task') await writeFile(join(root, 'registry/captures/module-a/v1/files/src/modules/a/index.ts'), 'export function advance(value:number){return value+2;}\n', 'utf8');
        if (fault === 'contract-drift' && code === 'module-a-task') await writeFile(join(root, 'registry/captures/design/v1/files/_cosmos/module-contracts.d.ts'), 'export interface ModuleA { changed(): number; }\nexport interface ModuleB { label(value:number):string; }\n', 'utf8');
        if (fault === 'review-drift' && code === 'module-b-task') {
          const path = join(root, 'journal/task-module-a-task/review.json'), receipt = JSON.parse(await readFile(path, 'utf8'));
          assert.equal(receipt.value.verdict.verdict, 'approved'); receipt.value.verdict.verdict = 'changes_requested'; receipt.value.verdict.findings = ['Changed original module decision']; await writeFile(path, JSON.stringify(receipt), 'utf8');
        }
        return { text: JSON.stringify({ verdict: 'approved', findings: [], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((row: any) => row.evidenceId) }) };
      }
      const put = async (name: string, text: string) => { await mkdir(join(root, name, '..'), { recursive: true }); await writeFile(join(root, name), text, 'utf8'); };
      if (packet.role === 'design') {
        await put('authors/design/design.json', JSON.stringify({ summary: '原创点击', implementationNotes: ['模块协作'], acceptanceMapping: { win: '点击后获胜' },
          characters: [{ id: 'target', purpose: '目标', states: ['idle'] }], audio: [], modulePurposes: { a: '递增进度', b: '根据进度显示胜利' } }));
        await put('authors/design/module-contracts.d.ts', 'export interface ModuleA { advance(value: number): number; }\nexport interface ModuleB { label(value: number): string; }\n');
      } else if (packet.role === 'art') await put('authors/art/media.json', JSON.stringify({ characters: [{ id: 'target', width: 32, height: 32, anchor: { x: 16, y: 16 },
        layers: [{ id: 'body', shape: 'rect', x: 1, y: 1, width: 30, height: 30, fill: '#FFD700', stroke: '#000000', strokeWidth: 0 }], states: [{ name: 'idle', fps: 1, loop: true, frames: [{}] }] }], audio: [] }));
      else if (code === 'module-a-task' || code === 'module-a-task-repair') await put('authors/code-a/src/modules/a/index.ts', fault === 'empty-module' ? 'export {};\n'
        : fault === 'COS72-module-a' && (code === 'module-a-task' || options.badRepair) ? 'export function advance(value:number):number{return "wrong";}\n' : 'export function advance(value: number): number { return value + 1; }\n');
      else if (code === 'module-b-task' || code === 'module-b-task-repair') await put('authors/code-b/src/modules/b/index.ts', fault === 'COS72-module-b' && (code === 'module-b-task' || options.badRepair)
        ? 'export function label(value:number):string{return value;}\n' : 'export function label(value: number): string { return value > 0 ? "胜利" : "等待"; }\n');
      else {
        await put('authors/coding/index.html', '<button id="target">目标</button><div id="result">等待</div><script type="module" src="/src/main.ts"></script>');
        await put('authors/coding/src/main.ts', fault === 'integration-repair' && code === 'integration-task' || options.badSuccessor && code === 'integration-task-successor' ? 'const broken: number = "wrong"; document.body.textContent=String(broken);\n'
          : "import {advance} from './modules/a';import {label} from './modules/b';document.querySelector('#target')!.addEventListener('click',()=>{document.querySelector('#result')!.textContent=label(advance(0));});\n");
      }
      return { text: JSON.stringify({ summary: 'Synthetic scoped fixture output', remaining: [], uncertainty: [] }) };
    } };
  } };
  const host = createProductHost(fileURLToPath(new URL('../../', import.meta.url)), hostOptions);
  let result: any;
  if (fault === 'paused') {
    const controller = await RunController.open({ root }), abort = new AbortController();
    try {
      const active = await createBrowserHost({ root, controller, requirement, draft, resume: false, work: new OwnedWork(controller.signal), ...hostOptions } as any);
      const planned = await planTaskDag({ controller, requirement, planningTaskId: 'planning', workspace: root, sessionRoot: join(root, 'sessions'), availableArtifacts: active.availableArtifacts, taskPolicies: active.taskPolicies, roleFactory: active.roleFactory });
      active.validateTasks!(planned.tasks); await writeFile(join(root, 'execution.json'), JSON.stringify({ capability: active.capability, requirement, tasks: planned.tasks, availableArtifacts: active.availableArtifacts, plan: planned.plan }), 'utf8');
      const prepare = active.preAuthor!.bind(active); active.preAuthor = async (task, signal) => { if (task.taskId === 'integration-task') { abort.abort(); return; } await prepare(task, signal); };
      const tasks = await executeTaskDag({ controller, requirement, tasks: planned.tasks, sessionRoot: join(root, 'sessions'), availableArtifacts: active.availableArtifacts, roleFactory: active.roleFactory,
        preAuthor: active.preAuthor, capture: active.capture, verify: active.verify, diagnoseFailure: active.diagnoseFailure, signal: abort.signal, reviewProtocolCorrections: 1,
        recovery: { artifactRoot: root, journalRoot: join(root, 'journal'), recoverCapture: active.recoverCapture } });
      result = { tasks }; assert.equal(tasks.filter(task => task.state === 'passed').length, 4); assert.equal(tasks.find(task => task.taskId === 'integration-task')!.attempts.length, 0);
    } finally { await controller.close(); }
  } else if (options.pauseRepair || options.dirtyIntegration) result = await executeGeneration({ root, requirement, draft, resume: false, createHost: async input => {
    const active = await createBrowserHost({ ...input, ...hostOptions }), prepare = active.preAuthor!.bind(active);
    active.preAuthor = async (task, signal) => {
      if (options.pauseRepair && task.taskId.endsWith('-repair')) throw new Error('Synthetic interruption before registered repair dispatch.');
      if (options.dirtyIntegration && task.taskId === 'module-b-task') {
        await mkdir(join(root, 'authors/coding/src'), { recursive: true }); await writeFile(join(root, 'authors/coding/src/main.ts'), '// Unknown original integration writes.\n', 'utf8');
      }
      await prepare(task, signal);
    };
    return active;
  } });
  else result = await host.execute({ root, requirement, draft, resume: false });
  return { root, packets, result, requirement, draft, host };
}
test('actual product host runs five isolated tasks and composes two approved compiled modules into one reviewed game', async t => {
  const f = await modularFixture(t); assert.ok(f.result.acceptedCandidate, JSON.stringify({ gaps: f.result.gaps, history: f.result.taskHistory, root: f.root }));
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.tasks.filter((task: any) => task.state === 'passed').length, 5);
  for (const slot of ['a', 'b']) assert.ok(await readFile(join(f.root, `registry/captures/module-${slot}/v1/files/src/modules/${slot}/index.ts`)));
  const project = f.result.acceptedCandidate.targetRoot, assembly = JSON.parse(await readFile(join(f.root, project, '_cosmos/modular-assembly.json'), 'utf8'));
  assert.equal(assembly.modules.length, 2); assert.deepEqual(assembly.modules.map((row: any) => row.ref.artifactId), ['module-a', 'module-b']);
  assert.equal(f.packets.filter(packet => packet.role === 'reviewer').length, 5);
  assert.ok(f.packets.filter(packet => packet.role === 'reviewer').every(packet => !packet.ownership.writePaths.length));
  assert.deepEqual(state.ledger.entries, []); t.diagnostic('Synthetic provider/browser/review; actual production caller/compiler/registry; not generated game or gameplay evidence.');
});
test('attributable integration compiler defect gets only one game v2 with the same approved module captures', async t => {
  const f = await modularFixture(t, 'integration-repair'); assert.ok(f.result.acceptedCandidate, JSON.stringify({ gaps: f.result.gaps, root: f.root }));
  assert.equal(f.result.acceptedCandidate.candidateRef.version, 'v2');
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.tasks.find((task: any) => task.taskId === 'integration-task').state, 'failed');
  assert.equal(state.tasks.filter((task: any) => task.taskId.startsWith('module-')).length, 2);
  assert.equal(f.packets.filter(packet => packet.role === 'coding' && packet.taskId.startsWith('integration-task')).length, 2);
  const assembly = JSON.parse(await readFile(join(f.root, f.result.acceptedCandidate.targetRoot, '_cosmos/modular-assembly.json'), 'utf8'));
  assert.ok(assembly.modules.every((module: any) => module.ref.version === 'v1'));
  assert.equal(state.ledger.limitMicroCny, 200000000); assert.deepEqual(state.ledger.entries, []);
});
for (const fault of ['empty-module', 'module-drift', 'contract-drift', 'review-drift']) test(`modular ${fault} cannot dispatch final integration or promote a game`, async t => {
  const f = await modularFixture(t, fault); assert.equal(f.result.acceptedCandidate, undefined);
  assert.equal(f.packets.filter(packet => packet.role === 'coding' && packet.taskId.startsWith('integration-task')).length, 0);
  if (fault === 'contract-drift') assert.equal(f.packets.filter(packet => packet.role === 'coding' && packet.taskId === 'module-b-task').length, 0);
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.tasks.some((task: any) => task.taskId.endsWith('-repair')), false); assert.deepEqual(state.ledger.entries, []);
});
test('unfinished five-task recovery reuses fixed modules and runs only the unstarted integration without clock or budget reset', async t => {
  const f = await modularFixture(t, 'paused'), before = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  const modulePackets = f.packets.filter(packet => packet.taskId.startsWith('module-')).length;
  await assert.rejects(buildContinuationQuote({ root: f.root, additionalMicroCny: 100, additionalDurationMs: 60000 }), /双模块|追加/);
  const path = join(f.root, 'execution.json'), bytes = await readFile(path), incomplete = JSON.parse(bytes.toString('utf8'));
  incomplete.tasks = incomplete.tasks.filter((item: any) => item.task.taskId !== 'module-b-task'); await writeFile(path, JSON.stringify(incomplete), 'utf8');
  const count = f.packets.length, refused: any = await f.host.execute({ root: f.root, requirement: f.requirement, draft: f.draft, resume: true });
  assert.equal(refused.acceptedCandidate, undefined); assert.equal(f.packets.length, count); await writeFile(path, bytes);
  const result: any = await f.host.execute({ root: f.root, requirement: f.requirement, draft: f.draft, resume: true });
  assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps));
  assert.equal(f.packets.filter(packet => packet.taskId.startsWith('module-')).length, modulePackets);
  const after = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(after.run.originalStartedAt, before.run.originalStartedAt); assert.equal(after.run.originalDeadlineAt, before.run.originalDeadlineAt);
  assert.equal(after.ledger.limitMicroCny, before.ledger.limitMicroCny); assert.deepEqual(after.ledger.allocations, before.ledger.allocations);
});
