import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { sameValue } from '../../src/contracts/validation.ts';
import { validationInputHash } from '../../src/runtime/validation-validation.ts';
import { TRANSFER_VALIDATION_CASE_FIVE as D5 } from '../../probes/transfer/validation-case-five-declaration.ts';

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
