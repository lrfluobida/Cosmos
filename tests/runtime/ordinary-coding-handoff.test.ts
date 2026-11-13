import assert from 'node:assert/strict';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';
import { readConfirmedGeneration } from '../../src/cli/session.ts';
import { readRunSnapshot } from '../../src/cli/control.ts';
import { loadExperienceBinding, readCompletedGeneration } from '../../src/runtime/experience.ts';
import { RecoveryBlocked, TaskJournal } from '../../src/runtime/recovery/task-journal.ts';

const concerns = ['Confirm HUD bounds in the running browser.', 'Confirm audio readiness on first click.'];
type Mode = 'approve' | 'host-fail' | 'remaining' | 'reject' | 'missing' | 'fixed-input';

async function fixture(t: TestContext, mode: Mode) {
  let reviews = 0;
  const f = await ordinaryHostFixture(t, { productionDefault: true,
    sessionFactory: async (config, fallback) => {
      const packet = JSON.parse(config.context!);
      if (packet.taskId !== 'coding-task') return fallback;
      if (packet.role === 'coding') return { ...fallback, prompt: async (...args) => {
        await fallback.prompt(...args);
        return { text: JSON.stringify({ summary: 'Candidate ready', remaining: mode === 'remaining' ? ['Implement saved games'] : [], uncertainty: concerns }) };
      } };
      if (packet.role !== 'reviewer') return fallback;
      reviews++;
      return { ...fallback, prompt: async () => {
        assert.deepEqual(packet.codingConcernReview.concerns.map((row: any) => row.text), concerns);
        const proof = packet.evidence.find((row: any) => row.outcome === 'passed');
        const concernResolutions = packet.codingConcernReview.concerns.map((row: any, index: number) => ({
          concernId: row.concernId, concernText: row.text, status: mode === 'reject' && index === 1 ? 'unresolved' : 'resolved',
          rationale: 'Consulted the current captured test report and browser observations for this concern.',
          acceptanceIds: proof.acceptanceIds, ...(mode === 'fixed-input'
            ? { basis: 'fixed_input', inputVersions: [packet.inputs[0]], evidenceIds: [], evidenceRefs: [] }
            : { basis: 'host_evidence', inputVersions: packet.inputs, evidenceIds: [proof.evidenceId], evidenceRefs: [proof.source] }) }));
        return { text: JSON.stringify({ verdict: mode === 'reject' ? 'changes_requested' : 'approved',
          findings: mode === 'reject' ? ['Audio readiness is unproven.'] : [], inputVersions: packet.inputs,
          evidenceIds: [proof.evidenceId], concernResolutions: mode === 'missing' ? concernResolutions.slice(0, 1) : concernResolutions }) };
      } };
    } });
  if (mode === 'host-fail') {
    const io = f.hostOptions.io!, play = io.play;
    io.play = async (...args) => {
      const report = await play(...args);
      if (report.plan.taskId === 'coding-task') {
        report.outcome = 'failed';
        const assertion = report.steps.find(step => step.id === 'complete')!;
        assertion.outcome = 'failed'; assertion.actual = 'still waiting';
      }
      return report;
    };
  }
  const receipt = async (name: string) => JSON.parse(await readFile(join(f.root, 'journal/task-coding-task', name + '.json'), 'utf8'));
  return { ...f, receipt, reviews: () => reviews };
}

test('ordinary coding resolves both original concerns only after host verification and reauthenticates them on delivery reads', async t => {
  const f = await fixture(t, 'approve'), result: any = await f.execute();
  assert.equal(f.reviews(), 1, JSON.stringify(result.gaps));
  assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps));
  const state = await readRunSnapshot(f.root), { requirement } = await readConfirmedGeneration(f.root, state);
  assert.deepEqual((await f.receipt('author')).value.proposal.uncertainty, concerns);
  assert.deepEqual((await f.receipt('review')).value.verdict.concernResolutions.map((row: any) => row.concernText), concerns);
  assert.deepEqual((await loadExperienceBinding(f.root)).acceptedCandidate, result.acceptedCandidate);
  assert.equal((await readCompletedGeneration(f.root, requirement))!.reportedAt, result.reportedAt);
  assert.equal((await f.receipt('origin')).ordinaryCodingHandoffPolicy, 'host-evidence/1');
  const manifestPath = join(f.root, 'registry/candidates/game/v1/candidate.json'), manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  manifest.files.pop();
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(loadExperienceBinding(f.root), /coding concern receipt/i);
  await writeFile(manifestPath, manifestBytes);
  const path = join(f.root, 'journal/task-coding-task/review.json'), changed = await f.receipt('review');
  changed.value.verdict.concernResolutions.pop();
  await writeFile(path, JSON.stringify(changed));
  await assert.rejects(loadExperienceBinding(f.root));
  await assert.rejects(readCompletedGeneration(f.root, requirement));
  assert.equal(f.reviews(), 1);
});

for (const mode of ['host-fail', 'remaining', 'reject', 'missing', 'fixed-input'] as const) test(`ordinary coding preserves the original candidate failure for ${mode}`, async t => {
  const f = await fixture(t, mode);
  await f.execute();
  const task = (await readRunSnapshot(f.root) as any).tasks.find((row: any) => row.taskId === 'coding-task');
  assert.notEqual(task.state, 'passed');
  assert.deepEqual((await f.receipt('author')).value.proposal.uncertainty, concerns);
  if (mode === 'remaining') { assert.equal(f.reviews(), 0); await assert.rejects(f.receipt('verify-started'), { code: 'ENOENT' }); }
  else if (mode === 'host-fail') {
    assert.ok(await f.receipt('verify-started')); assert.equal(f.reviews(), 0);
    const feedback = JSON.parse(await readFile(join(task.attempts[0].sessionRef, 'failure.json'), 'utf8'));
    assert.equal(feedback.issues[0].checkId, 'browser/complete');
    assert.equal(feedback.issues[0].classification, 'code_defect');
    assert.match(feedback.issues[0].actual, /still waiting/);
    assert.deepEqual(feedback.issues[0].evidenceRefs, ['evidence/coding-task/browser.json']);
  }
  else { assert.equal(f.reviews(), 1); assert.equal(task.review.verdict, mode === 'reject' ? 'changes_requested' : 'pending'); }
});

test('ordinary coding resumes its captured concerns before host verification without repeating author work', async t => {
  const f = await fixture(t, 'approve'), write = TaskJournal.prototype.write;
  const interrupt = t.mock.method(TaskJournal.prototype, 'write', async function(this: TaskJournal, ...args: Parameters<typeof write>) {
    await write.apply(this, args);
    if (args[0] === 'coding-concerns') throw new RecoveryBlocked('Paused after capturing coding concerns.');
  });
  const first = await f.execute(); interrupt.mock.restore();
  assert.equal(first.acceptedCandidate, undefined); assert.equal(f.reviews(), 0);
  const confirmed = await readConfirmedGeneration(f.root, await readRunSnapshot(f.root));
  const planningPath = join(f.root, 'planning-started.json'), planningBytes = await readFile(planningPath);
  const planning = JSON.parse(planningBytes.toString('utf8'));
  assert.equal(planning.ordinaryCodingHandoffPolicy, 'host-evidence/1');
  delete planning.ordinaryCodingHandoffPolicy;
  await writeFile(planningPath, JSON.stringify(planning));
  await assert.rejects(f.host.execute({ root: f.root, ...confirmed, resume: true }), /ordinary coding handoff policy/);
  assert.equal(f.reviews(), 0); assert.equal(f.plays.length, 0);
  await writeFile(planningPath, planningBytes);
  const extraFile = join(f.root, 'registry/candidates/game/v1/project/unregistered.js');
  await writeFile(extraFile, 'unexpected = true;');
  const refused = await f.host.execute({ root: f.root, ...confirmed, resume: true });
  assert.ok(refused.gaps.some((gap: string) => gap.includes('content changed or is missing')));
  assert.equal(f.reviews(), 0); assert.equal(f.plays.length, 0);
  await unlink(extraFile);
  const result = await f.host.execute({ root: f.root, ...confirmed, resume: true });
  assert.ok(result.acceptedCandidate, JSON.stringify(result.gaps));
  assert.equal(f.reviews(), 1); assert.equal(f.plays.length, 1);
  assert.equal(f.packets.filter(row => row.taskId === 'coding-task' && row.role === 'coding').length, 1);
});
