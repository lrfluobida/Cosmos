import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTransferCaseSevenCheckpoint } from './validation-case-seven.fixture.ts';
import { bootstrapTransferValidationCaseSevenToolchain, stageTransferValidationCaseSevenInput } from '../../probes/transfer/validation-case-seven-driver.ts';
import { createTransferReusedConsumerHost } from '../../src/runtime/adapters/transfer/runtime-host.ts';
import { prepareTransferValidationCaseSevenExecution } from '../../probes/transfer/validation-case-seven-task.ts';

/** Explicit SOURCE/TEMP integration invocation; it never selects a public runner fixture. */
test('C7 amended closure binds fresh claim, current tools and cold scope without repeating paid or passed stages', async t => {
  assert.ok(process.env.COS60_BINDING_CHECKPOINT_SEED, 'An exact SOURCE/TEMP before14 seed is required.');
  const f = await loadTransferCaseSevenCheckpoint(process.env.COS60_BINDING_CHECKPOINT_SEED!), original = await readFile(join(f.ledgerRoot, 'snapshot.json'));
  const ready: any = await f.entry.preflightTransferValidationCaseSevenRun({ repository: f.repository, args: ['--validation-preflight', f.head] });
  assert.equal(ready.paidRequests, 0); assert.ok(ready.admissionQuote.execution.toolchain.tools.length === 2);
  assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), original);
  let prepares = 0, sdkPrompts = 0; const configs: any[] = [], host = { prepare: async () => { prepares++; }, execute: async () => { throw new Error('This binding representative never runs a generation DAG.'); } };
  const first = await f.entry.startTransferValidationCaseSeven({ repository: f.repository, args: f.args, host }), input = first.input, window = input.window;
  const template = fileURLToPath(new URL('../../templates/2d', import.meta.url));
  const sessionFactory: any = async (config: any) => { configs.push(config); return { close: async () => {}, prompt: async () => { sdkPrompts++; throw new Error('No SDK prompt is permitted in this binding representative.'); } }; };
  let current: Awaited<ReturnType<typeof createTransferReusedConsumerHost>> | undefined;
  try {
    await bootstrapTransferValidationCaseSevenToolchain(input, async (job: any) => {
      await cp(join(input.repository, 'templates/2d'), join(input.root, 'toolchain'), { recursive: true });
      await mkdir(join(input.root, 'toolchain/node_modules'));
      for (const name of ['typescript', 'vite']) await cp(join(template, 'node_modules', name), join(input.root, 'toolchain/node_modules', name), { recursive: true });
      const request = JSON.parse(await readFile(job.args.at(-1), 'utf8')); await writeFile(request.response, JSON.stringify({ formatVersion: 'validation-worker-result-1', operation: 'bootstrap', outcome: 'completed', result: join(input.root, 'toolchain') }), 'utf8');
      return { passed: true, code: 0, stdout: '', stderr: '', diagnostics: 'SOURCE-only fixed worker transport', cleanup: {} } as any;
    });
    const scoped = await stageTransferValidationCaseSevenInput(input, first.historical);
    current = await createTransferReusedConsumerHost({ root: input.root, controller: input.controller, requirement: scoped.requirement, proposal: scoped.proposal, validation: scoped.binding,
      work: input.work, resume: false, historicalStages: first.historical, sessionFactory, io: { build: async () => { throw new Error('No build is requested.'); }, play: async () => { throw new Error('No browser is requested.'); } } });
    const execution = await prepareTransferValidationCaseSevenExecution({ state: await input.controller.read(), window, requirement: scoped.requirement, host: current,
      historical: await first.historical.verify(input.signal), root: input.root, manifestRef: first.historical.manifestRef, capability: current.capability, signal: input.signal }, false);
    const prepared = execution.tasks[0]; await current.bindPreparedTasks([prepared]); await input.controller.registerTasks([prepared.task]);
    const task = structuredClone(prepared.task); task.state = 'ready'; await input.controller.saveTask(task, { role: 'system', actorId: 'SOURCE-binding' }); await current.preAuthor!(task, input.signal);
    task.state = 'running'; const attemptId = randomUUID(); task.attempts = [{ attemptId, sessionRef: join(input.root, 'sessions', attemptId), startedAt: new Date().toISOString(), endedAt: null, outcome: 'running', failure: null }];
    await input.controller.saveTask(task, { role: 'system', actorId: 'SOURCE-binding' });
    const session = await current.roleFactory({ role: 'coding', task, controller: input.controller, requirement: scoped.requirement, workspace: prepared.workspace, stateDirectory: join(task.attempts[0].sessionRef, 'author') });
    const tool = configs[0].tools.find((item: any) => item.name === 'check-game-build'); assert.ok(tool);
    const leaf = join(input.root, 'toolchain/node_modules/typescript/lib/_tsc.js'), bytes = await readFile(leaf), before = await input.controller.read();
    await writeFile(leaf, Buffer.concat([bytes, Buffer.from('\n/* SOURCE tool mutation */\n')]));
    await assert.rejects(tool.execute('SOURCE-mutation', {}, input.signal, undefined, undefined), /toolchain|closure|bytes/);
    assert.deepEqual(await input.controller.read(), before); assert.equal(sdkPrompts, 0); await writeFile(leaf, bytes);
    await scoped.binding.readScope(input.signal); await session.close();
    await current.closePreparation(); current = undefined; await input.work.cancelAndDrain('SOURCE current owner closed for cold binding'); await input.controller.close();
    const beforeCold = await readFile(join(f.ledgerRoot, 'snapshot.json')), receipt = await readFile(join(input.root, 'execution-reused.json')), receiptInfo = await stat(join(input.root, 'execution-reused.json'));
    const cold = await f.entry.startTransferValidationCaseSeven({ repository: f.repository, args: f.args, host }, true);
    try {
      assert.equal(cold.input.window.windowId, window.windowId); assert.equal(cold.input.window.deadlineAt, window.deadlineAt); assert.equal(prepares, 1);
      const coldScope = await stageTransferValidationCaseSevenInput(cold.input, cold.historical, true); await coldScope.binding.readScope(cold.input.signal);
      const vite = join(input.root, 'toolchain/node_modules/vite/dist/node/cli.js'), viteBytes = await readFile(vite);
      await writeFile(vite, Buffer.concat([viteBytes, Buffer.from('\n/* SOURCE cold tool mutation */\n')]));
      await assert.rejects(coldScope.binding.readScope(cold.input.signal), /toolchain|closure|bytes/); await writeFile(vite, viteBytes);
      await coldScope.binding.readScope(cold.input.signal); assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), beforeCold);
      assert.deepEqual(await readFile(join(input.root, 'execution-reused.json')), receipt); assert.equal((await stat(join(input.root, 'execution-reused.json'))).mtimeMs, receiptInfo.mtimeMs);
      await cold.input.controller.stop('SOURCE-only amended binding representative completed; no generation result claimed.');
    } finally { await cold.input.work.cancelAndDrain('SOURCE cold binding complete'); await cold.input.controller.close(); }
    assert.equal(sdkPrompts, 0); t.diagnostic(`SOURCE/TEMP amended claim/current/cold/tool proof retained at ${f.repository}; reused991mechanism separately.`);
  } finally { await current?.closePreparation().catch(() => {}); await input.work.cancelAndDrain('SOURCE binding cleanup').catch(() => {}); await input.controller.close().catch(() => {}); }
});
