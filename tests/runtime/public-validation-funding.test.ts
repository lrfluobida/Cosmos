import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { chargeIntake, fundedIntake, fundingFixture } from './public-validation-funding.fixture.ts';
import { reservePublicValidationFunding, settlePublicValidationFunding } from '../../src/runtime/public-validation-funding.ts';
import { fundingHash } from '../../src/runtime/public-validation-funding-validation.ts';
import { prepareValidationCase } from '../../src/runtime/validation-window.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { createRoleBudget } from '../../src/roles/provider-budget.ts';
import { supplementFixture } from './validation-group-supplement.fixture.ts';
import { RunController } from '../../src/runtime/run.ts';

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
  await reservePublicValidationFunding({ sharedRoot: f.root, runRoot, authorization: { artifactId: 'fund-five', version: 'v1', location: 'fund-five.json' } });
  const after = await f.snapshot(); assert.equal(after.ledger.contractVersion, '5.0.0');
  assert.deepEqual(after.allocationSupplementDecisions, before.allocationSupplementDecisions);
  assert.deepEqual(after.allocationClosureDecisions, before.allocationClosureDecisions);
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
