import assert from 'node:assert/strict';
import test from 'node:test';
import { PiSessionError } from '../../src/providers/pi.ts';
import { BUDGET_FINALIZATION_PROMPT } from '../../src/runtime/repair/author-protocol.ts';
import { authorBudgetFixture, estimate, request } from '../roles/author-output-budget.fixture.ts';
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

test('R34 finalization quotes the full 94576-byte input against 203105 microCNY', async t => {
  const f = await authorBudgetFixture(t, 1125000);
  await f.spend(546895);
  await f.create({ ordinaryDesignBudgetCompaction: true, ordinaryDesignBudgetPolicy: 'review-reserve/1',
    ordinaryDesignFinalizationPolicy: 'budget-followup/1', authorMaxRequests: { design: 64 } });
  const config = f.configs[0], before = await f.controller.read();
  const readonly = Object.freeze({ ...request, inputBytes: 94576, maxOutputTokens: 4096 });
  assert.equal(estimate(readonly), 221920);
  assert.equal(estimate({ ...readonly, maxOutputTokens: 2048 }), 205536);
  assert.equal(estimate({ ...readonly, maxOutputTokens: 1024 }), 197344);
  await assert.rejects(config.requestOutputLimit(readonly), { code: 'author_review_reserve' });
  const finalization = Object.freeze({ ...readonly, finalizationOutputFloor: 1024 });
  const cap = await config.requestOutputLimit(finalization);
  assert.equal(cap, 1744);
  assert.equal(estimate({ ...readonly, maxOutputTokens: cap }), 203104);
  assert.equal(estimate({ ...readonly, maxOutputTokens: cap + 1 }), 203112);
  assert.deepEqual(await f.controller.read(), before);
  await f.spend(203105 - 197344, 'floor-boundary');
  assert.equal(await config.requestOutputLimit(finalization), 1024);
  await f.spend(1, 'one-below-floor');
  await assert.rejects(config.requestOutputLimit(finalization), { code: 'author_review_reserve' });
});

test('native finalization dispatches the highest affordable cap and retains unfinished work', async t => {
  const reply = JSON.stringify({ summary: 'Draft only.', remaining: ['Missing acceptance scenario.'], uncertainty: ['Coverage unverified.'] });
  const f = await finalizationFixture(t, { settledAfterWork: 546895, reply, peak: true });
  const before = await f.controller.read(), source = await f.role.budgetFinalization(f.error);
  assert.equal(source.floor, 8192);
  const answer = await f.finalize(BUDGET_FINALIZATION_PROMPT);
  assert.equal(answer.text, reply);
  const sent = f.dispatches.at(-1), admitted = f.admissions.at(-1);
  assert.equal(f.dispatches.length, 31);
  assert.deepEqual(sent.activeTools, []); assert.deepEqual(sent.callableTools, []);
  assert.equal(admitted.inputBytes, sent.inputBytes);
  const available = 750000 - before.run.fees.settledMicroCny;
  const highest = Math.floor((available - 2 * sent.inputBytes) / 8);
  assert.ok(highest >= 1024 && highest < 4096);
  assert.equal(sent.cap, highest); assert.equal(admitted.maxOutputTokens, highest);
  assert.equal(admitted.estimatedMaxCostMicroCny, estimate(admitted));
  const after = await f.controller.read();
  assert.equal(after.run.fees.settledMicroCny - before.run.fees.settledMicroCny, estimate(admitted));
  await assert.rejects(f.finalize(BUDGET_FINALIZATION_PROMPT)); assert.equal(f.dispatches.length, 31);
});

test('native finalization rejects an unaffordable 1024 floor without reserving or sending', async t => {
  const f = await finalizationFixture(t, { settledAfterWork: 560000 });
  const before = await f.controller.read();
  await assert.rejects(f.finalize(BUDGET_FINALIZATION_PROMPT), { code: 'author_review_reserve' });
  assert.equal(f.selections.at(-1).maxOutputTokens, 4096);
  assert.ok(2 * f.selections.at(-1).inputBytes < 750000 - before.run.fees.settledMicroCny);
  assert.ok(estimate({ ...f.selections.at(-1), maxOutputTokens: 1024 }) > 750000 - before.run.fees.settledMicroCny);
  assert.equal(f.dispatches.length, 30); assert.equal(f.admissions.length, 30);
  await assert.rejects(f.finalize(BUDGET_FINALIZATION_PROMPT));
  assert.deepEqual(await f.controller.read(), before);
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


test('COS136 F2 summary admission rejection cannot authorize an ordinary finalization', async t => {
  const f = await finalizationFixture(t, { workAt: 2, summaryBudget: true });
  assert.equal(f.error.code, 'author_output_budget'); assert.equal(f.dispatches.length, 2);
  assert.equal(await f.role.budgetFinalization(f.error), null);
  await assert.rejects(f.finalize(BUDGET_FINALIZATION_PROMPT)); assert.equal(f.dispatches.length, 2);
});

for (const reason of ['closed', 'cancelled', 'deadline']) test('COS136 F2 pending source respects ' + reason, async t => {
  const f = await finalizationFixture(t), sent = f.dispatches.length;
  if (reason === 'closed') await f.role.close();
  if (reason === 'deadline') t.mock.method(Date, 'now', () => Date.parse(f.input.task.budget.originalDeadlineAt));
  const signal = reason === 'cancelled' ? AbortSignal.abort() : undefined;
  await assert.rejects(f.role.finalizeBudget(f.error, BUDGET_FINALIZATION_PROMPT, { signal }));
  assert.equal(f.dispatches.length, sent);
});


test('COS136 F1 finalization is a trusted design-only selection and rejects invalid policy', async t => {
  const f = await authorBudgetFixture(t, 1125000);
  const enabled = { ordinaryDesignBudgetCompaction: true, ordinaryDesignBudgetPolicy: 'review-reserve/1', ordinaryDesignFinalizationPolicy: 'budget-followup/1', authorMaxRequests: { design: 32 } };
  for (const [role, purpose] of [['design', undefined], ['art', undefined], ['coding', undefined], ['reviewer', undefined], ['cosmos', 'planning'], ['design', 'planning']]) {
    await f.create(enabled, { ...f.input, role, purpose });
    assert.equal(f.configs.at(-1).ordinaryDesignFinalizationPolicy, role === 'design' && !purpose ? 'budget-followup/1' : undefined);
  }
  for (const patch of [{ ordinaryDesignFinalizationPolicy: null }, { ordinaryDesignFinalizationPolicy: 'unknown' }, { ordinaryDesignBudgetPolicy: undefined }, { authorMaxRequests: { design: 16 } }]) {
    await assert.rejects(f.create({ ...enabled, ...patch }), /ordinaryDesignFinalizationPolicy/);
  }
});
