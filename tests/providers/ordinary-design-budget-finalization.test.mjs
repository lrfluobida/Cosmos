import assert from 'node:assert/strict';
import test from 'node:test';
import { PiSessionError } from '../../src/providers/pi.ts';
import { BUDGET_FINALIZATION_PROMPT } from '../../src/runtime/repair/author-protocol.ts';
import { finalizationFixture } from './ordinary-design-budget-finalization.fixture.mjs';

test('COS136 F2 exact unsent output floor rejection permits one native tool-free followup', async t => {
  const f = await finalizationFixture(t);
  assert.equal(f.error.code, 'author_review_reserve'); assert.equal(f.dispatches.length, 30);
  assert.equal(typeof f.role.budgetFinalization, 'function');
  const source = await f.role.budgetFinalization(f.error);
  assert.equal(source.stage, 'ordinary_output_limit'); assert.equal(source.floor, 8192);
  const before = await f.controller.read(); assert.equal(before.run.fees.settledMicroCny, 518011);
  const answer = await f.finalize(BUDGET_FINALIZATION_PROMPT);
  assert.equal(JSON.parse(answer.text).summary, 'Only synthetic source output; checks pending.');
  assert.equal(f.dispatches.length, 31); assert.equal(f.dispatches.at(-1).cap, 4096);
  assert.deepEqual(f.dispatches.at(-1).activeTools, []); assert.deepEqual(f.dispatches.at(-1).callableTools, []);
  assert.equal(f.admissions.at(-1).inputBytes, f.dispatches.at(-1).inputBytes);
  assert.ok(f.admissions.at(-1).estimatedMaxCostMicroCny <= 231989);
  await assert.rejects(f.finalize('No second followup.')); assert.equal(f.dispatches.length, 31);
});


test('COS136 F2 a different error object cannot authorize finalization', async t => {
  const f = await finalizationFixture(t);
  const spoof = new PiSessionError(f.error.code, f.error.message);
  assert.equal(await f.role.budgetFinalization(spoof), null);
  await assert.rejects(f.role.finalizeBudget(spoof, BUDGET_FINALIZATION_PROMPT));
  assert.equal(f.dispatches.length, 30);
});

test('COS136 F4 request 32 unsent is not refunded to obtain another slot', async t => {
  const f = await finalizationFixture(t, { workAt: 31 });
  assert.equal(f.error.code, 'author_review_reserve'); assert.equal(f.dispatches.length, 31);
  assert.equal(await f.role.budgetFinalization(f.error), null);
  await assert.rejects(f.finalize(BUDGET_FINALIZATION_PROMPT)); assert.equal(f.dispatches.length, 31);
});

for (const settings of [{ legacy: true }, { race: true }, { earlyFailure: 'length' }, { earlyFailure: 'unknown' }]) test('COS136 F2 retains terminal source ' + JSON.stringify(settings), async t => {
  const f = await finalizationFixture(t, settings); assert.ok(f.error);
  if (settings.legacy) assert.equal(f.role.budgetFinalization, undefined);
  else assert.equal(await f.role.budgetFinalization(f.error), null);
  const sent = f.dispatches.length;
  await assert.rejects(f.role.readonlyPrompt(BUDGET_FINALIZATION_PROMPT)); assert.equal(f.dispatches.length, sent);
});

test('COS136 F4 finalization settles its real highest quote within the original reserve', async t => {
  const f = await finalizationFixture(t, { peak: true }); const before = await f.controller.read();
  await f.finalize(BUDGET_FINALIZATION_PROMPT);
  const after = await f.controller.read(), quote = f.admissions.at(-1).estimatedMaxCostMicroCny;
  assert.equal(after.run.fees.settledMicroCny - before.run.fees.settledMicroCny, quote);
  assert.ok(1125000 - after.run.fees.settledMicroCny >= 375000);
  assert.equal(after.run.fees.reservedMicroCny, 0);
});
