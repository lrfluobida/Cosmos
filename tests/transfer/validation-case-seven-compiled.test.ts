import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, symlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { caseSevenFeeData } from './validation-case-seven.fixture.ts';
test('compiled C7 binds its actual JS closure, rejects unknown for free and selects its actual JS worker', async t => {
  const platform = fileURLToPath(new URL('../../', import.meta.url)), root = await mkdtemp(join(tmpdir(), 'cos60-compiled-'));
  t.diagnostic(`SOURCE/TEMP compiled C7 proof at ${root}`);
  await promisify(execFile)(process.execPath, [join(platform, 'node_modules/typescript/bin/tsc'), '--outDir', root, '--rootDir', platform,
    '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--strict', '--skipLibCheck', '--types', 'node', '--rewriteRelativeImportExtensions',
    'probes/transfer/validation-case-seven-run.ts', 'probes/e2e/validation-worker.ts', 'src/runtime/coding-check-worker.ts', 'src/acceptance/process.ts'], { cwd: platform });
  await writeFile(join(root, 'package.json'), '{"type":"module"}', 'utf8'); await writeFile(join(root, 'package-lock.json'), await readFile(join(platform, 'package-lock.json')));
  await symlink(join(platform, 'node_modules'), join(root, 'node_modules'), 'junction');
  const importCompiled = (name: string) => import(pathToFileURL(join(root, 'probes/transfer', name + '.js')).href);
  const source = await importCompiled('validation-case-seven-source'), closure = await source.captureTransferCaseSevenSource();
  assert.equal(closure.variant, 'compiled'); assert.ok(closure.files.every((file: any) => file.path.endsWith('.js'))); await source.requireTransferCaseSevenSource(closure);
  const api = await importCompiled('validation-case-seven-run'), ledgerRoot = join(root, 'SOURCE-repository/.cosmos/validation-shared'); await mkdir(ledgerRoot, { recursive: true });
  const unknown = caseSevenFeeData(); Object.assign(unknown.ledger.entries.at(-1)!, { unknown: true, status: 'unknown', reservedMicroCny: 974_882, settledMicroCny: 0 });
  const path = join(ledgerRoot, 'snapshot.json'); await writeFile(path, JSON.stringify(unknown), 'utf8'); const before = await readFile(path), info = await stat(path);
  await assert.rejects(api.preflightTransferValidationCaseSevenRun({ repository: join(root, 'SOURCE-repository'), args: ['--validation-preflight', 'a'.repeat(40)] }), /unknown|reconciliation/);
  assert.deepEqual(await readFile(path), before); assert.equal((await stat(path)).mtimeMs, info.mtimeMs);
  const declaration = api.deriveTransferValidationCaseSevenDeclaration(caseSevenFeeData()), driver = await importCompiled('validation-case-seven-driver');
  const repository = join(root, 'SOURCE-bootstrap'), caseRoot = join(repository, '.cosmos/e2e', declaration.caseId); await mkdir(caseRoot, { recursive: true });
  const signal = new AbortController().signal, window = { caseId: declaration.caseId, windowId: 'SOURCE-compiled-C7', deadlineAt: new Date(Date.now() + declaration.limits.durationMs).toISOString(), quote: { declaration } };
  const input: any = { repository, root: caseRoot, ledgerRoot: join(repository, '.cosmos/validation-shared'), signal, window,
    controller: { requireValidationCase: () => {}, read: async () => caseSevenFeeData() }, work: { run: async (operation: any) => operation(signal) } };
  await driver.bootstrapTransferValidationCaseSevenToolchain(input, async (job: any) => {
    assert.equal(job.args[1], join(root, 'probes/e2e/validation-worker.js')); assert.ok((await stat(job.args[1])).isFile());
    const request = JSON.parse(await readFile(job.args.at(-1), 'utf8')); await writeFile(request.response, JSON.stringify({ formatVersion: 'validation-worker-result-1', operation: 'bootstrap', outcome: 'completed', result: join(caseRoot, 'toolchain') }), 'utf8');
    return { passed: true };
  });
});
