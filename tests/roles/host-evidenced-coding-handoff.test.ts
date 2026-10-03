import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { executeTaskDag, resumeTaskDag } from '../../src/runtime/orchestrator.ts';
import type { AuthorProposal, DagOptions } from '../../src/runtime/orchestrator.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import { createRoleBudget } from '../../src/roles/provider-budget.ts';
import { requestReservation } from '../../probes/e2e/admission.ts';
import { RecoveryBlocked, TaskJournal } from '../../src/runtime/recovery/task-journal.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import type { RunSnapshot } from '../../src/runtime/run.ts';
import { HostFailure } from '../../src/runtime/repair/feedback.ts';
import { assessRepair, DEFAULT_REPAIR_POLICY } from '../../src/runtime/repair/policy.ts';
import { validationRoutingFixture } from '../runtime/validation-routing.fixture.ts';

// Generated proposal only. All SDK/host activity below is explicitly fake and local.
const native: AuthorProposal = JSON.parse(await readFile(new URL('./fixtures/native-case-six-coding-proposal.json', import.meta.url), 'utf8'));
const hash = 'bc487d279c99e6ce1763d44b6879be26e3946a81a71854e9a4a00d7e8d134936';
const movedConcern = "I cannot execute a browser here, so whether Phaser 3.90's load.svg rasterizes the host-rendered SVG frames at the registered /assets paths (and thus whether idle/attack/death frames become visible) is unverified by me; missing textures degrade to __MISSING rather than crashing, but the visual check needs the host run.";

async function setup(t: test.TestContext, mode = 'approved', enabled?: 0 | 1) {
  const f = await validationRoutingFixture(t), planned = await planTaskDag(f.planning), stages: string[] = [];
  let reviewCalls = 0, authorCalls = 0, followups = 0;
  const options: DagOptions & { hostEvidencedCodingHandoff?: 0 | 1 } = {
    controller: f.controller, validation: f.binding, requirement: f.requirement, tasks: planned.tasks,
    sessionRoot: f.planning.sessionRoot, availableArtifacts: [f.source], recovery: f.recovery, reviewProtocolCorrections: 1,
    ...(enabled !== undefined ? { hostEvidencedCodingHandoff: enabled } : {}),
    ...(['scope', 'format-original'].includes(mode) ? { codingHandoffClarifications: 1 as const, authorProtocolCorrections: 1 as const } : {}),
    roleFactory: async input => {
      const role = await f.roleFactory(input);
      if (input.role === 'coding') return { ...role, async prompt(text, supplied) {
        authorCalls++; await role.prompt(text, supplied);
        if (mode === 'unknown-charge') {
          const budget = createRoleBudget({ controller: f.controller, taskId: input.task.taskId, evidenceDirectory: input.stateDirectory,
            validation: { caseId: f.window.caseId, windowId: f.window.windowId, purpose: 'author' } });
          const request = { requestId: 'offline-unknown-concern', modelId: 'deepseek-flash' as const, maxOutputTokens: 65536, inputBytes: 100, hasImages: false };
          await budget.beforeRequest({ ...request, estimatedMaxCostMicroCny: requestReservation(request) });
        }
        return { text: mode === 'format-original' ? 'Invalid prose claiming a browser concern; not structured source facts.' : JSON.stringify(mode === 'remaining' ? { ...native, remaining: ['真实未完成的编码工作'] }
          : mode === 'scope' ? { ...native, uncertainty: [...native.uncertainty, movedConcern] } : native) };
      }, async readonlyPrompt(_text, supplied) {
        supplied?.signal?.throwIfAborted(); followups++;
        const budget = createRoleBudget({ controller: f.controller, taskId: input.task.taskId, evidenceDirectory: input.stateDirectory,
          validation: { caseId: f.window.caseId, windowId: f.window.windowId, purpose: 'author' } });
        const request = { requestId: 'offline-concern-followup', modelId: 'deepseek-flash' as const, maxOutputTokens: 65536, inputBytes: 100, hasImages: false };
        await budget.beforeRequest({ ...request, estimatedMaxCostMicroCny: requestReservation(request) });
        await budget.afterResponse({ requestId: request.requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
        return { text: JSON.stringify(native) };
      } };
      if (input.role !== 'reviewer' || !input.task.taskId.endsWith('-coding')) return role;
      stages.push('review');
      assert.deepEqual(input.task.handoff.uncertainty, mode === 'scope' ? [...native.uncertainty, movedConcern] : native.uncertainty);
      return { ...role, ...(mode === 'review-context' ? { contextId: input.task.context.contextId } : mode === 'review-author' ? { actorId: input.task.authorId } : mode === 'invalid-final' ? { actorId: '' } : {}), async prompt(text, supplied) {
        reviewCalls++; await role.prompt(text, supplied);
        const current = (await f.controller.read()).tasks.find(task => task.taskId === input.task.taskId)!;
        assert.deepEqual(current.handoff.uncertainty, mode === 'scope' ? [...native.uncertainty, movedConcern] : native.uncertainty);
        assert.equal(current.attempts.at(-1)!.outcome, 'running');
        const packet = (input as any).codingConcernReview;
        const concernResolutions = packet?.concerns.map((concern: any) => ({ concernId: concern.concernId, concernText: concern.text,
          status: mode === 'unresolved' || mode === 'requested' ? 'unresolved' : 'resolved', basis: 'host_evidence',
          rationale: 'Offline independent decision cites the current fake host report; no game claim.',
          acceptanceIds: input.task.acceptanceIds, inputVersions: [...input.task.inputs, ...input.task.artifacts],
          evidenceIds: input.task.evidence.filter(e => e.outcome === 'passed').map(e => e.evidenceId),
          evidenceRefs: input.task.evidence.filter(e => e.outcome === 'passed').map(e => e.source) }));
        return { text: mode === 'invalid-json' ? '{}' : JSON.stringify({ verdict: mode === 'requested' ? 'changes_requested' : 'approved', inputVersions: [...input.task.inputs, ...input.task.artifacts],
          evidenceIds: mode === 'duplicate-evidence' || mode === 'duplicate-corrected' && reviewCalls === 1 ? [input.task.evidence[0].evidenceId, input.task.evidence[0].evidenceId] : input.task.evidence.map(e => e.evidenceId),
          findings: mode === 'requested' ? ['Current concern remains unresolved.'] : [], ...(mode === 'missing-resolutions' ? {} : { concernResolutions }) }) };
      } };
    },
    capture: async task => { if (task.taskId.endsWith('-coding')) stages.push('capture'); return f.capture(task); },
    verify: async task => {
      if (task.taskId.endsWith('-coding')) stages.push('verify');
      const evidence = await f.verify(task);
      if (!task.taskId.endsWith('-coding')) return evidence;
      if (mode === 'failed-host') return evidence.map(e => ({ ...e, outcome: 'failed' as const }));
      if (mode === 'additional-failed') return [...evidence, { ...evidence[0], evidenceId: 'offline-additional-failed', outcome: 'failed' as const }];
      if (mode === 'missing-host') return evidence.map(e => ({ ...e, outcome: 'observed' as const }));
      if (mode === 'observed') return [...evidence, { ...evidence[0], evidenceId: 'offline-observation', kind: 'log' as const, outcome: 'observed' as const }];
      return evidence;
    },
    ...(mode === 'failed-host' ? { diagnoseFailure: task => new HostFailure([{ acceptanceId: task.acceptanceIds[0], checkId: 'offline-defect',
      classification: 'code_defect', summary: 'Offline fixture code defect', reproduction: ['Read current fake host report'],
      actual: 'Offline failure', expected: 'Offline pass', evidenceRefs: task.evidence.map(e => e.source.location) }]) } : {}),
  };
  const coding = () => f.controller.read().then(s => s.tasks.find(task => task.taskId.endsWith('-coding'))!);
  const receipt = async (name: string) => JSON.parse(await readFile(join(f.recovery.journalRoot, `task-${f.window.caseId}-coding`, `${name}.json`), 'utf8'));
  return { ...f, options, coding, receipt, stages, counts: () => ({ reviewCalls, authorCalls, followups }) };
}

test('fixed native case6 proposal reaches host and independent concern resolutions without author clarification', async t => {
  assert.equal(createHash('sha256').update(JSON.stringify(native)).digest('hex'), hash);
  const f = await setup(t, 'approved', 1); await executeTaskDag(f.options);
  const task = await f.coding(); assert.equal(task.state, 'passed');
  assert.deepEqual(f.stages, ['capture', 'verify', 'review']); assert.deepEqual(task.handoff.uncertainty, []);
  const pending = (await f.receipt('coding-concerns')).value;
  assert.deepEqual(pending.originalProposal, native); assert.equal(pending.originalProposalSha256, hash);
  assert.deepEqual(pending.concerns.map((c: any) => c.text), native.uncertainty);
  assert.equal((await f.receipt('review')).value.verdict.concernResolutions.length, native.uncertainty.length);
  const calls = f.counts(); await resumeTaskDag(f.options); assert.deepEqual(f.counts(), calls);
  const state = await f.controller.read(); assert.deepEqual(state.ledger.entries.slice(0, f.original.ledger.entries.length), f.original.ledger.entries);
  assert.equal(state.run.originalDeadlineAt, f.original.run.originalDeadlineAt);
});

for (const enabled of [undefined, 0] as const) test(`old missing/zero policy preserves unresolved failure and origin: ${enabled}`, async t => {
  const f = await setup(t, 'approved', enabled); await executeTaskDag(f.options);
  assert.equal((await f.coding()).state, 'failed'); assert.deepEqual(f.stages, ['capture']);
  assert.equal(Object.hasOwn(await f.receipt('origin'), 'hostEvidencedCodingHandoff'), false);
});

for (const mode of ['remaining', 'unresolved', 'requested', 'missing-resolutions', 'failed-host', 'additional-failed', 'missing-host', 'observed', 'invalid-json', 'review-context', 'review-author']) test(`host evidenced handoff handles ${mode}`, async t => {
  const f = await setup(t, mode, 1); await executeTaskDag(f.options); const task = await f.coding();
  assert.equal(task.state, mode === 'observed' ? 'passed' : mode === 'requested' ? 'needs_changes' : ['unresolved', 'missing-resolutions', 'invalid-json'].includes(mode) ? 'waiting_user' : 'failed');
  if (mode !== 'observed') assert.deepEqual(task.handoff.uncertainty.slice(0, native.uncertainty.length), native.uncertainty);
  if (mode === 'remaining') assert.deepEqual(f.stages, ['capture']);
  if (mode === 'failed-host') {
    assert.deepEqual(f.stages, ['capture', 'verify']); assert.equal(task.attempts[0].failure!.classification, 'code_defect');
    const feedback = JSON.parse(await readFile(join(task.attempts[0].sessionRef, 'failure.json'), 'utf8'));
    assert.equal(assessRepair({ snapshot: await f.controller.read(), requirement: f.requirement, validation: f.binding,
      history: [feedback], policy: DEFAULT_REPAIR_POLICY, now: Date.now(), estimate: { costMicroCny: 1000, durationMs: 1000, cleanupMs: 100 } }).action, 'repair');
  }
});

for (const mode of ['scope', 'format-original']) test(`original concern source is preserved without guessing invalid author prose: ${mode}`, async t => {
  assert.ok(native.summary.includes(movedConcern));
  const f = await setup(t, mode, 1); await executeTaskDag(f.options); assert.equal((await f.coding()).state, 'passed');
  assert.equal(f.counts().followups, 1); const receipt = (await f.receipt('coding-concerns')).value;
  assert.deepEqual(receipt.concerns.map((c: any) => c.text), mode === 'scope' ? [...native.uncertainty, movedConcern] : native.uncertainty);
  const before = f.counts(); await resumeTaskDag(f.options); assert.deepEqual(f.counts(), before);
});

for (const stage of ['coding-concerns', 'verify-started', 'verified', 'review-started', 'review'] as const) test(`concern recovery from ${stage} never repeats author, host or paid review`, async t => {
  const f = await setup(t, 'approved', 1), write = TaskJournal.prototype.write;
  const crash = mock.method(TaskJournal.prototype, 'write', async function(this: TaskJournal, name: Parameters<TaskJournal['write']>[0], attemptId: string, value: any) {
    await write.call(this, name, attemptId, value);
    if (name === stage && (this as any).taskId.endsWith('-coding')) throw new RecoveryBlocked('Offline durable interruption.');
  });
  await executeTaskDag(f.options); crash.mock.restore();
  const before = f.counts(), hostCalls = f.stages.filter(s => s === 'verify').length;
  const report = await resumeTaskDag(f.options);
  if (stage === 'verify-started' || stage === 'review-started') assert.ok(report.blocked.some(b => /started without/.test(b.reason)));
  else assert.equal((await f.coding()).state, 'passed');
  assert.equal(f.counts().authorCalls, before.authorCalls);
  assert.ok(f.counts().reviewCalls - before.reviewCalls <= (stage === 'coding-concerns' || stage === 'verified' ? 1 : 0));
  assert.equal(f.stages.filter(s => s === 'verify').length - hostCalls, stage === 'coding-concerns' ? 1 : 0);
});

test('passed concern mapping tampering cannot bypass stored review during reuse', async t => {
  const f = await setup(t, 'approved', 1); await executeTaskDag(f.options);
  const receipt = await f.receipt('review'); receipt.value.verdict.concernResolutions[0].concernText = 'changed';
  await writeFile(join(f.recovery.journalRoot, `task-${f.window.caseId}-coding`, 'review.json'), JSON.stringify(receipt), 'utf8');
  const before = f.counts(); await assert.rejects(resumeTaskDag(f.options), /concern|verdict|review/i); assert.deepEqual(f.counts(), before);
});

test('pending unknown author charge blocks capture and host activity under the new policy', async t => {
  const f = await setup(t, 'unknown-charge', 1); await executeTaskDag(f.options);
  assert.deepEqual(f.stages, []); assert.equal(f.counts().reviewCalls, 0);
});

for (const mode of ['duplicate-evidence', 'duplicate-corrected', 'invalid-final']) test(`new policy keeps raw pending concerns until a valid final decision: ${mode}`, async t => {
  const f = await setup(t, mode, 1); await executeTaskDag(f.options); const task = await f.coding();
  if (mode === 'duplicate-corrected') {
    assert.equal(task.state, 'passed'); assert.equal(f.counts().reviewCalls, 2); assert.deepEqual(task.handoff.uncertainty, []);
  } else {
    assert.equal(task.state, 'waiting_user'); assert.equal(task.review.verdict, 'pending');
    assert.notEqual(task.attempts.at(-1)!.outcome, 'passed'); assert.deepEqual(task.handoff.uncertainty.slice(0, native.uncertainty.length), native.uncertainty);
    if (mode === 'duplicate-evidence') assert.equal(f.counts().reviewCalls, 2);
  }
});

test('valid new coding completion publishes attempt, concern resolution and independent verdict together', async t => {
  const f = await setup(t, 'approved', 1), write = SnapshotStore.prototype.write;
  const snapshots: any[] = [];
  t.mock.method(SnapshotStore.prototype, 'write', async function(this: SnapshotStore, value: Parameters<SnapshotStore['write']>[0]) {
    await write.call(this, value);
    const task = (value as RunSnapshot).tasks.find(task => task.taskId.endsWith('-coding'));
    if (task) snapshots.push(structuredClone(task));
  });
  await executeTaskDag(f.options); assert.equal((await f.coding()).state, 'passed');
  const completed = snapshots.filter(task => task.attempts.at(-1)?.outcome === 'passed'); assert.equal(completed.length, 1);
  assert.equal(completed[0].review.verdict, 'approved'); assert.equal(completed[0].state, 'passed'); assert.deepEqual(completed[0].handoff.uncertainty, []);
});

test('atomic coding completion rejects stale task, authority, identity and final contracts without a snapshot write', async t => {
  const f = await setup(t, 'approved', 1), write = TaskJournal.prototype.write;
  const crash = mock.method(TaskJournal.prototype, 'write', async function(this: TaskJournal, name: Parameters<TaskJournal['write']>[0], attemptId: string, value: any) {
    await write.call(this, name, attemptId, value);
    if (name === 'review' && value.verdict?.concernResolutions) throw new RecoveryBlocked('Offline interruption before final transaction.');
  });
  await executeTaskDag(f.options); crash.mock.restore();
  const pending = await f.coding(), review = (await f.receipt('review')).value;
  const completion = structuredClone(pending);
  completion.attempts.at(-1)!.endedAt = review.completedAt; completion.attempts.at(-1)!.outcome = 'passed'; completion.handoff.remaining = []; completion.handoff.uncertainty = [];
  const reviewed = structuredClone(completion);
  reviewed.review = { reviewerId: review.reviewerId, contextId: review.contextId, inputVersions: review.verdict.inputVersions, verdict: 'approved', evidenceIds: review.verdict.evidenceIds }; reviewed.state = 'passed';
  const input = { caseId: f.window.caseId, windowId: f.window.windowId, requirement: f.requirement, expectedPrevious: pending, completion, reviewed,
    reviewerId: review.reviewerId, contextId: review.contextId };
  const before = await f.controller.read();
  for (const mode of ['stale-task', 'case', 'window', 'role', 'actor', 'context', 'requirement', 'system-scope', 'final-contract']) {
    const invalid = structuredClone(input);
    if (mode === 'stale-task') invalid.expectedPrevious.handoff.uncertainty = [];
    else if (mode === 'case') invalid.caseId = 'old-case';
    else if (mode === 'window') invalid.windowId = 'old-window';
    else if (mode === 'role') invalid.expectedPrevious = before.tasks.find(task => task.taskId.endsWith('-design'))!;
    else if (mode === 'actor') invalid.reviewerId = pending.authorId;
    else if (mode === 'context') invalid.contextId = pending.context.contextId;
    else if (mode === 'requirement') invalid.requirement.validation.frozenCaseInputHash = 'changed';
    else if (mode === 'system-scope') invalid.completion.evidence = [];
    else invalid.reviewed.review.evidenceIds.push(invalid.reviewed.review.evidenceIds[0]);
    await assert.rejects(f.controller.saveValidationReviewCompletion(invalid)); assert.deepEqual(await f.controller.read(), before);
  }
  const budget = createRoleBudget({ controller: f.controller, taskId: pending.taskId, evidenceDirectory: pending.attempts[0].sessionRef,
    validation: { caseId: f.window.caseId, windowId: f.window.windowId, purpose: 'reviewer' } });
  const request = { requestId: 'offline-completion-pending', modelId: 'deepseek-flash' as const, maxOutputTokens: 16384, inputBytes: 100, hasImages: false };
  await budget.beforeRequest({ ...request, estimatedMaxCostMicroCny: requestReservation(request) });
  const unresolved = await f.controller.read(); await assert.rejects(f.controller.saveValidationReviewCompletion(input)); assert.deepEqual(await f.controller.read(), unresolved);
  await f.controller.stop('Offline cancelled completion');
  const stopped = await f.controller.read(); await assert.rejects(f.controller.saveValidationReviewCompletion(input)); assert.deepEqual(await f.controller.read(), stopped);
});
