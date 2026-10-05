import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type test from 'node:test';
import { IntakeController } from '../../src/runtime/intake.ts';
import { RunController } from '../../src/runtime/run.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { executeGeneration, type HostInput } from '../../src/runtime/entrypoint.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import { createRoleBudget } from '../../src/roles/provider-budget.ts';
import { withHostStages, DESIGN_ACCEPTANCE_ID, MEDIA_ACCEPTANCE_ID } from '../../src/roles/requirements.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { deliveryTaskProofs, publishGenerationReport } from '../../src/runtime/experience.ts';
import { selectRenderFrames } from '../../src/runtime/render-frame-selection.ts';

/** Explicit offline fixture: real runtime/registry, fake model and fake build/browser. */
export async function continuationSessionFixture(t: test.TestContext, options: { renderFrames?: boolean; completeOriginal?: boolean; entrypointOriginal?: boolean; onHost?: (input: HostInput, host: any) => Promise<void>; unknownAuthor?: boolean; failContinuationPlay?: boolean; interruptRole?: 'design' | 'art' | 'coding'; onContinuedAuthor?: (signal: AbortSignal) => Promise<void> } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-public-window-')); t.after(() => rm(root, { recursive: true, force: true }));
  const time = Date.now() - (options.completeOriginal || options.entrypointOriginal ? 0 : 13 * 60 * 60 * 1000), now = () => time;
  const draft = withHostStages({ brief: '点击原创星星获胜', questions: [{ id: 'goal', prompt: '目标？' }], answers: { goal: '点击星星显示胜利' }, unsupported: [],
    acceptance: [{ acceptanceId: 'win', description: '点击获胜', steps: ['点击星星'], expected: '胜利', evidenceKinds: ['test_report'] }],
    scenario: { viewport: { width: 1280, height: 720 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#star', timeoutMs: 1000 },
      { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] } });
  const renderFrames = options.renderFrames ? await selectRenderFrames() : undefined;
  const intake = await IntakeController.create({ root, runId: 'public-game', ledgerId: 'public-ledger', specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 2,
    ...(renderFrames ? { renderFrames } : {}),
    allocations: [{ taskId: 'intake', amountMicroCny: 10_000_000 }, { taskId: 'planning', amountMicroCny: 10_000_000 }], now });
  if (renderFrames) await writeFile(join(root, 'intake-origin.json'), JSON.stringify({ runId: 'public-game', brief: draft.brief, renderFrames }), { encoding: 'utf8', flag: 'wx' });
  const saved = await intake.saveDraft(draft), requirement = await intake.confirm({ revision: saved.revision, confirmed: true, actorId: 'offline-user', at: new Date(time).toISOString() });
  await intake.activateGeneration({ environmentReady: true, executionReady: true }); await intake.close();
  await mkdir(join(root, 'toolchain')); for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await writeFile(join(root, 'toolchain', name), name.endsWith('.ts') ? 'export default {}' : '{}', 'utf8');
  const calls: string[] = []; let sequence = 0; const interrupted = new AbortController();
  const createHost = async (input: HostInput) => {
    const continued = !!input.binding;
    const host = await createBrowserHost({ ...input, ...(options.renderFrames ? { renderFrames: true } : {}), io: {
      async build(project) { calls.push('build'); await mkdir(join(project, 'dist')); await cp(join(project, 'public/assets'), join(project, 'dist/assets'), { recursive: true }); await writeFile(join(project, 'dist/index.html'), '<p>offline fixture</p>', 'utf8'); return { passed: true, diagnostics: 'Fake build' }; },
      async play(plan) { calls.push('browser'); const outcome = continued && options.failContinuationPlay ? 'failed' : 'passed'; return { formatVersion: '1.0.0', kind: 'normal_browser_input', plan, outcome, browser: { version: 'fake' }, cleanup: { processExited: true }, errors: [], reportPath: 'fake', files: [], evidence: [],
        steps: plan.steps.map((step: any) => ({ id: step.id, kind: step.kind, acceptanceId: step.acceptanceId, outcome, expected: step.expected ?? 'input', actual: outcome === 'failed' ? 'Offline failure fixture' : step.expected ?? 'input', screenshot: null })) } as any; },
    } });
    host.roleFactory = async role => {
      const billing = createRoleBudget({ controller: role.controller, taskId: role.task.taskId, evidenceDirectory: role.stateDirectory });
      return { actorId: role.role === 'reviewer' ? `reviewer-${role.task.taskId}` : role.task.authorId, contextId: role.role === 'reviewer' ? `review-${role.task.taskId}` : role.task.context.contextId, close: async () => {}, prompt: async () => {
        calls.push(`${role.role}:${role.task.taskId}`); const requestId = `offline-${++sequence}`;
        await billing.beforeRequest({ requestId, modelId: 'deepseek-flash', inputBytes: 10, hasImages: false, maxOutputTokens: 10, estimatedMaxCostMicroCny: 20 });
        if (continued && options.unknownAuthor && role.role === 'coding') {
          await role.controller.markUnknown(requestId, [{ artifactId: requestId, version: 'v1', location: 'snapshot.json#requests' }]);
          throw new Error('Offline lost response fixture');
        }
        await billing.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
        if (continued && role.role === 'coding') await options.onContinuedAuthor?.(role.controller.signal);
        if (role.role === 'cosmos') return { text: JSON.stringify({ tasks: [
          { taskId: 'design-task', policyId: 'game-design', role: 'design', objective: '原创设计', acceptanceIds: [DESIGN_ACCEPTANCE_ID], dependsOn: [] },
          { taskId: 'art-task', policyId: 'game-art', role: 'art', objective: '原创美术', acceptanceIds: [MEDIA_ACCEPTANCE_ID], dependsOn: ['design-task'] },
          { taskId: 'code-task', policyId: 'game-code', role: 'coding', objective: draft.brief, acceptanceIds: ['win'], dependsOn: ['design-task', 'art-task'] },
        ] }) };
        if (role.role === 'reviewer') return { text: JSON.stringify({ verdict: 'approved', findings: [], inputVersions: [...role.task.inputs, ...role.task.artifacts], evidenceIds: role.task.evidence.map(item => item.evidenceId) }) };
        if (role.role === 'design') await writeFile(join(role.workspace, 'authors/design/design.json'), JSON.stringify({ summary: '原创点击游戏', implementationNotes: ['点击目标'], acceptanceMapping: { win: '点击后显示胜利' }, characters: [{ id: 'star', purpose: '目标', states: ['idle'] }], audio: [] }), 'utf8');
        if (role.role === 'art') await writeFile(join(role.workspace, 'authors/art/media.json'), JSON.stringify({ characters: [{ id: 'star', width: 32, height: 32, anchor: { x: 16, y: 16 }, layers: [{ id: 'body', shape: 'rect', x: 2, y: 2, width: 28, height: 28, fill: '#FFD700', stroke: '#000000', strokeWidth: 0 }], states: [{ name: 'idle', fps: 1, loop: true, frames: [{}] }] }], audio: [] }), 'utf8');
        if (role.role === 'coding') {
          await writeFile(join(role.workspace, 'authors/coding/index.html'), continued || options.completeOriginal ? '<div>fresh offline fixture</div>' : '<div>旧未完成产物</div>', 'utf8');
          if (continued || options.completeOriginal) await writeFile(join(role.workspace, 'authors/coding/src/main.ts'), '// Offline fake provider fixture\n', 'utf8');
        }
        if (!continued && !options.completeOriginal && role.role === (options.interruptRole ?? 'coding')) interrupted.abort();
        return { text: JSON.stringify({ summary: 'Offline scoped output', remaining: [], uncertainty: [] }) };
      } };
    };
    await options.onHost?.(input, host); return host;
  };
  if (options.entrypointOriginal) await executeGeneration({ root, requirement, draft, resume: false, createHost });
  else {
    const controller = await RunController.open({ root, now });
    try {
    const host = await createHost({ root, controller, requirement, draft, resume: false, work: new OwnedWork(controller.signal) });
    const planned = await planTaskDag({ controller, requirement, planningTaskId: 'planning', workspace: root, sessionRoot: join(root, 'sessions'), availableArtifacts: host.availableArtifacts, taskPolicies: host.taskPolicies, roleFactory: host.roleFactory });
    await writeFile(join(root, 'execution.json'), JSON.stringify({ capability: host.capability, requirement, tasks: planned.tasks, availableArtifacts: host.availableArtifacts, plan: planned.plan }), 'utf8');
    const results = await executeTaskDag({ controller, requirement, tasks: planned.tasks, sessionRoot: join(root, 'sessions'), availableArtifacts: host.availableArtifacts,
      roleFactory: host.roleFactory, capture: host.capture, verify: host.verify, reviewImages: host.reviewImages, diagnoseFailure: host.diagnoseFailure,
      reviewProtocolCorrections: 1, now, signal: interrupted.signal, recovery: { journalRoot: join(root, 'journal'), artifactRoot: root, recoverCapture: host.recoverCapture } });
    const cancelled = ['design', 'art', 'coding'].indexOf(options.interruptRole ?? 'coding');
    assert.deepEqual(results.map(task => task.state), results.map((_, index) => options.completeOriginal || index < cancelled ? 'passed' : 'cancelled'));
    if (options.completeOriginal) {
      const final = await host.finish(results); assert.ok(final.acceptedCandidate); assert.deepEqual(final.gaps, []);
      await publishGenerationReport(root, { outcome: 'awaiting_user_experience', runId: 'public-game', ledgerId: 'public-ledger', currentProject: root,
        ...final, effectiveTasks: deliveryTaskProofs(results) }, { capability: host.capability, requirement, unsupported: draft.unsupported });
    } else await controller.stop('Offline original hard stop');
    } finally { await controller.close(); }
  }
  const original = JSON.parse(await readFile(join(root, 'snapshot.json'), 'utf8'));
  let ready = true;
  const host = { prepare: async () => ({ environmentReady: ready, executionReady: ready, reason: 'Offline prerequisite fixture' }), questions: async () => { throw new Error('No new interview'); }, draft: async () => { throw new Error('No new draft'); },
    execute: (options: any) => executeGeneration({ ...options, createHost }) };
  return { root, original, calls, host, createHost, requirement, draft, setReady: (value: boolean) => { ready = value; } };
}
