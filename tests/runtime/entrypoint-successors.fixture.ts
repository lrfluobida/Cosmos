import { task as taskFixture, requirement as requirementFixture, run as runFixture } from '../contracts/fixtures.ts';
import type { ArtifactReference, RequirementContract, TaskContract } from '../../src/contracts/index.ts';
import type { PreparedTask } from '../../src/runtime/orchestrator.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import type { RepairFeedback } from '../../src/runtime/repair/feedback.ts';

export const now = Date.parse('2026-10-01T01:00:00.000Z');
export const planRef = { artifactId: 'native-plan', version: 'v1', location: 'sessions/planning/plan.json' };
export const output = (role: string, version = 'v1'): ArtifactReference => ({ artifactId: role === 'art' ? 'media' : role, version, location: `registry/${role}/${version}/files` });

export function fixture(failedId = 'design') {
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
