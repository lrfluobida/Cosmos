import assert from 'node:assert/strict';
import test from 'node:test';
import { assessRepair, DEFAULT_REPAIR_POLICY } from '../../src/runtime/repair/policy.ts';
import { designReviewFixture } from './design-review-budget.fixture.mjs';
import { ordinaryDesignCompactionFixture } from './ordinary-design-compaction.fixture.mjs';

// The real failed run had 91664B after a 75809B checkpoint (15855B growth), with 29 requests used.
// This independent synthetic native chain grows 19753B; both are below the unchanged 32768B cooldown.
// It does not copy the real session, and its native summary sizes are measured separately.
test('COS132 budget pressure permits one real SDK summary inside the normal cooldown', async t => {
  const { report: r } = await ordinaryDesignCompactionFixture(t, 'success', {
    newPolicy: true, smallTurns: true, pressureAt: 3, finalAt: 5, allocation: 1800000, availableAt2: 1000000, availableAt3: 850000,
  });
  t.diagnostic(JSON.stringify({ error:r.error, boundaries:r.boundaries.map(b=>({bytes:b.inputBytes,cp:b.checkpoints,after:b.afterCheckpoints})),dispatch:r.dispatches.map(d=>({kind:d.kind,bytes:d.inputBytes,cap:d.cap})),pre:r.preflights.map(p=>({bytes:p.summary.inputBytes,result:p.result})) }));
  assert.equal(r.error, undefined);
  assert.equal(r.networkCalls, 0);
  assert.equal(r.compactions, 2, 'The second successful tool boundary needs a summary before 32768 bytes of growth.');
  assert.ok(r.boundaries[3].inputBytes - r.dispatches.find((row, i) => row.kind === 'ordinary' && i > 3).inputBytes < 32768);
  assert.ok(r.admissions.every(request => request.estimatedMaxCostMicroCny === request.inputBytes * 2 + request.maxOutputTokens * 8));
});


test('COS132 one pressure exception cannot recur within the next cooldown', async t => {
  const { report: r } = await ordinaryDesignCompactionFixture(t, 'success', {
    newPolicy: true, smallTurns: true, smallTurnCount: 5, pressureAt: 3, finalAt: 6,
    allocation: 1800000, availableAt2: 1000000, availableAt3: 850000,
  });
  assert.equal(r.error, undefined); assert.equal(r.compactions, 2);
  assert.equal(r.boundaries.at(-1).checkpoints, 2); assert.equal(r.boundaries.at(-1).afterCheckpoints, 2);
  assert.ok(r.boundaries.at(-1).inputBytes - r.dispatches.at(-2).inputBytes < 32768);
});

test('COS132 readonly correction shares 29 plus summary plus ordinary plus readonly request slots', async t => {
  const { report: r, readonlyPrompt, role, f } = await ordinaryDesignCompactionFixture(t, 'success', {
    newPolicy: true, warmupRounds: 27, finalAt: 3, allocation: 1800000, availableAt2: 1000000,
  });
  assert.equal(r.error, undefined); assert.equal(r.summaries, 1); assert.equal(r.ordinary, 30);
  assert.equal(r.admissions.length, 31);
  await readonlyPrompt(); assert.equal(r.dispatches.length, 32); assert.equal(r.dispatches.at(-1).cap, 4096);
  const before = await f.controller.read();
  await assert.rejects(role.readonlyPrompt('No request 33.'), { code: 'request_limit' });
  assert.equal(r.dispatches.length, 32); assert.deepEqual(await f.controller.read(), before);
});

for (const mode of ['floor-unaffordable', 'reserve-race', 'unknown', 'skip-cancel']) test('COS132 pressure preserves fatal ' + mode, async t => {
  const { report: r } = await ordinaryDesignCompactionFixture(t, mode, {
    newPolicy: true, smallTurns: true, pressureAt: 3, finalAt: 5, allocation: 1800000, availableAt2: 1000000,
  });
  assert.ok(r.error); assert.equal(r.ordinary, 3); assert.equal(r.compactions, 0);
  if (mode === 'floor-unaffordable') assert.equal(r.error.code, 'author_output_budget');
  if (mode === 'reserve-race') assert.equal(r.error.code, 'author_output_budget');
});


test('COS132 actual native pressure can recover when the ordinary floor is initially unavailable', async t => {
  const { report: r } = await ordinaryDesignCompactionFixture(t, 'success', {
    newPolicy: true, smallTurns: true, pressureAt: 3, finalAt: 4, allocation: 1800000, availableAt2: 830000,
  });
  assert.equal(r.error, undefined); assert.equal(r.compactions, 1);
  assert.ok(r.preflights[0].ordinary.inputBytes * 2 + 8192 * 8 > 230000);
  assert.ok(r.admissions.at(-1).estimatedMaxCostMicroCny <= 229990);
});

test('COS132 actual maximum summary charges are settled before the next floor is quoted', async t => {
  const { report: r, state } = await ordinaryDesignCompactionFixture(t, 'success', {
    newPolicy: true, smallTurns: true, pressureAt: 3, finalAt: 5, peakSummary: true,
    allocation: 1800000, availableAt2: 1000000, availableAt3: 850000,
  });
  assert.equal(r.error.code, 'author_review_reserve'); assert.equal(r.summaries, 2); assert.equal(r.ordinary, 4);
  for (const request of r.admissions.filter(row => row.kind === 'summary')) assert.equal(state.ledger.entries.find(row => row.requestId === request.requestId).settledMicroCny, request.estimatedMaxCostMicroCny);
  assert.ok(state.run.fees.settledMicroCny < 1200000);
});

for (const mode of ['tool', 'length']) test('COS132 readonly ' + mode + ' cannot supply a new handoff or tools', async t => {
  const { report: r, readonlyPrompt } = await ordinaryDesignCompactionFixture(t, 'success', {
    newPolicy: true, finalAt: 3, allocation: 1800000, availableAt2: 1000000,
    readonlyTool: mode === 'tool', readonlyLength: mode === 'length',
  });
  assert.equal(r.error, undefined); const before = r.dispatches.length;
  await assert.rejects(readonlyPrompt(), { code: mode === 'length' ? 'incomplete' : 'request_limit' });
  assert.equal(r.dispatches.length, before + 1); assert.equal(r.dispatches.at(-1).cap, 4096);
});


for (const verdict of ['approved', 'changes_requested']) test('COS132 original reviewer consumes its reserve and preserves semantic ' + verdict, async t => {
  const f = await designReviewFixture(t, verdict, { recovery: true }), sent = f.dispatches.filter(row => row.role === 'reviewer');
  assert.equal(f.result.review.verdict, verdict); assert.equal(f.result.state, verdict === 'approved' ? 'passed' : 'needs_changes');
  assert.equal(sent.length, 2); assert.ok(sent.every(row => row.cap === 8192));
  assert.equal(sent[1].context.messages.filter(row => row.role === 'toolResult').length, 5);
  assert.equal(f.dispatches.filter(row => ['art', 'coding'].includes(row.role)).length, 0);
  if (verdict === 'changes_requested') { assert.equal(f.results.length, 3); assert.ok(f.results.slice(1).every(task => task.state === 'waiting_user' && task.stateReason === 'Required dependency has not passed.' && task.attempts.length === 0)); }
  if (verdict === 'changes_requested') {
    assert.ok(f.feedback.issues.every(issue => issue.classification === 'insufficient_evidence' && issue.checkId === 'independent_review'));
    const decision = assessRepair({ snapshot: f.state, requirement: f.requirement, history: [f.feedback], policy: DEFAULT_REPAIR_POLICY, now: Date.now(),
      estimate: { costMicroCny: 1000, durationMs: 1000, cleanupMs: 5000 } });
    assert.equal(decision.action, 'collect_evidence'); assert.equal(decision.reason, 'insufficient_evidence');
  }
  const quote = sent.reduce((sum, row) => sum + row.inputBytes * 2 + row.cap * 8, 0);
  assert.ok(quote <= 375000); assert.equal(f.state.run.fees.settledMicroCny, 750000 + quote);
  t.diagnostic(JSON.stringify({ reviewInputs: sent.map(row => row.inputBytes), peakQuote: quote, reserve: 375000 }));
});
