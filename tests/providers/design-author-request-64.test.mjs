import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { createPiSession, requireBudgetFinalizationSource } from '../../src/providers/pi.ts';
import { BUDGET_FINALIZATION_PROMPT } from '../../src/runtime/repair/author-protocol.ts';
import { authorBudgetFixture } from '../roles/author-output-budget.fixture.ts';
import { finalizationFixture } from './ordinary-design-budget-finalization.fixture.mjs';

for (const maxRequests of [32, 64]) test(`budget finalization retains actual ${maxRequests} limit and uses only its remaining last slot`, async t => {
  const f = await finalizationFixture(t, { maxRequests, workAt: maxRequests - 2,
    ...(maxRequests === 64 ? { settledAfterWork: 480000 } : {}) });
  assert.equal(f.error.code, 'author_review_reserve'); assert.equal(f.dispatches.length, maxRequests - 2);
  const source = await f.role.budgetFinalization(f.error);
  assert.equal(source.maxRequests, maxRequests); assert.equal(source.requests, maxRequests - 1);
  await requireBudgetFinalizationSource(source, f.input.stateDirectory);
  for (const patch of [{ maxRequests: maxRequests === 32 ? 64 : 32 }, { maxRequests: 48 }, { requests: maxRequests }, { requests: 0 },
    { native: { ...source.native, sha256: '0'.repeat(64) } }]) {
    await assert.rejects(requireBudgetFinalizationSource({ ...source, ...patch }, f.input.stateDirectory));
  }
  const bytes = await readFile(source.native.file);
  const rows = bytes.toString('utf8').trim().split('\n').map(JSON.parse), entry = rows.find(row => row.id === source.native.entryId);
  entry.message.usage.output = 1;
  await writeFile(source.native.file, rows.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  try { await assert.rejects(requireBudgetFinalizationSource(source, f.input.stateDirectory)); }
  finally { await writeFile(source.native.file, bytes); }
  await f.finalize(BUDGET_FINALIZATION_PROMPT);
  assert.equal(f.dispatches.length, maxRequests - 1); assert.equal(f.dispatches.at(-1).cap, 4096);
  assert.equal((await f.controller.read()).requests.filter(row => f.admissions.some(request => request.requestId === row.requestId)).length,
    maxRequests - 1, 'The unsent rejected slot is counted but never billed; synthetic prior spend is separate.');
  await assert.rejects(f.finalize('No second finalization.'));
  assert.deepEqual(await readFile(source.native.file).then(data => data.subarray(0, bytes.length)), bytes, 'Original native source bytes remain the prefix.');
});

for (const maxRequests of [32, 64]) test(`unsent request ${maxRequests} cannot create an extra budget finalization slot`, async t => {
  const f = await finalizationFixture(t, { maxRequests, workAt: maxRequests - 1 });
  assert.equal(f.error.code, 'author_review_reserve'); assert.equal(f.dispatches.length, maxRequests - 1);
  assert.equal(await f.role.budgetFinalization(f.error), null);
  await assert.rejects(f.finalize(BUDGET_FINALIZATION_PROMPT));
  assert.equal(f.dispatches.length, maxRequests - 1);
});

test('request 65 is rejected by the native counter and never gains budget finalization', async t => {
  const f = await finalizationFixture(t, { maxRequests: 64, workAt: 65 });
  assert.equal(f.error.code, 'request_limit'); assert.equal(f.dispatches.length, 64);
  assert.equal((await f.controller.read()).requests.length, 64);
  assert.equal(await f.role.budgetFinalization(f.error), null);
  await assert.rejects(f.finalize(BUDGET_FINALIZATION_PROMPT)); assert.equal(f.dispatches.length, 64);
});

test('budget-followup config accepts only explicit 32 or 64 in factory and Pi', async t => {
  const f = await authorBudgetFixture(t, 1125000);
  const enabled = { ordinaryDesignBudgetCompaction: true, ordinaryDesignBudgetPolicy: 'review-reserve/1', ordinaryDesignFinalizationPolicy: 'budget-followup/1' };
  for (const maxRequests of [32, 64]) await f.create({ ...enabled, authorMaxRequests: { design: maxRequests } });
  for (const maxRequests of [16, 31, 33, 48, 63, 65, 96]) {
    await assert.rejects(f.create({ ...enabled, authorMaxRequests: { design: maxRequests } }), /ordinaryDesignFinalizationPolicy/);
    await assert.rejects(createPiSession({ ...f.configs[0], maxRequests }), /finalization configuration/);
  }
});
