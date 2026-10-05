import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { genericHostFixture } from './generic-persistent-host.fixture.ts';
import { task as taskFixture } from '../contracts/fixtures.ts';
import { buildRepairFeedback, failureRecord } from '../../src/runtime/repair/feedback.ts';
import { assessRepair, createLinkedRepairTask, DEFAULT_REPAIR_POLICY } from '../../src/runtime/repair/policy.ts';
import { validateTask } from '../../src/contracts/index.ts';

async function diagnosed(t: test.TestContext, fault: string) {
  const fixture = await genericHostFixture(t, fault), { host, task, controller } = fixture;
  task.evidence = await host.verify(task, controller.signal); assert.equal(task.evidence[0].outcome, 'failed');
  const failure = host.diagnoseFailure!(task, 'host_verification'); assert.ok(failure);
  const snapshot = structuredClone(await controller.read()), base = taskFixture();
  Object.assign(task, { contractVersion: base.contractVersion, kind: base.kind, objective: base.objective, dependsOn: [],
    context: { ...base.context, ...task.context }, ownership: base.ownership, state: 'failed', stateReason: 'Current generic host check failed',
    budget: { ledgerId: snapshot.ledger.ledgerId, allocationMicroCny: 1000, originalDeadlineAt: snapshot.run.originalDeadlineAt }, handoff: base.handoff, review: base.review,
    acceptance: task.acceptance.map((item: any) => ({ acceptanceId: item.acceptanceId, steps: item.steps, expected: item.expected, evidenceDestinations: ['evidence/coding/host-report.json'] })),
    attempts: [{ ...base.attempts[0], ...task.attempts[0], startedAt: snapshot.run.originalStartedAt, endedAt: new Date().toISOString(), outcome: 'failed', failure: failureRecord(failure.issues) }] });
  assert.deepEqual(validateTask(task), []);
  snapshot.tasks = [task]; snapshot.run.taskIds = [task.taskId];
  const feedback = buildRepairFeedback(task, failure, 'host_verification', snapshot);
  const options = { snapshot, requirement: fixture.requirement, history: [feedback], policy: DEFAULT_REPAIR_POLICY, now: Date.now(),
    estimate: { costMicroCny: 1000, durationMs: 60_000, cleanupMs: 5000 } };
  return { ...fixture, failure, feedback, options };
}
for (const fault of ['mismatch', 'sample']) test(`reliable generic ${fault} reaches the existing bounded repair with exact attempt and input versions`, async t => {
  const { root, host, task, failure, feedback, options } = await diagnosed(t, fault);
  assert.ok(failure.issues.every(issue => issue.classification === 'code_defect'));
  assert.equal(assessRepair(options).action, 'repair'); assert.equal(feedback.sourceAttemptId, task.attempts[0].attemptId);
  assert.deepEqual(feedback.artifactVersions, [...task.inputs, ...task.artifacts]); assert.equal(feedback.originalDeadlineAt, options.snapshot.run.originalDeadlineAt);
  assert.ok(feedback.passedChecks.length); assert.ok(task.evidence.some((row: any) => row.source.location.endsWith('/coding-persistent')));
  const raw = JSON.parse(await readFile(join(root, 'evidence/coding/browser.json'), 'utf8'));
  if (fault === 'mismatch') { assert.equal(raw.outcome, 'failed'); assert.equal(failure.issues[0].actual, 'Observed "wrong-save".'); }
  else { assert.equal(raw.outcome, 'passed'); assert.equal(failure.issues[0].actual, 'false'); assert.equal(failure.issues[0].expected, 'true'); }
  const target = await host.repair!(task, feedback); assert.ok(target);
  const repaired = createLinkedRepairTask({ ...options, ...target, source: { task, role: 'coding', workspace: root }, taskId: 'coding-repair' });
  assert.equal(repaired.task.budget.originalDeadlineAt, task.budget.originalDeadlineAt); assert.equal(repaired.task.budget.ledgerId, task.budget.ledgerId);
  assert.deepEqual(repaired.task.inputs, task.inputs); assert.deepEqual(repaired.expectedArtifacts.map(ref => ref.version), ['v2']);
  assert.equal(assessRepair({ ...options, policy: { ...DEFAULT_REPAIR_POLICY, maxRepairTasks: 0 } }).reason, 'repair_limit');
});
for (const fault of ['mismatch-exit', 'request', 'raw']) test(`generic ${fault} stays insufficient evidence and cannot dispatch code repair`, async t => {
  const { feedback, options } = await diagnosed(t, fault);
  assert.ok(feedback.issues.every(issue => issue.classification === 'insufficient_evidence')); assert.equal(assessRepair(options).action, 'collect_evidence');
  assert.equal(feedback.passedChecks.length, 0);
});
for (const fault of ['resume-mismatch', 'resume-mismatch-bad-sample', 'resume-mismatch-bad-request']) test(`generic ${fault} authenticates preceding samples before repair classification`, async t => {
  const { root, task, feedback, options } = await diagnosed(t, fault), validSample = fault === 'resume-mismatch';
  const raw = JSON.parse(await readFile(join(root, 'evidence/coding/browser.json'), 'utf8').catch(() => assert.fail(task.evidence[0].summary)));
  assert.equal(raw.segments.length, 2); assert.equal(raw.segments[1].report.outcome, 'failed'); assert.equal(raw.segments[1].report.mediaObservations, undefined);
  assert.ok(feedback.issues.every(issue => issue.classification === (validSample ? 'code_defect' : 'insufficient_evidence')));
  assert.equal(assessRepair(options).action, validSample ? 'repair' : 'collect_evidence');
  assert.equal(feedback.passedChecks.length > 0, validSample);
  assert.equal(raw.segments[0].report.mediaObservations.values[0], fault === 'resume-mismatch-bad-sample' ? null : 'marker');
});
