import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { createRoleFactory } from '../../src/roles/factory.ts';
import type { RoleFactoryOptions, RoleInput, RoleSession } from '../../src/roles/factory.ts';
import type { PiRequest, PiSessionOptions } from '../../src/providers/pi.ts';
import { RunController } from '../../src/runtime/run.ts';
import type { RequirementContract, TaskContract } from '../../src/contracts/index.ts';
import { requirement as requirementFixture, task as taskFixture } from '../contracts/fixtures.ts';

export const request = { requestId: 'offline-selected', modelId: 'deepseek-flash' as const, maxOutputTokens: 32768, inputBytes: 121633, hasImages: false };
export const estimate = (request: Omit<PiRequest, 'estimatedMaxCostMicroCny'>) => request.inputBytes * 2 + request.maxOutputTokens * 8;
export const options: RoleFactoryOptions = { maxOutputTokens: 8192, authorMaxOutputTokens: { design: 32768 }, authorBudgetOutputFloor: { design: 8192 },
  maxRequests: 32, requestTimeoutMs: 120000, estimatedMaxCostMicroCny: estimate, env: { DEEPSEEK_API_KEY: 'offline-cos124' } };

export async function authorBudgetFixture(t: TestContext, allocation = 675000) {
  const root = await mkdtemp(join(tmpdir(), 'cos124-'));
  const requirement = requirementFixture() as RequirementContract, task = taskFixture() as TaskContract;
  const controller = await RunController.create({ root: join(root, 'run'), runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation',
    specVersion: requirement.specVersion, scope: 'generation', limitMicroCny: allocation, allocations: [{ taskId: task.taskId, amountMicroCny: allocation }] });
  task.budget = { ...task.budget, allocationMicroCny: allocation, originalDeadlineAt: (await controller.read()).run.originalDeadlineAt };
  task.context.tools = ['read', 'write', 'edit'];
  const input: RoleInput = { role: 'design', task, requirement, controller, workspace: root, stateDirectory: join(root, 'session') };
  const sessions: RoleSession[] = [], configs: PiSessionOptions[] = [];
  const sessionFactory = async (config: PiSessionOptions) => { configs.push(config); return { prompt: async () => ({ text: '' }), close: async () => {} }; };
  const create = async (overrides: Partial<RoleFactoryOptions> = {}, roleInput: RoleInput = input) => {
    const session = await createRoleFactory({ ...options, sessionFactory, ...overrides })(roleInput); sessions.push(session); return session;
  };
  const spend = async (amount: number, requestId = 'offline-history') => {
    await controller.reserve({ requestId, taskId: task.taskId, provider: 'deepseek', pricingVersion: 'fixture', estimatedMaxCostMicroCny: amount });
    await controller.admit(requestId);
    await controller.settle(requestId, amount, [{ artifactId: requestId, version: 'v1', location: 'offline-history.json' }]);
  };
  t.after(async () => { for (const session of sessions) await session.close(); await controller.close();
    if (!root.startsWith(join(tmpdir(), 'cos124-'))) throw new Error('Unexpected fixture cleanup root'); await rm(root, { recursive: true, force: true }); });
  return { root, controller, input, configs, create, spend, sessionFactory };
}
