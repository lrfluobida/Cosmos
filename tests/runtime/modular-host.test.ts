import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { createProductHost } from '../../src/runtime/entrypoint-host.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { withHostStages } from '../../src/roles/requirements.ts';

/** Actual product caller/compiler/registry/journal; model/browser/reviewer replies are synthetic. */
export async function modularFixture(t: test.TestContext, fault = '') {
  const root = await mkdtemp(join(tmpdir(), 'cos71-host-')); t.after(() => { t.diagnostic(`Source-only pipeline evidence: ${root}`); });
  const draft: any = withHostStages({ codeProfile: 'modular-code/1', brief: '原创点击获胜', questions: [{ id: 'goal', prompt: '目标？' }], answers: { goal: '点击获胜' }, unsupported: [],
    acceptance: [{ acceptanceId: 'win', description: '点击获胜', steps: ['点击目标'], expected: '胜利', evidenceKinds: ['test_report'] }],
    scenario: { viewport: { width: 1280, height: 720 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#target', timeoutMs: 1000 },
      { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] } } as any);
  const intake = await IntakeController.create({ root, runId: 'modular-game', ledgerId: 'modular-budget', specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 2,
    allocations: [{ taskId: 'intake', amountMicroCny: 100 }, { taskId: 'planning', amountMicroCny: 100 }] });
  const saved = await intake.saveDraft(draft), requirement = await intake.confirm({ revision: saved.revision, confirmed: true, actorId: 'synthetic-user', at: new Date().toISOString() });
  await intake.activateGeneration({ environmentReady: true, executionReady: true }); await intake.close();
  const toolchain = resolve(process.env.COSMOS_TEMPLATE_ROOT ?? fileURLToPath(new URL('../../templates/2d', import.meta.url)));
  await mkdir(join(root, 'toolchain')); for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await cp(join(toolchain, name), join(root, 'toolchain', name));
  await cp(await realpath(join(toolchain, 'node_modules')), join(root, 'toolchain/node_modules'), { recursive: true, dereference: true });
  const packets: any[] = [];
  const host = createProductHost(fileURLToPath(new URL('../../', import.meta.url)), { io: {
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
      if (packet.role === 'reviewer') return { text: JSON.stringify({ verdict: 'approved', findings: [], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((row: any) => row.evidenceId) }) };
      const put = async (name: string, text: string) => { await mkdir(join(root, name, '..'), { recursive: true }); await writeFile(join(root, name), text, 'utf8'); };
      if (packet.role === 'design') {
        await put('authors/design/design.json', JSON.stringify({ summary: '原创点击', implementationNotes: ['模块协作'], acceptanceMapping: { win: '点击后获胜' },
          characters: [{ id: 'target', purpose: '目标', states: ['idle'] }], audio: [], modulePurposes: { a: '递增进度', b: '根据进度显示胜利' } }));
        await put('authors/design/module-contracts.d.ts', 'export interface ModuleA { advance(value: number): number; }\nexport interface ModuleB { label(value: number): string; }\n');
      } else if (packet.role === 'art') await put('authors/art/media.json', JSON.stringify({ characters: [{ id: 'target', width: 32, height: 32, anchor: { x: 16, y: 16 },
        layers: [{ id: 'body', shape: 'rect', x: 1, y: 1, width: 30, height: 30, fill: '#FFD700', stroke: '#000000', strokeWidth: 0 }], states: [{ name: 'idle', fps: 1, loop: true, frames: [{}] }] }], audio: [] }));
      else if (code === 'module-a-task') await put('authors/code-a/src/modules/a/index.ts', fault === 'empty-module' ? 'export {};\n' : 'export function advance(value: number): number { return value + 1; }\n');
      else if (code === 'module-b-task') await put('authors/code-b/src/modules/b/index.ts', 'export function label(value: number): string { return value > 0 ? "胜利" : "等待"; }\n');
      else {
        await put('authors/coding/index.html', '<button id="target">目标</button><div id="result">等待</div><script type="module" src="/src/main.ts"></script>');
        await put('authors/coding/src/main.ts', "import {advance} from './modules/a';import {label} from './modules/b';document.querySelector('#target')!.addEventListener('click',()=>{document.querySelector('#result')!.textContent=label(advance(0));});\n");
      }
      return { text: JSON.stringify({ summary: 'Synthetic scoped fixture output', remaining: [], uncertainty: [] }) };
    } };
  } });
  const result: any = await host.execute({ root, requirement, draft, resume: false });
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
