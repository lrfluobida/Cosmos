import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { genericHostFixture } from './generic-persistent-host.fixture.ts';

const read = async (root: string, path: string) => JSON.parse(await readFile(join(root, path), 'utf8'));
test('production host executes one independent normal plan and preserves the full partial denominator', async t => {
  const f = await genericHostFixture(t, '', true, false, true);
  f.task.evidence = await f.host.verify(f.task, f.controller.signal);
  assert.equal(f.task.evidence[0].outcome, 'passed', f.task.evidence[0].summary);
  assert.equal(f.calls.length, 1); assert.equal(f.entryCalls.length, 1);
  const plan = f.entryCalls[0].plan, report = await read(f.root, 'evidence/coding/classic-entries.json');
  assert.equal(plan.steps.at(-1).expected, '7'); assert.equal(plan.steps.at(-1).kind, 'assert');
  assert.notEqual(plan.reportId, f.calls[0].series.segments[0].plan.reportId); assert.equal(plan.url, f.calls[0].series.segments[0].plan.url);
  assert.deepEqual(f.entryCalls[0].authority, f.calls[0].authority);
  assert.equal(report.acceptance, 'partial'); assert.equal(report.entries.length, 230);
  assert.equal(report.entries.filter((row: any) => row.normalInput.outcome === 'passed').length, 1);
  const row = report.entries.find((row: any) => row.entryId === 'VALUE-PLANTS');
  assert.equal(row.status, 'needs_reference'); assert.equal(row.mechanism.outcome, 'not_executed'); assert.equal(row.valueImplementation.outcome, 'not_executed');
  assert.equal((await read(f.root, 'evidence/coding/delivery-check.json')).acceptancePassed, true);
  const policies = await read(f.root, 'evidence/coding/classic-policy.json');
  assert.deepEqual(policies.entries.filter((row: any) => row.outcome === 'passed').map((row: any) => row.entryId), ['STARTUP', 'OFFLINE']);
  assert.ok(f.task.evidence.some((row: any) => row.source.location.endsWith('classic-entries.json')));
  assert.ok(f.task.evidence.some((row: any) => row.source.artifactId.startsWith('classic-entry-mapping')));
  const images = await f.host.reviewImages!(f.task, f.controller.signal);
  assert.ok(images.some(row => row.source.location.includes('coding-classic-entry')));
  assert.deepEqual(await read(f.root, 'reviews/coding/evidence/coding/classic-entries.json'), report);
  for (const task of [f.design, f.art, f.task]) task.review.evidenceIds = task.evidence.map((row: any) => row.evidenceId);
  assert.equal((await f.host.finish([f.design, f.art, { ...f.task, state: 'passed' }])).acceptedCandidate, undefined, 'Direct fixture finish has no verified/review journal');
});

test('empty fixture source grants no sidecar path and executes no added plan', async t => {
  const f = await genericHostFixture(t, '', true, false, 'empty');
  assert.deepEqual(f.host.taskPolicies.find(row => row.role === 'design')!.writePaths, ['authors/design/design.json']);
  f.task.evidence = await f.host.verify(f.task, f.controller.signal); assert.equal(f.task.evidence[0].outcome, 'passed');
  assert.equal(f.entryCalls.length, 0);
  const report = await read(f.root, 'evidence/coding/classic-entries.json');
  assert.equal(report.acceptance, 'partial'); assert.equal(report.entries.length, 230);
  assert.ok(report.entries.every((row: any) => row.normalInput.outcome === 'not_executed' && row.normalInput.reason === 'no_reference_measurements'));
});

for (const fault of ['entry-mismatch', 'entry-input', 'entry-observation', 'entry-candidate', 'entry-expected', 'entry-exit', 'entry-exit-missing', 'entry-exit-null', 'entry-facts-missing', 'entry-viewport', 'entry-deadline', 'entry-raw', 'entry-png', 'entry-video', 'entry-missing-raw', 'entry-log', 'entry-screenshot', 'entry-source']) {
  test(`independent ${fault} cannot promote or rewrite successful original policies`, async t => {
    const f = await genericHostFixture(t, fault, true, false, true);
    f.task.evidence = await f.host.verify(f.task, f.controller.signal); assert.equal(f.task.evidence[0].outcome, 'failed');
    assert.ok(f.task.evidence.some((row: any) => row.source.artifactId === 'coding-classic-entry-raw'), 'Preserve produced independent raw even when its content is invalid');
    const report = await read(f.root, 'evidence/coding/classic-entries.json'); assert.equal(report.entries.length, 230);
    assert.equal(report.entries.find((row: any) => row.entryId === 'VALUE-PLANTS').normalInput.outcome, fault === 'entry-mismatch' ? 'failed' : 'insufficient_evidence');
    assert.ok(f.host.diagnoseFailure!(f.task, 'host_verification')!.issues.every(issue => issue.classification === (fault === 'entry-mismatch' ? 'code_defect' : 'insufficient_evidence')));
    assert.equal((await read(f.root, 'evidence/coding/delivery-check.json')).acceptancePassed, true);
    assert.deepEqual((await read(f.root, 'evidence/coding/classic-policy.json')).entries.filter((row: any) => row.outcome === 'passed').map((row: any) => row.entryId), ['STARTUP', 'OFFLINE']);
    if (['entry-exit-missing', 'entry-exit-null', 'entry-facts-missing'].includes(fault)) assert.equal((await f.host.finish([f.design, f.art, { ...f.task, state: 'failed' }])).acceptedCandidate, undefined);
  });
}

test('failed original checks do not execute the added normal browser plan', async t => {
  const f = await genericHostFixture(t, 'resume-mismatch', true, false, true);
  f.task.evidence = await f.host.verify(f.task, f.controller.signal); assert.equal(f.task.evidence[0].outcome, 'failed');
  assert.equal(f.entryCalls.length, 0);
  const report = await read(f.root, 'evidence/coding/classic-entries.json');
  assert.equal(report.entries.find((row: any) => row.entryId === 'VALUE-PLANTS').normalInput.reason, 'prerequisite_failed');
});

test('a changed source catalog cannot shrink the captured denominator or silently select again', async t => {
  const f = await genericHostFixture(t, '', true, false, true), catalog = await read(f.classicSourceRoot!, 'catalog.json');
  catalog.entries.pop(); await writeFile(join(f.classicSourceRoot!, 'catalog.json'), JSON.stringify(catalog), 'utf8');
  f.task.evidence = await f.host.verify(f.task, f.controller.signal); assert.equal(f.task.evidence[0].outcome, 'failed'); assert.equal(f.entryCalls.length, 0);
  const report = await read(f.root, 'evidence/coding/classic-entries.json'); assert.equal(report.entries.length, 230);
  assert.equal(report.entries.find((row: any) => row.entryId === 'VALUE-PLANTS').normalInput.outcome, 'insufficient_evidence');
});
