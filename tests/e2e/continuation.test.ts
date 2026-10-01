import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { RunController } from '../../src/runtime/run.ts';
import type { PreparedTask } from '../../src/runtime/orchestrator.ts';
import type { TaskContract } from '../../src/contracts/types.ts';
import type { EvidenceContract, RequirementContract } from '../../src/contracts/types.ts';
import { task as taskFixture, requirement as requirementFixture, artifact } from '../contracts/fixtures.ts';
import { PILOT_LIMITS } from '../../probes/e2e/admission.ts';
import { openPilotGuard } from '../../probes/e2e/budget.ts';
import { cancelReplacedTasks, createSuccessors, readContinuation, validateContinuationRecords } from '../../probes/e2e/continuation.ts';
import type { Continuation } from '../../probes/e2e/continuation.ts';
import { createRoleFactory } from '../../src/roles/factory.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
import { copyReviewInputs, writeJson } from '../../probes/e2e/host.ts';

function records() {
  const root = join(tmpdir(), 'pilot-fixture'), startedAt = '2026-10-01T08:18:34.671Z', deadlineAt = '2026-10-01T09:48:34.671Z';
  const tasks: PreparedTask[] = ['design', 'art', 'coding'].map(role => {
    const task = taskFixture() as TaskContract;
    Object.assign(task, { taskId: `pilot-fixture-${role}`, state: 'not_started', attempts: [], artifacts: [], evidence: [], dependsOn: role === 'design' ? [] : [{ taskId: 'pilot-fixture-design', requiredState: 'passed', state: 'not_started' }] });
    task.budget.allocationMicroCny = role === 'design' ? 1_900_000 : role === 'art' ? 5_700_000 : 7_600_000;
    return { role: role as PreparedTask['role'], task, workspace: root, expectedArtifacts: [{ artifactId: role, version: 'v1', location: `registry/${role}/v1` }] };
  });
  const original = structuredClone(tasks.map(item => item.task));
  original[0].state = 'failed'; original[0].artifacts = structuredClone(tasks[0].expectedArtifacts!);
  original[0].attempts = [{ attemptId: 'attempt-original', sessionRef: 'sessions/original', startedAt, endedAt: startedAt, outcome: 'failed', failure: null }];
  original[1].state = original[2].state = 'waiting_user';
  const journal = { startedAt, deadlineAt, maxRequests: 40, requestIds: ['request-1'] };
  const marker = { root, startedAt, deadlineAt, platformHead: 'a'.repeat(40) };
  const origin = { ...marker, runId: 'run-1', ledgerId: 'ledger-1', limits: PILOT_LIMITS, childAllocationCapMicroCny: 19_000_000, budgets: { cumulativePilotMicroCny: 30_000_000 } };
  const snapshot = { run: { state: 'running', runId: 'run-1', ledgerId: 'ledger-1' }, stopReason: null, tasks: original,
    ledger: { limitMicroCny: 150_000_000, allocations: original.map(task => ({ taskId: task.taskId, amountMicroCny: task.budget.allocationMicroCny })),
      entries: [{ requestId: 'request-1', taskId: 'COS-10', status: 'settled', unknown: false, settledMicroCny: 100, reservedMicroCny: 0 }] } };
  const result = { outcome: 'failed', root, startedAt, platformHead: marker.platformHead, tasks: structuredClone(original), pilotBudget: structuredClone(journal), budget: { committedMicroCny: 100 } };
  return { root, marker, origin, journal, result, snapshot, planned: tasks, now: Date.parse(startedAt) + 60_000 };
}

test('continuation preserves immutable plan fields and explicitly maps new tasks without rewriting original tasks', () => {
  const value = records(); validateContinuationRecords(value);
  const before = structuredClone(value.planned);
  const next = createSuccessors(value.planned, value.snapshot.tasks as TaskContract[]);
  assert.deepEqual(value.planned, before);
  assert.equal(next.tasks[0].task.budget.allocationMicroCny, 500_000);
  assert.deepEqual(next.tasks[0].task.ownership.writePaths, []); assert.deepEqual(next.tasks[0].task.context.tools, ['read']);
  assert.deepEqual(next.tasks[0].expectedArtifacts, before[0].expectedArtifacts);
  for (const role of ['art', 'coding']) {
    const old = before.find(t => t.role === role)!, successor = next.tasks.find(t => t.role === role)!;
    for (const key of ['objective', 'acceptanceIds', 'acceptance', 'inputs', 'outputs', 'ownership', 'budget'] as const) assert.deepEqual(successor.task[key], old.task[key], key);
    assert.deepEqual(successor.task.context.tools, old.task.context.tools);
    assert.deepEqual(successor.task.context.rules.slice(0, old.task.context.rules.length), old.task.context.rules);
    assert.equal(successor.task.dependsOn[0].taskId, next.mapping['pilot-fixture-design']);
  }
});

test('continuation rejects changed counters, plans, versions, prior attempts, live exposure and expiration', () => {
  const cases: [string, (value: ReturnType<typeof records>) => void][] = [
    ['counter', value => { value.journal.requestIds = []; }],
    ['plan', value => { value.planned[1].task.objective = 'replacement objective'; }],
    ['capture', value => { value.snapshot.tasks[0].artifacts[0].version = 'v2'; value.result.tasks[0].artifacts[0].version = 'v2'; }],
    ['attempt', value => { value.snapshot.tasks[1].attempts = structuredClone(value.snapshot.tasks[0].attempts); value.result.tasks[1].attempts = structuredClone(value.snapshot.tasks[1].attempts); }],
    ['exposure', value => { value.snapshot.ledger.entries[0].unknown = true; }],
    ['deadline', value => { value.now = Date.parse(value.journal.deadlineAt); }],
    ['limits', value => { value.journal.maxRequests = 41; }],
  ];
  for (const [message, modify] of cases) { const value = records(); modify(value); assert.throws(() => validateContinuationRecords(value), new RegExp(message, 'i'), message); }
});

test('opening the original guard preserves old request IDs and appends within the original deadline', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-continuation-guard-'));
  const controller = await RunController.create({ root: join(root, 'ledger'), runId: 'r1', ledgerId: 'l1', kind: 'evaluation', specVersion: '1.0', scope: 'validation', allocations: [{ taskId: 'COS-10', amountMicroCny: 1_000_000 }] });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  const journal = { startedAt: new Date().toISOString(), deadlineAt: new Date(Date.now() + 60_000).toISOString(), maxRequests: 40, requestIds: ['previous-request'] };
  await writeFile(join(root, 'pilot-budget.json'), JSON.stringify(journal), 'utf8');
  await writeFile(join(root, 'origin.json'), JSON.stringify({ startedAt: journal.startedAt, deadlineAt: journal.deadlineAt, limits: PILOT_LIMITS }), 'utf8');
  await writeFile(join(root, 'ledger/cos10-pilot.json'), JSON.stringify({ root, startedAt: journal.startedAt, deadlineAt: journal.deadlineAt }), 'utf8');
  const guard = await openPilotGuard({ root, ledgerRoot: join(root, 'ledger'), controller, journal }); t.after(() => guard.close());
  await guard.wrap({ beforeRequest: async () => {}, afterResponse: async () => {} }).beforeRequest({ requestId: 'new-request', modelId: 'deepseek-flash', inputBytes: 1, hasImages: false, maxOutputTokens: 1, estimatedMaxCostMicroCny: 10 });
  const after = JSON.parse(await readFile(join(root, 'pilot-budget.json'), 'utf8'));
  assert.deepEqual(after, { ...journal, requestIds: ['previous-request', 'new-request'] });
  await assert.rejects(openPilotGuard({ root, ledgerRoot: join(root, 'ledger'), controller, journal }), /journal changed/);
});

test('the continuation entry rejects an existing one-shot record before reading tasks or dispatching', async t => {
  const repository = await mkdtemp(join(tmpdir(), 'cosmos-continuation-once-')); t.after(() => rm(repository, { recursive: true, force: true }));
  const root = join(repository, '.cosmos/e2e/pilot-20261001081828147'), ledgerRoot = join(repository, '.cosmos/validation-shared');
  await mkdir(root, { recursive: true }); await mkdir(ledgerRoot, { recursive: true });
  await writeJson(ledgerRoot, 'cos10-pilot.json', { root }); await writeJson(root, 'continuation-origin.json', { used: true });
  let reads = 0;
  await assert.rejects(readContinuation(repository, ledgerRoot, { read: async () => { reads++; throw new Error('must not proceed'); } } as unknown as RunController), /already used/);
  assert.equal(reads, 0);
});

test('replacement cancellation uses legal transitions and retains original allocations and contracts', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-continuation-cancel-'));
  const tasks = ['art-old', 'coding-old'].map(taskId => {
    const task = taskFixture() as TaskContract;
    Object.assign(task, { taskId, state: 'not_started', dependsOn: [], attempts: [], artifacts: [], evidence: [] });
    task.budget.allocationMicroCny = 500_000; return task;
  });
  const controller = await RunController.create({ root, runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation', specVersion: 'spec-v1', scope: 'validation', allocations: tasks.map(task => ({ taskId: task.taskId, amountMicroCny: 500_000 })) });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  for (const task of tasks) task.budget.originalDeadlineAt = (await controller.read()).run.originalDeadlineAt;
  await controller.registerTasks(tasks);
  for (const task of tasks) { task.state = 'waiting_user'; task.stateReason = 'Required dependency has not passed.'; await controller.saveTask(task, { role: 'system', actorId: 'fixture' }); }
  const before = await controller.read(), mapping = Object.fromEntries(tasks.map(task => [task.taskId, `${task.taskId}-c1`]));
  const continuation = { replaced: before.tasks, mapping } as Continuation;
  await cancelReplacedTasks(controller, continuation);
  const after = await controller.read(); assert.deepEqual(after.ledger, before.ledger);
  for (const task of after.tasks) { assert.equal(task.state, 'cancelled'); assert.equal(task.attempts.length, 0); assert.match(task.stateReason!, new RegExp(mapping[task.taskId])); }
  await assert.rejects(cancelReplacedTasks(controller, continuation), /changed before cancellation/);
});

for (const blocked of [false, true]) test(`read-only captured design clarification ${blocked ? 'keeps real unfinished-work gate' : 'reaches independent review without rewriting output'}`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-handoff-scope-'));
  const workspace = join(root, 'workspace'), review = join(root, 'review');
  await mkdir(workspace); await mkdir(review);
  const requirement = requirementFixture() as RequirementContract;
  requirement.acceptance[0] = { acceptanceId: 'AC-1', description: '只读设计检查', steps: ['读取固定设计'], expected: '原始设计字节保持不变', evidenceKinds: ['test_report'] };
  await writeJson(workspace, 'requirements/v1.json', requirement);
  const captured = artifact('design', 'v1', 'captures/design/v1');
  await writeJson(workspace, `${captured.location}/design.json`, { summary: '只读设计夹具' });
  const before = await readFile(join(workspace, captured.location, 'design.json'));
  const controller = await RunController.create({ root: join(root, 'ledger'), runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation', specVersion: 'spec-v1', scope: 'validation', allocations: [{ taskId: 'design-c1', amountMicroCny: 500_000 }] });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  const task = taskFixture() as TaskContract;
  Object.assign(task, { taskId: 'design-c1', state: 'not_started', dependsOn: [], attempts: [], artifacts: [], evidence: [], objective: 'Read existing design only', ownership: { writePaths: [], readOnlyPaths: [captured.location] } });
  task.context.tools = ['read']; task.context.interfaces = [captured];
  task.acceptance = requirement.acceptance.map(a => ({ acceptanceId: a.acceptanceId, steps: a.steps, expected: a.expected, evidenceDestinations: ['evidence/report.json'] }));
  task.budget.allocationMicroCny = 500_000; task.budget.originalDeadlineAt = (await controller.read()).run.originalDeadlineAt;
  let verifies = 0, reviews = 0;
  const roleFactory = createRoleFactory({ maxOutputTokens: 500, maxRequests: 2, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 100,
    sessionFactory: async config => {
      const packet = JSON.parse(config.context); assert.deepEqual(config.tools.map(tool => tool.name), ['read']);
      if (packet.role === 'design') { assert.match(config.systemPrompt, /only unfinished required deliverables owned by this role/); assert.match(config.systemPrompt, /never hide a real defect/); }
      else reviews++;
      return { async prompt() {
        await config.tools[0].execute('fixed-design', { path: `${captured.location}/design.json` }, undefined, undefined, undefined as never);
        return { text: JSON.stringify(packet.role === 'reviewer' ? { verdict: 'approved', findings: [], inputVersions: packet.inputs, evidenceIds: packet.evidence.map((e: EvidenceContract) => e.evidenceId) }
          : { summary: 'Only design-stage work assessed; host/downstream work remains separate.', remaining: blocked ? ['A required design mapping is missing'] : [], uncertainty: [] }) };
      }, async close() {} };
    },
  });
  const results = await executeTaskDag({ controller, requirement, tasks: [{ role: 'design', workspace, task, expectedArtifacts: [captured] }], availableArtifacts: requirement.sources, sessionRoot: join(root, 'sessions'), roleFactory,
    capture: async () => ({ artifacts: [captured], reviewWorkspace: review }),
    verify: async current => {
      verifies++; const source = artifact('report', 'v1', 'evidence/report.json'); await writeJson(workspace, source.location, { passed: true });
      await copyReviewInputs(workspace, review, [...current.inputs, ...current.artifacts, source]);
      return [{ contractVersion: '1.0.0', evidenceId: 'host-evidence', taskId: task.taskId, acceptanceIds: ['AC-1'], kind: 'test_report', source,
        artifactVersions: [...current.inputs, ...current.artifacts], outcome: 'passed', recordedAt: new Date().toISOString(), summary: 'Fixed fixture is readable and unchanged' }];
    },
  });
  assert.equal(results[0].state, blocked ? 'failed' : 'passed'); assert.equal(verifies, blocked ? 0 : 1); assert.equal(reviews, blocked ? 0 : 1);
  assert.ok((await readFile(join(workspace, captured.location, 'design.json'))).equals(before));
});
