import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { genericHostFixture } from './generic-persistent-host.fixture.ts';
import { savedText } from '../acceptance/generic-persistent.fixture.ts';

test('real generic Edge UI saves unlock and purchase then continues after owned process reopen', { timeout: 45_000 }, async t => {
  const { root, host, task, controller, calls } = await genericHostFixture(t, 'real');
  task.evidence = await host.verify(task, controller.signal); assert.equal(task.evidence[0].outcome, 'passed', task.evidence[0].summary);
  const report = JSON.parse(await readFile(join(root, 'evidence/coding/browser.json'), 'utf8'));
  const usage = JSON.parse(await readFile(join(root, 'evidence/coding/media-usage.json'), 'utf8'));
  assert.equal(report.outcome, 'passed'); assert.equal(report.checkpoint.actual, savedText); assert.equal(report.checkpoint.savedActual, savedText);
  const [before, after] = report.segments.map((segment: any) => segment.report.session);
  assert.notEqual(before.browserPid, after.browserPid); assert.equal(before.profile, after.profile); assert.equal(before.origin, after.origin);
  for (const identity of [before, after]) { assert.equal(identity.exitConfirmed, true); assert.equal(identity.closeEvent, true); assert.throws(() => process.kill(identity.browserPid, 0)); }
  assert.equal(report.deadlineAt, calls[0].deadlineAt); assert.equal(usage.coverage.complete, true); assert.equal(usage.coverage.valid, true);
  assert.deepEqual(usage.coverage.checks.find((row: any) => row.state === 'play' && row.kind === 'state_seen').observations.map((row: any) => row.value), [true, false]);
  assert.deepEqual(usage.coverage.checks.find((row: any) => row.state === 'resume' && row.kind === 'state_seen').observations.map((row: any) => row.value), [false, true]);
  assert.deepEqual(usage.coverage.checks.filter((row: any) => row.kind === 'audio_started').map((row: any) => row.observations.map((item: any) => item.value)), [[true, false], [false, true]]);
  const delivery = JSON.parse(await readFile(join(root, 'evidence/coding/delivery-check.json'), 'utf8')); assert.equal(delivery.outcome, 'passed'); assert.equal(delivery.helperExited, true);
  console.log(JSON.stringify({ sourceFixtureOnly: true, sdkCalls: 0, paidMicroCny: 0, savedText, browserVersions: report.segments.map((segment: any) => segment.report.browser.version),
    pids: [before.browserPid, after.browserPid], profile: before.profile, origin: before.origin, fullExit: true, coverageFields: usage.coverage.checks.length,
    report: join(root, 'evidence/coding/browser.json'), media: join(root, 'evidence/coding/media-usage.json'), originalDeadlineAt: report.deadlineAt }));
});
