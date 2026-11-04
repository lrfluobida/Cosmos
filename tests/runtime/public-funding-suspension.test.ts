import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fundingFixture, signedOrdinaryIncompleteFunding } from './public-validation-funding.fixture.ts';
import * as funding from '../../src/runtime/public-validation-funding.ts';
import { publicFundingExposure } from '../../src/runtime/public-validation-funding-validation.ts';
import { budgetSummary } from '../../src/contracts/budget.ts';
import { RunController } from '../../src/runtime/run.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import { OwnerLock } from '../../src/runtime/recovery/ownership.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';

const target = (f: Awaited<ReturnType<typeof signedOrdinaryIncompleteFunding>>) => ({ sharedRoot: f.sharedRoot, runRoot: f.runRoot, fundingId: f.binding.fundingId });
const suspend = (value: ReturnType<typeof target>) => (funding as any).suspendPublicValidationFunding(value);

test('signed unknown suspension reduces only phase exposure and permanently rejects ordinary ownership', async t => {
  const f = await signedOrdinaryIncompleteFunding(t, 'external-charge'), state = await f.snapshot(), before = await f.f.snapshot();
  const original = await readFile(join(f.runRoot, 'snapshot.json')), cleanup = await readFile(f.receiptPath);
  const held = budgetSummary(state.ledger).committedMicroCny;
  const preview = await (funding as any).previewPublicValidationFundingSuspension(target(f));
  assert.equal(preview.heldMicroCny, held); assert.deepEqual(await f.f.snapshot(), before);
  const result = await suspend(target(f)), after = await f.f.snapshot();
  assert.equal(result.heldMicroCny, held); assert.equal(publicFundingExposure(after).heldMicroCny, held);
  assert.deepEqual(after.ledger, before.ledger); assert.deepEqual(after.run, before.run);
  assert.deepEqual(await readFile(join(f.runRoot, 'snapshot.json')), original); assert.deepEqual(await readFile(f.receiptPath), cleanup);
  assert.equal(after.events.filter((e: any) => e.type === 'public_funding_suspended').length, 1);
  assert.deepEqual(await suspend(target(f)), result); assert.deepEqual(await f.f.snapshot(), after);
  await assert.rejects(RunController.open({ root: f.runRoot }), /suspend/i);
  await assert.rejects(funding.acquirePublicFundingGate(f.runRoot, state, true), /suspend/i);
  await assert.rejects(funding.settlePublicValidationFunding(target(f)), /unknown|reserved/i);
  assert.deepEqual(await readFile(join(f.runRoot, 'snapshot.json')), original);
});

test('an existing child owner prevents suspension and cannot survive its commit', async t => {
  const f = await signedOrdinaryIncompleteFunding(t, 'external-charge'), before = await f.f.snapshot();
  const owner = await RunController.open({ root: f.runRoot });
  try { await assert.rejects(suspend(target(f)), /owner|lock/i); assert.deepEqual(await f.f.snapshot(), before); }
  finally { await owner.close(); }
  await suspend(target(f));
  await assert.rejects(RunController.open({ root: f.runRoot }), /suspend/i);
  const unknown = (await f.snapshot()).ledger.entries.find((r: any) => r.unknown);
  await assert.rejects(owner.settle(unknown.requestId, 0, unknown.evidence));
  await assert.rejects(RunController.stopIdleWindow({ root: f.runRoot, windowId: 'unsupported' }));
});

test('suspended child source drift blocks other funding and original accounting', async t => {
  const f = await signedOrdinaryIncompleteFunding(t, 'external-charge'); await suspend(target(f));
  const state = await f.snapshot(), before = await f.f.snapshot(), unknown = state.ledger.entries.find((r: any) => r.unknown);
  unknown.reservedMicroCny += 1; state.run.fees.reservedMicroCny += 1;
  await writeFile(join(f.runRoot, 'snapshot.json'), JSON.stringify(state, null, 2) + '\n', 'utf8');
  await assert.rejects(funding.sharedSources(f.sharedRoot, before));
  await assert.rejects(funding.reservePublicValidationFunding(await f.f.authorization('after-drift')));
  await assert.rejects(funding.settlePublicValidationFunding(target(f)));
  assert.deepEqual(await f.f.snapshot(), before);
});

test('suspension rejects unsupported original request metadata and altered signed cleanup without writes', async t => {
  const f = await signedOrdinaryIncompleteFunding(t, 'external-charge'), state = await f.snapshot(), shared = await f.f.snapshot();
  const unknown = state.ledger.entries.find((r: any) => r.unknown), path = unknown.evidence.find((r: any) => r.artifactId === 'billing-' + unknown.requestId).location;
  const bytes = await readFile(path), bill = JSON.parse(bytes.toString('utf8'));
  for (const modify of [
    (r: any) => { delete r.request; }, (r: any) => { r.request.maxOutputTokens += 1; },
    (r: any) => { r.request.inputBytes = 0; }, (r: any) => { r.request.hasImages = true; },
    (r: any) => { r.request.modelId = 'other'; }, (r: any) => { r.pricingVersion = 'other'; },
    (r: any) => { r.admittedAt = new Date(Date.parse(r.admittedAt) + 1).toISOString(); },
    (r: any) => { r.usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }; },
  ]) {
    const changed = structuredClone(bill); modify(changed); await writeFile(path, JSON.stringify(changed), 'utf8');
    await assert.rejects(suspend(target(f))); assert.deepEqual(await f.f.snapshot(), shared);
  }
  await writeFile(path, bytes);
  const signature = await readFile(f.receiptPath + '.sha256.json');
  await unlink(f.receiptPath + '.sha256.json'); await assert.rejects(suspend(target(f)));
  await writeFile(f.receiptPath + '.sha256.json', signature);
  const registry = await OwnerLock.acquire(join(f.runRoot, 'registry'), '.commit.lock');
  try { await assert.rejects(suspend(target(f)), /lock|owner/i); } finally { await registry.close(); }
  assert.deepEqual(await f.f.snapshot(), shared); assert.deepEqual(await f.snapshot(), state);
  await suspend(target(f));
});

test('suspension retries an interrupted shared commit without duplicate release and validates its immutable event', async t => {
  const f = await signedOrdinaryIncompleteFunding(t, 'external-charge'), before = await f.f.snapshot();
  const write = SnapshotStore.prototype.write;
  const fault = t.mock.method(SnapshotStore.prototype, 'write', async function(this: SnapshotStore, state: any) {
    if (this.root === f.sharedRoot && state.events.at(-1)?.type === 'public_funding_suspended') throw new Error('Injected suspension commit failure');
    return write.call(this, state);
  });
  await assert.rejects(suspend(target(f)), /Injected/); fault.mock.restore();
  assert.deepEqual(await f.f.snapshot(), before);
  const archive = join(f.sharedRoot, `public-funding/${f.binding.fundingId}/suspension.json`), bytes = await readFile(archive);
  const result = await suspend(target(f)), after = await f.f.snapshot();
  assert.deepEqual(await readFile(archive), bytes); assert.equal(after.revision, before.revision + 1);
  for (const modify of [
    (s: any) => { s.publicValidationFundings[0].suspension.heldMicroCny = 0; },
    (s: any) => { s.publicValidationFundings[0].suspension.heldMicroCny = s.publicValidationFundings[0].binding.limits.limitMicroCny; },
    (s: any) => { delete s.publicValidationFundings[0].suspension; },
    (s: any) => { s.events.pop(); },
  ]) { const bad = structuredClone(after); modify(bad); assert.throws(() => validateSnapshot(bad)); }
  await writeFile(archive, bytes.toString('utf8') + ' ', 'utf8');
  await assert.rejects(suspend(target(f))); await assert.rejects(funding.sharedSources(f.sharedRoot, after));
  await writeFile(archive, bytes); assert.deepEqual(await suspend(target(f)), result);
});

test('only an unresolved ended generation is eligible and original ordinary ownership remains usable', async t => {
  const f = await signedOrdinaryIncompleteFunding(t), before = await f.f.snapshot();
  await assert.rejects(suspend(target(f)));
  const owner = await RunController.open({ root: f.runRoot }); await owner.close();
  assert.deepEqual(await f.f.snapshot(), before);
  const closed = await funding.settlePublicValidationFunding(target(f)); assert.equal(closed.outcome, 'closed');
  await assert.rejects(suspend(target(f)), /settlement|claim/i);
});

test('another funding can use only the released phase capacity while the original request remains unknown', async t => {
  const shared = await fundingFixture(t, 25_000_000), f = await signedOrdinaryIncompleteFunding(t, 'external-charge', shared);
  const original = await f.snapshot(), before = await shared.snapshot();
  const held = budgetSummary(original.ledger).committedMicroCny;
  const remaining = 30_000_000 - budgetSummary(before.ledger).committedMicroCny - held;
  const next = await shared.authorization('bounded-next', remaining);
  await assert.rejects(funding.reservePublicValidationFunding(next), /phase|capacity/i);
  await suspend(target(f)); await funding.reservePublicValidationFunding(next);
  const after = await shared.snapshot();
  assert.equal(budgetSummary(after.ledger).committedMicroCny + publicFundingExposure(after).heldMicroCny, 30_000_000);
  assert.deepEqual(await f.snapshot(), original);
  await assert.rejects(funding.reservePublicValidationFunding(await shared.authorization('one-too-many', 1)), /phase|capacity/i);
});
