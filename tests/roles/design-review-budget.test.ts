import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { createRoleFactory } from '../../src/roles/factory.ts';
import type { RoleFactoryOptions } from '../../src/roles/factory.ts';
import { reserveEntry } from '../../src/budget/ledger.ts';
import { authorBudgetFixture, estimate, options } from './author-output-budget.fixture.ts';

const request = { requestId: 'synthetic-review', modelId: 'deepseek-flash' as const, maxOutputTokens: 8192, inputBytes: 92144, hasImages: false };
const enabled = { ordinaryDesignReviewBudget: () => true };

test('COS127 scope validates and snapshots the trusted selector and its fixed cap', async t => {
  const f = await authorBudgetFixture(t);
  for (const selector of [true, false, null, 1, 'design']) assert.throws(() => createRoleFactory({ ...options, ordinaryDesignReviewBudget: selector } as unknown as RoleFactoryOptions), /ordinaryDesignReviewBudget/);
  for (const maxOutputTokens of [4096, 8193, NaN]) assert.throws(() => createRoleFactory({ ...options, ...enabled, maxOutputTokens }), /ordinaryDesignReviewBudget/);
  let calls = 0;
  const mutable: RoleFactoryOptions = { ...options, ordinaryDesignReviewBudget: task => {
    calls++; assert.ok(Object.isFrozen(task)); assert.ok(Object.isFrozen(task.acceptanceIds)); assert.notEqual(task, f.input.task); return true;
  }, sessionFactory: f.sessionFactory };
  const factory = createRoleFactory(mutable); mutable.ordinaryDesignReviewBudget = () => false; mutable.maxOutputTokens = 1;
  const session = await factory({ ...f.input, role: 'reviewer' }); await session.close();
  assert.equal(calls, 1); assert.equal(f.configs[0].maxOutputTokens, 8192); assert.equal(typeof f.configs[0].requestOutputLimit, 'function');
  assert.equal(f.configs[0].requestCompaction, undefined); assert.equal(f.configs[0].requestCompactionAdmission, undefined);
});

test('COS127 scope only calls the selector for non-planning non-validation reviewers', async t => {
  const f = await authorBudgetFixture(t); let calls = 0;
  for (const [role, purpose] of [['design', undefined], ['art', undefined], ['coding', undefined], ['cosmos', undefined],
    ['design', 'planning'], ['cosmos', 'planning'], ['reviewer', 'planning'], ['reviewer', undefined]] as const) {
    await f.create({ authorBudgetOutputFloor: undefined, ordinaryDesignReviewBudget: () => { calls++; return true; } }, { ...f.input, role, purpose });
    assert.equal(typeof f.configs.at(-1)!.requestOutputLimit, role === 'reviewer' && !purpose ? 'function' : 'undefined');
  }
  assert.equal(calls, 1);
  for (const selector of [() => 'true', () => undefined, () => { throw new Error('selector failed'); }]) {
    await assert.rejects(f.create({ ordinaryDesignReviewBudget: selector } as unknown as Partial<RoleFactoryOptions>, { ...f.input, role: 'reviewer' }));
  }
});

test('COS127 scope couples compact reads to the selected reviewer and preserves omitted and false behavior', async t => {
  const f = await authorBudgetFixture(t); await mkdir(join(f.root, 'requirements'));
  await writeFile(join(f.root, 'requirements/v1.json'), '{ "中文": 1 }', 'utf8');
  for (const ordinaryDesignReviewBudget of [undefined, () => false, () => true]) {
    await f.create({ ordinaryDesignReviewBudget }, { ...f.input, role: 'reviewer' });
    const config = f.configs.at(-1)!, tool = config.tools!.find(item => item.name === 'read')!;
    const result = await tool.execute('read', { path: 'requirements/v1.json' }, undefined, undefined, undefined as never);
    const selected = ordinaryDesignReviewBudget?.() === true;
    assert.equal(result.content[0].type === 'text' && result.content[0].text, selected ? '{"中文":1}' : '{ "中文": 1 }');
    assert.equal(typeof config.requestOutputLimit, selected ? 'function' : 'undefined');
    assert.deepEqual(config.tools!.map(tool => tool.name), ['read']);
  }
});

test('COS127 budget original 229213 grant selects 5615 and rejects single-policy negative controls', async t => {
  const f = await authorBudgetFixture(t); await f.spend(445787); await f.create(enabled, { ...f.input, role: 'reviewer' });
  const before = await f.controller.read();
  const quote = (inputBytes: number, cap: number) => reserveEntry(structuredClone(before.ledger), { requestId: request.requestId, taskId: f.input.task.taskId,
    provider: 'deepseek', pricingVersion: 'fixture', estimatedMaxCostMicroCny: estimate({ ...request, inputBytes, maxOutputTokens: cap }) });
  assert.throws(() => quote(103650, 8192), /insufficient/); assert.throws(() => quote(103650, 4096), /insufficient/);
  assert.throws(() => quote(92144, 8192), /insufficient/); assert.equal(quote(92144, 4096).reservedMicroCny, 217056);
  assert.equal(quote(92144, 5615).reservedMicroCny, 229208); assert.throws(() => quote(92144, 5616), /insufficient/);
  assert.ok(f.configs[0].requestOutputLimit, 'Selected reviewer must use the existing budget helper.');
  assert.equal(await f.configs[0].requestOutputLimit!(request), 5615);
  await assert.rejects(f.configs[0].requestOutputLimit!({ ...request, inputBytes: 103650 }), /cannot afford/);
  assert.deepEqual(await f.controller.read(), before);
});

for (const [available, selected] of [[249824, 8192], [217056, 4096], [217055, null]] as const) test(`COS127 budget remaining ${available} honors the 4096 floor`, async t => {
  const f = await authorBudgetFixture(t, available); await f.create(enabled, { ...f.input, role: 'reviewer' });
  const select = f.configs[0].requestOutputLimit!;
  assert.equal(typeof select, 'function');
  if (selected === null) await assert.rejects(select(request), /cannot afford/); else assert.equal(await select(request), selected);
  assert.equal((await f.controller.read()).ledger.entries.length, 0);
});

test('COS127 budget retains non-monotone search and cancellation at its existing yield', async t => {
  const f = await authorBudgetFixture(t, 100); const seen: number[] = [];
  await f.create({ ...enabled, estimatedMaxCostMicroCny: candidate => { seen.push(candidate.maxOutputTokens); return candidate.maxOutputTokens === 8190 ? 100 : 101; } }, { ...f.input, role: 'reviewer' });
  assert.equal(await f.configs[0].requestOutputLimit!(request), 8190); assert.deepEqual(seen, [8192, 8191, 8190]);
  const caller = new AbortController(); let calls = 0;
  await f.create({ ...enabled, estimatedMaxCostMicroCny: () => { if (++calls === 1) setTimeout(() => caller.abort(), 0); return 101; } }, { ...f.input, role: 'reviewer' });
  await assert.rejects(f.configs[1].requestOutputLimit!(request, caller.signal), { name: 'AbortError' });
  assert.ok(calls > 0 && calls <= 128); assert.equal((await f.controller.read()).ledger.entries.length, 0);
});

for (const changed of ['run', 'grant', 'window', 'deadline', 'cleanup'] as const) test('COS127 budget retains original ' + changed + ' guard', async t => {
  const f = await authorBudgetFixture(t); let quotes = 0;
  await f.create({ ...enabled, estimatedMaxCostMicroCny: () => { quotes++; return 1; } }, { ...f.input, role: 'reviewer' });
  const state = await f.controller.read(), authority = await f.controller.executionAuthority(f.input.task.taskId);
  if (changed === 'run') state.run.runId = 'changed';
  if (changed === 'grant') state.ledger.allocations[0].amountMicroCny++;
  if (changed === 'window') authority.windowId = 'changed';
  if (changed === 'deadline') authority.deadlineAt = new Date(Date.parse(authority.deadlineAt) + 1).toISOString();
  if (changed === 'cleanup') t.mock.method(Date, 'now', () => Date.parse(authority.deadlineAt) - 5000);
  t.mock.method(f.controller, 'read', async () => state); t.mock.method(f.controller, 'executionAuthority', async () => authority);
  await assert.rejects(f.configs[0].requestOutputLimit!(request), /original/); assert.equal(quotes, 0); assert.equal(state.ledger.entries.length, 0);
});
