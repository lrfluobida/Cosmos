import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { planTaskDag } from '../../src/roles/planner.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
import { assessRepair, createLinkedRepairTask, DEFAULT_REPAIR_POLICY } from '../../src/runtime/repair/policy.ts';
import { HostFailure } from '../../src/runtime/repair/feedback.ts';
import { validationRoutingFixture } from './validation-routing.fixture.ts';

async function failed(t: test.TestContext) {
  const f = await validationRoutingFixture(t), plan = await planTaskDag(f.planning as any);
  const results = await executeTaskDag({ controller: f.controller, validation: f.binding, requirement: f.requirement, tasks: plan.tasks,
    sessionRoot: f.planning.sessionRoot, availableArtifacts: [f.source], roleFactory: f.roleFactory, capture: f.capture,
    verify: async task => (await f.verify(task)).map(evidence => ({ ...evidence, outcome: task.taskId.endsWith('-coding') ? 'failed' : evidence.outcome })),
    diagnoseFailure: task => new HostFailure([{ acceptanceId: task.acceptanceIds[0], checkId: 'offline-code', classification: 'code_defect', summary: 'Offline source fixture defect',
      reproduction: ['Read the offline failed host report'], actual: 'Offline failure', expected: 'Offline check passes', evidenceRefs: task.evidence.map(item => item.source.location) }]),
    recovery: f.recovery, reviewProtocolCorrections: 1 });
  const source = { ...plan.tasks[2], task: results[2] }, feedback = JSON.parse(await readFile(join(source.task.attempts[0].sessionRef, 'failure.json'), 'utf8'));
  return { ...f, source, feedback };
}
test('validation repair evaluates its real case deadline and retained repair grant while original stop stays fixed', async t => {
  const f = await failed(t), snapshot = await f.controller.read();
  assert.ok(snapshot.stopReason); assert.ok(Date.parse(snapshot.run.originalDeadlineAt) < Date.now());
  const options = { snapshot, requirement: f.requirement, validation: f.binding, history: [f.feedback], policy: DEFAULT_REPAIR_POLICY, now: Date.now(), estimate: { costMicroCny: 1000, durationMs: 1000, cleanupMs: 100 } };
  assert.equal(assessRepair(options as any).action, 'repair');
  assert.ok(f.source.task.attempts[0].failure!.evidenceRefs.includes(f.feedback.reference.location));
  const claimed = await f.controller.claimValidationRepair({ sourceTaskId: f.source.task.taskId, feedback: f.feedback.reference });
  const current = await f.controller.read();
  const repair = createLinkedRepairTask({ ...options, snapshot: current, source: f.source, taskId: claimed.taskId,
    allocationMicroCny: current.validation!.cases[0].quote.declaration.grants.repair.amountMicroCny,
    outputs: [{ ...f.source.task.outputs[0], destination: 'registry/captures/coding/v2/files' }], expectedArtifacts: [{ artifactId: 'coding', version: 'v2', location: 'registry/captures/coding/v2/files' }] } as any);
  assert.equal(repair.task.taskId, claimed.taskId); assert.equal(repair.task.attempts.length, 0); assert.notEqual(repair.task.authorId, f.source.task.authorId);
  assert.deepEqual(repair.task.acceptance, f.source.task.acceptance); assert.equal(repair.task.budget.originalDeadlineAt, snapshot.run.originalDeadlineAt);
  assert.deepEqual(current.stopReason, snapshot.stopReason); assert.deepEqual(current.ledger, snapshot.ledger);
  await assert.rejects(f.controller.claimValidationRepair({ sourceTaskId: current.validation!.cases[0].quote.declaration.grants.art.taskId, feedback: f.feedback.reference }), /already/);
});

test('validation repair cannot use legacy policy authority or another case and cannot ignore the actual case cutoff', async t => {
  const f = await failed(t), snapshot = await f.controller.read(), options = { snapshot, requirement: f.requirement, history: [f.feedback], policy: DEFAULT_REPAIR_POLICY,
    now: Date.now(), estimate: { costMicroCny: 1000, durationMs: 1000, cleanupMs: 100 } };
  assert.throws(() => assessRepair(options as any), /validation|profile/i);
  assert.throws(() => assessRepair({ ...options, validation: { caseId: 'wrong', windowId: f.window.windowId } } as any), /case|validation/i);
  assert.equal(assessRepair({ ...options, validation: f.binding, now: Date.parse(f.window.deadlineAt) } as any).reason, 'deadline');
});

test('failed feedback persistence cannot publish a repair reference or claim', async t => {
  const f = await validationRoutingFixture(t), plan = await planTaskDag(f.planning as any);
  await assert.rejects(executeTaskDag({ controller: f.controller, validation: f.binding, requirement: f.requirement, tasks: plan.tasks,
    sessionRoot: f.planning.sessionRoot, availableArtifacts: [f.source], roleFactory: f.roleFactory, capture: f.capture,
    verify: async task => {
      const evidence = await f.verify(task);
      if (task.taskId.endsWith('-coding')) { await mkdir(join(task.attempts[0].sessionRef, 'failure.json')); return evidence.map(item => ({ ...item, outcome: 'failed' as const })); }
      return evidence;
    }, recovery: f.recovery, reviewProtocolCorrections: 1 }), /EEXIST/);
  const state = await f.controller.read(), coding = state.tasks.find(task => task.taskId.endsWith('-coding'))!;
  assert.equal(coding.attempts[0].failure, null); assert.equal(state.validation!.cases[0].repair, null);
  assert.equal(state.events.some(event => event.type === 'validation_repair_claimed'), false);
});
