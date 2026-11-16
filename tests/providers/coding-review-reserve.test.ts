import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { createPiSession, createWorkspaceTools, type PiSessionOptions } from '../../src/providers/pi.ts';

type Reply = { delta: object; finish_reason: string; model?: string; usage?: object | null };
const stop = (content = '{"verdict":"approved"}'): Reply => ({ delta: { content }, finish_reason: 'stop' });
const read = (n: number): Reply => ({ delta: { tool_calls: [{ index: 0, id: `read-${n}`, type: 'function',
  function: { name: 'read', arguments: JSON.stringify({ path: 'evidence.txt', offset: null, limit: null }) } }] }, finish_reason: 'tool_calls' });

async function fixture(t: TestContext, respond: (n: number, body: any) => Reply | Promise<Reply>, overrides: Partial<PiSessionOptions> = {},
  setup?: (config: PiSessionOptions) => void) {
  const root = await mkdtemp(join(tmpdir(), 'cos232-native-'));
  await writeFile(join(root, 'evidence.txt'), '原始验收证据，不得改写。', 'utf8');
  const bodies: any[] = [], admissions: any[] = [], settlements: any[] = [];
  let reads = 0, payloadFailure: unknown;
  const tools = await createWorkspaceTools({ workspace: root, readPaths: ['evidence.txt'], writePaths: [] });
  const execute = tools[0].execute;
  tools[0].execute = async (...args) => { reads++; return execute(...args); };
  t.mock.method(globalThis, 'fetch', async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    try {
      const req = url instanceof Request ? url : new Request(url, init);
      assert.equal(new URL(req.url).origin, 'https://api.deepseek.com');
      const body = JSON.parse(await req.text()); bodies.push(body);
      assert.ok(bodies.length <= 16, 'unexpected provider request seventeen');
      const response = await respond(bodies.length, body);
      const chunk = { model: response.model ?? 'deepseek-flash', choices: [{ index: 0, delta: response.delta, finish_reason: response.finish_reason }],
        usage: response.usage === null ? undefined : response.usage ?? { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 } };
      return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    } catch (error) { payloadFailure = error; throw error; }
  });
  const config: PiSessionOptions = { workspace: root, stateDirectory: join(root, 'state'), systemPrompt: '只检查固定证据。',
    context: 'The original sixteen requests include the final verdict and a possible correction. Reserve the final two.', tools,
    env: { DEEPSEEK_API_KEY: 'offline-cos232' }, maxRequests: 16, maxOutputTokens: 8192, requestTimeoutMs: 1000,
    ordinaryCodingReviewImageQuote: true, estimatedMaxCostMicroCny: 1000,
    budget: { beforeRequest: async request => { admissions.push(request); }, afterResponse: async response => { settlements.push(response); } },
    ...overrides };
  setup?.(config);
  const session = await createPiSession(config);
  t.after(async () => { await session.close(); await rm(root, { recursive: true, force: true }); assert.ifError(payloadFailure); });
  return { root, session, bodies, admissions, settlements, reads: () => reads, failure: () => payloadFailure };
}

test('R75-shaped native reproduction: sixteen tool replies exhaust even prompt-only final guidance', async t => {
  const f = await fixture(t, n => read(n));
  await assert.rejects(f.session.prompt('Review all fixed evidence.'), { code: 'request_limit' });
  assert.equal(f.bodies.length, 16);
  assert.equal(f.reads(), 16);
  assert.equal(f.admissions.length, 16);
  assert.equal(f.settlements.filter(r => r.outcome === 'settled').length, 16);
  const entries = (await readFile(f.session.sessionFile!, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(entries.filter(e => e.message?.role === 'assistant' && e.message.stopReason === 'toolUse').length, 16);
  assert.equal(entries.at(-1).message.errorMessage, 'Session request limit reached');
});

test('selected native review disables tools before request fifteen and preserves prior evidence', async t => {
  const f = await fixture(t, (n, body) => {
    if (n <= 14) return read(n);
    assert.equal(n, 15);
    assert.equal(body.tools?.length ?? 0, 0);
    assert.ok(JSON.stringify(body.messages).includes('原始验收证据，不得改写。'));
    assert.equal(body.thinking.type, 'enabled');
    return stop();
  }, { ordinaryCodingReviewFinalReserve: true });
  assert.equal((await f.session.prompt('Review fixed evidence.').catch(error => { throw f.failure() ?? error; })).text, '{"verdict":"approved"}');
  assert.equal(f.reads(), 14);
  assert.equal(f.bodies.length, 15);
  assert.equal(f.settlements.length, 15);
});

for (const firstStop of [1, 14, 15]) for (const direct of [false, true]) {
  test(`native stop ${firstStop} consumes only one tool-free correction, direct=${direct}`, async t => {
    const f = await fixture(t, (n, body) => {
      if (n < firstStop) return read(n);
      if (n === firstStop) return stop('{');
      assert.equal(n, firstStop + 1);
      assert.equal(body.tools?.length ?? 0, 0);
      assert.equal(body.thinking.type, 'enabled');
      assert.equal(body.max_tokens, 8192);
      assert.ok(JSON.stringify(body.messages).includes('Never turn unread evidence into success'));
      return stop();
    }, { ordinaryCodingReviewFinalReserve: true });
    assert.equal((await f.session.prompt('Original review')).text, '{');
    const corrected = direct ? await f.session.readonlyPrompt('Existing correction') : await f.session.prompt('Existing correction');
    assert.equal(corrected.text, '{"verdict":"approved"}');
    assert.equal(f.bodies.length, firstStop + 1);
    assert.equal(f.reads(), firstStop - 1);
    await assert.rejects(f.session.readonlyPrompt('Second correction'), { code: 'incomplete' });
    await assert.rejects(f.session.prompt('Reopen tools'), { code: 'incomplete' });
    assert.equal(f.bodies.length, firstStop + 1);
    const entries = await readFile(f.session.sessionFile!, 'utf8');
    assert.equal(entries.includes('cosmos-coding-review-decision'), firstStop === 15);
  });
}

for (const terminal of [15, 16]) for (const mode of ['tools', 'length-thinking', 'length-text', 'length-tool', 'unknown', 'model'] as const) {
  test(`native reserved request ${terminal} fails closed on ${mode}`, async t => {
    const f = await fixture(t, (n, body) => {
      if (n <= 14) return read(n);
      assert.equal(body.tools?.length ?? 0, 0);
      if (n < terminal) return stop('{');
      if (mode === 'tools') return read(n);
      if (mode === 'unknown') return { ...stop(), usage: null };
      if (mode === 'model') return { ...stop(), model: 'foreign-model' };
      return { delta: mode === 'length-thinking' ? { reasoning_content: 'unfinished private reasoning' }
        : mode === 'length-text' ? { content: '{"verdict":' } : read(n).delta, finish_reason: 'length' };
    }, { ordinaryCodingReviewFinalReserve: true });
    const code = mode === 'unknown' ? 'usage_unknown' : mode === 'model' ? 'model_mismatch' : 'incomplete';
    if (terminal === 16) await f.session.prompt('Original review');
    await assert.rejects(f.session.prompt(terminal === 16 ? 'Correction' : 'Original review'), { code });
    assert.equal(f.bodies.length, terminal);
    assert.equal(f.reads(), 14, 'no final or partial tool executes');
    assert.equal(f.settlements.length, terminal);
    assert.equal(f.settlements.at(-1).outcome, ['unknown', 'model'].includes(mode) ? 'unknown' : 'settled');
    assert.equal('reviewVerdictCorrection' in f.session, false, 'coding length never acquires design recovery');
    await assert.rejects(f.session.prompt('Retry'));
    assert.equal(f.bodies.length, terminal);
  });
}

for (const exposure of ['codemode', 'deferred'] as const) for (const early of [false, true]) {
  test(`native ${exposure} registry cannot bypass ${early ? 'early correction' : 'reserved decision'}`, async t => {
    const f = await fixture(t, n => early ? stop('{') : read(n), { ordinaryCodingReviewFinalReserve: true }, config => {
      config.tools.push({ ...config.tools[0], name: 'hidden-read', exposure });
    });
    if (early) await f.session.prompt('Initial');
    await assert.rejects(f.session.prompt(early ? 'Correction' : 'Initial'), { code: 'readonly_unavailable' });
    assert.equal(f.bodies.length, early ? 1 : 14);
    assert.equal(f.reads(), early ? 0 : 14);
  });
}

test('concurrent and repeated callers cannot acquire another correction', async t => {
  let release!: () => void, entered!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const f = await fixture(t, async n => {
    if (n === 1) return stop('{');
    entered(); await blocked; return stop();
  }, { ordinaryCodingReviewFinalReserve: true });
  await f.session.prompt('Original');
  const pending = f.session.prompt('Correction');
  await reached;
  await assert.rejects(f.session.prompt('Concurrent prompt'), { code: 'busy' });
  await assert.rejects(f.session.readonlyPrompt('Concurrent direct correction'), { code: 'busy' });
  release(); await pending;
  assert.equal(f.bodies.length, 2);
});

test('a direct read-only call cannot skip the original review', async t => {
  const f = await fixture(t, () => stop(), { ordinaryCodingReviewFinalReserve: true });
  await assert.rejects(f.session.readonlyPrompt('Skip evidence'), { code: 'incomplete' });
  assert.equal(f.bodies.length, 0);
});

for (const boundary of ['final', 'correction'] as const) test(`caller cancellation cannot dispatch reserved ${boundary}`, async t => {
  const abort = new AbortController();
  let settled = 0;
  const f = await fixture(t, n => boundary === 'correction' ? stop('{') : read(n), { ordinaryCodingReviewFinalReserve: true }, config => {
    const previous = config.budget.afterResponse;
    config.budget.afterResponse = async response => { await previous(response); if (++settled === 14) abort.abort(); };
  });
  if (boundary === 'correction') {
    await f.session.prompt('Original'); abort.abort();
  }
  await assert.rejects(f.session.prompt(boundary, { signal: abort.signal }), { code: 'cancelled' });
  assert.equal(f.bodies.length, boundary === 'final' ? 14 : 1);
});

for (const incompatible of [{ maxRequests: 17 }, { ordinaryCodingReviewImageQuote: undefined }, { resumeFile: 'old-session.jsonl' },
  { requestCompaction: async () => false }, { ordinaryCodingBuildReserve: true }, { ordinaryDesignReview: true },
  { ordinaryDesignFinalizationPolicy: 'budget-followup/1' }] as Partial<PiSessionOptions>[]) {
  test(`reserve rejects incompatible native options before session creation: ${Object.keys(incompatible)[0]}`, async () => {
    await assert.rejects(createPiSession({ maxRequests: 16, maxOutputTokens: 8192, requestTimeoutMs: 1000,
      ordinaryCodingReviewImageQuote: true, ordinaryCodingReviewFinalReserve: true,
      budget: { beforeRequest: async () => {}, afterResponse: async () => {} }, ...incompatible } as PiSessionOptions), /original sixteen-round coding review/);
  });
}
