import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir, writeFile, unlink } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { chargeIntake, fundedIntake, fundingFixture } from './public-validation-funding.fixture.ts';
import { reservePublicValidationFunding, settlePublicValidationFunding } from '../../src/runtime/public-validation-funding.ts';
import { preparePublicValidationPhaseExtension, applyPublicValidationPhaseExtension } from '../../src/runtime/public-validation-phase-extension.ts';
import type { PublicValidationPhaseDecision, PublicValidationPhaseQuote } from '../../src/runtime/public-validation-phase-types.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { prepareValidationCase } from '../../src/runtime/validation-window.ts';
import { RunController } from '../../src/runtime/run.ts';
import { supplementFixture } from './validation-group-supplement.fixture.ts';
import type { TestContext } from 'node:test';

async function fixture(t: TestContext, spent = 26_000_000) {
  const f = await fundingFixture(t, spent);
  assert.ok(resolve(f.root).startsWith(resolve(tmpdir()) + sep), 'Every phase API test must use its newly created TEMP ledger.');
  const options = { root: f.root, repositoryRoot: f.repositoryRoot, now: Date.now };
  const decide = async (quote: PublicValidationPhaseQuote, decisionId = 'offline-phase-one'): Promise<PublicValidationPhaseDecision> => {
    const decision: PublicValidationPhaseDecision = { kind: 'operator_public_validation_phase_extension', decisionId, actorId: 'offline-budget-operator',
      decidedAt: new Date().toISOString(), source: { artifactId: 'phase-budget-decision', version: decisionId, location: `phase-${decisionId}.json` }, sourceRefs: f.evidence };
    const { source: _source, ...fields } = decision;
    await writeFile(join(f.root, decision.source.location), JSON.stringify({ formatVersion: 'operator-public-validation-phase-extension-decision/1', ...fields, quote }), 'utf8');
    return decision;
  };
  const extend = async () => {
    const quote = await preparePublicValidationPhaseExtension(options), decision = await decide(quote);
    return applyPublicValidationPhaseExtension({ ...options, quote, decision });
  };
  const authorization: typeof f.authorization = async (...args) => {
    const value = await f.authorization(...args), phase = (await f.snapshot()).publicValidationPhaseExtension;
    if (phase) value.payload.sourceRefs = [...value.payload.sourceRefs, phase.operatorDecision.source];
    await writeFile(join(f.root, value.authorization.location), JSON.stringify(value.payload), 'utf8'); return value;
  };
  return { ...f, options, decide, extend, authorization, rawAuthorization: f.authorization };
}

test('an explicit phase decision alone permits a fresh public reservation across thirty yuan', async t => {
  const f = await fixture(t);
  const denied = await f.authorization('default-thirty');
  await assert.rejects(reservePublicValidationFunding(denied), /phase/);
  const before = await readFile(join(f.root, 'snapshot.json')), names = await readdir(f.root);
  const acquire = SnapshotStore.acquire;
  SnapshotStore.acquire = async () => { throw new Error('prepare must not acquire any lock'); };
  let quote: PublicValidationPhaseQuote;
  try { quote = await preparePublicValidationPhaseExtension(f.options); } finally { SnapshotStore.acquire = acquire; }
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  assert.deepEqual(await readdir(f.root), names);
  const decision = await f.decide(quote);
  const receipt = await applyPublicValidationPhaseExtension({ ...f.options, quote, decision });
  assert.equal(receipt.activationAllowed, false);
  const after = await f.snapshot(), original = JSON.parse(before.toString('utf8'));
  delete after.publicValidationPhaseExtension; after.events.pop(); after.revision--;
  assert.deepEqual(after, original);
  const args = await f.authorization('new-phase');
  await reservePublicValidationFunding(args);
  assert.equal((await f.snapshot()).publicValidationFundings.at(-1).phaseDecisionId, decision.decisionId);
});

test('production settlement crosses thirty and all held grants enforce the exact forty boundary', async t => {
  const f = await fixture(t, 29_999_999); await f.extend();
  const value = await fundedIntake(f, 'cross-thirty');
  await chargeIntake(value, 'cross-thirty-charge'); await value.controller.stop('Synthetic permanent stop'); await value.controller.close();
  assert.equal((await settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId })).settledMicroCny, 2);
  assert.equal((await f.snapshot()).run.fees.settledMicroCny, 30_000_001);
  await reservePublicValidationFunding(await f.authorization('held-first', 4_999_999));
  const a = await f.authorization('race-a'), b = await f.authorization('race-b');
  const results = await Promise.allSettled([reservePublicValidationFunding(a), reservePublicValidationFunding(b)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  await assert.rejects(reservePublicValidationFunding(await f.authorization('one-too-many', 1)), /phase/);
  const state = await f.snapshot(); validateSnapshot(state);
  assert.equal(state.run.fees.settledMicroCny + state.publicValidationFundings.filter((row: any) => !row.settlement).reduce((sum: number, row: any) => sum + row.binding.limits.limitMicroCny, 0), 40_000_000);
  // A released lock is not the boundary: the losing identity still cannot reserve on retry.
  const loser = results[0].status === 'rejected' ? a : b;
  await assert.rejects(reservePublicValidationFunding(loser), /phase/);
});

test('apply retries after a committed lost response preserve the exact original receipt', async t => {
  const f = await fixture(t), quote = await preparePublicValidationPhaseExtension(f.options), decision = await f.decide(quote), write = SnapshotStore.prototype.write;
  let interrupted = false;
  SnapshotStore.prototype.write = async function(value) {
    await write.call(this, value);
    if (!interrupted && this.root === f.root && (value as any).publicValidationPhaseExtension) { interrupted = true; throw new Error('Injected lost phase response'); }
  };
  try { await assert.rejects(applyPublicValidationPhaseExtension({ ...f.options, quote, decision }), /Injected/); }
  finally { SnapshotStore.prototype.write = write; }
  const before = await readFile(join(f.root, 'snapshot.json'));
  const receipt = await applyPublicValidationPhaseExtension({ ...f.options, quote, decision });
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  assert.deepEqual(receipt, (await f.snapshot()).publicValidationPhaseExtension);
  await assert.rejects(applyPublicValidationPhaseExtension({ ...f.options, quote, decision: await f.decide(quote, 'another-phase') }), /conflict/);
  await assert.rejects(preparePublicValidationPhaseExtension(f.options), /already extended/);
});

test('a phase quote rejects stale bytes, reused decisions, missing and changed decision sources', async t => {
  const f = await fixture(t), quote = await preparePublicValidationPhaseExtension(f.options), decision = await f.decide(quote);
  const path = join(f.root, 'snapshot.json'), original = await readFile(path), sourcePath = join(f.root, decision.source.location), source = await readFile(sourcePath);
  await writeFile(path, Buffer.concat([original, Buffer.from(' ')]));
  await assert.rejects(applyPublicValidationPhaseExtension({ ...f.options, quote, decision }), /stale/); await writeFile(path, original);
  await unlink(sourcePath); await assert.rejects(applyPublicValidationPhaseExtension({ ...f.options, quote, decision }));
  await writeFile(sourcePath, '{}', 'utf8'); await assert.rejects(applyPublicValidationPhaseExtension({ ...f.options, quote, decision }));
  await writeFile(sourcePath, source);
  const used = (await f.snapshot()).validation.cases[0].operatorDecision.decisionId;
  await assert.rejects(applyPublicValidationPhaseExtension({ ...f.options, quote, decision: await f.decide(quote, used) }), /consumed/);
  const unknown = { ...quote, fromMicroCny: 29_000_000 } as any;
  await assert.rejects(applyPublicValidationPhaseExtension({ ...f.options, quote: unknown, decision }));
  assert.deepEqual(await readFile(path), original);
  await applyPublicValidationPhaseExtension({ ...f.options, quote, decision });
  await writeFile(sourcePath, Buffer.concat([source, Buffer.from(' ')]));
  await assert.rejects(applyPublicValidationPhaseExtension({ ...f.options, quote, decision }));
  await assert.rejects(reservePublicValidationFunding(await f.authorization('tampered-phase')));
});

test('new run authorizations require the exact phase reference, a distinct decision and five yuan thirty minute bounds', async t => {
  const f = await fixture(t), receipt = await f.extend();
  for (const kind of ['missing', 'wrong', 'reused', 'early', 'amount', 'duration', 'original-run', 'original-ledger', 'old-decision']) {
    const args = await f.authorization(kind);
    if (kind === 'missing') args.payload.sourceRefs = f.evidence;
    if (kind === 'wrong') args.payload.sourceRefs.at(-1)!.version = 'wrong';
    if (kind === 'reused') args.payload.decisionId = receipt.operatorDecision.decisionId;
    if (kind === 'early') args.payload.decidedAt = '2026-10-01T00:00:00.000Z';
    if (kind === 'amount') args.payload.limits.limitMicroCny = 5_000_001;
    if (kind === 'duration') args.payload.limits.durationMs = 1_860_000;
    if (kind === 'original-run') args.payload.runId = args.payload.sharedRunId;
    if (kind === 'original-ledger') args.payload.ledgerId = args.payload.sharedLedgerId;
    if (kind === 'old-decision') args.payload.decisionId = (await f.snapshot()).validation.cases[0].operatorDecision.decisionId;
    await writeFile(join(f.root, args.authorization.location), JSON.stringify(args.payload), 'utf8');
    await assert.rejects(reservePublicValidationFunding(args), /phase/);
  }
  assert.equal((await f.snapshot()).publicValidationFundings, undefined);
});

test('stopped case running labels survive extension while old dispatch and new fixed claims remain blocked', async t => {
  const f = await fixture(t), current = await f.claim(await f.declaration('cos20-phase-running'));
  const task = await f.register(current, 'coding'); task.state = 'ready';
  await current.controller.saveTask(task, { role: 'system', actorId: 'offline' });
  task.state = 'running'; task.attempts.push({ attemptId: 'offline-running', sessionRef: 'offline-session', startedAt: new Date(f.now()).toISOString(), endedAt: null, outcome: 'running', failure: null });
  await current.controller.saveTask(task, { role: 'system', actorId: 'offline' }); await current.controller.close();
  const options = { ...f, caseId: current.window.caseId, windowId: current.window.windowId, now: () => Date.parse(current.window.deadlineAt) + 1 };
  const expired = await RunController.openValidationCase({ ...options, accountingOnly: true }); await expired.close();
  const before = await f.snapshot(); assert.equal(before.validation.cases.at(-1).stopReason.code, 'deadline');
  await f.extend(); assert.deepEqual((await f.snapshot()).tasks, before.tasks);
  await assert.rejects(RunController.openValidationCase(options), /stopped/);
  const controller = await RunController.openValidationCase({ ...options, accountingOnly: true });
  try {
    assert.equal((await controller.read()).tasks[0].attempts[0].endedAt, null);
    await assert.rejects(controller.reserve(f.request(current, 'coding', 'old-new-request', 20)));
    await assert.rejects(controller.admit('prior-deepseek-direct-probes'));
    await assert.rejects(controller.claimValidationRepair({ sourceTaskId: task.taskId, feedback: f.evidence[0] }));
  } finally { await controller.close(); }
  await assert.rejects(prepareValidationCase({ ...f, declaration: await f.declaration('cos20-forbidden-after-phase') }), /phase/);
  await reservePublicValidationFunding(await f.authorization('running-label-compatible'));
  assert.deepEqual((await f.snapshot()).tasks, before.tasks);
  const changed = await f.snapshot(); changed.tasks[0].attempts[0].endedAt = new Date().toISOString();
  assert.throws(() => validateSnapshot(changed));
});

test('closed public funding keeps its legacy prefix and sources while new funding binds the phase', async t => {
  const f = await fixture(t, 20_000_000), old = await fundedIntake(f, 'legacy-public', 6_000_000);
  await chargeIntake(old, 'legacy-public-charge'); await old.controller.stop('Old public run permanently stopped'); await old.controller.close();
  await settlePublicValidationFunding({ ...old, fundingId: old.binding.fundingId });
  const before = await f.snapshot(), original = structuredClone(before.publicValidationFundings[0]);
  const quote = await preparePublicValidationPhaseExtension(f.options);
  // A public per-run decision cannot double as the independent phase decision.
  await assert.rejects(applyPublicValidationPhaseExtension({ ...f.options, quote, decision: await f.decide(quote, old.payload.decisionId) }), /consumed/);
  const decision = await f.decide(quote); await applyPublicValidationPhaseExtension({ ...f.options, quote, decision });
  await reservePublicValidationFunding(await f.authorization('after-legacy-public'));
  const state = await f.snapshot(); assert.deepEqual(state.publicValidationFundings[0], original);
  assert.equal(original.phaseDecisionId, undefined); assert.equal(state.publicValidationFundings[1].phaseDecisionId, decision.decisionId);
  for (const location of [old.authorization.location, original.settlement.source.location, before.allocationClosureDecisions[0].operatorDecision.source.location]) {
    const path = join(f.root, location), bytes = await readFile(path); await writeFile(path, Buffer.concat([bytes, Buffer.from(' ')]));
    await assert.rejects(reservePublicValidationFunding(await f.authorization(`source-${location.includes('settlement') ? 'settlement' : location.includes('closure') ? 'closure' : 'authorization'}`)));
    await writeFile(path, bytes);
  }
  const tampered = structuredClone(state); tampered.publicValidationFundings[0].phaseDecisionId = decision.decisionId;
  assert.throws(() => validateSnapshot(tampered));
});

test('phase preparation rejects unresolved windows, charges, owners and historical sources without writing', async t => {
  const f = await fixture(t), path = join(f.root, 'snapshot.json'), original = await readFile(path), before = await f.snapshot();
  for (const fault of ['case-stop', 'original-stop', 'unknown', 'overrun', 'declaration']) {
    const value = structuredClone(before);
    if (fault === 'case-stop') value.validation.cases[0].stopReason = null;
    if (fault === 'original-stop') value.stopReason = null;
    if (fault === 'unknown') { value.ledger.entries[0].status = 'unknown'; value.ledger.entries[0].unknown = true; value.run.fees.unknownRequestIds = [value.ledger.entries[0].requestId]; }
    if (fault === 'overrun') value.stopReason.code = 'charge_overrun';
    if (fault === 'declaration') value.validation.cases[0].quote.declaration.limits.cumulativeMicroCny = 40_000_000;
    await writeFile(path, JSON.stringify(value), 'utf8'); await assert.rejects(preparePublicValidationPhaseExtension(f.options));
  }
  await writeFile(path, original);
  const caseRoot = join(f.repositoryRoot, '.cosmos/e2e', before.validation.cases[0].caseId);
  for (const ownerPath of [join(f.root, '.controller.lock'), join(caseRoot, '.controller.lock'), join(caseRoot, 'registry/.commit.lock')]) {
    await writeFile(ownerPath, 'Unresolved synthetic owner', 'utf8'); await assert.rejects(preparePublicValidationPhaseExtension(f.options)); await unlink(ownerPath);
  }
  const sourcePath = join(f.root, before.validation.cases[0].operatorDecision.source.location), source = await readFile(sourcePath);
  await writeFile(sourcePath, '{}', 'utf8'); await assert.rejects(preparePublicValidationPhaseExtension(f.options)); await writeFile(sourcePath, source);
  assert.deepEqual(await readFile(path), original);
});

test('ledger5 phase extension preserves the original delegation and supplement and rereads their source', async t => {
  const f = await supplementFixture(t); assert.ok(resolve(f.root).startsWith(resolve(tmpdir()) + sep));
  const supplement = await RunController.prepareValidationGroupSupplement(f);
  await RunController.applyValidationGroupSupplement({ ...f, quote: supplement, decision: await f.decision(supplement) });
  const before = await f.snapshot(), options = { root: f.root, repositoryRoot: f.repositoryRoot, now: Date.now };
  const quote = await preparePublicValidationPhaseExtension(options);
  const decision: PublicValidationPhaseDecision = { kind: 'operator_public_validation_phase_extension', decisionId: 'ledger-five-phase', actorId: 'offline-operator',
    decidedAt: new Date().toISOString(), source: { artifactId: 'phase-decision', version: 'five', location: 'phase-five.json' }, sourceRefs: f.evidence };
  const { source: _source, ...fields } = decision;
  await writeFile(join(f.root, decision.source.location), JSON.stringify({ formatVersion: 'operator-public-validation-phase-extension-decision/1', ...fields, quote }), 'utf8');
  const sourcePath = join(f.root, before.allocationSupplementDecisions[0].operatorDecision.source.location), source = await readFile(sourcePath);
  await writeFile(sourcePath, Buffer.concat([source, Buffer.from(' ')]));
  await assert.rejects(applyPublicValidationPhaseExtension({ ...options, quote, decision })); await writeFile(sourcePath, source);
  await applyPublicValidationPhaseExtension({ ...options, quote, decision });
  const after = await f.snapshot(); validateSnapshot(after); assert.equal(after.ledger.contractVersion, '5.0.0');
  delete after.publicValidationPhaseExtension; after.revision--; after.events.pop(); assert.deepEqual(after, before);
});

test('new reserve and pending admission recheck phase and historical sources before transport', async t => {
  const f = await fixture(t), receipt = await f.extend(), value = await fundedIntake(f, 'live-gate');
  const request = { requestId: 'pending', taskId: 'intake', provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: 20 };
  await value.controller.reserve(request);
  let transport = 0;
  for (const relative of [receipt.operatorDecision.source.location, (await f.snapshot()).validation.cases[0].operatorDecision.source.location]) {
    const path = join(f.root, relative), bytes = await readFile(path); await writeFile(path, Buffer.concat([bytes, Buffer.from(' ')]));
    await assert.rejects(value.controller.reserve({ ...request, requestId: 'blocked-reserve' }));
    await assert.rejects(value.controller.admit('pending').then(() => { transport++; }));
    await writeFile(path, bytes);
  }
  assert.equal(transport, 0); await value.controller.cancel('pending', f.evidence);
  await value.controller.stop('Synthetic complete'); await value.controller.close();
  await settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId });
});
