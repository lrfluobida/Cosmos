import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoleFactory } from '../../src/roles/factory.ts';
import type { RoleFactoryOptions } from '../../src/roles/factory.ts';
import { authorBudgetFixture, estimate, options } from './author-output-budget.fixture.ts';

const enabled = { ordinaryDesignReviewBudget: () => true, ordinaryDesignReviewMaxOutputTokens: 16384 as const };
const request = { requestId: 'design-review-cap-source', modelId: 'deepseek-flash' as const, maxOutputTokens: 16384, inputBytes: 128050, hasImages: false };

test('design review 16K opt-in validates its selector dependency and snapshots the cap', async t => {
  const f = await authorBudgetFixture(t, 1125000);
  for (const cap of [0, 4096, 8192, 16383, 16385, 32768, NaN, Infinity, null, true, '16384']) {
    assert.throws(() => createRoleFactory({ ...options, ...enabled, ordinaryDesignReviewMaxOutputTokens: cap } as unknown as RoleFactoryOptions), /ordinaryDesignReviewMaxOutputTokens/);
  }
  assert.throws(() => createRoleFactory({ ...options, ordinaryDesignReviewMaxOutputTokens: 16384 }), /ordinaryDesignReviewMaxOutputTokens/);
  const mutable: RoleFactoryOptions = { ...options, ...enabled, maxRequests: 16, sessionFactory: f.sessionFactory };
  const factory = createRoleFactory(mutable); mutable.ordinaryDesignReviewMaxOutputTokens = undefined; mutable.maxOutputTokens = 1;
  const session = await factory({ ...f.input, role: 'reviewer' }); await session.close();
  const config = f.configs[0]; assert.equal(config.maxOutputTokens, 16384);
  assert.equal(await config.requestOutputLimit!(request), 16384);
  assert.equal(config.maxRequests, 16); assert.equal(config.thinkingLevel, 'low');
  assert.equal(config.requestCompaction, undefined); assert.equal(config.readonlyMaxOutputTokens, undefined);
});

test('design review retains 16K within the unchanged R7 grant after original author and reading costs', async t => {
  const f = await authorBudgetFixture(t, 1125000);
  await f.spend(551715, 'synthetic-author-history');
  for (const [index, cost] of [14884, 17532, 10855].entries()) await f.spend(cost, `original-read-${index}`);
  await f.create(enabled, { ...f.input, role: 'reviewer' });
  const before = await f.controller.read(), config = f.configs[0];
  assert.equal(config.maxOutputTokens, 16384);
  assert.equal(await config.requestOutputLimit!(request), 16384);
  assert.equal(estimate(request), 387172); assert.equal(530014 - estimate(request), 142842);
  assert.deepEqual(await f.controller.read(), before);
});

for (const [available, expected] of [[350000, 11737], [288868, 4096], [288867, null]] as const) test(`design review 16K keeps original budget search and 4096 floor at ${available}`, async t => {
  const f = await authorBudgetFixture(t, available); await f.create(enabled, { ...f.input, role: 'reviewer' });
  const config = f.configs[0]; assert.equal(config.maxOutputTokens, 16384);
  if (expected === null) await assert.rejects(config.requestOutputLimit!(request), /cannot afford/);
  else {
    assert.equal(await config.requestOutputLimit!(request), expected);
    assert.ok(estimate({ ...request, maxOutputTokens: expected }) <= available);
    assert.ok(estimate({ ...request, maxOutputTokens: expected + 1 }) > available);
  }
  assert.deepEqual((await f.controller.read()).ledger.entries, []);
});

test('review capacity remains 8192 when omitted or unselected and never changes other roles', async t => {
  const f = await authorBudgetFixture(t);
  for (const override of [{ ordinaryDesignReviewBudget: () => true }, { ...enabled, ordinaryDesignReviewBudget: () => false }]) {
    await f.create(override, { ...f.input, role: 'reviewer' }); assert.equal(f.configs.at(-1)!.maxOutputTokens, 8192);
  }
  for (const [role, purpose, cap] of [['design', undefined, 32768], ['art', undefined, 8192], ['coding', undefined, 8192], ['cosmos', undefined, 8192],
    ['design', 'planning', 8192], ['cosmos', 'planning', 8192], ['reviewer', 'planning', 8192]] as const) {
    await f.create(enabled, { ...f.input, role, purpose }); assert.equal(f.configs.at(-1)!.maxOutputTokens, cap);
  }
});
