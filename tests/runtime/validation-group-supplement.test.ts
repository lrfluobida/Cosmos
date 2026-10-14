import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, mkdir, rmdir, unlink, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { budgetCapacity, validationBudgetGroup } from '../../src/contracts/budget.ts';
import { RunController } from '../../src/runtime/run.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { prepareValidationCase } from '../../src/runtime/validation-window.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import { validateLedgerUpdate, validateRunUpdate } from '../../src/contracts/updates.ts';
import { groupFixture, hash } from './validation-group.fixture.ts';
import { supplementFixture } from './validation-group-supplement.fixture.ts';
import { createRoleBudget } from '../../src/roles/provider-budget.ts';

const api = RunController as typeof RunController & {
  prepareValidationGroupSupplement(options: unknown): Promise<any>;
  applyValidationGroupSupplement(options: unknown): Promise<any>;
};

test('fixed group supplement allocates once in the original shared ledger and preserves history', async t => {
  const f = await supplementFixture(t), before = f.beforeSupplement, bytes = await readFile(join(f.root, 'snapshot.json'));
  assert.equal(typeof api.prepareValidationGroupSupplement, 'function', 'missing fixed group supplement quote API');
  assert.equal(validationBudgetGroup(before.ledger)!.allocatedMicroCny, 9_100_314);
  const quote = await api.prepareValidationGroupSupplement(f);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), bytes);
  assert.equal(quote.additionalMicroCny, 1_600_314); assert.equal(quote.targetCaseId, f.target.caseId);
  assert.deepEqual(quote.grants, f.target.grants);
  const decision = await f.decision(quote), receipt = await api.applyValidationGroupSupplement({ ...f, quote, decision });
  const after = await f.snapshot(); validateSnapshot(after);
  assert.equal(after.ledger.contractVersion, '5.0.0');
  assert.equal(budgetCapacity(after.ledger).allocatedMicroCny - budgetCapacity(before.ledger).allocatedMicroCny, 1_600_314);
  assert.equal(budgetCapacity(after.ledger).effectiveLimitMicroCny, 150_000_000);
  assert.equal(validationBudgetGroup(after.ledger)!.limitMicroCny, 11_600_314);
  assert.equal(validationBudgetGroup(after.ledger)!.limitMicroCny - validationBudgetGroup(after.ledger)!.allocatedMicroCny, 2_500_000);
  for (const key of ['allocations', 'entries', 'allocationClosures', 'allocationDelegations'] as const) assert.deepEqual(after.ledger[key], before.ledger[key]);
  for (const key of ['requests', 'validation', 'allocationClosureDecisions', 'tasks', 'run'] as const) assert.deepEqual(after[key], before[key]);
  const appliedBytes = await readFile(join(f.root, 'snapshot.json'));
  assert.deepEqual(await api.applyValidationGroupSupplement({ ...f, quote, decision }), receipt);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), appliedBytes);
  await assert.rejects(api.prepareValidationGroupSupplement(f), /supplement|once|version/i);
  await assert.rejects(api.applyValidationGroupSupplement({ ...f, quote, decision: await f.decision(quote, 'offline-second') }), /supplement|once|version|stale/i);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), appliedBytes);
});

test('supplemented C14 enforces the full vector, dispatch source, cold restore and closure history', async t => {
  const f = await supplementFixture(t);
  assert.equal(typeof api.prepareValidationGroupSupplement, 'function', 'missing fixed group supplement quote API');
  const quote = await api.prepareValidationGroupSupplement(f), decision = await f.decision(quote);
  await api.applyValidationGroupSupplement({ ...f, quote, decision });
  for (const alter of [(d: any) => { d.caseId = 'cos20-other'; for (const role of Object.keys(d.grants)) d.grants[role].taskId = `${d.caseId}-${role}`; },
    ...Object.keys(f.target.grants).map(role => (d: any) => { d.grants[role].amountMicroCny++; }),
    ...Object.keys(f.target.grants).map(role => (d: any) => { d.grants[role].taskId += '-forged'; })]) {
    const bad = structuredClone(f.target); alter(bad); f.setCurrent(bad);
    await assert.rejects(prepareValidationCase({ ...f, declaration: bad }), /supplement|vector|grant|target/i);
  }
  const value = await f.claim(f.target); assert.equal(value.quote.formatVersion, 'validation-case-quote-3');
  await f.register(value, 'coding');
  const budget = createRoleBudget({ controller: value.controller, taskId: f.target.grants.coding.taskId, evidenceDirectory: join(f.root, 'offline-supplement-billing'),
    validation: { caseId: value.window.caseId, windowId: value.window.windowId, purpose: 'author' } });
  const request = { requestId: 'fresh', modelId: 'deepseek-flash' as const, maxOutputTokens: 1, inputBytes: 0, hasImages: false, estimatedMaxCostMicroCny: 100_000 };
  let providerCalls = 0;
  const fakeProvider = async () => { providerCalls++; return { requestId: 'fresh', outcome: 'settled' as const, responseModel: 'deepseek-flash', elapsedMs: 1,
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }; };
  const source = join(f.root, decision.source.location), sourceBytes = await readFile(source);
  await writeFile(source, Buffer.concat([sourceBytes, Buffer.from('\n')]));
  await assert.rejects(value.controller.reserve(f.request(value, 'coding', 'drift', 8)), /source|supplement/i);
  await assert.rejects(budget.beforeRequest(request), /source|supplement/i); assert.equal(providerCalls, 0);
  await assert.rejects(value.controller.requireValidationHost(value.window.caseId, value.window.windowId, join(f.repositoryRoot, '.cosmos/e2e', value.window.caseId)), /source|supplement/i);
  await assert.rejects(value.controller.prepareOwnedChild({ taskId: f.target.grants.coding.taskId, windowId: value.window.windowId }), /source|supplement|task/i);
  await writeFile(source, sourceBytes);
  await budget.beforeRequest(request); await budget.afterResponse(await fakeProvider()); assert.equal(providerCalls, 1);
  const closure = await f.close(value); assert.equal(closure.formatVersion, 'validation-allocation-closure-quote-3');
  const after = await f.snapshot(); validateSnapshot(after);
  assert.equal(budgetCapacity(after.ledger).allocatedMicroCny, budgetCapacity(f.beforeSupplement.ledger).allocatedMicroCny + 1_600_314);
  assert.deepEqual(after.allocationClosureDecisions!.slice(0, f.beforeSupplement.allocationClosureDecisions.length), f.beforeSupplement.allocationClosureDecisions);
  const restored = await RunController.openValidationCase({ ...f, caseId: value.window.caseId, windowId: value.window.windowId, accountingOnly: true });
  try { assert.deepEqual(await restored.read(), after); } finally { await restored.close(); }
  for (const alter of [(s: any) => { delete s.allocationSupplementDecisions; }, (s: any) => { s.ledger.allocationSupplements.push(s.ledger.allocationSupplements[0]); },
    (s: any) => { s.allocationSupplementDecisions[0].quote.additionalMicroCny++; }, (s: any) => { s.events.find((e: any) => e.type === 'validation_group_supplemented').reason = 'forged'; }]) {
    const bad = structuredClone(after); alter(bad); assert.throws(() => validateSnapshot(bad));
  }
});

test('supplement refuses receipt conflicts, stale identity and unresolved existing owners without writes', async t => {
  const f = await supplementFixture(t);
  assert.equal(typeof api.prepareValidationGroupSupplement, 'function', 'missing fixed group supplement quote API');
  const quote = await api.prepareValidationGroupSupplement(f), bytes = await readFile(join(f.root, 'snapshot.json'));
  for (const alter of [(q: any) => { q.additionalMicroCny++; }, (q: any) => { q.targetCaseId = 'cos20-other'; },
    (q: any) => { q.basis.revision--; }, (q: any) => { q.basis.snapshotSha256 = 'b'.repeat(64); },
    (q: any) => { q.identity.reviewedPlatformSha = 'b'.repeat(40); }, (q: any) => { q.authorizationDecisionId = 'invented'; },
    (q: any) => { q.parentAllocation.sha256 = 'b'.repeat(64); }, ...Object.keys(f.target.grants).map(role => (q: any) => { q.grants[role].amountMicroCny++; }),
    ...Object.keys(f.target.grants).map(role => (q: any) => { q.grants[role].taskId += '-forged'; })]) {
    const bad = structuredClone(quote); alter(bad);
    const { quoteId: _id, ...payload } = bad; bad.quoteId = 'vgsq1-' + hash(JSON.stringify(payload));
    await assert.rejects(api.applyValidationGroupSupplement({ ...f, quote: bad, decision: await f.decision(bad) }));
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), bytes);
  }
  const existingRoot = join(f.repositoryRoot, '.cosmos/e2e', f.beforeSupplement.validation.currentCaseId), lock = join(existingRoot, '.controller.lock');
  await mkdir(lock); await assert.rejects(api.prepareValidationGroupSupplement(f), /owner|drain|idle/i); await rmdir(lock);
  const writer = join(existingRoot, 'registry/.commit.lock'); await writeFile(writer, 'offline writer', 'utf8');
  await assert.rejects(api.prepareValidationGroupSupplement(f), /writer|idle/i); await unlink(writer);
  const store = await SnapshotStore.acquire(f.root);
  try { await assert.rejects(api.prepareValidationGroupSupplement(f), /owner|idle/i); } finally { await store.close(); }
  await rename(existingRoot, existingRoot + '-offline');
  try { await assert.rejects(api.prepareValidationGroupSupplement(f), /ENOENT|root/i); } finally { await rename(existingRoot + '-offline', existingRoot); }
  for (const source of [f.beforeSupplement.validation.cases[0].operatorDecision.source, f.beforeSupplement.allocationClosureDecisions[0].operatorDecision.source]) {
    const path = join(f.root, source.location), original = await readFile(path); await writeFile(path, Buffer.concat([original, Buffer.from('\n')]));
    try { await assert.rejects(api.prepareValidationGroupSupplement(f), /source/i); } finally { await writeFile(path, original); }
  }
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), bytes);
});

test('supplement checks actual unallocated capacity even with ample unspent funds', async t => {
  const f = await supplementFixture(t), store = await SnapshotStore.acquire(f.root);
  try {
    const previous = await store.read(); validateSnapshot(previous); const next = structuredClone(previous);
    // Legitimate append-only unrelated allocation, with no invented fee or case history.
    next.ledger.allocations.push({ taskId: 'offline-unspent-capacity', amountMicroCny: 64_403_960 }); next.run.taskIds.push('offline-unspent-capacity'); next.revision++;
    assert.deepEqual(validateLedgerUpdate(previous.ledger, next.ledger, { role: 'system', actorId: 'offline-allocation' }), []);
    assert.deepEqual(validateRunUpdate(previous.run, next.run, { role: 'system', actorId: 'offline-allocation' }), []);
    validateSnapshot(next); await store.write(next);
  } finally { await store.close(); }
  const bytes = await readFile(join(f.root, 'snapshot.json')), state = await f.snapshot();
  assert.equal(150_000_000 - budgetCapacity(state.ledger).allocatedMicroCny, 1_000_000);
  assert.ok(150_000_000 - state.run.fees.settledMicroCny > 100_000_000);
  await assert.rejects(api.prepareValidationGroupSupplement(f), /supplement|unallocated|capacity/i);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), bytes);
});

test('supplement refuses active, reserved, unknown, unclosed and running work through real controller history', async t => {
  const f = await supplementFixture(t, false), value = f.second;
  let bytes = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(api.prepareValidationGroupSupplement(f), /stopped|closed|running|reconciled/i);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), bytes);
  await value.controller.reserve(f.request(value, 'coding', 'unresolved', 8));
  await assert.rejects(api.prepareValidationGroupSupplement(f), /stopped|reserved|reconcil/i);
  await value.controller.admit('unresolved'); await value.controller.markUnknown('unresolved', f.evidence);
  await assert.rejects(api.prepareValidationGroupSupplement(f), /stopped|unknown|reconcil/i);
  await value.controller.settle('unresolved', 8, f.evidence); await value.controller.stop('Offline stopped before closure.'); await value.controller.close();
  bytes = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(api.prepareValidationGroupSupplement(f), /closed/i);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), bytes);
  // The first claim exposes real running attempt rules without altering a closed historical task.
  const active = await groupFixture(t), current = await active.claim(await active.declaration('cos20-running-supplement'));
  const task = await active.register(current, 'coding');
  task.state = 'ready'; await current.controller.saveTask(task, { role: 'system', actorId: 'offline' });
  task.state = 'running'; task.attempts.push({ attemptId: 'offline-running', sessionRef: 'offline-session', startedAt: new Date(active.now()).toISOString(), endedAt: null, outcome: 'running', failure: null });
  await current.controller.saveTask(task, { role: 'system', actorId: 'offline' });
  await current.controller.stop('Offline stop retains unfinished author attempt.'); await current.controller.close();
  await assert.rejects(api.prepareValidationGroupSupplement(active), /running|closed/i);
});

test('supplement refuses phase capacity insufficient for the entire next envelope', async t => {
  const f = await supplementFixture(t, true, 18_800_000), bytes = await readFile(join(f.root, 'snapshot.json'));
  assert.equal(30_000_000 - f.beforeSupplement.run.fees.settledMicroCny, 2_099_686);
  await assert.rejects(api.prepareValidationGroupSupplement(f), /supplement|capacity/i);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), bytes);
});

test('concurrent supplement applications commit at most once and conflicting receipt reuse cannot allocate again', async t => {
  const f = await supplementFixture(t), quote = await api.prepareValidationGroupSupplement(f), decision = await f.decision(quote);
  const results = await Promise.allSettled([api.applyValidationGroupSupplement({ ...f, quote, decision }), api.applyValidationGroupSupplement({ ...f, quote, decision })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const state = await f.snapshot(); assert.equal(state.revision, f.beforeSupplement.revision + 1);
  assert.equal(state.ledger.allocationSupplements.length, 1);
  const source = join(f.root, decision.source.location), bytes = await readFile(source), changed = { ...decision, actorId: 'offline-conflicting-operator' };
  await writeFile(source, JSON.stringify({ formatVersion: 'operator-validation-group-supplement-decision-1', kind: changed.kind, decisionId: changed.decisionId,
    actorId: changed.actorId, decidedAt: changed.decidedAt, sourceRefs: changed.sourceRefs, quote }), 'utf8');
  try { await assert.rejects(api.applyValidationGroupSupplement({ ...f, quote, decision: changed }), /conflict|source/i); } finally { await writeFile(source, bytes); }
  assert.equal((await f.snapshot()).revision, state.revision);
  assert.deepEqual(await api.applyValidationGroupSupplement({ ...f, quote, decision }), state.allocationSupplementDecisions[0]);
});
