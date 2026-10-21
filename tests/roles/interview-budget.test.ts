import assert from 'node:assert/strict';
import { link, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { requestDesignDraft } from '../../src/roles/interview.ts';
import { reserveEntry } from '../../src/budget/ledger.ts';
import { ROLE_PRICING_VERSION } from '../../src/roles/provider-budget.ts';
import { reconcileRoleReceipt } from '../../src/roles/provider-budget.ts';
import { ordinaryDraftOutputLimit } from '../../src/roles/interview-budget.ts';
import { fundedIntakeWork } from '../../src/runtime/public-validation-funding-validation.ts';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { tmpdir } from 'node:os';
import { PassThrough, Readable } from 'node:stream';
import { runCli } from '../../src/cli/index.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { ordinaryDraft } from './ordinary.fixture.ts';
import { budgetFixture } from './interview-budget.fixture.ts';

test('ordinary draft fits actual SDK input into original grant and keeps the configured intent', async t => {
  const f = await budgetFixture(t);
  await f.spend(120_000);
  const before = await f.controller.read();
  await requestDesignDraft(f.options);
  const quote = f.estimates.at(-1)!;
  assert.ok(quote.maxOutputTokens >= 8192 && quote.maxOutputTokens < 16384);
  assert.equal(f.bodies[0].max_tokens, quote.maxOutputTokens);
  assert.deepEqual(f.bodies[0].thinking, { type: 'disabled' });
  assert.throws(() => reserveEntry(structuredClone(before.ledger), { requestId: 'next-cap', taskId: 'intake', provider: 'deepseek', pricingVersion: ROLE_PRICING_VERSION,
    estimatedMaxCostMicroCny: f.options.estimatedMaxCostMicroCny({ ...quote, maxOutputTokens: quote.maxOutputTokens + 1 }) }), /insufficient/i);
  const intent = JSON.parse(await readFile(join(f.root, 'intake-sessions/draft-1/intent.json'), 'utf8'));
  assert.equal(intent.requestConfig.maxOutputTokens, 16384); assert.equal(intent.requestConfig.thinkingLevel, 'off');
  assert.deepEqual((await f.controller.read()).ledger.allocations, before.ledger.allocations);
});

test('exact original native pre-admission denial gets one successor and a bound cached reply', async t => {
  const f = await budgetFixture(t); await f.spend(120_000);
  await assert.rejects(requestDesignDraft({ ...f.options, sessionFactory: f.legacyFactory }), /Budget admission rejected/);
  const native = await f.native(), original = await readFile(join(f.root, 'intake-sessions/draft-1/intent.json')), before = await f.controller.read();
  assert.equal(f.bodies.length, 0); assert.equal(before.requests.length, 1);
  const result = await requestDesignDraft(f.options);
  assert.deepEqual(await requestDesignDraft(f.options), result); assert.equal(f.bodies.length, 1);
  assert.ok((await readFile(native.path)).equals(native.bytes));
  assert.ok((await readFile(join(f.root, 'intake-sessions/draft-1/intent.json'))).equals(original));
  assert.deepEqual((await f.controller.read()).ledger.entries[0], before.ledger.entries[0]);
  assert.equal(f.configs[0].context!.includes('predecessor'), false);
  const successor = JSON.parse(await readFile(join(f.root, 'intake-sessions/draft-1-successor-1/intent.json'), 'utf8'));
  assert.equal(successor.predecessor.kind, 'pre_admission_denied');
  const state = await f.controller.read(), last = state.ledger.entries.at(-1)!;
  const billing = JSON.parse(await readFile(join(f.root, `intake-sessions/draft-1-successor-1/billing-${last.requestId}.json`), 'utf8'));
  assert.deepEqual(Object.keys(billing.request).sort(), ['estimatedMaxCostMicroCny', 'hasImages', 'inputBytes', 'maxOutputTokens', 'modelId', 'requestId']);
  assert.equal(billing.request.maxOutputTokens, f.bodies[0].max_tokens);
  assert.equal((await reconcileRoleReceipt({ controller: f.controller, requestId: last.requestId, evidenceDirectory: join(f.root, 'intake-sessions/draft-1-successor-1') })).status, 'already_closed');
});

test('bounded selection handles the exact diagnostic boundary, constant and nonmonotonic estimates', async t => {
  const f = await budgetFixture(t); await f.spend(82_073);
  const state = await f.controller.read(), request = { requestId: 'quote', modelId: 'deepseek-flash' as const, maxOutputTokens: 16384, inputBytes: 22429, hasImages: false };
  const select = (estimate: Parameters<typeof ordinaryDraftOutputLimit>[2]) => ordinaryDraftOutputLimit(f.controller, state, estimate)(request);
  assert.equal(await select(f.options.estimatedMaxCostMicroCny), 15383);
  assert.equal(f.options.estimatedMaxCostMicroCny({ ...request, maxOutputTokens: 15383 }), 167922);
  assert.throws(() => reserveEntry(structuredClone(state.ledger), { requestId: 'next', taskId: 'intake', provider: 'deepseek', pricingVersion: ROLE_PRICING_VERSION,
    estimatedMaxCostMicroCny: f.options.estimatedMaxCostMicroCny({ ...request, maxOutputTokens: 15384 }) }), /insufficient/);
  assert.equal(await select(100), 16384);
  assert.equal(await select(r => r.maxOutputTokens === 12288 ? 100 : 250_001), 12288);
  await assert.rejects(select(250_001), /cannot afford/);
  for (const bad of [0, -1, NaN, Infinity, 1.5]) await assert.rejects(select(bad), /Invalid/);
  assert.deepEqual((await f.controller.read()).ledger, state.ledger);
});

for (const gate of ['grant', 'requests', 'concurrent'] as const) test(`ordinary cap selection retains ${gate} admission authority`, async t => {
  const f = await budgetFixture(t);
  if (gate === 'grant') await f.spend(250_000);
  if (gate === 'requests') for (let i = 0; i < 8; i++) await f.spend(1, `prior-${i}`);
  const options = { ...f.options, sessionFactory: async (config: Parameters<typeof f.sessionFactory>[0]) => {
    if (gate === 'concurrent') {
      const select = config.requestOutputLimit!;
      config.requestOutputLimit = async request => { const cap = await select(request); await f.spend(250_000); return cap; };
    }
    return f.sessionFactory(config);
  } };
  await assert.rejects(requestDesignDraft(options), /admission|authority/i);
  assert.equal(f.bodies.length, 0); assert.equal(fundedIntakeWork(await f.controller.read()).pending.length, 0);
});

test('native evidence requires exact shape, chain, input, identity, zero result and independent UTF-8 file', async t => {
  const f = await budgetFixture(t); await f.spend(120_000);
  await assert.rejects(requestDesignDraft({ ...f.options, sessionFactory: f.legacyFactory }), /Budget admission/);
  const native = await f.native(), before = await f.controller.read();
  const changes: [string, (rows: any[]) => void][] = [
    ['cwd', rows => { rows[0].cwd += '-foreign'; }], ['parent', rows => { rows[4].parentId = rows[1].id; }],
    ['model', rows => { rows[1].modelId = 'other'; }], ['thinking', rows => { rows[2].thinkingLevel = 'low'; }],
    ['system', rows => { rows[3].message.sections.preamble += ' changed'; }], ['user', rows => { rows[4].message.content[0].text += ' changed'; }],
    ['content', rows => { rows[5].message.content.push({ type: 'text', text: 'provider result' }); }],
    ['usage', rows => { rows[5].message.usage.input = 1; }], ['provider error', rows => { rows[5].message.errorMessage = 'Provider request failed'; }],
    ['tool', rows => { rows.push({ ...rows[5], message: { role: 'toolResult' } }); }],
    ['missing system', rows => { rows.splice(3, 1); }], ['extra field', rows => { rows[5].foreign = true; }],
  ];
  for (const [label, change] of changes) {
    const rows = structuredClone(native.rows); change(rows);
    await writeFile(native.path, rows.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8');
    await assert.rejects(requestDesignDraft(f.options), { name: 'Error' }, label);
    await writeFile(native.path, native.bytes);
  }
  await writeFile(native.path, Buffer.concat([Buffer.from([0xff]), native.bytes]));
  await assert.rejects(requestDesignDraft(f.options)); await writeFile(native.path, native.bytes);
  const second = `${native.path}.copy.jsonl`; await writeFile(second, native.bytes);
  await assert.rejects(requestDesignDraft(f.options)); await unlink(second);
  const hardlink = join(f.root, 'duplicate-native'); await link(native.path, hardlink);
  await assert.rejects(requestDesignDraft(f.options)); await unlink(hardlink);
  await unlink(native.path); await assert.rejects(requestDesignDraft(f.options)); await writeFile(native.path, native.bytes);
  for (const change of [{ requestTimeoutMs: 5001 }, { maxOutputTokens: 16000 }, { capabilities: 'changed' }, { answers: { goal: '改动' } }]) {
    await assert.rejects(requestDesignDraft({ ...f.options, ...change }), /identity/);
  }
  assert.equal(f.bodies.length, 0); assert.deepEqual(await f.controller.read(), before);
});

test('original billing, unresolved admission and unfinished interview cannot prove pre-admission denial', async t => {
  const f = await budgetFixture(t); await f.spend(120_000);
  await assert.rejects(requestDesignDraft({ ...f.options, sessionFactory: f.legacyFactory }), /Budget admission/);
  const billing = join(f.root, 'intake-sessions/draft-1/billing-foreign.json');
  await writeFile(billing, '{}', 'utf8'); await assert.rejects(requestDesignDraft(f.options)); await unlink(billing);
  const work = await f.controller.beginFundingWork('interview');
  await assert.rejects(requestDesignDraft(f.options)); await f.controller.finishFundingWork(work);
  await assert.rejects(requestDesignDraft(f.options), /consumed/);
  assert.equal(f.bodies.length, 0);
});

for (const failure of ['length', 'denial', 'creation'] as const) test(`a ${failure} successor consumes the same slot after marker and all source directory deletion`, async t => {
  const f = await budgetFixture(t, ['length', 'draft']); await f.spend(120_000);
  await assert.rejects(requestDesignDraft({ ...f.options, sessionFactory: f.legacyFactory }), /Budget admission/);
  const sessionFactory = failure === 'creation' ? async () => { throw new Error('synthetic session creation failure'); }
    : failure === 'denial' ? f.legacyFactory : f.sessionFactory;
  await assert.rejects(requestDesignDraft({ ...f.options, sessionFactory }), /truncated|admission|creation/i);
  assert.equal(fundedIntakeWork(await f.controller.read()).pending.length, 0);
  await removeOwned(tmpdir(), join(f.root, 'intake-sessions/draft-1-successor-1'));
  await assert.rejects(requestDesignDraft(f.options), /consumed|ENOENT/);
  await removeOwned(tmpdir(), join(f.root, 'intake-sessions/draft-1'));
  await assert.rejects(requestDesignDraft(f.options), /source|history|consumed/);
  assert.equal(f.bodies.length, failure === 'length' ? 1 : 0);
});

test('source bytes are rechecked after work begins and before marker publication, with cleanup on failure', async t => {
  const f = await budgetFixture(t); await f.spend(120_000);
  await assert.rejects(requestDesignDraft({ ...f.options, sessionFactory: f.legacyFactory }), /Budget admission/);
  const native = await f.native(), begin = f.controller.beginFundingWork.bind(f.controller);
  let began = false;
  f.controller.beginFundingWork = async kind => { const work = await begin(kind); began = true; await writeFile(native.path, native.bytes + '\n', 'utf8'); return work; };
  await assert.rejects(requestDesignDraft(f.options), /evidence/);
  if (!began) t.diagnostic(JSON.stringify({ native: native.rows, events: (await f.controller.read()).events }));
  assert.ok(began, 'The rejection must be the post-verification byte recheck');
  f.controller.beginFundingWork = begin; await writeFile(native.path, native.bytes);
  assert.equal(fundedIntakeWork(await f.controller.read()).pending.length, 0);
  assert.deepEqual(await readdir(join(f.root, 'intake-sessions/draft-1-successor-1')), []);
  await assert.rejects(requestDesignDraft(f.options), /consumed/); assert.equal(f.bodies.length, 0);
});

test('public resume recovers original saved answers within the same funded intake and waits for real confirmation', async t => {
  const f = await budgetFixture(t); await f.spend(120_000);
  await assert.rejects(requestDesignDraft({ ...f.options, sessionFactory: f.legacyFactory }), /Budget admission/);
  const before = await f.controller.read(); await f.controller.close();
  const output = new PassThrough(); let text = ''; output.on('data', chunk => { text += chunk; });
  await runCli(['resume', f.root], { input: Readable.from(['cancel\n']), output, host: {
    ordinaryProfile: 'ordinary-design/1',
    async prepare() { return { environmentReady: true, executionReady: true }; },
    async questions() { return f.options.questions; },
    async draft(input) { return requestDesignDraft({ ...f.options, ...input }); },
    async execute() { throw new Error('No actual confirmation supplied'); },
  } });
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.run.runId, before.run.runId); assert.equal(state.confirmation, null); assert.equal(state.run.originalStartedAt, undefined);
  assert.deepEqual(state.draft.answers, f.options.answers); assert.equal(state.draft.revision, 1);
  assert.deepEqual(state.ledger.entries[0], before.ledger.entries[0]); assert.equal(f.bodies.length, 1);
  assert.match(text, /confirm 1/); assert.equal(fundedIntakeWork(state).pending.length, 0);
  const owner = await IntakeController.open({ root: f.root });
  try { await requestDesignDraft({ ...f.options, controller: owner }); } finally { await owner.close(); }
  assert.equal(f.bodies.length, 1);
});

test('historical admission timestamp may precede its event by one controller clock tick', async t => {
  let at = Date.now() - 1000, live = false;
  const f = await budgetFixture(t, ['draft'], () => live ? Date.now() : at++); await f.spend(120_000); live = true;
  const state = await f.controller.read();
  assert.notEqual(state.requests[0].admittedAt, state.events.find(event => event.type === 'admitted')!.at);
  await assert.rejects(requestDesignDraft({ ...f.options, sessionFactory: f.legacyFactory }), /Budget admission/);
  await requestDesignDraft(f.options); assert.equal(f.bodies.length, 1);
});

test('missing or ambiguous work history, original answers and native changes cannot authorize cached success', async t => {
  const f = await budgetFixture(t); await f.spend(120_000);
  await assert.rejects(requestDesignDraft({ ...f.options, sessionFactory: f.legacyFactory }), /Budget admission/);
  const read = f.controller.read.bind(f.controller), before = await read();
  for (const change of [
    (state: typeof before) => { state.events = state.events.filter(event => event.type !== 'public_intake_work_finished'); },
    (state: typeof before) => { state.ledger.entries[0].status = 'unknown'; state.ledger.entries[0].unknown = true; },
    (state: typeof before) => { state.events = state.events.filter(event => event.type !== 'reserved'); },
    (state: typeof before) => { const start = state.events.find(event => event.type === 'public_intake_work_started')!; start.at = new Date(Date.now() + 10000).toISOString(); },
  ]) {
    f.controller.read = async () => { const state = await read(); change(state); return state; };
    await assert.rejects(requestDesignDraft(f.options));
  }
  f.controller.read = read;
  const answersPath = join(f.root, 'intake-answers/v1.json'), answersBytes = await readFile(answersPath);
  await writeFile(answersPath, '{}', 'utf8'); await assert.rejects(requestDesignDraft(f.options)); await writeFile(answersPath, answersBytes);
  await requestDesignDraft(f.options);
  const native = await f.native(); await writeFile(native.path, native.bytes + '\n', 'utf8');
  await assert.rejects(requestDesignDraft(f.options)); await writeFile(native.path, native.bytes);
  await unlink(answersPath); await assert.rejects(requestDesignDraft(f.options));
  assert.equal(f.bodies.length, 1);
});

test('reserve success followed by admit failure is not a pre-admission denial', async t => {
  const f = await budgetFixture(t), admit = f.controller.admit.bind(f.controller);
  f.controller.admit = async () => { throw new Error('synthetic admission failure after reserve'); };
  await assert.rejects(requestDesignDraft({ ...f.options, sessionFactory: f.legacyFactory }), /Budget admission/);
  f.controller.admit = admit;
  assert.equal((await f.controller.read()).ledger.entries[0].status, 'reserved');
  await assert.rejects(requestDesignDraft(f.options)); assert.equal(f.bodies.length, 0);
});

test('settled length and pre-admission denial share one slot and preserve the old predecessor format', async t => {
  const f = await budgetFixture(t, ['length', 'draft']);
  await assert.rejects(requestDesignDraft(f.options), /truncated/);
  await assert.rejects(requestDesignDraft({ ...f.options, sessionFactory: config => f.legacyFactory({ ...config, estimatedMaxCostMicroCny: 1_000_000 }) }), /admission/);
  const marker = JSON.parse(await readFile(join(f.root, 'intake-sessions/draft-1-successor-1/intent.json'), 'utf8'));
  assert.deepEqual(Object.keys(marker.predecessor).sort(), ['billing', 'receipt', 'requestId', 'roundId']);
  await assert.rejects(requestDesignDraft(f.options), /successor/);
  await unlink(join(f.root, 'intake-sessions/draft-1-successor-1/intent.json'));
  await assert.rejects(requestDesignDraft(f.options), /successor/);
  assert.equal(f.bodies.length, 1);
});

test('failed atomic marker publication closes its work and later deletion cannot replay', async t => {
  const f = await budgetFixture(t); await f.spend(120_000);
  await assert.rejects(requestDesignDraft({ ...f.options, sessionFactory: f.legacyFactory }), /Budget admission/);
  const path = join(f.root, 'intake-sessions/draft-1-successor-1/intent.json'), begin = f.controller.beginFundingWork.bind(f.controller);
  f.controller.beginFundingWork = async kind => { const work = await begin(kind); await writeFile(path, '{}', 'utf8'); return work; };
  await assert.rejects(requestDesignDraft(f.options), { code: 'EEXIST' }); f.controller.beginFundingWork = begin;
  assert.equal(fundedIntakeWork(await f.controller.read()).pending.length, 0);
  await unlink(path); await assert.rejects(requestDesignDraft(f.options), /consumed/); assert.equal(f.bodies.length, 0);
});

test('unconfirmed cleanup remains pending when an existing session cannot close', async t => {
  const f = await budgetFixture(t);
  await assert.rejects(requestDesignDraft({ ...f.options, sessionFactory: async () => ({
    async prompt() { throw new Error('synthetic incomplete prompt'); }, async close() { throw new Error('synthetic close failure'); },
  }) }), /close failure/);
  const pending = fundedIntakeWork(await f.controller.read()).pending;
  try { assert.equal(pending.length, 1); } finally { for (const work of pending) await f.controller.finishFundingWork(work.workId); }
});

for (const ended of ['stopped', 'confirmed', 'activated'] as const) test(`${ended} intake cannot recover a historical denied draft`, async t => {
  const f = await budgetFixture(t); await f.spend(120_000);
  await assert.rejects(requestDesignDraft({ ...f.options, sessionFactory: f.legacyFactory }), /Budget admission/);
  if (ended === 'stopped') await f.controller.stop('fixture stop');
  else {
    await f.controller.saveDraft({ ...ordinaryDraft(), brief: f.options.brief });
    await f.controller.confirm({ revision: 1, confirmed: true, actorId: 'fixture-user', at: new Date().toISOString() });
    if (ended === 'activated') await f.controller.activateGeneration({ environmentReady: true, executionReady: true });
  }
  await assert.rejects(requestDesignDraft(f.options)); assert.equal(f.bodies.length, 0);
});
