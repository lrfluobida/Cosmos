import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import { requirement as fixture } from '../contracts/fixtures.ts';
import type { RequirementContract } from '../../src/contracts/index.ts';

for (const mode of ['valid', 'duplicate-slot', 'authority', 'wrong-role', 'over-budget'] as const) test(`host slots allow repeated roles with bounded authority: ${mode}`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-slots-'));
  const requirement = fixture() as RequirementContract;
  const controller = await RunController.create({ root: join(root, 'run'), runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation', specVersion: requirement.specVersion, scope: 'validation', limitMicroCny: 1000, allocations: [{ taskId: 'planning', amountMicroCny: 100 }] });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  const taskPolicies = ['one', 'two'].map(policyId => ({ policyId, role: 'coding' as const, workspace: root, allocationMicroCny: mode === 'over-budget' ? 500 : 300, writePaths: [`game/${policyId}`], readOnlyPaths: ['requirements'], tools: ['read', 'write'], outputs: [{ artifactId: policyId, version: 'v1', destination: `artifacts/${policyId}/v1`, type: 'source', schema: 'source/1' }] }));
  const drafts = taskPolicies.map((p, i) => ({ taskId: `code-${p.policyId}`, policyId: mode === 'duplicate-slot' ? 'one' : p.policyId, role: mode === 'wrong-role' ? 'art' : p.role, objective: `Generate ${p.policyId}`, acceptanceIds: ['AC-1'], dependsOn: i ? ['code-one'] : [], ...(mode === 'authority' ? { allocationMicroCny: 999 } : {}) }));
  const action = planTaskDag({ controller, requirement, planningTaskId: 'planning', workspace: root, sessionRoot: join(root, 'sessions'), availableArtifacts: requirement.sources, taskPolicies,
    roleFactory: async () => ({ actorId: 'planner', contextId: 'planner', prompt: async () => ({ text: JSON.stringify({ tasks: drafts }) }), close: async () => {} }) });
  if (mode !== 'valid') { await assert.rejects(action, mode === 'over-budget' ? /Plan exceeds unallocated shared budget\./ : /policy|slot|draft|budget|unique/i); return; }
  const result = await action;
  assert.deepEqual(result.tasks.map(p => p.role), ['coding', 'coding']);
  assert.deepEqual(result.tasks.map(p => p.task.ownership.writePaths), [['game/one'], ['game/two']]);
  assert.deepEqual(result.tasks.map(p => p.task.budget.allocationMicroCny), [300, 300]);
  assert.deepEqual(result.tasks[1].task.inputs.at(-1), result.tasks[0].expectedArtifacts![0]);
  assert.equal((await controller.read()).ledger.allocations.length, 1);
});
