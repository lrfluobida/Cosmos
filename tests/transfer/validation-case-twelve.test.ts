import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VALIDATION_ROLES, validationInputHash, validateValidationDeclaration } from '../../src/runtime/validation-validation.ts';
import { prepareValidationBudgetGroup } from '../../src/runtime/validation-budget.ts';
import { validationBudgetGroup } from '../../src/contracts/budget.ts';
import { TRANSFER_VALIDATION_CASE_SIX as D6 } from '../../probes/transfer/validation-case-six-declaration.ts';
import { TRANSFER_CASE_ELEVEN_HISTORICAL_SOURCE } from '../../probes/transfer/validation-case-eleven-run.ts';
import { caseTwelveFeeData } from './validation-case-twelve.fixture.ts';
async function api() {
  const value: any = await import('../../probes/transfer/validation-case-twelve-declaration.ts').catch(() => null);
  assert.equal(typeof value?.deriveTransferValidationCaseTwelveDeclaration, 'function', 'Fixed C12 authorized declaration is missing.'); return value;
}
test('C12 fixes the new three yuan vector while actual C11 settled costs change group availability', async () => {
  const a = await api();
  for (const cost of [1_336_555, 1_100_000]) {
    const state = caseTwelveFeeData(cost), before = structuredClone(state), declaration = a.deriveTransferValidationCaseTwelveDeclaration(state);
    validateValidationDeclaration(declaration);
    assert.equal(declaration.caseId, 'cos20-transfer-validation-12');
    assert.deepEqual(Object.fromEntries(VALIDATION_ROLES.map(role => [role, declaration.grants[role].amountMicroCny])), { planning: 1, design: 1, art: 1, coding: 2_400_000, repair: 599_997 });
    assert.deepEqual(declaration.limits, { ...D6.limits, incrementalMicroCny: 3_000_000 });
    assert.deepEqual(declaration.outputTokens, D6.outputTokens); assert.equal(validationInputHash(declaration), validationInputHash(D6));
    const group = prepareValidationBudgetGroup(state, declaration)!;
    assert.equal(group.availableAllocationMicroCny, 4_205_748 + 1_336_555 - cost);
    assert.deepEqual(state, before);
  }
});
test('C12 rejects wrong original C11 counts costs roles closures repair or unknown history', async () => {
  const a = await api();
  for (const mutate of [
    (s: any) => Object.assign(s.ledger.entries.at(-1), { status: 'unknown', unknown: true, reservedMicroCny: 1 }),
    (s: any) => { s.ledger.entries.at(-1).evidence = []; }, (s: any) => { s.validation.cases.at(-1).stopReason = null; },
    (s: any) => { s.validation.cases.at(-1).repair = { taskId: 'old-repair' }; },
    (s: any) => { s.validation.cases.at(-1).quote.declaration.grants.coding.amountMicroCny++; },
    (s: any) => { s.ledger.allocationDelegations.at(-1).taskIds.reverse(); },
    (s: any) => { s.requests.at(-1).admittedAt = null; },
    (s: any) => { s.requests.at(-1).validation.windowId = 'wrong'; }, (s: any) => { s.requests.at(-1).validation.purpose = 'reviewer'; },
    (s: any) => { s.ledger.entries.at(-1).taskId = s.validation.cases.at(-1).quote.declaration.grants.repair.taskId; },
    (s: any) => { s.ledger.entries.pop(); s.requests.pop(); }, (s: any) => { s.ledger.entries.push(structuredClone(s.ledger.entries.at(-1))); },
    (s: any) => { s.ledger.allocationClosures.pop(); }, (s: any) => { s.ledger.entries.at(-1).settledMicroCny = 2_000_000; },
  ]) { const state = caseTwelveFeeData(); mutate(state); assert.throws(() => a.deriveTransferValidationCaseTwelveDeclaration(state)); }
});
test('C12 uses available allocation rather than unspent group balance and requires its exact original parent', async () => {
  const a = await api(), state = caseTwelveFeeData(), declaration = a.deriveTransferValidationCaseTwelveDeclaration(state);
  state.ledger.allocationClosures.splice(-7);
  assert.ok(validationBudgetGroup(state.ledger)!.remainingMicroCny > 3_000_000);
  assert.throws(() => prepareValidationBudgetGroup(state, declaration), /remaining original group capacity/);
  const wrong = caseTwelveFeeData(); wrong.ledger.allocations[0].amountMicroCny--;
  assert.throws(() => a.deriveTransferValidationCaseTwelveDeclaration(wrong), /parent/);
});
test('C12 fixed parser quote and accounting hash bind the new vector and all nineteen stopped cases', async () => {
  const a = await api(), entry: any = await import('../../probes/transfer/validation-case-twelve-entry.ts').catch(() => null);
  assert.equal(typeof entry?.createTransferCaseTwelveAdmissionQuote, 'function');
  assert.equal(a.parseTransferValidationCaseTwelveEntry(['--validation-preflight', 'a'.repeat(40)]).caseId, 'cos20-transfer-validation-12');
  for (const args of [[], ['--validation-case', 'a'.repeat(40)], ['--validation-preflight', 'a'.repeat(40), '--root'], ['--validation-case', 'a'.repeat(40), 'source', '--budget']]) assert.throws(() => a.parseTransferValidationCaseTwelveEntry(args), /Usage/);
  const state = caseTwelveFeeData(), quote = { declaration: a.deriveTransferValidationCaseTwelveDeclaration(state), basis: { revision: 5, snapshotSha256: 'a'.repeat(64), requestIds: state.ledger.entries.map((e: any) => e.requestId) } };
  const ref = { artifactId: 'cos20-transfer-validation-12-historical-stages', version: 'b'.repeat(64), location: 'cos20-transfer-validation-12-reuse.json' };
  const first = entry.createTransferCaseTwelveAdmissionQuote(quote, ref, []); assert.equal(first.formatVersion, 'transfer-case-twelve-admission/1');
  const wrong = structuredClone(quote); wrong.declaration.grants.coding.amountMicroCny++;
  assert.notEqual(first.admissionId, entry.createTransferCaseTwelveAdmissionQuote(wrong, ref, []).admissionId);
  state.allocationClosureDecisions = Array.from({ length: 17 }, (_, i) => ({ operatorDecision: { sourceSha256: `SOURCE-${i}` } }));
  const hash = entry.transferCaseTwelveHistoricalAccountingHash(state, quote), current = structuredClone(state);
  current.ledger.entries.push({ requestId: 'SOURCE-current', settledMicroCny: 1 });
  assert.equal(entry.transferCaseTwelveHistoricalAccountingHash(current, quote), hash);
  current.allocationClosureDecisions[16].operatorDecision.sourceSha256 = 'changed'; assert.notEqual(entry.transferCaseTwelveHistoricalAccountingHash(current, quote), hash);
});
test('C12 unknown admission rejects before host SDK or publication', async () => {
  const a: any = await import('../../probes/transfer/validation-case-twelve-entry.ts').catch(() => null);
  assert.equal(typeof a?.createFixedTransferValidationCaseTwelveEntry, 'function', 'Fixed C12 entry is missing.');
  const repository = await mkdtemp(join(tmpdir(), 'cos86-unknown-')), root = join(repository, '.cosmos/validation-shared'); await mkdir(root, { recursive: true });
  const state = caseTwelveFeeData(); Object.assign(state.ledger.entries.at(-1), { unknown: true, status: 'unknown', reservedMicroCny: 10 });
  const path = join(root, 'snapshot.json'); await writeFile(path, JSON.stringify(state), 'utf8');
  const before = await readFile(path), info = await stat(path), files = await readdir(root); let hostCalls = 0;
  const entry = a.createFixedTransferValidationCaseTwelveEntry(TRANSFER_CASE_ELEVEN_HISTORICAL_SOURCE);
  await assert.rejects(entry.runTransferValidationCaseTwelveWithHost({ repository, args: ['--validation-case', 'a'.repeat(40), 'SOURCE'], host: { prepare: async () => { hostCalls++; }, execute: async () => { hostCalls++; } } }), /unknown|reconcil/);
  assert.equal(hostCalls, 0); assert.deepEqual(await readFile(path), before); assert.equal((await stat(path)).mtimeMs, info.mtimeMs); assert.deepEqual(await readdir(root), files);
});
test('C12 source closure includes its fixed wrappers current plan feedback factory and worker', async () => {
  const a: any = await import('../../probes/transfer/validation-case-twelve-source.ts').catch(() => null);
  assert.equal(typeof a?.captureTransferCaseTwelveSource, 'function', 'Fixed C12 source closure is missing.');
  const source = await a.captureTransferCaseTwelveSource();
  for (const file of ['validation-case-twelve-run.ts', 'validation-case-twelve-driver.ts', 'validation-case-twelve-task.ts', '/src/providers/pi.ts', '/src/roles/factory.ts', '/src/runtime/repair/feedback.ts', 'validation-worker.ts']) assert.ok(source.files.some((f: any) => f.path.replaceAll('\\', '/').endsWith(file)), file);
  await a.requireTransferCaseTwelveSource(source);
  const wrong = structuredClone(source); wrong.files[0].sha256 = '0'.repeat(64); await assert.rejects(a.requireTransferCaseTwelveSource(wrong), /source|bytes|receipt/);
});
