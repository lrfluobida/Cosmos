import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import type { Context } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { createPiSession, createWorkspaceTools } from '../../src/providers/pi.ts';
import { requestInputBytes } from '../../src/providers/request-input.ts';
import { validationReservation } from '../../src/runtime/validation-validation.ts';
import type { PiRequest } from '../../src/providers/pi.ts';
import { Type } from 'typebox';

const usage = { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40, prompt_cache_hit_tokens: 5 };
const historicalScreenshot = new URL('../../docs/research/assets/c14-independent-gameplay.png', import.meta.url);
const reply = (content = '完成', finish_reason = 'stop') => ({ delta: { content }, finish_reason });
const call = (name: string, args: unknown, id = 'tool-1') => ({
  delta: { reasoning_content: '需要使用工具', tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
  finish_reason: 'tool_calls',
});

async function fixture(t: any, responses: any[]) {
  const directory = await mkdtemp(join(tmpdir(), 'cosmos-pi-'));
  const workspace = join(directory, 'workspace');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(workspace);
  const requests: any[] = [];
  const settlements: any[] = [];
  const admissions: any[] = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    assert.equal(new URL(request.url).origin, 'https://api.deepseek.com');
    requests.push(JSON.parse(await request.text()));
    const response = responses.shift();
    if (typeof response === 'function') return response(request);
    assert.ok(response, 'unexpected extra provider request');
    const chunk = { id: 'response-test', model: 'deepseek-flash', choices: [{ index: 0, ...response }], usage };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  const config = {
    workspace,
    stateDirectory: join(directory, 'state'),
    systemPrompt: '只处理本任务。',
    context: '验收 A-1；输入 v1；预算由宿主控制。',
    tools: await createWorkspaceTools({ workspace, readPaths: ['.'], writePaths: ['output.txt'] }),
    env: { DEEPSEEK_API_KEY: 'offline-test-key' },
    maxOutputTokens: 2048,
    maxRequests: 8,
    requestTimeoutMs: 1000,
    estimatedMaxCostMicroCny: 100_000,
    budget: {
      beforeRequest: async (request: any) => { admissions.push(request); },
      afterResponse: async (response: any) => { settlements.push(response); },
    },
  };
  const sessions: Awaited<ReturnType<typeof createPiSession>>[] = [];
  const create = async (overrides = {}) => {
    const session = await createPiSession({ ...config, ...overrides });
    sessions.push(session);
    return session;
  };
  t.after(async () => {
    for (const session of sessions) await session.close();
    fetchMock.mock.restore();
    await rm(directory, { recursive: true, force: true });
  });
  return { create, config, requests, admissions, settlements, workspace };
}

function codingSession(f: Awaited<ReturnType<typeof fixture>>, build: () => { passed: boolean; diagnostics: string }) {
  const check = { ...f.config.tools[0], name: 'check-game-build', parameters: Type.Object({}), async execute() {
    return { content: [{ type: 'text' as const, text: JSON.stringify(build()) }], details: {} };
  } };
  return f.create({ maxRequests: 32, ordinaryCodingBuildReserve: true, tools: [...f.config.tools, check] });
}

for (const honest of [true, false]) test('coding build reserve keeps a persistent compiler failure visible, honest=' + honest, async t => {
  const complete = reply(JSON.stringify({ summary: 'Handoff', remaining: [], uncertainty: [] }));
  const f = await fixture(t, [...Array.from({ length: 31 }, (_, index) => call('read', { path: 'output.txt' }, 'read-' + index)),
    honest ? reply(JSON.stringify({ summary: 'Handoff', remaining: ['Fix TS2339'], uncertainty: [] })) : complete]);
  await writeFile(join(f.workspace, 'output.txt'), 'unchanged');
  let builds = 0;
  const session = await codingSession(f, () => {
    builds++;
    return { passed: false, diagnostics: 'TS2339' };
  });
  const result = session.prompt('Implement and check the source.');
  if (honest) assert.deepEqual(JSON.parse((await result).text).remaining, ['Fix TS2339']);
  else await assert.rejects(result, /TS2339/);
  assert.equal(builds, 1, 'repeated reads do not invalidate the check');
  assert.match(JSON.stringify(f.requests[28].messages.at(-1)), /TS2339/);
  assert.equal(f.requests[31].tools?.length ?? 0, 0);
  assert.equal(f.requests.length, 32);
  assert.equal(f.settlements.length, 32);
});

for (const stale of ['errored check', 'mixed write and check']) test('coding early handoff rechecks after ' + stale, async t => {
  const complete = reply(JSON.stringify({ summary: 'Ready', remaining: [], uncertainty: [] }));
  const first = call('check-game-build', {}, 'first'), next = call('check-game-build', {}, 'second');
  if (stale === 'mixed write and check') next.delta.tool_calls.push({
    index: 1, id: 'change', type: 'function', function: { name: 'write', arguments: JSON.stringify({ path: 'output.txt', content: 'changed' }) },
  });
  const f = await fixture(t, [first, next, complete, complete, complete]);
  let builds = 0;
  const session = await codingSession(f, () => {
    if (++builds === 2 && stale === 'errored check') throw new Error('Current source changed during compilation.');
    return { passed: builds < 3, diagnostics: builds < 3 ? '' : 'TS2339' };
  });
  await assert.rejects(session.prompt('Check the final source.'), /TS2339/);
  assert.equal(builds, 3);
  assert.match(JSON.stringify(f.requests[3].messages.at(-1)), /TS2339/);
  assert.equal(f.requests[4].tools?.length ?? 0, 0);
});

test('coding author reuses an unchanged passing check and hands off without tools inside the reserve', async t => {
  const complete = reply(JSON.stringify({ summary: 'Ready', remaining: [], uncertainty: [] }));
  const f = await fixture(t, [call('check-game-build', {}), ...Array.from({ length: 27 }, (_, i) => call('read', { path: 'output.txt' }, 'read-' + i)), complete, complete]);
  await writeFile(join(f.workspace, 'output.txt'), 'unchanged');
  let builds = 0;
  const session = await codingSession(f, () => {
    builds++;
    return { passed: true, diagnostics: '' };
  });
  assert.deepEqual(JSON.parse((await session.prompt('Finish.')).text).remaining, []);
  assert.equal(builds, 1);
  assert.equal(f.requests.length, 30);
  assert.equal(f.requests.at(-1).tools?.length ?? 0, 0);
});

test('native DeepSeek request uses fixed model, low effort, explicit tools and request accounting', async t => {
  const f = await fixture(t, [reply()]);
  const session = await f.create({ tools: [] });
  const events: string[] = [];
  session.subscribe(event => events.push(event.type));
  const result = await session.prompt('只回复完成');
  assert.equal(result.text, '完成');
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].model, 'deepseek-flash');
  assert.equal(f.requests[0].reasoning_effort, 'low');
  assert.equal(f.requests[0].max_tokens, 2048);
  assert.equal(f.requests[0].tools, undefined);
  assert.match(JSON.stringify(f.requests[0].messages), /验收 A-1/);
  assert.equal(f.settlements[0].outcome, 'settled');
  assert.equal(f.settlements[0].usage.output, 10);
  assert.equal(f.settlements[0].responseModel, 'deepseek-flash');
  assert.equal(f.admissions[0].requestId, f.settlements[0].requestId);
  assert.ok(events.includes('agent_settled'));
  const stateFiles = await readdir(f.config.stateDirectory, { recursive: true });
  assert.equal(stateFiles.some(name => /auth|settings|models/.test(name)), false);
  const transcript = await readFile(session.sessionFile!, 'utf8');
  assert.equal(transcript.includes('offline-test-key'), false);
});

test('coding review quotes every screenshot in the final wire body, including tool results and correction history', async t => {
  const f = await fixture(t, [call('read', { path: 'frame.png' }), reply(), reply(), reply()]);
  const frame = { type: 'image' as const, mimeType: 'image/png', data: (await readFile(historicalScreenshot)).toString('base64') };
  const imageOptions = { ordinaryCodingReviewImageQuote: true, estimatedMaxCostMicroCny: validationReservation, maxOutputTokens: 8192 };
  const read = { ...f.config.tools.find(tool => tool.name === 'read')!, async execute() {
    return { content: [{ type: 'text', text: '工具截图' }, frame], details: { hidden: 'not on wire' } };
  } };
  const session = await f.create({ ...imageOptions, tools: [read] });
  await session.prompt('检查截图', { images: Array(8).fill(frame) });
  await session.readonlyPrompt('纠正裁决');
  await session.close();
  await (await f.create({ ...imageOptions, resumeFile: session.sessionFile, tools: [read] })).prompt('复查原始记录');
  for (const [index, body] of f.requests.entries()) {
    const wire = JSON.stringify(body), images = wire.split(frame.data).length - 1;
    assert.equal(images, index === 0 ? 8 : 9);
    const request = f.admissions[index];
    assert.equal(request.hasImages, true);
    assert.ok(request.inputBytes >= frame.data.length * images);
    const minimum = (Buffer.byteLength(wire.replaceAll(frame.data, '')) + images * 1024) * 2 + 8192 * 8;
    assert.ok(request.estimatedMaxCostMicroCny >= minimum, 'entire wire non-image content plus every image and output');
    assert.ok(request.estimatedMaxCostMicroCny < 200000, 'normal grant can admit these eight or nine historical screenshots');
    assert.equal(request.requestId, f.settlements[index].requestId);
    t.diagnostic(`turn ${index + 1}: ${images} screenshots, ${request.inputBytes} native bytes, reserve ${request.estimatedMaxCostMicroCny} micro-CNY`);
  }
  assert.equal(f.requests.length, 4);
  assert.equal(f.requests[2].tools?.length ?? 0, 0);
});

for (const condition of ['one-frame', 'legacy', 'custom-transport', 'short-png', 'unknown-media', 'external-url', 'unknown-block', 'unknown-field', 'grown-text',
  'above-context', 'changed-input', 'expired-window', 'sdk-error', 'changed-cap', 'timeout', 'low-balance'] as const) test(`screenshot admission at native HTTP boundary: ${condition}`, async t => {
  const f = await fixture(t, [reply()]);
  const createRuntime = ModelRuntime.create;
  let runtime!: ModelRuntime;
  t.mock.method(ModelRuntime, 'create', async (...args: Parameters<typeof createRuntime>) => (runtime = await createRuntime(...args)));
  const data = (await readFile(historicalScreenshot)).toString('base64');
  const frame = { type: 'image' as const, mimeType: condition === 'unknown-media' ? 'image/tiff' : 'image/png',
    data: condition === 'short-png' ? data.slice(0, -32) : data };
  const context = { messages: [{ role: 'user' as const, content: [frame], timestamp: 0 }] };
  const session = await f.create({ ordinaryCodingReviewImageQuote: condition !== 'legacy', estimatedMaxCostMicroCny: validationReservation, maxOutputTokens: 8192,
    ...(condition === 'timeout' ? { requestTimeoutMs: 50 } : {}),
    requestWindow: async () => ({ deadlineAt: condition === 'expired-window' && f.admissions.length ? 1 : Date.now() + 30000, cleanupMs: 5000 }),
    budget: { ...f.config.budget, beforeRequest: async (request: PiRequest) => {
      f.admissions.push(request);
      if (condition === 'changed-input') context.messages[0].content.push(frame);
      if (condition === 'low-balance') throw Error('Remaining grant cannot cover this request');
    } } });
  const model = runtime.getModel('deepseek', 'deepseek-flash')!;
  const message = await runtime.streamSimple(model, context, { ...(condition === 'custom-transport' ? { fetch: globalThis.fetch } : {}), async onPayload(payload) {
    const body = payload as any;
    if (condition === 'external-url') body.messages[0].content[0].image_url.url = 'https://example.invalid/unbounded.png';
    if (condition === 'unknown-block') body.messages[0].content.push({ type: 'file', file_id: 'external' });
    if (condition === 'unknown-field') body.extra_media = { file_id: 'external' };
    if (condition === 'grown-text' || condition === 'above-context') body.messages.push({ role: 'system', content: '追加'.repeat(condition === 'grown-text' ? 8192 : 200000) });
    if (condition === 'changed-cap') body.max_tokens++;
    if (condition === 'sdk-error') throw Error('Cannot prepare request');
    if (condition === 'timeout') await new Promise(resolve => setTimeout(resolve, 90));
  } }).result();
  const early = ['sdk-error', 'changed-cap', 'timeout'].includes(condition);
  const unsent = early || ['changed-input', 'expired-window', 'low-balance'].includes(condition);
  assert.equal(message.stopReason, unsent ? 'error' : 'stop');
  assert.equal(f.requests.length, unsent ? 0 : 1);
  assert.equal(f.admissions.length, early ? 0 : 1);
  assert.equal(session.requestRecords.length, early || condition === 'low-balance' ? 0 : 1);
  if (early) return;
  if (unsent) {
    assert.ok(f.admissions[0].estimatedMaxCostMicroCny < 100000);
    assert.deepEqual(f.settlements.map(row => row.outcome), condition === 'low-balance' ? [] : ['not_sent']);
  } else if (condition === 'one-frame') {
    assert.ok(f.admissions[0].estimatedMaxCostMicroCny < 100000);
    t.diagnostic(`one screenshot: reserve ${f.admissions[0].estimatedMaxCostMicroCny} micro-CNY`);
  } else if (condition === 'grown-text') {
    assert.ok(f.admissions[0].estimatedMaxCostMicroCny >= 8192 * 8 + 8192 * 6 * 2 + 1024 * 2);
    assert.equal(f.requests[0].messages.at(-1).content.length, 16384);
  } else {
    assert.equal(f.admissions[0].estimatedMaxCostMicroCny, 2065536);
  }
});

test('SDK executes tools, returns their results and reasoning, and restores the conversation', async t => {
  const f = await fixture(t, [call('write', { path: 'output.txt', content: '中文记录\n' }), reply(), reply('仍记得')]);
  const first = await f.create();
  await first.prompt('写入 output.txt');
  assert.equal(await readFile(join(f.workspace, 'output.txt'), 'utf8'), '中文记录\n');
  assert.equal(f.requests[1].messages.find((m: any) => m.role === 'assistant').reasoning_content, '需要使用工具');
  assert.ok(f.requests[1].messages.some((m: any) => m.role === 'tool' && m.tool_call_id === 'tool-1'));
  const sessionFile = first.sessionFile;
  await first.close();
  const restored = await f.create({ resumeFile: sessionFile });
  await restored.prompt('继续');
  assert.equal(f.requests[2].messages.find((m: any) => m.role === 'assistant').reasoning_content, '需要使用工具');
  assert.equal(f.admissions.length, 3);
});

for (const mode of ['live', 'compaction'] as const) test(`toolResult details do not inflate ${mode} input quotes or change native transport`, async t => {
  const f = await fixture(t, [call('read', { path: 'synthetic.txt' }), reply(), call('read', { path: 'synthetic.txt' }), reply()]);
  const projections: Pick<PiRequest, 'inputBytes' | 'hasImages' | 'maxOutputTokens'>[] = [];
  for (const details of [{ note: '短元数据' }, { note: '合成元数据'.repeat(20000) }]) {
    const session = await f.create({
      tools: [{ ...f.config.tools.find(tool => tool.name === 'read')!, async execute() {
        return { content: [{ type: 'text', text: '固定工具结果，保留中文。' }], details };
      } }],
      estimatedMaxCostMicroCny: validationReservation,
      requestOutputLimit: async (request: PiRequest) => request.maxOutputTokens,
      ...(mode === 'compaction' ? { requestCompaction: async (request: typeof projections[number]) => { projections.push(request); return false; } } : {}),
    });
    await session.prompt('读取合成工具结果');
    const entries = (await readFile(session.sessionFile!, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(entries.find(entry => entry.message?.role === 'toolResult').message.details, details);
  }
  assert.deepEqual(f.requests[1], f.requests[3], 'metadata must not alter the actual provider body');
  if (mode === 'live') {
    assert.equal(f.admissions[1].inputBytes, f.admissions[3].inputBytes);
    assert.equal(f.admissions[1].estimatedMaxCostMicroCny, f.admissions[3].estimatedMaxCostMicroCny);
  } else {
    assert.equal(projections.length, 2);
    assert.equal(projections[0].inputBytes, projections[1].inputBytes);
    assert.equal(projections[0].inputBytes, f.admissions[1].inputBytes);
    assert.equal(validationReservation(projections[0]), validationReservation(projections[1]));
  }
});

test('real tool content increases transport and quotes and remains subject to budget admission', async t => {
  const f = await fixture(t, [call('read', { path: 'synthetic.txt' }), reply(), call('read', { path: 'synthetic.txt' }), reply(), call('read', { path: 'synthetic.txt' })]);
  let ceiling = Infinity;
  const short = '固定工具结果。', large = short + '合成内容'.repeat(20000);
  for (const [index, text] of [short, large, large].entries()) {
    if (index === 2) ceiling = f.admissions[1].estimatedMaxCostMicroCny;
    const session = await f.create({
      tools: [{ ...f.config.tools.find(tool => tool.name === 'read')!, async execute() {
        return { content: [{ type: 'text', text }], details: { note: '固定元数据' } };
      } }],
      estimatedMaxCostMicroCny: validationReservation,
      budget: { ...f.config.budget, beforeRequest: async (request: PiRequest) => {
        f.admissions.push(request);
        if (request.estimatedMaxCostMicroCny > ceiling) throw new Error('Synthetic budget exhausted');
      } },
    });
    if (index === 2) await assert.rejects(session.prompt('读取合成工具结果'), { code: 'admission_rejected' });
    else await session.prompt('读取合成工具结果');
  }
  assert.equal(f.requests[1].messages.find((message: any) => message.role === 'tool').content, short);
  assert.equal(f.requests[3].messages.find((message: any) => message.role === 'tool').content, large);
  const growth = Buffer.byteLength(large) - Buffer.byteLength(short);
  assert.equal(f.admissions[3].inputBytes - f.admissions[1].inputBytes, growth);
  assert.equal(f.admissions[3].estimatedMaxCostMicroCny - f.admissions[1].estimatedMaxCostMicroCny, growth * 2);
  assert.equal(f.admissions.length, 6);
  assert.equal(f.requests.length, 5, 'rejected large content must not reach fetch');
  assert.equal(f.settlements.length, 5);
});

for (const mode of ['feedback', 'ordinary', 'insufficient', 'changed-original'] as const) test(`coding read history on native transport: ${mode}`, async t => {
  const recent = call('read', { path: 'last.txt', offset: 1 }, 'recent');
  recent.delta.tool_calls.push({ ...call('read', { path: 'output.txt' }, 'also-recent').delta.tool_calls[0], index: 1 });
  const failed = call('read', { path: 'missing.txt' }, 'failed');
  failed.delta.tool_calls.push({ ...call('read', null, 'invalid').delta.tool_calls[0], index: 1 });
  const f = await fixture(t, [call('read', { path: 'output.txt' }, 'source'), call('read', { path: 'first.txt' }, 'old'),
    failed, recent, reply()]);
  const source = '可编辑文件。'.repeat(250), first = '旧依赖内容。'.repeat(900), last = '近期依赖。'.repeat(300);
  const omitted = '[Earlier read output omitted. Use the original read arguments to read this file again.]';
  const createRuntime = ModelRuntime.create;
  let runtime!: ModelRuntime, original!: Context;
  t.mock.method(ModelRuntime, 'create', async (...args: Parameters<typeof createRuntime>) => (runtime = await createRuntime(...args)));
  for (const [path, data] of [['output.txt', source], ['first.txt', first], ['last.txt', last]]) await writeFile(join(f.workspace, path), data);
  const session = await f.create({
    ...(mode === 'ordinary' ? {} : { feedbackReadWritePaths: ['output.txt'] }),
    estimatedMaxCostMicroCny: validationReservation,
    requestOutputLimit: async (request: PiRequest) => request.maxOutputTokens,
    budget: { ...f.config.budget, beforeRequest: async (request: PiRequest) => {
      f.admissions.push(request);
      assert.equal(request.estimatedMaxCostMicroCny, validationReservation(request));
      if (f.admissions.length === 5) {
        const expected = structuredClone(original);
        for (const message of expected.messages) {
          if (mode !== 'ordinary' && message.role === 'toolResult' && message.toolCallId === 'old') message.content = [{ type: 'text', text: omitted }];
        }
        assert.equal(request.inputBytes, requestInputBytes(expected));
        if (mode === 'insufficient') throw Error('Insufficient budget');
        if (mode === 'changed-original') {
          const old = original.messages.find(m => m.role === 'toolResult' && m.toolCallId === 'old');
          if (old?.role === 'toolResult') old.content = [{ type: 'text', text: 'Changed during admission' }];
        }
      }
    } },
  });
  const stream = runtime.streamSimple.bind(runtime);
  t.mock.method(runtime, 'streamSimple', (...args: Parameters<typeof stream>) => { original = args[1]; return stream(...args); });
  if (mode === 'insufficient') await assert.rejects(session.prompt('绑定反馈'), { code: 'admission_rejected' });
  else if (mode === 'changed-original') await assert.rejects(session.prompt('绑定反馈'), { code: 'invalid_request' });
  else await session.prompt('绑定反馈');
  const rejected = mode === 'insufficient' || mode === 'changed-original';
  assert.equal(f.requests.length, rejected ? 4 : 5);
  assert.equal(f.settlements.filter(row => row.outcome === 'settled').length, f.requests.length);
  if (mode === 'changed-original') assert.equal(f.settlements.at(-1).outcome, 'not_sent');
  const entries = (await readFile(session.sessionFile!, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(entries.find(row => row.message?.toolCallId === 'old').message.content[0].text, first);
  if (rejected) return;
  const messages = f.requests.at(-1).messages, result = (id: string) => messages.find((m: any) => m.tool_call_id === id).content;
  assert.equal(result('source'), source);
  assert.match(result('failed'), /missing.txt/);
  assert.ok(result('invalid'));
  assert.equal(result('recent'), last);
  assert.equal(result('also-recent'), source);
  assert.equal(result('old'), mode === 'ordinary' ? first : omitted);
  assert.ok(messages.some((m: any) => m.tool_calls?.some((c: any) => c.id === 'old' && JSON.parse(c.function.arguments).path === 'first.txt')));
});

test('tool errors return to the model for a bounded repair without expanding write scope', async t => {
  const f = await fixture(t, [call('write', { path: '../escape.txt', content: 'bad' }), call('write', { path: 'output.txt', content: '修复' }, 'tool-2'), reply()]);
  await (await f.create()).prompt('写入许可文件');
  assert.match(f.requests[1].messages.find((m: any) => m.role === 'tool').content, /outside|allowed/i);
  assert.equal(await readFile(join(f.workspace, 'output.txt'), 'utf8'), '修复');
});

test('length is incomplete and never runs a partial tool call or hidden retry', async t => {
  const partial = call('write', { path: 'output.txt', content: 'partial' });
  partial.finish_reason = 'length';
  const f = await fixture(t, [partial]);
  await assert.rejects((await f.create()).prompt('write'), { code: 'incomplete' });
  assert.equal(f.requests.length, 1);
  assert.equal(f.settlements[0].outcome, 'settled');
  assert.equal(f.settlements[0].stopReason, 'length');
  await assert.rejects(readFile(join(f.workspace, 'output.txt')), { code: 'ENOENT' });
});

test('rejected admission sends no request; request ceiling blocks an extra tool turn', async t => {
  const f = await fixture(t, [call('read', { path: 'missing.txt' })]);
  const denied = await f.create({ budget: { ...f.config.budget, beforeRequest: async () => { throw new Error('budget exhausted'); } } });
  await assert.rejects(denied.prompt('hello'), { code: 'admission_rejected' });
  assert.equal(f.requests.length, 0);
  const bounded = await f.create({ maxRequests: 1 });
  await assert.rejects(bounded.prompt('read'), { code: 'request_limit' });
  assert.equal(f.requests.length, 1);
});

test('cancellation waits for SDK settlement, marks absent usage unknown and prevents a follow-up request', async t => {
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const f = await fixture(t, [async (request: Request) => {
    started();
    await new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
  }]);
  const session = await f.create();
  const pending = session.prompt('等待');
  await ready;
  await session.cancel();
  await assert.rejects(pending, { code: 'cancelled' });
  assert.equal(f.requests.length, 1);
  assert.equal(f.settlements[0].outcome, 'unknown');
});

test('manual SDK compaction is accounted and frozen task context survives resume', async t => {
  const f = await fixture(t, [reply('记录 '.repeat(200)), reply('保留 A-1、输入 v1 和待完成事项'), reply('继续完成')]);
  const first = await f.create({ tools: [], compactionKeepRecentTokens: 0 });
  await first.prompt('记录验收 A-1');
  await first.compact();
  assert.equal(f.admissions.length, 2);
  assert.match(await readFile(first.sessionFile!, 'utf8'), /"type":"compaction"/);
  await first.close();
  const resumed = await f.create({ tools: [], resumeFile: first.sessionFile });
  await resumed.prompt('继续');
  assert.match(JSON.stringify(f.requests[2].messages), /验收 A-1/);
});

test('manual summary length stays fatal even when optional compaction is configured', async t => {
  const f = await fixture(t, [reply('Manual history '.repeat(200)), reply('Partial manual summary', 'length')]);
  const session = await f.create({ tools: [], compactionKeepRecentTokens: 0, requestCompaction: async () => true });
  await session.prompt('Keep the original history');
  await assert.rejects(session.compact(), /Provider output was truncated; task is incomplete/);
  assert.equal(f.requests.length, 2); assert.equal(f.settlements[1].outcome, 'settled');
  assert.equal(f.settlements[1].stopReason, 'length');
  assert.doesNotMatch(await readFile(session.sessionFile!, 'utf8'), /"type":"compaction"/);
  await assert.rejects(session.prompt('No retry'), { code: 'incomplete' });
  assert.equal(f.requests.length, 2);
});

test('image attachments reach the native provider', async t => {
  const f = await fixture(t, [reply('image seen')]);
  const png = await readFile(new URL('../../probes/2026-10-01-deepseek/vision-fixture-2026-09-30T17-47-57.205Z.png', import.meta.url));
  await (await f.create({ tools: [] })).prompt('图片', { images: [{ type: 'image', data: png.toString('base64'), mimeType: 'image/png' }] });
  assert.match(JSON.stringify(f.requests[0].messages), /data:image\/png;base64,/);
});

test('invalid model, missing budget and invalid UTF-8 are rejected before provider work', async t => {
  const f = await fixture(t, []);
  await assert.rejects(f.create({ modelId: 'deepseek-other' }), /deepseek-flash/);
  await assert.rejects(f.create({ budget: undefined }), /budget/i);
  await writeFile(join(f.workspace, 'output.txt'), Buffer.from([0xff]));
  const tools = f.config.tools;
  await assert.rejects(tools.find(tool => tool.name === 'write')!.execute('x', { path: 'output.txt', content: 'new' }, undefined, undefined, {} as any), /UTF-8/);
  assert.deepEqual(await readFile(join(f.workspace, 'output.txt')), Buffer.from([0xff]));
});

test('settlement failure stops tool execution and invokes afterResponse exactly once', async t => {
  const f = await fixture(t, [call('write', { path: 'output.txt', content: 'bad' })]);
  let settlements = 0;
  const session = await f.create({ budget: {
    ...f.config.budget,
    afterResponse: async () => { settlements++; throw new Error('disk full'); },
  } });
  await assert.rejects(session.prompt('write'), { code: 'accounting_error' });
  assert.equal(settlements, 1);
  assert.equal(f.requests.length, 1);
  await assert.rejects(session.prompt('try again'), { code: 'accounting_error' });
  await assert.rejects(readFile(join(f.workspace, 'output.txt')), { code: 'ENOENT' });
});

test('network errors and missing usage retain unknown cost without retry', async t => {
  const f = await fixture(t, [async () => { throw new Error('transport failed'); }, async () => {
    const chunk = { model: 'deepseek-flash', choices: [{ index: 0, ...reply() }] };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  }]);
  await assert.rejects((await f.create()).prompt('network'), { code: 'provider_error' });
  await assert.rejects((await f.create()).prompt('usage'), { code: 'usage_unknown' });
  assert.equal(f.requests.length, 2);
  assert.deepEqual(f.settlements.map(r => r.outcome), ['unknown', 'unknown']);
});

test('a returned model mismatch is recorded and fails before tools can run', async t => {
  const f = await fixture(t, [async () => {
    const chunk = { model: 'wrong-model', choices: [{ index: 0, ...call('write', { path: 'output.txt', content: 'bad' }) }], usage };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  }]);
  await assert.rejects((await f.create()).prompt('write'), { code: 'model_mismatch' });
  assert.equal(f.settlements[0].responseModel, 'wrong-model');
  assert.equal(f.settlements[0].outcome, 'unknown');
  await assert.rejects(readFile(join(f.workspace, 'output.txt')), { code: 'ENOENT' });
});

test('cancellation during admission reports not_sent and never dispatches', async t => {
  const f = await fixture(t, []);
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const session = await f.create({ budget: { ...f.config.budget, beforeRequest: async () => { entered(); await gate; } } });
  const prompt = session.prompt('hello');
  await ready;
  const cancel = session.cancel();
  release();
  await cancel;
  await assert.rejects(prompt, { code: 'cancelled' });
  assert.equal(f.requests.length, 0);
  assert.equal(f.settlements[0].outcome, 'not_sent');
});

test('immediate caller cancellation prevents SDK startup from admitting or dispatching', async t => {
  const f = await fixture(t, [reply('must not arrive')]);
  const session = await f.create();
  const controller = new AbortController();
  const pending = session.prompt('cancel immediately', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { code: 'cancelled' });
  assert.equal(f.admissions.length, 0);
  assert.equal(f.requests.length, 0);
  assert.equal(f.settlements.length, 0);
});

test('request deadline aborts a stalled SSE body, retains unknown cost and blocks tools', async t => {
  let transportAborted = false;
  const f = await fixture(t, [async (request: Request) => {
    const partial = call('write', { path: 'output.txt', content: 'must not be written' });
    const chunk = { model: 'deepseek-flash', choices: [{ index: 0, ...partial, finish_reason: null }] };
    const body = new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
      request.signal.addEventListener('abort', () => {
        transportAborted = true;
        controller.error(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    } });
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
  }]);
  const session = await f.create({ requestTimeoutMs: 50 });
  const pending = session.prompt('stream forever').then(() => undefined, error => error);
  let fallbackTimer: ReturnType<typeof setTimeout>;
  const fallback = new Promise<'still pending'>(resolve => { fallbackTimer = setTimeout(() => resolve('still pending'), 300); });
  const result = await Promise.race([pending, fallback]);
  clearTimeout(fallbackTimer!);
  if (result === 'still pending') await session.cancel();
  await pending;
  assert.notEqual(result, 'still pending', 'requestTimeoutMs must bound response-body streaming');
  assert.equal(result.code, 'timeout');
  assert.equal(transportAborted, true);
  assert.equal(f.admissions.length, 1);
  assert.equal(f.requests.length, 1);
  assert.equal(f.settlements.length, 1);
  assert.equal(f.settlements[0].outcome, 'unknown');
  assert.ok(Number.isFinite(f.settlements[0].firstResponseMs));
  await assert.rejects(session.prompt('retry'), { code: 'timeout' });
  await assert.rejects(readFile(join(f.workspace, 'output.txt')), { code: 'ENOENT' });
});

test('one native read-only turn keeps the conversation and restores the author tool loadout', async t => {
  const f = await fixture(t, [reply('original facts'), reply('{"summary":"facts","remaining":[],"uncertainty":[]}'), call('write', { path: 'output.txt', content: '恢复中文\n' }), reply()]);
  const session = await f.create();
  await session.prompt('author');
  await session.readonlyPrompt('only reformat');
  assert.equal(f.requests[1].tools, undefined);
  assert.match(JSON.stringify(f.requests[1].messages), /original facts/);
  assert.equal(f.admissions.length, 2);
  await session.prompt('continue author');
  assert.equal(await readFile(join(f.workspace, 'output.txt'), 'utf8'), '恢复中文\n');
  assert.equal(f.requests[2].tools.some((tool: any) => tool.function.name === 'write'), true);
});

for (const name of ['write', 'edit', 'check_project']) test(`native format turn cannot execute ${name} or create an extra provider turn`, async t => {
  const f = await fixture(t, [call(name, name === 'edit' ? { path: 'output.txt', oldText: '原文', newText: 'bad' } : { path: 'output.txt', content: 'bad' })]);
  await writeFile(join(f.workspace, 'output.txt'), '原文\n', 'utf8');
  let hostCalls = 0;
  const host = { ...f.config.tools[0], name: 'check_project', async execute() { hostCalls++; await writeFile(join(f.workspace, 'output.txt'), 'bad', 'utf8'); return { content: [], details: {} }; } };
  const session = await f.create({ tools: [...f.config.tools, host] });
  await assert.rejects(session.readonlyPrompt('only reformat'), { code: 'request_limit' });
  assert.equal(f.requests.length, 1);
  assert.equal(f.admissions.length, 1);
  assert.equal(f.requests[0].tools, undefined);
  assert.equal(hostCalls, 0);
  assert.equal(await readFile(join(f.workspace, 'output.txt'), 'utf8'), '原文\n');
});

for (const exposure of ['codemode', 'deferred'] as const) test(`native format turn refuses callable inactive ${exposure} tools before admission`, async t => {
  const f = await fixture(t, []);
  const session = await f.create({ tools: [{ ...f.config.tools.find(tool => tool.name === 'write')!, exposure }] });
  await assert.rejects(session.readonlyPrompt('only reformat'), { code: 'readonly_unavailable' });
  assert.equal(f.requests.length, 0);
  assert.equal(f.admissions.length, 0);
});

test('a concurrent author operation cannot overlap a native format turn; close waits for settlement', async t => {
  let enter!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { enter = resolve; });
  const ready = new Promise<void>(resolve => { release = resolve; });
  const f = await fixture(t, [async () => { enter(); await ready; const chunk = { model: 'deepseek-flash', choices: [{ index: 0, ...reply('facts') }], usage }; return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } }); }]);
  const session = await f.create();
  const pending = session.readonlyPrompt('format').catch(error => error);
  await started;
  await assert.rejects(session.prompt('overlap'), { code: 'busy' });
  await assert.rejects(session.compact(), { code: 'busy' });
  const closing = session.close(); release(); await closing; await pending;
  await assert.rejects(session.readonlyPrompt('after close'), { code: 'closed' });
  assert.equal(f.requests.length, 1);
});
