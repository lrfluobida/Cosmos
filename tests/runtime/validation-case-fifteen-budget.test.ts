import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { TRANSFER_VALIDATION_CASE_FIFTEEN as fixed } from '../../probes/transfer/validation-case-fifteen-declaration.ts';
import { RunController } from '../../src/runtime/run.ts';
import { budgetCapacity, validationBudgetGroup } from '../../src/contracts/budget.ts';
import { validateLedgerUpdate, validateRunUpdate } from '../../src/contracts/updates.ts';
import type { TaskContract } from '../../src/contracts/index.ts';
import { prepareValidationCase } from '../../src/runtime/validation-window.ts';
import { isFixedTransferCaseFifteenDeclaration, VALIDATION_ROLES, validateValidationDeclaration, validationReservation } from '../../src/runtime/validation-validation.ts';
import { prepareValidationAllocationClosure, applyValidationAllocationClosure } from '../../src/runtime/validation-allocations.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import type { ValidationDeclaration } from '../../src/runtime/validation-types.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import { task as taskFixture } from '../contracts/fixtures.ts';
import { supplementFixture } from './validation-group-supplement.fixture.ts';

const imageReserve = 2_131_072;
async function copyInputs(repositoryRoot: string) {
  for (const file of [fixed.inputs.requirements, ...fixed.inputs.template.files]) {
    const destination = join(repositoryRoot, file.path); await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(new URL('../../' + file.path, import.meta.url)));
  }
}

/** The short synthetic ledger is built by the production claim, request, supplement and closure APIs. */
async function fixture(t: test.TestContext, closeC14 = true, initialChargeMicroCny?: number) {
  const f = await supplementFixture(t, true, initialChargeMicroCny), supplement = await RunController.prepareValidationGroupSupplement(f);
  await RunController.applyValidationGroupSupplement({ ...f, quote: supplement, decision: await f.decision(supplement) });
  const c14 = await f.claim(f.target); assert.equal(c14.quote.formatVersion, 'validation-case-quote-3');
  await f.charge(c14, 'coding', 792_063); if (closeC14) await f.close(c14);
  await copyInputs(f.repositoryRoot);
  f.setCurrent(fixed);
  return { ...f, c14, snapshot: async (): Promise<RunSnapshot> => { const state = await f.snapshot(); validateSnapshot(state); return state; } };
}

test('fixed C15 alone authorizes the complete ninety-minute declaration', () => {
  assert.doesNotThrow(() => validateValidationDeclaration(fixed));
  assert.equal(isFixedTransferCaseFifteenDeclaration(fixed), true);
  for (const invalid of [null, undefined, {}, { inputs: null }, { inputs: { template: { files: [null] } } }]) assert.equal(isFixedTransferCaseFifteenDeclaration(invalid), false);
  function leaves(value: object, path: string[] = []): string[][] {
    return Object.entries(value).flatMap(([key, child]) => child && typeof child === 'object' ? leaves(child, [...path, key]) : [[...path, key]]);
  }
  // Every fixed literal, grant, output limit, requirement identity and template file is exercised.
  for (const path of leaves(fixed)) {
    const altered = structuredClone(fixed);
    const parent = path.slice(0, -1).reduce((value, key) => value[key] as Record<string, unknown>, altered as unknown as Record<string, unknown>);
    const key = path.at(-1)!, old = parent[key]; parent[key] = typeof old === 'number' ? old + 1 : `${old}-changed`;
    assert.equal(isFixedTransferCaseFifteenDeclaration(altered), false, path.join('.'));
    assert.throws(() => validateValidationDeclaration(altered), path.join('.'));
  }
  for (const patch of [{ budgetGroup: undefined }, { budgetGroup: { parentTaskId: 'COS-16', allocationMicroCny: 10_000_000 } }, { extra: true },
    { limits: { ...fixed.limits, durationMs: 2_700_000 } }]) {
    const altered = { ...fixed, ...patch }; assert.equal(isFixedTransferCaseFifteenDeclaration(altered), false); assert.throws(() => validateValidationDeclaration(altered));
  }
  const other: ValidationDeclaration = { ...fixed, caseId: 'cos20-other', limits: { ...fixed.limits, durationMs: 2_700_000 },
    grants: Object.fromEntries(VALIDATION_ROLES.map(role => [role, { ...fixed.grants[role], taskId: `cos20-other-${role}` }])) as ValidationDeclaration['grants'] };
  assert.doesNotThrow(() => validateValidationDeclaration(other));
  assert.throws(() => validateValidationDeclaration({ ...other, limits: { ...other.limits, durationMs: 2_700_001 } }), /limits/i);
});

test('authentic ledger5 admits nongrouped C15 after C14 closure without changing the old group', async t => {
  const f = await fixture(t), before = await f.snapshot();
  const declaration = structuredClone(fixed); f.setCurrent(declaration);
  const quote = await prepareValidationCase({ ...f, declaration });
  assert.equal(quote.formatVersion, 'validation-case-quote-1'); assert.equal(quote.budgetGroup, undefined);
  const value = await f.claim(declaration), after = await value.controller.read();
  assert.equal(after.ledger.contractVersion, '5.0.0');
  assert.equal(budgetCapacity(after.ledger).allocatedMicroCny - budgetCapacity(before.ledger).allocatedMicroCny, 21_000_000);
  assert.deepEqual(validationBudgetGroup(after.ledger), validationBudgetGroup(before.ledger));
  assert.equal(after.revision, before.revision + 1); assert.equal(after.events.length, before.events.length + 1);
  assert.equal(after.validation!.cases.length, before.validation!.cases.length + 1);
  assert.deepEqual(after.validation!.cases.slice(0, -1), before.validation!.cases);
  assert.deepEqual(after.ledger.allocations.slice(0, -5), before.ledger.allocations);
  assert.deepEqual(after.run.taskIds.slice(0, -5), before.run.taskIds);
  for (const key of ['entries', 'allocationDelegations', 'allocationSupplements', 'allocationClosures'] as const) assert.deepEqual(after.ledger[key], before.ledger[key]);
  for (const key of ['requests', 'tasks', 'allocationClosureDecisions', 'allocationSupplementDecisions'] as const) assert.deepEqual(after[key], before[key]);
  assert.equal(Date.parse(value.window.deadlineAt) - Date.parse(value.window.startedAt), 5_400_000);
  assert.equal(after.run.originalStartedAt, before.run.originalStartedAt); assert.equal(after.run.originalDeadlineAt, before.run.originalDeadlineAt);
  await value.controller.close();
  assert.deepEqual(await RunController.claimValidationCase({ ...f, quote, decision: value.decision }), value.window);
  await assert.rejects(prepareValidationCase({ ...f, declaration: fixed }), /C14|claimed/i);
});

async function opened(t: test.TestContext, initialChargeMicroCny?: number) {
  const f = await fixture(t, true, initialChargeMicroCny), before = await f.snapshot(), value = await f.claim(fixed);
  async function register(role: 'coding' | 'design') {
    const task = taskFixture() as TaskContract, grant = fixed.grants[role];
    const acceptanceIds = role === 'coding' ? value.quote.requirements.acceptanceIds : [value.quote.requirements.stageAcceptanceIds[0]];
    Object.assign(task, { taskId: grant.taskId, runId: before.run.runId, kind: 'evaluation', specVersion: '1.0', authorId: `offline-${role}-15`, acceptanceIds,
      dependsOn: [], inputs: [], state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [],
      review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] } });
    task.acceptance = acceptanceIds.map(acceptanceId => ({ ...task.acceptance[0], acceptanceId })); task.context.contextId = `offline-${role}-15-context`;
    task.budget = { ledgerId: before.ledger.ledgerId, allocationMicroCny: grant.amountMicroCny, originalDeadlineAt: before.run.originalDeadlineAt };
    await value.controller.registerTasks([task]); return task;
  }
  await register('coding');
  const request = (requestId: string, role: 'coding' | 'design' | 'planning' = 'coding', amount = imageReserve, images = true) => ({
    requestId, taskId: fixed.grants[role].taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: amount,
    validation: { caseId: value.window.caseId, windowId: value.window.windowId, purpose: role === 'planning' ? 'planning' as const : images ? 'reviewer' as const : 'author' as const,
      modelId: 'deepseek-flash' as const, maxOutputTokens: images ? 16_384 : 1, inputBytes: 0, hasImages: images } });
  let transports = 0;
  async function dispatch(requestValue: ReturnType<typeof request>, cost: number) {
    await value.controller.reserve(requestValue); await value.controller.admit(requestValue.requestId); transports++;
    await value.controller.settle(requestValue.requestId, cost, f.evidence);
  }
  return { ...f, before, value, request, register, dispatch, transports: () => transports };
}

test('image reviewer reserves the conservative full amount after author cost and leaves the old group unchanged', async t => {
  const f = await opened(t), { controller } = f.value;
  await f.dispatch(f.request('author', 'coding', 792_063, false), 792_063);
  const request = f.request('image-review'); assert.equal(validationReservation(request.validation), imageReserve);
  await controller.reserve(request);
  let state = await controller.read(); assert.equal(state.ledger.entries.at(-1)!.reservedMicroCny, imageReserve);
  await controller.admit(request.requestId); await controller.settle(request.requestId, 12_345, f.evidence);
  state = await controller.read();
  assert.equal(state.run.fees.settledMicroCny - f.before.run.fees.settledMicroCny, 804_408);
  assert.equal(state.requests.at(-1)!.validation!.caseId, fixed.caseId); assert.equal(state.ledger.entries.at(-1)!.taskId, fixed.grants.coding.taskId);
  assert.equal((await controller.validationAuthority(fixed.grants.coding.taskId, 'reviewer')).caseCommittedMicroCny, 804_408);
  assert.deepEqual(validationBudgetGroup(state.ledger), validationBudgetGroup(f.before.ledger));
  assert.ok(validationBudgetGroup(f.before.ledger)!.remainingMicroCny < imageReserve);
  await assert.rejects(controller.validationAuthority(f.c14.declaration.grants.coding.taskId, 'reviewer'), /purpose|grant|planning/i);
});

test('image admission rejects underreservation, role capacity and case capacity short by one without transport', async t => {
  const f = await opened(t); await f.register('design');
  const reject = async (request: ReturnType<typeof f.request>) => {
    const before = await f.value.controller.read(), calls = f.transports();
    await assert.rejects(f.dispatch(request, 1), /reservation|budget|grant|admission/i);
    assert.equal(f.transports(), calls); assert.deepEqual(await f.value.controller.read(), before);
  };
  await reject(f.request('underreserved', 'coding', imageReserve - 1));
  await reject(f.request('role-short', 'design'));
  await f.dispatch(f.request('case-fill', 'coding', 5_000_000 - imageReserve + 1, false), 5_000_000 - imageReserve + 1);
  await reject(f.request('case-short-one'));
});

test('phase admission remains tighter than C15 and lifetime budgets without transport', async t => {
  const f = await opened(t, 18_300_000), authority = await f.value.controller.validationAuthority(fixed.grants.coding.taskId, 'reviewer');
  assert.equal(authority.remainingMicroCny, 30_000_000 - f.before.run.fees.settledMicroCny);
  assert.ok(authority.remainingMicroCny < imageReserve); assert.ok(authority.lifetimeLimitMicroCny - authority.committedMicroCny > imageReserve);
  await assert.rejects(f.dispatch(f.request('phase-full'), 1), /reservation|budget/i); assert.equal(f.transports(), 0);
});

test('all eighty accepted requests count and deadline cannot reset through cold restore', async t => {
  const f = await opened(t);
  for (let index = 0; index < 80; index++) {
    const request = f.request(`count-${index}`, 'planning', 8, false);
    await f.value.controller.reserve(request); await f.value.controller.cancel(request.requestId, f.evidence);
  }
  const before = await f.value.controller.read();
  await assert.rejects(f.dispatch(f.request('eighty-one', 'planning', 8, false), 0), /ceiling|budget|admission/i); assert.equal(f.transports(), 0);
  assert.deepEqual(await f.value.controller.read(), before); await f.value.controller.close();
  let clock = f.now() + 1000;
  const controller = await RunController.openValidationCase({ ...f, caseId: f.value.window.caseId, windowId: f.value.window.windowId, now: () => clock });
  try {
    assert.equal((await controller.validationAuthority(fixed.grants.coding.taskId, 'reviewer')).deadlineAt, f.value.window.deadlineAt);
    assert.equal((await controller.validationAuthority(fixed.grants.coding.taskId, 'reviewer')).requestsUsed, 80);
    clock = Date.parse(f.value.window.deadlineAt);
    await assert.rejects(controller.reserve(f.request('after-deadline')), /deadline|stopped|active/i);
  } finally { await controller.close(); }
  await assert.rejects(RunController.openValidationCase({ ...f, caseId: f.value.window.caseId, windowId: f.value.window.windowId, now: () => clock }), /deadline|stopped/i);
});

test('nongrouped C15 rechecks old delegation and supplement bytes before provider, host and child admission', async t => {
  const f = await opened(t), before = await f.value.controller.read();
  const sources = [before.validation!.cases.find(window => window.quote.declaration.formatVersion === 'validation-declaration-3')!.operatorDecision.source,
    before.allocationSupplementDecisions![0].operatorDecision.source];
  for (const [index, source] of sources.entries()) {
    const path = join(f.root, source.location), bytes = await readFile(path); await writeFile(path, Buffer.concat([bytes, Buffer.from('\n')]));
    try {
      await assert.rejects(f.dispatch(f.request(`source-${index}`), 1), /source|decision/i);
      await assert.rejects(f.value.controller.requireValidationHost(fixed.caseId, f.value.window.windowId, join(f.repositoryRoot, '.cosmos/e2e', fixed.caseId)), /source|decision/i);
      await assert.rejects(f.value.controller.prepareOwnedChild({ taskId: fixed.grants.coding.taskId, windowId: f.value.window.windowId }), /source|decision/i);
      assert.equal(f.transports(), 0); assert.deepEqual(await f.value.controller.read(), before);
    } finally { await writeFile(path, bytes); }
  }
  const inputPath = join(f.repositoryRoot, fixed.inputs.requirements.path), inputBytes = await readFile(inputPath);
  await writeFile(inputPath, Buffer.concat([inputBytes, Buffer.from('\n')]));
  try {
    await assert.rejects(f.dispatch(f.request('changed-input'), 1), /input.*changed/i);
    await assert.rejects(f.value.controller.requireValidationHost(fixed.caseId, f.value.window.windowId, join(f.repositoryRoot, '.cosmos/e2e', fixed.caseId)), /input.*changed/i);
    await assert.rejects(f.value.controller.prepareOwnedChild({ taskId: fixed.grants.coding.taskId, windowId: f.value.window.windowId }), /input.*changed/i);
    assert.equal(f.transports(), 0); assert.deepEqual(await f.value.controller.read(), before);
  } finally { await writeFile(inputPath, inputBytes); }
  await f.value.controller.close();
  const currentSource = join(f.root, f.value.decision.source.location), currentBytes = await readFile(currentSource);
  await writeFile(currentSource, Buffer.concat([currentBytes, Buffer.from('\n')]));
  await assert.rejects(RunController.openValidationCase({ ...f, caseId: fixed.caseId, windowId: f.value.window.windowId }), /source/i);
  await writeFile(currentSource, currentBytes);
  const controller = await RunController.openValidationCase({ ...f, caseId: fixed.caseId, windowId: f.value.window.windowId });
  try {
    assert.equal((await controller.validationAuthority(fixed.grants.coding.taskId, 'reviewer')).deadlineAt, f.value.window.deadlineAt);
    await controller.reserve(f.request('restored')); await controller.admit('restored'); await controller.settle('restored', 321, f.evidence);
  } finally { await controller.close(); }
});

test('stop retains admitted unknown reservation and C15 closure releases only its unused grants', async t => {
  const f = await opened(t), { controller } = f.value, request = f.request('unknown-review');
  await controller.reserve(request); await controller.admit(request.requestId); await controller.markUnknown(request.requestId, f.evidence);
  const unknown = await controller.read();
  await assert.rejects(f.dispatch(f.request('while-unknown'), 1), /admission|unknown/i); assert.equal(f.transports(), 0);
  assert.deepEqual(await controller.read(), unknown); await controller.stop('Synthetic stopped review.');
  let stopped = await controller.read(); assert.equal(stopped.ledger.entries.at(-1)!.unknown, true);
  assert.equal(stopped.ledger.entries.at(-1)!.reservedMicroCny, imageReserve);
  await assert.rejects(controller.reserve(f.request('after-stop')), /stopped|active|abort/i); await controller.close();
  await assert.rejects(RunController.openValidationCase({ ...f, caseId: fixed.caseId, windowId: f.value.window.windowId }), /stopped/i);
  await assert.rejects(prepareValidationAllocationClosure({ ...f, caseIds: [fixed.caseId] }), /unknown|reserved/i);
  const accountant = await RunController.openValidationCase({ ...f, caseId: fixed.caseId, windowId: f.value.window.windowId, accountingOnly: true });
  try { await accountant.settle(request.requestId, 12_345, f.evidence); } finally { await accountant.close(); }
  const quote = await prepareValidationAllocationClosure({ ...f, caseIds: [fixed.caseId] });
  assert.equal(quote.formatVersion, 'validation-allocation-closure-quote-3'); assert.equal(quote.releasedMicroCny, 21_000_000 - 12_345);
  assert.deepEqual(quote.basis.allocationDelegations, f.before.ledger.allocationDelegations); assert.deepEqual(quote.basis.allocationSupplements, f.before.ledger.allocationSupplements);
  const decision = { kind: 'operator_validation_allocation_closure' as const, decisionId: 'c15-closure', actorId: 'offline-reviewer', decidedAt: new Date(f.now()).toISOString(),
    source: { artifactId: 'closure', version: 'c15', location: 'c15-closure.json' }, sourceRefs: f.evidence };
  const saveDecision = async (value: typeof decision) => writeFile(join(f.root, value.source.location), JSON.stringify({ formatVersion: 'operator-validation-allocation-closure-decision-1',
    kind: value.kind, decisionId: value.decisionId, actorId: value.actorId, decidedAt: value.decidedAt, sourceRefs: value.sourceRefs, quote }), 'utf8');
  await saveDecision(decision);
  const receipt = await applyValidationAllocationClosure({ ...f, quote, decision });
  stopped = await f.snapshot();
  assert.equal(budgetCapacity(stopped.ledger).allocatedMicroCny, budgetCapacity(f.before.ledger).allocatedMicroCny + 12_345);
  assert.deepEqual(validationBudgetGroup(stopped.ledger), validationBudgetGroup(f.before.ledger));
  assert.deepEqual(stopped.ledger.allocationClosures!.slice(0, -5), f.before.ledger.allocationClosures);
  assert.deepEqual(stopped.allocationClosureDecisions!.slice(0, -1), f.before.allocationClosureDecisions);
  assert.deepEqual(stopped.ledger.allocationSupplements, f.before.ledger.allocationSupplements);
  const bytes = await readFile(join(f.root, 'snapshot.json'));
  assert.deepEqual(await applyValidationAllocationClosure({ ...f, quote, decision }), receipt);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), bytes);
  const other = { ...decision, decisionId: 'c15-second-closure', source: { ...decision.source, location: 'c15-second-closure.json' } }; await saveDecision(other);
  await assert.rejects(applyValidationAllocationClosure({ ...f, quote, decision: other }), /closed|stale/i);
});

test('fixed C15 refuses ledger4, active or unclosed C14, and other ledger5 nongrouped cases before writes', async t => {
  const old = await supplementFixture(t); await copyInputs(old.repositoryRoot); old.setCurrent(fixed);
  let before = await readFile(join(old.root, 'snapshot.json'));
  await assert.rejects(prepareValidationCase({ ...old, declaration: fixed }), /ledger5|C14/i); assert.deepEqual(await readFile(join(old.root, 'snapshot.json')), before);
  const f = await fixture(t, false);
  for (const stopped of [false, true]) {
    if (stopped) await f.c14.controller.stop('Stopped but unclosed.');
    before = await readFile(join(f.root, 'snapshot.json'));
    await assert.rejects(prepareValidationCase({ ...f, declaration: fixed }), /C14|closed/i); assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  }
  await f.close(f.c14); f.setCurrent(fixed);
  const other: ValidationDeclaration = await f.declaration('cos20-unrelated', false); f.setCurrent(other);
  before = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(prepareValidationCase({ ...f, declaration: other }), /grouped/i); assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
});

async function appendAllocation(f: Awaited<ReturnType<typeof fixture>>, amountMicroCny: number) {
  const store = await SnapshotStore.acquire(f.root);
  try {
    const previous = await store.read(); validateSnapshot(previous); const next = structuredClone(previous);
    next.ledger.allocations.push({ taskId: 'offline-capacity', amountMicroCny }); next.run.taskIds.push('offline-capacity'); next.revision++;
    assert.deepEqual(validateLedgerUpdate(previous.ledger, next.ledger, { role: 'system', actorId: 'offline' }), []);
    assert.deepEqual(validateRunUpdate(previous.run, next.run, { role: 'system', actorId: 'offline' }), []);
    validateSnapshot(next); await store.write(next);
  } finally { await store.close(); }
}

test('shared allocation capacity short by one and stale quote refuse a new C15 claim', async t => {
  const f = await fixture(t), state = await f.snapshot(), quote = await prepareValidationCase({ ...f, declaration: fixed });
  await appendAllocation(f, 150_000_000 - budgetCapacity(state.ledger).allocatedMicroCny - 21_000_000 + 1);
  const before = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(prepareValidationCase({ ...f, declaration: fixed }), /shared|unallocated/i);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  const stale = await fixture(t), staleQuote = await prepareValidationCase({ ...stale, declaration: fixed });
  await appendAllocation(stale, 1);
  const decision = { kind: 'operator_validation' as const, decisionId: 'stale-c15', actorId: 'offline', decidedAt: new Date(stale.now()).toISOString(),
    source: { artifactId: 'operator', version: 'stale', location: 'stale-c15.json' }, sourceRefs: stale.evidence };
  await writeFile(join(stale.root, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', kind: decision.kind,
    decisionId: decision.decisionId, actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote: staleQuote }), 'utf8');
  const staleBefore = await readFile(join(stale.root, 'snapshot.json'));
  await assert.rejects(RunController.claimValidationCase({ ...stale, quote: staleQuote, decision }), /stale/i);
  assert.deepEqual(await readFile(join(stale.root, 'snapshot.json')), staleBefore); assert.equal(quote.formatVersion, 'validation-case-quote-1');
});
