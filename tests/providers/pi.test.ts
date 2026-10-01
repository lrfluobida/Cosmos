import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { createPiSession, createWorkspaceTools } from '../../src/providers/pi.ts';

const usage = { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40, prompt_cache_hit_tokens: 5 };
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
