import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import { prepareValidationCase, validationInputHash } from '../../src/runtime/validation-window.ts';
import type { ValidationDeclaration } from '../../src/runtime/validation-types.ts';
import { requirement, task as taskFixture } from '../contracts/fixtures.ts';
import { createRoleBudget } from '../../src/roles/provider-budget.ts';
import type { TaskContract } from '../../src/contracts/index.ts';
import * as views from '../../src/runtime/execution-window.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import { requestStop } from '../../src/cli/control.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { validateValidationDeclaration } from '../../src/runtime/validation-validation.ts';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const start = Date.parse('2026-10-01T00:00:00.000Z');
const priorReceipt = [{ artifactId: 'prior-receipt', version: 'v1', location: 'prior-receipt.json' }];

async function fixture(t: test.TestContext, legacyRunning = false, envelope?: { formatVersion: ValidationDeclaration['formatVersion']; maxRequests: number }) {
  const base = await mkdtemp(join(tmpdir(), 'cosmos-validation-window-')), root = join(base, 'ledger'), repositoryRoot = join(base, 'platform');
  let clock = start;
  const now = () => clock;
  const old = await RunController.create({ root, runId: 'shared-validation', ledgerId: 'validation-ledger', kind: 'evaluation', scope: 'validation', specVersion: '1.0', durationMs: 1000,
    allocations: [{ taskId: 'legacy', amountMicroCny: 84_596_040 }], now });
  const legacy = taskFixture();
  Object.assign(legacy, { taskId: 'legacy', kind: 'evaluation', runId: 'shared-validation', specVersion: '1.0', dependsOn: [], state: 'cancelled', stateReason: 'Historical fixture cancellation', artifacts: [], evidence: [],
    attempts: [{ attemptId: 'old-attempt', sessionRef: 'old-session', startedAt: new Date(start).toISOString(), endedAt: new Date(start + 100).toISOString(), outcome: 'cancelled', failure: null }] });
  legacy.budget = { ledgerId: 'validation-ledger', allocationMicroCny: 84_596_040, originalDeadlineAt: (await old.read()).run.originalDeadlineAt };
  if (legacyRunning) { legacy.state = 'running'; Object.assign(legacy.attempts[0], { endedAt: null, outcome: 'running' }); }
  await old.saveTask(legacy as any, { role: 'system', actorId: 'fixture' });
  await old.importSettled({ requestId: 'historical-usage', taskId: 'legacy', provider: 'deepseek', pricingVersion: 'historical', actualCostMicroCny: 1_116_402, evidence: priorReceipt });
  const original = await old.read(); await old.close(); clock += 2000;
  await mkdir(join(repositoryRoot, 'template'), { recursive: true });
  const requirements = JSON.stringify({ specVersion: '1.0', requirementVersion: 'fixture-v1', acceptanceIds: ['game-1'], stageAcceptanceIds: ['design-1', 'media-1'], rule: '保留原验收' });
  const template = '{"fixture":true}\n';
  await writeFile(join(repositoryRoot, 'requirements.json'), requirements, 'utf8'); await writeFile(join(repositoryRoot, 'template/package.json'), template, 'utf8');
  const files = [{ path: 'template/package.json', sha256: hash(template) }], caseId = 'cos20-native-validation-1';
  const declaration: ValidationDeclaration = {
    formatVersion: 'validation-declaration-1', profile: 'operator_validation', caseId, sourceModel: 'deepseek-flash',
    limits: { lifetimeMicroCny: 150_000_000, cumulativeMicroCny: 30_000_000, incrementalMicroCny: 5_000_000, durationMs: 2_700_000, maxRequests: 40, maxRepairTasks: 1, maxTaskAttempts: 2, reviewProtocolCorrections: 1 },
    grants: Object.fromEntries(Object.entries({ planning: 2_000_000, design: 1_900_000, art: 5_700_000, coding: 7_600_000, repair: 3_800_000 }).map(([role, amountMicroCny]) => [role, { taskId: `${caseId}-${role}`, amountMicroCny }])) as ValidationDeclaration['grants'],
    outputTokens: { planning: 4096, design: 16384, art: 65536, coding: 65536, reviewer: 16384 },
    inputs: { requirements: { version: 'fixture-v1', path: 'requirements.json', sha256: hash(requirements) }, template: { sha256: hash(JSON.stringify(files)), files } },
  };
  if (envelope) { Object.assign(declaration, { formatVersion: envelope.formatVersion }); Object.assign(declaration.limits, { maxRequests: envelope.maxRequests }); }
  let identity = { reviewedPlatformSha: 'a'.repeat(40), frozenCaseInputHash: validationInputHash(declaration) };
  const context = { root, repositoryRoot, identityReader: async (_signal: AbortSignal) => ({ ...identity }), now };
  const quote = await prepareValidationCase({ ...context, declaration });
  const decision = { kind: 'operator_validation' as const, decisionId: 'operator-1', actorId: 'offline-coordinator', decidedAt: new Date(now()).toISOString(),
    source: { artifactId: 'operator-validation-decision', version: 'v1', location: 'operator.json' }, sourceRefs: [{ artifactId: 'authorization', version: 'v1', location: 'offline-user-source' }] };
  await writeFile(join(root, decision.source.location), JSON.stringify({ formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId: decision.decisionId,
    actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }), 'utf8');
  const controllers: RunController[] = [];
  t.after(async () => { for (const controller of controllers) await controller.close().catch(() => {}); await rm(base, { recursive: true, force: true }); });
  return { ...context, original, old, declaration, quote, decision, track: (controller: RunController) => { controllers.push(controller); return controller; }, advance: (ms: number) => { clock += ms; }, changeIdentity: () => { identity = { ...identity, reviewedPlatformSha: 'b'.repeat(40) }; } };
}

function roleTask(f: Awaited<ReturnType<typeof opened>>, role: 'design' | 'art' | 'coding'): TaskContract {
  const task = taskFixture(), grant = f.declaration.grants[role];
  Object.assign(task, { taskId: grant.taskId, kind: 'evaluation', runId: f.original.run.runId, specVersion: f.original.run.specVersion,
    authorId: `${role}-author`, dependsOn: [], state: 'not_started', attempts: [], evidence: [], artifacts: [],
    acceptanceIds: [role === 'design' ? 'design-1' : role === 'art' ? 'media-1' : 'game-1'] });
  task.acceptance[0].acceptanceId = task.acceptanceIds[0]; task.context.contextId = `${role}-context`;
  task.budget = { ledgerId: f.original.ledger.ledgerId, allocationMicroCny: grant.amountMicroCny, originalDeadlineAt: f.original.run.originalDeadlineAt };
  return task as TaskContract;
}

test('known reservations in the current case coexist and are admitted independently', async t => {
  const f = await opened(t);
  await Promise.all([f.controller.reserve(f.request('one')), f.controller.reserve(f.request('two'))]);
  await Promise.all([f.controller.admit('one'), f.controller.admit('two')]);
  const state = await f.controller.read(); assert.equal(state.run.fees.reservedMicroCny, 16);
  assert.equal((await f.controller.validationAuthority(f.declaration.grants.planning.taskId, 'planning')).requestsUsed, 2);
});

test('a closed owner permits a new independent case while preserving an old running attempt fact', async t => {
  const f = await fixture(t, true), window = await RunController.claimValidationCase(f);
  const controller = f.track(await RunController.openValidationCase({ ...f, caseId: window.caseId, windowId: window.windowId }));
  assert.deepEqual((await controller.read()).tasks, f.original.tasks);
  await assert.rejects(controller.validationAuthority('legacy', 'author'), /grant|purpose|planning/i);
});

test('65k author caps use the actual reservation and concurrent role grants cannot oversell the 5 yuan case', async t => {
  const f = await opened(t), art = roleTask(f, 'art'), coding = roleTask(f, 'coding');
  await f.controller.registerTasks([art, coding]);
  const request = (id: string, task: TaskContract, tokens: number, reserve: number) => ({ ...f.request(id, tokens, reserve), taskId: task.taskId,
    validation: { ...f.request(id).validation, purpose: 'author' as const, maxOutputTokens: tokens } });
  await assert.rejects(f.controller.reserve(request('underquoted', art, 65536, 16384 * 8)), /reservation/i);
  await assert.rejects(f.controller.reserve(request('overcap', art, 65537, 65537 * 8)), /output|cap/i);
  await f.controller.reserve(request('fullcap', art, 65536, 65536 * 8)); await f.controller.cancel('fullcap', priorReceipt);
  const results = await Promise.allSettled([f.controller.reserve(request('art', art, 1, 3_000_000)), f.controller.reserve(request('coding', coding, 1, 3_000_000))]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal((await f.controller.read()).run.fees.reservedMicroCny, 3_000_000);
});

async function opened(t: test.TestContext, envelope?: { formatVersion: ValidationDeclaration['formatVersion']; maxRequests: number }) {
  const f = await fixture(t, false, envelope), window = await RunController.claimValidationCase(f);
  const controller = f.track(await RunController.openValidationCase({ ...f, caseId: window.caseId, windowId: window.windowId }));
  const request = (requestId: string, maxOutputTokens = 1, estimatedMaxCostMicroCny = maxOutputTokens * 8) => ({ requestId, taskId: f.declaration.grants.planning.taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny,
    validation: { caseId: window.caseId, windowId: window.windowId, purpose: 'planning' as const, modelId: 'deepseek-flash' as const, maxOutputTokens, inputBytes: 0, hasImages: false } });
  return { ...f, window, controller, request };
}

test('operator claim preserves the shared validation history and fixes one independent case clock', async t => {
  const f = await fixture(t), window = await RunController.claimValidationCase(f);
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.formatVersion, 3); assert.equal(state.validation.profile, 'operator_validation');
  assert.equal(state.run.runId, f.original.run.runId); assert.equal(state.ledger.ledgerId, f.original.ledger.ledgerId);
  assert.equal(state.ledger.contractVersion, '1.0.0'); assert.equal(state.ledger.limitMicroCny, 150_000_000);
  assert.deepEqual(state.ledger.entries, f.original.ledger.entries); assert.deepEqual(state.ledger.allocations.slice(0, 1), f.original.ledger.allocations);
  assert.deepEqual(state.requests, f.original.requests); assert.deepEqual(state.tasks, f.original.tasks); assert.deepEqual(state.run.humanDecisions, []);
  assert.deepEqual(state.events.slice(0, f.original.events.length), f.original.events);
  assert.equal(state.run.originalStartedAt, f.original.run.originalStartedAt); assert.equal(state.run.originalDeadlineAt, f.original.run.originalDeadlineAt);
  assert.equal(state.stopReason.code, 'deadline'); assert.equal(state.stopReason.at, new Date(f.now()).toISOString());
  assert.equal(window.deadlineAt, new Date(f.now() + 2_700_000).toISOString());
  const before = await readFile(join(f.root, 'snapshot.json')); f.advance(1000);
  assert.deepEqual(await RunController.claimValidationCase(f), window); assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  assert.equal(f.old.signal.aborted, true);
  await assert.rejects(RunController.open({ root: f.root, windowId: window.windowId, now: f.now }), /validation|profile/i);
});

test('changed identity or exact quote rejects before claiming a new case or changing old history', async t => {
  const f = await fixture(t), before = await readFile(join(f.root, 'snapshot.json'));
  f.changeIdentity();
  await assert.rejects(RunController.claimValidationCase(f), /identity|platform|changed|stale/i);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
});

test('explicit planning purpose bills the one ledger without inventing a task or allowing legacy SDK admission', async t => {
  const f = await opened(t);
  const authority = await f.controller.validationAuthority(f.declaration.grants.planning.taskId, 'planning');
  assert.equal(authority.windowId, f.window.windowId); assert.equal(authority.maxOutputTokens, 4096); assert.equal(authority.admissionAllowed, true);
  await assert.rejects(f.controller.executionAuthority(f.declaration.grants.planning.taskId), /validation|profile/i);
  const oldBudget = createRoleBudget({ controller: f.controller, taskId: f.declaration.grants.planning.taskId, evidenceDirectory: join(f.root, 'receipts') });
  await assert.rejects(oldBudget.beforeRequest({ requestId: 'legacy-sdk', modelId: 'deepseek-flash', inputBytes: 0, hasImages: false, maxOutputTokens: 1, estimatedMaxCostMicroCny: 8 }), /validation|metadata|profile/i);
  await f.controller.reserve(f.request('planning')); await f.controller.admit('planning'); await f.controller.settle('planning', 4, priorReceipt);
  const state = await f.controller.read();
  assert.equal(state.tasks.length, f.original.tasks.length); assert.deepEqual(state.tasks, f.original.tasks);
  assert.equal(state.run.fees.settledMicroCny, 1_116_406); assert.deepEqual(state.run.humanDecisions, []);
  assert.equal(state.requests.at(-1)?.validation?.caseId, f.window.caseId);
  assert.equal((await f.controller.validationAuthority(f.declaration.grants.planning.taskId, 'planning')).requestsUsed, 1);
});

test('every accepted SDK request consumes the case count even when cancelled or settled at zero', async t => {
  const f = await opened(t);
  for (let index = 0; index < 40; index++) {
    const id = `request-${index}`; await f.controller.reserve(f.request(id));
    if (index % 2) await f.controller.cancel(id, priorReceipt);
    else { await f.controller.admit(id); await f.controller.settle(id, 0, priorReceipt); }
  }
  const before = await f.controller.read(); await assert.rejects(f.controller.reserve(f.request('forty-one')), /request|ceiling|limit/i);
  assert.deepEqual(await f.controller.read(), before);
  const authority = await f.controller.validationAuthority(f.declaration.grants.planning.taskId, 'planning');
  assert.equal(authority.requestsUsed, 40); assert.equal(authority.requestsRemaining, 0); assert.equal(authority.admissionAllowed, false);
});

test('declaration versions retain v1 forty and allow only v2 up to eighty requests', async t => {
  const f = await fixture(t), changed = (formatVersion: string, maxRequests: number) => ({ ...structuredClone(f.declaration), formatVersion,
    limits: { ...f.declaration.limits, maxRequests } });
  assert.doesNotThrow(() => validateValidationDeclaration(changed('validation-declaration-1', 40)));
  for (const maxRequests of [41, 80]) assert.throws(() => validateValidationDeclaration(changed('validation-declaration-1', maxRequests)), /limits|authorization/i);
  assert.doesNotThrow(() => validateValidationDeclaration(changed('validation-declaration-2', 80)));
  assert.throws(() => validateValidationDeclaration(changed('validation-declaration-2', 81)), /limits|authorization/i);
  assert.throws(() => validateValidationDeclaration(changed('validation-declaration-3', 40)), /unsupported/i);
  for (const limits of [{ incrementalMicroCny: 5_000_001 }, { cumulativeMicroCny: 30_000_001 }, { lifetimeMicroCny: 150_000_001 },
    { durationMs: 2_700_001 }, { maxRepairTasks: 2 }]) {
    const value = changed('validation-declaration-2', 80); Object.assign(value.limits, limits);
    assert.throws(() => validateValidationDeclaration(value), /limits|authorization/i);
  }
});

test('v2 actual SDK admission counts eighty requests including cancellations and rejects eighty-one', async t => {
  const f = await opened(t, { formatVersion: 'validation-declaration-2', maxRequests: 80 });
  const budget = createRoleBudget({ controller: f.controller, taskId: f.declaration.grants.planning.taskId, evidenceDirectory: join(f.root, 'receipts'),
    validation: { caseId: f.window.caseId, windowId: f.window.windowId, purpose: 'planning' } });
  for (let index = 0; index < 80; index++) {
    const requestId = `v2-request-${index}`;
    await budget.beforeRequest({ requestId, modelId: 'deepseek-flash', inputBytes: 0, hasImages: false, maxOutputTokens: 1, estimatedMaxCostMicroCny: 8 });
    await budget.afterResponse(index % 2 ? { requestId, outcome: 'not_sent', elapsedMs: 1 } : { requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
  }
  const before = await f.controller.read();
  await assert.rejects(budget.beforeRequest({ requestId: 'v2-eighty-one', modelId: 'deepseek-flash', inputBytes: 0, hasImages: false, maxOutputTokens: 1, estimatedMaxCostMicroCny: 8 }), /request|ceiling|limit/i);
  assert.deepEqual(await f.controller.read(), before);
  const authority = await f.controller.validationAuthority(f.declaration.grants.planning.taskId, 'planning');
  assert.equal(authority.requestsUsed, 80); assert.equal(authority.requestsRemaining, 0); assert.equal(authority.admissionAllowed, false);
});

test('v2 SDK requests still obey role output caps, the shared five yuan exposure and deadline', async t => {
  const f = await opened(t, { formatVersion: 'validation-declaration-2', maxRequests: 80 }), art = roleTask(f, 'art'), coding = roleTask(f, 'coding');
  await f.controller.registerTasks([art, coding]);
  const budget = (task: TaskContract) => createRoleBudget({ controller: f.controller, taskId: task.taskId, evidenceDirectory: join(f.root, `receipts-${task.taskId}`),
    validation: { caseId: f.window.caseId, windowId: f.window.windowId, purpose: 'author' } });
  const artBudget = budget(art), codingBudget = budget(coding), request = (requestId: string, inputBytes: number, maxOutputTokens = 1) => ({ requestId, inputBytes, maxOutputTokens,
    modelId: 'deepseek-flash' as const, hasImages: false, estimatedMaxCostMicroCny: inputBytes * 2 + maxOutputTokens * 8 });
  await assert.rejects(artBudget.beforeRequest(request('v2-overcap', 0, 65537)), /output|cap/i);
  await artBudget.beforeRequest(request('v2-art-exposure', 1_499_996));
  const before = await f.controller.read();
  await assert.rejects(codingBudget.beforeRequest(request('v2-coding-exposure', 1_499_996)), /budget|limit|exposure/i);
  assert.deepEqual(await f.controller.read(), before);
  await artBudget.afterResponse({ requestId: 'v2-art-exposure', outcome: 'not_sent', elapsedMs: 1 });
  f.advance(2_700_000);
  await assert.rejects(codingBudget.beforeRequest(request('v2-expired', 0)), /deadline|expired|stopped/i);
  assert.equal((await f.controller.read()).requests.length, before.requests.length);
});

test('wrong case/purpose/model, unknown charges and changed source refuse new admission without new requests', async t => {
  const f = await opened(t), before = await f.controller.read();
  for (const change of [{ caseId: 'cos10-reviewed-validation-1' }, { windowId: 'wrong' }, { purpose: 'author' }, { modelId: 'other-model' }]) {
    const request = f.request('wrong'); Object.assign(request.validation, change);
    await assert.rejects(f.controller.reserve(request), /case|window|purpose|model|planning/i);
  }
  assert.deepEqual(await f.controller.read(), before);
  await f.controller.reserve(f.request('sent')); await f.controller.admit('sent'); await f.controller.markUnknown('sent', priorReceipt);
  await assert.rejects(f.controller.reserve(f.request('blind-retry')), /reconcil|unknown|reserved/i);
  await f.controller.settle('sent', 4, priorReceipt);
  const reconciled = await f.controller.read(); f.changeIdentity();
  await assert.rejects(f.controller.reserve(f.request('changed-code')), /identity|platform|changed/i);
  assert.deepEqual(await f.controller.read(), reconciled);
});

test('expired case reopens only for accounting and cannot create new task, request or child work', async t => {
  const f = await opened(t); await f.controller.reserve(f.request('pending')); await f.controller.admit('pending'); await f.controller.close(); f.advance(2_700_000);
  await assert.rejects(RunController.openValidationCase({ ...f, caseId: f.window.caseId, windowId: f.window.windowId }), /deadline|expired/i);
  const accounting = f.track(await RunController.openValidationCase({ ...f, caseId: f.window.caseId, windowId: f.window.windowId, accountingOnly: true }));
  assert.equal(accounting.signal.aborted, true);
  assert.throws(() => accounting.requireValidationCase(f.window.caseId, f.window.windowId), /accounting|stopped/i);
  await accounting.settle('pending', 4, priorReceipt);
  const before = await accounting.read();
  await assert.rejects(accounting.reserve(f.request('not-paid')), /accounting|stopped/i);
  await assert.rejects(accounting.admit('pending'), /accounting|stopped/i);
  await assert.rejects(accounting.registerTasks([]), /accounting|stopped/i);
  await assert.rejects(accounting.prepareOwnedChild({ taskId: f.declaration.grants.planning.taskId, windowId: f.window.windowId }), /accounting|stopped/i);
  assert.deepEqual(await accounting.read(), before); assert.equal(before.run.fees.settledMicroCny, 1_116_406);
  assert.equal(before.validation?.cases[0].deadlineAt, f.window.deadlineAt); assert.equal(before.validation?.cases[0].stopReason?.code, 'deadline');
});

test('legacy planner, control and display reject the validation profile before side effects', async t => {
  const f = await opened(t), before = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(planTaskDag({ controller: f.controller, requirement: requirement() } as any), /legacy|validation|profile|unsupported/i);
  await assert.rejects(requestStop(f.root), /validation|profile/i);
  const snapshot = await f.controller.read();
  assert.throws(() => views.executionWindowView(snapshot), /validation|profile/i);
  assert.throws(() => views.taskWindowBinding(snapshot, f.declaration.grants.art.taskId), /validation|profile/i);
  const view = views.validationCaseView(snapshot);
  assert.equal(view.original.originalDeadlineAt, f.original.run.originalDeadlineAt);
  assert.equal(view.validationCase.windowId, f.window.windowId);
  assert.equal(view.validationCase.deadlineAt, f.window.deadlineAt);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
});

test('one semantic repair claim binds a failed case source and preserves its fixed feedback and attempt', async t => {
  const f = await opened(t), task = roleTask(f, 'coding'), actor = { role: 'system' as const, actorId: 'fixture' };
  const feedback = { artifactId: 'failure-feedback', version: 'coding-attempt', location: 'feedback/coding.json' };
  await f.controller.registerTasks([task]);
  await assert.rejects(f.controller.claimValidationRepair({ sourceTaskId: task.taskId, feedback }), /failed|review|attempt/i);
  task.state = 'ready'; await f.controller.saveTask(task, actor);
  task.state = 'running'; task.attempts = [{ attemptId: feedback.version, sessionRef: 'sessions/coding', startedAt: new Date(f.now()).toISOString(), endedAt: null, outcome: 'running', failure: null }];
  await f.controller.saveTask(task, actor);
  await assert.rejects(f.controller.claimValidationRepair({ sourceTaskId: task.taskId, feedback }), /failed|review|attempt/i);
  task.state = 'failed'; task.stateReason = '模拟构建失败'; task.attempts[0].endedAt = new Date(f.now()).toISOString(); task.attempts[0].outcome = 'failed';
  task.attempts[0].failure = { classification: 'code_defect', summary: '模拟失败', reproduction: ['fixture'], actual: 'failed', expected: 'passed', evidenceRefs: [feedback.location] };
  await f.controller.saveTask(task, actor);
  await assert.rejects(f.controller.claimValidationRepair({ sourceTaskId: task.taskId, feedback: { ...feedback, location: 'unrelated.json' } }), /feedback/i);
  const claim = await f.controller.claimValidationRepair({ sourceTaskId: task.taskId, feedback }), before = await f.controller.read();
  assert.equal(claim.taskId, f.declaration.grants.repair.taskId);
  assert.deepEqual(await f.controller.claimValidationRepair({ sourceTaskId: task.taskId, feedback }), claim);
  assert.deepEqual(await f.controller.read(), before);
  await assert.rejects(f.controller.claimValidationRepair({ sourceTaskId: f.declaration.grants.art.taskId, feedback }), /claim|source|repair/i);
  const repair = roleTask(f, 'coding'); repair.taskId = claim.taskId; repair.authorId = 'repair-author'; repair.context.contextId = 'repair-context';
  repair.budget.allocationMicroCny = f.declaration.grants.repair.amountMicroCny;
  await f.controller.registerTasks([repair]);
  assert.equal((await f.controller.validationAuthority(repair.taskId, 'author')).maxOutputTokens, 65536);
  assert.deepEqual((await f.controller.read()).tasks.find(item => item.taskId === task.taskId), task);
});

test('a finished author attempt cannot be relabelled running or borrow author admission again', async t => {
  const f = await opened(t), task = roleTask(f, 'art'), actor = { role: 'system' as const, actorId: 'fixture' };
  await f.controller.registerTasks([task]); task.state = 'ready'; await f.controller.saveTask(task, actor);
  task.state = 'running'; task.attempts = [{ attemptId: 'art-once', sessionRef: 'sessions/art', startedAt: new Date(f.now()).toISOString(), endedAt: new Date(f.now()).toISOString(), outcome: 'passed', failure: null }];
  await assert.rejects(f.controller.saveTask(task, actor), /attempt|closed|finished/i);
  task.attempts[0].endedAt = null; task.attempts[0].outcome = 'running'; await f.controller.saveTask(task, actor);
  task.state = 'awaiting_review'; task.attempts[0].endedAt = new Date(f.now()).toISOString(); task.attempts[0].outcome = 'passed'; await f.controller.saveTask(task, actor);
  const request = { ...f.request('extra-author'), taskId: task.taskId, validation: { ...f.request('extra-author').validation, purpose: 'author' as const } };
  const before = await f.controller.read(); await assert.rejects(f.controller.reserve(request), /attempt|author|purpose|admission/i);
  assert.deepEqual(await f.controller.read(), before);
});

test('bounded deferred identity checks refuse changed code, deadline expiry and manual stop before reserving', async t => {
  for (const cause of ['changed', 'deadline', 'stop', 'timeout'] as const) {
    await t.test(cause, async sub => {
      const f = await fixture(sub), window = await RunController.claimValidationCase(f);
      let pending = false, resolve!: (identity: typeof f.quote.identity) => void, entered!: () => void;
      const started = new Promise<void>(done => { entered = done; }); let readerSignal: AbortSignal | undefined;
      const identityReader = async (signal: AbortSignal) => { if (!pending) return f.quote.identity; readerSignal = signal; entered(); return new Promise<typeof f.quote.identity>(done => { resolve = done; }); };
      const controller = f.track(await RunController.openValidationCase({ ...f, caseId: window.caseId, windowId: window.windowId, identityReader, identityTimeoutMs: cause === 'timeout' ? 30 : 1000 }));
      pending = true;
      const request = { requestId: cause, taskId: f.declaration.grants.planning.taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: 8,
        validation: { caseId: window.caseId, windowId: window.windowId, purpose: 'planning' as const, modelId: 'deepseek-flash' as const, maxOutputTokens: 1, inputBytes: 0, hasImages: false } };
      const refused = assert.rejects(controller.reserve(request), /changed|deadline|stop|timed out/i); await started;
      if (cause === 'changed') resolve({ ...f.quote.identity, reviewedPlatformSha: 'b'.repeat(40) });
      if (cause === 'deadline') { f.advance(2_700_000); resolve(f.quote.identity); }
      if (cause === 'stop') await controller.stop('operator stop during identity check');
      await refused; assert.equal(readerSignal?.aborted, true);
      assert.equal((await controller.read()).ledger.entries.length, f.original.ledger.entries.length);
      if (cause === 'deadline' || cause === 'stop') assert.equal(controller.signal.aborted, true);
      resolve(f.quote.identity); // Late reader completion cannot append a reservation.
      assert.equal((await controller.read()).requests.length, f.original.requests.length);
    });
  }
});

test('claim rejects stale bytes, forged decision, changed input and old case names without ledger writes', async t => {
  for (const cause of ['stale', 'decision', 'input', 'legacy-id'] as const) await t.test(cause, async sub => {
    const f = await fixture(sub);
    if (cause === 'stale') await writeFile(join(f.root, 'snapshot.json'), (await readFile(join(f.root, 'snapshot.json'), 'utf8')) + '\n', 'utf8');
    if (cause === 'decision') f.decision.actorId = 'different-operator';
    if (cause === 'input') await writeFile(join(f.repositoryRoot, 'requirements.json'), '{}', 'utf8');
    if (cause === 'legacy-id') (f.quote.declaration as any).caseId = 'cos10-reviewed-validation-1';
    const before = await readFile(join(f.root, 'snapshot.json'));
    await assert.rejects(RunController.claimValidationCase(f), /stale|source|changed|identity/i);
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  });
});

test('claim has one exclusive writer and rejects existing controller or registry ownership', async t => {
  const f = await fixture(t), before = await readFile(join(f.root, 'snapshot.json'));
  const owner = await SnapshotStore.acquire(f.root);
  try { await assert.rejects(RunController.claimValidationCase(f), /owner|lock/i); }
  finally { await owner.close(); }
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  await mkdir(join(f.root, 'registry')); await writeFile(join(f.root, 'registry/.commit.lock'), 'fixture owner', 'utf8');
  await assert.rejects(RunController.claimValidationCase(f), /registry|writer|lock/i);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  await rm(join(f.root, 'registry/.commit.lock'));
  const claims = await Promise.allSettled([RunController.claimValidationCase(f), RunController.claimValidationCase(f)]);
  assert.equal(claims.filter(item => item.status === 'fulfilled').length, 1);
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.validation.cases.length, 1); assert.equal(state.ledger.allocations.length, f.original.ledger.allocations.length + 5);
});

test('unresolved old spawn intent and historical reserved or unknown charges block claim without changes', async t => {
  const f = await fixture(t), owner = await SnapshotStore.acquire(f.root);
  await owner.prepareOwnedChild(); await assert.rejects(owner.close(), /spawn|intent/i);
  const original = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(RunController.claimValidationCase(f), /owner|lock/i);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), original);
  for (const unknown of [false, true]) {
    const root = join(f.root, unknown ? 'unknown' : 'reserved');
    const controller = f.track(await RunController.create({ root, runId: f.original.run.runId, ledgerId: f.original.ledger.ledgerId, kind: 'evaluation', scope: 'validation', specVersion: '1.0', durationMs: 1000,
      allocations: [{ taskId: 'legacy', amountMicroCny: 100 }], now: f.now }));
    await controller.reserve({ requestId: 'old-pending', taskId: 'legacy', provider: 'fixture', pricingVersion: 'v1', estimatedMaxCostMicroCny: 10 });
    if (unknown) { await controller.admit('old-pending'); await controller.markUnknown('old-pending', priorReceipt); }
    await controller.close(); f.advance(1001);
    await writeFile(join(root, f.decision.source.location), await readFile(join(f.root, f.decision.source.location)));
    const before = await readFile(join(root, 'snapshot.json'));
    await assert.rejects(RunController.claimValidationCase({ ...f, root }), /unknown|reserved|reconcil/i);
    assert.deepEqual(await readFile(join(root, 'snapshot.json')), before);
  }
});

test('wrong window or changed source cannot reopen and planning grants cannot register arbitrary task work', async t => {
  const f = await opened(t), before = await f.controller.read(), task = roleTask(f, 'design');
  task.taskId = f.declaration.grants.planning.taskId; task.budget.allocationMicroCny = f.declaration.grants.planning.amountMicroCny;
  await assert.rejects(f.controller.registerTasks([task]), /planning|purpose/i);
  await assert.rejects(f.controller.prepareOwnedChild({ taskId: 'legacy', windowId: f.window.windowId }), /grant|purpose|planning/i);
  assert.deepEqual(await f.controller.read(), before);
  await f.controller.close(); const bytes = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(RunController.openValidationCase({ ...f, caseId: f.window.caseId, windowId: 'wrong' }), /window/i);
  f.changeIdentity(); await assert.rejects(RunController.openValidationCase({ ...f, caseId: f.window.caseId, windowId: f.window.windowId }), /identity|platform|changed/i);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), bytes);
});

test('unknown billing prevents new owned child dispatch while retaining its registered task', async t => {
  const f = await opened(t), task = roleTask(f, 'art'); await f.controller.registerTasks([task]);
  await f.controller.reserve(f.request('unknown-child')); await f.controller.admit('unknown-child'); await f.controller.markUnknown('unknown-child', priorReceipt);
  const before = await readFile(join(f.root, '.controller.lock'));
  await assert.rejects(f.controller.prepareOwnedChild({ taskId: task.taskId, windowId: f.window.windowId }), /unknown|reconcil/i);
  await assert.rejects(f.controller.prepareOwnedChild({ taskId: f.declaration.grants.planning.taskId, windowId: f.window.windowId }), /unknown|reconcil/i);
  assert.deepEqual(await readFile(join(f.root, '.controller.lock')), before);
});

test('planning child ticket uses its declared grant without author task or wider task authority', async t => {
  const f = await opened(t), before = await f.controller.read(), owner = await readFile(join(f.root, '.controller.lock'));
  for (const taskId of ['legacy', 'unknown', f.declaration.grants.art.taskId]) {
    await assert.rejects(f.controller.prepareOwnedChild({ taskId, windowId: f.window.windowId }), /grant|purpose|planning|authority/i);
  }
  await assert.rejects(f.controller.prepareOwnedChild({ taskId: f.declaration.grants.planning.taskId, windowId: 'wrong' }), /window/i);
  assert.deepEqual(await readFile(join(f.root, '.controller.lock')), owner);
  const ticket = await f.controller.prepareOwnedChild({ taskId: f.declaration.grants.planning.taskId, windowId: f.window.windowId });
  assert.deepEqual(JSON.parse(await readFile(join(f.root, '.controller.lock'), 'utf8')).children, [{ ticket, pid: null }]);
  assert.deepEqual(await f.controller.read(), before);
  await assert.rejects(f.controller.close(), /spawn|intent/i);
});

test('planning child registers a bounded real Node process and closes its original owner after exit', async t => {
  const f = await opened(t), before = await f.controller.read();
  const ticket = await f.controller.prepareOwnedChild({ taskId: f.declaration.grants.planning.taskId, windowId: f.window.windowId });
  const child = spawn(process.execPath, ['-e', "process.stdin.once('data',()=>process.exit(0));process.stdin.resume();"],
    { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true, env: { SYSTEMROOT: process.env.SYSTEMROOT } });
  const exit = once(child, 'close'), timer = setTimeout(() => { child.kill(); }, 10_000);
  try {
    await f.controller.registerOwnedChild(child.pid!, ticket);
    assert.deepEqual(JSON.parse(await readFile(join(f.root, '.controller.lock'), 'utf8')).children, [{ ticket, pid: child.pid }]);
    child.stdin!.end('exit'); assert.equal((await exit)[0], 0);
    assert.throws(() => process.kill(child.pid!, 0), { code: 'ESRCH' });
    assert.deepEqual(await f.controller.read(), before);
    await f.controller.close();
    await assert.rejects(readFile(join(f.root, '.controller.lock')), { code: 'ENOENT' });
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await exit; }
  }
});

test('identity is rechecked at dispatch and the 5 yuan case cap retains truthful overcharge facts', async t => {
  const f = await opened(t); await f.controller.reserve(f.request('first'));
  const before = await f.controller.read(); f.changeIdentity();
  await assert.rejects(f.controller.admit('first'), /identity|platform|changed/i);
  assert.deepEqual(await f.controller.read(), before);
  await f.controller.cancel('first', priorReceipt);
  const g = await opened(t); await g.controller.reserve(g.request('overrun')); await g.controller.admit('overrun');
  assert.deepEqual(await g.controller.settle('overrun', 5_000_001, priorReceipt), { halted: true });
  const after = await g.controller.read();
  assert.equal(after.validation?.cases[0].stopReason?.code, 'charge_overrun'); assert.equal(g.controller.signal.aborted, true);
  assert.equal(after.run.fees.settledMicroCny, 6_116_403); assert.deepEqual(after.ledger.entries[0], g.original.ledger.entries[0]);
  assert.equal(after.stopReason?.code, 'deadline');
});

for (const boundary of ['before', 'after'] as const) test(`bounded process crash ${boundary} claim keeps one atomic case consumption and clock`, async t => {
  const f = await fixture(t), before = await readFile(join(f.root, 'snapshot.json'));
  const args = { root: f.root, repositoryRoot: f.repositoryRoot, quote: f.quote, decision: f.decision, clock: f.now() };
  const source = `import {RunController} from ${JSON.stringify(new URL('../../src/runtime/run.ts', import.meta.url).href)};
import {SnapshotStore} from ${JSON.stringify(new URL('../../src/runtime/store.ts', import.meta.url).href)};
const options=JSON.parse(process.argv[1]);options.now=()=>options.clock;options.identityReader=async()=>options.quote.identity;
const original=SnapshotStore.prototype.write;
SnapshotStore.prototype.write=async function(value){if(process.argv[2]==='before')process.exit(71);await original.call(this,value);process.exit(71);};
await RunController.claimValidationCase(options);`;
  const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source, JSON.stringify(args), boundary],
    { stdio: 'ignore', windowsHide: true, env: { SYSTEMROOT: process.env.SYSTEMROOT } });
  const exit = once(child, 'close'), timer = setTimeout(() => { child.kill(); }, 10_000);
  try { assert.equal((await exit)[0], 71); } finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) { child.kill(); await exit; } }
  const crashedBytes = await readFile(join(f.root, 'snapshot.json'));
  if (boundary === 'before') assert.deepEqual(crashedBytes, before);
  else assert.equal(JSON.parse(crashedBytes.toString('utf8')).validation.cases.length, 1);
  await SnapshotStore.recover(f.root); f.advance(1000);
  const window = await RunController.claimValidationCase(f), state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.validation.cases.length, 1); assert.equal(state.ledger.entries.length, f.original.ledger.entries.length);
  assert.equal(window.startedAt, new Date(boundary === 'before' ? f.now() : args.clock).toISOString());
  assert.equal(window.deadlineAt, new Date(Date.parse(window.startedAt) + f.declaration.limits.durationMs).toISOString());
  if (boundary === 'after') assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), crashedBytes);
});
