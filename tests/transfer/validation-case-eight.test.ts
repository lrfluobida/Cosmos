import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VALIDATION_ROLES, validationInputHash, validateValidationDeclaration } from '../../src/runtime/validation-validation.ts';
import { TRANSFER_VALIDATION_CASE_SIX as D6 } from '../../probes/transfer/validation-case-six-declaration.ts';
import { TRANSFER_CASE_SIX_HISTORICAL_SOURCE } from '../../probes/transfer/validation-case-six-run.ts';
import { caseEightFeeData } from './validation-case-eight.fixture.ts';
import { fileURLToPath } from 'node:url';
import { fixedTransferValidationInput } from '../../probes/transfer/validation-input.ts';
import { createValidationRequirement } from '../../src/roles/execution-input.ts';
import { run, passedTask } from '../contracts/fixtures.ts';
import { TRANSFER_VALIDATION_CASE_FIVE as D5 } from '../../probes/transfer/validation-case-five-declaration.ts';
async function api() {
  const value: any = await import('../../probes/transfer/validation-case-eight-declaration.ts').catch(() => null);
  assert.equal(typeof value?.deriveTransferValidationCaseEightDeclaration, 'function', 'C8 settled declaration is missing.'); return value;
}
test('C8 derives original role remainder from two actual C6 and C7 settled variants', async () => {
  const a = await api();
  for (const [c6, c7] of [[207_689, 58_415], [450_000, 90_000]]) {
    const state = caseEightFeeData(c6, c7), declaration = a.deriveTransferValidationCaseEightDeclaration(state);
    validateValidationDeclaration(declaration);
    assert.equal(declaration.caseId, 'cos20-transfer-validation-8');
    assert.deepEqual(Object.fromEntries(VALIDATION_ROLES.map(role => [role, declaration.grants[role].amountMicroCny])), state.expected);
    assert.deepEqual(declaration.limits, D6.limits); assert.deepEqual(declaration.outputTokens, D6.outputTokens);
    assert.equal(validationInputHash(declaration), validationInputHash(D6));
    assert.equal(Object.values(declaration.grants).reduce((n: number, g: any) => n + g.amountMicroCny, 0), 10_000_000 - state.ledger.entries.reduce((n: number, e: any) => n + e.settledMicroCny, 0));
  }
});
test('C8 refuses unresolved, unclosed and mismatched original C7 settled history', async () => {
  const a = await api();
  for (const mutate of [
    (s: any) => Object.assign(s.ledger.entries.at(-1), { status: 'unknown', unknown: true, reservedMicroCny: 200_000 }),
    (s: any) => { s.ledger.entries.at(-1).evidence = []; },
    (s: any) => { s.validation.cases.at(-1).stopReason = null; },
    (s: any) => { s.validation.cases.at(-1).quote.declaration.grants.coding.amountMicroCny++; },
    (s: any) => { s.ledger.allocationDelegations.at(-1).taskIds.reverse(); },
    (s: any) => { s.requests.at(-1).validation.windowId = 'foreign'; },
    (s: any) => { s.requests.at(-1).validation.purpose = 'review'; },
    (s: any) => { s.ledger.entries.at(-1).taskId = s.validation.cases.at(-1).quote.declaration.grants.repair.taskId; },
    (s: any) => { s.ledger.entries.push(structuredClone(s.ledger.entries.at(-1))); },
    (s: any) => { s.ledger.allocationClosures.pop(); },
    (s: any) => { s.ledger.entries.at(-1).settledMicroCny = 2_000_000; },
  ]) { const state = caseEightFeeData(); mutate(state); assert.throws(() => a.deriveTransferValidationCaseEightDeclaration(state)); }
});
test('C8 fixed parser and admission quote use an independent identity and stale fee quote changes', async () => {
  const a = await api(), entry: any = await import('../../probes/transfer/validation-case-eight-entry.ts').catch(() => null);
  assert.equal(typeof entry?.createTransferCaseEightAdmissionQuote, 'function', 'C8 admission quote is missing.');
  assert.equal(a.parseTransferValidationCaseEightEntry(['--validation-preflight', 'a'.repeat(40)]).caseId, 'cos20-transfer-validation-8');
  for (const args of [[], ['--validation-case', 'a'.repeat(40)], ['--validation-preflight', 'a'.repeat(40), '--root'], ['--validation-case', 'a'.repeat(40), 'source', '--budget']]) assert.throws(() => a.parseTransferValidationCaseEightEntry(args), /Usage/);
  const quote = { declaration: a.deriveTransferValidationCaseEightDeclaration(caseEightFeeData()), basis: { revision: 50, snapshotSha256: 'a'.repeat(64) } };
  const ref = { artifactId: 'cos20-transfer-validation-8-historical-stages', version: 'b'.repeat(64), location: 'cos20-transfer-validation-8-reuse.json' };
  const approvals = [{ taskId: 'COS-75', reviewedCommit: 'c'.repeat(40), mergeCommit: 'd'.repeat(40) }];
  const first = entry.createTransferCaseEightAdmissionQuote(quote, ref, approvals);
  assert.equal(first.formatVersion, 'transfer-case-eight-admission/1'); assert.deepEqual(first.roleGrants, quote.declaration.grants);
  assert.notEqual(first.admissionId, entry.createTransferCaseEightAdmissionQuote({ ...quote, declaration: a.deriveTransferValidationCaseEightDeclaration(caseEightFeeData(207_689, 90_000)) }, ref, approvals).admissionId);
});
test('C8 refuses unknown before publication, host or SDK and seals 15-case accounting prefix', async () => {
  const a: any = await import('../../probes/transfer/validation-case-eight-entry.ts').catch(() => null);
  assert.equal(typeof a?.createFixedTransferValidationCaseEightEntry, 'function', 'C8 fixed entry is missing.');
  const state = caseEightFeeData(), quote = { basis: { requestIds: state.ledger.entries.map((e: any) => e.requestId) } };
  state.allocationClosureDecisions = Array.from({ length: 13 }, (_, i) => ({ operatorDecision: { sourceSha256: `SOURCE-audit-${i}` } }));
  const seal = a.transferCaseEightHistoricalAccountingHash(state, quote), current = structuredClone(state);
  current.validation.cases.push({ caseId: 'cos20-transfer-validation-8' }); current.ledger.allocationDelegations.push({ caseId: 'cos20-transfer-validation-8' });
  current.ledger.entries.push({ requestId: 'SOURCE-current-C8', settledMicroCny: 100 }); current.requests.push({ requestId: 'SOURCE-current-C8' });
  assert.equal(a.transferCaseEightHistoricalAccountingHash(current, quote), seal);
  current.allocationClosureDecisions[12].operatorDecision.sourceSha256 = 'changed'; assert.notEqual(a.transferCaseEightHistoricalAccountingHash(current, quote), seal);
  const repository = await mkdtemp(join(tmpdir(), 'cos76-unknown-')), root = join(repository, '.cosmos/validation-shared'); await mkdir(root, { recursive: true });
  Object.assign(state.ledger.entries.at(-1), { status: 'unknown', unknown: true, reservedMicroCny: 200_000 });
  const path = join(root, 'snapshot.json'); await writeFile(path, JSON.stringify(state), 'utf8');
  const before = await readFile(path), info = await stat(path), files = await readdir(root); let hostCalls = 0;
  const entry = a.createFixedTransferValidationCaseEightEntry(TRANSFER_CASE_SIX_HISTORICAL_SOURCE);
  await assert.rejects(entry.runTransferValidationCaseEightWithHost({ repository, args: ['--validation-case', 'a'.repeat(40), 'SOURCE'], host: { prepare: async () => { hostCalls++; }, execute: async () => { hostCalls++; } } }), /unknown|reconcil/);
  assert.equal(hostCalls, 0); assert.deepEqual(await readFile(path), before); assert.equal((await stat(path)).mtimeMs, info.mtimeMs); assert.deepEqual(await readdir(root), files);
});
test('C8 execution source binds its own entry driver task and rejects changed closure bytes', async () => {
  const a: any = await import('../../probes/transfer/validation-case-eight-source.ts').catch(() => null);
  assert.equal(typeof a?.captureTransferCaseEightSource, 'function', 'C8 source binding is missing.');
  const source = await a.captureTransferCaseEightSource();
  for (const suffix of ['validation-case-eight-run.ts', 'validation-case-eight-driver.ts', 'validation-case-eight-task.ts', '/src/providers/pi.ts', '/src/roles/factory.ts', 'coding-check-worker.ts']) assert.ok(source.files.some((f: any) => f.path.replaceAll('\\', '/').endsWith(suffix)), suffix);
  await a.requireTransferCaseEightSource(source);
  const wrong = structuredClone(source); wrong.files[0].sha256 = '0'.repeat(64); await assert.rejects(a.requireTransferCaseEightSource(wrong), /source|bytes|receipt/);
});
test('C8 current task and candidate plan resume exact receipts and refuse current role or plan drift', async () => {
  const D = (await api()).deriveTransferValidationCaseEightDeclaration(caseEightFeeData());
  const tasks = await import('../../probes/transfer/validation-case-eight-task.ts'), frozen = await fixedTransferValidationInput(D).readTransferValidationInput(fileURLToPath(new URL('../../', import.meta.url)));
  const ref = (artifactId: string, version = 'v1') => ({ artifactId, version, location: `registry/captures/${artifactId}/${version}/files` });
  const sources = [ref(`${D.caseId}-input`)], identity = { reviewedPlatformSha: 'a'.repeat(40), frozenCaseInputHash: validationInputHash(D) };
  const decision = { kind: 'operator_validation' as const, decisionId: 'SOURCE-C8-decision', actorId: 'SOURCE-only', decidedAt: '2026-10-13T00:00:00.000Z',
    source: { artifactId: 'SOURCE-C8-operator', version: 'v1', location: 'operator.json' }, sourceRefs: [ref('SOURCE-lineage')] };
  const requirement = createValidationRequirement({ specVersion: '1.0', sources, acceptance: frozen.requirements.preparation.acceptance,
    validation: { runId: 'SOURCE-C8-run', ledgerId: 'SOURCE-ledger', caseId: D.caseId, windowId: 'SOURCE-C8-window', ...identity, decision } });
  const window = { caseId: D.caseId, windowId: requirement.validation.windowId, quote: { declaration: D, identity,
    requirements: { acceptanceIds: frozen.requirements.acceptanceIds, stageAcceptanceIds: frozen.requirements.stageAcceptanceIds } } };
  const state = { ...caseEightFeeData(), run: { ...run(), runId: requirement.validation.runId, kind: 'evaluation', specVersion: '1.0' }, tasks: [] };
  state.ledger.ledgerId = requirement.validation.ledgerId; state.validation.cases.push(window); state.validation.currentCaseId = D.caseId;
  const host = { availableArtifacts: [...sources, ref('SOURCE-C8-template'), ref('SOURCE-C5-requirement'), ref('SOURCE-C8-plan'), ref('SOURCE-C8-plan-v2', 'v2')],
    taskPolicies: [{ policyId: 'game-code', role: 'coding', workspace: '/SOURCE-C8-coding', allocationMicroCny: D.grants.coding.amountMicroCny,
      writePaths: ['authors/coding/'], readOnlyPaths: ['registry/captures/'], tools: ['read', 'write', 'check-game-build'], rules: ['SOURCE current C8'], interfaces: [],
      outputs: [{ artifactId: `${D.caseId}-game`, version: 'v1', destination: `registry/captures/${D.caseId}-game/v1/files`, type: 'game', schema: 'game/1' }] }] };
  const historical = { stages: (['design', 'art'] as const).map(role => ({ role, task: { ...passedTask(), taskId: D5.grants[role].taskId } })),
    designArtifacts: ['design', 'map', 'browser-plan', 'persistent-plan'].map(id => ref(`SOURCE-C5-${id}`)), mediaArtifact: ref('SOURCE-C5-media') };
  const root = await mkdtemp(join(tmpdir(), 'cos76-task-')), input: any = { state, window, requirement, host, historical, root,
    capability: 'SOURCE-only consumer', signal: new AbortController().signal, manifestRef: { artifactId: `${D.caseId}-historical-stages`, version: 'b'.repeat(64), location: `${D.caseId}-reuse.json` } };
  const task = tasks.deriveTransferValidationCaseEightCodingTask(input);
  assert.equal(task.task.taskId, D.grants.coding.taskId); assert.equal(task.role, 'coding'); assert.equal(task.task.budget.allocationMicroCny, D.grants.coding.amountMicroCny);
  assert.deepEqual(task.task.inputs, [...host.availableArtifacts, ...historical.designArtifacts, historical.mediaArtifact]);
  const execution = await tasks.prepareTransferValidationCaseEightExecution(input, false), path = join(root, 'execution-reused.json'), bytes = await readFile(path), info = await stat(path);
  assert.deepEqual(await tasks.prepareTransferValidationCaseEightExecution(input, true), execution);
  for (const mutate of [(v: any) => { v.host.taskPolicies[0].tools.pop(); }, (v: any) => { v.host.availableArtifacts[3].version = 'changed'; },
    (v: any) => { v.window.caseId = 'cos20-transfer-validation-7'; }, (v: any) => { v.manifestRef.location = 'cos20-transfer-validation-7-reuse.json'; }]) {
    const changed = structuredClone({ ...input, signal: undefined }); changed.signal = input.signal; mutate(changed);
    await assert.rejects(tasks.prepareTransferValidationCaseEightExecution(changed, true), /execution|policy|changed|current|fixed|manifest/);
  }
  assert.deepEqual(await readFile(path), bytes); assert.equal((await stat(path)).mtimeMs, info.mtimeMs);
});
