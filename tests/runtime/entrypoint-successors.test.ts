import assert from 'node:assert/strict';
import test from 'node:test';
import { task as taskFixture, requirement as requirementFixture, run as runFixture } from '../contracts/fixtures.ts';
import type { ArtifactReference, RequirementContract, TaskContract } from '../../src/contracts/index.ts';
import type { PreparedTask } from '../../src/runtime/orchestrator.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import type { RepairFeedback } from '../../src/runtime/repair/feedback.ts';
const successors = await import('../../src/runtime/entrypoint-successors.ts').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });

const now = Date.parse('2026-10-01T01:00:00.000Z');
const planRef = { artifactId: 'native-plan', version: 'v1', location: 'sessions/planning/plan.json' };
const output = (role: string, version = 'v1'): ArtifactReference => ({ artifactId: role === 'art' ? 'media' : role, version, location: `registry/${role}/${version}/files` });

function fixture(failedId = 'design') {
  const requirement = requirementFixture() as RequirementContract;
  requirement.acceptance = ['design', 'art', 'coding'].map(id => ({ acceptanceId: `AC-${id}`, description: `${id} 要求`, steps: [`检查 ${id}`], expected: `${id} 检查通过`, evidenceKinds: ['test_report'] }));
  const weights = { design: 27_000_000, art: 45_000_000, coding: 72_000_000 };
  const originals: PreparedTask[] = ['design', 'art', 'coding'].map((role, index) => {
    const task = taskFixture() as TaskContract, dependencies = index === 0 ? [] : index === 1 ? ['design'] : ['design', 'art'];
    Object.assign(task, { taskId: role, authorId: `${role}-author`, acceptanceIds: [`AC-${role}`], objective: `原始 ${role} 目标`,
      dependsOn: dependencies.map(taskId => ({ taskId, requiredState: 'passed', state: 'not_started' })),
      inputs: [...requirement.sources, ...dependencies.map(id => output(id))],
      context: { contextId: `${role}-context`, rules: ['保留原要求'], interfaces: dependencies.map(id => output(id)), knownFailures: [], tools: ['read', 'write'] },
      ownership: { writePaths: [`authors/${role}`], readOnlyPaths: ['requirements', 'registry'] }, outputs: [{ type: role, schema: `${role}/1`, destination: output(role).location }],
      acceptance: [{ acceptanceId: `AC-${role}`, steps: [`检查 ${role}`], expected: `${role} 检查通过`, evidenceDestinations: [`evidence/${role}/report.json`] }],
      budget: { ledgerId: 'ledger-1', allocationMicroCny: weights[role as keyof typeof weights], originalDeadlineAt: '2026-10-01T12:00:00.000Z' },
      state: 'not_started', stateReason: null, attempts: [], artifacts: [], evidence: [], handoff: { completed: [], remaining: [`原始 ${role} 目标`], uncertainty: [], resumeFrom: null },
      review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] } });
    return { task, role: role as PreparedTask['role'], workspace: 'E:/unit/cosmos', expectedArtifacts: [output(role)] };
  });
  const tasks = originals.map(item => structuredClone(item.task)), failedIndex = tasks.findIndex(task => task.taskId === failedId);
  tasks.forEach((task, index) => {
    task.dependsOn = task.dependsOn.map(dep => ({ ...dep, state: tasks.find(parent => parent.taskId === dep.taskId)!.state }));
    if (index > failedIndex) { task.state = 'waiting_user'; task.stateReason = 'Required dependency has not passed.'; return; }
    task.attempts = [{ attemptId: `${task.taskId}-attempt`, sessionRef: `sessions/${task.taskId}-attempt`, startedAt: '2026-10-01T00:01:00.000Z', endedAt: '2026-10-01T00:02:00.000Z', outcome: index === failedIndex ? 'failed' : 'passed',
      failure: index === failedIndex ? { classification: 'code_defect', summary: '确定性格式失败', reproduction: task.acceptance[0].steps, actual: '缺少字段', expected: task.acceptance[0].expected, evidenceRefs: [`diagnostics/${task.taskId}.json`] } : null }];
    if (index === failedIndex) { task.state = 'failed'; task.stateReason = 'Deterministic host check failed.'; return; }
    task.state = 'passed'; task.artifacts = [output(task.taskId)]; task.handoff = { completed: [task.objective], remaining: [], uncertainty: [], resumeFrom: null };
    task.evidence = [{ contractVersion: '1.0.0', evidenceId: `proof-${task.taskId}`, taskId: task.taskId, acceptanceIds: task.acceptanceIds, kind: 'test_report',
      source: { artifactId: `report-${task.taskId}`, version: 'v1', location: `evidence/${task.taskId}.json` }, artifactVersions: [...task.inputs, ...task.artifacts], outcome: 'passed', recordedAt: '2026-10-01T00:02:00.000Z', summary: '已通过' }];
    task.review = { reviewerId: `reviewer-${task.taskId}`, contextId: `review-${task.taskId}`, inputVersions: [...task.inputs, ...task.artifacts], verdict: 'approved', evidenceIds: [`proof-${task.taskId}`] };
  });
  const allocations = [{ taskId: 'intake', amountMicroCny: 10_000_000 }, { taskId: 'planning', amountMicroCny: 10_000_000 }, ...tasks.map(task => ({ taskId: task.taskId, amountMicroCny: task.budget.allocationMicroCny }))];
  const run = { ...runFixture(), taskIds: allocations.map(item => item.taskId), artifacts: [], fees: { reservedMicroCny: 0, settledMicroCny: 0, unknownRequestIds: [] } } as RunSnapshot['run'];
  const snapshot: RunSnapshot = { formatVersion: 1, revision: 20, run, ledger: { contractVersion: '1.0.0', ledgerId: 'ledger-1', scope: 'generation', limitMicroCny: 200_000_000, warningThresholdPercent: 80, allocations, entries: [] },
    tasks, requests: [], stopReason: null, events: [{ sequence: 1, at: run.originalStartedAt, type: 'created', requestId: null, reason: 'Original run' }] };
  const failed = tasks[failedIndex], attempt = failed.attempts[0];
  const feedback: RepairFeedback = { formatVersion: 1, reference: { artifactId: `repair-feedback-${failedId}`, version: attempt.attemptId, location: `repair-feedback/task-${failedId}-${attempt.attemptId}.json` },
    runId: run.runId, specVersion: requirement.specVersion, sourceTaskId: failedId, sourceAttemptId: attempt.attemptId, sessionRef: attempt.sessionRef, originalDeadlineAt: run.originalDeadlineAt,
    acceptance: structuredClone(failed.acceptance), artifactVersions: [...failed.inputs, ...failed.artifacts],
    issues: [{ acceptanceId: failed.acceptanceIds[0], checkId: 'schema', ...attempt.failure! }], passedChecks: [], charges: [] };
  return { snapshot, originals, requirement, failedId, feedback, originalPlan: planRef, now };
}
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
