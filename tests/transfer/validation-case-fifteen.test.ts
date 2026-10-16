import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { sameValue } from '../../src/contracts/validation.ts';
import { validationInputHash } from '../../src/runtime/validation-validation.ts';
import { TRANSFER_VALIDATION_CASE_FIVE as D5 } from '../../probes/transfer/validation-case-five-declaration.ts';
import { completeTransferValidationCaseFifteen, requireTransferCaseFifteenSourceApprovals } from '../../probes/transfer/validation-case-fifteen-entry.ts';
import { TRANSFER_VALIDATION_CASE_FIFTEEN as D } from '../../probes/transfer/validation-case-fifteen-declaration.ts';
import { supplementFixture } from '../runtime/validation-group-supplement.fixture.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';

test('C15 has an independent fixed entry and quote1 admission envelope', async () => {
  const entry: any = await import('../../probes/transfer/validation-case-fifteen-entry.ts').catch(() => null);
  assert.equal(typeof entry?.createFixedTransferValidationCaseFifteenEntry, 'function', 'Fixed nongrouped C15 entry is missing.');
  const { TRANSFER_VALIDATION_CASE_FIFTEEN: D, parseTransferValidationCaseFifteenEntry: parse } = await import('../../probes/transfer/validation-case-fifteen-declaration.ts');
  assert.notEqual(validationInputHash(D), validationInputHash(D5)); assert.equal(D.budgetGroup, undefined);
  assert.equal(parse(['--validation-preflight', 'a'.repeat(40)]).caseId, D.caseId);
  for (const args of [[], ['--validation-case', 'a'.repeat(40)], ['--validation-preflight', 'a'.repeat(40), '--root'], ['--validation-case', 'a'.repeat(40), 'SOURCE', '--budget']]) assert.throws(() => parse(args), /Usage/);
  const quote: any = { declaration: D, formatVersion: 'validation-case-quote-1', basis: { revision: 3114, snapshotSha256: 'a'.repeat(64), requestIds: [] } };
  const manifest = { artifactId: `${D.caseId}-historical-stages`, version: 'b'.repeat(64), location: `${D.caseId}-reuse.json` };
  const envelope = entry.createTransferCaseFifteenAdmissionQuote(quote, manifest, []);
  assert.equal(envelope.formatVersion, 'transfer-case-fifteen-admission/1');
  assert.equal(envelope.allocationSource, 'shared-unallocated');
  const changed = structuredClone(quote); changed.declaration.grants.coding.amountMicroCny++;
  assert.notEqual(envelope.admissionId, entry.createTransferCaseFifteenAdmissionQuote(changed, manifest, []).admissionId);
});

test('C15 source approvals require this task own independently reviewed integrated SHA', async () => {
  const mapping = JSON.parse(await readFile(new URL('../../docs/specs/github-issues.json', import.meta.url), 'utf8'));
  mapping.tasks = mapping.tasks.filter((item: any) => item.taskId !== 'COS-101');
  assert.throws(() => requireTransferCaseFifteenSourceApprovals(mapping), /COS-101/);
  mapping.tasks.push({ taskId: 'COS-101', reviewedCommit: 'a'.repeat(40), mergeCommit: 'b'.repeat(40), reviewStatus: 'TRANSFER_CASE_FIFTEEN_SOURCE_READY', integrationStatus: 'source-integrated' });
  assert.ok(requireTransferCaseFifteenSourceApprovals(mapping).some(item => item.taskId === 'COS-101'));
});

test('C15 completion releases its real controller owner before publishing a cleanup endpoint', async t => {
  for (const mode of ['normal', 'failed-close', 'stopped', 'late-close']) await t.test(mode, async t => {
  const failClose = mode === 'failed-close';
  const f = await supplementFixture(t, true), quote = await RunController.prepareValidationGroupSupplement(f);
  await RunController.applyValidationGroupSupplement({ ...f, quote, decision: await f.decision(quote) });
  const c14 = await f.claim(f.target); await f.charge(c14, 'coding', 792_063); await f.close(c14);
  for (const file of [D.inputs.requirements, ...D.inputs.template.files]) {
    const path = join(f.repositoryRoot, file.path); await mkdir(dirname(path), { recursive: true }); await writeFile(path, await readFile(new URL('../../' + file.path, import.meta.url)));
  }
  f.setCurrent(D); const value = await f.claim(D), root = join(f.repositoryRoot, '.cosmos/e2e', D.caseId); await mkdir(root, { recursive: true });
  const input: any = { repository: f.repositoryRoot, ledgerRoot: f.root, root, controller: value.controller, window: value.window, work: new OwnedWork(value.controller.signal), signal: value.controller.signal };
  const historical: any = { manifestRef: { artifactId: `${D.caseId}-historical-stages`, version: 'a'.repeat(64), location: `${D.caseId}-reuse.json` }, verify: async () => ({}) };
  if (mode === 'stopped') await value.controller.stop('SOURCE boundary stopped before host completion.');
  const originalClose = value.controller.close.bind(value.controller);
  let clock: ReturnType<typeof t.mock.method> | undefined;
  const close = failClose ? t.mock.method(value.controller, 'close', async () => { throw new Error('SOURCE owner release failed'); })
    : mode === 'late-close' ? t.mock.method(value.controller, 'close', async () => { await originalClose(); clock = t.mock.method(Date, 'now', () => Date.parse(value.window.deadlineAt) + 1); }) : undefined;
  try {
    const report = await completeTransferValidationCaseFifteen(input, historical, [], { outcome: 'failed', gaps: ['SOURCE no generation: owner lifecycle representative.'] });
    assert.equal(report.outcome, 'failed');
    if (failClose) {
      assert.equal(report.cleanupEndedAt, undefined); assert.ok(report.gaps.includes('Current controller ownership was not released.'));
      assert.ok(await lstat(join(f.root, '.controller.lock')));
    } else { await assert.rejects(lstat(join(f.root, '.controller.lock')), (error: any) => error.code === 'ENOENT'); assert.ok(report.cleanupEndedAt); }
    if (mode === 'late-close') assert.ok(report.gaps.includes('Controller release exceeded the fixed C15 deadline.'));
    if (mode === 'stopped') assert.ok(report.gaps.includes('A separate stop preceded normal completion.'));
    const saved = JSON.parse(await readFile(join(root, 'result.json'), 'utf8')); assert.deepEqual(saved, report);
  } finally { clock?.mock.restore(); close?.mock.restore(); await originalClose(); }
  });
});

test('C15 input preserves the complete Chinese requirements and preparation except the old group', async () => {
  const old = JSON.parse(await readFile(new URL('../../probes/transfer/requirements.json', import.meta.url), 'utf8'));
  const current = JSON.parse(await readFile(new URL('../../probes/transfer/requirements-case-fifteen.json', import.meta.url), 'utf8'));
  delete old.budgetGroup; assert.ok(sameValue(old, current)); assert.equal(current.budgetGroup, undefined);
});

test('C15 source closure includes its own wrappers, real host, factory, Pi and dynamic workers', async () => {
  const api: any = await import('../../probes/transfer/validation-case-fifteen-source.ts').catch(() => null);
  assert.equal(typeof api?.captureTransferCaseFifteenSource, 'function', 'C15 fixed executable closure is missing.');
  const closure = await api.captureTransferCaseFifteenSource();
  for (const suffix of ['validation-case-fifteen-run.ts', 'validation-case-fifteen-driver.ts', 'validation-case-fifteen-task.ts', 'src/runtime/entrypoint-host.ts', 'src/providers/pi.ts', 'src/roles/factory.ts', 'validation-worker.ts', 'coding-check-worker.ts'])
    assert.ok(closure.files.some((file: any) => file.path.replaceAll('\\', '/').endsWith(suffix)), suffix);
  await api.requireTransferCaseFifteenSource(closure);
  const wrong = structuredClone(closure); wrong.files[0].sha256 = '0'.repeat(64);
  await assert.rejects(api.requireTransferCaseFifteenSource(wrong), /source|bytes|receipt/);
});
