import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { genericHostFixture } from './generic-persistent-host.fixture.ts';

test('trusted host selection captures the observer outside author scope and persists current per-plan requests', async t => {
  const { root, host, task, controller, calls } = await genericHostFixture(t, '', true, true);
  const observer = host.availableArtifacts.find(ref => ref.artifactId === 'render-frame-observer'); assert.ok(observer, 'Missing selected trusted observer capture.');
  assert.match(await readFile(join(root, observer.location, '_cosmos/render-frame-observer.ts'), 'utf8'), /createObservedGame/);
  task.evidence = await host.verify(task, controller.signal); assert.equal(task.evidence[0].outcome, 'passed', task.evidence[0].summary);
  const sampled = JSON.parse(await readFile(join(root, 'evidence/coding/render-frames.json'), 'utf8'));
  assert.equal(sampled.requests.length, 2); assert.deepEqual(sampled.observer, observer); assert.equal(calls.length, 1);
  assert.deepEqual(sampled.requests.map((row: any) => row.request.collection.segmentId), ['save', 'resume']);
  assert.ok(sampled.samples.every((row: any) => row.assessment.performancePolicy === 'not_executed'));
  const classic = JSON.parse(await readFile(join(root, 'evidence/coding/classic-policy.json'), 'utf8'));
  assert.equal(classic.entries.length, 230); assert.equal(classic.entries.find((row: any) => row.entryId === 'PERFORMANCE').outcome, 'policy_not_executed');
});
test('changed observer capture refuses current source proof and cannot create a code-defect repair', async t => {
  const { root, host, task, controller } = await genericHostFixture(t, '', true, true);
  const observer = host.availableArtifacts.find(ref => ref.artifactId === 'render-frame-observer')!;
  await writeFile(join(root, observer.location, '_cosmos/render-frame-observer.ts'), '// changed capture\n', 'utf8');
  task.evidence = await host.verify(task, controller.signal); assert.equal(task.evidence[0].outcome, 'failed');
  assert.ok(host.diagnoseFailure!(task, 'host_verification')!.issues.every(issue => issue.classification === 'insufficient_evidence'));
});
