import assert from 'node:assert/strict';
import { readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';
import { readConfirmedGeneration } from '../../src/cli/session.ts';
import { readRunSnapshot } from '../../src/cli/control.ts';
import { readCompletedGeneration } from '../../src/runtime/experience.ts';

for (const modular of [false, true]) test(`ordinary ${modular ? 'five' : 'three'} task generation consumes the independently reviewed captured plan`, async t => {
  const f = await ordinaryHostFixture(t, { modular }), result: any = await f.execute();
  assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps));
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.tasks.filter((task: any) => task.state === 'passed').length, modular ? 5 : 3);
  assert.equal(f.plays.length, 1); assert.deepEqual(f.plays[0].plan.steps.filter((step: any) => !step.id.startsWith('host-media-')), f.scenario.steps);
  assert.ok(f.plays[0].plan.steps.some((step: any) => step.id.startsWith('host-media-')), 'The original media consumer stays connected.');
  assert.deepEqual(f.plays[0].plan.artifact, result.acceptedCandidate.candidateRef);
  assert.deepEqual(result.acceptanceScope.experienceCriteria, f.draft.experienceCriteria);
  assert.equal(result.userExperience, 'not_confirmed'); assert.deepEqual(state.ledger.entries, []);
  assert.ok(f.checks.every(value => JSON.parse(value.content[0].text).passed));
  assert.ok(f.packets.filter(packet => packet.role === 'reviewer').every(packet => packet.ownership.writePaths.length === 0));
});
for (const fault of ['review', 'review-receipt', 'plan-drift', 'candidate', 'source', 'capability']) test(`ordinary ${fault} rejects unapproved or mismatched consumption`, async t => {
  const f = await ordinaryHostFixture(t, { fault }), result: any = await f.execute();
  assert.equal(result.acceptedCandidate, undefined);
  if (fault === 'review' || fault === 'source' || fault === 'capability') assert.equal(f.packets.filter(packet => packet.role === 'art').length, 0);
  if (fault === 'review-receipt' || fault === 'plan-drift') assert.equal(f.packets.filter(packet => packet.role === 'coding').length, 0);
  if (fault !== 'candidate') assert.equal(f.plays.length, 0);
  else assert.equal(f.plays.length, 1);
  if (fault === 'review-receipt' || fault === 'plan-drift') assert.equal(f.packets.filter(packet => packet.role === 'art').length, 1);
  if (fault === 'source' || fault === 'capability') {
    const state: any = await readRunSnapshot(f.root), design = state.tasks.find((task: any) => task.taskId === 'design-task');
    const feedback = JSON.parse(await readFile(join(design.attempts[0].sessionRef, 'failure.json'), 'utf8'));
    assert.equal(feedback.issues[0].classification, 'insufficient_evidence'); assert.equal(state.tasks.some((task: any) => task.taskId.includes('repair')), false);
  }
});
for (const fault of ['missing', 'json', 'coverage']) test(`ordinary ${fault} plan keeps original design defect repair and successor bounds`, async t => {
  const f = await ordinaryHostFixture(t, { fault }), result: any = await f.execute();
  assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps));
  const state: any = await readRunSnapshot(f.root), design = state.tasks.find((task: any) => task.taskId === 'design-task');
  const feedback = JSON.parse(await readFile(join(design.attempts[0].sessionRef, 'failure.json'), 'utf8'));
  assert.equal(feedback.issues[0].classification, 'code_defect');
  assert.equal(feedback.issues[0].checkId, `role-output-${fault === 'missing' ? 'missing_output' : fault === 'json' ? 'invalid_json' : 'invalid_schema'}`);
  assert.equal(state.tasks.filter((task: any) => task.taskId === 'design-task-repair').length, 1);
  assert.equal(state.tasks.filter((task: any) => task.taskId.includes('repair')).length, 1);
  assert.equal(result.ordinaryExecution.design.version, 'v2'); assert.equal(f.plays.length, 1);
  assert.equal(state.ledger.limitMicroCny, 200000000); assert.deepEqual(state.ledger.entries, []);
});
test('completed ordinary recovery refuses a missing original design approval receipt', async t => {
  const f = await ordinaryHostFixture(t), result: any = await f.execute(); assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps));
  const state: any = await readRunSnapshot(f.root), { requirement } = await readConfirmedGeneration(f.root, state);
  const before = await readFile(join(f.root, 'snapshot.json')), path = join(f.root, 'journal/task-design-task/review-started.json');
  const now = Date.now; Date.now = () => Date.parse(state.run.originalDeadlineAt) + 60000;
  try { assert.equal((await readCompletedGeneration(f.root, requirement))!.reportedAt, result.reportedAt); }
  finally { Date.now = now; }
  await rename(path, `${path}.preserved`);
  await assert.rejects(readCompletedGeneration(f.root, requirement), /ordinary|approval|review|receipt/i);
  assert.ok((await readFile(join(f.root, 'snapshot.json'))).equals(before));
});
test('ordinary cold recovery reuses approved design and refuses missing plan or approval without redrafting', async t => {
  const f = await ordinaryHostFixture(t, { pause: true }), initial: any = await f.execute();
  assert.equal(initial.tasks.filter((task: any) => task.state === 'passed').length, 2);
  const before: any = await readRunSnapshot(f.root), confirmed = await readConfirmedGeneration(f.root, before), count = f.packets.length;
  for (const file of ['registry/captures/design/v1/files/_cosmos/acceptance-plan.json', 'journal/task-design-task/review-started.json']) {
    const path = join(f.root, file); await rename(path, `${path}.preserved`);
    const refused: any = await f.host.execute({ root: f.root, ...confirmed, resume: true });
    assert.equal(refused.acceptedCandidate, undefined); assert.equal(f.packets.length, count);
    await rename(`${path}.preserved`, path);
  }
  const completed: any = await f.host.execute({ root: f.root, ...confirmed, resume: true });
  assert.ok(completed.acceptedCandidate, JSON.stringify(completed.gaps));
  const after: any = await readRunSnapshot(f.root);
  assert.equal(f.packets.filter(packet => packet.role === 'design').length, 1);
  assert.equal(after.run.originalStartedAt, before.run.originalStartedAt); assert.equal(after.run.originalDeadlineAt, before.run.originalDeadlineAt);
  assert.deepEqual(after.ledger, before.ledger);
});
test('ordinary candidate v2 repair consumes the original approved plan', async t => {
  const f = await ordinaryHostFixture(t, { fault: 'code-repair' }), result: any = await f.execute();
  assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps));
  assert.equal(result.acceptedCandidate.candidateRef.version, 'v2'); assert.equal(result.ordinaryExecution.design.version, 'v1');
  assert.equal(f.packets.filter(packet => packet.role === 'design').length, 1);
  assert.deepEqual(f.plays[0].plan.steps.filter((step: any) => !step.id.startsWith('host-media-')), f.scenario.steps);
});
test('ordinary persistent consumer uses the approved two-stage plan with raw evidence', async t => {
  const f = await ordinaryHostFixture(t, { persistent: true }), result: any = await f.execute();
  assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps)); assert.equal(f.plays.length, 1);
  const series = f.plays[0].series;
  assert.deepEqual(series.segments[0].plan.steps, f.scenario.steps); assert.deepEqual(series.segments[1].plan.steps, f.scenario.reopen!.steps);
  assert.deepEqual(series.binding.candidate, result.acceptedCandidate.candidateRef); assert.equal(result.mediaUsage, 'evidence/coding-task/media-usage.json');
});
test('ordinary selected render sampling preserves its plan binding and separate unexecuted performance status', async t => {
  const f = await ordinaryHostFixture(t, { renderFrames: true }), result: any = await f.execute();
  assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps)); assert.equal(f.plays.length, 1);
  const request = f.plays[0].options.renderFrames; assert.ok(request);
  assert.deepEqual(request.candidate, f.plays[0].plan.artifact); assert.equal(request.design.artifactId, 'design');
  assert.equal(request.observer.artifactId, 'render-frame-observer');
  const report = JSON.parse(await readFile(join(f.root, 'evidence/coding-task/render-frames.json'), 'utf8'));
  assert.equal(report.performancePolicy, 'not_executed'); assert.equal(report.samples[0].assessment.status, 'insufficient_evidence');
});
test('ordinary classic scopes defer scenario and viewport until the reviewed design plan', async t => {
  const f = await ordinaryHostFixture(t, { classic: true }), result: any = await f.execute();
  assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps)); assert.equal(result.outcome, 'incomplete', 'The full classic benchmark remains partial.');
  assert.equal(f.plays.length, 2); assert.deepEqual(f.plays[0].series.segments[0].plan.viewport, f.scenario.viewport);
  assert.deepEqual(f.plays[1].plan.viewport, f.scenario.viewport);
  const mapping = JSON.parse(await readFile(join(f.root, result.acceptedCandidate.targetRoot, '_cosmos/classic/mapping.json'), 'utf8'));
  assert.deepEqual(mapping.scenario, f.scenario); assert.deepEqual(mapping.candidate, result.acceptedCandidate.candidateRef);
});
