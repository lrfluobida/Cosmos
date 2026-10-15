import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runChild } from '../../probes/e2e/host.ts';
import { createReviewedValidationIdentityReader } from '../../probes/e2e/validation-identity.ts';
import { fixedTransferValidationInput } from '../../probes/transfer/validation-input.ts';
import { TRANSFER_VALIDATION_CASE_SIX as D } from '../../probes/transfer/validation-case-six-declaration.ts';
import { TRANSFER_VALIDATION_CASE_FIVE as OLD } from '../../probes/transfer/validation-case-five-declaration.ts';
import { createFixedTransferCodingOnlyDriver } from '../../probes/transfer/validation-case-six-driver.ts';
import { createFixedSettledCodingDriver } from '../../probes/transfer/validation-case-seven-driver.ts';
import { createFixedSettledCodingEntry, requireFixedTransferAccountingSources } from '../../probes/transfer/validation-case-seven-entry.ts';
import { requireTransferCaseSevenToolchain } from '../../probes/transfer/validation-case-seven-source.ts';
import { validationHash, validationInputHash } from '../../src/runtime/validation-validation.ts';
import { createNativeValidationWaits, runNativeValidationRead } from '../../src/acceptance/native-validation-waits.ts';
import type { ValidationHostInput } from '../../probes/e2e/validation-run.ts';
import type { HistoricalPassedStages } from '../../src/runtime/historical-passed-stages.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';

const repository = fileURLToPath(new URL('../../', import.meta.url));
async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(join(tmpdir(), 'cos97-probe-callers-'));
  t.after(async () => { t.mock.restoreAll(); syncBuiltinESMExports(); await fs.rm(root, { recursive: true, force: true }); });
  return root;
}
async function fixedFiles(root: string) {
  for (const file of [D.inputs.requirements, ...D.inputs.template.files]) {
    await fs.mkdir(dirname(join(root, file.path)), { recursive: true });
    await fs.writeFile(join(root, file.path), await fs.readFile(join(repository, file.path)));
  }
}

test('COS97 fixed input forwards the caller and stops after its first completed file', async t => {
  const root = await fixture(t); await fixedFiles(root);
  const abort = new AbortController(), reason = new Error('fixed input cancelled'), read = fs.readFile;
  const calls: { path: string; signal?: AbortSignal }[] = [];
  t.mock.method(fs, 'readFile', async (...args: Parameters<typeof fs.readFile>) => {
    const bytes = await read(...args), options = args[1];
    calls.push({ path: String(args[0]), signal: typeof options === 'object' && options !== null ? options.signal : undefined });
    abort.abort(reason); return bytes;
  }); syncBuiltinESMExports();
  await assert.rejects(fixedTransferValidationInput(D).readTransferValidationInput(root, abort.signal), error => error === reason);
  assert.equal(calls.length, 1); assert.equal(calls[0].signal, abort.signal);
});

test('COS97 fixed input checks cancellation between directory enumeration and the next directory', async t => {
  const root = await fixture(t); await fixedFiles(root);
  const abort = new AbortController(), reason = new Error('directory cancelled'), read = fs.readdir;
  let calls = 0;
  t.mock.method(fs, 'readdir', async (...args: Parameters<typeof fs.readdir>) => {
    const entries = await read(...args); calls++; abort.abort(reason); return entries;
  }); syncBuiltinESMExports();
  await assert.rejects(fixedTransferValidationInput(D).readTransferValidationInput(root, abort.signal), error => error === reason);
  assert.equal(calls, 1);
});

test('COS97 identity forwards its bounded signal and cancels before the after Git batch', async t => {
  const root = await fixture(t), signal = new AbortController().signal;
  const git = async (...args: string[]) => {
    const result = await runChild('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: root, signal, timeoutMs: 5000 });
    assert.equal(result.code, 0); return result.stdout.trim();
  };
  await git('init', '--initial-branch=main'); await fs.writeFile(join(root, 'source.txt'), 'source\n', 'utf8');
  await git('add', '.'); await git('commit', '-m', 'fixture'); const head = await git('rev-parse', 'HEAD');
  const abort = new AbortController(), reason = new Error('identity fixed reader cancelled'), spawn = childProcess.spawn;
  let calls = 0, owned = 0, received: AbortSignal | undefined;
  const waits = createNativeValidationWaits({ caseId: 'case', windowId: 'window', taskId: 'task', deadlineAt: Date.now() + 60_000,
    signal: abort.signal, trackRaw: start => { owned++; return Promise.resolve().then(() => start(abort.signal)); } });
  t.mock.method(childProcess, 'spawn', (...args: Parameters<typeof childProcess.spawn>) => { calls++; return spawn(...args); }); syncBuiltinESMExports();
  const read = createReviewedValidationIdentityReader({ repository: root, reviewedPlatformSha: head }, async (_root, active) => {
    received = active; assert.ok(active);
    return runNativeValidationRead(active, async () => { abort.abort(reason); return { manifest: D.inputs }; });
  });
  await assert.rejects(read(waits.readSignal), error => error === reason);
  assert.ok(received); assert.notEqual(received, waits.readSignal); assert.equal(received.reason, reason);
  assert.equal(owned, 1); assert.equal(waits.snapshot().rawReads.pending, 0);
  assert.equal(calls, 5, 'One top-level Git command and the four already dispatched before checks are observed');
});

test('COS97 historical manifest cancellation preserves the receiver and starts no verify or source', async t => {
  const root = await fixture(t), abort = new AbortController(), reason = new Error('manifest cancelled'), bytes = Buffer.from('manifest');
  const manifestRef = { artifactId: `${D.caseId}-historical-stages`, version: validationHash(bytes), location: 'manifest.json' };
  let verifies = 0, sources = 0;
  const input = { repository: root, root: join(root, '.cosmos/e2e', D.caseId), ledgerRoot: join(root, '.cosmos/validation-shared'), signal: abort.signal,
    controller: { requireValidationCase() {} }, window: { caseId: D.caseId, windowId: 'window', quote: { declaration: D }, operatorDecision: { sourceRefs: [manifestRef] } } } as unknown as ValidationHostInput;
  const historical = { originalRoot: join(root, '.cosmos/e2e', OLD.caseId), targetRoot: input.root, manifestRef,
    async readManifest(this: { manifestRef: typeof manifestRef }, active: AbortSignal) { assert.equal(this.manifestRef, manifestRef); assert.equal(active, abort.signal); abort.abort(reason); return bytes; },
    async verify() { verifies++; return {} as never; } } as unknown as HistoricalPassedStages;
  const driver = createFixedTransferCodingOnlyDriver(D, manifestRef.location, async () => { sources++; });
  await assert.rejects(driver.stageTransferValidationCaseSixInput(input, historical), error => error === reason);
  assert.equal(verifies, 0); assert.equal(sources, 0);
});

test('COS97 staged readScope checks its caller before the paired repository file', async t => {
  const root = await fixture(t); await fixedFiles(root); await fs.writeFile(join(root, '.gitignore'), '.cosmos/\n', 'utf8');
  const signal = new AbortController().signal, git = async (...args: string[]) => {
    const result = await runChild('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: root, signal, timeoutMs: 5000 });
    assert.equal(result.code, 0); return result.stdout.trim();
  };
  await git('init', '--initial-branch=main'); await git('config', 'core.autocrlf', 'false'); await git('add', '.'); await git('commit', '-m', 'fixed input');
  const head = await git('rev-parse', 'HEAD'), currentRoot = join(root, '.cosmos/e2e', D.caseId), ledgerRoot = join(root, '.cosmos/validation-shared');
  await fs.mkdir(ledgerRoot, { recursive: true });
  for (const file of D.inputs.template.files) {
    const target = join(currentRoot, 'toolchain', file.path.slice('templates/2d/'.length));
    await fs.mkdir(dirname(target), { recursive: true }); await fs.writeFile(target, await fs.readFile(join(root, file.path)));
  }
  const bytes = Buffer.from('staged manifest'), manifestRef = { artifactId: `${D.caseId}-historical-stages`, version: validationHash(bytes), location: 'manifest.json' };
  const quote = { declaration: D, identity: { reviewedPlatformSha: head, frozenCaseInputHash: validationInputHash(D) }, basis: { runId: 'run', ledgerId: 'ledger' } };
  const decision = { kind: 'operator_validation', decisionId: 'decision', actorId: 'operator', decidedAt: new Date().toISOString(), sourceRefs: [manifestRef],
    source: { artifactId: 'operator', version: 'v1', location: 'operator.json' } };
  const { source: _source, ...content } = decision, receipt = Buffer.from(JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...content, quote }));
  await fs.writeFile(join(ledgerRoot, decision.source.location), receipt);
  const historical = { originalRoot: join(root, '.cosmos/e2e', OLD.caseId), targetRoot: currentRoot, manifestRef,
    async readManifest(this: { manifestRef: typeof manifestRef }) { assert.equal(this.manifestRef, manifestRef); return bytes; }, async verify() {} } as unknown as HistoricalPassedStages;
  const input = { repository: root, root: currentRoot, ledgerRoot, signal, controller: { requireValidationCase() {} },
    window: { caseId: D.caseId, windowId: 'window', quote, operatorDecision: { ...decision, sourceSha256: validationHash(receipt) } } } as unknown as ValidationHostInput;
  const staged = await createFixedTransferCodingOnlyDriver(D, manifestRef.location).stageTransferValidationCaseSixInput(input, historical);
  assert.deepEqual(await staged.binding.historicalManifest.readBytes(signal), bytes);
  const abort = new AbortController(), reason = new Error('paired read cancelled'), read = fs.readFile; let laterReads = 0, received: AbortSignal | undefined;
  t.mock.method(fs, 'readFile', async (...args: Parameters<typeof fs.readFile>) => {
    if (abort.signal.aborted) laterReads++;
    const result = await read(...args), options = args[1];
    if (String(args[0]) === join(currentRoot, 'requirements/fixed.json')) {
      received = typeof options === 'object' && options !== null ? options.signal : undefined; abort.abort(reason);
    }
    return result;
  }); syncBuiltinESMExports();
  await assert.rejects(staged.binding.readScope(abort.signal), error => error === reason);
  assert.equal(received, abort.signal); assert.equal(laterReads, 0);
});

test('COS97 C7 driver gives controller reads the caller before admission or source dispatch', async t => {
  const root = await fixture(t), abort = new AbortController(), reason = new Error('controller caller cancelled');
  let received: AbortSignal | undefined, sources = 0;
  const input = { repository: root, root: join(root, '.cosmos/e2e', D.caseId), ledgerRoot: join(root, '.cosmos/validation-shared'), signal: abort.signal,
    controller: { requireValidationCase() {}, async read(active?: AbortSignal) { received = active; abort.abort(reason); return {}; } },
    window: { caseId: D.caseId, quote: { declaration: D }, operatorDecision: { sourceRefs: [] } } } as unknown as ValidationHostInput;
  const driver = createFixedSettledCodingDriver({ deriveDeclaration: () => D, manifestLocation: 'manifest.json', requireSource: async () => { sources++; } } as never);
  await assert.rejects(driver.generateTransferValidationCaseSeven(input, {} as HistoricalPassedStages), error => error === reason);
  assert.equal(received, abort.signal); assert.equal(sources, 0);
});

test('COS97 accounting reads pass the caller and stop before the next receipt', async t => {
  const root = await fixture(t), abort = new AbortController(), reason = new Error('accounting cancelled'), receipts = [];
  for (let i = 0; i < 2; i++) {
    const decision = { kind: 'operator_validation_allocation_closure', decisionId: `decision-${i}`, actorId: 'operator', decidedAt: '2026-10-15T00:00:00.000Z', sourceRefs: [], source: { location: `${i}.json` } };
    const quote = {}, value = { formatVersion: 'operator-validation-allocation-closure-decision-1', ...decision, quote };
    const { source: _source, ...content } = value, bytes = Buffer.from(JSON.stringify(content));
    await fs.writeFile(join(root, decision.source.location), bytes); receipts.push({ quote, operatorDecision: { ...decision, sourceSha256: validationHash(bytes) } });
  }
  const read = fs.readFile; let calls = 0, received: AbortSignal | undefined;
  t.mock.method(fs, 'readFile', async (...args: Parameters<typeof fs.readFile>) => {
    const bytes = await read(...args), options = args[1]; calls++; received = typeof options === 'object' && options !== null ? options.signal : undefined;
    abort.abort(reason); return bytes;
  }); syncBuiltinESMExports();
  await assert.rejects(requireFixedTransferAccountingSources(root, { allocationClosureDecisions: receipts } as unknown as RunSnapshot, abort.signal, 12), error => error === reason);
  assert.equal(calls, 1); assert.equal(received, abort.signal);
});

test('COS97 C7 entry stops before source capture when the snapshot read is cancelled', async t => {
  const root = await fixture(t), abort = new AbortController(), reason = new Error('entry snapshot cancelled');
  await fs.mkdir(join(root, '.cosmos/validation-shared'), { recursive: true }); await fs.writeFile(join(root, '.cosmos/validation-shared/snapshot.json'), '{}');
  const read = fs.readFile; let captures = 0;
  t.mock.method(fs, 'readFile', async (...args: Parameters<typeof fs.readFile>) => { const bytes = await read(...args); abort.abort(reason); return bytes; }); syncBuiltinESMExports();
  const entry = createFixedSettledCodingEntry({} as never, { parseEntry() {}, deriveDeclaration: () => D, captureSource: async () => { captures++; throw new Error('source capture must not start'); } } as never);
  await assert.rejects(entry.preflightTransferValidationCaseSevenRun({ repository: root, args: [], signal: abort.signal }), error => error === reason);
  assert.equal(captures, 0);
});

for (const boundary of ['template-realpath', 'package-manifest', 'closure-leaf'] as const) test(`COS97 toolchain source stops after ${boundary} cancellation`, async t => {
  const root = await fixture(t), toolchain = join(root, 'toolchain'), abort = new AbortController(), reason = new Error(boundary);
  await fs.mkdir(toolchain);
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await fs.writeFile(join(toolchain, name), name === 'package-lock.json' ? JSON.stringify({ packages: { 'node_modules/typescript': { version: '1' }, 'node_modules/vite': { version: '1' } } }) : '{}');
  for (const [name, command] of [['typescript', 'tsc'], ['vite', 'vite.js']]) {
    const folder = join(toolchain, 'node_modules', name); await fs.mkdir(join(folder, 'bin'), { recursive: true });
    await fs.writeFile(join(folder, 'package.json'), JSON.stringify({ name, version: '1' }));
    await fs.writeFile(join(folder, 'bin', command), "import './leaf.js';\n"); await fs.writeFile(join(folder, 'bin/leaf.js'), 'export {};\n');
  }
  const realpath = fs.realpath, read = fs.readFile; let laterReads = 0; const readSignals: (AbortSignal | undefined)[] = [];
  t.mock.method(fs, 'realpath', async (...args: Parameters<typeof fs.realpath>) => {
    const result = await realpath(...args);
    if (boundary === 'template-realpath' && String(args[0]) === join(toolchain, 'package.json')) abort.abort(reason);
    return result;
  });
  t.mock.method(fs, 'readFile', async (...args: Parameters<typeof fs.readFile>) => {
    if (abort.signal.aborted) laterReads++;
    const options = args[1]; readSignals.push(typeof options === 'object' && options !== null ? options.signal : undefined);
    const result = await read(...args), path = String(args[0]);
    if (boundary === 'package-manifest' && path === join(toolchain, 'node_modules/typescript/package.json')
      || boundary === 'closure-leaf' && path === join(toolchain, 'node_modules/typescript/bin/tsc')) abort.abort(reason);
    return result;
  }); syncBuiltinESMExports();
  await assert.rejects(requireTransferCaseSevenToolchain({} as never, root, abort.signal), error => error === reason);
  assert.equal(laterReads, 0);
  assert.ok(readSignals.every(signal => signal === abort.signal));
});
