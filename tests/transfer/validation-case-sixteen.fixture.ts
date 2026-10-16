import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, stat, symlink, unlink, utimes, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { TestContext } from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { prepareValidationCase, verifyOperatorDecision } from '../../src/runtime/validation-window.ts';
import { prepareValidationAllocationClosure, applyValidationAllocationClosure } from '../../src/runtime/validation-allocations.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { validationHash } from '../../src/runtime/validation-validation.ts';
import { fixedTransferValidationInput } from '../../probes/transfer/validation-input.ts';
import { TRANSFER_VALIDATION_CASE_FIFTEEN as D15 } from '../../probes/transfer/validation-case-fifteen-declaration.ts';
import { TRANSFER_VALIDATION_CASE_SIXTEEN as D16 } from '../../probes/transfer/validation-case-sixteen-declaration.ts';
import { TRANSFER_VALIDATION_CASE_FIVE as D5 } from '../../probes/transfer/validation-case-five-declaration.ts';
import { createTransferCaseFifteenAdmissionQuote, transferCaseFifteenHistoricalAccountingHash, requireTransferCaseFifteenAccountingSources, requireTransferCaseFifteenSourceApprovals } from '../../probes/transfer/validation-case-fifteen-entry.ts';
import { createTransferCaseSixteenAdmissionQuote, transferCaseSixteenHistoricalAccountingHash, requireTransferCaseSixteenAccountingSources, requireTransferCaseSixteenHistoricalTail, requireTransferCaseSixteenSourceApprovals } from '../../probes/transfer/validation-case-sixteen-entry.ts';
import { captureTransferCaseFifteenSource } from '../../probes/transfer/validation-case-fifteen-source.ts';
import { captureTransferCaseSixteenSource } from '../../probes/transfer/validation-case-sixteen-source.ts';
import { createHistoricalPassedStages } from '../../src/runtime/historical-passed-stages.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import type { ValidationHostInput } from '../../probes/e2e/validation-run.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';

const platform = fileURLToPath(new URL('../../', import.meta.url)), execute = promisify(execFile);
type Capture = typeof captureTransferCaseSixteenSource;
type Options = { captureSource?: Capture; materializeToolchain?: boolean };
type Fixture = { repository: string; ledgerRoot: string; root: string; head: string; archive: string; baseline: RunSnapshot; pins: any;
  input: ValidationHostInput; historical: ReturnType<typeof createHistoricalPassedStages>; context: any;
  approvals: ReturnType<typeof requireTransferCaseSixteenSourceApprovals> };
const exists = (path: string) => lstat(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });

/** Reuse the authenticated 22-case API prefix. Only C15 zero-work closure21 and the current claim are new.
 * SOURCE has 364 requests: this fixture never changes the production entry's exact 715-request gate. */
async function withSourceFixture(t: TestContext, sixteen: boolean, operation: (f: Fixture) => Promise<void>, options: Options) {
  const repository = await realpath(join(tmpdir(), 'cosmos-transfer-entry-T81i3U'));
  assert.ok(repository.startsWith(resolve(tmpdir()) + sep) && basename(repository) === 'cosmos-transfer-entry-T81i3U');
  const ledgerRoot = join(repository, '.cosmos/validation-shared'), snapshot = join(ledgerRoot, 'snapshot.json');
  const sourceProof = join(repository, '.cosmos/SOURCE-C14-proof-7a90c986-5cc1-4fbf-b2aa-d6d409dc279c');
  const saved = await readFile(join(sourceProof, 'SOURCE-C15-baseline.json'));
  assert.equal(validationHash(saved), 'e9ed58dab1514fba946d753de35be827301dbbb1d506cc18341b471468ab8db5');
  const prefix: RunSnapshot = JSON.parse(saved.toString('utf8')); validateSnapshot(prefix);
  assert.deepEqual([prefix.validation!.cases.length, prefix.requests.length, prefix.ledger.allocationDelegations!.length,
    prefix.ledger.allocationClosures!.length, prefix.allocationClosureDecisions!.length], [22, 364, 14, 110, 20]);
  const git = async (...args: string[]) => (await execute('git', ['-c', 'user.name=SOURCE Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', '--no-optional-locks', ...args], { cwd: repository, windowsHide: true, timeout: 20_000 })).stdout.trim();
  assert.equal(await git('status', '--porcelain'), '', 'The exclusive SOURCE repository must start clean.');
  const oldHead = await git('rev-parse', 'HEAD'), branch = await git('symbolic-ref', 'HEAD'), oldRemote = await git('rev-parse', 'refs/remotes/origin/main');
  const mappingPath = join(repository, 'docs/specs/github-issues.json'), inputPath = join(repository, D15.inputs.requirements.path);
  const originalFiles = new Set(await readdir(ledgerRoot));
  const protectedPaths = [snapshot, mappingPath, join(ledgerRoot, 'cos20-transfer-validation-8.json'), join(ledgerRoot, 'cos20-transfer-validation-8-reuse.json'),
    join(repository, '.cosmos/e2e/cos20-transfer-validation-8/origin.json'), join(repository, '.cosmos/e2e/cos20-transfer-validation-8/execution-reused.json')];
  if (await exists(inputPath)) protectedPaths.push(inputPath);
  const protectedFiles = await Promise.all(protectedPaths.map(async path => ({ path, bytes: await readFile(path), info: await stat(path), mtimeNs: (await stat(path, { bigint: true })).mtimeNs.toString() })));
  const roots = Array.from({ length: sixteen ? 8 : 7 }, (_, i) => join(repository, '.cosmos/e2e', `cos20-transfer-validation-${i + 9}`));
  for (const path of roots) assert.equal(await exists(path), false, path);
  for (const file of ['.controller.lock', '.controller.lock.recovery', 'registry/.commit.lock', 'registry/.commit.lock.recovery'])
    assert.equal(await exists(join(ledgerRoot, file)), false, file);
  const id = randomUUID(), archive = join(repository, `.cosmos/SOURCE-C16-proof-${id}`); await mkdir(archive);
  await writeFile(join(archive, 'original-snapshot.json'), protectedFiles[0].bytes);
  await writeFile(join(archive, 'preserved-state.json'), JSON.stringify({ oldHead, branch, oldRemote,
    files: protectedFiles.map(file => ({ path: file.path, sha256: validationHash(file.bytes), mtimeMs: file.info.mtimeMs, mtimeNs: file.mtimeNs })) }, null, 2) + '\n');
  let input: ValidationHostInput | undefined, tailController: RunController | undefined;
  try {
    for (const name of ['SOURCE-C15-35aee303-0bac-477a-b352-e19898be9e02-C14.json',
      'SOURCE-C15-c1dfbe5f-1153-4d3d-8cb7-8f1d0b7811ab-closure20.json', 'SOURCE-C14-supplement-665a7f7a-9cec-452a-8e4d-1fed5ca60101-1.json']) {
      const bytes = await readFile(join(sourceProof, 'ledger-new-files', name)), path = join(ledgerRoot, name);
      if (await exists(path)) assert.deepEqual(await readFile(path), bytes); else await writeFile(path, bytes, { flag: 'wx' });
    }
    await requireTransferCaseFifteenAccountingSources(ledgerRoot, prefix, new AbortController().signal);
    for (const window of prefix.validation!.cases) {
      const { sourceSha256, ...decision } = window.operatorDecision;
      assert.equal((await verifyOperatorDecision(ledgerRoot, window.quote, decision, Date.now())).sourceSha256, sourceSha256);
    }
    await writeFile(snapshot, saved);
    for (const root of roots.slice(0, 6)) await mkdir(root);
    await cp(join(platform, D15.inputs.requirements.path), inputPath);
    const mapping = JSON.parse(await readFile(join(platform, 'docs/specs/github-issues.json'), 'utf8'));
    // SOURCE-only approvals use real commits in this fixture repository, never invented SHAs or production approval claims.
    for (const task of mapping.tasks) { task.reviewedCommit = oldHead; task.mergeCommit = oldHead; }
    Object.assign(mapping.tasks.find((task: any) => task.taskId === 'COS-102'), { reviewStatus: 'TRANSFER_CASE_SIXTEEN_SOURCE_READY', integrationStatus: 'source-integrated' });
    const fifteenApprovals = requireTransferCaseFifteenSourceApprovals(mapping), sixteenApprovals = requireTransferCaseSixteenSourceApprovals(mapping);
    await writeFile(mappingPath, JSON.stringify(mapping), 'utf8');
    await git('add', D15.inputs.requirements.path, 'docs/specs/github-issues.json'); await git('commit', '-m', 'SOURCE C16 fixed input and synthetic source approvals');
    const head = await git('rev-parse', 'HEAD'); await git('update-ref', 'refs/remotes/origin/main', head);
    const sourceShas = new Set([...prefix.validation!.cases.map(window => window.quote.identity.reviewedPlatformSha),
      ...prefix.allocationClosureDecisions!.map(receipt => receipt.quote.identity.reviewedPlatformSha), ...sixteenApprovals.flatMap(item => [item.reviewedCommit, item.mergeCommit])]);
    for (const sha of sourceShas) await git('merge-base', '--is-ancestor', sha, head);
    const manifestBytes = await readFile(join(ledgerRoot, 'cos20-transfer-validation-8-reuse.json'));
    const manifest = async (declaration: typeof D15) => {
      const ref = { artifactId: `${declaration.caseId}-historical-stages`, version: validationHash(manifestBytes), location: `${declaration.caseId}-reuse.json` };
      await writeFile(join(ledgerRoot, ref.location), manifestBytes); return ref;
    };
    const receipt = (key: string, kind: 'operator_validation' | 'operator_validation_allocation_closure', sourceRefs: any[]) => ({ kind,
      decisionId: key, actorId: 'SOURCE-fixture', decidedAt: new Date().toISOString(), source: { artifactId: key, version: 'SOURCE-only', location: `${key}.json` }, sourceRefs });
    const contextFor = (declaration: typeof D15, baseline: RunSnapshot) => {
      const reader = fixedTransferValidationInput(declaration).createTransferValidationIdentityReader({ repository, reviewedPlatformSha: head });
      return { root: ledgerRoot, repositoryRoot: repository, identityReader: async (signal: AbortSignal) => {
        await (declaration === D15 ? requireTransferCaseFifteenAccountingSources : requireTransferCaseSixteenAccountingSources)(ledgerRoot, baseline, signal);
        return reader(signal);
      } };
    };
    const claim = async (declaration: typeof D15, baseline: RunSnapshot, capture: Capture) => {
      const context = contextFor(declaration, baseline), quote = await prepareValidationCase({ ...context, declaration }), manifestRef = await manifest(declaration);
      const approvals = declaration === D15 ? fifteenApprovals : sixteenApprovals, execution = await capture();
      const envelope = (declaration === D15 ? createTransferCaseFifteenAdmissionQuote : createTransferCaseSixteenAdmissionQuote)(quote, manifestRef, approvals, execution,
        (declaration === D15 ? transferCaseFifteenHistoricalAccountingHash : transferCaseSixteenHistoricalAccountingHash)(baseline, quote));
      const bytes = JSON.stringify(envelope, null, 2) + '\n', admissionRef = { artifactId: `${declaration.caseId}-admission`, version: validationHash(bytes), location: `${declaration.caseId}-admission-${envelope.admissionId}.json` };
      await writeFile(join(ledgerRoot, admissionRef.location), bytes, 'utf8');
      const decision = receipt(`SOURCE-C16-${id}-${declaration.caseId}`, 'operator_validation', [manifestRef, admissionRef]);
      await writeFile(join(ledgerRoot, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...decision, source: undefined, quote }), 'utf8');
      const window = await RunController.claimValidationCase({ ...context, quote, decision: decision as any });
      tailController = await RunController.openValidationCase({ ...context, caseId: declaration.caseId, windowId: window.windowId });
      return { context, window, controller: tailController, manifestRef, approvals, decision };
    };
    let baseline = prefix, current = await claim(D15, baseline, sixteen ? captureTransferCaseFifteenSource : options.captureSource ?? captureTransferCaseFifteenSource);
    if (sixteen) {
      await current.controller.stop('SOURCE C15 zero-task predecessor; no author, provider, capture or runtime output.'); await current.controller.close(); tailController = undefined;
      await mkdir(join(repository, '.cosmos/e2e', D15.caseId));
      const quote = await prepareValidationAllocationClosure({ ...current.context, caseIds: [D15.caseId] });
      const decision = receipt(`SOURCE-C16-${id}-closure21`, 'operator_validation_allocation_closure', [current.decision.source]);
      await writeFile(join(ledgerRoot, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', ...decision, source: undefined, quote }), 'utf8');
      await applyValidationAllocationClosure({ ...current.context, quote, decision: decision as any });
      baseline = JSON.parse(await readFile(snapshot, 'utf8')); validateSnapshot(baseline);
      assert.deepEqual([baseline.validation!.cases.length, baseline.requests.length, baseline.ledger.allocationDelegations!.length,
        baseline.ledger.allocationClosures!.length, baseline.allocationClosureDecisions!.length], [23, 364, 14, 115, 21]);
      assert.deepEqual(baseline.validation!.cases.slice(0, 22), prefix.validation!.cases); assert.deepEqual(baseline.ledger.entries, prefix.ledger.entries);
      const shas = await requireTransferCaseSixteenHistoricalTail(ledgerRoot, baseline, new AbortController().signal);
      for (const sha of new Set(shas)) await git('merge-base', '--is-ancestor', sha, head);
      await requireTransferCaseSixteenAccountingSources(ledgerRoot, baseline, new AbortController().signal);
      await writeFile(join(archive, 'SOURCE-C16-baseline.json'), JSON.stringify(baseline), 'utf8');
      current = await claim(D16, baseline, options.captureSource ?? captureTransferCaseSixteenSource);
    }
    const root = join(repository, '.cosmos/e2e', current.window.caseId); await mkdir(root);
    await cp(join(repository, 'templates/2d'), join(root, 'toolchain'), { recursive: true });
    const dependencies = join(platform, 'templates/2d/node_modules');
    if (options.materializeToolchain) await cp(dependencies, join(root, 'toolchain/node_modules'), { recursive: true, dereference: true });
    else await symlink(dependencies, join(root, 'toolchain/node_modules'), 'junction');
    const work = new OwnedWork(current.controller.signal);
    input = { repository, ledgerRoot, root, controller: current.controller, window: current.window, work, signal: work.signal }; tailController = undefined;
    const sourceWindow = baseline.validation!.cases[12], historical = createHistoricalPassedStages({ originalRoot: join(repository, '.cosmos/e2e', D5.caseId), targetRoot: root,
      expected: { caseId: D5.caseId, windowId: sourceWindow.windowId, ...sourceWindow.quote.identity, designTaskId: D5.grants.design.taskId, artTaskId: D5.grants.art.taskId },
      manifestRef: current.manifestRef, readManifest: signal => readFile(join(ledgerRoot, current.manifestRef.location), { signal }) });
    await historical.verify(input.signal);
    const pins = JSON.parse(await readFile(join(repository, '.cosmos/SOURCE-C8-fixture.json'), 'utf8')).pins;
    t.diagnostic(`SOURCE364 ${current.window.caseId}, baseline ${baseline.validation!.cases.length}/${baseline.ledger.allocationClosures!.length}/${baseline.allocationClosureDecisions!.length}; proof ${archive}`);
    await operation({ repository, ledgerRoot, root, head, archive, baseline, pins, input, historical, context: current.context, approvals: current.approvals });
  } finally {
    if (input) {
      await input.work.cancelAndDrain('SOURCE C16 fixture cleanup');
      if (!input.controller.signal.aborted) await input.controller.stop('SOURCE fixture finished');
      await input.controller.close();
    }
    if (tailController) { if (!tailController.signal.aborted) await tailController.stop('SOURCE tail fixture cleanup'); await tailController.close(); }
    assert.equal(await exists(join(ledgerRoot, '.controller.lock')), false);
    await writeFile(join(archive, 'result-snapshot.json'), await readFile(snapshot));
    await writeFile(join(archive, 'source-head.txt'), await git('rev-parse', 'HEAD'), 'utf8');
    for (const root of roots) if (await exists(root)) { assert.equal(await realpath(root), root); await rename(root, join(archive, basename(root))); }
    await mkdir(join(archive, 'ledger-new-files'));
    for (const name of await readdir(ledgerRoot)) if (!originalFiles.has(name)) {
      const path = join(ledgerRoot, name); assert.ok((await lstat(path)).isFile()); await rename(path, join(archive, 'ledger-new-files', name));
    }
    const restoration = [];
    for (const file of protectedFiles) {
      const changed = !(await readFile(file.path)).equals(file.bytes);
      if (changed) { await writeFile(file.path, file.bytes); await utimes(file.path, file.info.atimeMs / 1000, file.info.mtimeMs / 1000); }
      const after = await stat(file.path, { bigint: true }), deltaNs = after.mtimeNs - BigInt(file.mtimeNs);
      if (!changed) assert.equal(deltaNs, 0n, `Unchanged protected file mtime: ${file.path}`);
      else assert.ok(deltaNs > -1_000_000n && deltaNs < 1_000_000n, `Restored mtime must differ by less than 1 ms: ${file.path}`);
      restoration.push({ path: file.path, rewritten: changed, bytesRestored: (await readFile(file.path)).equals(file.bytes),
        beforeMtimeNs: file.mtimeNs, afterMtimeNs: after.mtimeNs.toString(), deltaNs: deltaNs.toString(), exactMtime: deltaNs === 0n });
    }
    await writeFile(join(archive, 'restoration.json'), JSON.stringify(restoration, null, 2) + '\n', 'utf8');
    if (!protectedPaths.includes(inputPath) && await exists(inputPath)) await unlink(inputPath);
    await git('update-ref', branch, oldHead); await git('read-tree', oldHead); await git('update-ref', 'refs/remotes/origin/main', oldRemote);
    for (const file of protectedFiles) { assert.deepEqual(await readFile(file.path), file.bytes); assert.ok(Math.abs((await stat(file.path)).mtimeMs - file.info.mtimeMs) < 1); }
    assert.equal(await git('status', '--porcelain'), ''); assert.equal(await git('rev-parse', 'HEAD'), oldHead);
    assert.equal(await git('rev-parse', 'refs/remotes/origin/main'), oldRemote);
    t.diagnostic(`Restored SOURCE bytes/refs/input; unchanged protected mtimes exact, rewritten mtimes within 1 ms (actual ns deltas in restoration.json). Prior mtime gap remains. Proof: ${archive}`);
  }
}
export function withTransferCaseSixteenFixture(t: TestContext, operation: (f: Fixture) => Promise<void>, options: Options = {}) { return withSourceFixture(t, true, operation, options); }
export function withTransferCaseFifteenSourceFixture(t: TestContext, operation: (f: Fixture) => Promise<void>, options: Options = {}) { return withSourceFixture(t, false, operation, options); }

/** TEMP execution tree: mutations never touch the implementer's or caller's production files. */
export async function transferSourceSandbox(t: TestContext, compiled = false) {
  const root = await mkdtemp(join(tmpdir(), `cos102-${compiled ? 'compiled' : 'source'}-`));
  if (compiled) await execute(process.execPath, [join(platform, 'node_modules/typescript/bin/tsc'), '--outDir', root, '--rootDir', platform,
    '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--strict', '--skipLibCheck', '--types', 'node', '--rewriteRelativeImportExtensions',
    'probes/transfer/validation-case-fifteen-run.ts', 'probes/transfer/validation-case-sixteen-run.ts', 'probes/e2e/validation-worker.ts',
    'src/runtime/coding-check-worker.ts', 'src/acceptance/process.ts'], { cwd: platform, windowsHide: true });
  else for (const folder of ['src', 'probes']) await cp(join(platform, folder), join(root, folder), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"type":"module"}', 'utf8'); await cp(join(platform, 'package-lock.json'), join(root, 'package-lock.json'));
  await symlink(join(platform, 'node_modules'), join(root, 'node_modules'), 'junction'); await mkdir(join(root, 'templates/2d'), { recursive: true });
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await cp(join(platform, 'templates/2d', name), join(root, 'templates/2d', name));
  await symlink(join(platform, 'templates/2d/node_modules'), join(root, 'templates/2d/node_modules'), 'junction');
  const extension = compiled ? '.js' : '.ts';
  const load = (name: string) => import(pathToFileURL(join(root, 'probes/transfer', name + extension)).href);
  t.diagnostic(`Preserved ${compiled ? 'compiled JS' : 'TS'} execution sandbox ${root}`);
  return { root, extension, load, worker: join(root, 'probes/e2e/validation-worker' + extension) };
}

/** Both the saved receipt and the real driver must reject changed imports before owned dispatch. */
export async function exerciseTransferSourceClosure(t: TestContext, name: 'fifteen' | 'sixteen', sandbox: Awaited<ReturnType<typeof transferSourceSandbox>>) {
  const title = name === 'fifteen' ? 'Fifteen' : 'Sixteen', source = await sandbox.load(`validation-case-${name}-source`);
  const driver = await sandbox.load(`validation-case-${name}-driver`), capture: Capture = source[`captureTransferCase${title}Source`];
  const requireSource = source[`requireTransferCase${title}Source`], bootstrap = driver[`bootstrapTransferValidationCase${title}Toolchain`];
  const closure = await capture(), receiptBytes = JSON.stringify(closure);
  assert.equal(closure.variant, sandbox.extension === '.js' ? 'compiled' : 'source');
  const expected = [`validation-case-${name}-run`, `validation-case-${name}-entry`, `validation-case-${name}-driver`, `validation-case-${name}-task`,
    `validation-case-${name}-source`, 'validation-shared-coding-entry', 'validation-case-fourteen-declaration', 'src/runtime/entrypoint-host',
    'src/roles/factory', 'src/providers/pi', 'probes/e2e/validation-worker', 'src/runtime/coding-check-worker', 'src/acceptance/process'];
  for (const suffix of expected) assert.ok(closure.files.some(file => file.path.replaceAll('\\', '/').endsWith(suffix + sandbox.extension)), suffix);
  assert.ok(closure.files.every(file => file.path.endsWith(sandbox.extension)));
  // Prove the chosen leaf is reached only through shared imports, using the production traversal grammar and seeds.
  const shared = join(sandbox.root, 'probes/transfer/validation-shared-coding-entry' + sandbox.extension);
  const leaf = join(sandbox.root, 'probes/transfer/validation-case-fourteen-declaration' + sandbox.extension);
  const seeds = ['run', 'driver', 'task'].map(part => join(sandbox.root, `probes/transfer/validation-case-${name}-${part}${sandbox.extension}`))
    .concat(['probes/e2e/validation-worker', 'src/runtime/coding-check-worker', 'src/acceptance/process'].map(path => join(sandbox.root, path + sandbox.extension)));
  const found = new Set<string>(), pending = [...seeds];
  while (pending.length) {
    const path = pending.pop()!; if (found.has(path)) continue; found.add(path); if (path === shared) continue;
    for (const match of (await readFile(path, 'utf8')).matchAll(/\b(?:import|export)(?!\s+type\b)[^;\n]*?\bfrom\s*['"](\.[^'"]+)['"]|\bimport\s*\(\s*['"](\.[^'"]+)['"]/g))
      pending.push(resolve(dirname(path), match[1] ?? match[2]));
  }
  assert.ok(found.has(shared)); assert.equal(found.has(leaf), false); assert.equal(seeds.includes(leaf), false);
  await requireSource(closure);
  await (name === 'fifteen' ? withTransferCaseFifteenSourceFixture : withTransferCaseSixteenFixture)(t, async f => {
    assert.equal(f.baseline.requests.length, 364);
    const snapshot = join(f.ledgerRoot, 'snapshot.json'), before = await readFile(snapshot);
    const admissionRef = f.input.window.operatorDecision.sourceRefs.find(ref => ref.artifactId.endsWith('-admission'))!;
    const admissionPath = join(f.ledgerRoot, admissionRef.location), admissionBytes = await readFile(admissionPath);
    let children = 0, network = 0;
    const fetch = t.mock.method(globalThis, 'fetch', async () => { network++; throw new Error('SOURCE network is disabled'); });
    const run = async (job: any) => {
      children++; assert.equal(job.args[1], sandbox.worker); assert.equal(job.cwd, f.root);
      assert.deepEqual([job.authority.caseId, job.authority.windowId, job.authority.taskId],
        [f.input.window.caseId, f.input.window.windowId, f.input.window.quote.declaration.grants.planning.taskId]);
      const request = JSON.parse(await readFile(job.args.at(-1)!, 'utf8'));
      assert.equal(request.formatVersion, 'validation-worker-1'); assert.equal(request.operation, 'bootstrap');
      assert.equal(request.root, f.root); assert.equal(request.repository, f.repository);
      await writeFile(request.response, JSON.stringify({ formatVersion: 'validation-worker-result-1', operation: 'bootstrap', outcome: 'completed', result: join(f.root, 'toolchain') }));
      return { passed: true, diagnostics: '', code: 0, stdout: '', stderr: '' };
    };
    try {
      for (const path of [shared, leaf]) {
        const original = await readFile(path); await writeFile(path, Buffer.concat([original, Buffer.from('\n/* SOURCE changed imported dependency */\n')]));
        try {
          await assert.rejects(requireSource(closure), /source|bytes/);
          await assert.rejects(bootstrap(f.input, run), /source|bytes/);
          assert.equal(children, 0); assert.equal(network, 0);
          assert.equal(JSON.stringify(closure), receiptBytes); assert.deepEqual(await readFile(admissionPath), admissionBytes);
          assert.deepEqual(await readFile(snapshot), before);
        } finally { await writeFile(path, original); }
        await requireSource(closure);
      }
      assert.equal(await bootstrap(f.input, run), join(f.root, 'toolchain')); assert.equal(children, 1); assert.equal(network, 0);
      assert.deepEqual(await readFile(snapshot), before); assert.deepEqual(await readFile(admissionPath), admissionBytes);
      t.diagnostic(`${name} ${closure.variant}: ${closure.files.length} files; shared and only-via-shared C14 declaration drift rejected with 0 provider/owned child increments; original receipt restored.`);
    } finally { fetch.mock.restore(); }
  }, { captureSource: async () => closure });
}
