import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { codingCompactionFixture } from './coding-compaction.fixture.mjs';

test('production coding compacts before an affordable 251339-byte turn and captures in the same attempt', async t => {
  const { report } = await codingCompactionFixture(t);
  assert.equal(report.error, undefined); assert.equal(report.captured, true);
  assert.equal(report.ordinary, 5); assert.equal(report.summaryRequests, 2); assert.equal(report.compactions, 2);
  const boundary = report.boundaries.find(item => item.inputBytes === 251339);
  assert.equal(boundary.remainingMicroCny, 1069753); assert.equal(boundary.trigger, true);
  assert.ok(boundary.inputBytes * 2 + 65536 * 8 <= boundary.remainingMicroCny);
  assert.ok(boundary.afterBytes < boundary.inputBytes);
  assert.ok(report.dispatches.filter(item => item.kind === 'summary').every(item => item.sentCap === 8192 && item.sentCap <= item.sdkRequestedCap));
  for (const request of report.admissions) assert.equal(request.estimatedMaxCostMicroCny, request.inputBytes * 2 + request.maxOutputTokens * 8);
  assert.equal(report.currentTaskUnchanged, true); assert.equal(report.fixedPacketAndToolsRetained, true);
  assert.equal(report.autoCompactionRestoredDisabled, true); assert.equal(report.networkCalls, 0);
});

test('native split summaries are both charged before one checkpoint is saved', async t => {
  const { report } = await codingCompactionFixture(t, 'success', true);
  assert.equal(report.error, undefined); assert.equal(report.summaryRequests, 3); assert.equal(report.compactions, 2);
  assert.equal(report.events.find(event => event.type === 'compaction_end').saved, 1);
  assert.equal(report.settlements.filter(item => item.kind === 'summary' && item.outcome === 'settled').length, 3);
});

test('a read-only format turn cannot trigger compaction and restores its tool loadout', async t => {
  const f = await codingCompactionFixture(t), before = f.requestCounts(), policies = f.report.policies.length;
  await f.readonlyPrompt();
  assert.deepEqual(f.requestCounts(), { ordinary: before.ordinary + 1, summaryRequests: before.summaryRequests });
  assert.equal(f.report.policies.length, policies); assert.equal(f.native.settingsManager.getCompactionSettings(f.native.model).enabled, false);
  assert.deepEqual(f.native.getActiveToolNames().sort(), ['synthetic_read', 'write']);
});

for (const mode of ['toolcall', 'length', 'unknown', 'budget-first', 'budget-second', 'balance-race', 'deadline', 'cancel', 'invalid-sdk-cap']) {
  test(`production compaction ${mode} stops before checkpoint or further ordinary dispatch`, async t => {
    const { report, role, f, requestCounts } = await codingCompactionFixture(t, mode, mode === 'budget-second');
    assert.ok(report.error); assert.equal(report.compactions, 0); assert.equal(report.ordinary, mode === 'budget-second' ? 4 : 3);
    assert.equal(report.summaryRequests, ['toolcall', 'length', 'unknown', 'budget-second'].includes(mode) ? 1 : 0);
    assert.ok(report.events.filter(event => event.type === 'compaction_end').every(event => event.saved === 0));
    const counts = requestCounts(); await assert.rejects(role.prompt('Do not retry')); assert.deepEqual(requestCounts(), counts);
    await assert.rejects(readFile(join(f.artifactRoot, 'authors/coding.txt')), { code: 'ENOENT' });
    if (mode === 'length') assert.equal(report.error.code, 'incomplete');
    if (mode === 'unknown') {
      assert.equal(report.error.code, 'usage_unknown'); assert.equal(report.ledger.at(-1).status, 'unknown'); assert.ok(report.ledger.at(-1).reservedMicroCny > 0);
    }
    if (mode === 'toolcall') { assert.equal(report.error.code, 'compaction_failed'); assert.equal(report.ledger.at(-1).status, 'settled'); }
    if (mode === 'budget-second') assert.equal(report.settlements.filter(item => item.kind === 'summary' && item.outcome === 'settled').length, 1);
    assert.equal(report.autoCompactionRestoredDisabled, true);
  });
}

test('no configured compaction keeps the original rejection at the later unaffordable turn', async t => {
  const { report } = await codingCompactionFixture(t, 'disabled');
  assert.ok(report.error); assert.equal(report.summaryRequests, 0); assert.equal(report.ordinary, 4);
  assert.equal(report.remainingMicroCny, 745662); assert.ok(report.boundaries.at(-1).inputBytes * 2 > report.remainingMicroCny);
});

test('closing while the trusted compaction decision is awaited rejects the pending prompt', async t => {
  const { report } = await codingCompactionFixture(t, 'close-during-policy');
  assert.equal(report.error?.code, 'cancelled'); assert.equal(report.ordinary, 3); assert.equal(report.summaryRequests, 0);
  assert.equal(report.compactions, 0); assert.equal(report.captured, false);
});

test('ample authority retains ordinary requests without compaction', async t => {
  const { report } = await codingCompactionFixture(t, 'low-pressure');
  assert.equal(report.error, undefined); assert.equal(report.captured, true); assert.equal(report.summaryRequests, 0);
  assert.ok(report.boundaries.some(item => item.inputBytes >= 131072));
});

test('a smaller native summary cap is preserved', async t => {
  const { report } = await codingCompactionFixture(t, 'small-sdk-cap'); assert.equal(report.error, undefined);
  assert.ok(report.dispatches.filter(item => item.kind === 'summary').every(item => item.sentCap === 4096));
});

test('no benefit suppresses later compaction even after another 32 KiB of growth', async t => {
  const { report } = await codingCompactionFixture(t, 'no-benefit');
  assert.equal(report.error, undefined); assert.equal(report.summaryRequests, 1); assert.equal(report.compactions, 1);
  assert.ok(report.boundaries[0].afterBytes >= report.boundaries[0].inputBytes);
  assert.ok(report.boundaries[1].inputBytes >= report.boundaries[0].afterBytes + 32768);
  assert.equal(report.boundaries[1].trigger, false);
});

test('native no-op deduplicates the same projection without setting a success growth baseline', async t => {
  const { report } = await codingCompactionFixture(t, 'noop');
  assert.equal(report.error, undefined); assert.equal(report.summaryRequests, 0); assert.equal(report.compactions, 0); assert.deepEqual(report.events, []);
  assert.equal(report.ordinary, 3); assert.equal(report.policies.length, 2); assert.ok(report.policies.every(item => item.selected));
  assert.equal(report.boundaries[0].repeatedSameProjectionVerified, true);
  assert.ok(report.boundaries[1].inputBytes < report.boundaries[0].afterBytes + 32768);
  assert.equal(report.autoCompactionRestoredDisabled, true);
});

test('peak-cost summaries remain accounted and allow the same attempt to finish', async t => {
  const { report } = await codingCompactionFixture(t, 'summary-peak'); assert.equal(report.error, undefined); assert.equal(report.captured, true);
  const rows = report.ledger.filter(row => report.admissions.some(request => request.kind === 'summary' && request.requestId === row.requestId));
  assert.equal(rows.length, 2);
  for (const row of rows) assert.equal(row.settledMicroCny, report.admissions.find(request => request.requestId === row.requestId).estimatedMaxCostMicroCny);
  assert.ok(report.remainingMicroCny > 0);
});

test('the native summary input itself can be unaffordable and sends nothing', async t => {
  const { report } = await codingCompactionFixture(t, 'summary-too-large');
  assert.ok(report.error); assert.equal(report.summaryRequests, 0); assert.equal(report.compactions, 0); assert.equal(report.ordinary, 2);
  assert.equal(report.remainingMicroCny, 1000000);
  assert.ok(report.selections.find(item => item.kind === 'summary').inputBytes * 2 > report.remainingMicroCny);
});
