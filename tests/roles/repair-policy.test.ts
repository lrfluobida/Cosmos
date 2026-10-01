import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRepairFeedback, HostFailure } from '../../src/runtime/repair/feedback.ts';
import { assessRepair, createLinkedRepairTask, DEFAULT_REPAIR_POLICY } from '../../src/runtime/repair/policy.ts';
import type { HostIssue } from '../../src/runtime/repair/feedback.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import type { TaskContract, RequirementContract } from '../../src/contracts/types.ts';
import { PiSessionError } from '../../src/providers/pi.ts';
import { artifact, task as taskFixture, requirement as requirementFixture } from '../contracts/fixtures.ts';

const now = Date.parse('2026-10-01T01:00:00Z');
const requirement = requirementFixture() as RequirementContract;
function issue(classification: HostIssue['classification'] = 'code_defect', checkId = 'start'): HostIssue {
  return { acceptanceId: 'AC-1', checkId, classification, summary: '正常输入没有启动游戏', reproduction: ['打开固定版本', '点击开始按钮'], actual: '没有响应', expected: '开始游戏', evidenceRefs: ['evidence/report.json'] };
}
function setup() {
  const task = taskFixture() as TaskContract;
  task.dependsOn = []; task.budget.allocationMicroCny = 1000;
  task.state = 'failed'; task.stateReason = 'Host check failed'; task.evidence[0].outcome = 'failed';
  task.attempts[0].outcome = 'failed'; task.attempts[0].failure = { classification: 'code_defect', summary: 'Host check failed', reproduction: ['Click start'], actual: 'No response', expected: 'Started', evidenceRefs: ['evidence/report.json'] };
  const snapshot: RunSnapshot = { formatVersion: 1, revision: 1,
    run: { contractVersion: '1.0.0', runId: task.runId, kind: task.kind, specVersion: task.specVersion, ledgerId: 'ledger-1', originalStartedAt: '2026-10-01T00:00:00.000Z', originalDeadlineAt: task.budget.originalDeadlineAt, state: 'running', taskIds: [task.taskId], fees: { settledMicroCny: 10, reservedMicroCny: 0, unknownRequestIds: [] }, artifacts: [], humanDecisions: [] },
    ledger: { contractVersion: '1.0.0', ledgerId: 'ledger-1', scope: 'validation', limitMicroCny: 10_000, warningThresholdPercent: 80, allocations: [{ taskId: task.taskId, amountMicroCny: 1000 }], entries: [{ requestId: 'paid-original', taskId: task.taskId, provider: 'offline', pricingVersion: 'v1', reservedMicroCny: 0, settledMicroCny: 10, unknown: false, status: 'settled', evidence: [artifact('receipt')] }] },
    tasks: [task], requests: [{ requestId: 'paid-original', admittedAt: '2026-10-01T00:01:00Z' }], stopReason: null, events: [],
  };
  const feedback = buildRepairFeedback(task, new HostFailure([issue()]), 'host_verification', snapshot);
  const options = { snapshot, requirement, history: [feedback], policy: DEFAULT_REPAIR_POLICY, now, estimate: { costMicroCny: 100, durationMs: 1000, cleanupMs: 100 } };
  return { task, snapshot, feedback, options };
}

test('host feedback binds exact acceptance, evidence, costs and original attempt', () => {
  const f = setup();
  assert.deepEqual(f.feedback.acceptance, f.task.acceptance);
  assert.deepEqual(f.feedback.artifactVersions, [...f.task.inputs, ...f.task.artifacts]);
  assert.equal(f.feedback.sourceAttemptId, 'attempt-1');
  assert.equal(f.feedback.charges[0].settledMicroCny, 10);
  assert.throws(() => buildRepairFeedback(f.task, new HostFailure([{ ...issue(), acceptanceId: 'other' }]), 'host_verification', f.snapshot), /acceptance/i);
  const service = buildRepairFeedback(f.task, new PiSessionError('timeout', 'SECRET_SENTINEL'), 'execution', f.snapshot);
  assert.equal(service.issues[0].classification, 'external_service');
  assert.equal(service.issues[0].checkId, 'timeout');
  assert.doesNotMatch(JSON.stringify(service), /SECRET_SENTINEL/);
});

for (const [classification, action] of [['code_defect', 'repair'], ['external_service', 'retry_service'], ['requirement_conflict', 'wait_user'], ['insufficient_evidence', 'collect_evidence']] as const) test(`routes ${classification} to ${action}`, () => {
  const f = setup();
  const feedback = buildRepairFeedback(f.task, new HostFailure([issue(classification)]), 'host_verification', f.snapshot);
  assert.equal(assessRepair({ ...f.options, history: [feedback] }).action, action);
});

for (const reason of ['unknown_charges', 'deadline', 'budget', 'attempt_limit', 'repair_limit', 'cancelled'] as const) test(`stops with preserved gaps for ${reason}`, () => {
  const f = setup();
  if (reason === 'unknown_charges') Object.assign(f.snapshot.ledger.entries[0], { status: 'unknown', unknown: true, reservedMicroCny: 100 });
  if (reason === 'deadline') f.options.now = Date.parse(f.snapshot.run.originalDeadlineAt) - 500;
  if (reason === 'budget') f.options.estimate.costMicroCny = 10_001;
  if (reason === 'attempt_limit') f.options.policy = { ...DEFAULT_REPAIR_POLICY, maxTaskAttempts: 1 };
  if (reason === 'repair_limit') f.options.policy = { ...DEFAULT_REPAIR_POLICY, maxRepairTasks: 0 };
  const decision = assessRepair({ ...f.options, cancelled: reason === 'cancelled' });
  assert.equal(decision.action, 'stop'); assert.equal(decision.reason, reason);
  assert.deepEqual(decision.gaps, f.feedback.issues);
  assert.deepEqual(decision.artifactVersions, f.feedback.artifactVersions);
});

test('linked tasks retain history and fixed requirements without mutating the failed task', () => {
  const f = setup(), before = structuredClone(f.snapshot);
  const linked = createLinkedRepairTask({ ...f.options, source: { task: f.task, role: 'coding', workspace: '/workspace' }, taskId: 'repair-1', allocationMicroCny: 500,
    outputs: [{ type: 'game', schema: 'game/1', destination: 'artifacts/game/v2' }], expectedArtifacts: [artifact('game', 'v2', 'artifacts/game/v2')] });
  assert.equal(linked.task.state, 'not_started');
  assert.deepEqual(linked.task.acceptance, f.task.acceptance);
  assert.deepEqual(linked.task.acceptanceIds, f.task.acceptanceIds);
  assert.equal(linked.task.budget.originalDeadlineAt, f.task.budget.originalDeadlineAt);
  assert.equal(linked.task.context.interfaces.some(ref => ref.artifactId === f.feedback.reference.artifactId && ref.version === f.feedback.reference.version), true);
  assert.deepEqual(f.snapshot, before);
  assert.equal(linked.task.review.verdict, 'pending'); assert.deepEqual(linked.task.evidence, []);

  const repaired = linked.task;
  repaired.state = 'failed'; repaired.stateReason = 'Same input still fails'; repaired.artifacts = [artifact('game', 'v2', 'artifacts/game/v2')];
  repaired.attempts = [{ ...structuredClone(f.task.attempts[0]), attemptId: 'attempt-2', sessionRef: 'sessions/attempt-2.jsonl' }];
  repaired.evidence = [{ ...structuredClone(f.task.evidence[0]), taskId: repaired.taskId, artifactVersions: [...repaired.inputs, ...repaired.artifacts] }];
  f.snapshot.tasks.push(repaired); f.snapshot.run.taskIds.push(repaired.taskId); f.snapshot.ledger.allocations.push({ taskId: repaired.taskId, amountMicroCny: 500 });
  const second = buildRepairFeedback(repaired, new HostFailure([issue()]), 'host_verification', f.snapshot);
  assert.throws(() => assessRepair({ ...f.options, history: [second] }), /history|lineage/i);
  const policy = { maxRepairTasks: 3, maxTaskAttempts: 4, maxNoProgressRounds: 1 };
  const decision = assessRepair({ ...f.options, policy, history: [f.feedback, second] });
  assert.equal(decision.action, 'replan'); assert.equal(decision.reason, 'no_progress');
  assert.equal(assessRepair({ ...f.options, history: [f.feedback, second] }).action, 'stop');
  const earlier = structuredClone(f.feedback); earlier.issues.push(issue('code_defect', 'resource'));
  const improved = structuredClone(second); improved.issues = [issue('code_defect', 'resource')];
  assert.equal(assessRepair({ ...f.options, policy, history: [earlier, improved] }).reason, 'no_progress');
  // Trusted report adapter saw start pass and resource fail; the whole report
  // remains failed and is never replaced by a per-step completion certificate.
  const report = { outcome: 'failed', steps: [{ acceptanceId: 'AC-1', checkId: 'start', outcome: 'passed' }, { acceptanceId: 'AC-1', checkId: 'resource', outcome: 'failed' }] };
  const passedChecks = report.steps.filter(step => step.outcome === 'passed').map(({ acceptanceId, checkId }) => ({ acceptanceId, checkId, evidenceId: repaired.evidence[0].evidenceId }));
  const proven = buildRepairFeedback(repaired, new HostFailure([issue('code_defect', 'resource')], passedChecks), 'host_verification', f.snapshot);
  assert.equal(assessRepair({ ...f.options, policy, history: [f.feedback, proven] }).action, 'repair');
  assert.equal(repaired.evidence[0].outcome, 'failed');
  assert.throws(() => buildRepairFeedback(repaired, new HostFailure([issue('code_defect', 'resource')], [{ acceptanceId: 'AC-1', checkId: 'start', evidenceId: 'missing-pass' }]), 'host_verification', f.snapshot), /passed.*evidence/i);
  const renamed = structuredClone(second); renamed.issues = [issue('code_defect', 'renamed-by-model')];
  assert.equal(assessRepair({ ...f.options, policy, history: [f.feedback, renamed] }).reason, 'no_progress');
});

test('fresh artifact version or rewritten feedback cannot hide unresolved fixed checks', () => {
  const f = setup();
  const tampered = structuredClone(f.feedback); tampered.artifactVersions[0].version = 'other';
  assert.throws(() => assessRepair({ ...f.options, history: [tampered] }), /version|snapshot/i);
  const scope = structuredClone(f.feedback); scope.acceptance[0].expected = 'Anything';
  assert.throws(() => assessRepair({ ...f.options, history: [scope] }), /acceptance|snapshot/i);
  assert.throws(() => createLinkedRepairTask({ ...f.options, source: { task: f.task, role: 'coding', workspace: '/workspace' }, taskId: 'repair-1', allocationMicroCny: 500,
    outputs: f.task.outputs, expectedArtifacts: f.task.artifacts }), /new.*version|version.*new/i);
});
