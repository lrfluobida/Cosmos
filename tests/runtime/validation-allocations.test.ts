import assert from 'node:assert/strict';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { budgetCapacity, budgetSummary } from '../../src/contracts/index.ts';
import { reserveEntry } from '../../src/budget/ledger.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { allocationFixture, closureDecision } from './validation-allocations.fixture.ts';

const api: any = await import('../../src/runtime/validation-allocations.ts').catch(() => ({}));
function requireApi() {
  assert.equal(typeof api.prepareValidationAllocationClosure, 'function', 'Read-only allocation closure quote API is required');
  assert.equal(typeof api.applyValidationAllocationClosure, 'function', 'Atomic allocation closure API is required');
  return api;
}

test('read-only quote and atomic closure preserve three stopped case histories and actual fees', async t => {
  const { prepareValidationAllocationClosure, applyValidationAllocationClosure } = requireApi(), f = await allocationFixture(t);
  assert.deepEqual(budgetCapacity(f.original.ledger), { effectiveLimitMicroCny: 150_000_000, allocatedMicroCny: 147_596_040 });
  const quote = await prepareValidationAllocationClosure({ ...f, caseIds: f.caseIds });
  assert.equal(quote.releasedMicroCny, 62_073_374); assert.equal(quote.closures.length, 15);
  assert.equal(quote.identity.reviewedPlatformSha, 'b'.repeat(40));
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), f.originalBytes);
  await assert.rejects(readFile(join(f.root, '.controller.lock')), { code: 'ENOENT' });
  const decision = await closureDecision(f, quote), receipt = await applyValidationAllocationClosure({ ...f, quote, decision });
  const bytes = await readFile(join(f.root, 'snapshot.json')), next = JSON.parse(bytes.toString('utf8')); validateSnapshot(next);
  assert.equal(next.ledger.contractVersion, '3.0.0'); assert.equal(next.formatVersion, 3);
  assert.deepEqual(budgetCapacity(next.ledger), { effectiveLimitMicroCny: 150_000_000, allocatedMicroCny: 85_522_666 });
  assert.equal(budgetSummary(next.ledger).committedMicroCny, 2_043_028);
  for (const key of ['run', 'tasks', 'requests', 'stopReason', 'validation']) assert.deepEqual(next[key], f.original[key]);
  assert.deepEqual(next.ledger.allocations, f.original.ledger.allocations); assert.deepEqual(next.ledger.entries, f.original.ledger.entries);
  assert.deepEqual(next.events.slice(0, f.original.events.length), f.original.events);
  assert.equal(next.revision, f.original.revision + 1); assert.equal(next.events.length, f.original.events.length + 1);
  assert.equal(next.allocationClosureDecisions.length, 1); assert.deepEqual(next.allocationClosureDecisions[0], receipt);
  for (const closure of next.ledger.allocationClosures) assert.throws(() => reserveEntry(next.ledger, { requestId: `deny-${closure.taskId}`, taskId: closure.taskId,
    provider: 'fixture', pricingVersion: 'v1', estimatedMaxCostMicroCny: 1 }), /closed/i);
  assert.deepEqual(await applyValidationAllocationClosure({ ...f, quote, decision }), receipt);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), bytes);
});

test('quote refuses active cases, unresolved exposure, unknown or repeated cases and legacy ownership guesses', async t => {
  const { prepareValidationAllocationClosure } = requireApi();
  for (const cause of ['active', 'reserved', 'unknown', 'duplicate', 'legacy', 'missing-root'] as const) await t.test(cause, async sub => {
    const f = await allocationFixture(sub), state = structuredClone(f.original); let caseIds = f.caseIds;
    if (cause === 'active') state.validation.cases[2].stopReason = null;
    if (cause === 'reserved' || cause === 'unknown') {
      const entry = state.ledger.entries[1]; entry.reservedMicroCny = 1; entry.status = cause; entry.unknown = cause === 'unknown';
      state.run.fees.reservedMicroCny = 1; if (entry.unknown) state.run.fees.unknownRequestIds.push(entry.requestId);
    }
    if (cause === 'duplicate') caseIds = [f.caseIds[0], f.caseIds[0]];
    if (cause === 'legacy') caseIds = ['legacy'];
    if (cause === 'missing-root') await rm(join(f.repositoryRoot, '.cosmos/e2e', f.caseIds[0]), { recursive: true });
    await writeFile(join(f.root, 'snapshot.json'), JSON.stringify(state), 'utf8'); const before = await readFile(join(f.root, 'snapshot.json'));
    await assert.rejects(prepareValidationAllocationClosure({ ...f, caseIds }), /active|stop|reserv|unknown|reconcil|duplicate|case|root|ENOENT/i);
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  });
});

test('quote and apply refuse ledger and fixed case controller or registry owners, including unresolved spawn intent', async t => {
  const { prepareValidationAllocationClosure, applyValidationAllocationClosure } = requireApi();
  for (const location of ['ledger-owner', 'case-owner', 'case-registry', 'ledger-registry', 'spawn-intent'] as const) await t.test(location, async sub => {
    const f = await allocationFixture(sub), quote = await prepareValidationAllocationClosure({ ...f, caseIds: f.caseIds }), decision = await closureDecision(f, quote);
    let owner: SnapshotStore | undefined;
    if (location === 'ledger-owner' || location === 'spawn-intent') { owner = await SnapshotStore.acquire(f.root); if (location === 'spawn-intent') { await owner.prepareOwnedChild(); await assert.rejects(owner.close(), /spawn|intent/i); } }
    else {
      const path = location === 'case-owner' ? join(f.repositoryRoot, '.cosmos/e2e', f.caseIds[0], '.controller.lock')
        : location === 'case-registry' ? join(f.repositoryRoot, '.cosmos/e2e', f.caseIds[0], 'registry/.commit.lock') : join(f.root, 'registry/.commit.lock');
      if (location === 'ledger-registry') await mkdir(join(f.root, 'registry'));
      await writeFile(path, 'unresolved fixture owner', 'utf8');
    }
    await assert.rejects(prepareValidationAllocationClosure({ ...f, caseIds: f.caseIds }), /owner|lock|writer|intent/i);
    await assert.rejects(applyValidationAllocationClosure({ ...f, quote, decision }), /owner|lock|writer|intent/i);
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), f.originalBytes);
    if (owner && location !== 'spawn-intent') await owner.close();
  });
});

test('apply rejects stale bytes, changed identity or frozen files, modified old/new operator source and overrelease', async t => {
  const { prepareValidationAllocationClosure, applyValidationAllocationClosure } = requireApi();
  for (const cause of ['stale', 'identity', 'input', 'old-receipt', 'receipt', 'wrong-kind', 'overrelease', 'wrong-task', 'wrong-root'] as const) await t.test(cause, async sub => {
    const f = await allocationFixture(sub), quote = await prepareValidationAllocationClosure({ ...f, caseIds: f.caseIds }), decision = await closureDecision(f, quote);
    if (cause === 'stale') await writeFile(join(f.root, 'snapshot.json'), Buffer.concat([f.originalBytes, Buffer.from('\n')]));
    if (cause === 'identity') f.changeIdentity();
    if (cause === 'input') await writeFile(join(f.repositoryRoot, 'requirements.json'), '{}', 'utf8');
    if (cause === 'old-receipt') await writeFile(join(f.root, 'operator-0.json'), '{}', 'utf8');
    if (cause === 'receipt') await writeFile(join(f.root, decision.source.location), (await readFile(join(f.root, decision.source.location), 'utf8')) + '\n', 'utf8');
    if (cause === 'wrong-kind') (decision as any).kind = 'operator_validation';
    if (cause === 'overrelease') quote.closures[0].releasedMicroCny++;
    if (cause === 'wrong-task') quote.closures[0].taskId = 'legacy';
    if (cause === 'wrong-root') quote.cases[0].artifactRoot = f.root;
    const before = await readFile(join(f.root, 'snapshot.json'));
    if (cause === 'receipt') {
      // Initial application binds the current exact receipt bytes; later byte changes must fail idempotence.
      await applyValidationAllocationClosure({ ...f, quote, decision }); const applied = await readFile(join(f.root, 'snapshot.json'));
      await writeFile(join(f.root, decision.source.location), await readFile(join(f.root, decision.source.location), 'utf8').then(text => text + '\n'), 'utf8');
      await assert.rejects(applyValidationAllocationClosure({ ...f, quote, decision }), /source|conflict|receipt/i);
      assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), applied);
    } else {
      await assert.rejects(applyValidationAllocationClosure({ ...f, quote, decision }), /stale|changed|identity|source|quote|kind|operator|closed|root/i);
      assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
    }
  });
});

test('fixed case junctions cannot substitute an apparently idle registry', async t => {
  const { prepareValidationAllocationClosure, applyValidationAllocationClosure } = requireApi(), f = await allocationFixture(t);
  const quote = await prepareValidationAllocationClosure({ ...f, caseIds: f.caseIds }), decision = await closureDecision(f, quote), target = join(f.repositoryRoot, '.cosmos/e2e', f.caseIds[0]);
  await rm(target, { recursive: true }); await symlink(f.root, target, 'junction');
  await assert.rejects(prepareValidationAllocationClosure({ ...f, caseIds: f.caseIds }), /junction|symbolic/i);
  await assert.rejects(applyValidationAllocationClosure({ ...f, quote, decision }), /junction|symbolic/i);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), f.originalBytes);
});

test('retry rechecks historical operator sources and a receipt changed during identity checking cannot commit', async t => {
  const { prepareValidationAllocationClosure, applyValidationAllocationClosure } = requireApi();
  for (const cause of ['retry-old-source', 'source-during-identity'] as const) await t.test(cause, async sub => {
    const f = await allocationFixture(sub), quote = await prepareValidationAllocationClosure({ ...f, caseIds: f.caseIds }), decision = await closureDecision(f, quote);
    if (cause === 'retry-old-source') {
      await applyValidationAllocationClosure({ ...f, quote, decision }); await writeFile(join(f.root, 'operator-0.json'), '{}', 'utf8');
      const before = await readFile(join(f.root, 'snapshot.json'));
      await assert.rejects(applyValidationAllocationClosure({ ...f, quote, decision }), /source|operator/i);
      assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
    } else {
      const identityReader = async (signal: AbortSignal) => { await writeFile(join(f.root, decision.source.location), '{}', 'utf8'); return f.identityReader(signal); };
      await assert.rejects(applyValidationAllocationClosure({ ...f, quote, decision, identityReader }), /source|operator/i);
      assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), f.originalBytes);
    }
  });
});

test('committed closure snapshots reject detached decisions, rewritten grant amounts and old grant requests', async t => {
  const { prepareValidationAllocationClosure, applyValidationAllocationClosure } = requireApi(), f = await allocationFixture(t);
  const quote = await prepareValidationAllocationClosure({ ...f, caseIds: f.caseIds }), decision = await closureDecision(f, quote);
  await applyValidationAllocationClosure({ ...f, quote, decision }); const next = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  for (const change of [
    (state: any) => { delete state.allocationClosureDecisions; },
    (state: any) => { state.formatVersion = 1; },
    (state: any) => { state.allocationClosureDecisions[0].operatorDecision.kind = 'operator_validation'; },
    (state: any) => { state.ledger.allocations[0].amountMicroCny--; },
    (state: any) => {
      const request = structuredClone(state.requests[1]), entry = structuredClone(state.ledger.entries[1]);
      request.requestId = 'closed-cancelled-after'; entry.requestId = request.requestId; entry.status = 'cancelled'; entry.settledMicroCny = 0;
      state.requests.push(request); state.ledger.entries.push(entry);
    },
  ]) { const bad = structuredClone(next); change(bad); assert.throws(() => validateSnapshot(bad), /closure|validation|original|grant|history/i); }
});
