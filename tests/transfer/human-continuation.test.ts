import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PassThrough, Readable } from 'node:stream';
import { join } from 'node:path';
import test from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { RunController } from '../../src/runtime/run.ts';
import { loadContinuationPlan, prepareContinuationPlan } from '../../src/runtime/continuation-plan.ts';
import { requireContinuationInputs } from '../../src/runtime/continuation-inputs.ts';
import { reserveTransferOrigin } from '../../src/runtime/adapters/transfer/loopback-origin.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { createHumanTransferContinuationHost } from '../../src/runtime/adapters/transfer/runtime-host.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { fakePublicSdk, installHumanTools, humanPersistentReports } from './human-preparation.fixture.ts';
import { createHumanPreparedContinuationHost } from '../../src/runtime/entrypoint-host.ts';
import { humanContinuationFixture, continuationStreams } from './human-continuation.fixture.ts';

const args = (root: string, quote = false) => ['continue', root, ...(quote ? ['--quote'] : []), '--add-cny', '1', '--add-minutes', '10'];

test('preparation coding quote authenticates two passed stages without activation or billing', async t => {
  const f = await humanContinuationFixture(t), calls = [...f.calls], before = await readFile(join(f.root, 'snapshot.json'));
  const quote: any = await runCli(args(f.root, true), { host: f.host, ...continuationStreams() });
  assert.equal(quote.proposed.targets.length, 1); assert.equal(quote.proposed.targets[0].sourceTaskId, 'actual-code-58');
  assert.ok(quote.auxiliarySources.some((source: any) => source.path === 'host-human-preparation-source.json'));
  assert.deepEqual(f.calls, calls); assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before); await f.requirePreserved();
});

test('first human coding window seals two audit plans and cold resume reuses passed stages', async t => {
  const f = await humanContinuationFixture(t), calls = [...f.calls]; f.continue();
  const result: any = await runCli(args(f.root), { host: f.host, ...continuationStreams(id => `confirm ${id}\n`) });
  assert.equal(result.outcome, 'awaiting_user_experience', JSON.stringify(result.gaps));
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), window = state.continuation.windows[0];
  const plan = JSON.parse(await readFile(join(f.root, `continuations/${window.decisionId}/plan.json`), 'utf8'));
  const current = plan.preparation;
  assert.equal(current.candidate.version, window.windowId); assert.equal(current.taskId, window.grants[0].taskId);
  assert.equal(current.plans.length, 2); assert.deepEqual(current.primaryPlan, current.plans[0]);
  const coding = plan.tasks.find((item: any) => item.role === 'coding');
  assert.ok(current.plans.every((ref: any) => coding.task.context.interfaces.some((actual: any) => JSON.stringify(actual) === JSON.stringify(ref))));
  for (const ref of current.plans) {
    const value = JSON.parse(await readFile(join(f.root, ref.location, '_cosmos/transfer-plan.json'), 'utf8'));
    assert.deepEqual(value.binding.candidate, current.candidate); assert.ok(value.segments.every((segment: any) => segment.plan.taskId === current.taskId));
  }
  assert.equal(f.calls.slice(calls.length).filter(call => call.startsWith('coding:')).length, 1);
  assert.equal(f.calls.slice(calls.length).filter(call => /^(cosmos|design|art):/.test(call)).length, 0);
  assert.deepEqual(state.stopReason, f.original.stopReason); assert.equal(state.run.originalDeadlineAt, f.original.run.originalDeadlineAt);
  assert.equal(result.originalResult.outcome, 'not_met'); await f.requirePreserved();
  const completedCalls = [...f.calls], fees = state.run.fees;
  const resumed: any = await runCli(['resume', f.root, '--window', window.windowId], { host: f.host, ...continuationStreams() });
  assert.equal(resumed.outcome, 'awaiting_user_experience', JSON.stringify(resumed.gaps)); assert.deepEqual(f.calls, completedCalls);
  assert.deepEqual(JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')).run.fees, fees); await f.requirePreserved();
});

test('human preparation plan fixes current interfaces and refuses a wrong plan version mapping', async t => {
  const f = await humanContinuationFixture(t);
  await runCli(args(f.root), { host: { ...f.host, execute: async () => ({ outcome: 'synthetic_interruption_after_activation' }) }, ...continuationStreams(id => `confirm ${id}\n`) });
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), window = state.continuation.windows[0];
  const controller = await RunController.open({ root: f.root, windowId: window.windowId });
  try {
    const plan = await loadContinuationPlan({ root: f.root, controller, requirement: f.requirement, windowId: window.windowId });
    assert.ok((plan as any).preparation, 'preparation descriptor must be sealed before author context');
    const coding = plan.tasks.find(item => item.role === 'coding')!;
    assert.deepEqual(coding.task.context.interfaces.slice(-2), (plan as any).preparation.plans);
    await requireContinuationInputs(await controller.read(), plan.tasks, f.root);
    const changed = structuredClone(plan.tasks), current = changed.find(item => item.role === 'coding')!;
    current.task.context.interfaces.at(-1)!.version = 'wrong-version';
    await assert.rejects(requireContinuationInputs(await controller.read(), changed, f.root), /interface|plan|preparation/i);
  } finally { await controller.close(); }
});

test('fresh public preparation quote loads the actual source dependencies without a running host', async t => {
  const f = await humanContinuationFixture(t), before = await readFile(join(f.root, 'snapshot.json'));
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const result = spawnSync(process.execPath, ['--experimental-strip-types', join(repository, 'src/cli/index.ts'), ...args(f.root, true)], { cwd: repository, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).proposed.targets.length, 1);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before); await f.requirePreserved();
});

test('current human origin refuses the original receipt path before creating a listener', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos61-origin-')); let created: Awaited<ReturnType<typeof reserveTransferOrigin>> | undefined;
  t.after(async () => { await created?.close(); await rm(root, { recursive: true, force: true }); });
  await assert.rejects(reserveTransferOrigin({ root, resume: false, signal: new AbortController().signal, requireScope: async () => {},
    binding: { profile: 'human', runId: 'synthetic', ledgerId: 'synthetic-budget', windowId: 'synthetic-window', decisionId: 'synthetic-decision', taskId: 'synthetic-code',
      sourceVersion: 'a'.repeat(40), sourceSha256: 'b'.repeat(64), requirementSha256: 'c'.repeat(64), specVersion: '1.0' } }).then(value => { created = value; return value; }), /window|path|origin/i);
  await assert.rejects(readFile(join(root, 'host-transfer-origin.json')), { code: 'ENOENT' });
});

test('human preparation quote refuses a missing or browser mode without falling back to generic generation', async t => {
  const f = await humanContinuationFixture(t), modePath = join(f.root, 'intake-mode.json'), originalMode = await readFile(modePath), before = await readFile(join(f.root, 'snapshot.json'));
  const parsed = JSON.parse(originalMode.toString('utf8'));
  for (const mode of ['missing', 'browser'] as const) {
    if (mode === 'missing') await rm(modePath); else await writeFile(modePath, JSON.stringify({ runId: parsed.runId, createdAt: parsed.createdAt }), 'utf8');
    await assert.rejects(runCli(args(f.root, true), { host: f.host, ...continuationStreams() }), /mode|preparation|准备/i);
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before); await f.requirePreserved();
    await writeFile(modePath, originalMode);
  }
});

test('active human window stop awaits preparation close before the public ACK', async t => {
  const f = await humanContinuationFixture(t); f.continue();
  let entered!: () => void, closeEntered!: () => void, releaseClose!: () => void, ack = false;
  const authorEntered = new Promise<void>(resolve => { entered = resolve; }), closing = new Promise<void>(resolve => { closeEntered = resolve; });
  const gate = new Promise<void>(resolve => { releaseClose = resolve; });
  const sessionFactory = async (config: any) => ({ async close() {}, async prompt(_text: string, options: any) {
    entered(); return new Promise<never>((_resolve, reject) => { options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }); });
  } });
  const host = { ...f.host, execute: (options: any) => executeGeneration({ ...options, createHost: async (input: any) => {
    const prepared = await createHumanTransferContinuationHost({ ...input, io: f.io, sessionFactory });
    const actualClose = prepared.closePreparation.bind(prepared); let close: Promise<void> | undefined;
    prepared.closePreparation = () => close ??= (async () => { closeEntered(); await gate; await actualClose(); })();
    return prepared;
  } }) };
  const active = runCli(args(f.root), { host, ...continuationStreams(id => `confirm ${id}\n`) });
  let stopping: Promise<unknown> | undefined;
  t.after(async () => { releaseClose(); await Promise.allSettled([active, ...(stopping ? [stopping] : [])]); });
  await authorEntered;
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), window = state.continuation.windows[0];
  stopping = runCli(['stop', f.root, '--window', window.windowId], continuationStreams()).then(result => { ack = true; return result; });
  await Promise.race([closing, stopping.then(() => { throw new Error('Public stop ACK arrived before preparation close was awaited'); })]);
  assert.equal(ack, false); releaseClose(); await stopping; await active;
  const stopped = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(stopped.continuation.windows[0].stopReason.code, 'manual'); assert.deepEqual(stopped.stopReason, f.original.stopReason);
});

test('registered human window refuses a lost current origin without manufacturing a replacement', async t => {
  const f = await humanContinuationFixture(t);
  await runCli(args(f.root), { host: { ...f.host, execute: async () => ({ outcome: 'synthetic_after_activation' }) }, ...continuationStreams(id => `confirm ${id}\n`) });
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), window = state.continuation.windows[0];
  const controller = await RunController.open({ root: f.root, windowId: window.windowId }), work = new OwnedWork(controller.signal);
  const plan = await loadContinuationPlan({ root: f.root, controller, requirement: f.requirement, windowId: window.windowId });
  const input: any = { root: f.root, controller, requirement: f.requirement, draft: f.draft, resume: true, work,
    binding: { windowId: window.windowId, tasks: plan.tasks, preparation: plan.preparation }, io: f.io, sessionFactory: f.sessionFactory };
  const host = await createHumanTransferContinuationHost(input);
  try { await host.bindPreparedTasks(plan.tasks); await prepareContinuationPlan({ root: f.root, controller, requirement: f.requirement, windowId: window.windowId, plan, recoverCapture: host.recoverCapture! }); }
  finally { await host.closePreparation(); }
  const path = join(f.root, `continuations/${window.decisionId}/transfer-origin.json`); await rm(path);
  const before = await readFile(join(f.root, 'snapshot.json')), calls = [...f.calls];
  try {
    await assert.rejects(createHumanTransferContinuationHost(input));
    await assert.rejects(readFile(path), { code: 'ENOENT' });
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before); assert.deepEqual(f.calls, calls); await f.requirePreserved();
  } finally { await controller.closeAfterDrain(work); }
});

test('registered original coding repair maps its v2 lineage to the sole current primary plan', async t => {
  const f = await humanContinuationFixture(t, { registeredRepair: true });
  const quote: any = await runCli(args(f.root, true), { host: f.host, ...continuationStreams() });
  assert.equal(quote.proposed.targets[0].sourceTaskId, 'actual-code-58-repair');
  await runCli(args(f.root), { host: { ...f.host, execute: async () => ({ outcome: 'synthetic_after_activation' }) }, ...continuationStreams(id => `confirm ${id}\n`) });
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), window = state.continuation.windows[0];
  const controller = await RunController.open({ root: f.root, windowId: window.windowId });
  try {
    const plan = await loadContinuationPlan({ root: f.root, controller, requirement: f.requirement, windowId: window.windowId });
    assert.equal(plan.preparation!.sourceTaskId, 'actual-code-58-repair'); assert.equal(plan.preparation!.originalPrimaryPlan.artifactId, 'plan-v2');
    assert.deepEqual(plan.preparation!.primaryPlan, plan.preparation!.plans[0]); assert.equal(window.grants.length, 1);
    assert.equal(plan.tasks.find(item => item.role === 'coding')!.expectedArtifacts!.length, 1); await f.requirePreserved();
  } finally { await controller.close(); }
});

test('compiled human coding window uses its actual worker and dependencies then cold resumes without billing', async t => {
  const repository = fileURLToPath(new URL('../../', import.meta.url)), compiled = await mkdtemp(join(tmpdir(), 'cos61-compiled-'));
  t.after(() => rm(compiled, { recursive: true, force: true }));
  const build = spawnSync(process.execPath, [join(repository, 'node_modules/typescript/bin/tsc'), '-p', join(repository, 'tsconfig.json'), '--outDir', join(compiled, 'dist')], { cwd: repository, encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, build.stdout + build.stderr);
  for (const file of ['package.json', 'package-lock.json']) await cp(join(repository, file), join(compiled, file));
  await symlink(join(repository, 'node_modules'), join(compiled, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const cli = await import(pathToFileURL(join(compiled, 'dist/cli/index.js')).href), hosts = await import(pathToFileURL(join(compiled, 'dist/runtime/entrypoint-host.js')).href);
  const runs = await import(pathToFileURL(join(compiled, 'dist/runtime/run.js')).href);
  const root = join(compiled, 'run'), calls: string[] = [], toolReports: any[] = [], authors = fakePublicSdk(calls); let continued = false;
  const sessionFactory = async (config: any) => {
    const session = await authors(config), packet = JSON.parse(config.context);
    return { ...session, async prompt(text: string, options: any) {
      const result = await session.prompt(text, options);
      if (packet.role === 'coding' && packet.budget.executionWindow) {
        const tool = config.tools.find((tool: any) => tool.name === 'check-game-build');
        toolReports.push(JSON.parse((await tool.execute('synthetic-current-build', {}, options.signal)).content[0].text));
      }
      return result;
    } };
  };
  const host = hosts.createProductHost(compiled, { sessionFactory, io: {
    async build(project: string, taskId: string) {
      if (!continued) return { passed: false, diagnostics: 'Synthetic original environment gap' };
      await mkdir(join(project, 'dist'), { recursive: true }); await writeFile(join(project, 'dist/index.html'), 'Synthetic compiled ' + taskId, 'utf8'); return { passed: true, diagnostics: '' };
    }, async play() { throw new Error('No generic browser fallback'); },
    async playPersistent(series: any, options: any) { await options.verifyBinding(); return humanPersistentReports(series, options); },
  } });
  host.prepare = async () => {
    if (!continued) { await mkdir(join(root, 'toolchain'), { recursive: true });
      for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await writeFile(join(root, 'toolchain', name), name.endsWith('.ts') ? 'export default {}\n' : '{}\n', 'utf8'); await installHumanTools(root); }
    return { environmentReady: true, executionReady: true };
  };
  const output = new PassThrough(); output.on('data', () => {});
  await cli.runCli(['new', root, '--adapter', 'sokoban', '--brief', '合成中文推箱子'], { host, output, input: Readable.from(['两个箱子\nconfirm 1\n']) });
  const controller = await runs.RunController.open({ root }); await controller.stop('Synthetic original compiled stop'); await controller.close();
  const original = JSON.parse(await readFile(join(root, 'snapshot.json'), 'utf8')), beforeCalls = [...calls]; continued = true;
  const coldQuote = spawnSync(process.execPath, [join(compiled, 'dist/cli/index.js'), ...args(root, true)], { cwd: compiled, encoding: 'utf8', windowsHide: true });
  assert.equal(coldQuote.status, 0, coldQuote.stderr);
  const result: any = await cli.runCli(args(root), { host, ...continuationStreams(id => `confirm ${id}\n`) });
  assert.equal(result.outcome, 'awaiting_user_experience', JSON.stringify(result.gaps));
  const state = JSON.parse(await readFile(join(root, 'snapshot.json'), 'utf8')), window = state.continuation.windows[0];
  const source = JSON.parse(await readFile(join(root, `continuations/${window.decisionId}/human-source.json`), 'utf8'));
  assert.equal(source.execution.variant, 'compiled'); assert.ok(source.execution.files.every((file: any) => file.path.endsWith('.js')));
  assert.equal(toolReports.length, 1); assert.equal(toolReports[0].workerPids.length, 2); assert.ok(toolReports[0].passed, JSON.stringify(toolReports));
  assert.equal(calls.slice(beforeCalls.length).filter(call => call.startsWith('coding:')).length, 1);
  assert.equal(calls.slice(beforeCalls.length).filter(call => /^(cosmos|design|art):/.test(call)).length, 0);
  assert.deepEqual(state.stopReason, original.stopReason);
  const completed = [...calls], resumed: any = await cli.runCli(['resume', root, '--window', window.windowId], { host, ...continuationStreams() });
  assert.equal(resumed.outcome, 'awaiting_user_experience', JSON.stringify(resumed.gaps)); assert.deepEqual(calls, completed);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'snapshot.json'), 'utf8')).run.fees, state.run.fees);
  const file = join(compiled, 'dist/runtime/entrypoint-human-continuation.js'), bytes = await readFile(file); await writeFile(file, Buffer.concat([bytes, Buffer.from('\n')]));
  await assert.rejects(cli.runCli(['resume', root, '--window', window.windowId], { host, ...continuationStreams() }), /source|execution|changed/i); assert.deepEqual(calls, completed);
});

test('human current preparation context exposes one task and candidate in both audit slots', async t => {
  const f = await humanContinuationFixture(t);
  await runCli(args(f.root), { host: { ...f.host, execute: async () => ({ outcome: 'synthetic_after_activation' }) }, ...continuationStreams(id => `confirm ${id}\n`) });
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), window = state.continuation.windows[0];
  const controller = await RunController.open({ root: f.root, windowId: window.windowId });
  try {
    const plan = await loadContinuationPlan({ root: f.root, controller, requirement: f.requirement, windowId: window.windowId });
    const preparation: any = { adapterId: 'cos16-input/1', designOutputs: [], designWritePaths: [], designRules: [], codingRules: [],
      async initialize(context: any) {
        assert.deepEqual(context.candidates.v1, plan.preparation!.candidate); assert.deepEqual(context.candidates.v2, plan.preparation!.candidate);
        assert.deepEqual(context.candidateTaskIds, { v1: plan.preparation!.taskId, v2: plan.preparation!.taskId }); throw new Error('synthetic_context_checked');
      }, async close() {} };
    await assert.rejects(createHumanPreparedContinuationHost({ root: f.root, controller, requirement: f.requirement, draft: f.draft as any, resume: true,
      work: new OwnedWork(controller.signal), binding: { windowId: window.windowId, tasks: plan.tasks, preparation: plan.preparation! }, preparation, io: f.io, sessionFactory: f.sessionFactory }), /synthetic_context_checked/);
    const sourcePath = join(f.root, `continuations/${window.decisionId}/human-source.json`), source = JSON.parse(await readFile(sourcePath, 'utf8'));
    assert.ok(source.authorization, 'current window authority must be sealed before task registration');
    assert.equal(source.authorization.deadlineAt, window.deadlineAt); assert.equal(source.authorization.startedAt, window.startedAt);
    assert.deepEqual(source.authorization.grant, window.grants[0]);
    source.authorization.deadlineAt = new Date(Date.parse(window.deadlineAt) + 60_000).toISOString(); await writeFile(sourcePath, JSON.stringify(source, null, 2) + '\n', 'utf8');
    await assert.rejects(createHumanPreparedContinuationHost({ root: f.root, controller, requirement: f.requirement, draft: f.draft as any, resume: true,
      work: new OwnedWork(controller.signal), binding: { windowId: window.windowId, tasks: plan.tasks, preparation: plan.preparation! }, preparation, io: f.io, sessionFactory: f.sessionFactory }), /source|execution|changed/i);
  } finally { await controller.close(); }
});

test('human continue cancellation and changed proof never activate or add requests', async t => {
  const f = await humanContinuationFixture(t), before = await readFile(join(f.root, 'snapshot.json')), calls = [...f.calls];
  for (const answer of ['cancel\n', '', 'confirm wrong\n']) {
    const result: any = await runCli(args(f.root), { host: f.host, ...continuationStreams(() => answer) });
    assert.equal(result.outcome, 'unconfirmed'); assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before); assert.deepEqual(f.calls, calls);
  }
  const evidence = f.original.tasks[0].evidence[0].source.location, bytes = await readFile(join(f.root, evidence));
  await assert.rejects(runCli(args(f.root), { host: f.host, ...continuationStreams(async id => { await writeFile(join(f.root, evidence), Buffer.concat([bytes, Buffer.from('\n')])); return `confirm ${id}\n`; }) }), /signature|content|changed/i);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before); assert.deepEqual(f.calls, calls); await f.requirePreserved();
});

test('unknown current human request cannot be repeated by cold resume', async t => {
  const f = await humanContinuationFixture(t); f.continue(); let prompts = 0;
  const sessionFactory = async (config: any) => ({ async close() {}, async prompt() {
    prompts++;
    await config.budget.beforeRequest({ requestId: 'synthetic-current-unknown', modelId: 'deepseek-flash', maxOutputTokens: config.maxOutputTokens,
      inputBytes: 100, hasImages: false, estimatedMaxCostMicroCny: 200 + config.maxOutputTokens * 8 });
    await config.budget.afterResponse({ requestId: 'synthetic-current-unknown', outcome: 'unknown', elapsedMs: 1 });
    throw new Error('Synthetic unknown provider response');
  } });
  const host = { ...f.host, execute: (options: any) => executeGeneration({ ...options, createHost: input => createHumanTransferContinuationHost({ ...input, draft: input.draft as any,
    binding: { ...input.binding!, preparation: input.binding!.preparation! }, io: f.io, sessionFactory }) }) };
  const result: any = await runCli(args(f.root), { host, ...continuationStreams(id => `confirm ${id}\n`) }); assert.equal(result.outcome, 'incomplete');
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), window = state.continuation.windows[0], fees = state.run.fees;
  assert.equal(prompts, 1); assert.ok(state.ledger.entries.some((entry: any) => entry.unknown));
  const resumed: any = await runCli(['resume', f.root, '--window', window.windowId], { host, ...continuationStreams() });
  assert.equal(resumed.outcome, 'incomplete'); assert.equal(prompts, 1);
  assert.deepEqual(JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')).run.fees, fees); await f.requirePreserved();
});
