import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { planTaskDag } from '../../src/roles/planner.ts';
import { executeTaskDag, resumeTaskDag } from '../../src/runtime/orchestrator.ts';
import { createRoleBudget } from '../../src/roles/provider-budget.ts';
import { withDagOwner } from '../../src/runtime/scheduler/index.ts';
import { requirement as humanRequirement } from '../contracts/fixtures.ts';
import { RecoveryBlocked } from '../../src/runtime/recovery/task-journal.ts';
import { validationRoutingFixture } from './validation-routing.fixture.ts';

test('native planning and the original serial DAG use explicit validation scope and actual SDK request caps', async t => {
  const f = await validationRoutingFixture(t), planned = await planTaskDag(f.planning as any);
  assert.equal((await f.controller.read()).tasks.length, 0, 'Planning does not manufacture a passed TaskContract');
  const options = { controller: f.controller, validation: f.binding, requirement: f.requirement, tasks: planned.tasks, sessionRoot: f.planning.sessionRoot,
    availableArtifacts: [f.source], roleFactory: f.roleFactory, capture: f.capture, verify: f.verify, recovery: f.recovery, reviewProtocolCorrections: 1 as const };
  const tasks = await executeTaskDag(options as any); assert.deepEqual(tasks.map(task => task.state), ['passed', 'passed', 'passed']);
  const state = await f.controller.read(); assert.equal(state.requests.length - f.original.requests.length, 8); assert.equal(state.run.fees.settledMicroCny, 180);
  assert.deepEqual(state.ledger.entries.slice(0, f.original.ledger.entries.length), f.original.ledger.entries); assert.deepEqual(state.run.humanDecisions, []);
  assert.equal(state.run.originalDeadlineAt, f.original.run.originalDeadlineAt); assert.equal(state.stopReason?.code, 'deadline'); assert.equal(state.validation!.cases[0].stopReason, null);
  for (const [i, config] of f.configs.entries()) {
    const packet = f.packets[i], cap = packet.role === 'cosmos' ? 4096 : ['art', 'coding'].includes(packet.role) ? 65536 : 16384;
    assert.equal(config.maxOutputTokens, cap); assert.equal(packet.budget.validationCase.windowId, f.window.windowId);
    assert.equal(packet.budget.originalDeadlineAt, f.original.run.originalDeadlineAt);
    assert.equal(Object.hasOwn(packet, 'confirmedBy'), false);
  }
  assert.ok(state.requests.slice(f.original.requests.length).every(item => item.validation?.windowId === f.window.windowId));
  await assert.rejects(planTaskDag(f.planning as any), /once|prior planning/);
  const before = f.requests.length, resumed = await resumeTaskDag(options as any); assert.deepEqual(resumed.blocked, []); assert.equal(f.requests.length, before);
});

test('provider hooks attach actual request metadata and bill every compaction-shaped request in the same case', async t => {
  const f = await validationRoutingFixture(t), taskId = f.window.quote.declaration.grants.planning.taskId;
  const budget = createRoleBudget({ controller: f.controller, taskId, evidenceDirectory: join(f.artifactRoot, 'sessions/planning'),
    validation: { caseId: f.window.caseId, windowId: f.window.windowId, purpose: 'planning' } } as any);
  for (const requestId of ['offline-plan', 'offline-compact']) {
    await budget.beforeRequest({ requestId, modelId: 'deepseek-flash', maxOutputTokens: 4096, inputBytes: 10, hasImages: false, estimatedMaxCostMicroCny: 32788 });
    await budget.afterResponse({ requestId, outcome: 'not_sent', elapsedMs: 1 });
  }
  const state = await f.controller.read(); assert.equal(state.requests.length, f.original.requests.length + 2);
  assert.deepEqual(state.requests.at(-1)!.validation, { caseId: f.window.caseId, windowId: f.window.windowId, purpose: 'planning', modelId: 'deepseek-flash', maxOutputTokens: 4096, inputBytes: 10, hasImages: false });
});

for (const changed of ['acceptance', 'steps', 'evidence-kind', 'operator', 'scope', 'case', 'human', 'missing-binding'] as const) test(`planning refuses ${changed} drift before sessions or a request`, async t => {
  const f = await validationRoutingFixture(t), options: any = { ...f.planning, requirement: structuredClone(f.requirement) };
  if (changed === 'acceptance') options.requirement.acceptance[0].expected = 'weakened expectation';
  if (changed === 'steps') options.requirement.acceptance[0].steps = ['weakened step'];
  if (changed === 'evidence-kind') options.requirement.acceptance[0].evidenceKinds = ['user_decision'];
  if (changed === 'operator') await writeFile(f.operatorPath, '{"changed":true}', 'utf8');
  if (changed === 'scope') options.validation = { ...f.binding, readScope: async () => ({ requirement: { ...f.requirement, specVersion: 'changed' }, operatorReceipt: await readFile(f.operatorPath) }) };
  if (changed === 'case') options.validation = { ...f.binding, caseId: 'other' };
  if (changed === 'human') options.requirement = humanRequirement();
  if (changed === 'missing-binding') delete options.validation;
  const before = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(planTaskDag(options)); assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  assert.equal(f.configs.length, 0); await assert.rejects(readdir(f.planning.sessionRoot), { code: 'ENOENT' });
});

test('capture interruption uses the bound journal and resumes without another author charge', async t => {
  const f = await validationRoutingFixture(t), planned = await planTaskDag(f.planning as any);
  let interrupted = false;
  const options: any = { controller: f.controller, validation: f.binding, requirement: f.requirement, tasks: planned.tasks, sessionRoot: f.planning.sessionRoot,
    availableArtifacts: [f.source], roleFactory: f.roleFactory, capture: f.capture, verify: f.verify, recovery: f.recovery, reviewProtocolCorrections: 1 };
  await executeTaskDag({ ...options, capture: async (...args: Parameters<typeof f.capture>) => { const result = await f.capture(...args); if (!interrupted) { interrupted = true; throw new RecoveryBlocked('Offline capture publication interruption'); } return result; } });
  const authors = f.packets.filter(packet => packet.role === 'design').length;
  const resumed = await resumeTaskDag(options); assert.deepEqual(resumed.blocked, []);
  assert.equal(f.packets.filter(packet => packet.role === 'design').length, authors);
  const origin = JSON.parse(await readFile(join(f.recovery.journalRoot, `task-${planned.tasks[0].task.taskId}/origin.json`), 'utf8'));
  assert.equal(origin.formatVersion, 3); assert.equal(origin.validationCase.windowId, f.window.windowId); assert.equal(origin.originalDeadlineAt, f.original.run.originalDeadlineAt);
});

test('scope changes between tasks block the next attempt before its author session', async t => {
  const f = await validationRoutingFixture(t), planned = await planTaskDag(f.planning as any);
  const scope = f.binding.readScope; let reads = 0;
  const binding = { ...f.binding, readScope: async (signal: AbortSignal) => {
    if (++reads === 5) await writeFile(f.operatorPath, '{"changed":true}', 'utf8');
    return scope(signal);
  } };
  await executeTaskDag({ controller: f.controller, validation: binding, requirement: f.requirement, tasks: planned.tasks, sessionRoot: f.planning.sessionRoot,
    availableArtifacts: [f.source], roleFactory: f.roleFactory, capture: f.capture, verify: f.verify, recovery: f.recovery, reviewProtocolCorrections: 1 } as any);
  const state = await f.controller.read(), art = state.tasks.find(task => task.taskId.endsWith('-art'))!;
  assert.equal(art.attempts.length, 0); assert.equal(f.packets.some(packet => packet.role === 'art'), false);
});

for (const boundary of ['identity-rejected', 'admitted-then-stopped'] as const) test(`validation beforeRequest ${boundary} publishes real not-sent evidence without a provider call`, async t => {
  const f = await validationRoutingFixture(t), taskId = f.window.quote.declaration.grants.planning.taskId, directory = join(f.artifactRoot, 'sessions/planning');
  if (boundary === 'identity-rejected') { let calls = 0; f.setIdentityCheck(async () => { if (++calls === 2) throw new Error('Offline identity drift before SDK dispatch'); }); }
  else {
    const admit = f.controller.admit.bind(f.controller);
    t.mock.method(f.controller, 'admit', async (id: string) => { await admit(id); await f.controller.stop('Offline stop after admission and before hook return'); throw new Error('Offline late admission rejection'); });
  }
  const budget = createRoleBudget({ controller: f.controller, taskId, evidenceDirectory: directory,
    validation: { caseId: f.window.caseId, windowId: f.window.windowId, purpose: 'planning' } });
  let providerCalls = 0;
  await assert.rejects((async () => { await budget.beforeRequest({ requestId: 'offline-not-sent', modelId: 'deepseek-flash', maxOutputTokens: 4096, inputBytes: 10, hasImages: false, estimatedMaxCostMicroCny: 32788 }); providerCalls++; })());
  const state = await f.controller.read(), entry = state.ledger.entries.at(-1)!;
  assert.equal(providerCalls, 0); assert.equal(entry.status, 'cancelled'); assert.equal(entry.settledMicroCny, 0); assert.equal(entry.reservedMicroCny, 0);
  const receipt = JSON.parse(await readFile(join(directory, 'billing-offline-not-sent.json'), 'utf8'));
  assert.equal(receipt.outcome, 'not_sent'); assert.equal(receipt.notSentReason, 'admission_rejected_before_provider_dispatch');
  assert.equal(Object.hasOwn(receipt, 'usage'), false); assert.equal(receipt.taskId, taskId);
  assert.ok(entry.evidence.some(ref => ref.location === join(directory, 'billing-offline-not-sent.json')));
  assert.deepEqual(state.run.humanDecisions, []); assert.deepEqual(state.ledger.entries.slice(0, f.original.ledger.entries.length), f.original.ledger.entries);
});

test('failed not-sent receipt publication retains exposure for reconciliation and never sends a provider call', async t => {
  const f = await validationRoutingFixture(t), directory = join(f.artifactRoot, 'blocked-receipt'); await writeFile(directory, 'Offline non-directory', 'utf8');
  let checks = 0; f.setIdentityCheck(async () => { if (++checks === 2) throw new Error('Offline failed admission'); });
  const budget = createRoleBudget({ controller: f.controller, taskId: f.window.quote.declaration.grants.planning.taskId, evidenceDirectory: directory,
    validation: { caseId: f.window.caseId, windowId: f.window.windowId, purpose: 'planning' } });
  let sent = 0;
  await assert.rejects((async () => { await budget.beforeRequest({ requestId: 'offline-no-receipt', modelId: 'deepseek-flash', maxOutputTokens: 4096, inputBytes: 10, hasImages: false, estimatedMaxCostMicroCny: 32788 }); sent++; })());
  const entry = (await f.controller.read()).ledger.entries.at(-1)!; assert.equal(sent, 0); assert.equal(entry.status, 'reserved'); assert.equal(entry.reservedMicroCny, 32788);
});

for (const changed of ['requirement', 'task', 'operator', 'scheduling', 'owner-busy'] as const) test(`DAG ${changed} refuses before new tasks, journals, sessions or requests`, async t => {
  const f = await validationRoutingFixture(t), planned = await planTaskDag(f.planning as any);
  const options: any = { controller: f.controller, validation: f.binding, requirement: structuredClone(f.requirement), tasks: structuredClone(planned.tasks), sessionRoot: f.planning.sessionRoot,
    availableArtifacts: [f.source], roleFactory: f.roleFactory, capture: f.capture, verify: f.verify, recovery: f.recovery, reviewProtocolCorrections: 1 };
  if (changed === 'requirement') options.requirement.acceptance.at(-1).expected = 'weakened';
  if (changed === 'task') options.tasks.at(-1).task.acceptance[0].steps = ['weakened'];
  if (changed === 'operator') await writeFile(f.operatorPath, '{"changed":true}', 'utf8');
  if (changed === 'scheduling') options.scheduling = { maxParallel: 1 };
  const before = await readFile(join(f.root, 'snapshot.json')), sessions = await readdir(f.planning.sessionRoot), calls = f.requests.length;
  if (changed === 'owner-busy') await withDagOwner(f.controller, async () => { await assert.rejects(executeTaskDag(options), /active DAG/i); }, undefined, f.binding);
  else await assert.rejects(executeTaskDag(options));
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before); assert.equal(f.requests.length, calls); assert.deepEqual(await readdir(f.planning.sessionRoot), sessions);
  await assert.rejects(readdir(f.recovery.journalRoot), { code: 'ENOENT' });
});

test('direct role entry validates scope and compaction uses the actual author SDK cap', async t => {
  const f = await validationRoutingFixture(t), planned = await planTaskDag(f.planning as any); await f.controller.registerTasks(planned.tasks.map(item => item.task));
  const item = planned.tasks.find(item => item.role === 'art')!, stateDirectory = join(f.planning.sessionRoot, 'offline-art/author');
  const supplied: any = { controller: f.controller, validation: f.binding, requirement: f.requirement, role: 'art', task: item.task, workspace: item.workspace, stateDirectory };
  const bad = { ...supplied, requirement: structuredClone(f.requirement) }; bad.requirement.acceptance[1].expected = 'weakened';
  const before = await readFile(join(f.root, 'snapshot.json')); await assert.rejects(f.roleFactory(bad)); assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  const role = await f.roleFactory(supplied); try { await role.compact!(); } finally { await role.close(); }
  const state = await f.controller.read(); assert.equal(state.requests.at(-1)!.validation!.maxOutputTokens, 65536);
  assert.equal(state.requests.at(-1)!.validation!.purpose, 'author'); assert.equal(state.run.fees.settledMicroCny, 120);
});

for (const boundary of ['stop', 'timeout'] as const) test(`deferred scope ${boundary} cannot create sessions or authorize late work`, async t => {
  const f = await validationRoutingFixture(t); let release!: () => void, entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const binding = { ...f.binding, readScope: async (signal: AbortSignal) => { entered(); await new Promise<void>(resolve => { release = resolve; }); return f.binding.readScope(signal); } };
  const pending = planTaskDag({ ...f.planning, validation: binding } as any); const rejected = assert.rejects(pending, /cancel|timeout|timed out|stop/i); await ready;
  if (boundary === 'stop') await f.controller.stop('Offline scope cancellation');
  await rejected; release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.configs.length, 0); assert.equal((await f.controller.read()).requests.length, f.original.requests.length);
  await assert.rejects(readdir(f.planning.sessionRoot), { code: 'ENOENT' });
});
