import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PassThrough, Readable } from 'node:stream';
import { join } from 'node:path';
import test from 'node:test';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { createHumanTransferConsumerHost } from '../../src/runtime/adapters/transfer/runtime-host.ts';
import { humanFixture, fakeHumanSdk, fakePublicSdk, humanPersistentReports, installHumanTools } from './human-preparation.fixture.ts';

test('human entrypoint binds planner identities before real tools capture runtime design and cold resume reuses passed stages', async t => {
  const f = await humanFixture(t), calls: string[] = [];
  const createHost = async (input: any) => { const host = await createHumanTransferConsumerHost({ ...input, sessionFactory: fakeHumanSdk(calls), io: {
    async build() { return { passed: false, diagnostics: 'Synthetic toolchain unavailable' }; }, async play() { throw new Error('No normal browser fallback'); },
  } }); const before = host.preAuthor!; host.preAuthor = async (...args) => { try { return await before(...args); } catch (error) { t.diagnostic(String(error)); throw error; } }; return host; };
  const result = await executeGeneration({ ...f, createHost, resume: false });
  const observed = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  if (observed.tasks[0]?.state !== 'passed') t.diagnostic(JSON.stringify(observed.tasks[0]?.attempts));
  assert.equal(result.outcome, 'incomplete'); assert.equal(result.taskHistory.find((item: any) => item.taskId === 'actual-design-58')?.state, 'passed', JSON.stringify(result.gaps));
  assert.equal(result.taskHistory.find((item: any) => item.taskId === 'actual-art-58')?.state, 'passed');
  const binding = JSON.parse(await readFile(join(f.root, 'host-human-preparation-tasks.json'), 'utf8'));
  assert.equal(binding.repairTaskId, 'actual-code-58-repair'); assert.equal(binding.tasks[0].expectedArtifacts.length, 4);
  const audit = JSON.parse(await readFile(join(f.root, 'host-transfer-design-validation/actual-design-58', result.taskHistory[0].artifacts.length ? JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')).tasks[0].attempts[0].attemptId : '', 'check-1-started.json'), 'utf8'));
  assert.equal(audit.authority.profile, 'human'); assert.equal(audit.binding.workspace, f.root); assert.ok(!('validation' in audit.binding.requirement));
  const saved = JSON.parse(await readFile(join(f.root, 'host-transfer-prepared-inputs.json'), 'utf8'));
  assert.equal(saved.plans.v1.segments[0].plan.taskId, 'actual-code-58'); assert.equal(saved.plans.v2.segments[0].plan.taskId, 'actual-code-58-repair');
  const before = [...calls], original = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  const resumed = await executeGeneration({ ...f, createHost, resume: true }); assert.equal(resumed.outcome, 'incomplete'); assert.deepEqual(calls, before);
  const after = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')); assert.equal(after.run.originalDeadlineAt, original.run.originalDeadlineAt); assert.deepEqual(after.ledger.entries, original.ledger.entries);
});

test('compiled public human CLI records executed JavaScript and fixed dependencies, repairs once and cold resumes its original binding', async t => {
  const repository = fileURLToPath(new URL('../../', import.meta.url)), compiled = await mkdtemp(join(tmpdir(), 'cos58-compiled-'));
  t.after(() => rm(compiled, { recursive: true, force: true }));
  const build = spawnSync(process.execPath, [join(repository, 'node_modules/typescript/bin/tsc'), '-p', join(repository, 'tsconfig.json'), '--outDir', join(compiled, 'dist')], { cwd: repository, encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, build.stdout + build.stderr);
  for (const file of ['package.json', 'package-lock.json']) await cp(join(repository, file), join(compiled, file));
  await symlink(join(repository, 'node_modules'), join(compiled, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const cli = await import(pathToFileURL(join(compiled, 'dist/cli/index.js')).href), hosts = await import(pathToFileURL(join(compiled, 'dist/runtime/entrypoint-host.js')).href);
  const root = join(compiled, 'run'), calls: string[] = [], consumers: string[] = [], output = new PassThrough(); let text = ''; output.on('data', bytes => { text += bytes; });
  const host = hosts.createProductHost(compiled, { sessionFactory: fakePublicSdk(calls), io: {
    async build(project: string, taskId: string) { await mkdir(join(project, 'dist'), { recursive: true }); await writeFile(join(project, 'dist/index.html'), 'compiled synthetic ' + taskId, 'utf8'); return { passed: true, diagnostics: '' }; },
    async play() { throw new Error('No generic browser fallback'); },
    async playPersistent(series: any, options: any, authority: any) { await options.verifyBinding(); consumers.push(authority.taskId); return humanPersistentReports(series, options, consumers.length === 1); },
  } });
  host.prepare = async () => { await mkdir(join(root, 'toolchain'), { recursive: true }); for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await writeFile(join(root, 'toolchain', file), file.endsWith('.ts') ? 'export default {}\n' : '{}\n', 'utf8'); await installHumanTools(root); return { environmentReady: true, executionReady: true }; };
  const result = await cli.runCli(['new', root, '--brief', '中文单关推箱子', '--adapter', 'sokoban'], { host, output, input: Readable.from(['两个箱子\nconfirm 1\n']) });
  assert.equal(result.outcome, 'awaiting_user_experience', JSON.stringify(result.gaps)); assert.match(text, /草稿 v1/); assert.equal(result.userExperience, 'not_confirmed'); assert.deepEqual(consumers, ['actual-code-58', 'actual-code-58-repair']);
  const receipt = JSON.parse(await readFile(join(root, 'host-human-preparation-source.json'), 'utf8')); assert.equal(receipt.execution.variant, 'compiled'); assert.ok(receipt.execution.files.every((file: any) => file.path.endsWith('.js'))); assert.equal(receipt.execution.platformLock.path, join(compiled, 'package-lock.json'));
  const before = [...calls], original = JSON.parse(await readFile(join(root, 'snapshot.json'), 'utf8'));
  const resumed = await cli.runCli(['resume', root, '--adapter', 'sokoban'], { host, output, input: Readable.from([]) }); assert.equal(resumed.outcome, 'awaiting_user_experience', JSON.stringify(resumed.gaps)); assert.deepEqual(calls, before);
  const after = JSON.parse(await readFile(join(root, 'snapshot.json'), 'utf8')); assert.deepEqual(after.ledger.entries, original.ledger.entries); assert.equal(after.run.originalDeadlineAt, original.run.originalDeadlineAt);
  const modulePath = join(compiled, 'dist/runtime/adapters/transfer/runtime-host.js'), moduleBytes = await readFile(modulePath); await writeFile(modulePath, Buffer.concat([moduleBytes, Buffer.from('\n')]));
  await assert.rejects(cli.runCli(['resume', root], { host, output, input: Readable.from([]) }), /source|binding/i); assert.deepEqual(calls, before);
});

test('human same-window automatic coding repair uses the presealed v2 plan and exact candidate consumer', async t => {
  const f = await humanFixture(t), calls: string[] = [], consumers: string[] = [];
  const createHost = async (input: any) => { const host = await createHumanTransferConsumerHost({ ...input, sessionFactory: fakeHumanSdk(calls), io: {
    async build(project, taskId) { await mkdir(join(project, 'dist'), { recursive: true }); await writeFile(join(project, 'dist/index.html'), 'synthetic ' + taskId, 'utf8'); return { passed: true, diagnostics: '' }; },
    async play() { throw new Error('No browser fallback'); },
    async playPersistent(series, options, authority) { assert.equal(series.segments.length, 8); assert.equal(series.segments[0].plan.taskId, authority.taskId); await options.verifyBinding(); consumers.push(authority.taskId);
      assert.equal(await (await fetch(series.segments[0].plan.url)).text(), 'synthetic ' + authority.taskId);
      return humanPersistentReports(series, options, consumers.length === 1); },
  } }); const before = host.preAuthor!; host.preAuthor = async (...args) => { try { return await before(...args); } catch (error) { t.diagnostic(String(error)); throw error; } }; return host; };
  const result = await executeGeneration({ ...f, createHost, resume: false });
  assert.equal(result.outcome, 'awaiting_user_experience', JSON.stringify(result.gaps)); assert.equal(result.userExperience, 'not_confirmed');
  assert.deepEqual(consumers, ['actual-code-58', 'actual-code-58-repair']); assert.equal(calls.filter(call => call.startsWith('design:')).length, 1); assert.equal(calls.filter(call => call.startsWith('art:')).length, 1);
  assert.equal(result.replacement?.replacementTaskId, 'actual-code-58-repair');
  const before = [...calls], state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  const resumed = await executeGeneration({ ...f, createHost, resume: true }); assert.equal(resumed.outcome, 'awaiting_user_experience', JSON.stringify(resumed.gaps)); assert.deepEqual(calls, before);
  const after = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')); assert.equal(after.run.originalDeadlineAt, state.run.originalDeadlineAt); assert.deepEqual(after.ledger.entries, state.ledger.entries); assert.equal(after.formatVersion, 1);
});

test('cold human recovery after sealed planning and before DAG registration completes the original bootstrap without replanning', async t => {
  for (const checkpoint of ['before-bind', 'after-bind']) {
  const f = await humanFixture(t), calls: string[] = [];
  const createHost = (input: any) => createHumanTransferConsumerHost({ ...input, sessionFactory: fakeHumanSdk(calls), io: {
    async build() { return { passed: false, diagnostics: 'Synthetic environment gap' }; }, async play() { throw new Error('No browser fallback'); },
  } });
  const interrupted = await executeGeneration({ ...f, resume: false, createHost: async input => {
    const host = await createHost(input), bind = host.bindPreparedTasks.bind(host);
    host.bindPreparedTasks = async tasks => { if (checkpoint === 'after-bind') await bind(tasks); throw new Error('Synthetic crash before original DAG registration'); }; return host;
  } });
  assert.equal(interrupted.outcome, 'incomplete'); assert.deepEqual(calls, ['cosmos:planning']);
  const before = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')); assert.equal(before.tasks.length, 0);
  const resumed = await executeGeneration({ ...f, createHost, resume: true });
  assert.equal(resumed.taskHistory.find((task: any) => task.taskId === 'actual-art-58')?.state, 'passed', JSON.stringify(resumed.gaps));
  assert.equal(calls.filter(call => call === 'cosmos:planning').length, 1);
  const after = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')); assert.equal(after.run.originalStartedAt, before.run.originalStartedAt); assert.equal(after.run.originalDeadlineAt, before.run.originalDeadlineAt);
  }
});
