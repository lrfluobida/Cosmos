import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { RunController } from '../../../src/runtime/run.ts';
import { executeTaskDag, resumeTaskDag } from '../../../src/runtime/orchestrator.ts';
import type { DagOptions } from '../../../src/runtime/orchestrator.ts';
import { createRoleBudget } from '../../../src/roles/provider-budget.ts';
import { schedulerStatus } from '../../../src/runtime/scheduler/index.ts';
import { waitForServiceRetry } from '../../../src/runtime/scheduler/service-backoff.ts';
import { DEFAULT_REPAIR_POLICY } from '../../../src/runtime/repair/policy.ts';
import { PiSessionError } from '../../../src/providers/pi.ts';
import { requirement as requirementFixture, task as taskFixture } from '../../contracts/fixtures.ts';
import type { TaskContract, RequirementContract } from '../../../src/contracts/index.ts';

const start = Date.parse('2026-10-01T01:00:00Z');
async function fixture(t: test.TestContext, graph: Record<string, string[]> = { a: [], b: [] }) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-scheduler-')); let clock = start;
  await mkdir(join(root, 'requirements')); await mkdir(join(root, 'artifacts')); await mkdir(join(root, 'evidence')); await mkdir(join(root, 'review'));
  await writeFile(join(root, 'requirements/v1.json'), '{"要求":"固定输入"}', 'utf8');
  const controller = await RunController.create({ root: join(root, 'run'), runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation', specVersion: 'spec-v1', scope: 'validation', limitMicroCny: 10000, allocations: [{ taskId: 'planning', amountMicroCny: 0 }], now: () => clock });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  const ref = (id: string) => ({ artifactId: id, version: 'v1', location: `artifacts/${id}.txt` });
  const tasks = await Promise.all(Object.entries(graph).map(async ([id, dependencies]) => {
    const task = taskFixture() as TaskContract; const workspace = join(root, `author-${id}`); await mkdir(workspace);
    Object.assign(task, { taskId: id, authorId: `author-${id}`, state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [], dependsOn: dependencies.map(taskId => ({ taskId, requiredState: 'passed', state: 'not_started' })), inputs: [...task.inputs, ...dependencies.map(ref)], ownership: { writePaths: ['work'], readOnlyPaths: [] }, outputs: [{ type: 'source', schema: 'source/1', destination: ref(id).location }] });
    task.context.contextId = `context-${id}`; task.budget = { ledgerId: 'ledger-1', allocationMicroCny: 1000, originalDeadlineAt: (await controller.read()).run.originalDeadlineAt };
    return { task, role: 'coding' as const, workspace, expectedArtifacts: [ref(id)] };
  }));
  const events: string[] = []; let active = 0, peak = 0;
  const options: DagOptions = { controller, requirement: requirementFixture() as RequirementContract, tasks, availableArtifacts: tasks[0].task.inputs.slice(0, 1), sessionRoot: join(root, 'sessions'), now: () => clock, scheduling: { maxParallel: 2, cleanupMs: 1000 },
    roleFactory: async input => {
      const budget = createRoleBudget({ controller, taskId: input.task.taskId, evidenceDirectory: input.stateDirectory }); let calls = 0;
      return { actorId: `actor-${input.role}-${input.task.taskId}`, contextId: `context-${input.role}-${input.task.taskId}`, close: async () => {}, prompt: async (_text, supplied) => {
        const id = `${input.task.taskId}-${input.role}-${++calls}`; events.push(`start:${id}`); active++; peak = Math.max(peak, active);
        try {
          await budget.beforeRequest({ requestId: id, modelId: 'deepseek-flash', inputBytes: 10, hasImages: false, maxOutputTokens: 10, estimatedMaxCostMicroCny: 100 });
          await delay(25);
          await budget.afterResponse({ requestId: id, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 25, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
          supplied?.signal?.throwIfAborted();
          return { text: JSON.stringify(input.role === 'reviewer' ? { verdict: 'approved', inputVersions: [...input.task.inputs, ...input.task.artifacts], evidenceIds: input.task.evidence.map(e => e.evidenceId), findings: [] } : { summary: '离线生成结果', remaining: [], uncertainty: [] }) };
        } finally { active--; events.push(`end:${id}`); }
      } };
    },
    capture: async task => { await writeFile(join(root, ref(task.taskId).location), `output ${task.taskId}`, 'utf8'); return { artifacts: [ref(task.taskId)], reviewWorkspace: join(root, 'review') }; },
    verify: async task => { const source = { artifactId: `report-${task.taskId}`, version: 'v1', location: `evidence/${task.taskId}.json` }; await writeFile(join(root, source.location), '{"passed":true}', 'utf8'); return [{ contractVersion: '1.0.0', evidenceId: `check-${task.taskId}`, taskId: task.taskId, acceptanceIds: task.acceptanceIds, kind: 'test_report', source, artifactVersions: [...task.inputs, ...task.artifacts], outcome: 'passed', recordedAt: new Date(clock).toISOString(), summary: '离线检查' }]; },
  };
  return { root, controller, options, events, peak: () => peak, active: () => active, now: () => clock, setTime: (value: number) => { clock = value; } };
}

test('ready diamond branches actually overlap, join once after exact dependency passes', async t => {
  const f = await fixture(t, { a: [], b: ['a'], c: ['a'], d: ['b', 'c'] });
  const tasks = await executeTaskDag(f.options);
  assert.equal(f.peak(), 2); assert.equal(f.active(), 0);
  assert.ok(tasks.every(task => task.state === 'passed'));
  assert.equal(f.events.filter(e => e === 'start:d-coding-1').length, 1);
  assert.ok(f.events.indexOf('start:d-coding-1') > f.events.indexOf('end:c-reviewer-1'));
  assert.equal((await f.controller.read()).run.fees.settledMicroCny, 80);
  const summary = await schedulerStatus(f.controller);
  assert.equal(summary.settledMicroCny, 80); assert.equal(summary.reservedMicroCny, 0);
  assert.deepEqual(summary.providers, [{ provider: 'deepseek', settledMicroCny: 80, reservedMicroCny: 0, unknownRequestIds: [] }]);
  assert.equal(summary.tasks.filter(task => task.state === 'passed' && task.evidenceIds.length === 1).length, 4);
  assert.equal(summary.scheduling?.effectiveParallel, 2); assert.equal(summary.scheduling?.peakActiveTasks, 2);
});

for (const maxParallel of [0, 3, Infinity]) test(`rejects unsupported parallel limit before registering: ${maxParallel}`, async t => {
  const f = await fixture(t); f.options.scheduling!.maxParallel = maxParallel as 1;
  await assert.rejects(executeTaskDag(f.options), /parallel/i);
  assert.equal((await f.controller.read()).tasks.length, 0); assert.equal(f.events.length, 0);
});

test('one controller cannot run a second DAG that bypasses its parallel/resource limits', async t => {
  const f = await fixture(t); let entered!: () => void, release!: () => void;
  const reached = new Promise<void>(r => { entered = r; }), gate = new Promise<void>(r => { release = r; });
  const factory = f.options.roleFactory;
  f.options.roleFactory = async input => { const role = await factory(input); return { ...role, prompt: async (text, supplied) => { entered(); await gate; return role.prompt(text, supplied); } }; };
  const active = executeTaskDag(f.options); await reached;
  const other = { ...f.options, tasks: f.options.tasks.map(item => ({ ...structuredClone(item), task: { ...structuredClone(item.task), taskId: `other-${item.task.taskId}` } })) };
  let rejected = false;
  const timeout = setTimeout(release, 25);
  try { await executeTaskDag(other); } catch (error) { rejected = /already.*execut|active.*DAG/i.test(String(error)); }
  finally { clearTimeout(timeout); release(); await active; }
  assert.equal(rejected, true);
  assert.ok((await f.controller.read()).tasks.every(task => !task.taskId.startsWith('other-')));
});

test('a host callback that ignores cancellation reports unconfirmed drain within the cleanup bound', async t => {
  const f = await fixture(t, { a: [] }); let entered!: () => void, release!: () => void;
  const reached = new Promise<void>(r => { entered = r; }), gate = new Promise<void>(r => { release = r; });
  f.options.scheduling!.drainTimeoutMs = 20;
  f.options.roleFactory = async () => ({ actorId: 'author', contextId: 'author', close: async () => {}, prompt: async () => { entered(); await gate; return { text: JSON.stringify({ summary: 'done', remaining: [], uncertainty: [] }) }; } });
  const running = executeTaskDag(f.options).then(() => 'returned', error => String(error));
  await reached; await f.controller.stop('test');
  const result = await Promise.race([running, delay(100).then(() => 'still waiting')]);
  release(); await running;
  assert.match(result, /did not quiesce|drain.*unconfirmed/i);
  assert.equal((await schedulerStatus(f.controller)).scheduling?.state, 'drain_unconfirmed');
});

for (const exclusive of ['resource', 'correction'] as const) test(`explicit ${exclusive} lane serializes complete tasks`, async t => {
  const f = await fixture(t);
  if (exclusive === 'resource') f.options.scheduling!.resources = { a: ['browser'], b: ['browser'] };
  else {
    f.options.reviewProtocolCorrections = 1;
    const factory = f.options.roleFactory;
    f.options.roleFactory = async input => { const role = await factory(input); let calls = 0; return { ...role, prompt: async (text, supplied) => { const response = await role.prompt(text, supplied); return input.role === 'reviewer' && calls++ === 0 ? { text: 'invalid JSON' } : response; } }; };
  }
  const tasks = await executeTaskDag(f.options);
  assert.ok(tasks.every(task => task.state === 'passed')); assert.equal(f.peak(), 1);
  const summary = await schedulerStatus(f.controller);
  assert.equal(summary.scheduling?.configuredParallel, 2);
  assert.equal(summary.scheduling?.effectiveParallel, exclusive === 'correction' ? 1 : 2);
  assert.ok(f.events.indexOf('start:b-coding-1') > f.events.indexOf(`end:a-reviewer-${exclusive === 'correction' ? 2 : 1}`));
});

test('failed branch prevents its descendants but independent work still completes', async t => {
  const f = await fixture(t, { a: [], b: [], c: ['a'] });
  const verify = f.options.verify; f.options.verify = async (task, signal) => { if (task.taskId === 'a') throw new Error('failure'); return verify(task, signal); };
  const tasks = await executeTaskDag(f.options);
  assert.equal(tasks.find(task => task.taskId === 'a')!.state, 'failed'); assert.equal(tasks.find(task => task.taskId === 'b')!.state, 'passed');
  assert.equal(tasks.find(task => task.taskId === 'c')!.attempts.length, 0); assert.ok(!f.events.some(e => e.startsWith('start:c')));
});

test('overlapping physical writes across nested workspaces are rejected before dispatch', async t => {
  const f = await fixture(t);
  f.options.tasks[0].task.ownership.writePaths = [join(f.options.tasks[1].workspace, 'work')];
  await assert.rejects(executeTaskDag(f.options), /write.*conflict|overlap/i); assert.equal(f.events.length, 0);
});

for (const mode of ['cancel', 'simulated-12h'] as const) test(`${mode} stops new work and drains active tasks`, async t => {
  const f = await fixture(t, { a: [], b: [], c: ['a'] }); const factory = f.options.roleFactory;
  f.options.roleFactory = async input => { const role = await factory(input); return { ...role, prompt: async (text, supplied) => { if (input.task.taskId === 'a') {
    if (mode === 'cancel') await f.controller.stop('test cancellation'); else f.setTime(start + 12 * 60 * 60 * 1000 - 500);
  } return role.prompt(text, supplied); } }; };
  await executeTaskDag(f.options); assert.equal(f.active(), 0);
  assert.ok(!f.events.some(e => e.startsWith('start:c'))); assert.ok((await f.controller.read()).stopReason);
  assert.equal((await f.controller.read()).run.originalDeadlineAt, new Date(start + 12 * 60 * 60 * 1000).toISOString());
});

test('scheduled recovery reuses exact passed work and propagates current blocked ancestors', async t => {
  const f = await fixture(t, { a: [], b: ['a'] });
  f.options.recovery = { journalRoot: join(f.root, 'journal'), artifactRoot: f.root, recoverCapture: async task => ({ artifacts: task.artifacts, reviewWorkspace: join(f.root, 'review') }) };
  const original = await executeTaskDag(f.options); const costs = (await f.controller.read()).run.fees; const count = f.events.length;
  let result = await resumeTaskDag(f.options);
  assert.equal((await schedulerStatus(f.controller)).scheduling?.effectiveParallel, 1);
  assert.deepEqual(result.reusedTaskIds, ['a', 'b']); assert.equal(f.events.length, count); assert.deepEqual((await f.controller.read()).run.fees, costs);
  f.options.recovery.recoverCapture = async () => null;
  result = await resumeTaskDag(f.options);
  assert.deepEqual(result.reusedTaskIds, []); assert.deepEqual(result.blocked.map(b => b.taskId), ['a', 'b']); assert.deepEqual(result.tasks, original);
});

for (const scheduled of [true, false]) test(`pre-cancelled passed recovery starts no host callback and preserves its terminal record: scheduling=${scheduled}`, async t => {
  const f = await fixture(t, { a: [] });
  f.options.recovery = { journalRoot: join(f.root, 'journal'), artifactRoot: f.root, recoverCapture: async task => ({ artifacts: task.artifacts, reviewWorkspace: join(f.root, 'review') }) };
  const original = await executeTaskDag(f.options), before = await f.controller.read();
  const callsBefore = f.events.length; let callbackCalls = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  f.options.recovery.recoverCapture = async task => { callbackCalls++; await gate; return { artifacts: task.artifacts, reviewWorkspace: join(f.root, 'review') }; };
  if (scheduled) f.options.scheduling!.drainTimeoutMs = 20; else delete f.options.scheduling;
  const abort = new AbortController(); abort.abort(); f.options.signal = abort.signal;
  const pending = resumeTaskDag(f.options);
  const bounded = await Promise.race([pending.then(() => true), delay(120).then(() => false)]);
  release(); const result = await pending;
  assert.equal(bounded, true, 'pre-cancelled recovery must not wait for a host callback that ignores cancellation');
  assert.equal(callbackCalls, 0); assert.equal(f.events.length, callsBefore);
  assert.deepEqual(result.tasks, original); assert.deepEqual(result.reusedTaskIds, []);
  assert.deepEqual(result.blocked.map(item => item.taskId), ['a']); assert.match(result.blocked[0].reason, /cancel/i);
  const after = await f.controller.read();
  assert.deepEqual(after.tasks, before.tasks); assert.deepEqual(after.run.fees, before.run.fees);
  assert.equal(after.revision, before.revision);
  if (scheduled) assert.equal((await schedulerStatus(f.controller)).scheduling?.state, 'drained');
});

for (const mode of ['settled', 'unknown', 'inflight', 'deadline', 'cancel', 'cancel-during', 'attempt-limit'] as const) test(`service backoff preserves COS-11 decisions and never dispatches by itself: ${mode}`, async t => {
  const f = await fixture(t, { a: [] }); const factory = f.options.roleFactory;
  f.options.roleFactory = async input => { const role = await factory(input); return { ...role, prompt: async (text, supplied) => { await role.prompt(text, supplied); throw new PiSessionError('provider_error', 'not persisted'); } }; };
  const [task] = await executeTaskDag(f.options); assert.equal(task.state, 'failed');
  const feedback = JSON.parse(await readFile(join(task.attempts[0].sessionRef, 'failure.json'), 'utf8'));
  const original = structuredClone(task), paidCount = f.events.length; let waited = 0;
  if (mode === 'unknown' || mode === 'inflight') {
    await f.controller.reserve({ requestId: 'unresolved', taskId: 'a', provider: 'offline', pricingVersion: 'v1', estimatedMaxCostMicroCny: 10 });
    await f.controller.admit('unresolved');
    if (mode === 'unknown') await f.controller.markUnknown('unresolved', task.inputs);
  }
  if (mode === 'deadline') f.setTime(start + 12 * 60 * 60 * 1000 - 1500);
  const abort = new AbortController(); if (mode === 'cancel') abort.abort();
  const result = await waitForServiceRetry({ controller: f.controller, requirement: f.options.requirement, history: [feedback], policy: { ...DEFAULT_REPAIR_POLICY, ...(mode === 'attempt-limit' ? { maxTaskAttempts: 1 } : {}) }, estimate: { costMicroCny: 100, durationMs: 1000, cleanupMs: 100 }, backoffMs: 500, signal: abort.signal, now: f.now,
    wait: async (ms, signal) => { signal.throwIfAborted(); waited += ms; if (mode === 'cancel-during') abort.abort(); f.setTime(f.now() + ms); } });
  assert.equal(result.action, mode === 'settled' ? 'retry_service' : 'stop');
  assert.equal(waited, mode === 'settled' || mode === 'cancel-during' ? 500 : 0); assert.equal(f.events.length, paidCount);
  assert.deepEqual((await f.controller.read()).tasks[0], original);
});
