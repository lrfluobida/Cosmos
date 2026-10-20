import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { loadExperienceBinding, publishGenerationReport, readCompletedGeneration, readExperienceStatus } from '../../src/runtime/experience.ts';
import { runExperienceSession } from '../../src/cli/experience-session.ts';
import { readRunSnapshot } from '../../src/cli/control.ts';
import { readConfirmedGeneration } from '../../src/cli/session.ts';
import { ordinaryHostFixture } from '../runtime/ordinary-design.fixture.ts';

async function fixture(t: test.TestContext) {
  const generated = await ordinaryHostFixture(t, { productionDefault: true }), { root, draft } = generated;
  t.after(() => removeOwned(tmpdir(), root));
  const report: any = await generated.execute(); assert.ok(report.acceptedCandidate, JSON.stringify(report.gaps));
  const state = await readRunSnapshot(root);
  if (state.formatVersion === 'intake-1') throw new Error('Expected the original confirmed generation.');
  const { requirement } = await readConfirmedGeneration(root, state), outcome = report;
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
    for (const criterion of f.draft.experienceCriteria) for (const expected of [criterion.description, ...criterion.steps, criterion.expected]) assert.ok(text.includes(expected));
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
  await assert.rejects(publishGenerationReport(f.root, f.outcome, { capability: 'ordinary-design-execution/1', requirement: wrong, unsupported: [] }), /requirement|confirm|source/i);
  assert.deepEqual(await readFile(join(f.root, 'delivery/current-report.json')), before);
});
