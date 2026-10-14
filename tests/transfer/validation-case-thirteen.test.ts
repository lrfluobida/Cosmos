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
import { caseThirteenFeeData } from './validation-case-thirteen.fixture.ts';
async function api() {
  const value: any = await import('../../probes/transfer/validation-case-thirteen-declaration.ts').catch(() => null);
  assert.equal(typeof value?.deriveTransferValidationCaseThirteenDeclaration, 'function', 'Fixed C13 authorized declaration is missing.'); return value;
}
test('C13 fixes the new two-and-a-half yuan vector while actual C12 settled costs change group availability', async () => {
  const a = await api();
  for (const cost of [1_664_926, 1_100_000]) {
    const state = caseThirteenFeeData(cost), before = structuredClone(state), declaration = a.deriveTransferValidationCaseThirteenDeclaration(state);
    validateValidationDeclaration(declaration);
    assert.equal(declaration.caseId, 'cos20-transfer-validation-13');
    assert.deepEqual(Object.fromEntries(VALIDATION_ROLES.map(role => [role, declaration.grants[role].amountMicroCny])), { planning: 1, design: 1, art: 1, coding: 1_900_000, repair: 599_997 });
    assert.deepEqual(declaration.limits, { ...D6.limits, incrementalMicroCny: 2_500_000 });
    assert.deepEqual(declaration.outputTokens, D6.outputTokens); assert.equal(validationInputHash(declaration), validationInputHash(D6));
    const history = a.transferCaseThirteenHistory(state);
    assert.equal(history.length, 12);
    for (const old of history.slice(-3)) assert.equal(old.limits.incrementalMicroCny, 3_000_000);
    assert.equal(state.validation.cases.length, 20); assert.equal(state.ledger.allocationDelegations.length, 12);
    const group = prepareValidationBudgetGroup(state, declaration)!;
    assert.equal(group.availableAllocationMicroCny, 2_540_822 + 1_664_926 - cost);
    assert.deepEqual(state, before);
  }
});
test('C13 rejects wrong original C12 counts costs roles closures repair or unknown history', async () => {
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
  ]) { const state = caseThirteenFeeData(); mutate(state); assert.throws(() => a.deriveTransferValidationCaseThirteenDeclaration(state)); }
});
test('C13 uses available allocation rather than unspent group balance and requires its exact original parent', async () => {
  const a = await api(), state = caseThirteenFeeData(), declaration = a.deriveTransferValidationCaseThirteenDeclaration(state);
  state.ledger.allocationClosures.splice(-7);
  assert.ok(validationBudgetGroup(state.ledger)!.remainingMicroCny > 2_500_000);
  assert.throws(() => prepareValidationBudgetGroup(state, declaration), /remaining original group capacity/);
  const wrong = caseThirteenFeeData(); wrong.ledger.allocations[0].amountMicroCny--;
  assert.throws(() => a.deriveTransferValidationCaseThirteenDeclaration(wrong), /parent/);
});
test('C13 fixed parser quote and accounting hash bind the new vector and all twenty stopped cases', async () => {
  const a = await api(), entry: any = await import('../../probes/transfer/validation-case-thirteen-entry.ts').catch(() => null);
  assert.equal(typeof entry?.createTransferCaseThirteenAdmissionQuote, 'function');
  assert.equal(a.parseTransferValidationCaseThirteenEntry(['--validation-preflight', 'a'.repeat(40)]).caseId, 'cos20-transfer-validation-13');
  for (const args of [[], ['--validation-case', 'a'.repeat(40)], ['--validation-preflight', 'a'.repeat(40), '--root'], ['--validation-case', 'a'.repeat(40), 'source', '--budget']]) assert.throws(() => a.parseTransferValidationCaseThirteenEntry(args), /Usage/);
  const state = caseThirteenFeeData(), quote = { declaration: a.deriveTransferValidationCaseThirteenDeclaration(state), basis: { revision: 5, snapshotSha256: 'a'.repeat(64), requestIds: state.ledger.entries.map((e: any) => e.requestId) } };
  const ref = { artifactId: 'cos20-transfer-validation-13-historical-stages', version: 'b'.repeat(64), location: 'cos20-transfer-validation-13-reuse.json' };
  const first = entry.createTransferCaseThirteenAdmissionQuote(quote, ref, []); assert.equal(first.formatVersion, 'transfer-case-thirteen-admission/1');
  const wrong = structuredClone(quote); wrong.declaration.grants.coding.amountMicroCny++;
  assert.notEqual(first.admissionId, entry.createTransferCaseThirteenAdmissionQuote(wrong, ref, []).admissionId);
  state.allocationClosureDecisions = Array.from({ length: 18 }, (_, i) => ({ operatorDecision: { sourceSha256: `SOURCE-${i}` } }));
  const hash = entry.transferCaseThirteenHistoricalAccountingHash(state, quote), current = structuredClone(state);
  current.ledger.entries.push({ requestId: 'SOURCE-current', settledMicroCny: 1 });
  assert.equal(entry.transferCaseThirteenHistoricalAccountingHash(current, quote), hash);
  current.allocationClosureDecisions[17].operatorDecision.sourceSha256 = 'changed'; assert.notEqual(entry.transferCaseThirteenHistoricalAccountingHash(current, quote), hash);
});
test('C13 unknown admission rejects before host SDK or publication', async () => {
  const a: any = await import('../../probes/transfer/validation-case-thirteen-entry.ts').catch(() => null);
  assert.equal(typeof a?.createFixedTransferValidationCaseThirteenEntry, 'function', 'Fixed C13 entry is missing.');
  const repository = await mkdtemp(join(tmpdir(), 'cos88-unknown-')), root = join(repository, '.cosmos/validation-shared'); await mkdir(root, { recursive: true });
  const state = caseThirteenFeeData(); Object.assign(state.ledger.entries.at(-1), { unknown: true, status: 'unknown', reservedMicroCny: 10 });
  const path = join(root, 'snapshot.json'); await writeFile(path, JSON.stringify(state), 'utf8');
  const before = await readFile(path), info = await stat(path), files = await readdir(root); let hostCalls = 0;
  const entry = a.createFixedTransferValidationCaseThirteenEntry(TRANSFER_CASE_ELEVEN_HISTORICAL_SOURCE);
  await assert.rejects(entry.runTransferValidationCaseThirteenWithHost({ repository, args: ['--validation-case', 'a'.repeat(40), 'SOURCE'], host: { prepare: async () => { hostCalls++; }, execute: async () => { hostCalls++; } } }), /unknown|reconcil/);
  assert.equal(hostCalls, 0); assert.deepEqual(await readFile(path), before); assert.equal((await stat(path)).mtimeMs, info.mtimeMs); assert.deepEqual(await readdir(root), files);
});
test('C13 source closure includes its fixed wrappers current plan feedback factory and worker', async () => {
  const a: any = await import('../../probes/transfer/validation-case-thirteen-source.ts').catch(() => null);
  assert.equal(typeof a?.captureTransferCaseThirteenSource, 'function', 'Fixed C13 source closure is missing.');
  const source = await a.captureTransferCaseThirteenSource();
  for (const file of ['validation-case-thirteen-run.ts', 'validation-case-thirteen-driver.ts', 'validation-case-thirteen-task.ts', '/src/providers/pi.ts', '/src/roles/factory.ts', '/src/runtime/repair/feedback.ts', 'validation-worker.ts']) assert.ok(source.files.some((f: any) => f.path.replaceAll('\\', '/').endsWith(file)), file);
  await a.requireTransferCaseThirteenSource(source);
  const wrong = structuredClone(source); wrong.files[0].sha256 = '0'.repeat(64); await assert.rejects(a.requireTransferCaseThirteenSource(wrong), /source|bytes|receipt/);
});
