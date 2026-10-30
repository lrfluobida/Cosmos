import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { mkdir, readFile, readdir, writeFile, unlink } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { chargeIntake, fundedIntake, fundingFixture } from './public-validation-funding.fixture.ts';
import * as phases from '../../src/runtime/public-validation-phase-extension.ts';
import { phaseHash, publicValidationPhaseLimit, requirePhaseFundingAuthorization } from '../../src/runtime/public-validation-phase-validation.ts';
import { reservePublicValidationFunding, settlePublicValidationFunding, sharedSources, verifyPublicValidationFunding, rejectFundedContinuation } from '../../src/runtime/public-validation-funding.ts';
import type { PublicValidationPhaseDecision, PublicValidationPhaseQuote, PublicValidationPhaseSuccessorDecision, PublicValidationPhaseSuccessorQuote } from '../../src/runtime/public-validation-phase-types.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { prepareValidationCase } from '../../src/runtime/validation-window.ts';
import { RunController } from '../../src/runtime/run.ts';
import { budgetCapacity } from '../../src/contracts/budget.ts';

async function fixture(t: TestContext, spent = 26_000_000) {
  const f = await fundingFixture(t, spent);
  for (const root of [f.root, f.repositoryRoot]) assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep), 'Phase mutations require wholly synthetic absolute TEMP roots.');
  const options = { root: f.root, repositoryRoot: f.repositoryRoot, now: Date.now };
  const legacyDecision = async (quote: PublicValidationPhaseQuote): Promise<PublicValidationPhaseDecision> => {
    const decision: PublicValidationPhaseDecision = { kind: 'operator_public_validation_phase_extension', decisionId: 'offline-forty', actorId: 'offline-operator',
      decidedAt: new Date().toISOString(), source: { artifactId: 'phase', version: 'forty', location: 'phase-forty.json' }, sourceRefs: f.evidence };
    const { source: _source, ...fields } = decision;
    await writeFile(join(f.root, decision.source.location), JSON.stringify({ formatVersion: 'operator-public-validation-phase-extension-decision/1', ...fields, quote }), 'utf8');
    return decision;
  };
  const extend = async () => {
    const quote = await phases.preparePublicValidationPhaseExtension(options), decision = await legacyDecision(quote);
    return phases.applyPublicValidationPhaseExtension({ ...options, quote, decision });
  };
  const prepare = (toMicroCny = 45_000_000) => {
    assert.equal(typeof phases.preparePublicValidationPhaseSuccessor, 'function', 'Missing readonly successor quote API');
    return phases.preparePublicValidationPhaseSuccessor({ ...options, toMicroCny });
  };
  const decide = async (quote: PublicValidationPhaseSuccessorQuote, decisionId = 'offline-successor'): Promise<PublicValidationPhaseSuccessorDecision> => {
    const state = await f.snapshot(), decision: PublicValidationPhaseSuccessorDecision = {
      kind: 'operator_public_validation_phase_successor', decisionId, actorId: 'offline-operator', decidedAt: new Date().toISOString(),
      source: { artifactId: 'phase', version: decisionId, location: `phase-${decisionId}.json` }, sourceRefs: [...f.evidence, state.publicValidationPhaseExtension.operatorDecision.source],
    };
    const { source: _source, ...fields } = decision;
    await writeFile(join(f.root, decision.source.location), JSON.stringify({ formatVersion: 'operator-public-validation-phase-successor-decision/1', ...fields, quote }), 'utf8');
    return decision;
  };
  const succeed = async (toMicroCny = 45_000_000) => {
    const quote = await prepare(toMicroCny), decision = await decide(quote);
    return phases.applyPublicValidationPhaseSuccessor({ ...options, quote, decision });
  };
  const authorization: typeof f.authorization = async (...args) => {
    const value = await f.authorization(...args), state = await f.snapshot(), phase = state.publicValidationPhaseSuccessor ?? state.publicValidationPhaseExtension;
    if (phase) value.payload.sourceRefs = [...value.payload.sourceRefs, phase.operatorDecision.source];
    await writeFile(join(f.root, value.authorization.location), JSON.stringify(value.payload), 'utf8'); return value;
  };
  return { ...f, options, extend, prepare, decide, succeed, authorization };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function closeFunding(f: Fixture, name: string, input = 1, cap = 5_000_000) {
  const value = await fundedIntake(f, name, cap);
  await chargeIntake(value, `${name}-charge`, input, Math.max(20, input * 2));
  await value.controller.stop('Synthetic permanent stop'); await value.controller.close();
  const settlement = await settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId });
  return { ...value, settlement };
}
async function changedFile(path: string, action: () => Promise<unknown>) {
  const bytes = await readFile(path);
  await writeFile(path, Buffer.concat([bytes, Buffer.from(' ')]));
  try { await action(); } finally { await writeFile(path, bytes); }
}
function rehash(quote: PublicValidationPhaseSuccessorQuote) {
  const { quoteId: _id, ...payload } = quote;
  quote.quoteId = `pvpsq1-${phaseHash(JSON.stringify(payload))}`;
  return quote;
}

test('successor source upgrade leaves an existing forty phase unchanged', async t => {
  const f = await fixture(t), original = await f.extend(), bytes = await readFile(join(f.root, 'snapshot.json'));
  validateSnapshot(await f.snapshot()); assert.equal(publicValidationPhaseLimit(await f.snapshot()), 40_000_000);
  assert.equal((await f.snapshot()).publicValidationPhaseSuccessor, undefined);
  assert.equal(JSON.stringify((await f.snapshot()).publicValidationPhaseExtension), JSON.stringify(original));
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), bytes);
});

test('successor prepare is readonly and requires an explicit bounded target', async t => {
  const f = await fixture(t); await assert.rejects(f.prepare()); await f.extend();
  const before = await readFile(join(f.root, 'snapshot.json')), files = await readdir(f.root, { recursive: true });
  const acquire = SnapshotStore.acquire;
  SnapshotStore.acquire = async () => { throw new Error('Readonly preparation acquired a lock'); };
  try {
    for (const toMicroCny of [undefined, NaN, Infinity, 40_000_000, 39_999_999, 40_000_000.1, 150_000_001]) {
      await assert.rejects(phases.preparePublicValidationPhaseSuccessor({ ...f.options, toMicroCny: toMicroCny as number }));
    }
    for (const target of [40_000_001, 150_000_000]) {
      const quote = await f.prepare(target);
      assert.equal(quote.toMicroCny, target); assert.equal(quote.activationAllowed, false);
      assert.equal(quote.basis.snapshotSha256, phaseHash(before));
    }
  } finally { SnapshotStore.acquire = acquire; }
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before); assert.deepEqual(await readdir(f.root, { recursive: true }), files);
});

test('successor preserves original receipt and all three funding generations', async t => {
  const f = await fixture(t, 20_000_000), pre = await closeFunding(f, 'pre-extension', 1, 6_000_000), original = await f.extend();
  const forty = await closeFunding(f, 'forty'), before = await f.snapshot(), originalBytes = await readFile(join(f.root, original.operatorDecision.source.location));
  const successor = await f.succeed(), after = await f.snapshot();
  delete after.publicValidationPhaseSuccessor; after.revision--; after.events.pop(); assert.deepEqual(after, before);
  assert.equal(JSON.stringify(after.publicValidationPhaseExtension), JSON.stringify(original));
  assert.deepEqual(await readFile(join(f.root, original.operatorDecision.source.location)), originalBytes);
  const latest = await closeFunding(f, 'successor'), state = await f.snapshot(); validateSnapshot(state);
  assert.ok(state.publicValidationFundings);
  assert.deepEqual(state.publicValidationFundings.map((row: { phaseDecisionId?: string }) => row.phaseDecisionId), [undefined, original.operatorDecision.decisionId, successor.operatorDecision.decisionId]);
  assert.deepEqual(state.publicValidationFundings.slice(0, 2), before.publicValidationFundings);
  const bytes = await readFile(join(f.root, 'snapshot.json'));
  for (const value of [pre, forty, latest]) {
    assert.deepEqual(await reservePublicValidationFunding(value), value.binding);
    assert.deepEqual(await settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId }), value.settlement);
    await verifyPublicValidationFunding({ root: value.runRoot, snapshot: await f.child(value.runRoot), dispatch: false });
    await assert.rejects(verifyPublicValidationFunding({ root: value.runRoot, snapshot: await f.child(value.runRoot), dispatch: true }), /closed/);
    await assert.rejects(rejectFundedContinuation(value.runRoot, await f.child(value.runRoot)), /continuation/);
  }
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), bytes);
  for (const location of [pre.authorization.location, forty.authorization.location, pre.settlement.source.location, forty.settlement.source.location,
    original.operatorDecision.source.location, successor.operatorDecision.source.location]) {
    await changedFile(join(f.root, location), () => assert.rejects(sharedSources(f.root, state)));
  }
  assert.throws(() => requirePhaseFundingAuthorization(state, latest.payload, 'unknown-phase'));
  for (const [index, id] of [[0, original.operatorDecision.decisionId], [1, successor.operatorDecision.decisionId], [2, original.operatorDecision.decisionId], [2, undefined]] as const) {
    const bad = structuredClone(state); assert.ok(bad.publicValidationFundings);
    if (id === undefined) delete bad.publicValidationFundings[index].phaseDecisionId; else bad.publicValidationFundings[index].phaseDecisionId = id;
    assert.throws(() => validateSnapshot(bad));
  }
});

test('successor rejects stale quote and changed original or independent sources', async t => {
  const f = await fixture(t), original = await f.extend(), closed = await closeFunding(f, 'already-used'), quote = await f.prepare(), decision = await f.decide(quote);
  const apply = () => phases.applyPublicValidationPhaseSuccessor({ ...f.options, quote, decision });
  const path = join(f.root, 'snapshot.json'), bytes = await readFile(path);
  await changedFile(path, () => assert.rejects(apply, /stale/));
  const revision = await f.snapshot(); revision.revision++; await writeFile(path, JSON.stringify(revision), 'utf8');
  await assert.rejects(apply, /stale/); await writeFile(path, bytes);
  for (const location of [original.operatorDecision.source.location, (await f.snapshot()).validation.cases[0].operatorDecision.source.location]) {
    await changedFile(join(f.root, location), () => assert.rejects(apply));
  }
  const sourcePath = join(f.root, decision.source.location), source = await readFile(sourcePath);
  await unlink(sourcePath); await assert.rejects(apply); await writeFile(sourcePath, source);
  await writeFile(sourcePath, '{}', 'utf8'); await assert.rejects(apply); await writeFile(sourcePath, source);
  for (const fault of ['predecessor', 'source-hash', 'receipt-hash', 'history', 'unknown-field', 'missing-field', 'from', 'lifetime', 'root', 'ledger', 'target']) {
    const bad = structuredClone(quote) as any;
    if (fault === 'predecessor') bad.predecessor.decisionId = 'unknown';
    if (fault === 'source-hash') bad.predecessor.sourceSha256 = 'a'.repeat(64);
    if (fault === 'receipt-hash') bad.predecessor.receiptSha256 = 'a'.repeat(64);
    if (fault === 'history') bad.basis.historySha256 = 'a'.repeat(64);
    if (fault === 'unknown-field') bad.extra = true;
    if (fault === 'missing-field') delete bad.predecessor.sourceSha256;
    if (fault === 'from') bad.fromMicroCny = 39_000_000;
    if (fault === 'lifetime') bad.lifetimeMicroCny++;
    if (fault === 'root') bad.sharedRoot = f.repositoryRoot;
    if (fault === 'ledger') bad.basis.ledgerId = 'another';
    if (fault === 'target') bad.toMicroCny = 150_000_001;
    rehash(bad);
    await assert.rejects(phases.applyPublicValidationPhaseSuccessor({ ...f.options, quote: bad, decision: await f.decide(bad, `fault-${fault}`) }));
  }
  for (const id of [original.operatorDecision.decisionId, closed.payload.decisionId, (await f.snapshot()).validation.cases[0].operatorDecision.decisionId,
    (await f.snapshot()).allocationClosureDecisions[0].operatorDecision.decisionId]) {
    await assert.rejects(phases.applyPublicValidationPhaseSuccessor({ ...f.options, quote, decision: await f.decide(quote, id) }), /consumed/);
  }
  assert.deepEqual(await readFile(path), bytes);
});

test('successor decisions and receipt boundaries cannot lose their exact predecessor or event', async t => {
  const f = await fixture(t), original = await f.extend(), quote = await f.prepare(), before = await readFile(join(f.root, 'snapshot.json'));
  for (const fault of ['kind', 'early', 'future', 'reference', 'actor', 'extra']) {
    const decision = await f.decide(quote, `decision-${fault}`) as any;
    if (fault === 'kind') decision.kind = 'operator_public_validation_phase_extension';
    if (fault === 'early') decision.decidedAt = '2026-10-01T00:00:00.000Z';
    if (fault === 'future') decision.decidedAt = new Date(Date.now() + 60_000).toISOString();
    if (fault === 'reference') decision.sourceRefs = f.evidence;
    if (fault === 'actor') decision.actorId = ' ';
    if (fault === 'extra') decision.extra = true;
    const { source: _source, ...fields } = decision;
    await writeFile(join(f.root, decision.source.location), JSON.stringify({ formatVersion: 'operator-public-validation-phase-successor-decision/1', ...fields, quote }), 'utf8');
    await assert.rejects(phases.applyPublicValidationPhaseSuccessor({ ...f.options, quote, decision }));
  }
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  const receipt = await f.succeed(), state = await f.snapshot();
  for (const fault of ['missing-original', 'missing-successor', 'extra', 'unknown-decision-field', 'duplicate-event', 'missing-event', 'event-reason', 'basis-order', 'funding-order']) {
    const bad = structuredClone(state);
    if (fault === 'missing-original') delete bad.publicValidationPhaseExtension;
    if (fault === 'missing-successor') delete bad.publicValidationPhaseSuccessor;
    if (fault === 'extra') bad.publicValidationPhaseSuccessor.extra = true;
    if (fault === 'unknown-decision-field') bad.publicValidationPhaseSuccessor.operatorDecision.extra = true;
    if (fault === 'duplicate-event') bad.events.push({ ...bad.events.at(-1), sequence: bad.events.length + 1 });
    if (fault === 'missing-event') bad.events.pop();
    if (fault === 'event-reason') bad.events.at(-1).reason = '{}';
    if (fault === 'basis-order') bad.publicValidationPhaseSuccessor.quote.basis.eventCount = original.quote.basis.eventCount;
    if (fault === 'funding-order') bad.publicValidationPhaseSuccessor.quote.basis.fundingCount++;
    assert.throws(() => validateSnapshot(bad));
  }
  assert.equal(state.events.filter((event: { type: string }) => event.type === 'public_validation_phase_successor_applied').length, 1);
  assert.deepEqual(state.publicValidationPhaseSuccessor, receipt);
});

test('successor preparation rejects unresolved owners history and held grants', async t => {
  const f = await fixture(t, 20_000_000), old = await closeFunding(f, 'old'), original = await f.extend(), path = join(f.root, 'snapshot.json'), bytes = await readFile(path), state = await f.snapshot();
  for (const fault of ['case-stop', 'original-stop', 'unknown', 'reserved', 'overrun', 'declaration', 'legacy-receipt-field']) {
    const bad = structuredClone(state);
    if (fault === 'case-stop') bad.validation.cases[0].stopReason = null;
    if (fault === 'original-stop') bad.stopReason = null;
    if (fault === 'unknown') { bad.ledger.entries[0].unknown = true; bad.ledger.entries[0].status = 'unknown'; bad.run.fees.unknownRequestIds = [bad.ledger.entries[0].requestId]; }
    if (fault === 'reserved') { bad.ledger.entries[0].reservedMicroCny = 1; bad.run.fees.reservedMicroCny = 1; }
    if (fault === 'overrun') bad.stopReason.code = 'charge_overrun';
    if (fault === 'declaration') bad.validation.cases[0].quote.declaration.limits.cumulativeMicroCny = 40_000_000;
    if (fault === 'legacy-receipt-field') bad.publicValidationPhaseExtension.extra = true;
    await writeFile(path, JSON.stringify(bad), 'utf8'); await assert.rejects(f.prepare()); await writeFile(path, bytes);
  }
  const caseRoot = join(f.repositoryRoot, '.cosmos/e2e', state.validation.cases[0].caseId);
  for (const root of [f.root, caseRoot, old.runRoot]) {
    await mkdir(join(root, 'registry'), { recursive: true });
    for (const relative of ['.controller.lock', 'registry/.commit.lock']) {
      const owner = join(root, relative); await writeFile(owner, 'Unresolved synthetic owner', 'utf8');
      await assert.rejects(f.prepare()); await unlink(owner);
    }
  }
  await changedFile(join(f.root, original.operatorDecision.source.location), () => assert.rejects(f.prepare()));
  assert.deepEqual(await readFile(path), bytes);
  await reservePublicValidationFunding(await f.authorization('held'));
  await assert.rejects(f.prepare());
});

test('successor exact retries after lost response and held grants write no snapshot', async t => {
  const f = await fixture(t), original = await f.extend(), quote = await f.prepare(), decision = await f.decide(quote), write = SnapshotStore.prototype.write;
  let interrupted = false;
  SnapshotStore.prototype.write = async function(state) {
    await write.call(this, state);
    if (!interrupted && this.root === f.root && (state as RunSnapshot).publicValidationPhaseSuccessor) { interrupted = true; throw new Error('Injected committed lost response'); }
  };
  try { await assert.rejects(phases.applyPublicValidationPhaseSuccessor({ ...f.options, quote, decision }), /Injected/); }
  finally { SnapshotStore.prototype.write = write; }
  const successor = (await f.snapshot()).publicValidationPhaseSuccessor;
  const held = await fundedIntake(f, 'held');
  const { sourceSha256: _hash, ...oldDecision } = original.operatorDecision;
  const retry = async () => {
    const bytes = await readFile(join(f.root, 'snapshot.json'));
    SnapshotStore.prototype.write = async () => { throw new Error('An exact retry attempted a write'); };
    try {
      assert.deepEqual(await phases.applyPublicValidationPhaseSuccessor({ ...f.options, quote, decision }), successor);
      assert.deepEqual(await phases.applyPublicValidationPhaseExtension({ ...f.options, quote: original.quote, decision: oldDecision }), original);
    } finally { SnapshotStore.prototype.write = write; }
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), bytes); assert.equal(publicValidationPhaseLimit(await f.snapshot()), 45_000_000);
  };
  await retry(); await held.controller.stop('Synthetic permanent stop'); await held.controller.close();
  await settlePublicValidationFunding({ ...held, fundingId: held.binding.fundingId }); await retry();
  await assert.rejects(f.prepare(), /already/);
  await assert.rejects(phases.applyPublicValidationPhaseSuccessor({ ...f.options, quote, decision: await f.decide(quote, 'conflicting') }), /conflict/);
  const other = rehash({ ...quote, toMicroCny: 46_000_000 });
  await assert.rejects(phases.applyPublicValidationPhaseSuccessor({ ...f.options, quote: other, decision: await f.decide(other, 'different-target') }), /conflict/);
  await changedFile(join(f.root, decision.source.location), () => assert.rejects(phases.applyPublicValidationPhaseSuccessor({ ...f.options, quote, decision })));
});

test('successor new grants require latest independent authority and bounded limits', async t => {
  const f = await fixture(t), original = await f.extend(), successor = await f.succeed();
  for (const fault of ['missing', 'old', 'wrong', 'old-id', 'new-id', 'early', 'amount', 'duration', 'old-run', 'old-ledger']) {
    const args = await f.authorization(fault);
    if (fault === 'missing') args.payload.sourceRefs = f.evidence;
    if (fault === 'old') args.payload.sourceRefs = [...f.evidence, original.operatorDecision.source];
    if (fault === 'wrong') args.payload.sourceRefs.at(-1)!.version = 'wrong';
    if (fault === 'old-id') args.payload.decisionId = original.operatorDecision.decisionId;
    if (fault === 'new-id') args.payload.decisionId = successor.operatorDecision.decisionId;
    if (fault === 'early') args.payload.decidedAt = '2026-10-01T00:00:00.000Z';
    if (fault === 'amount') args.payload.limits.limitMicroCny = 5_000_001;
    if (fault === 'duration') args.payload.limits.durationMs = 1_860_000;
    if (fault === 'old-run') args.payload.runId = args.payload.sharedRunId;
    if (fault === 'old-ledger') args.payload.ledgerId = args.payload.sharedLedgerId;
    await writeFile(join(f.root, args.authorization.location), JSON.stringify(args.payload), 'utf8');
    await assert.rejects(reservePublicValidationFunding(args), /phase/);
  }
  assert.equal((await f.snapshot()).publicValidationFundings, undefined);
});

test('successor cumulative grants and production settlement obey the selected ceiling', async t => {
  const f = await fixture(t, 29_999_999); await f.extend();
  await closeFunding(f, 'two-micro');
  assert.equal((await f.snapshot()).run.fees.settledMicroCny, 30_000_001);
  const held = await fundedIntake(f, 'old-five-held');
  await assert.rejects(reservePublicValidationFunding(await f.authorization('before-successor')), /phase/);
  await held.controller.stop('Synthetic permanent stop'); await held.controller.close();
  await settlePublicValidationFunding({ ...held, fundingId: held.binding.fundingId });
  await f.succeed();
  await reservePublicValidationFunding(await f.authorization('five-held'));
  const a = await f.authorization('race-a'), b = await f.authorization('race-b');
  const results = await Promise.allSettled([reservePublicValidationFunding(a), reservePublicValidationFunding(b)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  await reservePublicValidationFunding(await f.authorization('remaining-held', 4_999_999));
  await assert.rejects(reservePublicValidationFunding(await f.authorization('one-over', 1)), /phase/);
  validateSnapshot(await f.snapshot());
});

test('successor still enforces original lifetime allocation capacity', async t => {
  const f = await fixture(t); await f.extend(); await f.succeed(150_000_000);
  const capacity = budgetCapacity((await f.snapshot()).ledger), available = capacity.effectiveLimitMicroCny - capacity.allocatedMicroCny;
  let reserved = 0;
  while (reserved + 5_000_000 <= available) { await reservePublicValidationFunding(await f.authorization(`capacity-${reserved}`)); reserved += 5_000_000; }
  await assert.rejects(reservePublicValidationFunding(await f.authorization('over-capacity')), /capacity/);
  assert.ok(publicValidationPhaseLimit(await f.snapshot()) > 26_000_000 + reserved + 5_000_000, 'Lifetime allocation capacity, not the phase sum, is binding');
});

test('successor source drift blocks the next reserve and pending admission before transport', async t => {
  const f = await fixture(t), original = await f.extend(), successor = await f.succeed(), value = await fundedIntake(f, 'gate');
  const request = { requestId: 'pending', taskId: 'intake', provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: 20 };
  await value.controller.reserve(request); let transport = 0;
  for (const receipt of [original, successor]) await changedFile(join(f.root, receipt.operatorDecision.source.location), async () => {
    await assert.rejects(value.controller.reserve({ ...request, requestId: 'blocked' }));
    await assert.rejects(value.controller.admit('pending').then(() => { transport++; }));
  });
  assert.equal(transport, 0); await value.controller.cancel('pending', f.evidence);
  await value.controller.stop('Synthetic permanent stop'); await value.controller.close();
  await settlePublicValidationFunding({ ...value, fundingId: value.binding.fundingId });
});

test('successor keeps stopped running labels and never reopens fixed case authority', async t => {
  const f = await fixture(t), current = await f.claim(await f.declaration('cos20-successor-running'));
  const task = await f.register(current, 'coding'); task.state = 'ready';
  await current.controller.saveTask(task, { role: 'system', actorId: 'offline' });
  task.state = 'running'; task.attempts.push({ attemptId: 'offline-running', sessionRef: 'offline-session', startedAt: new Date(f.now()).toISOString(), endedAt: null, outcome: 'running', failure: null });
  await current.controller.saveTask(task, { role: 'system', actorId: 'offline' }); await current.controller.close();
  const options = { ...f, caseId: current.window.caseId, windowId: current.window.windowId, now: () => Date.parse(current.window.deadlineAt) + 1 };
  const expired = await RunController.openValidationCase({ ...options, accountingOnly: true }); await expired.close();
  const before = await f.snapshot(); await f.extend(); await f.succeed();
  assert.deepEqual((await f.snapshot()).tasks, before.tasks);
  await assert.rejects(RunController.openValidationCase(options), /stopped/);
  const accounting = await RunController.openValidationCase({ ...options, accountingOnly: true });
  try {
    await assert.rejects(accounting.reserve(f.request(current, 'coding', 'forbidden', 20)));
    await assert.rejects(accounting.admit('prior-deepseek-direct-probes'));
    await assert.rejects(accounting.claimValidationRepair({ sourceTaskId: task.taskId, feedback: f.evidence[0] }));
  } finally { await accounting.close(); }
  await assert.rejects(prepareValidationCase({ ...f, declaration: await f.declaration('cos20-forbidden-successor') }), /phase/);
  const state: RunSnapshot = await f.snapshot(); assert.deepEqual(state.tasks, before.tasks);
});
