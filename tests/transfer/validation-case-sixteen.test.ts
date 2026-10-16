import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { RunController } from '../../src/runtime/run.ts';
import { prepareValidationCase } from '../../src/runtime/validation-window.ts';
import { TRANSFER_VALIDATION_CASE_FIFTEEN as D15 } from '../../probes/transfer/validation-case-fifteen-declaration.ts';
import { TRANSFER_VALIDATION_CASE_SIXTEEN as D } from '../../probes/transfer/validation-case-sixteen-declaration.ts';
import { requireTransferCaseSixteenSourceApprovals as requireApprovals, createTransferCaseSixteenAdmissionQuote as admission } from '../../probes/transfer/validation-case-sixteen-entry.ts';
import { requireTransferCaseSixteenHistoricalTail, requireTransferCaseSixteenAccountingSources } from '../../probes/transfer/validation-case-sixteen-entry.ts';
import { supplementFixture } from '../runtime/validation-group-supplement.fixture.ts';
import { createTransferCaseFifteenAdmissionQuote, requireTransferCaseFifteenSourceApprovals, transferCaseFifteenHistoricalAccountingHash } from '../../probes/transfer/validation-case-fifteen-entry.ts';
import { captureTransferCaseFifteenSource } from '../../probes/transfer/validation-case-fifteen-source.ts';
import { validationHash } from '../../src/runtime/validation-validation.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import { captureTransferCaseSixteenSource } from '../../probes/transfer/validation-case-sixteen-source.ts';
import { bootstrapTransferValidationCaseSixteenToolchain } from '../../probes/transfer/validation-case-sixteen-driver.ts';
import { transferCaseSixteenHistoricalAccountingHash } from '../../probes/transfer/validation-case-sixteen-entry.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';

async function currentApprovals() {
  const mapping = JSON.parse(await readFile(new URL('../../docs/specs/github-issues.json', import.meta.url), 'utf8'));
  mapping.tasks = mapping.tasks.filter((item: { taskId: string }) => item.taskId !== 'COS-102');
  mapping.tasks.push({ taskId: 'COS-102', reviewedCommit: 'a'.repeat(40), mergeCommit: 'b'.repeat(40),
    reviewStatus: 'TRANSFER_CASE_SIXTEEN_SOURCE_READY', integrationStatus: 'source-integrated' });
  return requireApprovals(mapping);
}

/** Short, authentic API accounting only. Complete 23-case C5 source authentication belongs to SOURCE integration. */
async function tailFixture(t: test.TestContext) {
  const f = await supplementFixture(t), supplement = await RunController.prepareValidationGroupSupplement(f);
  await RunController.applyValidationGroupSupplement({ ...f, quote: supplement, decision: await f.decision(supplement) });
  const c14 = await f.claim(f.target); await f.charge(c14, 'coding', 792_063); await f.close(c14);
  for (const file of [D.inputs.requirements, ...D.inputs.template.files]) {
    const path = join(f.repositoryRoot, file.path); await mkdir(dirname(path), { recursive: true });
    await writeFile(path, await readFile(new URL('../../' + file.path, import.meta.url)));
  }
  const root = join(f.repositoryRoot, '.cosmos/validation-shared'); await cp(f.root, root, { recursive: true });
  f.setCurrent(D15); const context = { ...f, root }, before: RunSnapshot = JSON.parse(await readFile(join(root, 'snapshot.json'), 'utf8'));
  const quote = await prepareValidationCase({ ...context, declaration: D15 });
  const manifestBytes = Buffer.from(JSON.stringify({ source: 'Short SOURCE receipt bytes; no passed-stage proof or production preflight claim.' }) + '\n');
  const manifestRef = { artifactId: `${D15.caseId}-historical-stages`, version: validationHash(manifestBytes), location: `${D15.caseId}-reuse.json` };
  await writeFile(join(root, manifestRef.location), manifestBytes);
  const mapping = JSON.parse(await readFile(new URL('../../docs/specs/github-issues.json', import.meta.url), 'utf8'));
  const execution = await captureTransferCaseFifteenSource(), approvals = requireTransferCaseFifteenSourceApprovals(mapping);
  const envelope = createTransferCaseFifteenAdmissionQuote(quote, manifestRef, approvals, execution, transferCaseFifteenHistoricalAccountingHash(before, quote));
  const bytes = JSON.stringify(envelope, null, 2) + '\n';
  const admissionRef = { artifactId: `${D15.caseId}-admission`, version: validationHash(bytes), location: `${D15.caseId}-admission-${envelope.admissionId}.json` };
  await writeFile(join(root, admissionRef.location), bytes, 'utf8');
  const decision = { kind: 'operator_validation' as const, decisionId: 'short-c15-operator', actorId: 'SOURCE-only', decidedAt: new Date(f.now()).toISOString(),
    source: { artifactId: 'short-c15-operator', version: 'SOURCE-only', location: 'short-c15-operator.json' }, sourceRefs: [manifestRef, admissionRef] };
  await writeFile(join(root, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...decision, source: undefined, quote }), 'utf8');
  const window = await RunController.claimValidationCase({ ...context, quote, decision });
  const controller = await RunController.openValidationCase({ ...context, caseId: D15.caseId, windowId: window.windowId });
  await controller.stop('Short SOURCE zero-task stop.'); await controller.close();
  await mkdir(join(f.repositoryRoot, '.cosmos/e2e', D15.caseId));
  const closureQuote = await RunController.prepareValidationAllocationClosure({ ...context, caseIds: [D15.caseId] });
  const close = { kind: 'operator_validation_allocation_closure' as const, decisionId: 'short-c15-closure', actorId: 'SOURCE-only', decidedAt: new Date(f.now()).toISOString(),
    source: { artifactId: 'short-c15-closure', version: 'SOURCE-only', location: 'short-c15-closure.json' }, sourceRefs: [decision.source] };
  await writeFile(join(root, close.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', ...close, source: undefined, quote: closureQuote }), 'utf8');
  await RunController.applyValidationAllocationClosure({ ...context, quote: closureQuote, decision: close });
  const state: RunSnapshot = JSON.parse(await readFile(join(root, 'snapshot.json'), 'utf8')); validateSnapshot(state);
  assert.equal(state.validation!.cases.length, 5); assert.equal(state.ledger.allocationClosures!.length, 25); assert.equal(state.allocationClosureDecisions!.length, 5);
  return { ...context, state, before, window, envelope, admissionRef, manifestRef, execution };
}

test('C16 historical tail rereads operator-covered C15 admission bytes', async t => {
  const f = await tailFixture(t), path = join(f.root, f.admissionRef.location), bytes = await readFile(path);
  await writeFile(path, Buffer.concat([bytes, Buffer.from('\n')]));
  await assert.rejects(requireTransferCaseSixteenHistoricalTail(f.root, f.state, new AbortController().signal), /C15.*admission/);
  await assert.rejects(requireTransferCaseSixteenAccountingSources(f.root, f.state, new AbortController().signal), /complete 23-case, 115-closure, 21-audit/);
});

test('C16 authenticates a real zero-work C15 tail and rejects changed historical authority', async t => {
  const f = await tailFixture(t), signal = new AbortController().signal;
  const sources = await requireTransferCaseSixteenHistoricalTail(f.root, f.state, signal);
  assert.ok(sources.includes(f.window.quote.identity.reviewedPlatformSha));
  const mutations: [string, (state: RunSnapshot) => void][] = [
    ['quote2', state => { state.validation!.cases.at(-1)!.quote.formatVersion = 'validation-case-quote-2'; }],
    ['group', state => { state.validation!.cases.at(-1)!.quote.budgetGroup = state.validation!.cases[1].quote.budgetGroup; }],
    ['missing closure', state => { state.ledger.allocationClosures!.pop(); }],
    ['task', state => { const task = structuredClone(state.tasks[0]); task.taskId = D15.grants.coding.taskId; state.tasks.push(task); }],
    ['request', state => { const request = structuredClone(state.requests[0]); request.validation = { ...request.validation!, caseId: D15.caseId, windowId: f.window.windowId }; state.requests.push(request); }],
    ['fee row', state => { const row = structuredClone(state.ledger.entries[0]); row.taskId = D15.grants.coding.taskId; state.ledger.entries.push(row); }],
    ['stop', state => { state.validation!.cases.at(-1)!.stopReason!.code = 'deadline'; }],
    ['closure operator', state => { state.allocationClosureDecisions!.at(-1)!.quote.cases[0].originalOperatorSourceSha256 = '0'.repeat(64); }],
  ];
  for (const [name, change] of mutations) await t.test(name, async () => {
    const altered = structuredClone(f.state); change(altered);
    await assert.rejects(requireTransferCaseSixteenHistoricalTail(f.root, altered, signal), /Historical C15/);
  });
  for (const source of [f.window.operatorDecision.source, f.manifestRef, f.admissionRef, f.state.allocationClosureDecisions!.at(-1)!.operatorDecision.source]) {
    const path = join(f.root, source.location), bytes = await readFile(path); await writeFile(path, Buffer.concat([bytes, Buffer.from('\n')]));
    try { await assert.rejects(requireTransferCaseSixteenHistoricalTail(f.root, f.state, signal), /source|admission|manifest|operator/i); }
    finally { await writeFile(path, bytes); }
  }
  await requireTransferCaseSixteenHistoricalTail(f.root, f.state, signal);
});

test('C16 requires its own approval as well as the complete C15 dependency list', async () => {
  const mapping = JSON.parse(await readFile(new URL('../../docs/specs/github-issues.json', import.meta.url), 'utf8'));
  mapping.tasks = mapping.tasks.filter((item: { taskId: string }) => item.taskId !== 'COS-102');
  assert.throws(() => requireApprovals(mapping), /COS-102/);
  mapping.tasks.push({ taskId: 'COS-102', reviewedCommit: 'a'.repeat(40), mergeCommit: 'b'.repeat(40),
    reviewStatus: 'TRANSFER_CASE_SIXTEEN_SOURCE_READY', integrationStatus: 'source-integrated' });
  assert.equal(requireApprovals(mapping).at(-1)!.taskId, 'COS-102');
  mapping.tasks = mapping.tasks.filter((item: { taskId: string }) => item.taskId !== 'COS-101');
  assert.throws(() => requireApprovals(mapping), /COS-101/);
});

test('C16 admission binds its real API quote to its own fixed format and manifest', async t => {
  const f = await supplementFixture(t), supplement = await RunController.prepareValidationGroupSupplement(f);
  await RunController.applyValidationGroupSupplement({ ...f, quote: supplement, decision: await f.decision(supplement) });
  const c14 = await f.claim(f.target); await f.charge(c14, 'coding', 792_063); await f.close(c14);
  for (const file of [D.inputs.requirements, ...D.inputs.template.files]) {
    const path = join(f.repositoryRoot, file.path); await mkdir(dirname(path), { recursive: true });
    await writeFile(path, await readFile(new URL('../../' + file.path, import.meta.url)));
  }
  const c15 = await f.claim(D15); await f.close(c15); f.setCurrent(D);
  const quote = await prepareValidationCase({ ...f, declaration: D });
  const manifest = { artifactId: `${D.caseId}-historical-stages`, version: 'b'.repeat(64), location: `${D.caseId}-reuse.json` };
  const approvals = await currentApprovals(), value = admission(quote, manifest, approvals);
  assert.equal(value.formatVersion, 'transfer-case-sixteen-admission/1');
  assert.equal(value.quote.formatVersion, 'validation-case-quote-1');
  assert.equal(value.allocationSource, 'shared-unallocated');
  assert.equal(value.quote.declaration.caseId, D.caseId);
  assert.throws(() => admission(c15.quote, manifest, []), /C16.*quote/);
  assert.throws(() => admission(quote, { ...manifest, location: `${D15.caseId}-reuse.json` }, []), /C16.*manifest/);
  assert.throws(() => admission(quote, manifest, []), /C16.*approvals/);
});

test('C16 rejects operator-covered wrong case manifest approval and execution before owned dispatch', async t => {
  for (const mode of ['case', 'manifest', 'approval', 'source']) await t.test(mode, async t => {
    const f = await tailFixture(t); f.setCurrent(D);
    const quote = await prepareValidationCase({ ...f, declaration: D });
    const manifestRef = { ...f.manifestRef, artifactId: `${D.caseId}-historical-stages`, location: `${D.caseId}-reuse.json` };
    await cp(join(f.root, f.manifestRef.location), join(f.root, manifestRef.location));
    const execution = await captureTransferCaseSixteenSource();
    const value = structuredClone(admission(quote, manifestRef, await currentApprovals(), execution, transferCaseSixteenHistoricalAccountingHash(f.state, quote)));
    if (mode === 'case') value.quote = f.window.quote;
    if (mode === 'manifest') value.manifestRef = f.manifestRef;
    if (mode === 'approval') value.sourceApprovals.pop();
    if (mode === 'source') value.execution!.files[0].sha256 = '0'.repeat(64);
    const { admissionId: _old, ...payload } = value; value.admissionId = validationHash(JSON.stringify(payload));
    const bytes = JSON.stringify(value, null, 2) + '\n';
    const ref = { artifactId: `${D.caseId}-admission`, version: validationHash(bytes), location: `${D.caseId}-admission-${value.admissionId}.json` };
    await writeFile(join(f.root, ref.location), bytes, 'utf8');
    const decision = { kind: 'operator_validation' as const, decisionId: `short-c16-${mode}`, actorId: 'SOURCE-only', decidedAt: new Date(f.now()).toISOString(),
      source: { artifactId: 'short-c16-operator', version: 'SOURCE-only', location: `short-c16-${mode}.json` }, sourceRefs: [value.manifestRef, ref] };
    await writeFile(join(f.root, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', ...decision, source: undefined, quote }), 'utf8');
    const window = await RunController.claimValidationCase({ ...f, quote, decision });
    const controller = await RunController.openValidationCase({ ...f, caseId: D.caseId, windowId: window.windowId });
    const root = join(f.repositoryRoot, '.cosmos/e2e', D.caseId); await mkdir(root);
    const work = new OwnedWork(controller.signal), before = await readFile(join(f.root, 'snapshot.json')); let dispatched = 0;
    try {
      await assert.rejects(bootstrapTransferValidationCaseSixteenToolchain({ repository: f.repositoryRoot, ledgerRoot: f.root, root, controller, window, work, signal: work.signal },
        async () => { dispatched++; throw new Error('Rejected admission must not dispatch.'); }), /admission|manifest|approvals|receipt/);
      assert.equal(dispatched, 0); assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
    } finally { await work.cancelAndDrain('Short SOURCE rejection finished.'); await controller.stop('Short SOURCE cleanup.'); await controller.close(); }
  });
});
