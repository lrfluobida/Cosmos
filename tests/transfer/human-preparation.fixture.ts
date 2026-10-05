import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type test from 'node:test';
import { IntakeController } from '../../src/runtime/intake.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { preparationAcceptance } from '../../src/roles/requirements.ts';
import { resolveDraftMode } from '../../src/roles/preparation-mode.ts';
import { syntheticMap } from './runtime-host.fixture.ts';
import { mediaObservationDefinitions } from '../../src/runtime/entrypoint-media.ts';

/** Installed tool entrypoints and their direct closures are SYNTHETIC; no target game or native service. */
export async function installHumanTools(root: string) {
  const toolchain = join(root, 'toolchain');
  const tools = [{ name: 'typescript', version: '5.9.3', type: 'commonjs', entry: 'bin/tsc', next: 'lib/compiler.cjs', content: "require('../lib/compiler.cjs');\n" },
    { name: 'vite', version: '8.3.1', type: 'module', entry: 'bin/vite.js', next: 'dist/node/cli.js', content: "import '../dist/node/cli.js';\n" }];
  for (const tool of tools) {
    const folder = join(toolchain, 'node_modules', tool.name);
    for (const name of [tool.entry, tool.next]) await mkdir(join(folder, name, '..'), { recursive: true });
    await writeFile(join(folder, 'package.json'), JSON.stringify({ name: tool.name, version: tool.version, type: tool.type }), 'utf8');
    await writeFile(join(folder, tool.entry), tool.content, 'utf8'); await writeFile(join(folder, tool.next), '// Synthetic fixed compiler closure\n', 'utf8');
  }
  await writeFile(join(toolchain, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: Object.fromEntries(tools.map(tool => ['node_modules/' + tool.name, { version: tool.version }])) }), 'utf8');
}

/** All confirmations and SDK output in this TEMP fixture are SYNTHETIC; no actual human acceptance. */
export async function humanFixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cos58-human-'));
  const preparation = resolveDraftMode('cos16-input/1')!;
  const draft = { preparation, brief: '中文单关鼠标推箱子', questions: [{ id: 'scope', prompt: '游戏范围？' }], answers: { scope: '两个箱子和两个目标' }, acceptance: preparationAcceptance(preparation), unsupported: [] };
  const intake = await IntakeController.create({ root, runId: 'synthetic-human', ledgerId: 'synthetic-formal-budget', specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 8,
    draftMode: 'cos16-input/1', allocations: [{ taskId: 'intake', amountMicroCny: 1_000_000 }, { taskId: 'planning', amountMicroCny: 1_000_000 }] });
  const saved = await intake.saveDraft(draft), requirement = await intake.confirm({ revision: saved.revision, confirmed: true, actorId: 'synthetic-stdin', at: new Date().toISOString() });
  const original = await intake.activateGeneration({ environmentReady: true, executionReady: true }); await intake.close();
  await mkdir(join(root, 'toolchain'));
  for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await writeFile(join(root, 'toolchain', file), file.endsWith('.ts') ? 'export default {}\n' : '{}\n', 'utf8');
  await installHumanTools(root);
  let controller: RunController | undefined;
  t.after(async () => { await controller?.close(); await rm(root, { recursive: true, force: true }); });
  return { root, requirement, draft, original, async input(resume = false) {
    await controller?.close(); controller = await RunController.open({ root });
    return { root, controller, requirement, draft, resume, work: new OwnedWork(controller.signal) };
  } };
}

export function fakeHumanSdk(calls: string[]) {
  let requests = 0;
  return async (config: any) => {
    const packet = JSON.parse(config.context);
    return { close: async () => {}, prompt: async (_text: string, options: any) => {
      calls.push(packet.role + ':' + packet.taskId);
      const requestId = `synthetic-human-${++requests}-${calls.length}`;
      await config.budget.beforeRequest({ requestId, modelId: 'deepseek-flash', maxOutputTokens: config.maxOutputTokens, inputBytes: 100, hasImages: false, estimatedMaxCostMicroCny: 200 + config.maxOutputTokens * 8 });
      await config.budget.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
      if (packet.role === 'cosmos') return { text: JSON.stringify({ tasks: [
        { taskId: 'actual-design-58', policyId: 'game-design', role: 'design', objective: '合成设计', acceptanceIds: ['COSMOS-DESIGN'], dependsOn: [] },
        { taskId: 'actual-art-58', policyId: 'game-art', role: 'art', objective: '合成媒体', acceptanceIds: ['COSMOS-MEDIA'], dependsOn: ['actual-design-58'] },
        { taskId: 'actual-code-58', policyId: 'game-code', role: 'coding', objective: '合成编码', acceptanceIds: packet.acceptance.filter((item: any) => item.acceptanceId.startsWith('T16-')).map((item: any) => item.acceptanceId), dependsOn: ['actual-design-58', 'actual-art-58'] },
      ] }) };
      if (packet.role === 'reviewer') return { text: JSON.stringify({ verdict: 'approved', findings: [], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((item: any) => item.evidenceId) }) };
      const tool = (name: string) => { const tool = config.tools.find((tool: any) => tool.name === name); if (!tool) throw new Error(`Missing real role tool ${name}`); return tool; };
      const write = (path: string, value: unknown) => tool('write').execute('synthetic-write', { path, content: typeof value === 'string' ? value : JSON.stringify(value) }, options?.signal);
      if (packet.role === 'design') {
        await write('authors/design/design.json', { summary: '合成运行时设计', implementationNotes: ['保留固定推箱子要求'], acceptanceMapping: Object.fromEntries(['T16-01','T16-02','T16-03','T16-04','T16-05','T16-06'].map(id => [id, '正常输入与固定地图'])), characters: [{ id: 'marker', purpose: '合成媒体', states: ['idle'] }], audio: [] });
        const requirementRef = packet.inputs.find((ref: any) => ref.artifactId === 'requirement-bundle');
        await write('authors/design/transfer-design.json', syntheticMap(requirementRef));
        await tool('validate-transfer-design').execute('synthetic-transfer-check', {}, options?.signal);
      }
      if (packet.role === 'art') await write('authors/art/media.json', { characters: [{ id: 'marker', width: 32, height: 32, anchor: { x: 16, y: 16 }, layers: [{ id: 'body', shape: 'rect', x: 2, y: 2, width: 28, height: 28, fill: '#ffee22', stroke: '#222222', strokeWidth: 1 }], states: [{ name: 'idle', fps: 1, loop: true, frames: [{}] }] }], audio: [] });
      if (packet.role === 'coding') { tool('check-game-build'); await write('authors/coding/index.html', '<p>合成接口，无目标游戏</p>'); await write('authors/coding/src/main.ts', '// 合成 SDK 输出，不是目标游戏\n'); }
      return { text: JSON.stringify({ summary: 'Synthetic runtime output', remaining: [], uncertainty: [] }) };
    } };
  };
}

export function fakePublicSdk(calls: string[]) {
  const authors = fakeHumanSdk(calls); let requests = 0;
  return async (config: any) => {
    const packet = JSON.parse(config.context); if (packet.role !== 'design-intake') return authors(config);
    return { close: async () => {}, async prompt() {
      const requestId = `synthetic-intake-${++requests}`;
      await config.budget.beforeRequest({ requestId, modelId: 'deepseek-flash', maxOutputTokens: config.maxOutputTokens, inputBytes: 100, hasImages: false, estimatedMaxCostMicroCny: 200 + config.maxOutputTokens * 8 });
      await config.budget.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
      return { text: JSON.stringify(packet.input.phase === 'questions' ? { questions: [{ id: 'scope', prompt: '游戏范围？' }] } : { acceptance: packet.preparation.acceptance, unsupported: [] }) };
    } };
  };
}

/** Synthetic persistent transport only; it makes no claim that a browser or target game passed. */
export async function humanPersistentReports(series: any, options: any, missingFrames = false) {
  const first = series.segments[0].plan, base = [first.projectId, first.artifact.artifactId, first.artifact.version, first.runId].join('/'), at = new Date().toISOString(), segments: any[] = [];
  const profileRoot = join(options.evidenceRoot, 'synthetic-profiles');
  const media = JSON.parse(await (await import('node:fs/promises')).readFile(join(options.evidenceRoot, '..', options.mediaObservations.media.location, 'public/assets/manifest.json'), 'utf8'));
  const definitions = mediaObservationDefinitions(media);
  for (const [number, segment] of series.segments.entries()) {
    const plan = segment.plan, folder = base + '/' + plan.reportId, screenshot = folder + '/final.png', profile = join(profileRoot, 'p' + Math.min(number, 6));
    const session = { browserPid: 30000 + number, profile, commandLineProfile: profile, origin: new URL(plan.url).origin, closeEvent: true, exitConfirmed: true, exitCode: 0, signalCode: null,
      cdp: { browserProcessIds: [30000 + number], profileArguments: ['--user-data-dir=' + profile] } };
    const values = definitions.map(item => item.expected); if (missingFrames) { const index = definitions.findIndex(item => item.path.at(-1) === 'loadedFrames'); if (index < 0) throw new Error('Synthetic frame observation is missing'); values[index] = 0; }
    const report = { formatVersion: '1.0.0', kind: 'normal_browser_input', plan: structuredClone(plan), startedAt: at, endedAt: at, outcome: 'passed',
      browser: { name: 'chromium', channel: 'synthetic', version: 'synthetic', headless: true, viewport: plan.viewport }, timeoutMs: 1000,
      cleanup: { browserPid: session.browserPid, forced: false, processExited: true }, session,
      steps: plan.steps.map((step: any) => ({ id: step.id, kind: step.kind, ...('acceptanceId' in step ? { acceptanceId: step.acceptanceId } : {}), outcome: 'passed',
        expected: 'expected' in step ? step.expected : 'input delivered', actual: 'expected' in step ? step.expected : 'input delivered', error: null, screenshot,
        ...('expected' in step ? { observation: { completed: 1 } } : {}) })), errors: [], files: [screenshot, folder + '/browser.webm', folder + '/browser.log', folder + '/report.json'], reportPath: folder + '/report.json', evidence: [],
      failureFacts: { formatVersion: 1, termination: null, errors: [] }, mediaObservations: { request: structuredClone(options.mediaObservations), recordedAt: at, values } };
    await mkdir(join(options.evidenceRoot, folder), { recursive: true });
    await writeFile(join(options.evidenceRoot, screenshot), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfXcAAAAASUVORK5CYII=', 'base64'));
    await writeFile(join(options.evidenceRoot, folder + '/browser.webm'), 'synthetic'); await writeFile(join(options.evidenceRoot, folder + '/browser.log'), 'synthetic');
    await writeFile(join(options.evidenceRoot, report.reportPath), JSON.stringify(report), 'utf8'); segments.push({ id: segment.id, report });
  }
  const expected = series.checkpoint.expected;
  const report = { formatVersion: '1.0.0', kind: 'persistent_profile_process_reopen', capability: 'persistent-profile-real-process-reopen-with-evidence', series: structuredClone(series), deadlineAt: options.deadlineAt,
    startedAt: at, endedAt: at, outcome: 'passed', profileRoot, segments, checkpoint: { outcome: 'passed', expected, actual: expected, savedActual: expected, before: segments[6].report.session, after: segments[7].report.session }, errors: [],
    reportPath: base + '/' + series.reportId + '/report.json', failureFacts: { formatVersion: 1, errors: [] } };
  await mkdir(join(options.evidenceRoot, base, series.reportId), { recursive: true }); await writeFile(join(options.evidenceRoot, report.reportPath), JSON.stringify(report), 'utf8'); return report;
}
