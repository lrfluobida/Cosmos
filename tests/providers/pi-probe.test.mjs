import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { peakCostMicroCny, PRIOR_PROBE_REQUEST_ID, REQUEST_RESERVATION_MICRO_CNY, runPiProbe } from '../../probes/pi/live.mjs';

test('live probe uses the shared controller for every request and validates its full SDK scenario offline', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'cosmos-pi-probe-'));
  const priorKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'offline-probe-key';
  const calls = [];
  const control = {
    signal: new AbortController().signal,
    read: async () => ({ ledger: { scope: 'validation', limitMicroCny: 150_000_000,
      entries: [{ requestId: PRIOR_PROBE_REQUEST_ID, status: 'settled', settledMicroCny: 721_771 }] } }),
    reserve: async request => { calls.push(['reserve', request.requestId, request.estimatedMaxCostMicroCny]); },
    admit: async id => { calls.push(['admit', id]); },
    settle: async (id, cost, evidence) => {
      assert.ok((await readFile(evidence[0].location, 'utf8')).includes(id));
      calls.push(['settle', id, cost]);
      return { halted: false };
    },
  };
  const tool = (name, args, id) => ({ delta: { reasoning_content: 'test reasoning', tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' });
  const text = content => ({ delta: { content }, finish_reason: 'stop' });
  const responses = [
    tool('read', { path: 'missing.txt' }, 'read-1'),
    tool('write', { path: 'output.json', content: '{"stage":"draft","marker":"中文验收A-1"}' }, 'write-1'),
    tool('edit', { path: 'output.json', edits: [{ oldText: 'draft', newText: 'fixed' }] }, 'edit-1'),
    text('DONE'), text('Preserve marker 中文验收A-1; A-1 v1 task completed.'),
    text('{"marker":"中文验收A-1","green_cells":[[1,1],[2,3],[3,4]],"red_cells":[[1,4],[3,2]]}'),
  ];
  const fetchMock = mock.method(globalThis, 'fetch', async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init);
    assert.equal(new URL(req.url).origin, 'https://api.deepseek.com');
    const response = responses.shift();
    assert.ok(response);
    const chunk = { model: 'deepseek-flash', choices: [{ index: 0, ...response }],
      usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40, prompt_cache_hit_tokens: 5 } };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  t.after(async () => {
    fetchMock.mock.restore();
    if (priorKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = priorKey;
    await rm(directory, { recursive: true, force: true });
  });
  const report = await runPiProbe({ controller: control, outputDirectory: join(directory, 'result') });
  assert.equal(report.outcome, 'passed');
  assert.equal(report.requests.length, 6);
  assert.equal(report.checks.length, 3);
  assert.equal(responses.length, 0);
  for (let i = 0; i < calls.length; i += 3) {
    assert.deepEqual(calls.slice(i, i + 3).map(call => call[0]), ['reserve', 'admit', 'settle']);
    assert.equal(calls[i][1], calls[i + 2][1]);
    assert.equal(calls[i][2], REQUEST_RESERVATION_MICRO_CNY);
    assert.equal(calls[i + 2][2], 131);
  }
  assert.equal(peakCostMicroCny({ input: 25, output: 10, cacheRead: 5, cacheWrite: 0 }), 131);
  assert.throws(() => peakCostMicroCny({ input: -1 }), /Invalid usage/);
});

test('probe refuses a ledger missing the already incurred direct API costs', async () => {
  await assert.rejects(runPiProbe({ controller: {
    read: async () => ({ ledger: { scope: 'validation', limitMicroCny: 150_000_000, entries: [] } }),
  }, outputDirectory: 'unused' }), /Import the prior direct probes/);
});
