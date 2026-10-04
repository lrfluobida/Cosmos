import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { transferValidationFixture } from './validation-run.fixture.ts';
import { validationInputHash } from '../../src/runtime/validation-validation.ts';
import { VALIDATION_CASE } from '../../probes/e2e/validation-declaration.ts';
import { TRANSFER_VALIDATION_CASE } from '../../probes/transfer/validation-declaration.ts';

async function api() {
  const module: any = await import('../../probes/transfer/validation-run.ts').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
  assert.equal(typeof module.preflightTransferValidationRun, 'function', 'COS43 read-only historical gate is missing'); return module;
}
test('new transfer preflight authenticates eight consumed histories and six old closure inputs without a write', async t => {
  const a = await api(), f = await transferValidationFixture(t), before = await readFile(join(f.ledgerRoot, 'snapshot.json'));
  const old = JSON.parse(before.toString('utf8'));
  assert.equal(old.allocationClosureDecisions.length, 6);
  assert.ok(old.allocationClosureDecisions.every((receipt: any) => receipt.quote.identity.frozenCaseInputHash === validationInputHash(VALIDATION_CASE)));
  const result = await a.preflightTransferValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] });
  assert.equal(result.outcome, 'ready'); assert.equal(result.paidRequests, 0);
  assert.equal(result.quote.formatVersion, 'validation-case-quote-2');
  assert.equal(result.quote.identity.frozenCaseInputHash, validationInputHash(TRANSFER_VALIDATION_CASE));
  assert.equal(result.quote.budgetGroup.parentAllocation.amountMicroCny, 10_000_000);
  assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before);
  assert.equal((await readdir(join(f.repository, '.cosmos/e2e'))).includes(TRANSFER_VALIDATION_CASE.caseId), false);
});
test('pending source41, duplicate markers and unrelated legacy failure reject before host preparation or claim', async t => {
  const a = await api(), f = await transferValidationFixture(t);
  let prepared = 0;
  const host = { prepare: async () => { prepared++; }, execute: async () => { throw new Error('Must not execute'); } };
  for (const change of [
    (mapping: any) => { const item = mapping.tasks.find((item: any) => item.taskId === 'COS-41'); item.reviewStatus = 'SOURCE_NOT_READY'; item.reviewedCommit = null; },
    (mapping: any) => { const item = mapping.tasks.find((item: any) => item.taskId === 'COS-41'); item.reviewStatus = 'TRANSFER_DESIGN_FEEDBACK_SOURCE_READY'; item.reviewedCommit = f.head; mapping.tasks.push({ ...item }); },
    (mapping: any) => { mapping.tasks = mapping.tasks.filter((item: any, index: number) => item.taskId !== 'COS-41' || index === mapping.tasks.findIndex((value: any) => value.taskId === 'COS-41')); mapping.tasks.find((item: any) => item.taskId === 'COS-23').integrationStatus = 'actual-validation-failed-author-handoff'; },
  ]) {
    const head = await f.updateMapping(change), before = await readFile(join(f.ledgerRoot, 'snapshot.json'));
    await assert.rejects(a.runTransferValidationWithHost({ repository: f.repository, args: ['--validation-case', head, 'OFFLINE source'], host }), /reviewed|source|COS-/i);
    assert.equal(prepared, 0); assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before);
  }
});
test('historical closure source bytes are authenticated against their original receipts', async t => {
  const a = await api(), f = await transferValidationFixture(t), state = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8'));
  const file = join(f.ledgerRoot, state.allocationClosureDecisions[0].operatorDecision.source.location);
  await writeFile(file, (await readFile(file, 'utf8')) + ' ', 'utf8');
  await assert.rejects(a.preflightTransferValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /closure|source/i);
});
test('unmerged reviewed source and committed transfer input drift cannot authorize the actual clean SHA', async t => {
  const a = await api(), f = await transferValidationFixture(t), before = await readFile(join(f.ledgerRoot, 'snapshot.json'));
  await f.git('switch', '-c', 'offline-unmerged'); await writeFile(join(f.repository, 'unmerged.txt'), 'OFFLINE separate source\n', 'utf8');
  await f.git('add', '.'); await f.git('commit', '-m', 'Offline unmerged source'); const unmerged = await f.git('rev-parse', 'HEAD'); await f.git('switch', 'main');
  let head = await f.updateMapping(mapping => { mapping.tasks.find((item: any) => item.taskId === 'COS-42').reviewedCommit = unmerged; });
  await assert.rejects(a.preflightTransferValidationRun({ repository: f.repository, args: ['--validation-preflight', head] }), /ancestor|source/i);
  await f.updateMapping(mapping => { mapping.tasks.find((item: any) => item.taskId === 'COS-42').reviewedCommit = f.head; });
  await writeFile(join(f.repository, TRANSFER_VALIDATION_CASE.inputs.requirements.path), '{}\n', 'utf8');
  await f.git('add', '.'); await f.git('commit', '-m', 'Offline committed input drift'); head = await f.git('rev-parse', 'HEAD');
  await assert.rejects(a.preflightTransferValidationRun({ repository: f.repository, args: ['--validation-preflight', head] }), /fixed|input|changed/i);
  assert.deepEqual(await readFile(join(f.ledgerRoot, 'snapshot.json')), before);
});
test('one grouped claim preserves original histories, audit bytes, parent and clock while consuming only the new identity', async t => {
  const a = await api(), f = await transferValidationFixture(t), beforeBytes = await readFile(join(f.ledgerRoot, 'snapshot.json')), before = JSON.parse(beforeBytes.toString('utf8'));
  const result = await a.runTransferValidationWithHost({ repository: f.repository, args: f.args, host: { prepare: async () => {}, execute: async () => ({ outcome: 'failed', gaps: ['OFFLINE no generated game'] }) } });
  const after = JSON.parse(await readFile(join(f.ledgerRoot, 'snapshot.json'), 'utf8'));
  assert.equal(result.outcome, 'failed'); assert.equal(after.ledger.contractVersion, '4.0.0');
  assert.deepEqual(after.validation.cases.slice(0, 8), before.validation.cases);
  assert.deepEqual(after.allocationClosureDecisions, before.allocationClosureDecisions);
  assert.deepEqual(after.ledger.entries, before.ledger.entries); assert.deepEqual(after.ledger.allocationClosures, before.ledger.allocationClosures);
  assert.deepEqual(after.ledger.allocations.slice(0, before.ledger.allocations.length), before.ledger.allocations);
  assert.equal(after.ledger.allocationDelegations.length, 1); assert.equal(after.validation.currentCaseId, TRANSFER_VALIDATION_CASE.caseId);
  assert.equal(after.run.originalStartedAt, before.run.originalStartedAt); assert.equal(after.run.originalDeadlineAt, before.run.originalDeadlineAt);
  assert.deepEqual(after.run.humanDecisions, []); assert.deepEqual(after.stopReason, before.stopReason);
  await assert.rejects(a.preflightTransferValidationRun({ repository: f.repository, args: ['--validation-preflight', f.head] }), /exists|consumed|claim/i);
});
