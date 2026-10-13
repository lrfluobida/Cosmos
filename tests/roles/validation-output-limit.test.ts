import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import type { Role } from '../../src/roles/factory.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';
import type { RequirementContract, TaskContract } from '../../src/contracts/index.ts';
import { RunController } from '../../src/runtime/run.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
import { createLinkedRepairTask, DEFAULT_REPAIR_POLICY } from '../../src/runtime/repair/policy.ts';
import { HostFailure } from '../../src/runtime/repair/feedback.ts';
import { validationReservation } from '../../src/runtime/validation-validation.ts';
import { validationRoutingFixture } from '../runtime/validation-routing.fixture.ts';
import { outputLimitFixture, syntheticContext } from '../providers/request-output-limit.fixture.mjs';
import { requirement as requirementFixture, task as taskFixture } from '../contracts/fixtures.ts';

const { createRoleFactory }: typeof import('../../src/roles/factory.ts') = await import(new URL(process.env.COSMOS_OUTPUT_CAP_COMPILED === '1'
  ? '../../dist/roles/factory.js' : '../../src/roles/factory.ts', import.meta.url).href);

const metadata = { requestId: 'synthetic-cap', modelId: 'deepseek-flash' as const, inputBytes: 405672, hasImages: false, maxOutputTokens: 65536 };

async function fixture(t: test.TestContext) {
  const f = await validationRoutingFixture(t), planned = await planTaskDag(f.planning as any);
  await f.controller.registerTasks(planned.tasks.map(item => item.task));
  const coding = planned.tasks.find(item => item.role === 'coding')!;
  let serial = 0;
  const charge = async (amount: number, unknown = false) => {
    const requestId = `synthetic-cap-charge-${++serial}`;
    await f.controller.reserve({ requestId, taskId: coding.task.taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01',
      estimatedMaxCostMicroCny: amount, validation: { caseId: f.window.caseId, windowId: f.window.windowId, purpose: 'author', modelId: 'deepseek-flash',
        maxOutputTokens: 1, inputBytes: 0, hasImages: false } });
    await f.controller.admit(requestId);
    const evidence = [{ artifactId: requestId, version: 'v1', location: 'synthetic-charge.json' }];
    if (unknown) await f.controller.markUnknown(requestId, evidence);
    else await f.controller.settle(requestId, amount, evidence);
  };
  const remaining = async (amount: number) => {
    const current = await f.controller.validationAuthority(coding.task.taskId, 'author');
    await charge(current.remainingMicroCny - amount);
    assert.equal((await f.controller.validationAuthority(coding.task.taskId, 'author')).remainingMicroCny, amount);
  };
  const configs: PiSessionOptions[] = [];
  const create = async (role: Role = 'coding', sessionFactory?: (config: PiSessionOptions) => Promise<any>) => {
    const item = role === 'reviewer' ? coding : planned.tasks.find(item => item.role === role)!;
    const factory = createRoleFactory({ maxOutputTokens: 16384, maxRequests: 3, requestTimeoutMs: 1000, env: { DEEPSEEK_API_KEY: 'offline-synthetic-key' },
      estimatedMaxCostMicroCny: validationReservation, sessionFactory: async config => {
        configs.push(config); return sessionFactory ? sessionFactory(config) : { prompt: async () => ({ text: '' }), close: async () => {} };
      } });
    return factory({ controller: f.controller, validation: f.binding, requirement: f.requirement, role, task: item.task,
      workspace: item.workspace, stateDirectory: join(f.planning.sessionRoot, `cap-${role}`) });
  };
  return { ...f, planned, coding, charge, remaining, planningConfig: f.configs[0], configs, create };
}

test('production factory chooses 52730 from real current authority and Pi sends the same reserved cap', async t => {
  const f = await fixture(t), pi = await outputLimitFixture(t); await f.remaining(1233190);
  await f.create('coding', config => pi.create(config));
  assert.equal(typeof f.configs[0].requestOutputLimit, 'function');
  const before = await f.controller.read(); await pi.dispatch();
  assert.equal(pi.dispatches.length, 1); assert.equal(pi.dispatches[0].maxTokens, 52730);
  const after = await f.controller.read(), record = after.requests.at(-1)!;
  assert.deepEqual(record.validation, { caseId: f.window.caseId, windowId: f.window.windowId, purpose: 'author', modelId: 'deepseek-flash',
    inputBytes: 405672, hasImages: false, maxOutputTokens: 52730 });
  assert.equal(after.ledger.entries.at(-1)!.status, 'settled');
  assert.equal(after.requests.length, before.requests.length + 1);
});

test('current authority preserves affordable original cap, refreshes balance and retains image reservation rule', async t => {
  const f = await fixture(t); await f.create(); const policy = f.configs[0].requestOutputLimit!;
  assert.equal(typeof policy, 'function');
  assert.equal(await policy(metadata), 65536);
  assert.equal(await policy({ ...metadata, hasImages: true }), 65536);
  await f.remaining(1233190);
  assert.equal(await policy(metadata), 52730);
  await assert.rejects(policy({ ...metadata, hasImages: true }), /budget|afford|floor/i);
});

test('a configured cap below 4096 is preserved as its own minimum and cannot be reduced further', async t => {
  const f = await fixture(t); await f.create(); const policy = f.configs[0].requestOutputLimit!;
  await f.remaining(815344);
  assert.equal(await policy({ ...metadata, maxOutputTokens: 500 }), 500);
  await f.charge(8);
  await assert.rejects(policy({ ...metadata, maxOutputTokens: 500 }), /minimum/i);
});

test('only validation coding authors receive the factory policy', async t => {
  const f = await fixture(t);
  for (const role of ['coding', 'reviewer', 'design', 'art'] as const) {
    await f.create(role); assert.equal(typeof f.configs.at(-1)!.requestOutputLimit, role === 'coding' ? 'function' : 'undefined', role);
  }
  assert.equal(f.configs[0].maxOutputTokens, 65536);
  assert.equal(f.packets[0].role, 'cosmos'); assert.equal(f.planningConfig.requestOutputLimit, undefined);
  assert.equal(f.configs.find(config => JSON.parse(config.context).role === 'reviewer')!.maxOutputTokens, 16384);
});

test('formal coding keeps its fixed cap and rejects insufficient budget without using the validation policy', async t => {
  const pi = await outputLimitFixture(t), requirement = requirementFixture() as RequirementContract, task = taskFixture() as TaskContract;
  const controller = await RunController.create({ root: join(pi.root, 'formal-run'), runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation',
    specVersion: requirement.specVersion, scope: 'generation', limitMicroCny: 1233190, allocations: [{ taskId: task.taskId, amountMicroCny: 1233190 }] });
  try {
    task.budget = { ...task.budget, allocationMicroCny: 1233190, originalDeadlineAt: (await controller.read()).run.originalDeadlineAt };
    const factory = createRoleFactory({ maxOutputTokens: 65536, maxRequests: 1, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: validationReservation,
      env: { DEEPSEEK_API_KEY: 'offline-synthetic-key' }, sessionFactory: async config => { assert.equal(config.requestOutputLimit, undefined); return pi.create(config); } });
    await factory({ controller, requirement, role: 'coding', task, workspace: pi.workspace, stateDirectory: join(pi.root, 'formal-session') });
    await assert.rejects(pi.dispatch(), /admission rejected/i); assert.equal(pi.dispatches.length, 0);
    assert.equal((await controller.read()).requests.length, 0);
  } finally { await controller.close(); }
});

for (const [boundary, amount] of [['input', 811343], ['floor', 844111], ['image', 1233190]] as const) test(`${boundary} is rejected before reserving or sending a synthetic provider request`, async t => {
  const f = await fixture(t), pi = await outputLimitFixture(t); await f.remaining(amount);
  await f.create('coding', config => pi.create(config)); const before = await f.controller.read();
  await assert.rejects(pi.dispatch(syntheticContext(405672, boundary === 'image')), /output limit authority rejected/i);
  assert.equal(pi.dispatches.length, 0); assert.equal((await f.controller.read()).requests.length, before.requests.length);
});

test('the 4096 floor itself is affordable and is sent without exceeding the current balance', async t => {
  const f = await fixture(t), pi = await outputLimitFixture(t); await f.remaining(844112);
  await f.create('coding', config => pi.create(config)); await pi.dispatch();
  assert.equal(pi.dispatches[0].maxTokens, 4096);
});

for (const boundary of ['balance-race', 'unknown', 'deadline', 'window-drift'] as const) test(`${boundary} after policy selection sends nothing and does not recalculate or retry`, async t => {
  const f = await fixture(t), pi = await outputLimitFixture(t); await f.remaining(1233190); let selections = 0;
  const session = await f.create('coding', config => pi.create({ ...config,
    requestOutputLimit: async (request: typeof metadata) => {
      selections++; const cap = await config.requestOutputLimit!(request);
      if (boundary === 'balance-race') await f.charge(8);
      if (boundary === 'unknown') await f.charge(8, true);
      if (boundary === 'deadline') t.mock.method(Date, 'now', () => Date.parse(f.window.deadlineAt));
      if (boundary === 'window-drift') {
        const authority = f.controller.validationAuthority.bind(f.controller);
        t.mock.method(f.controller, 'validationAuthority', async (...args: Parameters<typeof authority>) => ({ ...await authority(...args), windowId: 'drift' }));
      }
      return cap;
    } }));
  await assert.rejects(pi.dispatch(), /rejected|unavailable/i);
  await assert.rejects(session.prompt('Do not retry'));
  assert.equal(selections, 1); assert.equal(pi.dispatches.length, 0);
  assert.ok(!(await f.controller.read()).requests.some(request => request.validation?.maxOutputTokens === 52730));
});

test('an existing unknown charge rejects current policy before a reservation or provider call', async t => {
  const f = await fixture(t), pi = await outputLimitFixture(t); await f.create('coding', config => pi.create(config));
  await f.charge(8, true); const before = await f.controller.read();
  await assert.rejects(pi.dispatch(), /output limit authority rejected/i);
  assert.equal(pi.dispatches.length, 0); assert.equal((await f.controller.read()).requests.length, before.requests.length);
});

test('same-role claimed coding repair receives the policy using its own current repair authority', async t => {
  const f = await validationRoutingFixture(t), plan = await planTaskDag(f.planning as any);
  const tasks = await executeTaskDag({ controller: f.controller, validation: f.binding, requirement: f.requirement, tasks: plan.tasks,
    sessionRoot: f.planning.sessionRoot, availableArtifacts: [f.source], roleFactory: f.roleFactory, capture: f.capture,
    verify: async task => (await f.verify(task)).map(item => ({ ...item, outcome: task.taskId.endsWith('-coding') ? 'failed' as const : item.outcome })),
    diagnoseFailure: task => new HostFailure([{ acceptanceId: task.acceptanceIds[0], checkId: 'offline-output-cap', classification: 'code_defect',
      summary: 'Synthetic defect', reproduction: ['Read synthetic report'], actual: 'Fail', expected: 'Pass', evidenceRefs: task.evidence.map(item => item.source.location) }]),
    recovery: f.recovery, reviewProtocolCorrections: 1 });
  const source = { ...plan.tasks[2], task: tasks[2] }, feedback = JSON.parse(await readFile(join(source.task.attempts[0].sessionRef, 'failure.json'), 'utf8'));
  const claim = await f.controller.claimValidationRepair({ sourceTaskId: source.task.taskId, feedback: feedback.reference });
  const repair = createLinkedRepairTask({ snapshot: await f.controller.read(), requirement: f.requirement, validation: f.binding, history: [feedback],
    policy: DEFAULT_REPAIR_POLICY, now: Date.now(), estimate: { costMicroCny: 1000, durationMs: 1000, cleanupMs: 100 }, source, taskId: claim.taskId,
    allocationMicroCny: f.window.quote.declaration.grants.repair.amountMicroCny, outputs: [{ ...source.task.outputs[0], destination: 'registry/captures/coding/v2/files' }],
    expectedArtifacts: [{ artifactId: 'coding', version: 'v2', location: 'registry/captures/coding/v2/files' }] });
  await f.controller.registerTasks([repair.task]);
  const pi = await outputLimitFixture(t); let config!: PiSessionOptions;
  const factory = createRoleFactory({ maxOutputTokens: 16384, maxRequests: 1, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: validationReservation,
    env: { DEEPSEEK_API_KEY: 'offline-synthetic-key' }, sessionFactory: async options => { config = options; return pi.create(options); } });
  await factory({ controller: f.controller, validation: f.binding, requirement: f.requirement, role: 'coding', task: repair.task,
    workspace: repair.workspace, stateDirectory: join(f.planning.sessionRoot, 'cap-repair') });
  assert.equal(typeof config.requestOutputLimit, 'function'); await pi.dispatch();
  assert.equal(pi.dispatches[0].maxTokens, 65536); assert.equal((await f.controller.read()).ledger.entries.at(-1)!.taskId, claim.taskId);
});
