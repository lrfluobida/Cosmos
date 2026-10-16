import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { filteredChildEnvironment } from '../../probes/e2e/admission.ts';
import { withTransferCaseFifteenFixture } from './validation-case-fifteen.fixture.ts';

const platform = fileURLToPath(new URL('../../', import.meta.url)), execute = promisify(execFile);
let compiledRoot: string | undefined, compiled: ReturnType<typeof compile> | undefined;
async function compile() {
  const root = compiledRoot = await mkdtemp(join(tmpdir(), 'cos101-compiled-'));
  await execute(process.execPath, [join(platform, 'node_modules/typescript/bin/tsc'), '--outDir', root, '--rootDir', platform,
    '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--strict', '--skipLibCheck', '--types', 'node', '--rewriteRelativeImportExtensions',
    'probes/transfer/validation-case-fifteen-run.ts', 'probes/e2e/validation-worker.ts', 'src/runtime/coding-check-worker.ts', 'src/acceptance/process.ts'], { cwd: platform, windowsHide: true });
  await writeFile(join(root, 'package.json'), '{"type":"module"}', 'utf8');
  await cp(join(platform, 'package-lock.json'), join(root, 'package-lock.json'));
  await symlink(join(platform, 'node_modules'), join(root, 'node_modules'), 'junction');
  await mkdir(join(root, 'templates/2d'), { recursive: true });
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts'])
    await cp(join(platform, 'templates/2d', name), join(root, 'templates/2d', name));
  await symlink(join(platform, 'templates/2d/node_modules'), join(root, 'templates/2d/node_modules'), 'junction');
  const source = await import(pathToFileURL(join(root, 'probes/transfer/validation-case-fifteen-source.js')).href) as typeof import('../../probes/transfer/validation-case-fifteen-source.ts');
  const driver = await import(pathToFileURL(join(root, 'probes/transfer/validation-case-fifteen-driver.js')).href) as typeof import('../../probes/transfer/validation-case-fifteen-driver.ts');
  return { root, source, driver, worker: join(root, 'probes/e2e/validation-worker.js') };
}
after(async () => {
  if (!compiledRoot) return;
  const root = await realpath(compiledRoot), parent = await realpath(tmpdir());
  assert.ok(root.startsWith(parent + sep) && /^cos101-compiled-[a-z0-9]+$/i.test(basename(root)));
  await rm(root, { recursive: true, force: true });
});

test('compiled C15 executes the actual JS build worker and preserves a real compiler failure', async t => {
  const { root, worker } = await (compiled ??= compile()), work = join(root, 'SOURCE-worker');
  t.diagnostic(`SOURCE/TEMP actual JS worker ${worker}; no browser or provider`);
  const project = join(work, 'project'), toolchain = join(work, 'toolchain'), response = join(work, 'result.json'), request = join(work, 'job.json');
  await mkdir(project, { recursive: true }); await mkdir(join(toolchain, 'node_modules'), { recursive: true });
  await cp(await realpath(join(platform, 'node_modules/typescript')), join(toolchain, 'node_modules/typescript'), { recursive: true });
  await writeFile(join(project, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, types: [] }, files: ['index.ts'] }), 'utf8');
  await writeFile(join(project, 'index.ts'), 'const value: number = "SOURCE expected compiler failure";\n', 'utf8');
  await writeFile(request, JSON.stringify({ formatVersion: 'validation-worker-1', operation: 'build', root: work,
    repository: root, project, name: 'compiled-failure', response }), 'utf8');
  const result = await execute(process.execPath, [worker, request], { cwd: work, windowsHide: true, env: filteredChildEnvironment(process.env), timeout: 30_000 });
  assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
  const receipt = JSON.parse(await readFile(response, 'utf8'));
  assert.equal(receipt.formatVersion, 'validation-worker-result-1'); assert.equal(receipt.operation, 'build'); assert.equal(receipt.outcome, 'completed');
  assert.equal(receipt.result.passed, false); assert.equal(receipt.result.results.length, 1);
  assert.equal(receipt.result.results[0].code, 2); assert.match(receipt.result.results[0].stdout, /error TS2322/);
  assert.equal(resolve(receipt.result.work), join(work, 'builds/compiled-failure'));
});

test('compiled C15 binds authentic SOURCE admission, selects its JS worker and rejects drift before dispatch', async t => {
  const { root, source, driver, worker } = await (compiled ??= compile()), closure = await source.captureTransferCaseFifteenSource();
  assert.equal(closure.variant, 'compiled'); assert.ok(closure.files.length > 0 && closure.files.every(file => file.path.endsWith('.js')));
  for (const part of ['run', 'entry', 'source', 'declaration', 'driver', 'task'])
    assert.ok(closure.files.some(file => file.path.endsWith(`validation-case-fifteen-${part}.js`)), `C15 ${part} belongs to the compiled closure`);
  assert.ok(closure.files.some(file => resolve(file.path) === resolve(worker)));
  await source.requireTransferCaseFifteenSource(closure);
  await withTransferCaseFifteenFixture(t, async f => {
    t.diagnostic('SOURCE364 authentic claim/open; compiled bootstrap dispatch is controlled, not production 715-entry success');
    assert.equal(f.baseline.requests.length, 364); assert.equal(f.input.window.quote.formatVersion, 'validation-case-quote-1');
    const snapshot = join(f.ledgerRoot, 'snapshot.json'), before = await readFile(snapshot);
    let jobs = 0;
    const run: NonNullable<Parameters<typeof driver.bootstrapTransferValidationCaseFifteenToolchain>[1]> = async job => {
      jobs++; assert.equal(job.args[1], worker); assert.equal(job.cwd, f.root);
      assert.equal(job.authority.caseId, f.input.window.caseId); assert.equal(job.authority.windowId, f.input.window.windowId);
      assert.equal(job.authority.taskId, f.input.window.quote.declaration.grants.planning.taskId);
      const request = JSON.parse(await readFile(job.args.at(-1)!, 'utf8'));
      assert.equal(request.formatVersion, 'validation-worker-1'); assert.equal(request.operation, 'bootstrap');
      assert.equal(request.root, f.root); assert.equal(request.repository, f.repository);
      await writeFile(request.response, JSON.stringify({ formatVersion: 'validation-worker-result-1', operation: 'bootstrap', outcome: 'completed', result: join(f.root, 'toolchain') }), 'utf8');
      return { passed: true, diagnostics: '', code: 0, stdout: '', stderr: '' };
    };
    assert.equal(await driver.bootstrapTransferValidationCaseFifteenToolchain(f.input, run), join(f.root, 'toolchain'));
    assert.equal(jobs, 1); assert.deepEqual(await readFile(snapshot), before);
    const leaf = join(root, 'probes/transfer/validation-case-fifteen-task.js'), original = await readFile(leaf);
    await writeFile(leaf, Buffer.concat([original, Buffer.from('\n/* SOURCE mutated compiled task */\n')]));
    try {
      await assert.rejects(source.requireTransferCaseFifteenSource(closure), /source|bytes/);
      await assert.rejects(driver.bootstrapTransferValidationCaseFifteenToolchain(f.input, run), /source|bytes/);
      assert.equal(jobs, 1); assert.deepEqual(await readFile(snapshot), before);
    } finally { await writeFile(leaf, original); }
    await source.requireTransferCaseFifteenSource(closure);
  }, { captureSource: async () => closure });
});
