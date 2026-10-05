import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';

const { createPiSession, createWorkspaceTools } = await import(new URL(process.env.COSMOS_TIMEOUT_COMPILED === '1'
  ? '../../dist/providers/pi.js' : '../../src/providers/pi.ts', import.meta.url));

async function fixture(t, responses = []) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-request-window-')), workspace = join(root, 'workspace');
  await mkdir(workspace);
  const admissions = [], settlements = [], sdk = [], timers = []; let sent = 0;
  const nativeTimer = globalThis.setTimeout;
  const timerMock = mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => { timers.push(delay); return nativeTimer(callback, delay, ...args); });
  const nativeStream = ModelRuntime.prototype.streamSimple;
  const streamMock = mock.method(ModelRuntime.prototype, 'streamSimple', function(model, context, options) {
    sdk.push({ options, bodyTimeout: timers.at(-1) }); return nativeStream.call(this, model, context, options);
  });
  const fetchMock = mock.method(globalThis, 'fetch', async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init); sent++;
    assert.equal(new URL(request.url).origin, 'https://api.deepseek.com');
    const response = responses.shift();
    if (response) return response(request);
    const chunk = { model: 'deepseek-flash', choices: [{ index: 0, delta: { content: 'Complete' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 } };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  const config = { workspace, stateDirectory: join(root, 'session'), systemPrompt: 'Bounded synthetic fixture', context: 'Fixed scope',
    tools: await createWorkspaceTools({ workspace, readPaths: ['.'], writePaths: ['output.txt'] }), env: { DEEPSEEK_API_KEY: 'offline-window-key' },
    maxOutputTokens: 500, maxRequests: 4, requestTimeoutMs: 500, estimatedMaxCostMicroCny: 1000,
    budget: { beforeRequest: async request => { admissions.push(request); }, afterResponse: async response => { settlements.push(response); } } };
  let session;
  t.after(async () => { await session?.close(); fetchMock.mock.restore(); streamMock.mock.restore(); timerMock.mock.restore(); await rm(root, { recursive: true, force: true }); });
  return { workspace, config, admissions, settlements, sdk, create: async overrides => (session = await createPiSession({ ...config, ...overrides })), sent: () => sent };
}

test('request window rejects insufficient cleanup time before admission or provider dispatch', async t => {
  const f = await fixture(t), session = await f.create({ requestWindow: async () => ({ deadlineAt: Date.now() + 20, cleanupMs: 50 }) });
  await assert.rejects(session.prompt('Do not send'), { code: 'admission_rejected' });
  assert.equal(f.admissions.length, 0); assert.equal(f.sent(), 0); assert.equal(f.settlements.length, 0); assert.equal(f.sdk.length, 0);
});

test('request window rechecks time after admission and reports not_sent when cleanup expires', async t => {
  const f = await fixture(t); let expired = false;
  const session = await f.create({ requestWindow: async () => ({ deadlineAt: Date.now() + (expired ? 20 : 500), cleanupMs: 50 }),
    budget: { ...f.config.budget, beforeRequest: async request => { f.admissions.push(request); expired = true; } } });
  await assert.rejects(session.prompt('Admission consumes time'), { code: 'admission_rejected' });
  assert.equal(f.admissions.length, 1); assert.equal(f.sent(), 0); assert.equal(f.sdk.length, 0);
  assert.equal(f.settlements.length, 1); assert.equal(f.settlements[0].outcome, 'not_sent');
});

test('request window uses the same clipped SDK and body timeout and retains unknown usage without tools or retry', async t => {
  let aborted = false;
  const f = await fixture(t, [async request => new Response(new ReadableStream({ start(controller) {
    const chunk = { model: 'deepseek-flash', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'write-1', type: 'function',
      function: { name: 'write', arguments: JSON.stringify({ path: 'output.txt', content: 'must not be written' }) } }] }, finish_reason: null }] };
    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
    request.signal.addEventListener('abort', () => { aborted = true; controller.error(new DOMException('Aborted', 'AbortError')); }, { once: true });
  } }), { headers: { 'content-type': 'text/event-stream' } })]);
  const session = await f.create({ requestWindow: async () => ({ deadlineAt: Date.now() + 120, cleanupMs: 30 }) });
  const started = performance.now(); await assert.rejects(session.prompt('Wait for clipped deadline'), { code: 'timeout' });
  assert.ok(performance.now() - started < 400); assert.equal(aborted, true); assert.equal(f.sent(), 1);
  const { options, bodyTimeout } = f.sdk[0];
  assert.ok(options.timeoutMs > 0 && options.timeoutMs <= 90); assert.equal(bodyTimeout, options.timeoutMs); assert.equal(options.maxRetries, 0);
  assert.equal(f.settlements.length, 1); assert.equal(f.settlements[0].outcome, 'unknown'); assert.equal(f.settlements[0].usage, undefined);
  await assert.rejects(session.prompt('retry'), { code: 'timeout' }); assert.equal(f.sent(), 1);
  await assert.rejects(readFile(join(f.workspace, 'output.txt')), { code: 'ENOENT' });
});

test('request window refreshes for every request and cannot exceed its trusted source cap', async t => {
  const f = await fixture(t); let deadlineAt = Date.now() + 10000;
  const session = await f.create({ requestTimeoutMs: 100, requestWindow: async () => ({ deadlineAt, cleanupMs: 50 }) });
  await session.prompt('First request');
  assert.equal(f.sdk[0].options.timeoutMs, 100); assert.equal(f.sdk[0].bodyTimeout, 100);
  deadlineAt = Date.now() + 20;
  await assert.rejects(session.prompt('Second request'), { code: 'admission_rejected' });
  assert.equal(f.admissions.length, 1); assert.equal(f.sent(), 1); assert.equal(f.settlements[0].outcome, 'settled');
});
