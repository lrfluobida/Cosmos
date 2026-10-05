import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { genericHostFixture } from './generic-persistent-host.fixture.ts';
import { savedText } from '../acceptance/generic-persistent.fixture.ts';

test('production compiler, Node clean launcher and actual Edge establish two partial classic policies', { timeout: 120_000 }, async t => {
  const { root, host, task, controller, design, art } = await genericHostFixture(t, 'native-real', true);
  task.evidence = await host.verify(task, controller.signal); assert.equal(task.evidence[0].outcome, 'passed', task.evidence[0].summary);
  const read = async (path: string) => JSON.parse(await readFile(join(root, path), 'utf8'));
  const build = await read('evidence/coding/build.json'), partial = await read('evidence/coding/classic-policy.json'), report = await read('evidence/coding/browser.json'), cleanup = await read('evidence/coding/delivery-check.json');
  assert.deepEqual(build.results.map((row: any) => row.code), [0, 0]); assert.equal(report.outcome, 'passed');
  assert.equal(partial.entries.length, 230); assert.equal(partial.entries.filter((row: any) => row.outcome === 'reference_unknown').length, 221);
  assert.equal(partial.entries.filter((row: any) => row.outcome === 'policy_not_executed').length, 7);
  assert.deepEqual(partial.entries.filter((row: any) => row.outcome === 'passed').map((row: any) => row.entryId), ['STARTUP', 'OFFLINE']);
  assert.deepEqual(partial.plans, report.series); assert.equal(partial.binding.taskId, task.taskId); assert.equal(partial.binding.specVersion, task.specVersion);
  assert.deepEqual(partial.binding.candidate, task.artifacts[0]); assert.equal(report.segments.length, 2);
  const [before, after] = report.segments.map((segment: any) => segment.report.session);
  assert.notEqual(before.browserPid, after.browserPid); assert.equal(before.profile, after.profile); assert.equal(before.origin, after.origin);
  assert.equal(report.checkpoint.actual, savedText); assert.equal(report.checkpoint.savedActual, savedText);
  for (const session of [before, after]) { assert.equal(session.exitConfirmed, true); assert.throws(() => process.kill(session.browserPid, 0)); }
  assert.equal(cleanup.bytesMatched, true); assert.equal(cleanup.helperExited, true); assert.equal(cleanup.outcome, 'passed');
  assert.ok(Date.parse(partial.recordedAt) >= Date.parse(cleanup.endedAt)); assert.ok(Date.parse(partial.recordedAt) < report.deadlineAt);
  for (const item of [design, art, task]) item.review.evidenceIds = item.evidence.map((row: any) => row.evidenceId);
  task.state = 'passed'; const delivery = await host.finish([design, art, task]); assert.ok(delivery.acceptedCandidate); assert.match(delivery.gaps.join('\n'), /partial.*230/);
  const review = await readFile(join(root, 'reviews/coding/evidence/coding/classic-policy.json')); assert.ok(review.equals(await readFile(join(root, 'evidence/coding/classic-policy.json'))));
  assert.equal((await controller.read()).ledger.entries.length, 0);
  console.log(JSON.stringify({ fixtureOnly: true, generatedByCosmos: false, sdkCalls: 0, paidMicroCny: 0, evidenceRoot: root, candidate: task.artifacts[0],
    buildCodes: build.results.map((row: any) => row.code), browsers: report.segments.map((segment: any) => segment.report.browser.version),
    pids: [before.browserPid, after.browserPid], sameProfile: true, sameOrigin: true, exitsConfirmed: true, cleanupEndedAt: cleanup.endedAt,
    policyRecordedAt: partial.recordedAt, originalDeadlineAt: report.deadlineAt, entries: 230, referenceUnknown: 221, policyNotExecuted: 7, policyPassed: 2,
    acceptance: partial.acceptance, finalGaps: delivery.gaps }));
});
