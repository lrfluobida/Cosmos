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
import { caseFourteenFeeData } from './validation-case-fourteen.fixture.ts';
async function api() {
  const value: any = await import('../../probes/transfer/validation-case-fourteen-declaration.ts').catch(() => null);
  assert.equal(typeof value?.deriveTransferValidationCaseFourteenDeclaration, 'function', 'Fixed C14 authorized declaration is missing.'); return value;
}
test('C14 fixes the new two-and-a-half yuan vector while actual C13 settled costs change group availability', async () => {
  const a = await api();
  for (const cost of [1_641_136, 1_100_000]) {
    const state = caseFourteenFeeData(cost), before = structuredClone(state), declaration = a.deriveTransferValidationCaseFourteenDeclaration(state);
    validateValidationDeclaration(declaration);
    assert.equal(declaration.caseId, 'cos20-transfer-validation-14');
    assert.deepEqual(Object.fromEntries(VALIDATION_ROLES.map(role => [role, declaration.grants[role].amountMicroCny])), { planning: 1, design: 1, art: 1, coding: 1_900_000, repair: 599_997 });
    assert.deepEqual(declaration.limits, { ...D6.limits, incrementalMicroCny: 2_500_000 });
    assert.deepEqual(declaration.outputTokens, D6.outputTokens); assert.equal(validationInputHash(declaration), validationInputHash(D6));
    const history = a.transferCaseFourteenHistory(state);
    assert.equal(history.length, 13);
    for (const old of history.slice(-4, -1)) assert.equal(old.limits.incrementalMicroCny, 3_000_000);
    assert.equal(state.validation.cases.length, 21); assert.equal(state.ledger.allocationDelegations.length, 13);
    const group = validationBudgetGroup(state.ledger)!;
    assert.equal(group.limitMicroCny - group.allocatedMicroCny, 899_686 + 1_641_136 - cost);
    assert.throws(() => prepareValidationBudgetGroup(state, declaration), /remaining authenticated group capacity/);
    assert.deepEqual(state, before);
  }
});
test('C14 rejects wrong original C13 counts costs roles closures repair or unknown history', async () => {
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
  ]) { const state = caseFourteenFeeData(); mutate(state); assert.throws(() => a.deriveTransferValidationCaseFourteenDeclaration(state)); }
});
test('C14 uses available allocation rather than unspent group balance and requires its exact original parent', async () => {
  const a = await api(), state = caseFourteenFeeData(1_100_000), declaration = a.deriveTransferValidationCaseFourteenDeclaration(state);
  state.ledger.allocationClosures.splice(-7);
  const group = validationBudgetGroup(state.ledger)!;
  assert.ok(group.remainingMicroCny > group.limitMicroCny - group.allocatedMicroCny);
  assert.throws(() => prepareValidationBudgetGroup(state, declaration), /remaining authenticated group capacity/);
  const wrong = caseFourteenFeeData(); wrong.ledger.allocations[0].amountMicroCny--;
  assert.throws(() => prepareValidationBudgetGroup(wrong, a.deriveTransferValidationCaseFourteenDeclaration(wrong)), /parent/);
});
test('C14 fixed parser quote and accounting hash bind the new vector and all twenty-one stopped cases', async () => {
  const a = await api(), entry: any = await import('../../probes/transfer/validation-case-fourteen-entry.ts').catch(() => null);
  assert.equal(typeof entry?.createTransferCaseFourteenAdmissionQuote, 'function');
  assert.equal(a.parseTransferValidationCaseFourteenEntry(['--validation-preflight', 'a'.repeat(40)]).caseId, 'cos20-transfer-validation-14');
  for (const args of [[], ['--validation-case', 'a'.repeat(40)], ['--validation-preflight', 'a'.repeat(40), '--root'], ['--validation-case', 'a'.repeat(40), 'source', '--budget']]) assert.throws(() => a.parseTransferValidationCaseFourteenEntry(args), /Usage/);
  const state = caseFourteenFeeData(), quote = { declaration: a.deriveTransferValidationCaseFourteenDeclaration(state), basis: { revision: 5, snapshotSha256: 'a'.repeat(64), requestIds: state.ledger.entries.map((e: any) => e.requestId) } };
  const ref = { artifactId: 'cos20-transfer-validation-14-historical-stages', version: 'b'.repeat(64), location: 'cos20-transfer-validation-14-reuse.json' };
  const first = entry.createTransferCaseFourteenAdmissionQuote(quote, ref, []); assert.equal(first.formatVersion, 'transfer-case-fourteen-admission/1');
  const wrong = structuredClone(quote); wrong.declaration.grants.coding.amountMicroCny++;
  assert.notEqual(first.admissionId, entry.createTransferCaseFourteenAdmissionQuote(wrong, ref, []).admissionId);
  state.allocationClosureDecisions = Array.from({ length: 19 }, (_, i) => ({ operatorDecision: { sourceSha256: `SOURCE-${i}` } }));
  const hash = entry.transferCaseFourteenHistoricalAccountingHash(state, quote), current = structuredClone(state);
  current.ledger.entries.push({ requestId: 'SOURCE-current', settledMicroCny: 1 });
  assert.equal(entry.transferCaseFourteenHistoricalAccountingHash(current, quote), hash);
  current.allocationClosureDecisions[18].operatorDecision.sourceSha256 = 'changed'; assert.notEqual(entry.transferCaseFourteenHistoricalAccountingHash(current, quote), hash);
});
test('C14 unknown admission rejects before host SDK or publication', async () => {
  const a: any = await import('../../probes/transfer/validation-case-fourteen-entry.ts').catch(() => null);
  assert.equal(typeof a?.createFixedTransferValidationCaseFourteenEntry, 'function', 'Fixed C14 entry is missing.');
  const repository = await mkdtemp(join(tmpdir(), 'cos91-unknown-')), root = join(repository, '.cosmos/validation-shared'); await mkdir(root, { recursive: true });
  const state = caseFourteenFeeData(); Object.assign(state.ledger.entries.at(-1), { unknown: true, status: 'unknown', reservedMicroCny: 10 });
  const path = join(root, 'snapshot.json'); await writeFile(path, JSON.stringify(state), 'utf8');
  const before = await readFile(path), info = await stat(path), files = await readdir(root); let hostCalls = 0;
  const entry = a.createFixedTransferValidationCaseFourteenEntry(TRANSFER_CASE_ELEVEN_HISTORICAL_SOURCE);
  await assert.rejects(entry.runTransferValidationCaseFourteenWithHost({ repository, args: ['--validation-case', 'a'.repeat(40), 'SOURCE'], host: { prepare: async () => { hostCalls++; }, execute: async () => { hostCalls++; } } }), /unknown|reconcil/);
  assert.equal(hostCalls, 0); assert.deepEqual(await readFile(path), before); assert.equal((await stat(path)).mtimeMs, info.mtimeMs); assert.deepEqual(await readdir(root), files);
});
test('C14 source closure includes its fixed wrappers current plan feedback factory and worker', async () => {
  const a: any = await import('../../probes/transfer/validation-case-fourteen-source.ts').catch(() => null);
  assert.equal(typeof a?.captureTransferCaseFourteenSource, 'function', 'Fixed C14 source closure is missing.');
  const source = await a.captureTransferCaseFourteenSource();
  for (const file of ['validation-case-fourteen-run.ts', 'validation-case-fourteen-driver.ts', 'validation-case-fourteen-task.ts', '/src/providers/pi.ts', '/src/roles/factory.ts', '/src/runtime/repair/feedback.ts', 'validation-worker.ts']) assert.ok(source.files.some((f: any) => f.path.replaceAll('\\', '/').endsWith(file)), file);
  await a.requireTransferCaseFourteenSource(source);
  const wrong = structuredClone(source); wrong.files[0].sha256 = '0'.repeat(64); await assert.rejects(a.requireTransferCaseFourteenSource(wrong), /source|bytes|receipt/);
});
