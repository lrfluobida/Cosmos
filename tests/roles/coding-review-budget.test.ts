import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authorBudgetFixture } from './author-output-budget.fixture.ts';

const request = { requestId: 'offline-coding-review', modelId: 'deepseek-flash' as const,
  maxOutputTokens: 8192, inputBytes: 748015, hasImages: true, imageInputTokens: 239103 };

for (const [available, selected] of [[543742, 8192], [528505, 6287], [510974, 4096], [510973, null]] as const) {
  test(`coding screenshot review quotes the final wire within ${available}`, async t => {
    const f = await authorBudgetFixture(t, available);
    await f.create({ ordinaryCodingReviewImageQuote: () => true }, { ...f.input, role: 'reviewer' });
    const config = f.configs[0];
    assert.equal(config.requestOutputLimit, undefined, 'base64 context bytes must not be used for the image quote');
    assert.equal(typeof config.requestImageOutputLimit, 'function');
    const before = await f.controller.read();
    if (selected === null) await assert.rejects(config.requestImageOutputLimit!(request), /cannot afford/);
    else assert.equal(await config.requestImageOutputLimit!(request), selected);
    assert.deepEqual(await f.controller.read(), before, 'output selection is read-only');
  });
}

test('coding screenshot output selection retains original authority and other roles', async t => {
  const f = await authorBudgetFixture(t);
  for (const role of ['coding', 'reviewer'] as const) {
    await f.create({ ordinaryCodingReviewImageQuote: () => role === 'coding' }, { ...f.input, role });
    assert.equal(f.configs.at(-1)!.requestImageOutputLimit, undefined);
  }
  await f.create({ ordinaryCodingReviewImageQuote: () => true }, { ...f.input, role: 'reviewer' });
  const state = await f.controller.read();
  t.mock.method(f.controller, 'read', async () => ({ ...state, ledger: { ...state.ledger, limitMicroCny: state.ledger.limitMicroCny + 1 } }));
  await assert.rejects(f.configs.at(-1)!.requestImageOutputLimit!(request), /original run, grant or window/);
});
