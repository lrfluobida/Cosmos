import assert from 'node:assert/strict';
import test from 'node:test';
import type { PreparedTask } from '../../src/runtime/orchestrator.ts';
const successors = await import('../../src/runtime/entrypoint-successors.ts').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });

import { fixture, now, output, planRef } from './entrypoint-successors.fixture.ts';
function targets(f: ReturnType<typeof fixture>) {
  assert.equal(typeof successors.allocateRepairGrants, 'function');
  const selected = f.originals.filter(item => ['design', 'art', 'coding'].indexOf(item.task.taskId) >= ['design', 'art', 'coding'].indexOf(f.failedId));
  const grants = successors.allocateRepairGrants(f.snapshot, selected);
  return selected.map(item => ({ sourceTaskId: item.task.taskId, taskId: `${item.task.taskId}-${item.task.taskId === f.failedId ? 'repair' : 'successor'}`,
    allocationMicroCny: grants[item.task.taskId], outputs: item.task.outputs.map(value => ({ ...value, destination: output(item.role, 'v2').location })), expectedArtifacts: [output(item.role, 'v2')] }));
}

test('only unstarted affected descendants are selected, retaining passed ancestors', () => {
  assert.equal(typeof successors.findUnstartedSuccessors, 'function', 'Explicit successor qualification is required');
  for (const [failedId, expected] of [['design', ['art', 'coding']], ['art', ['coding']], ['coding', []]] as const) {
    const f = fixture(failedId), before = structuredClone(f);
    assert.deepEqual(successors.findUnstartedSuccessors(f.snapshot, f.originals, failedId).map((item: PreparedTask) => item.task.taskId), expected);
    assert.deepEqual(f, before);
  }
});

test('group grants use only unallocated money and keep every old allocation', () => {
  const f = fixture(), before = structuredClone(f.snapshot.ledger);
  assert.equal(typeof successors.allocateRepairGrants, 'function');
  assert.deepEqual(successors.allocateRepairGrants(f.snapshot, f.originals), { design: 6_750_000, art: 11_250_000, coding: 18_000_000 });
  assert.deepEqual(f.snapshot.ledger, before);
  const exhausted = structuredClone(f.snapshot); exhausted.ledger.limitMicroCny = exhausted.ledger.allocations.reduce((sum, item) => sum + item.amountMicroCny, 0);
  assert.throws(() => successors.allocateRepairGrants(exhausted, f.originals), /unallocated|budget/i);
});

test('design repair and both successors retain the original plan and bind precise v2 dependencies', () => {
  const f = fixture(), before = structuredClone(f);
  assert.equal(typeof successors.buildRepairContinuation, 'function');
  const plan = successors.buildRepairContinuation({ ...f, targets: targets(f) });
  assert.equal(plan.formatVersion, 2); assert.deepEqual(plan.originalPlan, planRef);
  assert.deepEqual(plan.replacements.map((item: any) => [item.sourceTaskId, item.replacementTaskId, item.kind]), [
    ['design', 'design-repair', 'repair'], ['art', 'art-successor', 'unstarted_successor'], ['coding', 'coding-successor', 'unstarted_successor'],
  ]);
  const art = plan.tasks.find((item: PreparedTask) => item.role === 'art').task, code = plan.tasks.find((item: PreparedTask) => item.role === 'coding').task;
  assert.deepEqual(art.dependsOn.map((item: any) => item.taskId), ['design-repair']);
  assert.deepEqual(code.dependsOn.map((item: any) => item.taskId), ['design-repair', 'art-successor']);
  assert.deepEqual(code.inputs.slice(1), [output('design', 'v2'), output('art', 'v2')]);
  assert.deepEqual(code.context.interfaces, [output('design', 'v2'), output('art', 'v2')]);
  assert.deepEqual(code.acceptance, f.originals[2].task.acceptance); assert.deepEqual(code.ownership, f.originals[2].task.ownership);
  assert.equal(code.objective, f.originals[2].task.objective); assert.equal(code.budget.originalDeadlineAt, f.snapshot.run.originalDeadlineAt);
  assert.notEqual(code.authorId, f.originals[2].task.authorId); assert.notEqual(code.context.contextId, f.originals[2].task.context.contextId);
  assert.deepEqual(code.attempts, []); assert.deepEqual(code.evidence, []); assert.equal(code.review.verdict, 'pending');
  assert.deepEqual(plan.allocationsBefore, f.snapshot.ledger.allocations); assert.deepEqual(f, before);
});

test('art repair reuses design v1 while coding gets only the media replacement', () => {
  const f = fixture('art'); assert.equal(typeof successors.buildRepairContinuation, 'function');
  const plan = successors.buildRepairContinuation({ ...f, targets: targets(f) });
  assert.deepEqual(plan.tasks[0], f.originals[0]);
  assert.deepEqual(plan.tasks[2].task.inputs.slice(1), [output('design'), output('art', 'v2')]);
  assert.deepEqual(plan.newTaskIds, ['art-repair', 'coding-successor']);
});

for (const record of ['attempt', 'artifact', 'evidence', 'request', 'cancelled', 'unrelated-wait']) test(`a descendant with ${record} cannot receive a fresh first attempt`, () => {
  assert.equal(typeof successors.findUnstartedSuccessors, 'function');
  const f = fixture(), child = f.snapshot.tasks[1];
  if (record === 'attempt') child.attempts = structuredClone(f.snapshot.tasks[0].attempts);
  if (record === 'artifact') child.artifacts = [output('art')];
  if (record === 'evidence') child.evidence = [{ contractVersion: '1.0.0', evidenceId: 'old', taskId: 'art', acceptanceIds: [], kind: 'log', source: output('log'), artifactVersions: [], outcome: 'observed', recordedAt: '2026-10-01T00:03:00.000Z', summary: '已有记录' }];
  if (record === 'request') f.snapshot.ledger.entries.push({ requestId: 'old-request', taskId: 'art', provider: 'fake', pricingVersion: 'v1', reservedMicroCny: 0, settledMicroCny: 0, unknown: false, status: 'cancelled', evidence: [output('receipt')] });
  if (record === 'cancelled') child.state = 'cancelled';
  if (record === 'unrelated-wait') child.stateReason = 'User decision is required.';
  assert.throws(() => successors.findUnstartedSuccessors(f.snapshot, f.originals, 'design'), /unstarted|successor|attempt|request|record|waiting|cancelled/i);
});

for (const reason of ['unknown', 'stop', 'deadline', 'target-collision', 'acceptance-drift']) test(`continuation rejects ${reason} before changing history`, () => {
  const f = fixture(); assert.equal(typeof successors.buildRepairContinuation, 'function'); const offers = targets(f);
  if (reason === 'unknown') f.snapshot.ledger.entries.push({ requestId: 'pending', taskId: 'planning', provider: 'fake', pricingVersion: 'v1', reservedMicroCny: 100, settledMicroCny: 0, unknown: true, status: 'unknown', evidence: [] });
  if (reason === 'stop') f.snapshot.stopReason = { code: 'manual', reason: 'Stopped', at: new Date(now).toISOString() };
  if (reason === 'deadline') f.now = Date.parse(f.snapshot.run.originalDeadlineAt);
  if (reason === 'target-collision') offers[1].taskId = 'design-repair';
  if (reason === 'acceptance-drift') f.snapshot.tasks[1].acceptance[0].expected = '无需检查';
  const before = structuredClone(f.snapshot);
  assert.throws(() => successors.buildRepairContinuation({ ...f, targets: offers })); assert.deepEqual(f.snapshot, before);
});

test('a corrupted original prepared task cannot seed prior outputs into a fresh successor', () => {
  const f = fixture(); assert.equal(typeof successors.buildRepairContinuation, 'function');
  f.originals[1].task.artifacts = [output('art')];
  assert.throws(() => successors.buildRepairContinuation({ ...f, targets: targets(f) }), /original|fresh|prepared/i);
});

test('ambiguous stale interfaces cannot be rebound by artifact ID alone', () => {
  const f = fixture(); assert.equal(typeof successors.buildRepairContinuation, 'function');
  f.originals[2].task.context.interfaces[0] = output('design', 'v0'); f.snapshot.tasks[2].context.interfaces[0] = output('design', 'v0');
  assert.throws(() => successors.buildRepairContinuation({ ...f, targets: targets(f) }), /original input version/i);
});
