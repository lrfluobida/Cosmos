import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { authorBudgetFixture } from '../roles/author-output-budget.fixture.ts';
import { createPiSession } from '../../src/providers/pi.ts';
import { reviewImageInputTokens } from '../../src/providers/review-image-quote.ts';

const report = { formatVersion: '1.0.0', kind: 'normal_browser_input', reportPath: 'report.json', outcome: 'passed',
  plan: { reportId: 'main', steps: [{ id: '中文', kind: 'assert', acceptanceId: 'AC', expected: false, observation: { kind: 'visible', selector: '#x' } }] },
  steps: [{ id: '中文', kind: 'assert', acceptanceId: 'AC', outcome: 'passed', expected: false, actual: false, error: null, screenshot: 's.png', observation: { completed: 1 } }],
  errors: [], cleanup: { processExited: true }, failureFacts: { termination: null, errors: [] } };

test('COS231 native factory sends strict nullable batch schema, exact tool evidence and all eight images', async t => {
  const f = await authorBudgetFixture(t, 2_000_000);
  await mkdir(join(f.root, 'evidence')); await writeFile(join(f.root, 'evidence/report.json'), JSON.stringify(report), 'utf8');
  const png = await readFile(new URL('../../probes/2026-10-01-deepseek/vision-fixture-2026-09-30T17-47-57.205Z.png', import.meta.url));
  const images = Array.from({ length: 8 }, () => ({ type: 'image', data: png.toString('base64'), mimeType: 'image/png' }));
  let requests = 0, failure;
  const quotes = [];
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    try {
      const request = input instanceof Request ? input : new Request(input, init), body = JSON.parse(await request.text());
      assert.ok(++requests <= 3); assert.equal(new URL(request.url).origin, 'https://api.deepseek.com');
      const tool = body.tools.find(t => t.function.name === 'read').function;
      assert.equal(tool.strict, true); assert.deepEqual(tool.parameters.required, ['path', 'offset', 'limit', 'evidenceOffset', 'evidenceDetails']);
      assert.deepEqual(tool.parameters.properties.evidenceDetails.anyOf[0].maxItems, 8);
      assert.deepEqual(tool.parameters.properties.evidenceDetails.anyOf.at(-1), { type: 'null' });
      assert.equal(body.messages.flatMap(m => Array.isArray(m.content) ? m.content : []).filter(c => c.type === 'image_url').length, 8);
      const tokens = reviewImageInputTokens(body, Buffer.byteLength(JSON.stringify(body)));
      quotes.push(tokens * 2 + body.max_tokens * 8);
      if (requests === 2) {
        const last = body.messages.filter(m => m.role === 'tool').at(-1).content;
        assert.match(last, /"view":"index"/); assert.match(last, /"中文"/); assert.match(last, /"step:1:1"/);
      }
      if (requests === 3) {
        const last = body.messages.filter(m => m.role === 'tool').at(-1).content;
        assert.match(last, /"view":"details"/); assert.match(last, /"actual":false/); assert.match(last, /"selector":"#x"/);
      }
      const first = requests === 1, finished = requests === 3;
      const args = { path: 'evidence/report.json', offset: null, limit: null, evidenceOffset: null, evidenceDetails: first ? null : ['step:1:1'] };
      const delta = finished ? { content: 'Synthetic read check complete; no semantic verdict.' } : {
        tool_calls: [{ index: 0, id: `offline-read-${requests}`, type: 'function', function: { name: 'read', arguments: JSON.stringify(args) } }] };
      return new Response(`data: ${JSON.stringify({ id: 'offline-cos231', model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason: finished ? 'stop' : 'tool_calls' }],
        usage: { prompt_tokens: 80, completion_tokens: 40, total_tokens: 120 } })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    } catch (error) { failure = error; throw error; }
  });
  const session = await f.create({ ordinaryCodingReviewImageQuote: () => true, sessionFactory: config => createPiSession(config) }, { ...f.input, role: 'reviewer' });
  const reply = await session.prompt('Exercise synthetic evidence navigation and detail.', { images }).catch(error => { throw failure ?? error; });
  assert.equal(reply.text, 'Synthetic read check complete; no semantic verdict.'); assert.equal(requests, 3);
  const ledger = (await f.controller.read()).ledger.entries;
  assert.equal(ledger.length, 3); assert.ok(ledger.every(e => e.status === 'settled' && !e.unknown && !e.reservedMicroCny));
  assert.deepEqual(JSON.parse(await readFile(join(f.root, 'evidence/report.json'), 'utf8')), report);
  t.diagnostic(`Synthetic intercepted transport only; no network. Native image quotes: ${JSON.stringify(quotes)}.`);
});

test('COS231 native reviewer refuses the unaffordable first image request before transport', async t => {
  const f = await authorBudgetFixture(t, 1);
  await mkdir(join(f.root, 'evidence')); await writeFile(join(f.root, 'evidence/report.json'), JSON.stringify(report), 'utf8');
  let sends = 0;
  t.mock.method(globalThis, 'fetch', async () => { sends++; throw Error('Network must not be reached'); });
  const session = await f.create({ ordinaryCodingReviewImageQuote: () => true, sessionFactory: config => createPiSession(config) }, { ...f.input, role: 'reviewer' });
  const png = await readFile(new URL('../../probes/2026-10-01-deepseek/vision-fixture-2026-09-30T17-47-57.205Z.png', import.meta.url));
  await assert.rejects(session.prompt('Synthetic no-budget check.', { images: Array.from({ length: 8 }, () => ({ type: 'image', data: png.toString('base64'), mimeType: 'image/png' })) }), /resource capacity is insufficient; no provider request sent/);
  assert.equal(sends, 0); assert.deepEqual((await f.controller.read()).ledger.entries, []);
});
