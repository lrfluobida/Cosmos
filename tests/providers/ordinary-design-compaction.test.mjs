import assert from 'node:assert/strict';
import test from 'node:test';
import { ordinaryDesignCompactionFixture } from './ordinary-design-compaction.fixture.mjs';

test('COS125 real native summary is quoted before dispatch and preserves original sources', async t => {
  const { report: r, state } = await ordinaryDesignCompactionFixture(t);
  assert.equal(r.error, undefined);
  assert.ok(r.preflights.length > 0, 'Ordinary design must preflight the real native summary context.');
  assert.ok(r.summaries > 0); assert.ok(r.compactions > 0);
  assert.ok(r.dispatches.filter(item => item.kind === 'summary').every(item => item.sdkCap === 384000 && item.cap === 8192));
  assert.equal(r.sourceRead, true); assert.equal(r.networkCalls, 0);
  for (const request of r.admissions) {
    assert.equal(request.estimatedMaxCostMicroCny, request.inputBytes * 2 + request.maxOutputTokens * 8);
    assert.equal(state.ledger.entries.find(row => row.requestId === request.requestId).status, 'settled');
  }
});

test('COS125 skipped native summary consumes no provider, admission, accounting or request slot', async t => {
  const { report: r, state } = await ordinaryDesignCompactionFixture(t, 'skip', { maxRequests: 5 });
  assert.equal(r.error, undefined);
  assert.equal(r.preflights.length, 1, 'The actual summary must be rejected before any request side effect.');
  assert.equal(r.preflights[0].result, 'skip'); assert.equal(r.summaries, 0); assert.equal(r.compactions, 0);
  assert.equal(r.ordinary, 5, 'All five original ordinary slots remain usable.');
  assert.ok(r.events[0].projectionUnchanged); assert.ok(r.events[0].leafUnchanged);
  assert.equal(r.events[0].checkpoints, 0); assert.ok(r.events[0].errorMessage); assert.equal(r.events[0].aborted, false);
  assert.equal(r.selections.filter(item => item.kind === 'summary').length, 0);
  assert.equal(r.admissions.length, 5); assert.equal(r.settlements.length, 5);
  assert.equal(state.ledger.entries.filter(row => r.admissions.some(request => request.requestId === row.requestId)).length, 5);
});

test('COS125 fewer than three remaining request slots preserves the ordinary turn', async t => {
  const { report: r } = await ordinaryDesignCompactionFixture(t, 'success', { maxRequests: 4, finalAt: 4 });
  assert.equal(r.error, undefined); assert.equal(r.ordinary, 4); assert.equal(r.summaries, 0); assert.deepEqual(r.preflights, []);
});

test('COS125 native no-op does not invent a summary checkpoint', async t => {
  const { report: r } = await ordinaryDesignCompactionFixture(t, 'noop', { finalAt: 3 });
  assert.equal(r.error, undefined); assert.equal(r.summaries, 0); assert.equal(r.compactions, 0); assert.deepEqual(r.preflights, []);
});

for (const mode of ['skip-cancel', 'skip-close', 'skip-deadline', 'skip-leaf', 'skip-projection', 'skip-missing-event',
  'floor-unaffordable', 'reserve-race', 'unknown', 'sdk-error', 'toolcall']) test('COS125 actual summary ' + mode + ' remains fatal', async t => {
  const { report: r, role, state } = await ordinaryDesignCompactionFixture(t, mode);
  assert.ok(r.error, JSON.stringify(r)); assert.equal(r.compactions, 0);
  assert.equal(r.ordinary, 2, 'No ordinary provider continuation follows a fatal summary boundary.');
  assert.equal(r.summaries, ['unknown', 'sdk-error', 'toolcall'].includes(mode) ? 1 : 0);
  const count = r.dispatches.length; await assert.rejects(role.prompt('No retry')); assert.equal(r.dispatches.length, count);
  if (mode === 'unknown') assert.equal(state.ledger.entries.at(-1).status, 'unknown');
  if (mode === 'reserve-race') { assert.equal(r.preflights[0].result, 'admit'); assert.equal(r.error.code, 'admission_rejected'); }
});

test('COS125 native history and turn summaries keep the first settled charge when the second is skipped', async t => {
  const { report: r, state } = await ordinaryDesignCompactionFixture(t, 'split-skip', { history: true, maxRequests: 7 });
  assert.equal(r.error, undefined); assert.equal(r.preflights.length, 2);
  assert.deepEqual(r.preflights.map(item => item.result), ['admit', 'skip']);
  assert.equal(r.summaries, 1); assert.equal(r.compactions, 0); assert.equal(r.ordinary, 6);
  const request = r.admissions.find(item => item.kind === 'summary');
  const row = state.ledger.entries.find(row => row.requestId === request.requestId);
  assert.equal(row.status, 'settled'); assert.equal(row.settledMicroCny, 10);
  assert.equal(r.settlements.filter(item => item.kind === 'summary').length, 1);
  assert.ok(r.events[0].projectionUnchanged); assert.ok(r.events[0].leafUnchanged);
});

test('COS125 second summary fails when its first settled charge leaves no original ordinary floor', async t => {
  const { report: r } = await ordinaryDesignCompactionFixture(t, 'split-floor-unaffordable', { history: true });
  assert.ok(r.error); assert.equal(r.ordinary, 3); assert.equal(r.summaries, 1); assert.equal(r.preflights.length, 2);
  assert.equal(r.compactions, 0); assert.equal(r.settlements.filter(item => item.kind === 'summary').length, 1);
});

test('COS125 settled length summary keeps the existing context fallback', async t => {
  const { report: r } = await ordinaryDesignCompactionFixture(t, 'length');
  assert.equal(r.error, undefined); assert.equal(r.summaries, 1); assert.equal(r.compactions, 0); assert.equal(r.ordinary, 5);
  assert.ok(r.events[0].projectionUnchanged); assert.equal(r.settlements.find(item => item.kind === 'summary').stopReason, 'length');
});
