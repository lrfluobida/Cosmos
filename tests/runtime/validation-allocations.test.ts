import assert from 'node:assert/strict';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { budgetCapacity, budgetSummary } from '../../src/contracts/index.ts';
import { reserveEntry } from '../../src/budget/ledger.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { RunController } from '../../src/runtime/run.ts';
import { prepareValidationCase } from '../../src/runtime/validation-window.ts';
import { allocationFixture, closureDecision } from './validation-allocations.fixture.ts';
import * as api from '../../src/runtime/validation-allocations.ts';

function requireApi() {
  assert.equal(typeof api.prepareValidationAllocationClosure, 'function', 'Read-only allocation closure quote API is required');
  assert.equal(typeof api.applyValidationAllocationClosure, 'function', 'Atomic allocation closure API is required');
  return api;
}

test('read-only quote and atomic closure preserve three stopped case histories and actual fees', async t => {
  const { prepareValidationAllocationClosure, applyValidationAllocationClosure } = requireApi(), f = await allocationFixture(t);
  f.advance(7 * 24 * 60 * 60 * 1000); // Expired paid clocks never limit this free closure operation.
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
  for (const key of ['run', 'tasks', 'requests', 'stopReason', 'validation'] as const) assert.deepEqual(next[key], f.original[key]);
  assert.deepEqual(next.ledger.allocations, f.original.ledger.allocations); assert.deepEqual(next.ledger.entries, f.original.ledger.entries);
  assert.deepEqual(next.events.slice(0, f.original.events.length), f.original.events);
  assert.equal(next.revision, f.original.revision + 1); assert.equal(next.events.length, f.original.events.length + 1);
  assert.ok(next.allocationClosureDecisions); assert.ok(next.ledger.allocationClosures);
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

test('fresh bounded case fits released capacity in the same ledger and keeps stopped grant IDs closed', async t => {
  const { prepareValidationAllocationClosure, applyValidationAllocationClosure } = requireApi(), f = await allocationFixture(t), declaration = f.declaration('cos20-next-fixture');
  await assert.rejects(prepareValidationCase({ ...f, declaration }), /unallocated|insufficient/i);
  const closureQuote = await prepareValidationAllocationClosure({ ...f, caseIds: f.caseIds }), closureOperator = await closureDecision(f, closureQuote);
  await applyValidationAllocationClosure({ ...f, quote: closureQuote, decision: closureOperator });
  const closed = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(typeof RunController.prepareValidationAllocationClosure, 'function'); assert.equal(typeof RunController.applyValidationAllocationClosure, 'function');
  const quote = await prepareValidationCase({ ...f, declaration });
  assert.equal(quote.basis.allocatedMicroCny, 85_522_666); assert.equal(quote.basis.committedMicroCny, 2_043_028);
  const decision = { kind: 'operator_validation' as const, decisionId: 'next-offline-case', actorId: 'offline-coordinator', decidedAt: new Date(f.now()).toISOString(),
    source: { artifactId: 'next-offline-case', version: 'v1', location: 'next-operator.json' }, sourceRefs: closureOperator.sourceRefs };
  await writeFile(join(f.root, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId: decision.decisionId,
    actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }), 'utf8');
  const window = await RunController.claimValidationCase({ ...f, quote, decision });
  await mkdir(join(f.repositoryRoot, '.cosmos/e2e', window.caseId, 'registry'), { recursive: true });
  const claimed = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.deepEqual(budgetCapacity(claimed.ledger), { effectiveLimitMicroCny: 150_000_000, allocatedMicroCny: 106_522_666 });
  assert.equal(claimed.ledger.ledgerId, f.original.ledger.ledgerId); assert.equal(claimed.run.runId, f.original.run.runId);
  assert.deepEqual(claimed.validation.cases.slice(0, 3), f.original.validation.cases); assert.deepEqual(claimed.allocationClosureDecisions, closed.allocationClosureDecisions);
  assert.deepEqual(claimed.ledger.entries, f.original.ledger.entries); assert.deepEqual(claimed.run.fees, f.original.run.fees);
  assert.deepEqual(claimed.run.humanDecisions, f.original.run.humanDecisions); assert.equal(claimed.run.originalDeadlineAt, f.original.run.originalDeadlineAt);
  assert.deepEqual(window.quote.declaration.limits, declaration.limits); assert.equal(window.quote.declaration.limits.maxRequests, 80);
  await assert.rejects(RunController.open(f), /validation|profile/i);
  const owner = await RunController.openValidationCase({ ...f, caseId: window.caseId, windowId: window.windowId });
  try {
    const request = { requestId: 'fresh-planning', taskId: declaration.grants.planning.taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: 8,
      validation: { caseId: window.caseId, windowId: window.windowId, purpose: 'planning' as const, modelId: 'deepseek-flash' as const, maxOutputTokens: 1, inputBytes: 0, hasImages: false } };
    await assert.rejects(owner.reserve({ ...request, taskId: f.original.validation.cases[0].quote.declaration.grants.planning.taskId }), /grant|purpose|closed/i);
    assert.equal((await owner.read()).ledger.entries.length, f.original.ledger.entries.length);
    await owner.reserve(request); await owner.admit(request.requestId); await owner.settle(request.requestId, 1, [{ artifactId: 'offline-next-billing', version: 'v1', location: 'offline-next-billing.json' }]);
    assert.equal((await owner.read()).run.fees.settledMicroCny, 2_043_029);
    assert.equal((await owner.validationAuthority(declaration.grants.planning.taskId, 'planning')).requestsRemaining, 79);
    await owner.stop('Stopped next fixture');
  } finally { await owner.close(); }
  const after = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')); validateSnapshot(after);
  assert.deepEqual(after.ledger.entries.slice(0, f.original.ledger.entries.length), f.original.ledger.entries);
  const secondQuote = await prepareValidationAllocationClosure({ ...f, caseIds: [window.caseId] }), secondDecision = await closureDecision(f, secondQuote);
  secondDecision.decisionId = 'closure-2'; secondDecision.source = { ...secondDecision.source, artifactId: 'closure-2', location: 'closure-2.json' };
  await writeFile(join(f.root, secondDecision.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1', kind: secondDecision.kind,
    decisionId: secondDecision.decisionId, actorId: secondDecision.actorId, decidedAt: secondDecision.decidedAt, sourceRefs: secondDecision.sourceRefs, quote: secondQuote }), 'utf8');
  await applyValidationAllocationClosure({ ...f, quote: secondQuote, decision: secondDecision });
  const twice = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')); validateSnapshot(twice);
  assert.ok(twice.allocationClosureDecisions);
  assert.equal(twice.allocationClosureDecisions.length, 2); assert.equal(budgetCapacity(twice.ledger).allocatedMicroCny, 85_522_667);
});
