import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import * as transfer from '../../src/runtime/adapters/transfer/runtime-host.ts';
import { humanFixture } from '../transfer/human-preparation.fixture.ts';
import { fakeHumanSdk } from '../transfer/human-preparation.fixture.ts';
import { planTaskDag } from '../../src/roles/planner.ts';

test('human preparation factory preserves confirmed scope and prepares only fixed references before planning', async t => {
  const f = await humanFixture(t), api = transfer as any;
  assert.equal(typeof api.createHumanTransferConsumerHost, 'function', 'human preparation factory is missing');
  const input = await f.input(), host = await api.createHumanTransferConsumerHost(input); t.after(() => host.closePreparation());
  assert.equal(host.taskPolicies.length, 3); assert.equal(host.taskPolicies[0].outputs.length, 4);
  assert.equal((await input.controller.read()).formatVersion, 1);
  await assert.rejects(access(join(f.root, 'host-transfer-prepared-inputs.json')), { code: 'ENOENT' });
  await assert.rejects(access(join(f.root, 'authors/design/transfer-design.json')), { code: 'ENOENT' });
  await assert.rejects(host.bindPreparedTasks([]), /task|role|plan/i);
});

test('human scope rejects changed confirmation bytes before registry or author effects', async t => {
  const f = await humanFixture(t), api = transfer as any;
  assert.equal(typeof api.createHumanTransferConsumerHost, 'function', 'human preparation factory is missing');
  const input = await f.input(), source = join(f.root, f.requirement.sources[1].location);
  const bytes = await readFile(source); await writeFile(source, Buffer.concat([bytes, Buffer.from(' ')]));
  await assert.rejects(api.createHumanTransferConsumerHost(input), /confirmation|source|bytes/i);
  await assert.rejects(access(join(f.root, 'registry')), { code: 'ENOENT' });
});

test('human scope refuses a stopped run or unresolved reservation before preparation effects', async t => {
  for (const action of ['stop', 'reservation']) {
    const f = await humanFixture(t), input = await f.input();
    if (action === 'stop') await input.controller.stop('Synthetic durable stop');
    else await input.controller.reserve({ requestId: 'synthetic-unresolved', taskId: 'planning', provider: 'deepseek', pricingVersion: 'synthetic', estimatedMaxCostMicroCny: 1 });
    const bytes = await readFile(join(f.root, 'snapshot.json'));
    await assert.rejects((transfer as any).createHumanTransferConsumerHost(input), (error: any) => error.code === 'manual' || /scope|stop|reservation|reconcil/i.test(String(error)));
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), bytes); await assert.rejects(access(join(f.root, 'registry')), { code: 'ENOENT' });
  }
});

test('human preparation source receipt drift rejects an owned callback and closes its origin', async t => {
  const f = await humanFixture(t), host = await createHost(); t.after(() => host.closePreparation());
  async function createHost() { return (transfer as any).createHumanTransferConsumerHost(await f.input()); }
  const source = join(f.root, 'host-human-preparation-source.json'), receipt = JSON.parse(await readFile(source, 'utf8'));
  assert.equal(receipt.execution.variant, 'source'); assert.ok(receipt.execution.files.every((file: any) => file.path.endsWith('.ts')));
  assert.ok(receipt.execution.platformLock?.sha256, 'actual fixed dependency lock source is missing');
  assert.equal(receipt.execution.dependencies.find((item: any) => item.name === '@earendil-works/pi-coding-agent').version, '0.99.2');
  receipt.execution.sha256 = '0'.repeat(64); await writeFile(source, JSON.stringify(receipt), 'utf8');
  let entered = false; await assert.rejects(host.withPreparation(async () => { entered = true; }), /source|binding|bytes/i); assert.equal(entered, false);
  const origin = JSON.parse(await readFile(join(f.root, 'host-transfer-origin.json'), 'utf8')); await assert.rejects(fetch(origin.url));
});

test('human task binding refuses a missing captured dependency before author dispatch', async t => {
  const f = await humanFixture(t), input = await f.input(), calls: string[] = [];
  const host = await (transfer as any).createHumanTransferConsumerHost({ ...input, sessionFactory: fakeHumanSdk(calls) }); t.after(() => host.closePreparation());
  const planned = await planTaskDag({ controller: input.controller, requirement: f.requirement, planningTaskId: 'planning', workspace: f.root, sessionRoot: join(f.root, 'sessions'),
    availableArtifacts: host.availableArtifacts, taskPolicies: host.taskPolicies, roleFactory: host.roleFactory });
  planned.tasks[2].task.inputs.pop(); assert.throws(() => host.validateTasks(planned.tasks), /input|dependenc/i);
  assert.deepEqual(calls, ['cosmos:planning']); await assert.rejects(access(join(f.root, 'host-human-preparation-tasks.json')), { code: 'ENOENT' });
});
