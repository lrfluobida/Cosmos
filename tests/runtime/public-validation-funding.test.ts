import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { chargeIntake, fundedIntake, fundingFixture, signedOrdinaryIncompleteFunding } from './public-validation-funding.fixture.ts';
import { reservePublicValidationFunding, settlePublicValidationFunding } from '../../src/runtime/public-validation-funding.ts';
import { fundingHash } from '../../src/runtime/public-validation-funding-validation.ts';
import { prepareValidationCase } from '../../src/runtime/validation-window.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { createRoleBudget } from '../../src/roles/provider-budget.ts';
import { supplementFixture } from './validation-group-supplement.fixture.ts';
import { RunController } from '../../src/runtime/run.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import { executeGeneration, reconcileEntryReceipts } from '../../src/runtime/entrypoint.ts';
import { publishReceipt } from '../../src/runtime/recovery/receipt-file.ts';
import { PassThrough, Readable } from 'node:stream';
import { runCli } from '../../src/cli/index.ts';
import { createProductHost } from '../../src/runtime/entrypoint-host.ts';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { recoverRunOwner } from '../../src/cli/control.ts';
import { readCompletionTiming, readFundingCleanup } from '../../src/runtime/completion-timing.ts';

test('signed ordinary initial failure settles only missing downstream proofs', async t => {
  const value = await signedOrdinaryIncompleteFunding(t), before = await value.snapshot();
  assert.equal(value.receipt.cleanup.filter((row: any) => row.outcome === 'failed').length, 1);
  assert.deepEqual(value.receipt.cleanup.at(-1), { name: 'closed-binding', outcome: 'failed', error: 'Completion report, candidate or task proofs changed.' });
  assert.equal(value.receipt.current.status, 'unconfirmed'); assert.equal(value.receipt.eligible, false);
  const reportBytes = await readFile(value.reportPath), snapshotBytes = await readFile(join(value.runRoot, 'snapshot.json'));
  const result = await settlePublicValidationFunding({ sharedRoot: value.sharedRoot, runRoot: value.runRoot, fundingId: value.binding.fundingId });
  const amount = before.ledger.entries.reduce((sum: number, row: any) => sum + row.settledMicroCny, 0);
  assert.equal(result.outcome, 'closed'); assert.equal(result.settledMicroCny, amount); assert.equal(result.releasedMicroCny, value.binding.limits.limitMicroCny - amount);
  assert.deepEqual(await readFile(value.receiptPath), value.receiptBytes); assert.deepEqual(await readFile(value.reportPath), reportBytes);
  assert.deepEqual(await readFile(join(value.runRoot, 'snapshot.json')), snapshotBytes);
  assert.equal((await readCompletionTiming(value.runRoot)).current.status, 'unconfirmed');
  assert.deepEqual((await readFundingCleanup(value.runRoot)).cleanup, value.receipt.cleanup);
  assert.deepEqual(await settlePublicValidationFunding({ sharedRoot: value.sharedRoot, runRoot: value.runRoot, fundingId: value.binding.fundingId }), result);
  await writeFile(join(value.runRoot, 'cos135-funding-source-result.json'), JSON.stringify({ source: 'Synthetic signed history and settlement only', result, originalTiming: value.receipt.current }, null, 2), 'utf8');
});

for (const fault of ['design-proof', 'downstream-attempt', 'downstream-artifact', 'downstream-review', 'registered-downstream', 'charged-downstream',
  'candidate', 'warnings-failed', 'control-failed', 'preparation-failed', 'owner-failed', 'fallback', 'duplicate-cleanup', 'unknown-cleanup', 'no-stop', 'new-execution',
  'report', 'marker', 'signature', 'nonce', 'anchor', 'ledger', 'requests', 'fees', 'extra-event', 'revision-plan', 'selection', 'downstream-journal', 'downstream-capture', 'current-candidate']) {
  test(`ordinary incomplete funding rejects ${fault}`, async t => {
    const value = await signedOrdinaryIncompleteFunding(t, fault), sharedBefore = await value.f.snapshot();
    const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
    const put = (path: string, contents: unknown) => writeFile(path, JSON.stringify(contents), 'utf8');
    if (fault === 'report') { const report = await json(value.reportPath); report.gaps.push('Changed signed report'); await put(value.reportPath, report); }
    if (fault === 'marker') { const path = join(value.runRoot, 'delivery/current-report.json'), marker = await json(path); marker.sha256 = '0'.repeat(64); await put(path, marker); }
    if (fault === 'signature') { const path = value.receiptPath + '.sha256.json', digest = await json(path); digest.signature = Buffer.alloc(64).toString('base64'); await put(path, digest); }
    if (fault === 'nonce') { const receipt = await json(value.receiptPath); receipt.nonce = 'untrusted'; await put(value.receiptPath, receipt); }
    if (['anchor', 'ledger', 'requests', 'fees', 'extra-event'].includes(fault)) {
      const state = await value.snapshot();
      if (fault === 'anchor') { const anchor = state.events.find((event: any) => event.type === 'run_owner_drained'); const reason = JSON.parse(anchor.reason); reason.nonceSha256 = '0'.repeat(64); anchor.reason = JSON.stringify(reason); }
      if (fault === 'ledger') { state.ledger.entries[0].settledMicroCny += 1; state.run.fees.settledMicroCny += 1; }
      if (fault === 'requests') state.requests[0].admittedAt = new Date(Date.parse(state.requests[0].admittedAt) + 1).toISOString();
      if (fault === 'fees') state.run.fees.settledMicroCny += 1;
      if (fault === 'extra-event') { state.events.push({ sequence: state.events.length + 1, type: 'budget_warning', at: new Date().toISOString(), requestId: null, reason: 'Changed history after original stop' }); state.revision++; }
      await put(join(value.runRoot, 'snapshot.json'), state);
    }
    if (fault === 'revision-plan') await put(join(value.runRoot, 'ordinary-design-revision-plan.json'), {});
    if (fault === 'selection') await put(join(value.runRoot, 'ordinary-design-selection.json'), {});
    if (fault === 'downstream-journal') await mkdir(join(value.runRoot, 'journal/task-art-task'), { recursive: true });
    if (fault === 'downstream-capture') await mkdir(join(value.runRoot, 'registry/captures/media/v1'), { recursive: true });
    if (fault === 'current-candidate') await put(join(value.runRoot, 'registry/current.json'), {});
    await assert.rejects(settlePublicValidationFunding({ sharedRoot: value.sharedRoot, runRoot: value.runRoot, fundingId: value.binding.fundingId }));
    const sharedAfter = await value.f.snapshot();
    assert.deepEqual(sharedAfter, sharedBefore); assert.equal(sharedAfter.publicValidationFundings[0].settlement, undefined);
    await assert.rejects(readFile(join(value.sharedRoot, `public-funding/${value.binding.fundingId}/settlement.json`)), { code: 'ENOENT' });
  });
}

test('a real authorization reserves one complete grant without a provider request and reuses its intent', async t => {
  const f = await fundingFixture(t), args = await f.authorization(), before = await f.snapshot();
  const binding = await reservePublicValidationFunding(args), after = await f.snapshot();
  assert.equal(binding.authorizationSha256, fundingHash(await readFile(join(f.root, args.authorization.location))));
  assert.equal(after.ledger.allocations.at(-1).amountMicroCny, 5_000_000);
  assert.deepEqual(after.ledger.entries, before.ledger.entries);
  assert.deepEqual(after.validation, before.validation);
  assert.deepEqual(await reservePublicValidationFunding(args), binding);
  assert.equal((await f.snapshot()).revision, after.revision);
  const intent = JSON.parse(await readFile(join(args.runRoot, 'public-validation-origin.json'), 'utf8'));
  assert.deepEqual(Object.keys(intent).sort(), ['authorization', 'authorizationSha256', 'formatVersion']);
});

test('a stopped public intake settles actual receipts once and preserves historical closure sources', async t => {
  const f = await fundingFixture(t), original = await f.snapshot(), value = await fundedIntake(f);
  await chargeIntake(value, 'paid-one');
  await value.controller.stop('Finished the bounded fixture'); await value.controller.close();
  const result = await settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId });
  assert.equal(result.settledMicroCny, 2); assert.equal(result.releasedMicroCny, 4_999_998);
  const state = await f.snapshot(); validateSnapshot(state);
  assert.deepEqual(state.validation, original.validation); assert.deepEqual(state.stopReason, original.stopReason);
  assert.deepEqual(state.ledger.allocationClosures.slice(0, -1), original.ledger.allocationClosures);
  assert.equal(state.ledger.entries.at(-1).requestId, 'paid-one');
  assert.equal(state.requests.at(-1).publicFunding.sourceTaskId, 'intake');
  assert.deepEqual(await settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId }), result);
  assert.equal((await f.snapshot()).revision, state.revision);
  const tampered = structuredClone(state);
  tampered.ledger.allocationClosures.at(-1).decisionId = 'unproven-closure';
  assert.throws(() => validateSnapshot(tampered), /funding closure/i);
});

test('missing billing evidence and unresolved owner retain the entire grant', async t => {
  const f = await fundingFixture(t), value = await fundedIntake(f);
  await chargeIntake(value, 'receipt-one');
  await assert.rejects(settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId }), /owner/i);
  await value.controller.stop('Stopped'); await value.controller.close();
  const path = join(value.runRoot, 'intake-sessions/receipt-one/billing-receipt-one.json'), bytes = await readFile(path);
  await unlink(path);
  await assert.rejects(settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId }), /receipt/i);
  assert.equal((await f.snapshot()).publicValidationFundings[0].settlement, undefined);
  await writeFile(path, bytes);
  assert.equal((await settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId })).outcome, 'closed');
});

test('unknown charges block closure without releasing the original allocation', async t => {
  const f = await fundingFixture(t), value = await fundedIntake(f);
  await value.controller.reserve({ requestId: 'lost', taskId: 'intake', provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: 20 });
  await value.controller.admit('lost'); await value.controller.stop('Interrupted response'); await value.controller.close();
  await assert.rejects(settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId }), /unknown|reserved/i);
  const state = await f.snapshot(); assert.equal(state.publicValidationFundings[0].settlement, undefined);
  assert.equal(state.ledger.allocations.at(-1).amountMicroCny, 5_000_000);
  const original = await f.child(value.runRoot), receiptDir = join(value.runRoot, 'intake-sessions/recovered');
  await (await import('node:fs/promises')).mkdir(receiptDir, { recursive: true });
  await publishReceipt(join(receiptDir, 'billing-lost.json'), { formatVersion: 1, requestId: 'lost', outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
    usage: { input: 1, output: 0, cacheRead: 0, cacheWrite: 0 }, runId: original.run.runId, ledgerId: original.ledger.ledgerId,
    taskId: 'intake', provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', admittedAt: original.requests[0].admittedAt });
  const accounting = await IntakeController.open({ root: value.runRoot });
  await reconcileEntryReceipts(value.runRoot, accounting); await accounting.close();
  assert.equal((await settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId })).settledMicroCny, 2);
});

test('parallel whole-run claims cannot spend the same remaining phase capacity', async t => {
  const f = await fundingFixture(t, 26_000_000), a = await f.authorization('parallel-a', 3_000_000), b = await f.authorization('parallel-b', 3_000_000);
  const results = await Promise.allSettled([reservePublicValidationFunding(a), reservePublicValidationFunding(b)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const state = await f.snapshot(); assert.equal(state.publicValidationFundings.length, 1);
  assert.equal(state.publicValidationFundings[0].binding.limits.limitMicroCny, 3_000_000);
});

test('shared write interruptions retain the same authorization and never duplicate an allocation', async t => {
  for (const afterWrite of [false, true]) {
    const f = await fundingFixture(t), args = await f.authorization(), write = SnapshotStore.prototype.write;
    let interrupted = false;
    SnapshotStore.prototype.write = async function(value) {
      if (!interrupted && this.root === args.sharedRoot && (value as any).publicValidationFundings) {
        interrupted = true; if (afterWrite) await write.call(this, value); throw new Error('Injected shared write interruption');
      }
      return write.call(this, value);
    };
    try { await assert.rejects(reservePublicValidationFunding(args), /Injected/); }
    finally { SnapshotStore.prototype.write = write; }
    const binding = await reservePublicValidationFunding(args), state = await f.snapshot();
    assert.equal(state.publicValidationFundings.length, 1);
    assert.equal(state.ledger.allocations.filter((row: any) => row.taskId === `public-funding-${binding.fundingId}`).length, 1);
  }
});

test('a committed settlement with a lost response is idempotent on restart', async t => {
  const f = await fundingFixture(t), value = await fundedIntake(f);
  await chargeIntake(value, 'lost-settlement-response');
  await value.controller.stop('Stopped'); await value.controller.close();
  const write = SnapshotStore.prototype.write;
  let interrupted = false;
  SnapshotStore.prototype.write = async function(state) {
    await write.call(this, state);
    if (!interrupted && this.root === value.sharedRoot && (state as any).publicValidationFundings?.[0]?.settlement) {
      interrupted = true; throw new Error('Injected lost settlement response');
    }
  };
  try { await assert.rejects(settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId }), /Injected/); }
  finally { SnapshotStore.prototype.write = write; }
  const before = await f.snapshot(), result = await settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId });
  assert.equal(result.settledMicroCny, 2); assert.deepEqual(await f.snapshot(), before);
});

test('an already open B observes A overrun before either its next reservation or pending admission', async t => {
  const f = await fundingFixture(t), a = await fundedIntake(f, 'a', 1000), b = await fundedIntake(f, 'b', 1000);
  await b.controller.reserve({ requestId: 'pending-b', taskId: 'intake', provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: 10 });
  await chargeIntake(a, 'overrun-a', 1000, 20); await a.controller.close();
  const original = await f.snapshot(), result = await settlePublicValidationFunding({ ...a, fundingId: 'a' });
  assert.equal(result.outcome, 'overrun'); assert.equal(result.settledMicroCny, 2000); assert.equal(result.releasedMicroCny, 0);
  assert.deepEqual((await f.snapshot()).ledger.entries, original.ledger.entries);
  const budget = createRoleBudget({ controller: b.controller, taskId: 'intake', evidenceDirectory: join(b.runRoot, 'intake-sessions/b') });
  let transports = 0;
  await assert.rejects((async () => { await budget.beforeRequest({ requestId: 'next-b', modelId: 'deepseek-flash', inputBytes: 1, hasImages: false, maxOutputTokens: 1, estimatedMaxCostMicroCny: 10 }); transports++; })(), /overrun/i);
  await assert.rejects((async () => { await b.controller.admit('pending-b'); transports++; })(), /overrun/i);
  assert.equal(transports, 0);
  await b.controller.stop('Accounting remains available'); await b.controller.close();
  await assert.rejects(reservePublicValidationFunding(await f.authorization('c', 1000)), /reconciled|overrun/i);
});

test('the real ledger5 fixture accepts a whole grant without changing its supplement history', async t => {
  const f = await supplementFixture(t), quote = await RunController.prepareValidationGroupSupplement(f), decision = await f.decision(quote);
  await RunController.applyValidationGroupSupplement({ ...f, quote, decision });
  const before = await f.snapshot(), runRoot = join(f.root, '..', 'public-five');
  const payload = { formatVersion: 'public-validation-authorization/1', fundingId: 'five', sharedRoot: f.root,
    sharedRunId: before.run.runId, sharedLedgerId: before.ledger.ledgerId, runRoot, runId: 'game-five', ledgerId: 'game-five-budget',
    limits: { limitMicroCny: 5_000_000, durationMs: 1_800_000 }, brief: '鼠标配对', renderFrames: false,
    decisionId: 'fund-five', actorId: 'offline', decidedAt: new Date().toISOString(), sourceRefs: f.evidence };
  await writeFile(join(f.root, 'fund-five.json'), JSON.stringify(payload), 'utf8');
  const request = { sharedRoot: f.root, runRoot, authorization: { artifactId: 'fund-five', version: 'v1', location: 'fund-five.json' } };
  const binding = await reservePublicValidationFunding(request);
  const after = await f.snapshot(); assert.equal(after.ledger.contractVersion, '5.0.0');
  assert.deepEqual(after.allocationSupplementDecisions, before.allocationSupplementDecisions);
  assert.deepEqual(after.allocationClosureDecisions, before.allocationClosureDecisions);
  const output = new PassThrough(); output.resume();
  await runCli(['new', runRoot, '--brief', payload.brief, '--max-cny', '5', '--max-minutes', '30'], { funding: binding, input: Readable.from([]), output, host: {
    async prepare() { return { environmentReady: false, executionReady: false }; },
    async questions() { throw new Error('No questions'); }, async draft() { throw new Error('No draft'); }, async execute() { throw new Error('No execute'); },
  } });
  const controller = await IntakeController.open({ root: runRoot });
  const nextRoot = join(f.root, '..', 'public-five-next');
  await writeFile(join(f.root, 'fund-five-next.json'), JSON.stringify({ ...payload, fundingId: 'five-next', runRoot: nextRoot,
    runId: 'game-five-next', ledgerId: 'game-five-next-budget', decisionId: 'fund-five-next' }), 'utf8');
  const nextRequest = { sharedRoot: f.root, runRoot: nextRoot, authorization: { artifactId: 'fund-five-next', version: 'v1', location: 'fund-five-next.json' } };
  const sources = [before.validation.cases[0].operatorDecision.source, before.allocationClosureDecisions[0].operatorDecision.source,
    before.validation.cases.at(-1).operatorDecision.source, before.allocationSupplementDecisions[0].operatorDecision.source];
  let transports = 0;
  for (const [index, ref] of sources.entries()) {
    const path = join(f.root, ref.location), originalBytes = await readFile(path);
    await unlink(path);
    try {
      await assert.rejects(reservePublicValidationFunding(nextRequest));
      const budget = createRoleBudget({ controller, taskId: 'intake', evidenceDirectory: join(runRoot, 'intake-sessions/no-call') });
      await assert.rejects((async () => {
        await budget.beforeRequest({ requestId: `ledger5-${index}`, modelId: 'deepseek-flash', maxOutputTokens: 1, inputBytes: 1, hasImages: false, estimatedMaxCostMicroCny: 10 });
        transports++;
      })());
      assert.deepEqual(await f.snapshot(), after);
    } finally { await writeFile(path, originalBytes); }
  }
  assert.equal(transports, 0);
  await controller.stop('Source checks complete'); await controller.close();
  const closurePath = join(f.root, before.allocationClosureDecisions[0].operatorDecision.source.location), closureBytes = await readFile(closurePath);
  await writeFile(closurePath, '{}', 'utf8');
  await assert.rejects(settlePublicValidationFunding({ sharedRoot: f.root, runRoot, fundingId: 'five' }));
  assert.deepEqual(await f.snapshot(), after);
  await writeFile(closurePath, closureBytes);
  assert.equal((await settlePublicValidationFunding({ sharedRoot: f.root, runRoot, fundingId: 'five' })).outcome, 'closed');
});

test('open whole grants count against the phase and exclude old case claims', async t => {
  const f = await fundingFixture(t, 18_000_000), first = await f.authorization('ten', 10_000_000);
  await reservePublicValidationFunding(first);
  await assert.rejects(reservePublicValidationFunding(await f.authorization('three', 3_000_000)), /phase|capacity/i);
  await assert.rejects(prepareValidationCase({ ...f, declaration: await f.declaration('cos20-held-new') }), /public funding/i);
});

test('changed source or intent cannot replace the original allocation', async t => {
  const f = await fundingFixture(t), args = await f.authorization();
  await reservePublicValidationFunding(args); const before = await f.snapshot();
  await writeFile(join(f.root, args.authorization.location), JSON.stringify({ ...args.payload, brief: '替换需求' }), 'utf8');
  await assert.rejects(reservePublicValidationFunding(args), /source|intent|authorization/i);
  assert.deepEqual(await f.snapshot(), before);
});

test('one operator decision cannot be reused for a different public run', async t => {
  const f = await fundingFixture(t), first = await f.authorization('decision-a'), second = await f.authorization('decision-b');
  await reservePublicValidationFunding(first);
  await writeFile(join(f.root, second.authorization.location), JSON.stringify({ ...second.payload, decisionId: first.payload.decisionId }), 'utf8');
  await assert.rejects(reservePublicValidationFunding(second), /decision|authorization/i);
  assert.equal((await f.snapshot()).publicValidationFundings.length, 1);
});

test('direct generation rejects shared overrun before host assembly while accounting remains readable', async t => {
  const f = await fundingFixture(t), a = await fundedIntake(f, 'direct-a', 1000), b = await fundedIntake(f, 'direct-b');
  const draft: any = { brief: b.payload.brief, questions: [{ id: 'goal', prompt: '范围？' }], answers: { goal: '仅免费夹具' }, unsupported: [],
    acceptance: [{ acceptanceId: 'win', description: '点击配对', steps: ['点击目标'], expected: '胜利', evidenceKinds: ['test_report'] }],
    scenario: { viewport: { width: 800, height: 600 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#pair', timeoutMs: 1000 },
      { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] } };
  const saved = await b.controller.saveDraft(draft);
  const requirement = await b.controller.confirm({ revision: saved.revision, confirmed: true, actorId: 'offline-fixture-user', at: new Date().toISOString() });
  await b.controller.activateGeneration({ environmentReady: true, executionReady: true }); await b.controller.close();
  await chargeIntake(a, 'direct-overrun', 1000, 20); await a.controller.close();
  await settlePublicValidationFunding({ ...a, fundingId: a.binding.fundingId });
  let hosts = 0;
  await assert.rejects(executeGeneration({ root: b.runRoot, requirement, draft, resume: false,
    createHost: async () => { hosts++; throw new Error('Host must not be constructed'); } }), /overrun/i);
  assert.equal(hosts, 0);
  const accounting = await RunController.open({ root: b.runRoot });
  assert.equal((await accounting.read()).run.runId, b.binding.runId);
  await accounting.stop('Fixture accounting closure'); await accounting.close();
});

test('legacy operator and allocation closure bytes are required at claim, dispatch and settlement', async t => {
  for (const kind of ['operator', 'closure']) {
    const f = await fundingFixture(t), original = await f.snapshot(), args = await f.authorization('source-check');
    const ref = kind === 'operator' ? original.validation.cases[0].operatorDecision.source : original.allocationClosureDecisions[0].operatorDecision.source;
    const path = join(f.root, ref.location), bytes = await readFile(path), baseline = await readFile(join(f.root, 'snapshot.json'));
    await unlink(path);
    await assert.rejects(reservePublicValidationFunding(args));
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), baseline);
    await writeFile(path, bytes);
    const value = await fundedIntake(f, 'source-active');
    await writeFile(path, '{}', 'utf8');
    let transports = 0;
    const budget = createRoleBudget({ controller: value.controller, taskId: 'intake', evidenceDirectory: join(value.runRoot, 'intake-sessions/no-send') });
    await assert.rejects((async () => {
      await budget.beforeRequest({ requestId: `bad-${kind}`, modelId: 'deepseek-flash', inputBytes: 1, hasImages: false, maxOutputTokens: 1, estimatedMaxCostMicroCny: 10 });
      transports++;
    })());
    assert.equal(transports, 0);
    await value.controller.stop('Retain the funded scope'); await value.controller.close();
    const prior = await readFile(join(f.root, 'snapshot.json'));
    await assert.rejects(settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId }));
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), prior);
    await writeFile(path, bytes);
  }
});

test('stopped funded intake with a failed host cleanup cannot release merely because a new owner can open', async t => {
  const f = await fundingFixture(t), value = await fundedIntake(f);
  await value.controller.close();
  const output = new PassThrough(); output.resume();
  let release!: () => void;
  const late = new Promise<void>(resolve => { release = resolve; }).then(() => writeFile(join(value.runRoot, 'late-cleanup.txt'), 'late writer', 'utf8'));
  try {
    const host = createProductHost(fileURLToPath(new URL('../../', import.meta.url)), { sessionFactory: async () => ({
      async prompt() { return { text: '{"questions":[{"id":"scope","prompt":"范围？"}]}' }; },
      async close() { throw new Error('Host cleanup is unconfirmed while its raw writer remains pending'); },
    }) });
    host.prepare = async () => ({ environmentReady: true, executionReady: true });
    await assert.rejects(runCli(['resume', value.runRoot], { input: Readable.from([]), output, host }), /cleanup/);
    const maintenance = await IntakeController.open({ root: value.runRoot });
    await maintenance.stop('Persist stop without inventing drain'); await maintenance.close();
    assert.equal((await f.child(value.runRoot)).ledger.entries.length, 0);
    await assert.rejects(settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId }), /cleanup|drain|close/i);
    assert.equal((await f.snapshot()).publicValidationFundings[0].settlement, undefined);
  } finally { release(); await late; }
});

test('intake semantic failure can settle after its actual session and lifecycle close successfully', async t => {
  const f = await fundingFixture(t), value = await fundedIntake(f); await value.controller.close();
  let closed = 0;
  const host = createProductHost(fileURLToPath(new URL('../../', import.meta.url)), { sessionFactory: async () => ({
    async prompt() { return { text: 'invalid model output' }; }, async close() { closed++; },
  }) });
  host.prepare = async () => ({ environmentReady: true, executionReady: true });
  const output = new PassThrough(); output.resume();
  await assert.rejects(runCli(['resume', value.runRoot], { input: Readable.from([]), output, host }));
  assert.equal(closed, 1);
  const owner = await IntakeController.open({ root: value.runRoot });
  await owner.stop('The failed interview is closed'); await owner.close();
  assert.equal((await settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId })).outcome, 'closed');
});

test('formal stop and released owner are insufficient without the original completion cleanup proof', async t => {
  const f = await fundingFixture(t), value = await fundedIntake(f);
  const draft: any = { brief: value.payload.brief, questions: [{ id: 'scope', prompt: '范围？' }], answers: { scope: '免费夹具' }, unsupported: [],
    acceptance: [{ acceptanceId: 'win', description: '点击目标', steps: ['点击目标'], expected: '胜利', evidenceKinds: ['test_report'] }],
    scenario: { viewport: { width: 800, height: 600 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#pair', timeoutMs: 1000 },
      { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] } };
  const saved = await value.controller.saveDraft(draft);
  await value.controller.confirm({ revision: saved.revision, confirmed: true, actorId: 'offline-fixture', at: new Date().toISOString() });
  await value.controller.activateGeneration({ environmentReady: true, executionReady: true }); await value.controller.close();
  const controller = await RunController.open({ root: value.runRoot });
  await controller.stop('Stop is not cleanup'); await controller.close();
  await assert.rejects(settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId }), /cleanup|completion|report/i);
  assert.equal((await f.snapshot()).publicValidationFundings[0].settlement, undefined);
});

test('an unreported formal failure reuses its signed closed cleanup without claiming a game timing pass', async t => {
  const f = await fundingFixture(t), value = await fundedIntake(f);
  const draft: any = { brief: value.payload.brief, questions: [{ id: 'scope', prompt: '范围？' }], answers: { scope: '免费夹具' }, unsupported: [],
    acceptance: [{ acceptanceId: 'win', description: '点击目标', steps: ['点击目标'], expected: '胜利', evidenceKinds: ['test_report'] }],
    scenario: { viewport: { width: 800, height: 600 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#pair', timeoutMs: 1000 },
      { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] } };
  const saved = await value.controller.saveDraft(draft);
  const requirement = await value.controller.confirm({ revision: saved.revision, confirmed: true, actorId: 'offline-fixture', at: new Date().toISOString() });
  await value.controller.activateGeneration({ environmentReady: true, executionReady: true }); await value.controller.close();
  await assert.rejects(executeGeneration({ root: value.runRoot, requirement, draft, resume: false,
    createHost: async () => { throw new Error('Injected pre-report host failure'); } }), /pre-report/);
  const { readFundingCleanup } = await import('../../src/runtime/completion-timing.ts');
  const cleanup = await readFundingCleanup(value.runRoot);
  assert.match(cleanup.source, /completion-unreported/);
  const receipt = JSON.parse(await readFile(join(value.runRoot, cleanup.source), 'utf8'));
  assert.equal(receipt.current.status, 'unconfirmed'); assert.equal(receipt.eligible, false);
  const accounting = await RunController.open({ root: value.runRoot });
  await accounting.stop('Only accounting/stop follows original cleanup'); await accounting.close();
  assert.equal((await settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId })).outcome, 'closed');
});

test('funded cold recovery retains the real exited OwnerRecord before accounting and close', async t => {
  const f = await fundingFixture(t), value = await fundedIntake(f); await value.controller.close();
  const source = `import { IntakeController } from ${JSON.stringify(new URL('../../src/runtime/intake.ts', import.meta.url).href)};
const owner = await IntakeController.open({root:${JSON.stringify(value.runRoot)}});
await owner.beginFundingWork('interview'); process.exit(0);`;
  const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let diagnostics = ''; child.stderr.on('data', bytes => { diagnostics += bytes; });
  const code = await new Promise<number | null>((accept, reject) => { child.once('error', reject); child.once('close', accept); });
  assert.equal(code, 0, diagnostics);
  const originalOwner = JSON.parse(await readFile(join(value.runRoot, '.controller.lock'), 'utf8'));
  assert.equal(await recoverRunOwner(value.runRoot), true);
  const recovered = JSON.parse(await readFile(join(value.runRoot, `public-funding-recovery/${originalOwner.token}.json`), 'utf8'));
  assert.deepEqual(recovered.owner, originalOwner);
  const accounting = await IntakeController.open({ root: value.runRoot });
  const state = await accounting.read();
  assert.equal(state.events.filter(row => row.type === 'public_intake_work_recovered').length, 1);
  await accounting.stop('Previous process exited and accounting is closed'); await accounting.close();
  assert.equal((await settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId })).outcome, 'closed');
});

test('funded recovery preserves verified evidence across record failures and a lost unlink response', async t => {
  for (const phase of ['before-record', 'write-failure', 'after-record', 'after-unlink'] as const) {
    const f = await fundingFixture(t), value = await fundedIntake(f, `recover-${phase}`); await value.controller.close();
    const source = `import { IntakeController } from ${JSON.stringify(new URL('../../src/runtime/intake.ts', import.meta.url).href)};
const owner = await IntakeController.open({root:${JSON.stringify(value.runRoot)}});
await owner.beginFundingWork('interview'); process.exit(0);`;
    const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { SYSTEMROOT: process.env.SYSTEMROOT },
    });
    let diagnostics = ''; child.stderr.on('data', bytes => { diagnostics += bytes; });
    const code = await new Promise<number | null>((accept, reject) => { child.once('error', reject); child.once('close', accept); });
    assert.equal(code, 0, diagnostics);
    const lockPath = join(value.runRoot, '.controller.lock'), originalBytes = await readFile(lockPath), originalOwner = JSON.parse(originalBytes.toString('utf8'));
    const receiptPath = join(value.runRoot, `public-funding-recovery/${originalOwner.token}.json`);
    const blockedDirectory = join(value.runRoot, 'public-funding-recovery');
    if (phase === 'write-failure') await writeFile(blockedDirectory, 'Injected non-directory blocks durable receipt creation', 'utf8');
    const recover = SnapshotStore.recover;
    SnapshotStore.recover = async (root, persist) => {
      if (phase === 'write-failure') return recover(root, persist);
      let recorded = false;
      const result = await recover(root, async owner => {
        recorded = true;
        if (phase === 'before-record') throw new Error('Injected recovery record failure');
        await persist?.(owner);
        if (phase === 'after-record') throw new Error('Injected response loss after record publication');
      });
      if (phase === 'after-unlink' || !recorded) throw new Error('Injected response loss after unlink');
      return result;
    };
    try { await assert.rejects(recoverRunOwner(value.runRoot), /Injected|EEXIST|ENOTDIR|Non-directory/); }
    finally { SnapshotStore.recover = recover; }
    let receiptBefore: Buffer | undefined;
    if (phase === 'after-unlink') await assert.rejects(readFile(lockPath), { code: 'ENOENT' });
    else assert.deepEqual(await readFile(lockPath), originalBytes, 'A failed persistence step must retain the original lock bytes.');
    if (phase === 'write-failure') await unlink(blockedDirectory);
    if (phase === 'before-record' || phase === 'write-failure') await assert.rejects(readFile(receiptPath), { code: 'ENOENT' });
    else receiptBefore = await readFile(receiptPath);
    if (receiptBefore) await new Promise(done => setTimeout(done, 5));
    assert.equal(await recoverRunOwner(value.runRoot), phase !== 'after-unlink');
    const receipt = await readFile(receiptPath);
    if (receiptBefore) assert.deepEqual(receipt, receiptBefore, 'Retry must retain the original recovery timestamp and bytes.');
    assert.deepEqual(JSON.parse(receipt.toString('utf8')).owner, originalOwner);
    const accounting = await IntakeController.open({ root: value.runRoot });
    assert.equal((await accounting.read()).events.filter(row => row.type === 'public_intake_work_recovered').length, 1);
    await accounting.stop('Verified recovery survives interruptions'); await accounting.close();
    assert.equal((await settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId })).outcome, 'closed');
  }
});

test('formal failed cleanup keeps its grant after stop and owner release', async t => {
  const f = await fundingFixture(t), value = await fundedIntake(f);
  const draft: any = { brief: value.payload.brief, questions: [{ id: 'scope', prompt: '范围？' }], answers: { scope: '免费夹具' }, unsupported: [],
    acceptance: [{ acceptanceId: 'win', description: '点击目标', steps: ['点击目标'], expected: '胜利', evidenceKinds: ['test_report'] }],
    scenario: { viewport: { width: 800, height: 600 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#pair', timeoutMs: 1000 },
      { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] } };
  const saved = await value.controller.saveDraft(draft);
  const requirement = await value.controller.confirm({ revision: saved.revision, confirmed: true, actorId: 'offline-fixture', at: new Date().toISOString() });
  await value.controller.activateGeneration({ environmentReady: true, executionReady: true }); await value.controller.close();
  const result: any = await executeGeneration({ root: value.runRoot, requirement, draft, resume: false, createHost: async () => ({
    capability: 'free-cleanup-failure', availableArtifacts: requirement.sources, taskPolicies: [],
    roleFactory: async () => { throw new Error('No real provider in this fixture'); },
    capture: async () => { throw new Error('No game'); }, verify: async () => [], recoverCapture: async () => { throw new Error('No game'); },
    finish: async () => ({ gaps: ['The free fixture does not generate a game.'] }), repair: async () => null,
    closePreparation: async () => { throw new Error('A late resource writer has not closed.'); },
  }) });
  assert.equal(result.completionTiming.cleanup.some((row: any) => row.outcome === 'failed'), true);
  const owner = await RunController.open({ root: value.runRoot }); await owner.stop('Stop cannot replace cleanup'); await owner.close();
  await assert.rejects(settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId }), /failed|unconfirmed/);
  assert.equal((await f.snapshot()).publicValidationFundings[0].settlement, undefined);
});
