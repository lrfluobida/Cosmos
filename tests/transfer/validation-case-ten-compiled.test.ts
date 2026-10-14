import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, symlink, stat, readdir, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { caseTenFeeData } from './validation-case-ten.fixture.ts';

test('compiled C10 binds its own JS source, selects the JS worker and rejects mutated code before dispatch', async t => {
  const platform = fileURLToPath(new URL('../../', import.meta.url)), root = await mkdtemp(join(tmpdir(), 'cos82-compiled-'));
  t.diagnostic(`SOURCE/TEMP compiled C10 proof ${root}`);
  await promisify(execFile)(process.execPath, [join(platform, 'node_modules/typescript/bin/tsc'), '--outDir', root, '--rootDir', platform,
    '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--strict', '--skipLibCheck', '--types', 'node', '--rewriteRelativeImportExtensions',
    'probes/transfer/validation-case-ten-run.ts', 'probes/e2e/validation-worker.ts', 'src/runtime/coding-check-worker.ts', 'src/acceptance/process.ts'], { cwd: platform });
  await writeFile(join(root, 'package.json'), '{"type":"module"}', 'utf8'); await cp(join(platform, 'package-lock.json'), join(root, 'package-lock.json'));
  await symlink(join(platform, 'node_modules'), join(root, 'node_modules'), 'junction');
  const template = join(platform, 'templates/2d'); await mkdir(join(root, 'templates/2d'), { recursive: true });
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await cp(join(template, name), join(root, 'templates/2d', name));
  await symlink(join(template, 'node_modules'), join(root, 'templates/2d/node_modules'), 'junction');
  const load = (part: string) => import(pathToFileURL(join(root, `probes/transfer/validation-case-ten-${part}.js`)).href);
  const api = await load('run'), source = await load('source'), entry = await load('entry'), driver = await load('driver'), closure = await source.captureTransferCaseTenSource();
  assert.equal(closure.variant, 'compiled'); assert.ok(closure.files.every((f: any) => f.path.endsWith('.js')));
  for (const part of ['run', 'driver', 'task']) assert.ok(closure.files.some((f: any) => f.path.endsWith(`validation-case-ten-${part}.js`)));
  await source.requireTransferCaseTenSource(closure);
  const repository = join(root, 'SOURCE-repository'), ledgerRoot = join(repository, '.cosmos/validation-shared'); await mkdir(ledgerRoot, { recursive: true });
  const state = caseTenFeeData(), D = api.deriveTransferValidationCaseTenDeclaration(state), unknown = structuredClone(state);
  Object.assign(unknown.ledger.entries.at(-1), { unknown: true, status: 'unknown', reservedMicroCny: 1000 });
  const snapshot = join(ledgerRoot, 'snapshot.json'); await writeFile(snapshot, JSON.stringify(unknown), 'utf8');
  const before = await readFile(snapshot), info = await stat(snapshot), files = await readdir(ledgerRoot);
  await assert.rejects(api.preflightTransferValidationCaseTenRun({ repository, args: ['--validation-preflight', 'a'.repeat(40)] }), /unknown|reconcil/);
  assert.deepEqual(await readFile(snapshot), before); assert.equal((await stat(snapshot)).mtimeMs, info.mtimeMs); assert.deepEqual(await readdir(ledgerRoot), files);
  state.allocationClosureDecisions = [];
  const signal = new AbortController().signal, caseRoot = join(repository, '.cosmos/e2e', D.caseId); await mkdir(caseRoot, { recursive: true });
  const window: any = { caseId: D.caseId, windowId: 'SOURCE-compiled-C10', deadlineAt: new Date(Date.now() + D.limits.durationMs).toISOString(), quote: { declaration: D,
    basis: { revision: 1, snapshotSha256: 'a'.repeat(64), requestIds: state.ledger.entries.map((e: any) => e.requestId) } } };
  const manifestRef = { artifactId: `${D.caseId}-historical-stages`, version: 'b'.repeat(64), location: `${D.caseId}-reuse.json` };
  const envelope = entry.createTransferCaseTenAdmissionQuote(window.quote, manifestRef, [], closure, entry.transferCaseTenHistoricalAccountingHash(state, window.quote));
  const { validationHash } = await import('../../src/runtime/validation-validation.ts'), bytes = Buffer.from(JSON.stringify(envelope, null, 2) + '\n');
  const ref = { artifactId: `${D.caseId}-admission`, version: validationHash(bytes), location: `${D.caseId}-admission-${envelope.admissionId}.json` };
  await writeFile(join(ledgerRoot, ref.location), bytes); window.operatorDecision = { sourceRefs: [manifestRef, ref] };
  await mkdir(join(repository, 'templates/2d'), { recursive: true });
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await cp(join(template, name), join(repository, 'templates/2d', name));
  const input: any = { repository, ledgerRoot, root: caseRoot, signal, window, controller: { read: async () => state, requireValidationCase: () => {} }, work: { run: async (operation: any) => operation(signal) } };
  let jobs = 0;
  await driver.bootstrapTransferValidationCaseTenToolchain(input, async (job: any) => {
    jobs++; assert.equal(job.args[1], join(root, 'probes/e2e/validation-worker.js'));
    await cp(join(repository, 'templates/2d'), join(caseRoot, 'toolchain'), { recursive: true });
    await symlink(join(template, 'node_modules'), join(caseRoot, 'toolchain/node_modules'), 'junction');
    const request = JSON.parse(await readFile(job.args.at(-1), 'utf8'));
    await writeFile(request.response, JSON.stringify({ formatVersion: 'validation-worker-result-1', operation: 'bootstrap', outcome: 'completed', result: join(caseRoot, 'toolchain') }), 'utf8');
    return { passed: true };
  });
  assert.equal(jobs, 1);
  const leaf = join(root, 'probes/transfer/validation-case-ten-task.js'), original = await readFile(leaf);
  await writeFile(leaf, Buffer.concat([original, Buffer.from('\n/* SOURCE mutated compiled task */\n')]));
  try {
    await assert.rejects(source.requireTransferCaseTenSource(closure), /source|bytes/);
    await assert.rejects(driver.bootstrapTransferValidationCaseTenToolchain(input, async () => { jobs++; }), /source|bytes/);
    assert.equal(jobs, 1); assert.deepEqual(await readFile(snapshot), before);
  } finally { await writeFile(leaf, original); }
  await source.requireTransferCaseTenSource(closure);
});
