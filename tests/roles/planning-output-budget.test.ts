import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { createRoleFactory } from '../../src/roles/factory.ts';
import type { RoleFactoryOptions } from '../../src/roles/factory.ts';
import { authorBudgetFixture, estimate, options } from './author-output-budget.fixture.ts';

const request = { requestId: 'planning-budget-source', modelId: 'deepseek-flash' as const, maxOutputTokens: 8192, inputBytes: 77482, hasImages: false };
const enabled = { ordinaryPlanningOutputFloor: 4096 as const, authorBudgetOutputFloor: undefined, maxRequests: 16 };

test('ordinary planning explicitly validates and snapshots the new 4096 floor and 8192 cap', async t => {
  const f = await authorBudgetFixture(t, 250000);
  for (const floor of [0, -1, 4095, 4097, 8192, 4096.5, NaN, Infinity, null, true, '4096']) {
    assert.throws(() => createRoleFactory({ ...options, ordinaryPlanningOutputFloor: floor } as unknown as RoleFactoryOptions), /ordinaryPlanningOutputFloor/);
  }
  for (const maxOutputTokens of [4096, 8191, 8193]) assert.throws(() => createRoleFactory({ ...options, ...enabled, maxOutputTokens }), /ordinaryPlanningOutputFloor/);
  const mutable: RoleFactoryOptions = { ...options, ...enabled, sessionFactory: f.sessionFactory };
  const factory = createRoleFactory(mutable); mutable.ordinaryPlanningOutputFloor = undefined; mutable.maxOutputTokens = 4096;
  const session = await factory({ ...f.input, role: 'cosmos', purpose: 'planning' }); await session.close();
  assert.equal(f.configs[0].maxOutputTokens, 8192); assert.equal(f.configs[0].maxRequests, 16);
  assert.equal(typeof f.configs[0].requestOutputLimit, 'function');
});

test('ordinary planning uses the largest affordable cap and records the actual request in billing', async t => {
  const f = await authorBudgetFixture(t, 250000);
  await f.create(enabled, { ...f.input, role: 'cosmos', purpose: 'planning' });
  const config = f.configs[0]; assert.equal(typeof config.requestOutputLimit, 'function');
  assert.equal(await config.requestOutputLimit!(request), 8192);
  await f.spend(14814, 'first-source-response'); await f.spend(20009, 'second-source-response');
  const before = await f.controller.read();
  const cap = await config.requestOutputLimit!(request);
  assert.equal(cap, 7526); assert.equal(estimate({ ...request, maxOutputTokens: cap }), 215172);
  assert.ok(estimate({ ...request, maxOutputTokens: cap + 1 }) > 215177);
  assert.deepEqual(await f.controller.read(), before, 'Selection only quotes the original ledger.');
  const selected = { ...request, maxOutputTokens: cap, estimatedMaxCostMicroCny: estimate({ ...request, maxOutputTokens: cap }) };
  await config.budget.beforeRequest(selected);
  assert.equal((await f.controller.read()).ledger.entries.at(-1)!.reservedMicroCny, selected.estimatedMaxCostMicroCny);
  await config.budget.afterResponse({ requestId: request.requestId, outcome: 'settled', responseModel: 'deepseek-flash', stopReason: 'stop', elapsedMs: 1,
    usage: { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0, totalTokens: 1200, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
  const receipt = JSON.parse(await readFile(join(f.input.stateDirectory, `billing-${request.requestId}.json`), 'utf8'));
  assert.deepEqual(receipt.request, selected); assert.equal((await f.controller.read()).ledger.entries.at(-1)!.settledMicroCny, 3600);
  assert.equal(config.requestCompaction, undefined); assert.equal(config.requestCompactionAdmission, undefined);
  assert.equal(config.readonlyMaxOutputTokens, undefined); assert.equal(config.ordinaryDesignFinalizationPolicy, undefined); assert.equal(config.jsonOutput, true);
});

test('ordinary planning output selection is independent of display indexing and excludes every other role', async t => {
  const f = await authorBudgetFixture(t);
  for (const [role, purpose] of [['design', undefined], ['art', undefined], ['coding', undefined], ['cosmos', undefined], ['reviewer', undefined],
    ['design', 'planning'], ['reviewer', 'planning'], ['cosmos', 'planning']] as const) {
    await f.create(enabled, { ...f.input, role, purpose });
    assert.equal(typeof f.configs.at(-1)!.requestOutputLimit, role === 'cosmos' && purpose === 'planning' ? 'function' : 'undefined');
    assert.deepEqual(JSON.parse(f.configs.at(-1)!.context).acceptance, f.input.requirement.acceptance);
  }
  await f.create({ authorBudgetOutputFloor: undefined, ordinaryPlanningAcceptanceIndex: async () => {} }, { ...f.input, role: 'cosmos', purpose: 'planning' });
  assert.equal(f.configs.at(-1)!.requestOutputLimit, undefined, 'The existing display option cannot authorize output selection.');
});

for (const available of [187732, 187731]) test(`ordinary planning preserves the new 4096 floor at remaining ${available}`, async t => {
  const f = await authorBudgetFixture(t, available);
  await f.create(enabled, { ...f.input, role: 'cosmos', purpose: 'planning' });
  const select = f.configs[0].requestOutputLimit; assert.equal(typeof select, 'function');
  if (available === 187732) assert.equal(await select!(request), 4096);
  else await assert.rejects(select!(request), /cannot afford/);
  assert.deepEqual((await f.controller.read()).ledger.entries, []);
});
