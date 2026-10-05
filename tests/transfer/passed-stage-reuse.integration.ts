import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { passedStageFixture, successorFixture } from './passed-stage-reuse.fixture.ts';

test('compiled production inherited host supplies current file inventories and real same-author tsc/Vite feedback', async t => {
  const api: any = await import('../../dist/runtime/adapters/transfer/runtime-host.js').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
  assert.equal(typeof api.createTransferReusedConsumerHost, 'function', 'compiled historical consumer is missing');
  const { createHistoricalPassedStages } = await import('../../dist/runtime/historical-passed-stages.js');
  const templateRoot = fileURLToPath(new URL('../../templates/2d', import.meta.url));
  const f = await passedStageFixture(t, templateRoot), current = await successorFixture(t, f), historicalStages = createHistoricalPassedStages(f.input);
  await cp(join(templateRoot, 'node_modules'), join(f.targetRoot, 'toolchain/node_modules'), { recursive: true });
  const host = await api.createTransferReusedConsumerHost({ ...current.input, historicalStages }); f.onCleanup(() => host.closePreparation());
  const policy = host.taskPolicies[0], task = structuredClone(f.tasks[2].task);
  Object.assign(task, { taskId: current.window.quote.declaration.grants.coding.taskId, authorId: 'current-synthetic-author',
    inputs: [...host.availableArtifacts, ...f.result.flatMap(item => item.artifacts)],
    dependsOn: f.result.map(item => ({ taskId: item.taskId, state: 'passed', requiredState: 'passed' })),
    context: { contextId: 'current-synthetic-context', rules: policy.rules, tools: policy.tools, interfaces: [], knownFailures: [] },
    outputs: policy.outputs.map(({ type, schema, destination }: any) => ({ type, schema, destination })), ownership: { writePaths: policy.writePaths, readOnlyPaths: policy.readOnlyPaths } });
  task.budget.allocationMicroCny = policy.allocationMicroCny;
  const prepared = { task, role: 'coding', workspace: policy.workspace,
    expectedArtifacts: policy.outputs.map(({ artifactId, version, destination }: any) => ({ artifactId, version, location: destination })) };
  await host.bindPreparedTasks([prepared]); await current.controller.registerTasks([task]);
  task.state = 'ready'; await current.controller.saveTask(task, { role: 'system', actorId: 'synthetic-runtime' }); await host.preAuthor(task, current.controller.signal);
  const author = join(policy.workspace, 'authors/coding');
  await writeFile(join(author, 'index.html'), '<html><body><p>合成继承编译检查</p><script type="module" src="/src/main.ts"></script></body></html>', 'utf8');
  await writeFile(join(author, 'src/main.ts'), 'const value: number = "编译错误"; export { value };\n', 'utf8');
  const attemptId = randomUUID(); task.state = 'running'; task.attempts = [{ attemptId, sessionRef: join(f.targetRoot, `sessions/${attemptId}`), startedAt: new Date().toISOString(), endedAt: null, outcome: 'running', failure: null }];
  await current.controller.saveTask(task, { role: 'system', actorId: 'synthetic-runtime' });
  const session = await host.roleFactory({ role: 'coding', task, controller: current.controller, requirement: current.requirement,
    workspace: policy.workspace, stateDirectory: join(f.targetRoot, `sessions/${attemptId}/author`) }); f.onCleanup(() => session.close());
  const config = f.configs.at(-1)!, packet = JSON.parse(config.context), tool = config.tools.find(item => item.name === 'check-game-build')!;
  assert.ok(tool, 'compiled production guard must resolve inherited design/art IDs');
  assert.equal(packet.taskId, task.taskId); assert.equal(packet.role, 'coding');
  assert.equal(packet.inputFiles.filter((ref: any) => ref.files.includes('_cosmos/transfer-plan.json')).length, 4);
  assert.ok(packet.inputFiles.some((ref: any) => ref.artifactId === f.result[1].artifacts[0].artifactId && ref.files.includes('public/assets/manifest.json')));
  assert.ok(packet.inputFiles.some((ref: any) => ref.files.includes('_cosmos/current-execution-requirement.json')));
  const before = await current.controller.read(), calls = f.calls.length;
  const call = async () => JSON.parse((await (tool.execute as any)('current-synthetic-build', {}, undefined, undefined, undefined)).content[0].text);
  const first = await call(); assert.equal(first.passed, false); assert.match(first.diagnostics, /TS\d+/);
  await writeFile(join(author, 'src/main.ts'), 'const value: number = 1; export { value };\n', 'utf8');
  const second = await call(); assert.equal(second.passed, true); assert.equal(second.results.length, 2); assert.notEqual(first.work, second.work);
  for (const report of [first, second]) {
    const path = resolve(report.work); assert.ok(path.startsWith(resolve(tmpdir()) + sep));
    f.onCleanup(() => rm(path, { recursive: true, force: true }));
    for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) assert.deepEqual(await readFile(join(path, name)), await readFile(join(f.root, f.manifest.captures[0].ref.location, name)));
  }
  assert.deepEqual(await current.controller.read(), before); assert.equal(f.calls.length, calls);
  assert.equal(f.configs.filter(config => JSON.parse(config.context).taskId === task.taskId).length, 1);
  assert.equal((await current.controller.read()).validation!.cases.at(-1)!.repair, null);
  const old = f.result[0].artifacts[0], original = await readFile(join(f.targetRoot, old.location, '_cosmos/design.json'));
  await writeFile(join(f.targetRoot, old.location, '_cosmos/design.json'), '{}\n', 'utf8'); await assert.rejects(call(), /changed|bytes|signature|capture/i);
  await writeFile(join(f.targetRoot, old.location, '_cosmos/design.json'), original);
  await current.controller.stop('Synthetic current stop'); await assert.rejects(call(), /stop|cancel/i);
});
