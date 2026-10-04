import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { budgetCapacity } from '../../src/contracts/index.ts';
import { prepareValidationCase } from '../../src/runtime/validation-window.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { RunController } from '../../src/runtime/run.ts';
import { createRoleBudget } from '../../src/roles/provider-budget.ts';
import { groupFixture, hash } from './validation-group.fixture.ts';

test('authenticated COS16 delegation holds the original shared bucket and preserves old history', async t => {
  const f = await groupFixture(t), value = await f.claim(await f.declaration('cos20-group-first'));
  const after = await value.controller.read();
  assert.equal(after.ledger.contractVersion, '4.0.0'); assert.equal(after.formatVersion, 3);
  assert.deepEqual(budgetCapacity(after.ledger), budgetCapacity(f.before.ledger));
  assert.deepEqual(after.ledger.allocations.slice(0, f.before.ledger.allocations.length), f.before.ledger.allocations);
  assert.deepEqual(after.ledger.entries, f.before.ledger.entries); assert.deepEqual(after.requests, f.before.requests);
  assert.deepEqual(after.validation!.cases.slice(0, f.before.validation.cases.length), f.before.validation.cases);
  assert.deepEqual(after.allocationClosureDecisions, f.before.allocationClosureDecisions);
  assert.equal(value.quote.formatVersion, 'validation-case-quote-2');
  assert.equal(Object.values(value.declaration.grants).reduce((sum: number, grant: any) => sum + grant.amountMicroCny, 0), 10_000_000);
  assert.equal(after.run.originalDeadlineAt, f.before.run.originalDeadlineAt); assert.deepEqual(after.run.humanDecisions, []);
  await assert.rejects(value.controller.reserve({ ...f.request(value, 'planning', 'parent-bypass', 8), taskId: 'COS-16' }), /parent|grant|purpose|group/i);
});

test('child closure restores only group capacity and next case cannot receive the original ten yuan again', async t => {
  const f = await groupFixture(t), first = await f.claim(await f.declaration('cos20-group-first'));
  await f.charge(first, 'art', 2_000_000); await f.charge(first, 'coding', 2_000_000);
  const quote = await f.close(first), after = await f.snapshot();
  assert.equal(quote.formatVersion, 'validation-allocation-closure-quote-2'); assert.equal(quote.releasedMicroCny, 6_000_000);
  assert.equal(quote.allocatedAfterMicroCny, budgetCapacity(f.before.ledger).allocatedMicroCny);
  assert.deepEqual(budgetCapacity(after.ledger), budgetCapacity(f.before.ledger));
  const bad = await f.declaration('cos20-group-second'); f.setCurrent(bad); const bytes = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(prepareValidationCase({ ...f, declaration: bad }), /group|capacity|allocation/i);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), bytes);
  const second = await f.claim(await f.declaration('cos20-group-second', true, 0.6));
  assert.equal(second.quote.budgetGroup!.availableAllocationMicroCny, 6_000_000);
});

test('concurrent role reservations retain group membership and the stricter five yuan case ceiling', async t => {
  const f = await groupFixture(t), value = await f.claim(await f.declaration('cos20-group-concurrent'));
  await f.register(value, 'art'); await f.register(value, 'coding');
  const results = await Promise.allSettled([value.controller.reserve(f.request(value, 'art', 'a', 2_600_000)), value.controller.reserve(f.request(value, 'coding', 'b', 2_600_000))]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  const authority = await value.controller.validationAuthority(value.declaration.grants.art.taskId, 'author');
  assert.equal(authority.budgetGroup!.committedMicroCny, 2_600_000); assert.equal(authority.budgetGroup!.limitMicroCny, 10_000_000);
  assert.ok(authority.remainingMicroCny <= 2_400_000);
});

test('parent and operator source drift refuse admission and snapshot delegation membership cannot be rewritten', async t => {
  const f = await groupFixture(t), value = await f.claim(await f.declaration('cos20-group-binding'));
  await value.controller.reserve(f.request(value, 'planning', 'pending', 8));
  const source = join(f.root, value.decision.source.location), bytes = await readFile(source); await writeFile(source, Buffer.concat([bytes, Buffer.from('\n')]));
  await assert.rejects(value.controller.admit('pending'), /source|operator|group/i); await writeFile(source, bytes);
  await value.controller.admit('pending'); await value.controller.settle('pending', 8, f.evidence);
  const good = await value.controller.read();
  for (const alter of [(s: any) => { s.ledger.allocations[0].amountMicroCny--; }, (s: any) => { s.ledger.allocationDelegations[0].taskIds.pop(); },
    (s: any) => { s.ledger.allocationDelegations[0].authorizationDecisionId = 'invented'; }, (s: any) => { s.ledger.allocationDelegations.push({ ...s.ledger.allocationDelegations[0] }); }]) {
    const bad = structuredClone(good); alter(bad); assert.throws(() => validateSnapshot(bad));
  }
});

test('unknown preserves group exposure and blocks host children while settlement overcharge remains truthful', async t => {
  const f = await groupFixture(t), value = await f.claim(await f.declaration('cos20-group-unknown'));
  await value.controller.reserve(f.request(value, 'planning', 'unknown', 100)); await value.controller.admit('unknown'); await value.controller.markUnknown('unknown', f.evidence);
  const authority = await value.controller.validationAuthority(value.declaration.grants.planning.taskId, 'planning');
  assert.equal(authority.budgetGroup!.committedMicroCny, 100); assert.equal(authority.admissionAllowed, false);
  await assert.rejects(value.controller.prepareOwnedChild({ taskId: value.declaration.grants.planning.taskId, windowId: value.window.windowId }), /unknown|reconcil/i);
  await assert.rejects(value.controller.reserve(f.request(value, 'planning', 'compaction', 8)), /unknown|reconcil/i);
  await value.controller.settle('unknown', 10_000_001, f.evidence);
  const after = await value.controller.read(); assert.equal(after.ledger.entries.at(-1)!.settledMicroCny, 10_000_001);
  assert.equal(after.validation!.cases.at(-1)!.stopReason!.code, 'charge_overrun'); assert.equal(value.controller.signal.aborted, true);
});

test('first delegation requires the exact approved vector and cannot substitute a caller budget label', async t => {
  const f = await groupFixture(t), small = await f.declaration('cos20-group-small', true, 0.6); f.setCurrent(small);
  await assert.rejects(prepareValidationCase({ ...f, declaration: small }), /first|vector|grant/i);
  const d = await f.declaration('cos20-group-proof'); f.setCurrent(d); const quote = await prepareValidationCase({ ...f, declaration: d });
  quote.budgetGroup!.parentAllocation.sha256 = 'b'.repeat(64); const { quoteId: _id, ...payload } = quote; quote.quoteId = 'vq2-' + hash(JSON.stringify(payload));
  const decision = { kind: 'operator_validation' as const, decisionId: 'offline-forged-parent', actorId: 'offline-coordinator', decidedAt: new Date(f.now()).toISOString(),
    source: { artifactId: 'operator', version: 'v1', location: 'forged-parent.json' }, sourceRefs: f.evidence };
  await writeFile(join(f.root, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId: decision.decisionId,
    actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }), 'utf8');
  const before = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(RunController.claimValidationCase({ ...f, quote, decision }), /parent|group|quote/i);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
});

test('already reserved requests can admit at the exact case ceiling while another reservation is refused', async t => {
  const f = await groupFixture(t), value = await f.claim(await f.declaration('cos20-group-exact'));
  await f.register(value, 'art'); await f.register(value, 'coding');
  await value.controller.reserve(f.request(value, 'art', 'exact-a', 2_500_000)); await value.controller.reserve(f.request(value, 'coding', 'exact-b', 2_500_000));
  await value.controller.admit('exact-a'); await value.controller.admit('exact-b');
  await assert.rejects(value.controller.reserve(f.request(value, 'planning', 'one-more', 8)), /ceiling|budget|admission/i);
  assert.equal((await value.controller.read()).requests.filter(item => item.admittedAt !== null).length, 2);
});

test('compaction-shaped provider hooks retain the exact parent membership and billing receipt', async t => {
  const f = await groupFixture(t), value = await f.claim(await f.declaration('cos20-group-compaction'));
  const budget = createRoleBudget({ controller: value.controller, taskId: value.declaration.grants.planning.taskId, evidenceDirectory: join(f.root, 'offline-billing'),
    validation: { caseId: value.window.caseId, windowId: value.window.windowId, purpose: 'planning' } });
  await budget.beforeRequest({ requestId: 'compact', modelId: 'deepseek-flash', maxOutputTokens: 4096, inputBytes: 10, hasImages: false, estimatedMaxCostMicroCny: 32788 });
  await budget.afterResponse({ requestId: 'compact', outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
  const state = await value.controller.read(), request = state.requests.at(-1)!;
  assert.equal(request.validation!.caseId, value.window.caseId); assert.equal(state.ledger.entries.at(-1)!.settledMicroCny, 10);
  assert.equal((await value.controller.validationAuthority(value.declaration.grants.planning.taskId, 'planning')).budgetGroup!.committedMicroCny, 10);
});

test('source drift blocks trusted host and child launch before ownership changes', async t => {
  const f = await groupFixture(t), value = await f.claim(await f.declaration('cos20-group-tools'));
  const owner = join(f.root, '.controller.lock'), before = await readFile(owner), source = join(f.root, value.decision.source.location), bytes = await readFile(source);
  await writeFile(source, Buffer.concat([bytes, Buffer.from('\n')]));
  await assert.rejects(value.controller.requireValidationHost(value.window.caseId, value.window.windowId, join(f.repositoryRoot, '.cosmos/e2e', value.window.caseId)), /source|operator|group/i);
  await assert.rejects(value.controller.prepareOwnedChild({ taskId: value.declaration.grants.planning.taskId, windowId: value.window.windowId }), /source|operator|group/i);
  assert.deepEqual(await readFile(owner), before); await writeFile(source, bytes);
});

test('fixed grant role order is canonical even when declaration JSON keys are reordered', async t => {
  const f = await groupFixture(t), d = await f.declaration('cos20-group-order');
  d.grants = Object.fromEntries(Object.entries(d.grants).reverse());
  const value = await f.claim(d), state = await value.controller.read();
  assert.deepEqual(state.ledger.allocationDelegations![0].taskIds, ['planning', 'design', 'art', 'coding', 'repair'].map(role => `${d.caseId}-${role}`));
});
