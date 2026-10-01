import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { executeTaskDag, resumeTaskDag } from '../../../src/runtime/orchestrator.ts';
import type { DagOptions, PreparedTask } from '../../../src/runtime/orchestrator.ts';
import type { TaskContract } from '../../../src/contracts/types.ts';
import { dagFixture, time } from './dag-fixture.ts';

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-recovery-dependencies-')), f = await dagFixture(root, true);
  t.after(async () => { await f.controller.close(); await rm(root, { recursive: true, force: true }); });
  const [parent] = await executeTaskDag(f.options); assert.equal(parent.state, 'passed');
  const plans = new Map<string, PreparedTask>([['code', f.options.tasks[0]]]);
  const dispatched: string[] = [], inspected: string[] = [];
  const recoverParent = f.options.recovery!.recoverCapture!;
  const options: DagOptions = { ...f.options,
    recovery: { ...f.options.recovery!, recoverCapture: async (task, proposal, signal) => {
      inspected.push(task.taskId);
      if (task.taskId === 'code') return recoverParent(task, proposal, signal);
      return { artifacts: plans.get(task.taskId)!.expectedArtifacts!, reviewWorkspace: join(root, `review-${task.taskId}`) };
    } },
    roleFactory: async input => {
      dispatched.push(`${input.task.taskId}:${input.role}`);
      return { actorId: input.role === 'reviewer' ? `reviewer-${input.task.taskId}` : input.task.authorId,
        contextId: input.role === 'reviewer' ? `review-${input.task.taskId}` : input.task.context.contextId,
        async close() {}, async prompt() { return { text: JSON.stringify(input.role === 'reviewer'
          ? { verdict: 'approved', inputVersions: [...input.task.inputs, ...input.task.artifacts], evidenceIds: input.task.evidence.map(e => e.evidenceId), findings: [] }
          : { summary: 'Scoped offline output', remaining: [], uncertainty: [] }) }; } };
    },
    capture: async task => {
      const artifacts = plans.get(task.taskId)!.expectedArtifacts!, reviewWorkspace = join(root, `review-${task.taskId}`);
      await mkdir(join(f.workspace, artifacts[0].location), { recursive: true }); await mkdir(reviewWorkspace);
      await writeFile(join(f.workspace, artifacts[0].location, 'output.txt'), task.taskId, 'utf8');
      return { artifacts, reviewWorkspace };
    },
    verify: async task => {
      const location = `evidence/${task.taskId}.json`; await writeFile(join(f.workspace, location), '{"passed":true}', 'utf8');
      return [{ contractVersion: '1.0.0', evidenceId: `host-${task.taskId}`, taskId: task.taskId, acceptanceIds: task.acceptanceIds,
        kind: 'test_report', source: { artifactId: `report-${task.taskId}`, version: 'v1', location }, artifactVersions: [...task.inputs, ...task.artifacts],
        outcome: 'passed', recordedAt: new Date(time).toISOString(), summary: 'Offline dependency fixture' }];
    },
  };
  async function register(taskId: string, dependency: string) {
    const item = structuredClone(f.options.tasks[0]), dependencyPlan = plans.get(dependency)!;
    item.task.taskId = taskId; item.task.authorId = `author-${taskId}`; item.task.context.contextId = `context-${taskId}`;
    item.task.dependsOn = [{ taskId: dependency, requiredState: 'passed', state: 'passed' }];
    item.task.inputs = [...f.options.tasks[0].task.inputs, ...dependencyPlan.expectedArtifacts!];
    item.task.ownership.writePaths = [`authors/${taskId}`]; item.task.budget.allocationMicroCny = 50;
    item.expectedArtifacts = [{ artifactId: taskId, version: 'v1', location: `artifacts/${taskId}/v1` }];
    item.task.outputs[0].destination = item.expectedArtifacts[0].location;
    plans.set(taskId, item);
    // Stop immediately after the original task and origin receipt are durable,
    // before any attempt or role has started. No task state is edited by the fixture.
    const controller = new Proxy(f.controller, { get(target, key) {
      if (key === 'registerTasks') return async (tasks: TaskContract[]) => { await target.registerTasks(tasks); throw new Error('Fixture registered pause'); };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } });
    await assert.rejects(executeTaskDag({ ...options, controller, tasks: [item] }), /Fixture registered pause/);
  }
  return { ...f, options, plans, register, dispatched, inspected };
}

for (const selection of [['code', 'second'], ['second', 'code'], ['second']] as const) test(`blocked historical parent never authorizes a child selected as ${selection.join(',')}`, async t => {
  const f = await fixture(t); await f.register('second', 'code');
  const before = await f.controller.read();
  const result = await resumeTaskDag({ ...f.options, tasks: selection.map(id => f.plans.get(id)!),
    availableArtifacts: [...f.options.availableArtifacts, f.output], recovery: { ...f.options.recovery!, recoverCapture: async () => null } });
  assert.equal(result.blocked.length, selection.length);
  assert.deepEqual(f.dispatched, []);
  assert.deepEqual(await f.controller.read(), before);
});

test('a blocked root propagates through a previously passed intermediate task in reverse selection order', async t => {
  const f = await fixture(t); await f.register('second', 'code');
  const accepted = await resumeTaskDag({ ...f.options, tasks: [f.plans.get('code')!, f.plans.get('second')!] });
  assert.deepEqual(accepted.blocked, []); assert.ok(accepted.tasks.every(task => task.state === 'passed'));
  await f.register('third', 'second'); f.dispatched.length = 0;
  const before = await f.controller.read();
  const result = await resumeTaskDag({ ...f.options, tasks: ['third', 'second', 'code'].map(id => f.plans.get(id)!),
    availableArtifacts: [...f.options.availableArtifacts, f.output, ...f.plans.get('second')!.expectedArtifacts!],
    recovery: { ...f.options.recovery!, recoverCapture: async () => null } });
  assert.deepEqual(result.blocked.map(item => item.taskId).sort(), ['code', 'second', 'third']);
  assert.deepEqual(f.dispatched, []); assert.deepEqual(await f.controller.read(), before);
});

test('a parent validated in this recovery permits its pending child even when the child is listed first', async t => {
  const f = await fixture(t); await f.register('second', 'code');
  const before = (await f.controller.read()).tasks.find(task => task.taskId === 'code');
  const result = await resumeTaskDag({ ...f.options, tasks: [f.plans.get('second')!, f.plans.get('code')!] });
  assert.deepEqual(result.blocked, []); assert.deepEqual(result.reusedTaskIds, ['code']);
  assert.ok(result.tasks.every(task => task.state === 'passed'));
  assert.deepEqual(f.inspected, ['code']); assert.deepEqual(f.dispatched, ['second:coding', 'second:reviewer']);
  assert.equal(result.tasks.find(task => task.taskId === 'second')?.attempts.length, 1);
  assert.deepEqual((await f.controller.read()).tasks.find(task => task.taskId === 'code'), before);
});
