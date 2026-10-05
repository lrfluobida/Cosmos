import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, readdir, stat, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { transferCaseSixFixture } from './validation-case-six.fixture.ts';
import { validationInputHash } from '../../src/runtime/validation-validation.ts';
import { TRANSFER_VALIDATION_CASE_FIVE } from '../../probes/transfer/validation-case-five-declaration.ts';

async function declaration() {
  const a: any = await import('../../probes/transfer/validation-case-six-declaration.ts').catch(() => null);
  assert.ok(a?.TRANSFER_VALIDATION_CASE_SIX, 'The fixed C6 declaration is missing.'); return a;
}
async function recordState(repository: string) {
  const rows: { path: string; mtimeMs: number; sha256?: string }[] = [];
  async function visit(path: string) {
    const info = await stat(join(repository, path));
    rows.push({ path, mtimeMs: info.mtimeMs, ...(info.isFile() ? { sha256: createHash('sha256').update(await readFile(join(repository, path))).digest('hex') } : {}) });
    if (info.isDirectory()) for (const name of (await readdir(join(repository, path))).sort()) await visit(path + '/' + name);
  }
  await visit('.cosmos'); return rows;
}

test('case6 fixes the original positive remaining grants, inputs and strict entry identity', async () => {
  const a = await declaration(), d = a.TRANSFER_VALIDATION_CASE_SIX;
  assert.equal(d.caseId, 'cos20-transfer-validation-6');
  assert.equal(d.formatVersion, 'validation-declaration-3');
  assert.deepEqual(Object.values(d.grants).map((g: any) => g.amountMicroCny), [323680, 598538, 2633322, 2122353, 2800000]);
  assert.equal(Object.values(d.grants).reduce((s: number, g: any) => s + g.amountMicroCny, 0), 8477893);
  assert.deepEqual(d.inputs, TRANSFER_VALIDATION_CASE_FIVE.inputs); assert.deepEqual(d.limits, TRANSFER_VALIDATION_CASE_FIVE.limits);
  assert.deepEqual(d.budgetGroup, TRANSFER_VALIDATION_CASE_FIVE.budgetGroup);
  assert.equal(validationInputHash(d), 'f52b3846140b9b46733238ec5dc2a8d243c0145326f8c4f799bffc23d4bdc78c');
  assert.ok(Object.isFrozen(d) && Object.isFrozen(d.grants));
  assert.deepEqual(a.parseTransferValidationCaseSixEntry(['--validation-preflight', 'a'.repeat(40)]), {
    caseId: d.caseId, reviewedPlatformSha: 'a'.repeat(40), preflightOnly: true, operatorSource: null, intentOnly: true });
  for (const args of [[], ['--validation-case', 'a'.repeat(40)], ['--validation-case', 'a'.repeat(40), 'source', '--manifest', 'path'],
    ['--validation-preflight', 'A'.repeat(40)], ['--validation-case', 'a'.repeat(40), 'x\nkey'], ['--resume', 'a'.repeat(40), 'source']]) {
    assert.throws(() => a.parseTransferValidationCaseSixEntry(args), /validation-case-six-run/);
  }
});

test('case6 fixed input uses the original frozen bytes and its own case identity', async () => {
  const a: any = await import('../../probes/transfer/validation-input.ts');
  assert.equal(typeof a.readTransferValidationCaseSixInput, 'function', 'The fixed C6 input reader is missing.');
  const value = await a.readTransferValidationCaseSixInput(fileURLToPath(new URL('../../', import.meta.url)));
  assert.equal(value.caseId, 'cos20-transfer-validation-6');
  assert.deepEqual(value.manifest, TRANSFER_VALIDATION_CASE_FIVE.inputs);
});

test('case6 production source pins bind the original C5 window and parent authorization', async () => {
  const a: any = await import('../../probes/transfer/validation-case-six-run.ts');
  assert.deepEqual(a.TRANSFER_CASE_SIX_HISTORICAL_SOURCE, {
    reviewedPlatformSha: '9e7f7718db048fc44301564396bd4d4457465550',
    windowId: 'validation-vq2-feb154cfb057113bbf4df26224e1616c6b13f7e94ec51438f7eb543f4fe5f971',
    parentAllocation: { index: 4, taskId: 'COS-16', amountMicroCny: 10000000,
      sha256: '48501ec1263c612a844d9069ad86c4d3f6098de66e79443e91b830368514253d',
      source: { artifactId: 'original-COS-16-allocation', version: 'revision-1414', location: 'snapshot.json#ledger/allocations/4' } },
    authorizationDecisionId: 'operator-933e62b3-489e-4189-bbe3-4f691f1fee22' });
  assert.ok(Object.isFrozen(a.TRANSFER_CASE_SIX_HISTORICAL_SOURCE.parentAllocation.source));
});

test('case6 authenticates the stopped C5 baseline and refuses source56 or missing manifest before effects', async t => {
  const a: any = await import('../../probes/transfer/validation-case-six-run.ts').catch(() => null);
  assert.equal(typeof a?.preflightTransferValidationCaseSixRun, 'function', 'The fixed C6 preflight is missing.');
  const f = await transferCaseSixFixture(t), snapshot = join(f.ledgerRoot, 'snapshot.json'), before = await readFile(snapshot), records = await recordState(f.repository);
  const { createFixedTransferValidationCaseSixEntry } = await import('../../probes/transfer/validation-case-six-entry.ts');
  const source = f.baseline.validation.cases[12], first = f.baseline.validation.cases[8];
  const entry = createFixedTransferValidationCaseSixEntry({ reviewedPlatformSha: source.quote.identity.reviewedPlatformSha, windowId: source.windowId,
    parentAllocation: first.quote.budgetGroup.parentAllocation, authorizationDecisionId: first.operatorDecision.decisionId });
  assert.equal(f.baseline.validation.cases.length, 13); assert.equal(f.baseline.ledger.allocationClosures.length, 65);
  assert.equal(f.baseline.allocationClosureDecisions.length, 11);
  const rows = f.baseline.requests.filter((r: any) => r.validation?.caseId === TRANSFER_VALIDATION_CASE_FIVE.caseId);
  assert.equal(rows.filter((r: any) => r.admittedAt !== null).length, 65); assert.equal(rows.length, 66);
  await assert.rejects(entry.preflightTransferValidationCaseSixRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /manifest|ENOENT/);
  await assert.rejects(a.preflightTransferValidationCaseSixRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /fixed original C5/);
  assert.deepEqual(await recordState(f.repository), records);
  const originalApprovals = new Map(['COS-54', 'COS-55', 'COS-56'].map(id => [id, structuredClone(f.mapping.tasks.find((item: any) => item.taskId === id))]));
  const unrelated = await f.git('commit-tree', f.head + '^{tree}', '-m', 'OFFLINE unrelated source'); let head = f.head;
  for (const id of originalApprovals.keys()) {
    for (const change of [{ reviewStatus: 'SOURCE_NOT_READY' }, { reviewStatus: 'READY' }, { integrationStatus: 'in-progress' }, { reviewedCommit: unrelated }, { mergeCommit: unrelated }]) {
      head = await f.updateMapping(mapping => {
        for (const [key, original] of originalApprovals) Object.assign(mapping.tasks.find((item: any) => item.taskId === key), original);
        Object.assign(mapping.tasks.find((item: any) => item.taskId === id), change);
      });
      await f.git('update-ref', 'refs/remotes/origin/main', head);
      await assert.rejects(entry.preflightTransferValidationCaseSixRun({ repository: f.repository, args: ['--validation-preflight', head] }), /COS-54|COS-55|COS-56|ancestor/);
      assert.deepEqual(await recordState(f.repository), records);
    }
  }
  head = await f.updateMapping(mapping => { for (const [id, original] of originalApprovals) Object.assign(mapping.tasks.find((item: any) => item.taskId === id), original); });
  await f.git('update-ref', 'refs/remotes/origin/main', f.head);
  await assert.rejects(entry.preflightTransferValidationCaseSixRun({ repository: f.repository, args: ['--validation-preflight', head] }), /pushed/);
  await f.git('update-ref', 'refs/remotes/origin/main', head);
  const dirty = join(f.repository, 'OFFLINE-untracked.txt'); await writeFile(dirty, 'OFFLINE', 'utf8');
  await assert.rejects(entry.preflightTransferValidationCaseSixRun({ repository: f.repository, args: ['--validation-preflight', head] }), /clean main/); await unlink(dirty);
  assert.deepEqual(await recordState(f.repository), records);
  const changed = structuredClone(f.baseline); changed.validation.cases[12].stopReason = null;
  await writeFile(snapshot, JSON.stringify(changed), 'utf8');
  await assert.rejects(entry.preflightTransferValidationCaseSixRun({ repository: f.repository, args: ['--validation-preflight', head] }), /stopped|manual|validation/i);
  await writeFile(snapshot, before);
});
