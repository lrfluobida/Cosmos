import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import test, { after } from 'node:test';
import { transferFixture, syntheticMap } from './runtime-host.fixture.ts';
import { RunController } from '../../src/runtime/run.ts';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';
import type { ArtifactReference, TaskContract } from '../../src/contracts/index.ts';

const execute = promisify(execFile), repository = fileURLToPath(new URL('../../', import.meta.url));
const names = ['design', 'oracle', 'binding', 'acceptance', 'loopback-origin', 'design-validation', 'runtime-host', 'runtime-acceptance', 'persistent-diagnostics'];
async function production() {
  const api: any = await import('../../src/runtime/adapters/transfer/index.ts').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  });
  assert.equal(typeof api.createTransferConsumerHost, 'function', 'COS52 production transfer entry is missing');
  return api;
}
let compiledRoot: string | undefined, compilation: Promise<{ root: string; api: any }> | undefined;
after(async () => { if (compiledRoot) await rm(compiledRoot, { recursive: true, force: true }); });
function compile() {
  return compilation ??= compileOnce();
}
async function compileOnce() {
  const root = compiledRoot = await mkdtemp(join(tmpdir(), 'cosmos-production-transfer-'));
  await writeFile(join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
  await symlink(join(repository, 'node_modules'), join(root, 'node_modules'), 'junction');
  await execute(process.execPath, [join(repository, 'node_modules/typescript/bin/tsc'), '-p', join(repository, 'tsconfig.json'), '--outDir', join(root, 'dist')], { cwd: repository });
  return { root, api: await import(pathToFileURL(join(root, 'dist/runtime/adapters/transfer/index.js')).href) };
}

test('COS52 source and compiled entries load a production-only closure and preserve probe exports and oracle', async t => {
  const api = await production();
  const visited = new Set<string>();
  async function inspect(path: string) {
    if (visited.has(path)) return;
    visited.add(path);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path));
    for (const match of text.matchAll(/(?:from\s+|import\s*\()(['"])(\.\.?\/[^'"]+)\1/g)) {
      const dependency = resolve(dirname(path), match[2]);
      assert.ok(relative(join(repository, 'src'), dependency).split(sep)[0] !== '..', `production import escapes src: ${path} -> ${match[2]}`);
      await inspect(dependency);
    }
  }
  await inspect(join(repository, 'src/runtime/adapters/transfer/index.ts'));
  for (const name of names) {
    const current = await import(pathToFileURL(join(repository, 'src/runtime/adapters/transfer', name + '.ts')).href);
    const legacy = await import(pathToFileURL(join(repository, 'probes/transfer', name + '.ts')).href);
    assert.deepEqual(Object.keys(legacy), Object.keys(current));
    for (const key of Object.keys(current)) assert.equal(legacy[key], current[key], `${name}/${key} must remain the same implementation`);
  }
  const oldDiagnostic = await import('../../probes/e2e/diagnostics.ts');
  const diagnostic = await import('../../src/runtime/repair/browser-diagnostics.ts');
  assert.equal(oldDiagnostic.diagnoseBuild, diagnostic.diagnoseBuild);
  assert.equal(oldDiagnostic.diagnoseBrowser, diagnostic.diagnoseBrowser);
  const compiled = await compile(), requirement = { artifactId: 'synthetic-requirement', version: 'v1', location: 'synthetic/requirement' };
  const map = syntheticMap(requirement), legacy = await import('../../probes/transfer/oracle.ts');
  const expected = legacy.validateTransferDesign(map, requirement);
  assert.deepEqual(api.validateTransferDesign(map, requirement), expected);
  assert.deepEqual(compiled.api.validateTransferDesign(map, requirement), expected);
  assert.equal(compiled.api.snapshotJSON(expected.restore), api.snapshotJSON(expected.restore));
  const task: any = { acceptanceIds: ['T16-01'] }, report = { passed: false, work: 'synthetic', results: [{ code: 1, stdout: 'src/main.ts(1,1): error TS1005: synthetic', stderr: '' }] };
  assert.deepEqual(compiled.api.diagnoseTransferBuild(task, report, 'build.json'), api.diagnoseTransferBuild(task, report, 'build.json'));
});

test('COS52 compiled transfer host preserves four captured outputs and source-owned native compiler failure', async t => {
  await production();
  const compiled = await compile(), f = await transferFixture(t);
  const compiler = join(f.root, 'toolchain/node_modules/typescript/bin/tsc');
  await mkdir(dirname(compiler), { recursive: true });
  await writeFile(compiler, "require('node:fs').writeFileSync('compiler-pid.json',JSON.stringify({pid:process.pid,args:process.argv.slice(2)}));console.log('src/main.ts(1,1): error TS1005: synthetic compiler fixture');process.exit(1);\n", 'utf8');
  const { io: _io, ...input } = f.input;
  const host = await compiled.api.createTransferConsumerHost(input); t.after(() => host.closePreparation());
  const tasks = f.prepare(host); host.validateTasks(tasks);
  const { executeTaskDag } = await import(pathToFileURL(join(compiled.root, 'dist/runtime/orchestrator.js')).href);
  const result = await host.withPreparation(() => executeTaskDag({ controller: f.controller, validation: f.validation, requirement: f.requirement, tasks,
    sessionRoot: join(f.root, 'sessions'), availableArtifacts: host.availableArtifacts, roleFactory: host.roleFactory,
    preAuthor: host.preAuthor, capture: host.capture, verify: host.verify, reviewImages: host.reviewImages, diagnoseFailure: host.diagnoseFailure,
    recovery: { artifactRoot: f.root, journalRoot: join(f.root, 'journal'), recoverCapture: host.recoverCapture },
    reviewProtocolCorrections: 1, authorProtocolCorrections: 1 }));
  assert.deepEqual(result.map((task: TaskContract) => task.state), ['passed', 'passed', 'failed']);
  assert.deepEqual(result[0].artifacts, tasks[0].expectedArtifacts); assert.equal(result[0].artifacts.length, 4);
  const saved = JSON.parse(await readFile(join(f.root, 'host-transfer-prepared-inputs.json'), 'utf8'));
  assert.deepEqual(saved.plans.v1.segments.map((segment: any) => segment.plan.steps), saved.plans.v2.segments.map((segment: any) => segment.plan.steps));
  assert.equal(saved.plans.v1.segments.length, 8);
  const registry = await createArtifactRegistry({ workspaceRoot: f.root, registryRoot: 'registry' });
  const source = await production(), legacy = await import('../../probes/transfer/binding.ts');
  for (const version of ['v1', 'v2']) {
    const prepared = saved.plans[version], bind = { root: f.root, registry, frozen: saved.frozen,
      currentRequirement: { artifact: saved.frozen.requirement, specVersion: saved.frozen.specVersion }, candidate: prepared.binding.candidate,
      planArtifact: prepared.artifact, url: prepared.segments[0].plan.url, runId: prepared.binding.runId,
      reportId: prepared.segments[0].plan.reportId.slice(0, -'-start'.length), taskId: prepared.segments[0].plan.taskId, prepared };
    assert.deepEqual(await source.verifyPreparedTransferAcceptance(bind), prepared);
    assert.deepEqual(await legacy.verifyPreparedTransferAcceptance(bind), prepared);
    assert.deepEqual(await compiled.api.verifyPreparedTransferAcceptance(bind), prepared);
  }
  for (const ref of result[0].artifacts) {
    assert.ok(result[0].review.inputVersions.some((item: ArtifactReference) => item.artifactId === ref.artifactId && item.version === ref.version));
    const suffix = ref.artifactId.includes('plan') ? '_cosmos/transfer-plan.json' : ref.artifactId.endsWith('transfer-design') ? '_cosmos/transfer-design.json' : '_cosmos/design.json';
    assert.ok((await readFile(join(tasks[2].workspace, ref.location, suffix))).length > 0);
  }
  const codingConfig = f.configs.find(config => JSON.parse(config.context).role === 'coding');
  assert.match(codingConfig.context, /Capture file layout/);
  const failure = JSON.parse(await readFile(join(result[2].attempts[0].sessionRef, 'failure.json'), 'utf8'));
  assert.ok(failure.issues.some((issue: any) => issue.classification === 'code_defect' && issue.checkId === 'build/typecheck'), JSON.stringify(failure));
  const worker = JSON.parse(await readFile(join(f.root, 'builds', result[2].taskId, 'compiler-pid.json'), 'utf8'));
  assert.deepEqual(worker.args, ['--noEmit', '-p', 'tsconfig.json']);
  assert.throws(() => process.kill(worker.pid, 0), { code: 'ESRCH' });
  const owner = JSON.parse(await readFile(join(f.ledgerRoot, '.controller.lock'), 'utf8'));
  for (const child of owner.children) assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
  assert.equal((await host.finish(result)).acceptedCandidate, undefined);
  assert.deepEqual((await f.controller.read()).run.humanDecisions, []);
});

test('COS52 source and compiled owned workers wait for registration and confirm exit with their fixed process module', async t => {
  await production();
  const compiled = await compile();
  for (const variant of ['source', 'compiled']) {
    const module = variant === 'source' ? await import('../../src/runtime/recovery/owned-command.ts')
      : await import(pathToFileURL(join(compiled.root, 'dist/runtime/recovery/owned-command.js')).href);
    const root = join(compiled.root, variant); await mkdir(root);
    const controller = await RunController.create({ root, runId: 'synthetic', ledgerId: 'synthetic', kind: 'evaluation', scope: 'validation', specVersion: '1', allocations: [{ taskId: 'host', amountMicroCny: 1 }] });
    t.after(() => controller.close());
    const marker = join(root, 'worker.json'), register = controller.registerOwnedChild.bind(controller);
    let release!: () => void, reached!: () => void;
    const ready = new Promise<void>(resolve => { reached = resolve; });
    t.mock.method(controller, 'registerOwnedChild', async (pid: number, ticket: string) => { reached(); await new Promise<void>(resolve => { release = resolve; }); await register(pid, ticket); });
    const runner = variant === 'source' ? new URL('../../src/acceptance/runner.ts', import.meta.url).href
      : pathToFileURL(join(compiled.root, 'dist/acceptance/runner.js')).href;
    const workerSource = `import {runAcceptance} from ${JSON.stringify(runner)};import {writeFileSync} from 'node:fs';if(typeof runAcceptance!=='function')throw Error('Missing fixed acceptance worker');writeFileSync(process.argv[1],JSON.stringify({pid:process.pid}));`;
    const running = module.runOwnedNode({ controller, authority: { taskId: 'host', windowId: null }, cwd: root, signal: controller.signal, timeoutMs: 5000,
      args: ['--experimental-strip-types', '--input-type=module', '-e', workerSource, marker] });
    await ready;
    try { await assert.rejects(readFile(marker), { code: 'ENOENT' }); } finally { release(); }
    assert.equal((await running).passed, true);
    const worker = JSON.parse(await readFile(marker, 'utf8')); assert.throws(() => process.kill(worker.pid, 0), { code: 'ESRCH' });
    const owner = JSON.parse(await readFile(join(root, '.controller.lock'), 'utf8'));
    assert.equal(owner.children.length, 1); assert.throws(() => process.kill(owner.children[0].pid, 0), { code: 'ESRCH' });
    assert.equal((await controller.read()).ledger.entries.length, 0);
    await controller.close();
  }
});
