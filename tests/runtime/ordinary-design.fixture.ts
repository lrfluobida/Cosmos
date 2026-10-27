import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable, Writable } from 'node:stream';
import type { TestContext } from 'node:test';
import { createBrowserHost, createProductHost } from '../../src/runtime/entrypoint-host.ts';
import { runProductSession } from '../../src/cli/session.ts';
import { withHostStages } from '../../src/roles/requirements.ts';
import type { OrdinaryGameDraft, BrowserScenario } from '../../src/roles/requirements.ts';
import { ordinaryBrowserReport, ordinaryPersistentReport, ordinaryClassicSource } from './ordinary-browser.fixture.ts';
import { selectClassicEntry } from '../../src/runtime/classic-entry-input.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';
import type { RoleSession } from '../../src/roles/factory.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';

export async function ordinaryHostFixture(t: TestContext, options: { modular?: boolean; fault?: string; persistent?: boolean; classic?: boolean; renderFrames?: boolean; pause?: boolean; productionDefault?: boolean;
  revisionPolicy?: boolean | 'independent-review/1' | 'independent-review/2';
  mediaPolicy?: 'audio-state/1'; configure?: (draft: OrdinaryGameDraft, scenario: BrowserScenario) => void;
  limits?: Parameters<typeof runProductSession>[0]['limits'];
  sessionFactory?: (config: PiSessionOptions, fallback: RoleSession) => Promise<RoleSession> } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cos112-')), modular = !!options.modular, fault = options.fault ?? '';
  const id = modular ? 'count' : 'light', selector = modular ? '#counter' : '#light';
  const draft: OrdinaryGameDraft = withHostStages({ ordinaryProfile: 'ordinary-design/1', brief: modular ? '鼠标增加计数' : '鼠标点亮目标',
    questions: [{ id: 'goal', prompt: '操作目标？' }], answers: { goal: '点击后显示完成' }, unsupported: [], ...(modular ? { codeProfile: 'modular-code/1' as const } : {}),
    acceptance: [{ acceptanceId: id, description: '点击后完成', steps: ['点击目标'], expected: '完成', evidenceKinds: ['test_report'] }],
    experienceCriteria: [{ criterionId: 'readable', description: '状态清楚', steps: ['试玩查看目标状态'], expected: '容易辨认' }] });
  const scenario: BrowserScenario = { viewport: { width: 1280, height: 720 }, steps: [
    { id: 'click', kind: 'locator-click', selector, timeoutMs: 1000 },
    { id: 'complete', kind: 'assert', acceptanceId: id, observation: { kind: 'text', selector: '#status' }, expected: '完成', timeoutMs: 1000 },
  ] };
  if (options.persistent || options.classic) {
    const checkpoint = { expected: '已保存', snapshot: { kind: 'text' as const, selector: '#progress' }, savedSnapshot: { kind: 'text' as const, selector: '#saved' } };
    scenario.steps.push(...[checkpoint.snapshot, checkpoint.savedSnapshot].map((observation, index) => ({ id: `save-${index}`, kind: 'assert' as const, acceptanceId: id, observation, expected: checkpoint.expected, timeoutMs: 1000 })));
    scenario.reopen = { checkpoint, steps: structuredClone(scenario.steps) };
    draft.questions.push({ id: 'save', prompt: '存档要求？' }); draft.answers.save = '正常保存并关闭浏览器进程后恢复。';
  }
  options.configure?.(draft, scenario);
  const classicSourceRoot = options.classic ? await ordinaryClassicSource(t) : undefined;
  if (classicSourceRoot) { draft.benchmark = 'classic-pc-runtime-policy/1'; draft.classicEntry = await selectClassicEntry(classicSourceRoot); }
  const packets: any[] = [], plays: any[] = [], checks: any[] = [];
  const put = async (path: string, content: string | Buffer) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), content, typeof content === 'string' ? 'utf8' : undefined); };
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const template = process.env.COSMOS_TEMPLATE_ROOT ?? join(repository, 'templates/2d');
  const hostOptions: Parameters<typeof createProductHost>[1] = { ...(classicSourceRoot ? { classicSourceRoot } : {}), io: {
    async build(project: string) {
      await mkdir(join(project, 'dist'), { recursive: true }); await cp(join(project, 'public/assets'), join(project, 'dist/assets'), { recursive: true });
      await writeFile(join(project, 'dist/index.html'), '<p>受控输出</p>', 'utf8');
      const code = await readFile(join(project, 'src/main.ts'), 'utf8'), failed = code.includes('const wrong: number');
      return { passed: !failed, diagnostics: 'Synthetic build; no generated game claim', work: project,
        results: failed ? [{ code: 1, stdout: 'src/main.ts(1,7): error TS2322: Controlled compiler defect', stderr: '' }]
          : [{ code: 0, stdout: '', stderr: '' }, { code: 0, stdout: '', stderr: '' }] };
    },
    async play(plan: any, _signal: any, _authority: any, extra: any) {
      plays.push({ plan: structuredClone(plan), options: structuredClone(extra) });
      const request = extra?.mediaObservations;
      if (options.classic) return ordinaryBrowserReport(join(root, 'browser-evidence'), plan, request);
      return { formatVersion: '1.0.0', kind: 'normal_browser_input', plan: { ...plan, ...(fault === 'candidate' ? { artifact: { ...plan.artifact, version: 'wrong' } } : {}) }, outcome: 'passed',
        browser: { version: 'synthetic-browser' }, cleanup: { processExited: true }, errors: [],
        ...(request ? { mediaObservations: { request, recordedAt: new Date().toISOString(), values: request.fields.map((field: any) => field.expected) } } : {}),
        reportPath: 'synthetic.json', files: [], evidence: [], steps: plan.steps.map((step: any) => ({ id: step.id, kind: step.kind, acceptanceId: step.acceptanceId,
          outcome: 'passed', expected: step.expected ?? 'input delivered', actual: step.expected ?? 'input delivered', screenshot: null })) } as any;
    },
    async playPersistent(series: any, args: any, authority: any) {
      plays.push({ series: structuredClone(series), options: structuredClone({ deadlineAt: args.deadlineAt, segmentRenderFrames: args.segmentRenderFrames }), authority: structuredClone(authority) });
      return ordinaryPersistentReport(series, args);
    },
  } as any, sessionFactory: async config => {
    const packet = JSON.parse(config.context!), taskId = packet.taskId; packets.push(packet);
    const writeRoot = packet.role === 'reviewer' ? root : config.workspace;
    const put = async (path: string, content: string | Buffer) => { await mkdir(join(writeRoot, path, '..'), { recursive: true }); await writeFile(join(writeRoot, path), content, typeof content === 'string' ? 'utf8' : undefined); };
    const session: RoleSession = { close: async () => {}, prompt: async () => {
      if (packet.role === 'cosmos') return { text: JSON.stringify({ tasks: [
        { taskId: 'design-task', policyId: 'game-design', role: 'design', objective: '设计', acceptanceIds: ['COSMOS-DESIGN', ...(fault.startsWith('planning-') ? [id] : [])], dependsOn: [] },
        { taskId: 'art-task', policyId: 'game-art', role: 'art', objective: '素材', acceptanceIds: ['COSMOS-MEDIA'], dependsOn: ['design-task'] },
        ...(modular ? ['a', 'b'].map(slot => ({ taskId: `module-${slot}-task`, policyId: `game-module-${slot}`, role: 'coding', objective: '模块', acceptanceIds: [`COSMOS-MODULE-${slot.toUpperCase()}`], dependsOn: ['design-task', 'art-task'] })) : []),
        { taskId: 'coding-task', policyId: 'game-code', role: 'coding', objective: '完成游戏', acceptanceIds: [id], dependsOn: ['design-task', ...(fault === 'planning-dependencies' ? [] : ['art-task']), ...(modular ? ['module-a-task', 'module-b-task'] : [])] },
      ] }) };
      if (packet.role === 'reviewer') {
        if (taskId.startsWith('design-task')) {
          const designRef = packet.inputs.find((ref: any) => ref.artifactId === 'design');
          assert.ok(designRef);
          const captured = JSON.parse(await readFile(join(root, designRef.location, '_cosmos/acceptance-plan.json'), 'utf8'));
          assert.deepEqual(captured.scenario, scenario);
          // The mutable author's newer selectors must never reach the consumer.
          await put('authors/design/acceptance-plan.json', JSON.stringify({ ...captured, scenario: { ...scenario, steps: [] } }));
          if (fault === 'review') return { text: JSON.stringify({ verdict: 'changes_requested', findings: ['无法确认当前计划完整覆盖原规则'], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((e: any) => e.evidenceId) }) };
        }
        if (taskId === 'art-task' && fault === 'review-receipt') {
          const path = 'journal/task-design-task/review.json', receipt = JSON.parse(await readFile(join(root, path), 'utf8'));
          receipt.value.verdict.verdict = 'changes_requested'; receipt.value.verdict.findings = ['原批准改变']; await put(path, JSON.stringify(receipt));
        }
        if (taskId === 'art-task' && fault === 'plan-drift') await put('registry/captures/design/v1/files/_cosmos/acceptance-plan.json', '{}');
        if (taskId.startsWith('coding-task') && !options.persistent && !options.classic) {
          const trace = packet.evidence.find((item: any) => item.source.location === `evidence/${taskId}/browser.json`);
          assert.ok(trace, 'Independent coding review must receive the actual normal-input report.');
          const raw = JSON.parse(await readFile(join(root, trace.source.location), 'utf8'));
          assert.deepEqual(raw.plan.steps.filter((step: any) => !step.id.startsWith('host-media-')), scenario.steps);
          assert.deepEqual(raw.plan.artifact, packet.inputs.find((ref: any) => ref.artifactId === 'game'));
        }
        return { text: JSON.stringify({ verdict: 'approved', findings: [], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((e: any) => e.evidenceId) }) };
      }
      if (packet.role === 'design') {
        const requirement = packet.inputs.find((ref: any) => ref.artifactId === 'requirement-bundle'); assert.ok(requirement);
        const plan: any = { formatVersion: 'ordinary-acceptance-plan/1', requirement, scenario };
        const first = taskId === 'design-task';
        if (first && fault === 'source') plan.requirement = { ...requirement, version: 'wrong' };
        if (first && fault === 'coverage') plan.scenario = { ...scenario, steps: [] };
        if (!(first && fault === 'missing')) await put('authors/design/acceptance-plan.json', first && fault === 'json' ? '{' : JSON.stringify(plan));
        await put('authors/design/design.json', JSON.stringify({ summary: '原创鼠标游戏', implementationNotes: ['通过正常鼠标操作显示结果'], acceptanceMapping: { [id]: '点击后显示完成' },
          experienceMapping: { readable: '状态清楚呈现' }, characters: [{ id: 'target', purpose: '目标', states: ['idle'] }], audio: [], ...(modular ? { modulePurposes: { a: '计算数值', b: '显示结果' } } : {}) }));
        if (modular) await put('authors/design/module-contracts.d.ts', 'export interface ModuleA { advance(value: number): number; }\nexport interface ModuleB { label(value: number): string; }\n');
        if (options.classic) await put('authors/design/classic-entry-plan.json', JSON.stringify({ formatVersion: 'classic-entry-plan/1', measurementId: draft.classicEntry!.measurement!.id, acceptanceId: id,
          inputs: [{ id: 'show-cost', kind: 'locator-click', selector: '#show-cost', timeoutMs: 1000 }], observation: { kind: 'text', selector: '#cost' }, timeoutMs: 1000 }));
        const tool = config.tools!.find(tool => tool.name === 'validate-game-design'); assert.ok(tool);
        const result = await tool.execute('ordinary-self-check', {}, undefined, undefined, undefined as any); checks.push(result);
      } else if (packet.role === 'art') await put('authors/art/media.json', JSON.stringify({ characters: [{ id: 'target', width: 32, height: 32, anchor: { x: 16, y: 16 },
        layers: [{ id: 'body', shape: 'rect', x: 1, y: 1, width: 30, height: 30, fill: '#FFD700', stroke: '#000000', strokeWidth: 0 }], states: [{ name: 'idle', fps: 1, loop: true, frames: [{}] }] }], audio: [] }));
      else if (taskId === 'module-a-task') await put('authors/code-a/src/modules/a/index.ts', 'export function advance(value: number): number { return value + 1; }\n');
      else if (taskId === 'module-b-task') await put('authors/code-b/src/modules/b/index.ts', 'export function label(value: number): string { return value > 0 ? "完成" : "等待"; }\n');
      else {
        await put('authors/coding/index.html', '<div id="status">等待</div><script type="module" src="/src/main.ts"></script>');
        await put('authors/coding/src/main.ts', fault === 'code-repair' && taskId === 'coding-task' ? 'const wrong: number = "bad";\n' : modular
          ? "import {advance} from './modules/a';import {label} from './modules/b';document.querySelector('#status')!.textContent=label(advance(0));\n"
          : "document.querySelector('#status')!.textContent='完成';\n");
      }
      return { text: JSON.stringify({ summary: 'Controlled source fixture only', remaining: [], uncertainty: fault === 'capability' && packet.role === 'design' ? ['The static plan cannot establish the requested elapsed-time interval.'] : [] }) };
    } };
    return options.sessionFactory ? options.sessionFactory(config, session) : session;
  } };
  const product = createProductHost(repository, hostOptions);
  let prepared = false;
  const host = { ...product, ...(!options.productionDefault ? { ordinaryProfile: 'ordinary-design/1' as const } : {}),
    async prepare() {
      if (prepared) return { environmentReady: true, executionReady: true };
      await mkdir(join(root, 'toolchain'), { recursive: true });
      for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await cp(join(template, name), join(root, 'toolchain', name));
      if (modular) await cp(await realpath(join(template, 'node_modules')), join(root, 'toolchain/node_modules'), { recursive: true, dereference: true });
      else for (const name of ['phaser', 'eventemitter3']) {
        const folder = join(template, 'node_modules', name), files = (await readdir(folder)).filter(file => file === 'package.json' || /^licen[sc]e(?:\.[a-z]+)?$/i.test(file));
        if (name === 'phaser') files.push('src/geom/polygon/Earcut.js', 'src/geom/polygon/Simplify.js', 'src/physics/matter-js/lib/license.js', 'src/polyfills/AudioContextMonkeyPatch.js');
        for (const file of files) { const target = join(root, 'toolchain/node_modules', name, file); await mkdir(join(target, '..'), { recursive: true }); await cp(join(folder, file), target); }
      }
      prepared = true;
      return { environmentReady: true, executionReady: true };
    }, async questions() { return draft.questions; }, async draft() { return draft; },
    async execute(input: Parameters<typeof product.execute>[0]): Promise<any> {
      if (!options.pause && !options.productionDefault) return executeGeneration({ ...input,
        createHost: hostInput => createBrowserHost({ ...hostInput, ...hostOptions,
          ordinaryDesignRevisionPolicy: (options.revisionPolicy === true ? 'independent-review/1' : options.revisionPolicy || undefined) as any }) });
      if (!options.pause || input.resume) return product.execute(input);
      const controller = await RunController.open({ root }), work = new OwnedWork(controller.signal), abort = new AbortController();
      try {
        const active = await createBrowserHost({ ...input, controller, work, ...hostOptions, ...(options.mediaPolicy ? { ordinaryMediaObservationPolicy: options.mediaPolicy } : {}) });
        const planned = await planTaskDag({ controller, requirement: input.requirement, planningTaskId: 'planning', workspace: root, sessionRoot: join(root, 'sessions'),
          availableArtifacts: active.availableArtifacts, taskPolicies: active.taskPolicies, roleFactory: active.roleFactory });
        active.validateTasks!(planned.tasks);
        await put('execution.json', JSON.stringify({ capability: active.capability, requirement: input.requirement, tasks: planned.tasks, availableArtifacts: active.availableArtifacts, plan: planned.plan,
          ...(options.mediaPolicy ? { ordinaryMediaObservationPolicy: options.mediaPolicy } : {}) }));
        await active.bindPreparedTasks?.(planned.tasks);
        const tasks = await executeTaskDag({ controller, requirement: input.requirement, tasks: planned.tasks, sessionRoot: join(root, 'sessions'), availableArtifacts: active.availableArtifacts,
          roleFactory: active.roleFactory, preAuthor: async (task, signal) => { if (task.taskId === 'coding-task') { abort.abort(); return; } await active.preAuthor!(task, signal); },
          capture: active.capture, verify: active.verify, diagnoseFailure: active.diagnoseFailure, signal: abort.signal, reviewProtocolCorrections: 1,
          recovery: { artifactRoot: root, journalRoot: join(root, 'journal'), recoverCapture: active.recoverCapture } });
        return { outcome: 'fixture-paused', tasks };
      } finally { await controller.close(); }
    } };
  let output = ''; const sink = new Writable({ write(chunk, _encoding, done) { output += chunk; done(); } });
  const execute = () => runProductSession({ command: 'new', root, brief: draft.brief, host, ...(options.limits ? { limits: options.limits } : {}), ...(options.renderFrames ? { renderFrames: true } : {}),
    input: Readable.from([`点击后显示完成\n${options.persistent || options.classic ? '正常保存并关闭浏览器进程后恢复。\n' : ''}confirm 1\n`]), output: sink });
  t.after(() => { t.diagnostic(`SOURCE only; fake provider/browser; ${root}`); });
  return { root, draft, scenario, packets, plays, checks, execute, host, hostOptions, output: () => output };
}
