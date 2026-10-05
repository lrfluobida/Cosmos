import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { runChild } from '../../probes/e2e/host.ts';
import { TRANSFER_VALIDATION_CASE_SIX as D } from '../../probes/transfer/validation-case-six-declaration.ts';
import { TRANSFER_VALIDATION_CASE_FIVE as OLD } from '../../probes/transfer/validation-case-five-declaration.ts';
import { readTransferValidationCaseSixInput } from '../../probes/transfer/validation-input.ts';

test('case6 bootstrap uses current planning host authority once and refuses foreign roots before writes', async t => {
  const driver: any = await import('../../probes/transfer/validation-case-six-driver.ts').catch(() => null);
  assert.equal(typeof driver?.bootstrapTransferValidationCaseSixToolchain, 'function', 'C6 fixed bootstrap is missing.');
  const repository = await mkdtemp(join(tmpdir(), 'cosmos-C6-bootstrap-'));
  t.after(async () => { assert.ok(resolve(repository).startsWith(resolve(tmpdir()) + '\\')); await rm(repository, { recursive: true, force: true }); });
  const root = join(repository, '.cosmos/e2e', D.caseId); await mkdir(root, { recursive: true });
  const signal = new AbortController().signal, window = { caseId: D.caseId, windowId: 'SOURCE-only-C6', deadlineAt: new Date(Date.now() + D.limits.durationMs).toISOString(), quote: { declaration: D } };
  const input: any = { repository, root, ledgerRoot: join(repository, '.cosmos/validation-shared'), window, signal,
    controller: { requireValidationCase: (caseId: string, windowId: string) => { assert.equal(caseId, D.caseId); assert.equal(windowId, window.windowId); } },
    work: { run: async (operation: any) => operation(signal) } };
  let calls = 0;
  const execute = async (job: any) => {
    calls++; assert.equal(job.authority.caseId, D.caseId); assert.equal(job.authority.windowId, window.windowId);
    assert.equal(job.authority.taskId, D.grants.planning.taskId); assert.equal(job.authority.deadlineAt, window.deadlineAt);
    const request = JSON.parse(await readFile(job.args.at(-1), 'utf8'));
    assert.equal(request.operation, 'bootstrap'); assert.equal(request.root, root);
    await writeFile(request.response, JSON.stringify({ formatVersion: 'validation-worker-result-1', operation: 'bootstrap', outcome: 'completed', result: join(root, 'toolchain') }), 'utf8');
    return { passed: true };
  };
  await assert.rejects(driver.bootstrapTransferValidationCaseSixToolchain({ ...input, root: join(repository, 'foreign') }, execute), /fixed|roots/);
  assert.equal(calls, 0);
  assert.equal(await driver.bootstrapTransferValidationCaseSixToolchain(input, execute), join(root, 'toolchain')); assert.equal(calls, 1);
  await assert.rejects(driver.bootstrapTransferValidationCaseSixToolchain(input, execute), /exists|conflict|immutable/); assert.equal(calls, 1);
});

test('case6 stage binds current operator manifest bytes and resumes its own fixed input without rewriting', async t => {
  const driver: any = await import('../../probes/transfer/validation-case-six-driver.ts');
  assert.equal(typeof driver?.stageTransferValidationCaseSixInput, 'function', 'Current C6 scope staging is missing.');
  const repository = await mkdtemp(join(tmpdir(), 'cosmos-C6-scope-')), source = fileURLToPath(new URL('../../', import.meta.url));
  t.after(async () => { assert.ok(resolve(repository).startsWith(resolve(tmpdir()) + '\\')); await rm(repository, { recursive: true, force: true }); });
  await mkdir(join(repository, 'probes/transfer'), { recursive: true });
  await cp(join(source, D.inputs.requirements.path), join(repository, D.inputs.requirements.path));
  await cp(join(source, 'templates/2d'), join(repository, 'templates/2d'), { recursive: true });
  await writeFile(join(repository, '.gitignore'), '.cosmos/\n', 'utf8');
  const signal = new AbortController().signal;
  const git = async (...args: string[]) => {
    const result = await runChild('git', ['-c', 'user.name=Source Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: repository, signal, timeoutMs: 5000 });
    assert.equal(result.code, 0); return result.stdout.trim();
  };
  await git('init', '--initial-branch=main'); await git('config', 'core.autocrlf', 'false'); await git('add', '.'); await git('commit', '-m', 'SOURCE only fixed inputs');
  const head = await git('rev-parse', 'HEAD'), frozen = await readTransferValidationCaseSixInput(repository);
  const root = join(repository, '.cosmos/e2e', D.caseId), ledgerRoot = join(repository, '.cosmos/validation-shared'); await mkdir(root, { recursive: true }); await mkdir(ledgerRoot, { recursive: true });
  await cp(join(repository, 'templates/2d'), join(root, 'toolchain'), { recursive: true });
  // This trusted stage seam tests byte binding; the complete historical verifier is exercised by admission tests.
  let bytes = Buffer.from('SOURCE-only historical manifest'), verified = 0;
  const manifestRef = { artifactId: D.caseId + '-historical-stages', version: createHash('sha256').update(bytes).digest('hex'), location: 'cos20-transfer-validation-6-reuse.json' };
  const historical = { originalRoot: join(repository, '.cosmos/e2e', OLD.caseId), targetRoot: root, manifestRef,
    readManifest: async () => bytes, verify: async () => { verified++; } };
  const quote = { declaration: D, identity: { reviewedPlatformSha: head, frozenCaseInputHash: 'f52b3846140b9b46733238ec5dc2a8d243c0145326f8c4f799bffc23d4bdc78c' },
    basis: { runId: 'SOURCE-only-run', ledgerId: 'SOURCE-only-ledger' } };
  const decision = { kind: 'operator_validation', decisionId: 'SOURCE-only', actorId: 'SOURCE-only', decidedAt: new Date().toISOString(),
    source: { artifactId: 'SOURCE-only-operator', version: 'v1', location: 'operator.json' }, sourceRefs: [manifestRef] };
  const receipt = Buffer.from(JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...decision, source: undefined, quote })); await writeFile(join(ledgerRoot, decision.source.location), receipt);
  const window = { caseId: D.caseId, windowId: 'SOURCE-only-current-C6', quote, operatorDecision: { ...decision, sourceSha256: createHash('sha256').update(receipt).digest('hex') } };
  const input: any = { repository, root, ledgerRoot, window, signal, controller: { requireValidationCase: () => {} } };
  const value = await driver.stageTransferValidationCaseSixInput(input, historical);
  assert.deepEqual(value.proposal, frozen.requirements.preparation); assert.equal(value.requirement.validation.caseId, D.caseId);
  assert.deepEqual(value.binding.historicalManifest.reference, manifestRef); assert.ok(verified > 0);
  const fixed = await readFile(join(root, 'requirements/fixed.json'));
  assert.deepEqual((await driver.stageTransferValidationCaseSixInput(input, historical, true)).requirement, value.requirement);
  assert.deepEqual(await readFile(join(root, 'requirements/fixed.json')), fixed);
  bytes = Buffer.from('SOURCE-only changed manifest');
  await assert.rejects(value.binding.readScope(signal), /manifest|digest/);
  assert.deepEqual(await readFile(join(root, 'requirements/fixed.json')), fixed);
});
