import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { codingCompactionFixture } from './coding-compaction.fixture.mjs';

for (const [mode, balance, cap] of [['affordable-full', 1067661, 65536], ['affordable-reduced', 500000, 29732], ['affordable-floor', 294912, 4096]]) {
  test(`affordable coding ${mode} preserves context and sends its maximum affordable ordinary cap`, async t => {
    const { report } = await codingCompactionFixture(t, mode);
    assert.equal(report.networkCalls, 0); assert.equal(report.error, undefined);
    assert.equal(report.summaryRequests, 0, 'An affordable ordinary turn must not buy a summary');
    assert.equal(report.compactions, 0); assert.deepEqual(report.events, []); assert.equal(report.ordinary, 4);
    const boundary = report.boundaries.find(item => item.inputBytes === 131072);
    assert.equal(boundary.remainingMicroCny, balance); assert.equal(boundary.trigger, false); assert.equal(boundary.projectionUnchanged, true);
    assert.ok(boundary.inputBytes * 2 + 65536 * 8 > balance / 2, 'The old half-balance policy would select a summary');
    const request = report.admissions.at(-1), sent = report.dispatches.at(-1);
    assert.equal(request.inputBytes, boundary.inputBytes); assert.equal(request.maxOutputTokens, cap); assert.equal(sent.sentCap, cap);
    assert.equal(request.estimatedMaxCostMicroCny, request.inputBytes * 2 + cap * 8);
    assert.ok(request.estimatedMaxCostMicroCny <= balance);
    if (cap < 65536) assert.ok(request.inputBytes * 2 + (cap + 1) * 8 > balance);
    assert.equal(report.currentTaskUnchanged, true); assert.equal(report.fixedPacketAndToolsRetained, true);
    assert.equal(report.autoCompactionRestoredDisabled, true);
  });
}

test('minimum coding output is unaffordable during a temporary reservation and native compaction keeps the same attempt', async t => {
  const { report } = await codingCompactionFixture(t);
  assert.equal(report.error, undefined); assert.equal(report.captured, true);
  assert.equal(report.ordinary, 5); assert.equal(report.summaryRequests, 2); assert.equal(report.compactions, 2);
  const boundary = report.boundaries.find(item => item.inputBytes === 251339);
  assert.equal(boundary.remainingMicroCny, 535445); assert.equal(boundary.trigger, true);
  assert.equal(report.pressures[0].beforeMicroCny, 1069753); assert.equal(report.pressures[0].released, true);
  assert.ok(boundary.inputBytes * 2 + 4096 * 8 > boundary.remainingMicroCny);
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

for (const mode of ['length-single', 'length-split']) test(`settled optional ${mode} retains context and continues the same author attempt`, async t => {
  const { report } = await codingCompactionFixture(t, mode, mode === 'length-split');
  assert.equal(report.networkCalls, 0); assert.equal(report.partialToolCalls, 0);
  const failed = report.events.filter(event => event.type === 'compaction_end');
  assert.equal(failed.length, 1); assert.equal(failed[0].saved, 0);
  assert.equal(failed[0].projectionUnchanged, true); assert.equal(failed[0].entriesUnchanged, true);
  const summaryRows = report.ledger.filter(row => report.admissions.some(request => request.kind === 'summary' && request.requestId === row.requestId));
  assert.equal(summaryRows.length, mode === 'length-split' ? 2 : 1);
  assert.ok(summaryRows.every(row => row.status === 'settled' && row.settledMicroCny === 10));
  assert.equal(report.error, undefined, 'The discarded summary must not latch the author failure');
  assert.equal(report.compactions, 0); assert.equal(report.ordinary, mode === 'length-split' ? 6 : 5);
  assert.equal(report.summaryRequests, summaryRows.length); assert.equal(report.captured, true);
  assert.equal(report.currentTaskUnchanged, true); assert.equal(report.fixedPacketAndToolsRetained, true);
  assert.equal(report.autoCompactionRestoredDisabled, true);
  assert.ok(report.boundaries.at(-1).inputBytes >= report.boundaries.find(boundary => boundary.trigger).inputBytes + 32768);
  assert.equal(report.boundaries.at(-1).trigger, false, 'Discarded summary disables later automatic compaction');
});

test('a read-only format turn cannot trigger compaction and restores its tool loadout', async t => {
  const f = await codingCompactionFixture(t), before = f.requestCounts(), policies = f.report.policies.length;
  await f.readonlyPrompt();
  assert.deepEqual(f.requestCounts(), { ordinary: before.ordinary + 1, summaryRequests: before.summaryRequests });
  assert.equal(f.report.policies.length, policies); assert.equal(f.native.settingsManager.getCompactionSettings(f.native.model).enabled, false);
  assert.deepEqual(f.native.getActiveToolNames().sort(), ['synthetic_read', 'write']);
});

for (const mode of ['toolcall', 'unknown', 'budget-first', 'budget-second', 'balance-race', 'deadline', 'cancel', 'invalid-sdk-cap']) {
  test(`production compaction ${mode} stops before checkpoint or further ordinary dispatch`, async t => {
    const { report, role, f, requestCounts } = await codingCompactionFixture(t, mode, mode === 'budget-second');
    assert.ok(report.error); assert.equal(report.compactions, 0); assert.equal(report.ordinary, mode === 'budget-second' ? 4 : 3);
    assert.equal(report.summaryRequests, ['toolcall', 'unknown', 'budget-second'].includes(mode) ? 1 : 0);
    assert.ok(report.events.filter(event => event.type === 'compaction_end').every(event => event.saved === 0));
    const counts = requestCounts(); await assert.rejects(role.prompt('Do not retry')); assert.deepEqual(requestCounts(), counts);
    await assert.rejects(readFile(join(f.artifactRoot, 'authors/coding.txt')), { code: 'ENOENT' });
    if (mode === 'unknown') {
      assert.equal(report.error.code, 'usage_unknown'); assert.equal(report.ledger.at(-1).status, 'unknown'); assert.ok(report.ledger.at(-1).reservedMicroCny > 0);
    }
    if (mode === 'toolcall') { assert.equal(report.error.code, 'compaction_failed'); assert.equal(report.ledger.at(-1).status, 'settled'); }
    if (mode === 'budget-second') assert.equal(report.settlements.filter(item => item.kind === 'summary' && item.outcome === 'settled').length, 1);
    assert.equal(report.autoCompactionRestoredDisabled, true);
  });
}

test('discarded optional length still rejects a later unaffordable ordinary request', async t => {
  const { report, role, requestCounts } = await codingCompactionFixture(t, 'length');
  assert.equal(report.error?.code, 'admission_rejected'); assert.equal(report.ordinary, 4);
  assert.equal(report.summaryRequests, 1); assert.equal(report.compactions, 0); assert.equal(report.partialToolCalls, 0);
  assert.equal(report.ledger.filter(row => row.status === 'settled').length, 5);
  assert.equal(report.dispatches.at(-1).kind, 'ordinary'); assert.equal(report.autoCompactionRestoredDisabled, true);
  const counts = requestCounts(); await assert.rejects(role.prompt('No retry'), { code: 'admission_rejected' }); assert.deepEqual(requestCounts(), counts);
});

for (const mode of ['unknown', 'model', 'accounting', 'cancel', 'close', 'deadline', 'source', 'history']) {
  test(`optional length cannot hide ${mode} failure`, async t => {
    const { report, role, requestCounts, f } = await codingCompactionFixture(t, `length-${mode}`);
    assert.ok(report.error); assert.equal(report.ordinary, 3); assert.equal(report.summaryRequests, 1);
    assert.equal(report.compactions, 0); assert.equal(report.partialToolCalls, 0); assert.equal(report.networkCalls, 0);
    assert.equal(report.autoCompactionRestoredDisabled, true);
    const summaryRow = report.ledger.find(row => report.admissions.some(request => request.kind === 'summary' && request.requestId === row.requestId));
    assert.equal(summaryRow.status, ['unknown', 'model'].includes(mode) ? 'unknown' : 'settled');
    if (mode === 'accounting') assert.equal(report.error.code, 'accounting_error');
    if (mode === 'model') assert.equal(report.error.code, 'model_mismatch');
    if (mode === 'history') assert.equal(report.error.code, 'compaction_failed');
    if (['deadline', 'source'].includes(mode)) assert.equal(report.error.code, 'admission_rejected');
    const counts = requestCounts(); await assert.rejects(role.prompt('No retry')); assert.deepEqual(requestCounts(), counts);
    await assert.rejects(readFile(join(f.artifactRoot, 'authors/coding.txt')), { code: 'ENOENT' });
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

test('summary input admission still rejects an unaffordable native request and sends nothing', async t => {
  const { report } = await codingCompactionFixture(t, 'summary-too-large');
  assert.ok(report.error); assert.equal(report.summaryRequests, 0); assert.equal(report.compactions, 0); assert.equal(report.ordinary, 2);
  assert.equal(report.remainingMicroCny, 1000000);
  assert.ok(report.selections.find(item => item.kind === 'summary').inputBytes * 2 > report.remainingMicroCny);
});
