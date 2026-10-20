import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { deliveryTaskProofs, loadExperienceBinding, publishGenerationReport, readCompletedGeneration, readExperienceStatus } from '../../src/runtime/experience.ts';
import { runExperienceSession } from '../../src/cli/experience-session.ts';
import { passedTask } from '../contracts/fixtures.ts';
import { ordinaryDraft, profile } from '../roles/ordinary.fixture.ts';

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cos111-experience-')); t.after(() => removeOwned(tmpdir(), root));
  const intake = await IntakeController.create({ root, runId: 'run-1', ledgerId: 'ledger-1', specVersion: 'spec-v1', ordinaryProfile: profile,
    interviewTaskId: 'intake', maxRequests: 8, now: () => Date.parse('2026-10-01T00:00:00.000Z'),
    allocations: [{ taskId: 'intake', amountMicroCny: 1_000_000 }, { taskId: 'COS-example', amountMicroCny: 50_000_000 }] });
  const draft = ordinaryDraft(); draft.acceptance[0].acceptanceId = 'AC-1';
  await writeFile(join(root, 'intake-origin.json'), JSON.stringify({ runId: 'run-1', brief: draft.brief, ordinaryProfile: profile }), 'utf8');
  await mkdir(join(root, 'intake-answers'));
  await writeFile(join(root, 'intake-answers/v1.json'), JSON.stringify({ brief: draft.brief, questions: draft.questions, answers: draft.answers, ordinaryProfile: profile }), 'utf8');
  const saved = await intake.saveDraft(draft);
  const requirement = await intake.confirm({ revision: saved.revision, confirmed: true, actorId: 'local-user', at: '2026-10-01T00:00:00.000Z' });
  const state = await intake.activateGeneration({ environmentReady: true, executionReady: true }); await intake.close();
  const registry = await createArtifactRegistry({ workspaceRoot: root, registryRoot: 'registry' });
  await mkdir(join(root, 'author')); await writeFile(join(root, 'author/main.ts'), '// 免费来源夹具，不是生成游戏。\n', 'utf8');
  const capture = await registry.registerCapture({ taskId: 'COS-example', artifactRef: registry.artifactRef('code', 'v1'), sourceRoot: 'author',
    files: [{ source: 'main.ts', destination: 'src/main.ts' }], ownership: { writePaths: ['src'], readOnlyPaths: [] }, dependencies: [],
    metadata: { kind: 'code', provenance: { kind: 'original-procedural', generator: 'Offline fixture', sourceRefs: ['fixture'] } } });
  const ref = registry.candidateRef('game', 'v1');
  await registry.stageCandidate({ taskId: 'COS-example', authorId: 'author-1', contextId: 'author-context', candidateRef: ref, targetRoot: ref.location,
    inputs: [capture.artifactRef], expectedDeps: [capture.artifactRef], ownership: { writePaths: ['src'], readOnlyPaths: [] } });
  const evidence = await registry.verifyCandidate(ref, { build: async () => ({ passed: true, evidenceIds: ['build'] }), acceptance: async () => ({ passed: true, evidenceIds: ['evidence-1'] }) });
  const accepted = await registry.promoteCandidate(ref, { evidence, review: { candidateRef: ref, attemptId: evidence.attemptId,
    reviewerId: 'reviewer-1', contextId: 'review-context', verdict: 'approved', evidenceIds: ['evidence-1'] } });
  const task = passedTask() as any; task.dependsOn = []; task.artifacts = [ref]; task.evidence[0].artifactVersions = [...task.inputs, ref];
  task.review.inputVersions = structuredClone([...task.inputs, ref]); state.tasks = [task]; state.run.artifacts = [ref];
  await writeFile(join(root, 'snapshot.json'), JSON.stringify(state), 'utf8');
  const outcome = { outcome: 'awaiting_user_experience', runId: state.run.runId, ledgerId: state.ledger.ledgerId, delivery: accepted.targetRoot,
    gaps: [], acceptedCandidate: accepted, effectiveTasks: deliveryTaskProofs([task]) };
  const report = await publishGenerationReport(root, outcome, { capability: 'ordinary-fixture', requirement, unsupported: [] });
  const command = async (answer: string) => {
    let text = ''; const output = new PassThrough(); output.on('data', part => { text += part.toString(); });
    const result = await runExperienceSession({ root, input: Readable.from([answer + '\n']), output }); return { text, result: result as any };
  };
  return { root, requirement, draft, state, report: report as any, outcome, command };
}
test('ordinary report and real experience stdin bind every original criterion to the accepted candidate', async t => {
  for (const answer of ['approve', 'reject']) {
    const f = await fixture(t), before = await readFile(join(f.root, 'snapshot.json'));
    assert.deepEqual(f.report.acceptanceScope.experienceCriteria, f.draft.experienceCriteria);
    assert.deepEqual(f.report.acceptanceScope.ordinaryConfirmation.sources, f.requirement.sources);
    const { result, text } = await f.command(answer);
    assert.match(text, /目标和状态容易辨识/); assert.match(text, /试玩并辨认目标状态/); assert.match(text, /操作状态清楚/);
    assert.equal(result.userExperience, answer === 'approve' ? 'approved' : 'rejected');
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
    const completed: any = await readCompletedGeneration(f.root, f.requirement);
    assert.equal(completed.userExperience, result.userExperience);
    assert.deepEqual(completed.acceptanceScope.experienceCriteria, f.draft.experienceCriteria);
  }
});
for (const changed of ['criteria', 'automatic', 'confirmation', 'draft', 'candidate']) test(`ordinary experience rejects changed ${changed} instead of reusing approval`, async t => {
  const f = await fixture(t); await f.command('approve');
  if (changed === 'draft') {
    const draft = structuredClone(f.draft); draft.experienceCriteria[0].expected = '不同范围';
    await writeFile(join(f.root, f.requirement.sources[0].location), JSON.stringify(draft), 'utf8');
  } else {
    const value = JSON.parse(await readFile(join(f.root, f.report.report), 'utf8'));
    if (changed === 'criteria') value.acceptanceScope.experienceCriteria = [];
    if (changed === 'automatic') value.acceptanceScope.acceptance[0].expected = '降低的客观要求';
    if (changed === 'confirmation') value.acceptanceScope.ordinaryConfirmation = undefined;
    if (changed === 'candidate') value.acceptedCandidate.candidateRef.version = 'v2';
    const bytes = Buffer.from(JSON.stringify(value)); await writeFile(join(f.root, f.report.report), bytes);
    const markerPath = join(f.root, 'delivery/current-report.json'), marker = JSON.parse(await readFile(markerPath, 'utf8'));
    marker.sha256 = createHash('sha256').update(bytes).digest('hex'); await writeFile(markerPath, JSON.stringify(marker), 'utf8');
  }
  await assert.rejects(loadExperienceBinding(f.root), /source|draft|confirm|experience|candidate/i);
  assert.equal((await readExperienceStatus(f.root)).finalCompletion, 'pending');
});
test('ordinary report publication rejects a caller-supplied different requirement', async t => {
  const f = await fixture(t), before = await readFile(join(f.root, 'delivery/current-report.json'));
  const wrong = structuredClone(f.requirement); wrong.acceptance[0].expected = '较小要求';
  await assert.rejects(publishGenerationReport(f.root, f.outcome, { capability: 'ordinary-fixture', requirement: wrong, unsupported: [] }), /requirement|confirm|source/i);
  assert.deepEqual(await readFile(join(f.root, 'delivery/current-report.json')), before);
});
