import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, readdir, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { followupFixture } from './public-validation-phase-followups.fixture.ts';
import { chargeIntake, fundedIntake, signedOrdinaryIncompleteFunding } from './public-validation-funding.fixture.ts';
import * as phases from '../../src/runtime/public-validation-phase-extension.ts';
import { phaseHash, publicValidationPhaseLimit, requirePhaseFundingAuthorization } from '../../src/runtime/public-validation-phase-validation.ts';
import { reservePublicValidationFunding, settlePublicValidationFunding, sharedSources, suspendPublicValidationFunding, verifyPublicValidationFunding } from '../../src/runtime/public-validation-funding.ts';
import { publicFundingExposure } from '../../src/runtime/public-validation-funding-validation.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { OwnerLock } from '../../src/runtime/recovery/ownership.ts';

test('followups append explicit phases and preserve old receipts and exact retries through later funding', async t => {
  const f = await followupFixture(t, true), before = await f.snapshot();
  const originals = await Promise.all([f.forty, f.fortyFive].map(r => readFile(join(f.root, r.operatorDecision.source.location))));
  const fifty = await f.follow(50_000_000), after = await f.snapshot();
  delete after.publicValidationPhaseFollowups; after.events.pop(); after.revision--; assert.deepEqual(after, before);
  const fiftyFive = await f.follow(55_000_000), current = await fundedIntake(f, 'latest');
  const state = await f.snapshot(); assert.equal(publicValidationPhaseLimit(state), 55_000_000);
  assert.equal(state.publicValidationFundings.at(-1).phaseDecisionId, fiftyFive.operatorDecision.decisionId);
  const retry = async () => {
    const bytes = await readFile(join(f.root, 'snapshot.json'));
    assert.deepEqual(await phases.applyPublicValidationPhaseExtension({ ...f.options, quote: f.forty.quote, decision: f.decision40 }), f.forty);
    assert.deepEqual(await phases.applyPublicValidationPhaseSuccessor({ ...f.options, quote: f.fortyFive.quote, decision: f.decision45 }), f.fortyFive);
    for (const receipt of [fifty, fiftyFive]) {
      const { sourceSha256: _hash, ...decision } = receipt.operatorDecision;
      assert.deepEqual(await f.apply(receipt.quote, decision), receipt);
    }
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), bytes);
  };
  await retry(); await chargeIntake(current, 'latest-charge'); await current.controller.stop('Synthetic close'); await current.controller.close();
  const settlement = await settlePublicValidationFunding({ ...current, fundingId: current.binding.fundingId });
  await retry(); assert.deepEqual(await reservePublicValidationFunding(current), current.binding);
  assert.deepEqual(await settlePublicValidationFunding({ ...current, fundingId: current.binding.fundingId }), settlement);
  await assert.rejects(verifyPublicValidationFunding({ root: current.runRoot, snapshot: await f.child(current.runRoot), dispatch: true }), /closed/);
  assert.deepEqual(await Promise.all([f.forty, f.fortyFive].map(r => readFile(join(f.root, r.operatorDecision.source.location)))), originals);
  assert.deepEqual((await f.snapshot()).publicValidationFundings.slice(0, 3), before.publicValidationFundings);
  const bad = structuredClone(await f.snapshot()); bad.publicValidationFundings.at(-1).phaseDecisionId = fifty.operatorDecision.decisionId;
  assert.throws(() => validateSnapshot(bad));
});

test('followup preparation is read only and has no implicit or over-lifetime target', async t => {
  const f = await followupFixture(t), bytes = await readFile(join(f.root, 'snapshot.json')), files = await readdir(f.root, { recursive: true });
  const acquire = t.mock.method(SnapshotStore, 'acquire', async () => { throw new Error('Unexpected prepare lock'); });
  try {
    for (const target of [undefined, NaN, Infinity, 0, 44_000_000, 45_000_000, 45_000_000.1, 150_000_001, Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(f.prepare(target as number));
    for (const target of [45_000_001, 150_000_000]) {
      const quote = await f.prepare(target); assert.equal(quote.toMicroCny, target); assert.equal(quote.activationAllowed, false);
      assert.equal(quote.basis.snapshotSha256, phaseHash(bytes));
    }
  } finally { acquire.mock.restore(); }
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), bytes); assert.deepEqual(await readdir(f.root, { recursive: true }), files);
});

test('followup rejects stale, forged, missing, conflicting and reused decisions without snapshot writes', async t => {
  const f = await followupFixture(t), quote = await f.prepare(50_000_000), decision = await f.decisionFor(quote);
  const path = join(f.root, 'snapshot.json'), bytes = await readFile(path), sourcePath = join(f.root, decision.source.location), source = await readFile(sourcePath);
  await unlink(sourcePath); await assert.rejects(f.apply(quote, decision)); await writeFile(sourcePath, '{}'); await assert.rejects(f.apply(quote, decision)); await writeFile(sourcePath, source);
  await writeFile(path, Buffer.concat([bytes, Buffer.from(' ')])); await assert.rejects(f.apply(quote, decision), /stale/); await writeFile(path, bytes);
  for (const change of [(q: any) => q.predecessor.decisionId = 'wrong', (q: any) => q.predecessor.sourceSha256 = 'a'.repeat(64),
    (q: any) => q.basis.heldMicroCny = 1, (q: any) => q.basis.ledgerId = 'wrong', (q: any) => q.toMicroCny = 150_000_001,
    (q: any) => q.fromMicroCny = 40_000_000, (q: any) => q.extra = true]) {
    const bad = structuredClone(quote); change(bad); const { quoteId: _id, ...payload } = bad; bad.quoteId = `pvpfq1-${phaseHash(JSON.stringify(payload))}`;
    await assert.rejects(f.apply(bad, await f.decisionFor(bad, 'bad-quote')));
  }
  for (const change of [(d: any) => d.kind = 'operator_public_validation_phase_successor', (d: any) => d.sourceRefs = [],
    (d: any) => d.actorId = '', (d: any) => d.decidedAt = new Date(Date.now() + 60_000).toISOString(), (d: any) => d.decidedAt = '2020-01-01T00:00:00.000Z']) {
    const bad = await f.decisionFor(quote, 'bad-decision'); change(bad); const { source: _source, ...fields } = bad;
    await writeFile(join(f.root, bad.source.location), JSON.stringify({ formatVersion: 'operator-public-validation-phase-followup-decision/1', ...fields, quote }));
    await assert.rejects(f.apply(quote, bad));
  }
  await assert.rejects(f.apply(quote, await f.decisionFor(quote, f.fortyFive.operatorDecision.decisionId)));
  assert.deepEqual(await readFile(path), bytes);
  const receipt = await f.apply(quote, decision); await f.follow(55_000_000);
  const stable = await readFile(path); await assert.rejects(f.apply(quote, await f.decisionFor(quote, 'conflict')));
  assert.deepEqual(await readFile(path), stable); assert.equal(receipt.quote.toMicroCny, 50_000_000);
});

test('followup keeps verified suspended unknown exposure and source identity unchanged', async t => {
  const f = await followupFixture(t), child = await signedOrdinaryIncompleteFunding(t, 'external-charge', f);
  await assert.rejects(f.prepare(50_000_000));
  const target = { sharedRoot: child.sharedRoot, runRoot: child.runRoot, fundingId: child.binding.fundingId };
  await suspendPublicValidationFunding(target);
  const original = await readFile(join(child.runRoot, 'snapshot.json')), before = await f.snapshot(), h = publicFundingExposure(before).heldMicroCny;
  assert.ok(h > 0); const quote = await f.prepare(50_000_000); assert.equal(quote.basis.heldMicroCny, h);
  const receipt = await f.apply(quote, await f.decisionFor(quote));
  const after = await f.snapshot(); assert.deepEqual(after.publicValidationFundings, before.publicValidationFundings); assert.deepEqual(after.ledger, before.ledger);
  assert.deepEqual(await readFile(join(child.runRoot, 'snapshot.json')), original);
  assert.equal(publicFundingExposure(after).heldMicroCny, h);
  await assert.rejects(verifyPublicValidationFunding({ root: child.runRoot, snapshot: await child.snapshot(), dispatch: true }), /suspend/);
  const latest = await f.authorization('after-suspension'); requirePhaseFundingAuthorization(after, latest.payload);
  latest.payload.sourceRefs = [f.fortyFive.operatorDecision.source]; assert.throws(() => requirePhaseFundingAuthorization(after, latest.payload));
  const source = join(f.root, receipt.operatorDecision.source.location), sourceBytes = await readFile(source);
  await writeFile(source, Buffer.concat([sourceBytes, Buffer.from(' ')])); await assert.rejects(sharedSources(f.root, after)); await writeFile(source, sourceBytes);
  const suspension = before.publicValidationFundings[0].suspension, suspensionPath = join(f.root, suspension.source.location), suspensionBytes = await readFile(suspensionPath);
  await writeFile(suspensionPath, Buffer.concat([suspensionBytes, Buffer.from(' ')])); await assert.rejects(f.prepare(55_000_000)); await writeFile(suspensionPath, suspensionBytes);
  assert.deepEqual(await readFile(join(child.runRoot, 'snapshot.json')), original);
});

test('followup chain and current idle authority reject missing, altered or reordered history', async t => {
  const f = await followupFixture(t), quote = await f.prepare(50_000_000), decision = await f.decisionFor(quote);
  const owner = await SnapshotStore.acquire(f.root);
  try { await assert.rejects(f.prepare(50_000_000)); await assert.rejects(f.apply(quote, decision)); } finally { await owner.close(); }
  await mkdir(join(f.root, 'registry'), { recursive: true });
  const registry = await OwnerLock.acquire(join(f.root, 'registry'), '.commit.lock');
  try { await assert.rejects(f.prepare(50_000_000)); await assert.rejects(f.apply(quote, decision)); } finally { await registry.close(); }
  await f.apply(quote, decision); await f.follow(55_000_000);
  const original = await f.snapshot(), path = join(f.root, 'snapshot.json'), bytes = await readFile(path);
  for (const change of [(s: any) => delete s.publicValidationPhaseFollowups, (s: any) => s.publicValidationPhaseFollowups = [],
    (s: any) => s.publicValidationPhaseFollowups.reverse(), (s: any) => s.publicValidationPhaseFollowups.pop(),
    (s: any) => s.publicValidationPhaseFollowups[0].operatorDecision.decisionId = 'different',
    (s: any) => s.publicValidationPhaseFollowups[0].quote.predecessor.receiptSha256 = 'a'.repeat(64),
    (s: any) => s.events.at(-1).reason = '{}', (s: any) => s.events.pop(),
    (s: any) => s.publicValidationPhaseSuccessor.quote.toMicroCny = 46_000_000]) {
    const bad = structuredClone(original); change(bad); assert.throws(() => validateSnapshot(bad));
  }
  const oldSource = join(f.root, f.forty.operatorDecision.source.location), source = await readFile(oldSource);
  await writeFile(oldSource, Buffer.concat([source, Buffer.from(' ')])); await assert.rejects(f.apply(quote, decision)); await writeFile(oldSource, source);
  assert.deepEqual(await readFile(path), bytes);
});
