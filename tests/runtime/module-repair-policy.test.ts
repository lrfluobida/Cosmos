import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateRepairGrants, buildRepairContinuation, findUnstartedSuccessors } from '../../src/runtime/entrypoint-successors.ts';
import { currentModularRepairPolicy } from '../../src/runtime/modular-repair-policy.ts';
import { feedbackReference } from '../../src/runtime/repair/feedback.ts';
import { fixture } from './entrypoint-successors.fixture.ts';

function modular(slot: 'a' | 'b' = 'a') {
  const f = fixture('coding'), code = f.originals[2];
  const modules = (['a', 'b'] as const).map(id => {
    const item = structuredClone(code), task = item.task, acceptanceId = `COSMOS-MODULE-${id.toUpperCase()}`;
    task.taskId = `module-${id}`; task.authorId = `author-${id}`; task.context.contextId = `context-${id}`;
    task.acceptanceIds = [acceptanceId]; task.acceptance = [{ ...task.acceptance[0], acceptanceId }];
    task.ownership.writePaths = [`authors/code-${id}/src/modules/${id}`]; task.budget.allocationMicroCny = 18000000;
    item.expectedArtifacts = [{ artifactId: `module-${id}`, version: 'v1', location: `registry/captures/module-${id}/v1/files` }];
    task.outputs = [{ type: 'code-module', schema: 'modular-code/1', destination: item.expectedArtifacts[0].location }];
    f.requirement.acceptance.push({ ...f.requirement.acceptance[2], acceptanceId });
    return item;
  });
  code.task.budget.allocationMicroCny = 36000000;
  for (const item of modules) {
    code.task.dependsOn.push({ taskId: item.task.taskId, requiredState: 'passed', state: 'not_started' });
    code.task.inputs.push(...item.expectedArtifacts!); code.task.context.interfaces.push(...item.expectedArtifacts!);
  }
  f.originals.splice(2, 0, ...modules);
  const integration = structuredClone(code.task); integration.state = 'waiting_user'; integration.stateReason = 'Required dependency has not passed.';
  const originalPassed = f.snapshot.tasks[1];
  const states = modules.map(item => {
    const task = structuredClone(item.task), failed = task.taskId === `module-${slot}`;
    task.state = failed ? 'failed' : 'passed'; task.stateReason = failed ? 'Deterministic host check failed.' : null;
    task.dependsOn = task.dependsOn.map(dep => ({ ...dep, state: 'passed' }));
    task.attempts = [{ ...structuredClone(f.snapshot.tasks[2].attempts[0]), attemptId: `${task.taskId}-attempt`, sessionRef: `sessions/${task.taskId}-attempt`, outcome: failed ? 'failed' : 'passed' }];
    if (failed) task.attempts[0].failure!.evidenceRefs = [`diagnostics/${task.taskId}.json`];
    else {
      task.attempts[0].failure = null; task.artifacts = structuredClone(item.expectedArtifacts!);
      task.evidence = originalPassed.evidence.map(evidence => ({ ...structuredClone(evidence), taskId: task.taskId, evidenceId: `proof-${task.taskId}`, acceptanceIds: task.acceptanceIds, artifactVersions: [...task.inputs, ...task.artifacts] }));
      task.review = { ...structuredClone(originalPassed.review), inputVersions: [...task.inputs, ...task.artifacts], evidenceIds: task.evidence.map(row => row.evidenceId) };
    }
    return task;
  });
  f.snapshot.tasks.splice(2, 1, ...states, integration);
  f.snapshot.ledger.allocations.splice(4, 1, ...[...modules, code].map(item => ({ taskId: item.task.taskId, amountMicroCny: item.task.budget.allocationMicroCny })));
  f.snapshot.run.taskIds = f.snapshot.ledger.allocations.map(row => row.taskId);
  const failed = states.find(task => task.taskId === `module-${slot}`)!;
  f.failedId = failed.taskId;
  Object.assign(f.feedback, { reference: feedbackReference(failed), sourceTaskId: failed.taskId, sourceAttemptId: failed.attempts[0].attemptId,
    sessionRef: failed.attempts[0].sessionRef, acceptance: structuredClone(failed.acceptance), artifactVersions: [...failed.inputs, ...failed.artifacts],
    issues: [{ acceptanceId: failed.acceptanceIds[0], checkId: 'module-compile', ...failed.attempts[0].failure! }] });
  return f;
}
function proposal(f: ReturnType<typeof modular>) {
  const sources = [f.originals.find(item => item.task.taskId === f.failedId)!, f.originals.at(-1)!], grants = allocateRepairGrants(f.snapshot, sources);
  return { ...f, modulePolicy: currentModularRepairPolicy(), targets: sources.map(item => {
    const old = item.expectedArtifacts![0], ref = { ...old, version: 'v2', location: old.location.replace('/v1/', '/v2/') };
    return { sourceTaskId: item.task.taskId, taskId: `${item.task.taskId}-${item.task.taskId === f.failedId ? 'repair' : 'successor'}`,
      allocationMicroCny: grants[item.task.taskId], outputs: item.task.outputs.map(output => ({ ...output, destination: ref.location })), expectedArtifacts: [ref] };
  }) };
}
test('COS72 both fixed module slots reuse only one original weighted remainder group', () => {
  for (const slot of ['a', 'b'] as const) {
    const f = modular(slot), before = structuredClone(f), plan = buildRepairContinuation(proposal(f));
    assert.deepEqual(plan.replacements.map(row => [row.sourceTaskId, row.kind]), [[`module-${slot}`, 'repair'], ['coding', 'unstarted_successor']]);
    const integration = plan.tasks.at(-1)!.task;
    assert.ok(integration.inputs.some(ref => ref.artifactId === `module-${slot}` && ref.version === 'v2'));
    assert.ok(integration.inputs.some(ref => ref.artifactId === `module-${slot === 'a' ? 'b' : 'a'}` && ref.version === 'v1'));
    assert.deepEqual(plan.allocationsBefore, before.snapshot.ledger.allocations); assert.equal(plan.limitMicroCny, before.snapshot.ledger.limitMicroCny);
    assert.equal(plan.originalDeadlineAt, before.snapshot.run.originalDeadlineAt); assert.deepEqual(f, before);
    assert.throws(() => findUnstartedSuccessors(f.snapshot, f.originals, f.failedId), /Original modular policy/);
  }
});
test('COS72 original integration execution records and original admission limits block the group', () => {
  for (const kind of ['attempt', 'review', 'output', 'request', 'unknown', 'reserved', 'deadline', 'budget', 'stop']) {
    const f = modular(), integration = f.snapshot.tasks.at(-1)!;
    if (kind === 'attempt') integration.attempts = structuredClone(f.snapshot.tasks[2].attempts);
    if (kind === 'review') integration.review.verdict = 'approved';
    if (kind === 'output') integration.artifacts = f.originals.at(-1)!.expectedArtifacts!;
    if (['request', 'unknown', 'reserved'].includes(kind)) f.snapshot.ledger.entries.push({ taskId: kind === 'request' ? integration.taskId : f.failedId, unknown: kind === 'unknown', reservedMicroCny: kind === 'reserved' ? 1 : 0 } as any);
    if (kind === 'deadline') f.now = Date.parse(f.snapshot.run.originalDeadlineAt) - 1000;
    if (kind === 'budget') f.snapshot.ledger.limitMicroCny = f.snapshot.ledger.allocations.reduce((sum, row) => sum + row.amountMicroCny, 0);
    if (kind === 'stop') f.snapshot.stopReason = { code: 'manual', reason: 'fixture stop', at: new Date(f.now).toISOString() };
    assert.throws(() => buildRepairContinuation(proposal(f)), undefined, kind);
  }
});
