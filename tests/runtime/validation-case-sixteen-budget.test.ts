import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { TRANSFER_VALIDATION_CASE_FIFTEEN as previous } from '../../probes/transfer/validation-case-fifteen-declaration.ts';
import { TRANSFER_VALIDATION_CASE_SIXTEEN as fixed, parseTransferValidationCaseSixteenEntry } from '../../probes/transfer/validation-case-sixteen-declaration.ts';
import { RunController } from '../../src/runtime/run.ts';
import { budgetCapacity, validationBudgetGroup } from '../../src/contracts/budget.ts';
import { validateLedgerUpdate, validateRunUpdate } from '../../src/contracts/updates.ts';
import { prepareValidationCase } from '../../src/runtime/validation-window.ts';
import { isFixedTransferCaseFifteenDeclaration, isFixedTransferCaseSixteenDeclaration as isFixed, VALIDATION_ROLES, validateValidationDeclaration } from '../../src/runtime/validation-validation.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import type { ValidationCaseQuote, ValidationDeclaration } from '../../src/runtime/validation-types.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import { supplementFixture } from './validation-group-supplement.fixture.ts';

async function copyInputs(repositoryRoot: string) {
  for (const file of [fixed.inputs.requirements, ...fixed.inputs.template.files]) {
    const destination = join(repositoryRoot, file.path); await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(new URL('../../' + file.path, import.meta.url)));
  }
}

test('complete fixed C16 predicate preserves every C15 field except the six identities and rejects every variant', () => {
  assert.equal(isFixed(fixed), true); assert.equal(isFixed(previous), false);
  assert.equal(isFixedTransferCaseFifteenDeclaration(previous), true); assert.equal(isFixedTransferCaseFifteenDeclaration(fixed), false);
  const normalized = { ...fixed, caseId: previous.caseId,
    grants: Object.fromEntries(VALIDATION_ROLES.map(role => [role, { ...fixed.grants[role], taskId: previous.grants[role].taskId }])) };
  assert.deepEqual(normalized, previous); assert.ok(Object.isFrozen(fixed)); assert.ok(Object.isFrozen(fixed.grants.coding));
  assert.doesNotThrow(() => validateValidationDeclaration(fixed));
  for (const invalid of [null, undefined, {}, [], { inputs: null }, { caseId: fixed.caseId, grants: null },
    { ...fixed, grants: [] }, { ...fixed, grants: { ...fixed.grants, coding: [] } }, Object.assign(() => {}, fixed),
    { ...fixed, grants: Object.assign(() => {}, fixed.grants) },
    { ...fixed, grants: { ...fixed.grants, coding: Object.assign(() => {}, fixed.grants.coding) } }]) assert.equal(isFixed(invalid), false);
  function leaves(value: object, path: string[] = []): string[][] {
    return Object.entries(value).flatMap(([key, child]) => child && typeof child === 'object' ? leaves(child, [...path, key]) : [[...path, key]]);
  }
  for (const path of leaves(fixed)) {
    const altered = structuredClone(fixed);
    const parent = path.slice(0, -1).reduce((value, key) => value[key] as Record<string, unknown>, altered as unknown as Record<string, unknown>);
    const key = path.at(-1)!, old = parent[key]; parent[key] = typeof old === 'number' ? old + 1 : `${old}-changed`;
    assert.equal(isFixed(altered), false, path.join('.')); assert.throws(() => validateValidationDeclaration(altered), path.join('.'));
  }
  const paths: string[][] = [[], ['limits'], ['grants'], ...VALIDATION_ROLES.map(role => ['grants', role]),
    ['outputTokens'], ['inputs'], ['inputs', 'requirements'], ['inputs', 'template'], ['inputs', 'template', 'files', '0']];
  for (const path of paths) {
    const altered = structuredClone(fixed);
    const object = path.reduce((value, key) => value[key] as Record<string, unknown>, altered as unknown as Record<string, unknown>);
    object.extra = true;
    assert.equal(isFixed(altered), false, `${path.join('.')}.extra`); assert.throws(() => validateValidationDeclaration(altered));
  }
  for (const patch of [{ budgetGroup: undefined }, { budgetGroup: { parentTaskId: 'COS-16', allocationMicroCny: 10_000_000 } },
    { limits: { ...fixed.limits, durationMs: 2_700_000 } }]) {
    const altered = { ...fixed, ...patch }; assert.equal(isFixed(altered), false); assert.throws(() => validateValidationDeclaration(altered));
  }
  const other: ValidationDeclaration = { ...fixed, caseId: 'cos20-other', limits: { ...fixed.limits, durationMs: 2_700_000 },
    grants: Object.fromEntries(VALIDATION_ROLES.map(role => [role, { ...fixed.grants[role], taskId: `cos20-other-${role}` }])) as ValidationDeclaration['grants'] };
  assert.doesNotThrow(() => validateValidationDeclaration(other));
  assert.throws(() => validateValidationDeclaration({ ...other, limits: { ...other.limits, durationMs: 2_700_001 } }), /limits/i);
});

test('C16 command parsing fixes its own identity without a case selector', () => {
  const sha = 'a'.repeat(40);
  assert.equal(parseTransferValidationCaseSixteenEntry(['--validation-preflight', sha]).caseId, fixed.caseId);
  assert.equal(parseTransferValidationCaseSixteenEntry(['--validation-case', sha, 'operator.json']).caseId, fixed.caseId);
  for (const args of [[], ['--validation-preflight', sha, previous.caseId], ['--validation-case', sha, 'operator.json', fixed.caseId]])
    assert.throws(() => parseTransferValidationCaseSixteenEntry(args), /validation-case-sixteen-run/);
});

/** Short API history: four closed cases, then a fifth zero-task C15 and its closure. */
async function closedC14(t: test.TestContext) {
  const f = await supplementFixture(t), supplement = await RunController.prepareValidationGroupSupplement(f);
  await RunController.applyValidationGroupSupplement({ ...f, quote: supplement, decision: await f.decision(supplement) });
  const c14 = await f.claim(f.target); await f.charge(c14, 'coding', 792_063); await f.close(c14);
  await copyInputs(f.repositoryRoot);
  f.setCurrent(fixed);
  return { ...f, c14, snapshot: async (): Promise<RunSnapshot> => { const state = await f.snapshot(); validateSnapshot(state); return state; } };
}
async function fixture(t: test.TestContext, closeC15 = true) {
  const f = await closedC14(t);
  const c15 = await f.claim(previous); if (closeC15) await f.close(c15);
  f.setCurrent(fixed);
  return { ...f, c15 };
}

test('authentic ledger5 admits exact ninety-minute C16 after zero-task C15 closure without changing the old group', async t => {
  const f = await fixture(t), before = await f.snapshot();
  assert.equal(before.validation!.cases.length, 5); assert.equal(before.ledger.allocationClosures!.length, 25);
  assert.equal(before.allocationClosureDecisions!.length, 5);
  const c15 = before.validation!.cases.at(-1)!;
  assert.equal(c15.caseId, previous.caseId); assert.equal(c15.stopReason!.code, 'manual'); assert.equal(c15.repair, null);
  const previousIds = VALIDATION_ROLES.map(role => previous.grants[role].taskId);
  assert.equal(before.tasks.filter(task => previousIds.includes(task.taskId)).length, 0);
  assert.equal(before.requests.filter(request => request.validation?.caseId === previous.caseId).length, 0);
  assert.equal(before.ledger.entries.filter(entry => previousIds.includes(entry.taskId)).length, 0);
  assert.equal(before.ledger.allocationClosures!.slice(-5).reduce((sum, closure) => sum + closure.releasedMicroCny, 0), 21_000_000);
  const bytes = await readFile(join(f.root, 'snapshot.json'));
  let quote;
  try { quote = await prepareValidationCase({ ...f, declaration: fixed }); }
  finally { assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), bytes); }
  assert.equal(quote.formatVersion, 'validation-case-quote-1'); assert.equal(quote.budgetGroup, undefined);
  const value = await f.claim(fixed), after = await value.controller.read();
  assert.equal(after.ledger.contractVersion, '5.0.0');
  assert.equal(budgetCapacity(after.ledger).allocatedMicroCny - budgetCapacity(before.ledger).allocatedMicroCny, 21_000_000);
  assert.deepEqual(after.ledger.allocations.slice(-5), VALIDATION_ROLES.map(role => fixed.grants[role]));
  assert.deepEqual(validationBudgetGroup(after.ledger), validationBudgetGroup(before.ledger));
  for (const key of ['entries', 'allocationDelegations', 'allocationSupplements', 'allocationClosures'] as const) assert.deepEqual(after.ledger[key], before.ledger[key]);
  for (const key of ['requests', 'tasks', 'allocationClosureDecisions', 'allocationSupplementDecisions'] as const) assert.deepEqual(after[key], before[key]);
  assert.equal(after.revision, before.revision + 1); assert.equal(after.events.length, before.events.length + 1);
  assert.deepEqual(after.validation!.cases.slice(0, -1), before.validation!.cases);
  assert.deepEqual(after.ledger.allocations.slice(0, -5), before.ledger.allocations);
  assert.deepEqual(after.run.taskIds.slice(0, -5), before.run.taskIds);
  assert.equal(Date.parse(value.window.deadlineAt) - Date.parse(value.window.startedAt), 5_400_000);
  assert.equal(after.run.originalStartedAt, before.run.originalStartedAt); assert.equal(after.run.originalDeadlineAt, before.run.originalDeadlineAt);
  await value.controller.close();
  assert.deepEqual(await RunController.claimValidationCase({ ...f, quote, decision: value.decision }), value.window);
  const duplicate = await operator(f, quote, 'duplicate-c16');
  await unchanged(f.root, () => RunController.claimValidationCase({ ...f, quote, decision: duplicate }), /C15|claimed/i);
});

async function unchanged(root: string, action: () => Promise<unknown>, pattern: RegExp) {
  const before = await readFile(join(root, 'snapshot.json'));
  await assert.rejects(action(), pattern);
  assert.deepEqual(await readFile(join(root, 'snapshot.json')), before);
}
async function operator(f: Pick<Awaited<ReturnType<typeof fixture>>, 'root' | 'now' | 'evidence'>, quote: ValidationCaseQuote, decisionId: string) {
  const decision = { kind: 'operator_validation' as const, decisionId, actorId: 'offline', decidedAt: new Date(f.now()).toISOString(),
    source: { artifactId: 'operator', version: decisionId, location: `${decisionId}.json` }, sourceRefs: f.evidence };
  await writeFile(join(f.root, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', kind: decision.kind,
    decisionId, actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }), 'utf8');
  return decision;
}

test('C16 refuses ledger4 and closed C14 while C15 still requires only its original closed C14 predecessor', async t => {
  const old = await supplementFixture(t); await copyInputs(old.repositoryRoot); old.setCurrent(fixed);
  await unchanged(old.root, () => prepareValidationCase({ ...old, declaration: fixed }), /ledger5|C15/i);
  old.setCurrent(previous);
  await unchanged(old.root, () => prepareValidationCase({ ...old, declaration: previous }), /ledger5|C14/i);
  const f = await closedC14(t);
  await unchanged(f.root, () => prepareValidationCase({ ...f, declaration: fixed }), /C15/i);
  const c15 = await f.claim(previous); await f.close(c15);
  f.setCurrent(previous);
  await unchanged(f.root, () => prepareValidationCase({ ...f, declaration: previous }), /C14|claimed/i);
  const other: ValidationDeclaration = await f.declaration('cos20-unrelated', false); f.setCurrent(other);
  await unchanged(f.root, () => prepareValidationCase({ ...f, declaration: other }), /grouped/i);
});

test('C16 refuses active and stopped but unclosed C15 before any snapshot write', async t => {
  const f = await fixture(t, false);
  await unchanged(f.root, () => prepareValidationCase({ ...f, declaration: fixed }), /C15|closed/i);
  await f.c15.controller.stop('Synthetic manual stop without closure.'); await f.c15.controller.close();
  await unchanged(f.root, () => prepareValidationCase({ ...f, declaration: fixed }), /C15|closed/i);
});

/** Negative capacity/staleness setup uses validated allocation updates, never a hand-filled financial snapshot. */
async function appendAllocation(f: Awaited<ReturnType<typeof fixture>>, amountMicroCny: number) {
  const store = await SnapshotStore.acquire(f.root);
  try {
    const previousState = await store.read(); validateSnapshot(previousState); const next = structuredClone(previousState);
    next.ledger.allocations.push({ taskId: 'offline-capacity', amountMicroCny }); next.run.taskIds.push('offline-capacity'); next.revision++;
    assert.deepEqual(validateLedgerUpdate(previousState.ledger, next.ledger, { role: 'system', actorId: 'offline' }), []);
    assert.deepEqual(validateRunUpdate(previousState.run, next.run, { role: 'system', actorId: 'offline' }), []);
    validateSnapshot(next); await store.write(next);
  } finally { await store.close(); }
}

test('C16 refuses shared capacity short by one and a quote made stale by a validated allocation', async t => {
  const f = await fixture(t), state = await f.snapshot();
  await appendAllocation(f, 150_000_000 - budgetCapacity(state.ledger).allocatedMicroCny - 21_000_000 + 1);
  await unchanged(f.root, () => prepareValidationCase({ ...f, declaration: fixed }), /shared|unallocated/i);
  const stale = await fixture(t), quote = await prepareValidationCase({ ...stale, declaration: fixed });
  await appendAllocation(stale, 1);
  await unchanged(stale.root, () => operator(stale, quote, 'stale-c16').then(decision => RunController.claimValidationCase({ ...stale, quote, decision })), /stale/i);
});

test('C16 retains unknown-charge refusal and historical overrun blocks its successor admission', async t => {
  const f = await fixture(t), value = await f.claim(fixed), request = f.request(value, 'planning', 'c16-unknown', 8);
  await value.controller.reserve(request); await value.controller.admit(request.requestId); await value.controller.markUnknown(request.requestId, f.evidence);
  await unchanged(f.root, () => value.controller.reserve(f.request(value, 'planning', 'after-unknown', 8)), /unknown|reconcile/i);
  await value.controller.stop('Synthetic unknown request stop.'); await value.controller.close();
  await unchanged(f.root, () => RunController.prepareValidationAllocationClosure({ ...f, caseIds: [fixed.caseId] }), /unknown|reserved/i);

  const overrun = await fixture(t, false); overrun.setCurrent(previous);
  const oldRequest = overrun.request(overrun.c15, 'planning', 'c15-overrun', 8);
  await overrun.c15.controller.reserve(oldRequest); await overrun.c15.controller.admit(oldRequest.requestId);
  await overrun.c15.controller.settle(oldRequest.requestId, 9, overrun.evidence); await overrun.close(overrun.c15);
  overrun.setCurrent(fixed);
  await unchanged(overrun.root, () => prepareValidationCase({ ...overrun, declaration: fixed }), /overrun/i);
});

test('C16 rechecks original delegation and supplement bytes at quote claim and runtime boundaries', async t => {
  const f = await fixture(t), before = await f.snapshot(), quote = await prepareValidationCase({ ...f, declaration: fixed });
  const decision = await operator(f, quote, 'source-c16');
  const sources = [before.validation!.cases.find(window => window.quote.declaration.formatVersion === 'validation-declaration-3')!.operatorDecision.source,
    before.allocationSupplementDecisions![0].operatorDecision.source];
  for (const source of sources) {
    const path = join(f.root, source.location), bytes = await readFile(path); await writeFile(path, Buffer.concat([bytes, Buffer.from('\n')]));
    try {
      await unchanged(f.root, () => prepareValidationCase({ ...f, declaration: fixed }), /source|decision/i);
      await unchanged(f.root, () => RunController.claimValidationCase({ ...f, quote, decision }), /source|decision/i);
    } finally { await writeFile(path, bytes); }
  }
  const value = await f.claim(fixed);
  for (const [index, source] of sources.entries()) {
    const path = join(f.root, source.location), bytes = await readFile(path); await writeFile(path, Buffer.concat([bytes, Buffer.from('\n')]));
    try {
      await unchanged(f.root, () => value.controller.reserve(f.request(value, 'planning', `changed-source-${index}`, 8)), /source|decision/i);
      await unchanged(f.root, () => value.controller.requireValidationHost(fixed.caseId, value.window.windowId, join(f.repositoryRoot, '.cosmos/e2e', fixed.caseId)), /source|decision/i);
      await unchanged(f.root, () => value.controller.prepareOwnedChild({ taskId: fixed.grants.planning.taskId, windowId: value.window.windowId }), /source|decision/i);
    } finally { await writeFile(path, bytes); }
  }
});
