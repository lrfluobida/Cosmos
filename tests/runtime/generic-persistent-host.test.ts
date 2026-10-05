import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { genericHostFixture } from './generic-persistent-host.fixture.ts';

test('generic host binds two immutable plans and combines actual partial samples before review', async t => {
  const { root, host, task, controller, calls, design, art, draft } = await genericHostFixture(t);
  task.evidence = await host.verify(task, controller.signal); assert.equal(task.evidence[0].outcome, 'passed', task.evidence[0].summary);
  assert.equal(calls.length, 1); const series = calls[0].series;
  assert.deepEqual(series.binding.design, design.artifacts[0]); assert.deepEqual(series.binding.candidate, task.artifacts[0]);
  assert.deepEqual(series.segments[0].plan.steps, draft.scenario.steps); assert.deepEqual(series.segments[1].plan.steps, draft.scenario.reopen!.steps);
  const usage = JSON.parse(await readFile(join(root, 'evidence/coding/media-usage.json'), 'utf8'));
  assert.equal(usage.coverage.complete, true); assert.equal(usage.coverage.valid, true); assert.deepEqual(usage.media, art.artifacts[0]);
  assert.deepEqual(usage.coverage.checks.find((row: any) => row.state === 'play' && row.kind === 'state_seen').observations.map((row: any) => row.value), [true, false]);
  assert.ok(task.evidence.some((item: any) => item.source.location.includes('-save'))); assert.ok(task.evidence.some((item: any) => item.source.location.includes('-resume')));
  assert.ok(task.evidence.some((item: any) => item.source.location.endsWith('/coding-persistent')), 'Independent review needs the aggregate raw checkpoint/process report');
});
for (const fault of ['save', 'pid', 'profile', 'origin', 'exit', 'request', 'sample', 'first-only', 'raw', 'stop', 'deadline']) {
  test(`generic host rejects ${fault} while retaining original raw facts`, async t => {
    const { host, task, controller } = await genericHostFixture(t, fault);
    try { task.evidence = await host.verify(task, controller.signal); assert.equal(task.evidence[0].outcome, 'failed'); }
    catch (error) { assert.equal(fault, 'stop', String(error)); }
  });
}
for (const fault of ['design-bytes', 'candidate-bytes', 'confirmed-source']) test(`generic current binding rejects ${fault} before the next process launch`, async t => {
  const { host, task, controller, calls } = await genericHostFixture(t, fault);
  task.evidence = await host.verify(task, controller.signal); assert.equal(task.evidence[0].outcome, 'failed'); assert.equal(calls[0].segmentsRun, 1);
});
