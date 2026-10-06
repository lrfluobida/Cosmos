import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { modularFixture } from './modular-host.test.ts';

test('COS72 actual module A code failure repairs to same module v2 and virgin integration successor', async t => {
  const f = await modularFixture(t, 'COS72-module-a', { newModulePolicy: true });
  assert.ok(f.result.acceptedCandidate, JSON.stringify({ gaps: f.result.gaps, history: f.result.taskHistory, root: f.root }));
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.tasks.find((task: any) => task.taskId === 'module-a-task').state, 'failed');
  assert.equal(state.tasks.find((task: any) => task.taskId === 'module-a-task-repair').state, 'passed');
  assert.equal(f.packets.filter(packet => packet.taskId === 'integration-task' && packet.role === 'coding').length, 0);
  assert.equal(f.packets.filter(packet => packet.taskId === 'integration-task-successor' && packet.role === 'coding').length, 1);
  const assembly = JSON.parse(await readFile(join(f.root, f.result.acceptedCandidate.targetRoot, '_cosmos/modular-assembly.json'), 'utf8'));
  assert.deepEqual(assembly.modules.map((module: any) => [module.ref.artifactId, module.ref.version]), [['module-a', 'v2'], ['module-b', 'v1']]);
  assert.equal(state.ledger.limitMicroCny, 200000000); assert.deepEqual(state.ledger.entries, []);
  assert.equal(f.result.acceptedCandidate.candidateRef.version, 'v2');
});
