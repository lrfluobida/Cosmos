import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRoleFactory } from '../../src/roles/factory.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';
import { RunController } from '../../src/runtime/run.ts';
import type { RequirementContract, TaskContract } from '../../src/contracts/index.ts';
import { requirement as requirementFixture, task as taskFixture } from '../contracts/fixtures.ts';
import { validationBrowserFixture } from '../runtime/entrypoint-host-validation.fixture.ts';

test('author thinking overrides retain global fallback and exclude planning and review', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos113-thinking-'));
  const requirement = requirementFixture() as RequirementContract, task = taskFixture() as TaskContract;
  const controller = await RunController.create({ root: join(root, 'run'), runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation',
    specVersion: requirement.specVersion, scope: 'validation', limitMicroCny: 10000, allocations: [{ taskId: task.taskId, amountMicroCny: 10000 }] });
  task.budget = { ...task.budget, allocationMicroCny: 10000, originalDeadlineAt: (await controller.read()).run.originalDeadlineAt };
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  let seen!: PiSessionOptions;
  for (const thinkingLevel of [undefined, 'high'] as const) {
    const options = { maxOutputTokens: 8192, maxRequests: 16, requestTimeoutMs: 120000, estimatedMaxCostMicroCny: 100,
      thinkingLevel, authorThinkingLevel: { design: 'off' as const, cosmos: 'max' as const },
      sessionFactory: async (config: PiSessionOptions) => { seen = config; return { prompt: async () => ({ text: 'Complete' }), close: async () => {} }; } };
    const factory = createRoleFactory(options);
    for (const [role, purpose, expected] of [['design', undefined, 'off'], ['art', undefined, thinkingLevel ?? 'low'], ['coding', undefined, thinkingLevel ?? 'low'],
      ['cosmos', undefined, 'max'], ['cosmos', 'planning', thinkingLevel ?? 'low'], ['design', 'planning', thinkingLevel ?? 'low'], ['reviewer', undefined, thinkingLevel ?? 'low']] as const) {
      const session = await factory({ role, purpose, task, requirement, controller, workspace: root, stateDirectory: join(root, 'session') });
      await session.close(); assert.equal(seen.thinkingLevel, expected, `${role}/${purpose ?? 'author'}`);
      assert.equal(seen.maxOutputTokens, 8192); assert.equal(seen.maxRequests, 16); assert.equal(seen.requestTimeoutMs, 120000);
      assert.deepEqual(await seen.requestWindow!(), { deadlineAt: Date.parse(task.budget.originalDeadlineAt), cleanupMs: 5000 });
    }
  }
});

test('invalid author thinking roles and values fail before session construction', () => {
  const base = { maxOutputTokens: 8192, maxRequests: 16, requestTimeoutMs: 120000, estimatedMaxCostMicroCny: 100 };
  for (const authorThinkingLevel of [{ reviewer: 'off' }, { planning: 'off' }, { design: 'medium' }, { design: '' }, { design: undefined }, { design: null }, { design: 0 }]) {
    assert.throws(() => createRoleFactory({ ...base, authorThinkingLevel } as any), /authorThinkingLevel/);
  }
});

test('fixed validation ignores author thinking overrides and retains original global configuration', async t => {
  const f = await validationBrowserFixture(t), host = await f.create(), prepared = f.prepare(host);
  host.validateTasks!(prepared); await f.controller.registerTasks(prepared.map(item => item.task));
  await host.preAuthor!(prepared[0].task, f.controller.signal);
  const task = structuredClone(prepared[0].task); task.state = 'ready'; await f.controller.saveTask(task, { role: 'system', actorId: 'runtime' });
  task.state = 'running'; task.attempts = [{ attemptId: 'thinking-attempt', sessionRef: join(f.root, 'sessions/thinking-attempt'), startedAt: new Date().toISOString(), endedAt: null, outcome: 'running', failure: null }];
  await f.controller.saveTask(task, { role: 'system', actorId: 'runtime' });
  let seen!: PiSessionOptions;
  for (const thinkingLevel of [undefined, 'high'] as const) {
    const options = { maxOutputTokens: 8192, maxRequests: 16, requestTimeoutMs: 120000, estimatedMaxCostMicroCny: 100,
      thinkingLevel, authorThinkingLevel: { design: 'off' as const },
      sessionFactory: async (config: PiSessionOptions) => { seen = config; return { prompt: async () => ({ text: 'Complete' }), close: async () => {} }; } };
    const session = await createRoleFactory(options)({ role: 'design', task, requirement: f.requirement, validation: f.validation,
      controller: f.controller, workspace: prepared[0].workspace, stateDirectory: join(f.root, 'sessions/thinking-attempt/author') });
    await session.close(); assert.equal(seen.thinkingLevel, thinkingLevel ?? 'low');
    assert.equal(seen.maxOutputTokens, (await f.controller.validationAuthority(task.taskId, 'author')).maxOutputTokens);
  }
});
