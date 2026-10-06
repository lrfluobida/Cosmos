import assert from 'node:assert/strict';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { modularFixture } from './modular-host.test.ts';
import { codingInputSignature } from '../../src/runtime/coding-check-worker.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { runCli } from '../../src/cli/index.ts';
import { PassThrough, Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { policyFixture } from '../cli/modular-repair-policy.test.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';

const stream = () => { const output = new PassThrough(); output.resume(); return output; };
async function fixedState(root: string) {
  const state = JSON.parse(await readFile(join(root, 'snapshot.json'), 'utf8'));
  return { state, signature: await codingInputSignature(root, ['snapshot.json', 'execution.json', 'repair-plan.json', 'journal', 'registry', 'delivery']) };
}
test('COS72 constructed fresh and resumed modular hosts install binding before any capture', async t => {
  const f = await policyFixture(t); await f.run('new', '获胜\nconfirm 1\n');
  await mkdir(join(f.root, 'toolchain'));
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await cp(fileURLToPath(new URL(`../../templates/2d/${name}`, import.meta.url)), join(f.root, 'toolchain', name));
  const controller = await RunController.open({ root: f.root }), work = new OwnedWork(controller.signal); let calls = 0;
  try {
    for (const resume of [false, true]) {
      const host = await createBrowserHost({ root: f.root, controller, work, requirement: f.calls[0].requirement, draft: f.calls[0].draft, resume,
        sessionFactory: async () => { calls++; throw new Error('No role should run'); } });
      assert.equal(typeof host.bindPreparedTasks, 'function');
    }
    assert.equal(calls, 0);
  } finally { await work.cancelAndDrain('Constructor fixture cleanup'); await controller.close(); }
});

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
test('COS72 unfinished module B group recovers exact refs and completed calls remain readonly', async t => {
  const f = await modularFixture(t, 'COS72-module-b', { newModulePolicy: true, pauseRepair: true });
  assert.equal(f.result.acceptedCandidate, undefined);
  const before = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), original = JSON.parse(await readFile(join(f.root, 'repair-plan.json'), 'utf8'));
  assert.equal(before.tasks.find((task: any) => task.taskId === 'module-b-task-repair').attempts.length, 0);
  const counts = f.packets.filter(packet => ['design-task', 'art-task', 'module-a-task', 'module-b-task'].includes(packet.taskId)).length;
  const result: any = await f.host.execute({ root: f.root, requirement: f.requirement, draft: f.draft, resume: true });
  assert.ok(result.acceptedCandidate, JSON.stringify({ gaps: result.gaps, root: f.root }));
  assert.equal(f.packets.filter(packet => ['design-task', 'art-task', 'module-a-task', 'module-b-task'].includes(packet.taskId)).length, counts);
  const after = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(after.run.originalStartedAt, before.run.originalStartedAt); assert.equal(after.run.originalDeadlineAt, before.run.originalDeadlineAt);
  assert.deepEqual(after.ledger.allocations, before.ledger.allocations); assert.deepEqual(after.ledger.entries, before.ledger.entries);
  assert.deepEqual(JSON.parse(await readFile(join(f.root, 'repair-plan.json'), 'utf8')), original);
  assert.equal(after.tasks.find((task: any) => task.taskId === 'module-b-task-repair').state, 'passed');
  const assembly = JSON.parse(await readFile(join(f.root, result.acceptedCandidate.targetRoot, '_cosmos/modular-assembly.json'), 'utf8'));
  assert.deepEqual(assembly.modules.map((module: any) => [module.ref.artifactId, module.ref.version]), [['module-a', 'v1'], ['module-b', 'v2']]);
  const fixed = await fixedState(f.root), calls = f.packets.length;
  const completed: any = await executeGeneration({ root: f.root, requirement: f.requirement, draft: f.draft, resume: true, createHost: async () => { throw new Error('Completed host must not dispatch'); } });
  assert.equal(completed.report, result.report);
  await runCli(['status', f.root], { input: Readable.from([]), output: stream() });
  assert.deepEqual(await fixedState(f.root), fixed); assert.equal(f.packets.length, calls);
  t.diagnostic(`Completed group readonly and budget evidence: ${f.root}`);
});
for (const fault of ['badRepair', 'badSuccessor', 'dirtyIntegration'] as const) test(`COS72 ${fault} preserves failed history without a second repair or dirty successor`, async t => {
  const f = await modularFixture(t, 'COS72-module-a', { newModulePolicy: true, [fault]: true });
  assert.equal(f.result.acceptedCandidate, undefined);
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.ok(state.tasks.find((task: any) => task.taskId === 'module-a-task').state === 'failed');
  assert.ok(state.tasks.filter((task: any) => task.taskId.endsWith('-repair')).length <= 1);
  const count = f.packets.filter(packet => packet.role === 'coding' && packet.taskId.endsWith('-repair')).length;
  if (fault === 'badRepair') { assert.equal(count, 1); assert.equal(f.packets.filter(packet => packet.role === 'coding' && packet.taskId.includes('integration')).length, 0); }
  if (fault === 'badSuccessor') {
    assert.equal(count, 1); assert.equal(state.tasks.find((task: any) => task.taskId === 'integration-task-successor').state, 'failed');
    assert.equal(f.packets.filter(packet => packet.role === 'coding' && packet.taskId.includes('integration')).length, 1);
    const old = state.tasks.length, resumed: any = await f.host.execute({ root: f.root, requirement: f.requirement, draft: f.draft, resume: true });
    assert.equal(resumed.acceptedCandidate, undefined); assert.equal(JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')).tasks.length, old);
    assert.equal(f.packets.filter(packet => packet.role === 'coding' && packet.taskId.endsWith('-repair')).length, count);
  }
  if (fault === 'dirtyIntegration') { assert.equal(count, 0); assert.match(f.result.gaps.join('\n'), /prior author writes/); }
  assert.deepEqual(state.ledger.entries, []);
});
