import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { genericHostFixture } from './generic-persistent-host.fixture.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';

test('selected production caller writes both policies after cleanup with every catalog row', async t => {
  const { root, host, task, controller, calls, design, art } = await genericHostFixture(t, '', true);
  task.evidence = await host.verify(task, controller.signal); assert.equal(task.evidence[0].outcome, 'passed', task.evidence[0].summary);
  const partial = JSON.parse(await readFile(join(root, 'evidence/coding/classic-policy.json'), 'utf8'));
  const clean = JSON.parse(await readFile(join(root, 'evidence/coding/delivery-check.json'), 'utf8'));
  assert.equal(partial.acceptance, 'partial'); assert.equal(partial.entries.length, 230);
  assert.equal(partial.entries.filter((row: any) => row.outcome === 'reference_unknown').length, 221);
  assert.equal(partial.entries.filter((row: any) => row.outcome === 'policy_not_executed').length, 7);
  assert.deepEqual(partial.entries.filter((row: any) => row.outcome === 'passed').map((row: any) => row.entryId), ['STARTUP', 'OFFLINE']);
  assert.deepEqual(partial.binding.candidate, task.artifacts[0]); assert.deepEqual(partial.plans, calls[0].series);
  assert.ok(Date.parse(partial.recordedAt) >= Date.parse(clean.endedAt)); assert.equal(calls.length, 1);
  assert.ok(partial.blockers.includes('reference_not_frozen')); assert.ok(partial.blockers.includes('full_execution_adapter_pending'));
  assert.ok(task.evidence.some((row: any) => row.source.location.endsWith('classic-policy.json')));
  assert.ok(task.evidence.some((row: any) => row.source.artifactId.startsWith('classic-policy-mapping')));
  for (const item of [design, art, task]) item.review.evidenceIds = item.evidence.map((row: any) => row.evidenceId);
  const delivered = await host.finish([design, art, { ...task, state: 'passed' }]);
  assert.ok(delivered.acceptedCandidate);
  assert.ok(delivered.gaps.length);
});

for (const fault of ['raw', 'save', 'pid', 'exit', 'classic-mapping', 'classic-catalog', 'classic-build', 'classic-plan', 'classic-cleanup', 'confirmed-source']) {
  test(`classic ${fault} retains the full denominator and refuses unproven policy passes`, async t => {
    const { root, host, task, controller } = await genericHostFixture(t, fault, true);
    task.evidence = await host.verify(task, controller.signal); assert.equal(task.evidence[0].outcome, 'failed');
    const report = JSON.parse(await readFile(join(root, 'evidence/coding/classic-policy.json'), 'utf8'));
    assert.equal(report.entries.length, 230); assert.equal(report.entries.filter((row: any) => row.outcome === 'reference_unknown').length, 221);
    assert.equal(report.entries.find((row: any) => row.entryId === 'STARTUP').outcome, 'insufficient_evidence');
    assert.equal(report.entries.find((row: any) => row.entryId === 'OFFLINE').outcome, 'insufficient_evidence');
    assert.ok(report.mappingErrors.length); assert.ok(host.diagnoseFailure!(task, 'host_verification')!.issues.every(issue => issue.classification === 'insufficient_evidence'));
  });
}
test('current source compiler failure remains failed, with missing offline evidence explicit', async t => {
  const { root, host, task, controller, calls } = await genericHostFixture(t, 'classic-build-failed', true);
  task.evidence = await host.verify(task, controller.signal); assert.equal(task.evidence[0].outcome, 'failed'); assert.equal(calls.length, 0);
  const report = JSON.parse(await readFile(join(root, 'evidence/coding/classic-policy.json'), 'utf8'));
  assert.equal(report.entries.find((row: any) => row.entryId === 'STARTUP').outcome, 'failed');
  assert.equal(report.entries.find((row: any) => row.entryId === 'OFFLINE').outcome, 'insufficient_evidence');
  assert.equal(host.diagnoseFailure!(task, 'host_verification')!.issues[0].classification, 'code_defect');
});
test('an actual current save mismatch remains a failed policy and uses the original diagnosis', async t => {
  const { root, host, task, controller } = await genericHostFixture(t, 'resume-mismatch', true);
  task.evidence = await host.verify(task, controller.signal); assert.equal(task.evidence[0].outcome, 'failed');
  const report = JSON.parse(await readFile(join(root, 'evidence/coding/classic-policy.json'), 'utf8'));
  assert.equal(report.entries.find((row: any) => row.entryId === 'OFFLINE').outcome, 'failed');
  assert.ok(host.diagnoseFailure!(task, 'host_verification')!.issues.every(issue => issue.classification === 'code_defect'));
});
test('an ordinary generic caller leaves classic policies unselected', async t => {
  const { root, host, task, controller } = await genericHostFixture(t);
  task.evidence = await host.verify(task, controller.signal); assert.equal(task.evidence[0].outcome, 'passed');
  await assert.rejects(readFile(join(root, 'evidence/coding/classic-policy.json')), { code: 'ENOENT' });
});
test('resume cannot disable the classic selection from the original requirement capture', async t => {
  const { root, controller, draft, requirement } = await genericHostFixture(t, '', true), changed = structuredClone(draft);
  delete changed.benchmark;
  await assert.rejects(createBrowserHost({ root, controller, draft: changed, requirement, work: new OwnedWork(controller.signal), resume: true }), /classic|confirmed|capture/i);
});
