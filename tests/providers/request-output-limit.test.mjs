import assert from 'node:assert/strict';
import test from 'node:test';
import { reserveEntry } from '../../src/budget/ledger.ts';
import { createWorkspaceTools } from '../../src/providers/pi.ts';
import { outputLimitFixture, syntheticContext, validationReservation } from './request-output-limit.fixture.mjs';

const remaining = 1233190;
function reserve(request) {
  reserveEntry({ contractVersion: '1.0.0', ledgerId: 'offline', scope: 'validation', limitMicroCny: 150000000, warningThresholdPercent: 80,
    allocations: [{ taskId: 'coding', amountMicroCny: 1720718 }], entries: [{ requestId: 'synthetic-history', taskId: 'coding', provider: 'deepseek',
      pricingVersion: 'fixture', reservedMicroCny: 0, settledMicroCny: 487528, unknown: false, status: 'settled', evidence: [] }] },
  { requestId: request.requestId, taskId: 'coding', provider: 'deepseek', pricingVersion: 'fixture', estimatedMaxCostMicroCny: request.estimatedMaxCostMicroCny });
}

test('legacy full cap rejects synthetic 405672-byte request without a provider dispatch', async t => {
  const f = await outputLimitFixture(t);
  await f.create({ budget: { ...f.config.budget, beforeRequest: async request => { f.admissions.push(request); reserve(request); } } });
  await assert.rejects(f.dispatch(), /admission rejected/i);
  assert.equal(f.admissions[0].inputBytes, 405672); assert.equal(f.admissions[0].hasImages, false);
  assert.equal(f.admissions[0].estimatedMaxCostMicroCny, 1335632); assert.equal(f.dispatches.length, 0);
});

test('actual Pi metadata, quote and sent cap agree at the exact affordable 52730 boundary', async t => {
  const f = await outputLimitFixture(t), context = syntheticContext(), original = JSON.stringify(context); let calls = 0;
  await f.create({ requestOutputLimit: async request => {
    calls++; assert.equal(request.inputBytes, 405672); assert.equal(request.hasImages, false); assert.equal(request.maxOutputTokens, 65536);
    return 52730;
  }, budget: { ...f.config.budget, beforeRequest: async request => { f.admissions.push(request); reserve(request); } } });
  await f.dispatch(context);
  assert.equal(calls, 1); assert.equal(f.admissions[0].estimatedMaxCostMicroCny, 1233184); assert.equal(f.admissions[0].maxOutputTokens, 52730);
  assert.equal(f.dispatches.length, 1); assert.equal(f.dispatches[0].maxTokens, 52730); assert.equal(f.dispatches[0].maxRetries, 0);
  assert.equal(JSON.stringify(f.dispatches[0].context), original); assert.equal(JSON.stringify(context), original);
  assert.equal(f.settlements[0].outcome, 'settled'); assert.ok(remaining - validationReservation({ inputBytes: 405672, hasImages: false, maxOutputTokens: 52731 }) < 0);
});

test('52731 remains unaffordable at final reservation and never retries with another cap', async t => {
  const f = await outputLimitFixture(t); let selections = 0;
  const session = await f.create({ requestOutputLimit: async () => { selections++; return 52731; },
    budget: { ...f.config.budget, beforeRequest: async request => { f.admissions.push(request); reserve(request); } } });
  await assert.rejects(f.dispatch(), /admission rejected/i); assert.equal(f.admissions[0].estimatedMaxCostMicroCny, 1233192);
  await assert.rejects(session.prompt('No retry'), { code: 'admission_rejected' });
  assert.equal(selections, 1); assert.equal(f.dispatches.length, 0);
});

for (const cap of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 65537]) test(`invalid output cap ${cap} fails before estimation, reservation or send`, async t => {
  const f = await outputLimitFixture(t); let estimates = 0;
  await f.create({ requestOutputLimit: async () => cap, estimatedMaxCostMicroCny: () => { estimates++; return 1; } });
  await assert.rejects(f.dispatch(), /output.*limit|output.*cap/i);
  assert.equal(estimates, 0); assert.equal(f.admissions.length, 0); assert.equal(f.dispatches.length, 0);
});

for (const stage of ['policy', 'admission', 'final-window']) test(`input mutation during ${stage} cannot send under an earlier smaller quote`, async t => {
  const f = await outputLimitFixture(t), context = syntheticContext(); let windows = 0;
  const mutate = () => { context.messages[0].content[0].text += 'larger input'; };
  await f.create({ requestOutputLimit: async () => { if (stage === 'policy') { await Promise.resolve(); mutate(); } return 52730; },
    requestWindow: async () => { if (++windows === 2 && stage === 'final-window') mutate(); return { deadlineAt: Date.now() + 10000, cleanupMs: 100 }; },
    budget: { ...f.config.budget, beforeRequest: async request => { f.admissions.push(request); if (stage === 'admission') mutate(); } } });
  await assert.rejects(f.dispatch(context), /input.*changed/i);
  assert.equal(f.dispatches.length, 0);
  if (stage === 'policy') assert.equal(f.admissions.length, 0);
  else assert.equal(f.settlements[0].outcome, 'not_sent');
});

test('policy rejection is terminal and leaves no reservation or provider call', async t => {
  const f = await outputLimitFixture(t); let calls = 0;
  const session = await f.create({ requestOutputLimit: async () => { calls++; throw new Error('No authority'); } });
  await assert.rejects(f.dispatch(), /output.*authority|admission rejected/i);
  await assert.rejects(session.prompt('No automatic retry'), { code: 'admission_rejected' });
  assert.equal(calls, 1); assert.equal(f.admissions.length, 0); assert.equal(f.dispatches.length, 0);
});

test('COS124 existing SDK cancellation signal reaches policy and is rechecked before estimation or reservation', async t => {
  const f = await outputLimitFixture(t), caller = new AbortController(); let estimates = 0, observed;
  const session = await f.create({ requestOutputLimit: async (_request, signal) => {
    observed = signal; caller.abort(); await new Promise(resolve => setTimeout(resolve, 0)); return 4096;
  }, estimatedMaxCostMicroCny: () => { estimates++; return 1; } });
  await assert.rejects(session.prompt('Cancel while choosing output.', { signal: caller.signal }));
  assert.ok(observed instanceof AbortSignal); assert.equal(observed.aborted, true);
  assert.equal(estimates, 0); assert.equal(f.admissions.length, 0); assert.equal(f.dispatches.length, 0);
});

test('a shortened output ending in length remains incomplete and is never retried', async t => {
  const f = await outputLimitFixture(t, { stopReason: 'length' });
  const session = await f.create({ requestOutputLimit: async () => 4096 });
  await assert.rejects(f.dispatch(), /truncated/i); await assert.rejects(session.prompt('No retry'), { code: 'incomplete' });
  assert.equal(f.dispatches[0].maxTokens, 4096); assert.equal(f.dispatches.length, 1); assert.equal(f.settlements[0].stopReason, 'length');
});

test('a policy receives actual image metadata and each request refreshes its limit', async t => {
  const f = await outputLimitFixture(t); let calls = 0;
  await f.create({ requestOutputLimit: async request => { assert.equal(request.hasImages, calls === 0); return ++calls === 1 ? 4096 : 5000; } });
  await f.dispatch(syntheticContext(405672, true)); await f.dispatch();
  assert.deepEqual(f.dispatches.map(item => item.maxTokens), [4096, 5000]);
  assert.equal(f.admissions[0].estimatedMaxCostMicroCny, 2032768);
});

test('native SDK prompt and tool schemas survive the policy context snapshot', async t => {
  const f = await outputLimitFixture(t);
  const tools = await createWorkspaceTools({ workspace: f.workspace, readPaths: ['.'], writePaths: ['output.txt'] });
  const session = await f.create({ tools, requestOutputLimit: async () => 4096 });
  await session.prompt('合成中文输入，保留工具定义');
  assert.equal(f.dispatches.length, 1); assert.equal(f.dispatches[0].maxTokens, 4096);
  assert.match(JSON.stringify(f.dispatches[0].context), /合成中文输入/);
  assert.ok(f.dispatches[0].context.messages.flatMap(message => message.toolsAdded ?? []).some(tool => tool.name === 'write'));
  assert.equal(f.admissions[0].inputBytes, Buffer.byteLength(JSON.stringify(f.dispatches[0].context)));
});
