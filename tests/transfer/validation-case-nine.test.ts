import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VALIDATION_ROLES, validationInputHash, validateValidationDeclaration } from '../../src/runtime/validation-validation.ts';
import { TRANSFER_VALIDATION_CASE_SIX as D6 } from '../../probes/transfer/validation-case-six-declaration.ts';
import { TRANSFER_CASE_EIGHT_HISTORICAL_SOURCE } from '../../probes/transfer/validation-case-eight-run.ts';
import { caseNineFeeData } from './validation-case-nine.fixture.ts';
async function api() {
  const value: any = await import('../../probes/transfer/validation-case-nine-declaration.ts').catch(() => null);
  assert.equal(typeof value?.deriveTransferValidationCaseNineDeclaration, 'function', 'Fixed C9 settled declaration is missing.'); return value;
}
test('C9 derives each original role remainder from two settled C8 costs without changing declared limits', async () => {
  const a = await api();
  for (const cost of [487_528, 600_000]) {
    const state = caseNineFeeData(cost), declaration = a.deriveTransferValidationCaseNineDeclaration(state);
    validateValidationDeclaration(declaration); assert.equal(declaration.caseId, 'cos20-transfer-validation-9');
    assert.deepEqual(Object.fromEntries(VALIDATION_ROLES.map(role => [role, declaration.grants[role].amountMicroCny])), state.expected);
    assert.deepEqual(declaration.limits, D6.limits); assert.deepEqual(declaration.outputTokens, D6.outputTokens);
    assert.equal(validationInputHash(declaration), validationInputHash(D6));
    assert.equal(Object.values(declaration.grants).reduce((n: number, g: any) => n + g.amountMicroCny, 0), 10_000_000 - state.ledger.entries.reduce((n: number, e: any) => n + e.settledMicroCny, 0));
  }
});
test('C9 refuses unresolved unclosed wrong-role or repaired C8 history', async () => {
  const a = await api();
  for (const mutate of [
    (s: any) => Object.assign(s.ledger.entries.at(-1), { status: 'unknown', unknown: true, reservedMicroCny: 1 }),
    (s: any) => { s.ledger.entries.at(-1).evidence = []; },
    (s: any) => { s.validation.cases.at(-1).stopReason = null; },
    (s: any) => { s.validation.cases.at(-1).repair = { taskId: 'old-repair' }; },
    (s: any) => { s.validation.cases.at(-1).quote.declaration.grants.coding.amountMicroCny++; },
    (s: any) => { s.ledger.allocationDelegations.at(-1).taskIds.reverse(); },
    (s: any) => { s.requests.at(-1).validation.windowId = 'wrong'; },
    (s: any) => { s.requests.at(-1).validation.purpose = 'reviewer'; },
    (s: any) => { s.ledger.entries.at(-1).taskId = s.validation.cases.at(-1).quote.declaration.grants.repair.taskId; },
    (s: any) => { s.ledger.entries.pop(); s.requests.pop(); },
    (s: any) => { s.ledger.entries.push(structuredClone(s.ledger.entries.at(-1))); },
    (s: any) => { s.ledger.allocationClosures.pop(); },
    (s: any) => { s.ledger.entries.at(-1).settledMicroCny = 2_000_000; },
  ]) { const state = caseNineFeeData(); mutate(state); assert.throws(() => a.deriveTransferValidationCaseNineDeclaration(state)); }
});
test('C9 fixed parser and quote own the ninth identity and exact fee prefix', async () => {
  const a = await api(), entry: any = await import('../../probes/transfer/validation-case-nine-entry.ts').catch(() => null);
  assert.equal(typeof entry?.createTransferCaseNineAdmissionQuote, 'function', 'Fixed C9 quote is missing.');
  assert.equal(a.parseTransferValidationCaseNineEntry(['--validation-preflight', 'a'.repeat(40)]).caseId, 'cos20-transfer-validation-9');
  for (const args of [[], ['--validation-case', 'a'.repeat(40)], ['--validation-preflight', 'a'.repeat(40), '--root'], ['--validation-case', 'a'.repeat(40), 'source', '--budget']]) assert.throws(() => a.parseTransferValidationCaseNineEntry(args), /Usage/);
  const state = caseNineFeeData(), quote = { declaration: a.deriveTransferValidationCaseNineDeclaration(state), basis: { revision: 5, snapshotSha256: 'a'.repeat(64), requestIds: state.ledger.entries.map((e: any) => e.requestId) } };
  const ref = { artifactId: 'cos20-transfer-validation-9-historical-stages', version: 'b'.repeat(64), location: 'cos20-transfer-validation-9-reuse.json' };
  const first = entry.createTransferCaseNineAdmissionQuote(quote, ref, []); assert.equal(first.formatVersion, 'transfer-case-nine-admission/1');
  assert.notEqual(first.admissionId, entry.createTransferCaseNineAdmissionQuote({ ...quote, declaration: a.deriveTransferValidationCaseNineDeclaration(caseNineFeeData(600_000)) }, ref, []).admissionId);
  state.allocationClosureDecisions = Array.from({ length: 14 }, (_, i) => ({ operatorDecision: { sourceSha256: `SOURCE-${i}` } }));
  const hash = entry.transferCaseNineHistoricalAccountingHash(state, quote), current = structuredClone(state);
  current.validation.cases.push({ caseId: 'cos20-transfer-validation-9' }); current.ledger.entries.push({ requestId: 'SOURCE-current', settledMicroCny: 1 });
  assert.equal(entry.transferCaseNineHistoricalAccountingHash(current, quote), hash);
  current.allocationClosureDecisions[13].operatorDecision.sourceSha256 = 'changed'; assert.notEqual(entry.transferCaseNineHistoricalAccountingHash(current, quote), hash);
});
test('C9 unknown admission rejects before host SDK or publication', async () => {
  const a: any = await import('../../probes/transfer/validation-case-nine-entry.ts').catch(() => null);
  assert.equal(typeof a?.createFixedTransferValidationCaseNineEntry, 'function', 'Fixed C9 entry is missing.');
  const repository = await mkdtemp(join(tmpdir(), 'cos78-unknown-')), root = join(repository, '.cosmos/validation-shared'); await mkdir(root, { recursive: true });
  const state = caseNineFeeData(); Object.assign(state.ledger.entries.at(-1), { unknown: true, status: 'unknown', reservedMicroCny: 10 });
  const path = join(root, 'snapshot.json'); await writeFile(path, JSON.stringify(state), 'utf8');
  const before = await readFile(path), info = await stat(path), files = await readdir(root); let hostCalls = 0;
  const entry = a.createFixedTransferValidationCaseNineEntry(TRANSFER_CASE_EIGHT_HISTORICAL_SOURCE);
  await assert.rejects(entry.runTransferValidationCaseNineWithHost({ repository, args: ['--validation-case', 'a'.repeat(40), 'SOURCE'], host: { prepare: async () => { hostCalls++; }, execute: async () => { hostCalls++; } } }), /unknown|reconcil/);
  assert.equal(hostCalls, 0); assert.deepEqual(await readFile(path), before); assert.equal((await stat(path)).mtimeMs, info.mtimeMs); assert.deepEqual(await readdir(root), files);
});
test('C9 source closure includes its fixed wrappers the actual output-cap factory and worker', async () => {
  const a: any = await import('../../probes/transfer/validation-case-nine-source.ts').catch(() => null);
  assert.equal(typeof a?.captureTransferCaseNineSource, 'function', 'Fixed C9 source closure is missing.');
  const source = await a.captureTransferCaseNineSource();
  for (const file of ['validation-case-nine-run.ts', 'validation-case-nine-driver.ts', 'validation-case-nine-task.ts', '/src/providers/pi.ts', '/src/roles/factory.ts', 'validation-worker.ts']) assert.ok(source.files.some((f: any) => f.path.replaceAll('\\', '/').endsWith(file)), file);
  await a.requireTransferCaseNineSource(source);
  const wrong = structuredClone(source); wrong.files[0].sha256 = '0'.repeat(64); await assert.rejects(a.requireTransferCaseNineSource(wrong), /source|bytes|receipt/);
});
