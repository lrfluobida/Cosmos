import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { IntakeController } from '../../src/runtime/intake.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { createHumanTransferConsumerHost } from '../../src/runtime/adapters/transfer/runtime-host.ts';
import { withHostStages } from '../../src/roles/requirements.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import { humanFixture } from '../transfer/human-preparation.fixture.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';

for (const preparation of [false, true]) test(`${preparation ? 'preparation' : 'legacy ordinary'} host retains low thinking for planning and design`, async t => {
  const input = await (async () => {
    if (preparation) return (await humanFixture(t)).input();
    const root = await mkdtemp(join(tmpdir(), 'cos113-legacy-'));
    const intake = await IntakeController.create({ root, runId: 'game', ledgerId: 'budget', specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 2,
      allocations: [{ taskId: 'intake', amountMicroCny: 100 }, { taskId: 'planning', amountMicroCny: 100 }] });
    const draft = withHostStages({ brief: '点击目标', questions: [{ id: 'goal', prompt: '目标？' }], answers: { goal: '完成' }, unsupported: [],
      acceptance: [{ acceptanceId: 'done', description: '点击完成', steps: ['点击'], expected: '完成', evidenceKinds: ['test_report'] }],
      scenario: { viewport: { width: 1280, height: 720 }, steps: [{ id: 'click', kind: 'locator-click' as const, selector: '#target', timeoutMs: 1000 },
        { id: 'done', kind: 'assert' as const, acceptanceId: 'done', observation: { kind: 'text' as const, selector: '#status' }, expected: '完成', timeoutMs: 1000 }] } });
    const saved = await intake.saveDraft(draft), requirement = await intake.confirm({ revision: saved.revision, confirmed: true, actorId: 'user', at: new Date().toISOString() });
    await intake.activateGeneration({ environmentReady: true, executionReady: true }); await intake.close();
    const controller = await RunController.open({ root });
    t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
    await mkdir(join(root, 'toolchain'));
    for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await writeFile(join(root, 'toolchain', file), file.endsWith('.ts') ? 'export default {}' : '{}', 'utf8');
    return { root, controller, requirement, draft, resume: false, work: new OwnedWork(controller.signal) };
  })();
  const configs: PiSessionOptions[] = [];
  const sessionFactory = async (config: PiSessionOptions) => {
    configs.push(config);
    return { close: async () => {}, prompt: async () => ({ text: JSON.stringify({ tasks: [
      { taskId: 'design', policyId: 'game-design', role: 'design', objective: '设计', acceptanceIds: ['COSMOS-DESIGN'], dependsOn: [] },
      { taskId: 'art', policyId: 'game-art', role: 'art', objective: '素材', acceptanceIds: ['COSMOS-MEDIA'], dependsOn: ['design'] },
      { taskId: 'coding', policyId: 'game-code', role: 'coding', objective: '编码', acceptanceIds: input.requirement.acceptance.filter(item => !item.acceptanceId.startsWith('COSMOS-')).map(item => item.acceptanceId), dependsOn: ['design', 'art'] },
    ] }) }) };
  };
  const options = { ...input, sessionFactory };
  const host = input.draft.preparation ? await createHumanTransferConsumerHost({ ...options, draft: input.draft }) : await createBrowserHost(options);
  if ('closePreparation' in host) t.after(() => host.closePreparation?.());
  const plan = await planTaskDag({ controller: input.controller, requirement: input.requirement, planningTaskId: 'planning', workspace: input.root,
    sessionRoot: join(input.root, 'sessions'), availableArtifacts: host.availableArtifacts, taskPolicies: host.taskPolicies, roleFactory: host.roleFactory });
  host.validateTasks!(plan.tasks);
  await writeFile(join(input.root, 'execution.json'), JSON.stringify({ capability: host.capability, requirement: input.requirement, tasks: plan.tasks, availableArtifacts: host.availableArtifacts, plan: plan.plan }), 'utf8');
  await host.bindPreparedTasks?.(plan.tasks); await input.controller.registerTasks(plan.tasks.map(item => item.task));
  const task = structuredClone(plan.tasks[0].task); await host.preAuthor?.(task, input.controller.signal);
  task.state = 'ready'; await input.controller.saveTask(task, { role: 'system', actorId: 'runtime' });
  task.state = 'running'; task.attempts = [{ attemptId: 'compat-author', sessionRef: join(input.root, 'sessions/compat-author'), startedAt: new Date().toISOString(), endedAt: null, outcome: 'running', failure: null }];
  await input.controller.saveTask(task, { role: 'system', actorId: 'runtime' });
  const author = await host.roleFactory({ role: 'design', task, requirement: input.requirement, controller: input.controller, workspace: plan.tasks[0].workspace, stateDirectory: join(input.root, 'sessions/compat-author') });
  await author.close(); assert.equal(configs.length, 2);
  for (const config of configs) {
    assert.equal(config.thinkingLevel, 'low'); assert.equal(config.maxOutputTokens, 8192);
    assert.equal(config.maxRequests, 16); assert.equal(config.requestTimeoutMs, 120000);
    assert.doesNotMatch(JSON.parse(config.context).rules.join('\n'), /Then write authors\/design\/acceptance-plan\.json/);
  }
});
