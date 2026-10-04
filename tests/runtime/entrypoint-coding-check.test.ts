import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
import { snapshot } from '../../src/artifacts/paths.ts';
import { createTransferRuntimeHost } from '../../src/runtime/adapters/transfer/runtime-host.ts';
import { codingSignature } from '../../src/runtime/coding-check-worker.ts';
import { validationBrowserFixture } from './entrypoint-host-validation.fixture.ts';
import { transferFixture } from '../transfer/runtime-host.fixture.ts';

const NAME = 'check-game-build';

test('COS55 fixed worker signatures fit Windows arguments for the supported media frame bound', () => {
  const files = new Map(Array.from({ length: 4096 }, (_, index) => [`marker-${index}/idle.svg`, Buffer.from('synthetic frame bytes')]));
  const signature = codingSignature(files); assert.equal(signature.length, 64, 'A frame inventory must not expand the worker argument vector');
  assert.equal(codingSignature(new Map([...files].reverse())), signature);
  files.set('marker-0/idle.svg', Buffer.from('changed synthetic frame bytes')); assert.notEqual(codingSignature(files), signature);
});

test('COS55 declares the trusted compile tool only in the original coding policy before SDK initialization', async t => {
  const f = await validationBrowserFixture(t), host = await f.create();
  const coding = host.taskPolicies.find((policy: any) => policy.role === 'coding');
  assert.ok(coding.tools.includes(NAME), 'Production coding policy must declare its compile tool');
  assert.ok(host.taskPolicies.filter((policy: any) => policy.role !== 'coding').every((policy: any) => !policy.tools.includes(NAME)));
  assert.match(coding.rules.join('\n'), /same.*session|original.*session/i);
});

/** Real production host/factory, isolated synthetic upstream captures, no prompt in the coding session. */
export async function codingAuthor(t: test.TestContext, options: { templateRoot?: string; createHost?: (input: any) => Promise<any>; transfer?: boolean } = {}) {
  const f = options.transfer ? await transferFixture(t) : await validationBrowserFixture(t, options);
  const host = options.transfer ? await createTransferRuntimeHost(f.input) : options.createHost ? await options.createHost(f.input) : await (f as Awaited<ReturnType<typeof validationBrowserFixture>>).create();
  if (options.transfer) t.after(() => host.closePreparation());
  const tasks = f.prepare(host);
  host.validateTasks(tasks);
  const upstream = await executeTaskDag({ controller: f.controller, validation: f.validation, requirement: f.requirement, tasks: tasks.slice(0, 2),
    sessionRoot: join(f.root, 'sessions'), availableArtifacts: host.availableArtifacts, roleFactory: host.roleFactory,
    preAuthor: host.preAuthor, capture: host.capture, verify: host.verify,
    recovery: { artifactRoot: f.root, journalRoot: join(f.root, 'journal'), recoverCapture: host.recoverCapture }, authorProtocolCorrections: 1, reviewProtocolCorrections: 1 });
  assert.deepEqual(upstream.map(task => task.state), ['passed', 'passed']);
  await f.controller.registerTasks([tasks[2].task]);
  const task = structuredClone(tasks[2].task); task.state = 'ready'; task.dependsOn.forEach(dep => { dep.state = 'passed'; });
  await f.controller.saveTask(task, { role: 'system', actorId: 'runtime' }); await host.preAuthor(task, f.controller.signal);
  const attemptId = `coding-self-check-${randomUUID()}`;
  task.state = 'running'; task.attempts = [{ attemptId, sessionRef: join(f.root, `sessions/${attemptId}`),
    startedAt: new Date().toISOString(), endedAt: null, outcome: 'running', failure: null }];
  await f.controller.saveTask(task, { role: 'system', actorId: 'runtime' });
  const roleInput = { controller: f.controller, requirement: f.requirement, role: 'coding' as const, task, workspace: tasks[2].workspace,
    stateDirectory: join(f.root, `sessions/${attemptId}/author`) };
  const session = await host.roleFactory(roleInput); t.after(() => session.close());
  const config = f.configs.at(-1)!, tool = config.tools.find(tool => tool.name === NAME)!;
  assert.ok(tool, 'Production factory callback must supply the declared coding compile tool');
  const call = async (args: any = {}, signal?: AbortSignal) => JSON.parse((await (tool.execute as any)('coding-build-check', args, signal, undefined, undefined)).content[0].text);
  return { ...f, host, tasks, task, config, tool, call, roleInput };
}

test('COS55 callback supplies strict empty arguments and stays absent from noncoding sessions', async t => {
  const f = await codingAuthor(t), before = await f.controller.read();
  assert.deepEqual(f.tool.parameters, { type: 'object', properties: {}, additionalProperties: false });
  for (const args of [{ command: 'echo unexpected' }, { env: {} }, { path: 'other' }, { version: 'v2' }, [], null, new Date()]) {
    await assert.rejects(f.call(args), /no arguments|empty object/i);
  }
  assert.ok(f.configs.filter(config => JSON.parse(config.context).role !== 'coding').every(config => !config.tools.some(tool => tool.name === NAME)));
  const review = join(f.root, 'reviews', f.task.taskId); await mkdir(review, { recursive: true });
  const reviewer = await f.host.roleFactory({ ...f.roleInput, role: 'reviewer', workspace: review, stateDirectory: join(f.root, `sessions/${f.task.attempts[0].attemptId}/review`) });
  await reviewer.close(); assert.ok(!f.configs.at(-1)!.tools.some(tool => tool.name === NAME));
  assert.deepEqual(await f.controller.read(), before);
});

test('COS55 original compile callback rejects stale attempt and changed fixed inputs before any worker', async t => {
  const f = await codingAuthor(t);
  const input = join(f.roleInput.workspace, f.task.inputs[0].location), bytes = await readFile(input);
  await writeFile(input, Buffer.concat([bytes, Buffer.from(' ')])); await assert.rejects(f.call(), /input|source|fixed/i); await writeFile(input, bytes);
  const changed = structuredClone(f.task); changed.state = 'awaiting_review'; changed.attempts[0].outcome = 'passed'; changed.attempts[0].endedAt = new Date().toISOString();
  await f.controller.saveTask(changed, { role: 'system', actorId: 'runtime' });
  await assert.rejects(f.call(), /attempt|original|binding/i);
  assert.equal(f.calls.some(call => call.kind === 'build'), false);
});

for (const boundary of ['stop', 'cancel', 'deadline'] as const) test(`COS55 original compile callback refuses ${boundary}`, async t => {
  const f = await codingAuthor(t), before = await f.controller.read(), abort = new AbortController();
  if (boundary === 'stop') await f.controller.stop('Synthetic manual stop');
  if (boundary === 'cancel') abort.abort();
  if (boundary === 'deadline') f.advance(2_700_001);
  await assert.rejects(f.call({}, abort.signal));
  assert.deepEqual((await f.controller.read()).ledger, before.ledger);
  assert.equal(f.calls.some(call => call.kind === 'build'), false);
});

test('COS55 original coding callback rejects unknown charges and reserves cleanup time', async t => {
  const f = await codingAuthor(t);
  t.mock.method(Date, 'now', () => Date.parse(f.window.deadlineAt) - 4000);
  await assert.rejects(f.call(), /cleanup|deadline/i); t.mock.restoreAll();
  await f.controller.reserve({ requestId: 'synthetic-unknown', taskId: f.window.quote.declaration.grants.planning.taskId, provider: 'deepseek',
    pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: 208,
    validation: { caseId: f.window.caseId, windowId: f.window.windowId, purpose: 'planning', modelId: 'deepseek-flash', inputBytes: 1, maxOutputTokens: 1, hasImages: false } });
  await f.controller.admit('synthetic-unknown'); await f.controller.markUnknown('synthetic-unknown', [{ artifactId: 'unknown', version: 'v1', location: 'synthetic.json' }]);
  const before = await f.controller.read(); await assert.rejects(f.call(), /charge|unknown|reconcil/i);
  assert.deepEqual(await f.controller.read(), before); assert.equal(f.calls.some(call => call.kind === 'build'), false);
});

async function fixedCompiler(t: test.TestContext, waiting = false, transfer = false) {
  const f = await codingAuthor(t, { transfer }), modules = join(f.root, 'toolchain/node_modules');
  const tsc = join(modules, 'typescript/bin'), vite = join(modules, 'vite/bin');
  await mkdir(tsc, { recursive: true }); await mkdir(vite, { recursive: true });
  await writeFile(join(tsc, 'tsc'), `const fs=require('node:fs');fs.writeFileSync('compiler-ready.json',JSON.stringify({pid:process.pid,unlisted:process.env.COSMOS_TEST_UNLISTED??null,nodeOptions:process.env.NODE_OPTIONS??null}));${waiting ? "const timer=setInterval(()=>{if(fs.existsSync('compiler-release')){clearInterval(timer);}},20);" : ''}\n`, 'utf8');
  await writeFile(join(vite, 'vite.js'), "require('node:fs').writeFileSync('vite-pid.json',JSON.stringify({pid:process.pid}));\n", 'utf8');
  const author = join(f.roleInput.workspace, 'authors/coding');
  await writeFile(join(author, 'index.html'), '<p>合成 worker 输入</p>', 'utf8'); await writeFile(join(author, 'src/main.ts'), '// 合成源码\n', 'utf8');
  const prefix = `cosmos-coding-${f.task.taskId}-${f.task.attempts[0].attemptId}-check-`;
  const initial = new Set((await readdir(tmpdir())).filter(name => name.startsWith(prefix)));
  const directories = async () => (await readdir(tmpdir())).filter(name => name.startsWith(prefix) && !initial.has(name)).map(name => join(tmpdir(), name));
  t.after(async () => { for (const path of await directories()) { assert.ok(path.startsWith(join(tmpdir(), prefix))); await rm(path, { recursive: true, force: true }); } });
  return { ...f, author, directories };
}
async function ready(paths: () => Promise<string[]>) {
  for (let i = 0; i < 150; i++) {
    for (const path of await paths()) {
      try { return { path, value: JSON.parse(await readFile(join(path, 'compiler-ready.json'), 'utf8')) }; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    await delay(20);
  }
  throw new Error('Synthetic owned compiler did not reach its ready barrier.');
}
const exited = (pid: number) => { try { process.kill(pid, 0); return false; } catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; } };

test('COS55 registers its owned PID before any TEMP assembly and filters compiler environment', async t => {
  const f = await fixedCompiler(t), register = f.controller.registerOwnedChild.bind(f.controller);
  let release!: () => void, reached!: () => void;
  const barrier = new Promise<void>(done => { reached = done; });
  let first = true;
  t.mock.method(f.controller, 'registerOwnedChild', async (pid: number, ticket: string) => {
    if (first) { first = false; reached(); await new Promise<void>(done => { release = done; }); }
    await register(pid, ticket);
  });
  const unlisted = process.env.COSMOS_TEST_UNLISTED, nodeOptions = process.env.NODE_OPTIONS;
  process.env.COSMOS_TEST_UNLISTED = 'synthetic-not-a-key'; process.env.NODE_OPTIONS = '--require=missing-synthetic-preload';
  const running = f.call();
  try { await barrier; await delay(40); assert.deepEqual(await f.directories(), []); }
  finally { release(); }
  let report: any;
  try { report = await running; }
  finally {
    if (unlisted === undefined) delete process.env.COSMOS_TEST_UNLISTED; else process.env.COSMOS_TEST_UNLISTED = unlisted;
    if (nodeOptions === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = nodeOptions;
  }
  assert.equal(report.passed, true);
  const observed = JSON.parse(await readFile(join(report.work, 'compiler-ready.json'), 'utf8'));
  assert.equal(observed.unlisted, null); assert.equal(observed.nodeOptions, null);
  assert.ok(exited(report.workerPid)); assert.ok(report.results.every((result: any) => exited(result.pid)));
  assert.equal(f.calls.some(call => ['coding', 'build', 'play'].includes(call.kind)), false);
});

for (const drift of ['source', 'input', 'cancel'] as const) test(`COS55 withholds compiler results after ${drift} during the owned check`, async t => {
  const f = await fixedCompiler(t, true), before = await f.controller.read(), abort = new AbortController();
  const running = f.call({}, abort.signal), rejected = assert.rejects(running, /changed|input|cancel|aborted/i);
  const compiler = await ready(f.directories);
  if (drift === 'source') await writeFile(join(f.author, 'src/main.ts'), '// 修改后的合成源码\n', 'utf8');
  if (drift === 'input') {
    const path = join(f.roleInput.workspace, f.task.inputs[0].location); await writeFile(path, Buffer.concat([await readFile(path), Buffer.from(' ')]));
  }
  if (drift === 'cancel') abort.abort(); else await writeFile(join(compiler.path, 'compiler-release'), '', 'utf8');
  await rejected; assert.ok(exited(compiler.value.pid)); assert.deepEqual(await f.controller.read(), before);
  await f.input.work.cancelAndDrain('Synthetic check drained');
});

test('COS55 rechecks original authority and input bytes before starting Vite after TypeScript', async t => {
  const f = await fixedCompiler(t), path = join(f.roleInput.workspace, f.task.inputs[0].location);
  await writeFile(join(f.root, 'toolchain/node_modules/typescript/bin/tsc'), `require('node:fs').appendFileSync(${JSON.stringify(path)},' ');\n`, 'utf8');
  await assert.rejects(f.call(), /input|fixed|changed/i);
  const dirs = await f.directories(); assert.equal(dirs.length, 1);
  await assert.rejects(readFile(join(dirs[0], 'vite-pid.json')), { code: 'ENOENT' }, 'Input drift during tsc must prevent the next compiler from starting');
});

test('COS55 prepared transfer compile uses all frozen inputs and passed art without publishing gameplay evidence', async t => {
  const f = await fixedCompiler(t, false, true), before = await f.controller.read(), registry = await snapshot(join(f.root, 'registry'));
  assert.equal(f.host.capability, 'browser-design-input-preparation-v1');
  assert.equal(f.tasks[0].expectedArtifacts!.length, 4);
  assert.ok(f.tasks[0].expectedArtifacts!.every(ref => f.task.inputs.some(input => input.artifactId === ref.artifactId && input.version === ref.version && input.location === ref.location)));
  assert.equal((await f.call()).passed, true);
  assert.deepEqual(await f.controller.read(), before); assert.deepEqual(await snapshot(join(f.root, 'registry')), registry);
  assert.equal((await f.host.finish(before.tasks)).acceptedCandidate, undefined);
  assert.equal(f.calls.some(call => ['coding', 'build', 'play'].includes(call.kind)), false);
  const plan = f.tasks[0].expectedArtifacts!.find(ref => ref.artifactId.includes('plan-v1'))!;
  const path = join(f.root, plan.location, '_cosmos/transfer-plan.json'); await writeFile(path, Buffer.concat([await readFile(path), Buffer.from(' ')]));
  await assert.rejects(f.call(), /changed|input|fixed|binding|capture/i);
});
