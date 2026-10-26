import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { createRoleFactory } from '../../src/roles/factory.ts';
import type { RoleFactoryOptions } from '../../src/roles/factory.ts';
import * as authorPolicy from '../../src/roles/author-output-budget.ts';
import { reserveEntry } from '../../src/budget/ledger.ts';
import { createPiSession } from '../../src/providers/pi.ts';
import type { PiRequest } from '../../src/providers/pi.ts';
import { authorBudgetFixture, options, request, estimate } from './author-output-budget.fixture.ts';
import { outputLimitFixture, syntheticContext } from '../providers/request-output-limit.fixture.mjs';

test('COS124 room6 request12 chooses 32621 after fixed 32K rejects, without changing the ledger', async t => {
  const f = await authorBudgetFixture(t); await f.spend(170761); await f.create();
  const before = await f.controller.read(), reserve = (cap: number) => reserveEntry(structuredClone(before.ledger), {
    requestId: request.requestId, taskId: f.input.task.taskId, provider: 'deepseek', pricingVersion: 'fixture', estimatedMaxCostMicroCny: estimate({ ...request, maxOutputTokens: cap }) });
  assert.throws(() => reserve(32768), /insufficient/); assert.equal(reserve(8192).reservedMicroCny, 308802);
  assert.equal(reserve(32621).reservedMicroCny, 504234); assert.throws(() => reserve(32622), /insufficient/);
  assert.ok(f.configs[0].requestOutputLimit, 'The existing fixed cap cannot select an affordable design response.');
  assert.equal(await f.configs[0].requestOutputLimit!(request), 32621);
  assert.deepEqual(await f.controller.read(), before);
});

test('COS124 room8 request8 retains 32768 within the original grant', async t => {
  const f = await authorBudgetFixture(t); await f.spend(97374); await f.create();
  assert.equal(await f.configs[0].requestOutputLimit!({ ...request, inputBytes: 95730 }), 32768);
});

test('COS124 native normalized input, selected cap, real reservation and six billing fields agree across settlements', async t => {
  const f = await authorBudgetFixture(t), pi = await outputLimitFixture(t); await f.spend(170761);
  await f.create({ sessionFactory: config => pi.create(config) });
  for (const [index, cap] of [32621, 32620].entries()) {
    await pi.dispatch(syntheticContext(121633));
    const state = await f.controller.read(), entry = state.ledger.entries[index + 1];
    assert.equal(pi.dispatches[index].maxTokens, cap);
    const receipt = JSON.parse(await readFile(join(f.input.stateDirectory, `billing-${entry.requestId}.json`), 'utf8'));
    assert.deepEqual(receipt.request, { requestId: entry.requestId, modelId: 'deepseek-flash', maxOutputTokens: cap,
      inputBytes: 121633, hasImages: false, estimatedMaxCostMicroCny: 121633 * 2 + cap * 8 });
    assert.equal(entry.status, 'settled'); assert.equal(entry.settledMicroCny, 10);
    assert.equal(state.run.fees.settledMicroCny, 170761 + (index + 1) * 10);
  }
});

for (const sample of [{ name: 'exact floor', available: 65536, selected: 8192 }, { name: 'no affordable floor', available: 65535, selected: null },
  { name: 'non-monotone estimate', available: 100, selected: 32766 }]) test(`COS124 ${sample.name}`, async t => {
  const f = await authorBudgetFixture(t, sample.available), seen: number[] = [];
  await f.create({ estimatedMaxCostMicroCny: candidate => { seen.push(candidate.maxOutputTokens);
    return sample.name === 'non-monotone estimate' ? candidate.maxOutputTokens === 32766 ? 100 : 101 : candidate.maxOutputTokens * 8; } });
  const before = await f.controller.read(), select = f.configs[0].requestOutputLimit!;
  if (sample.selected === null) await assert.rejects(select(request), /cannot afford/);
  else assert.equal(await select(request), sample.selected);
  assert.equal(seen[0], 32768); assert.equal(seen.at(-1), sample.selected ?? 8192);
  assert.deepEqual(await f.controller.read(), before);
});

test('COS124 invalid cost estimates reject immediately without reservations', async t => {
  const f = await authorBudgetFixture(t);
  for (const cost of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    let calls = 0; await f.create({ estimatedMaxCostMicroCny: () => { calls++; return cost; } });
    await assert.rejects(f.configs.at(-1)!.requestOutputLimit!(request), /cost estimate/); assert.equal(calls, 1);
  }
  assert.equal((await f.controller.read()).ledger.entries.length, 0);
});

test('COS124 trusted floors validate before sessions and freeze explicit or fallback caps', async t => {
  const f = await authorBudgetFixture(t);
  for (const floor of [{ reviewer: 8192 }, { design: 0 }, { design: -1 }, { design: 1.5 }, { design: NaN }, { design: Infinity },
    { design: Number.MAX_SAFE_INTEGER + 1 }, { design: undefined }, { design: null }, { design: '8192' }, { design: 32769 }]) {
    assert.throws(() => createRoleFactory({ ...options, authorBudgetOutputFloor: floor } as unknown as RoleFactoryOptions), /authorBudgetOutputFloor/);
  }
  assert.throws(() => createRoleFactory({ ...options, authorMaxOutputTokens: { design: 65536 } }), /authorBudgetOutputFloor/);
  for (const explicit of [true, false]) {
    const mutable: RoleFactoryOptions = { ...options, maxOutputTokens: 32768, authorMaxOutputTokens: explicit ? { design: 32768 } : {},
      authorBudgetOutputFloor: { design: 8192 }, sessionFactory: f.sessionFactory };
    const factory = createRoleFactory(mutable);
    mutable.maxOutputTokens = 65536; mutable.authorMaxOutputTokens!.design = 65536; mutable.authorBudgetOutputFloor!.design = 1;
    const session = await factory(f.input); await session.close();
    const config = f.configs.at(-1)!; assert.equal(config.maxOutputTokens, 32768); assert.equal(await config.requestOutputLimit!(request), 32768);
  }
});

test('COS124 policy is explicit per author role and unavailable to planning or review', async t => {
  const f = await authorBudgetFixture(t);
  for (const [role, purpose] of [['design', undefined], ['art', undefined], ['coding', undefined], ['cosmos', undefined],
    ['design', 'planning'], ['cosmos', 'planning'], ['reviewer', undefined]] as const) {
    await f.create({}, { ...f.input, role, purpose });
    assert.equal(typeof f.configs.at(-1)!.requestOutputLimit, role === 'design' && !purpose ? 'function' : 'undefined');
  }
  for (const authorBudgetOutputFloor of [undefined, {}]) { await f.create({ authorBudgetOutputFloor }); assert.equal(f.configs.at(-1)!.requestOutputLimit, undefined); }
});

for (const mode of ['omitted', 'planning', 'reviewer'] as const) test(`COS124 ${mode} retains billing without new request metadata`, async t => {
  const f = await authorBudgetFixture(t), pi = await outputLimitFixture(t);
  await f.create({ ...(mode === 'omitted' ? { authorBudgetOutputFloor: undefined } : {}), sessionFactory: config => pi.create(config) },
    { ...f.input, ...(mode === 'planning' ? { purpose: 'planning' } : mode === 'reviewer' ? { role: 'reviewer' } : {}) });
  await pi.dispatch(syntheticContext(100));
  const entry = (await f.controller.read()).ledger.entries[0];
  const receipt = JSON.parse(await readFile(join(f.input.stateDirectory, `billing-${entry.requestId}.json`), 'utf8'));
  assert.equal(entry.status, 'settled'); assert.equal(receipt.request, undefined);
});

for (const changed of ['runId', 'ledgerId', 'allocation', 'windowId', 'deadlineAt', 'effectiveLimitMicroCny', 'taskGrantMicroCny', 'admissionAllowed'] as const) {
  test(`COS124 current ${changed} drift fails before quoting or reserving`, async t => {
    const f = await authorBudgetFixture(t); let quotes = 0;
    await f.create({ estimatedMaxCostMicroCny: () => { quotes++; return 1; } });
    const original = await f.controller.read(), state = structuredClone(original), authority = await f.controller.executionAuthority(f.input.task.taskId);
    if (changed === 'runId') state.run.runId = 'changed';
    else if (changed === 'ledgerId') state.ledger.ledgerId = 'changed';
    else if (changed === 'allocation') state.ledger.allocations[0].amountMicroCny++;
    else if (changed === 'admissionAllowed') authority.admissionAllowed = false;
    else if (changed === 'windowId' || changed === 'deadlineAt') authority[changed] = 'changed';
    else authority[changed]++;
    t.mock.method(f.controller, 'read', async () => state);
    t.mock.method(f.controller, 'executionAuthority', async () => authority);
    await assert.rejects(f.configs[0].requestOutputLimit!(request), /original.*authority/);
    assert.equal(quotes, 0); assert.deepEqual(state.ledger.entries, original.ledger.entries);
  });
}

for (const changed of ['unknown', 'closed', 'stop'] as const) test(`COS124 ${changed} authority cannot dispatch`, async t => {
  const f = await authorBudgetFixture(t); await f.create();
  if (changed === 'unknown') {
    await f.controller.reserve({ requestId: 'unknown', taskId: f.input.task.taskId, provider: 'deepseek', pricingVersion: 'fixture', estimatedMaxCostMicroCny: 10 });
    await f.controller.admit('unknown'); await f.controller.markUnknown('unknown', [{ artifactId: 'unknown', version: 'v1', location: 'unknown.json' }]);
  } else if (changed === 'stop') await f.controller.stop('Offline stopped fixture.');
  else {
    const original = await f.controller.executionAuthority(f.input.task.taskId);
    t.mock.method(f.controller, 'executionAuthority', async () => ({ ...original, admissionAllowed: false }));
  }
  const before = await f.controller.read(); await assert.rejects(f.configs[0].requestOutputLimit!(request));
  assert.deepEqual(await f.controller.read(), before);
});

for (const changed of ['caller', 'owner', 'cleanup'] as const) test(`COS124 immediately affordable quote still checks ${changed} before return`, async t => {
  const f = await authorBudgetFixture(t), caller = new AbortController(), owner = new AbortController();
  let now = Date.now(), calls = 0; const deadline = Date.parse((await f.controller.read()).run.originalDeadlineAt);
  if (changed === 'owner') t.mock.getter(f.controller, 'signal', () => owner.signal);
  if (changed === 'cleanup') t.mock.method(Date, 'now', () => now);
  await f.create({ estimatedMaxCostMicroCny: () => { calls++;
    if (changed === 'caller') caller.abort(); else if (changed === 'owner') owner.abort(); else now = deadline - 5000;
    return 1;
  } });
  await assert.rejects(f.configs[0].requestOutputLimit!(request, caller.signal));
  assert.equal(calls, 1); assert.equal((await f.controller.read()).ledger.entries.length, 0);
});

for (const reason of ['caller', 'owner', 'cleanup', 'deadline'] as const) test(`COS124 yields during search and stops on asynchronous ${reason} before reservation or transport`, async t => {
  const f = await authorBudgetFixture(t, 100), pi = await outputLimitFixture(t), caller = new AbortController(), owner = new AbortController();
  const originalDeadline = Date.parse((await f.controller.read()).run.originalDeadlineAt), realNow = Date.now;
  let now = realNow(), calls = 0;
  if (reason === 'owner') t.mock.getter(f.controller, 'signal', () => owner.signal);
  if (reason === 'deadline' || reason === 'cleanup') t.mock.method(Date, 'now', () => now);
  // Dispatch through the real SDK prompt to supply its existing request signal.
  const session = await f.create({ estimatedMaxCostMicroCny: () => { if (++calls === 1) setTimeout(() => {
    if (reason === 'caller') caller.abort(); else if (reason === 'owner') owner.abort(); else now = originalDeadline - (reason === 'cleanup' ? 4999 : 0);
  }, 0); return 101; }, sessionFactory: config => pi.create(config) });
  await assert.rejects(session.prompt('No request may escape search cancellation.', { signal: caller.signal }));
  assert.ok(calls > 0 && calls <= 128, `Search must yield in bounded batches, observed ${calls} quotes.`);
  assert.equal(pi.dispatches.length, 0); assert.equal((await f.controller.read()).ledger.entries.length, 0);
});

test('COS124 final real reservation rejects budget spent after a quote without retries', async t => {
  const f = await authorBudgetFixture(t, 300000), pi = await outputLimitFixture(t);
  const session = await f.create({ sessionFactory: config => { const select = config.requestOutputLimit!;
    return pi.create({ ...config, requestOutputLimit: async (request: Omit<PiRequest, 'estimatedMaxCostMicroCny'>, signal?: AbortSignal) => { const cap = await select(request, signal); await f.spend(100000); return cap; } }); } });
  await assert.rejects(session.prompt('Only the original remaining budget authorizes dispatch.'), { code: 'admission_rejected' });
  await assert.rejects(session.prompt('No retry'), { code: 'admission_rejected' });
  assert.equal(pi.dispatches.length, 0); assert.equal((await f.controller.read()).ledger.entries.length, 1);
});

for (const truncated of [false, true]) test(`COS124 output above 8K ${truncated ? 'still rejects length and executes zero partial tools' : 'executes a complete tool call then reaches the original handoff'}`, async t => {
  const f = await authorBudgetFixture(t, 1000000), bodies: any[] = [], content = '原始中文内容。'.repeat(5000);
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(await (input instanceof Request ? input : new Request(input, init)).text()); bodies.push(body);
    const tool = bodies.length === 1;
    const chunk = { id: `offline-${bodies.length}`, model: 'deepseek-flash', choices: [{ index: 0,
      delta: tool ? { tool_calls: [{ index: 0, id: 'complete-write', type: 'function', function: { name: 'write', arguments: JSON.stringify({ path: 'game/note.txt', content }) } }] }
        : { content: JSON.stringify({ summary: '原协议完整交接', remaining: [], uncertainty: [] }) }, finish_reason: truncated ? 'length' : tool ? 'tool_calls' : 'stop' }],
      usage: { prompt_tokens: 30, completion_tokens: tool ? 9001 : 10, total_tokens: tool ? 9031 : 40 } };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  const session = await f.create({ sessionFactory: createPiSession });
  if (truncated) {
    await assert.rejects(session.prompt('The length boundary remains terminal.'), { code: 'incomplete' });
    await assert.rejects(readFile(join(f.root, 'game/note.txt')), { code: 'ENOENT' });
    await assert.rejects(session.prompt('No automatic retry.'), { code: 'incomplete' });
    assert.equal(bodies.length, 1); assert.equal(bodies[0].max_tokens, 32768);
    assert.equal((await f.controller.read()).ledger.entries.length, 1); return;
  }
  const result = await session.prompt('Write the complete output and report the original JSON handoff.');
  assert.deepEqual(JSON.parse(result.text), { summary: '原协议完整交接', remaining: [], uncertainty: [] });
  assert.equal(await readFile(join(f.root, 'game/note.txt'), 'utf8'), content);
  assert.equal(bodies.length, 2); assert.ok(bodies.every(body => body.max_tokens === 32768));
  const state = await f.controller.read(); assert.equal(state.ledger.entries.length, 2); assert.ok(state.ledger.entries.every(entry => entry.status === 'settled'));
});


for (const cap of [8192, 4096, 1]) test('COS125 native summary cap ' + cap + ' stays within the trusted request ceiling', async t => {
  const f = await authorBudgetFixture(t); await f.create();
  assert.equal(await f.configs[0].requestOutputLimit!({ ...request, maxOutputTokens: cap }), cap);
});
for (const cap of [0, NaN, 32769]) test('COS125 rejects invalid trusted cap ' + cap, async t => {
  const f = await authorBudgetFixture(t); await f.create();
  await assert.rejects(f.configs[0].requestOutputLimit!({ ...request, maxOutputTokens: cap }), /Invalid author output cap/);
});

for (const sample of [
  { available: 600000, selected: false, summary: 47042, admission: 'admit' },
  { available: 507835, selected: true, summary: 47042, admission: 'admit' },
  { available: 320635, selected: false, summary: 47042, admission: 'admit' },
  { available: 507835, selected: true, summary: 300000, admission: 'skip' },
  { available: 320635, selected: false, summary: 300000, admission: 'reject' },
]) test('COS125 budget compaction quotes ' + JSON.stringify(sample), async t => {
  const f = await authorBudgetFixture(t, sample.available), original = await f.controller.read();
  const make = (authorPolicy as any).authorBudgetCompaction;
  assert.equal(typeof make, 'function', 'Ordinary design requires early budget compaction and actual summary admission.');
  const policy = make({ controller: f.controller, original, task: f.input.task,
    authority: await f.controller.executionAuthority(f.input.task.taskId), floor: 8192, maxOutputTokens: 32768, estimate });
  const ordinary = { maxOutputTokens: 32768, inputBytes: 127550, hasImages: false };
  assert.equal(await policy.requestCompaction(ordinary), sample.selected);
  const check = () => policy.requestCompactionAdmission({ ordinary, summary: { ...request, inputBytes: sample.summary, maxOutputTokens: 8192 } });
  if (sample.admission === 'reject') await assert.rejects(check(), /cannot afford/);
  else assert.equal(await check(), sample.admission);
  assert.deepEqual(await f.controller.read(), original);
});

for (const changed of ['unknown', 'closed', 'authority', 'deadline', 'invalid', 'caller']) test('COS125 summary admission preserves fatal ' + changed, async t => {
  const f = await authorBudgetFixture(t), original = await f.controller.read(), caller = new AbortController();
  const make = (authorPolicy as any).authorBudgetCompaction; assert.equal(typeof make, 'function');
  const policy = make({ controller: f.controller, original, task: f.input.task,
    authority: await f.controller.executionAuthority(f.input.task.taskId), floor: 8192, maxOutputTokens: 32768,
    estimate: changed === 'invalid' ? 0 : estimate });
  const state = structuredClone(original);
  if (changed === 'unknown') { const entry = reserveEntry(state.ledger, { requestId: 'unknown', taskId: f.input.task.taskId, provider: 'deepseek', pricingVersion: 'fixture', estimatedMaxCostMicroCny: 1 }); entry.unknown = true; entry.status = 'unknown'; }
  if (changed === 'closed') state.ledger.allocationClosures = [{ taskId: f.input.task.taskId } as any];
  if (changed === 'authority') state.run.runId = 'drift';
  if (changed === 'deadline') t.mock.method(Date, 'now', () => Date.parse(original.run.originalDeadlineAt) - 5000);
  if (changed === 'caller') caller.abort();
  t.mock.method(f.controller, 'read', async () => state);
  const before = structuredClone(state);
  await assert.rejects(policy.requestCompactionAdmission({ ordinary: request, summary: { ...request, maxOutputTokens: 8192 } }, caller.signal));
  assert.deepEqual(state, before);
});


test('COS132 review reserve quotes and real admission preserve one third of the original grant', async t => {
  const f = await authorBudgetFixture(t, 1125000); await f.spend(432885);
  await f.create({ ordinaryDesignBudgetCompaction: true, ordinaryDesignBudgetPolicy: 'review-reserve/1' } as Partial<RoleFactoryOptions>);
  const config = f.configs[0], before = await f.controller.read();
  assert.equal(await config.requestCompaction!({ ...request, inputBytes: 91664 }), 'budget_pressure');
  assert.equal(await config.requestOutputLimit!({ ...request, inputBytes: 91664 }), 16723);
  assert.equal(config.readonlyMaxOutputTokens, 4096);
  await assert.rejects(config.requestOutputLimit!({ ...request, inputBytes: 200000 }), { code: 'author_review_reserve' });
  await assert.rejects(config.budget.beforeRequest({ ...request, estimatedMaxCostMicroCny: 317116 }), { code: 'author_review_reserve' });
  assert.deepEqual(await f.controller.read(), before);
  await f.spend(100000, 'concurrent-spend');
  const after = await f.controller.read();
  await assert.rejects(config.budget.beforeRequest({ ...request, estimatedMaxCostMicroCny: 248864 }), { code: 'author_review_reserve' });
  assert.deepEqual(await f.controller.read(), after);
});

test('COS132 budget pressure includes an unaffordable ordinary floor', async t => {
  const f = await authorBudgetFixture(t, 1125000); await f.spend(600000);
  await f.create({ ordinaryDesignBudgetCompaction: true, ordinaryDesignBudgetPolicy: 'review-reserve/1' } as Partial<RoleFactoryOptions>);
  assert.equal(await f.configs[0].requestCompaction!({ ...request, inputBytes: 91664 }), 'budget_pressure');
});


test('COS132 readonly floor and frozen authority do not relax actual admission', async t => {
  const f = await authorBudgetFixture(t, 1125000); await f.spend(750000 - 32767);
  await f.create({ ordinaryDesignBudgetCompaction: true, ordinaryDesignBudgetPolicy: 'review-reserve/1', estimatedMaxCostMicroCny: candidate => candidate.maxOutputTokens * 8 });
  const config = f.configs[0], before = await f.controller.read();
  await assert.rejects(config.requestOutputLimit!({ ...request, maxOutputTokens: 4096 }), { code: 'author_review_reserve' });
  assert.deepEqual(await f.controller.read(), before);
  const authority = await f.controller.executionAuthority(f.input.task.taskId);
  t.mock.method(f.controller, 'executionAuthority', async () => ({ ...authority, admissionAllowed: false }));
  await assert.rejects(config.budget.beforeRequest({ ...request, estimatedMaxCostMicroCny: 1 }), /authority/);
  assert.deepEqual(await f.controller.read(), before);
});
