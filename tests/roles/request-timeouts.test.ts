import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { createPiSession, type PiResponse, type PiSessionOptions } from '../../src/providers/pi.ts';
import { createRoleFactory } from '../../src/roles/factory.ts';
import type { Role } from '../../src/roles/factory.ts';
import { RunController } from '../../src/runtime/run.ts';
import type { RequirementContract, TaskContract } from '../../src/contracts/index.ts';
import { requirement as requirementFixture, task as taskFixture } from '../contracts/fixtures.ts';

async function fixture(t: any) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-request-timeout-'));
  await mkdir(join(root, 'requirements'));
  await writeFile(join(root, 'requirements/v1.json'), '固定中文要求', 'utf8');
  const requirement = requirementFixture() as RequirementContract, task = taskFixture() as TaskContract;
  const controller = await RunController.create({ root: join(root, 'run'), runId: 'run-1', ledgerId: 'ledger-1', kind: 'runtime_generation',
    specVersion: requirement.specVersion, scope: 'validation', limitMicroCny: 10000, allocations: [{ taskId: task.taskId, amountMicroCny: 10000 }] });
  task.budget = { ...task.budget, allocationMicroCny: 10000, originalDeadlineAt: (await controller.read()).run.originalDeadlineAt };
  task.context.tools = ['read', 'write', 'edit'];
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  const create = (factory: ReturnType<typeof createRoleFactory>, role: Role = 'coding', purpose?: 'planning') => factory({
    role, purpose, task, requirement, controller, workspace: root, stateDirectory: join(root, `session-${role}-${purpose ?? 'author'}`),
  });
  return { root, controller, task, create };
}

test('trusted coding author timeout excludes other authors, reviewers and planning', async t => {
  const f = await fixture(t), seen: PiSessionOptions[] = [];
  const limits = { maxOutputTokens: 500, maxRequests: 2, requestTimeoutMs: 120000, codingAuthorRequestTimeoutMs: 600000, estimatedMaxCostMicroCny: 100,
    sessionFactory: async (config: PiSessionOptions) => { seen.push(config); return { prompt: async () => ({ text: 'Complete' }), close: async () => {} }; } };
  const factory = createRoleFactory(limits);
  for (const [role, purpose, timeout] of [['coding', undefined, 600000], ['design', undefined, 120000], ['art', undefined, 120000],
    ['cosmos', undefined, 120000], ['reviewer', undefined, 120000], ['cosmos', 'planning', 120000], ['coding', 'planning', 120000]] as const) {
    const session = await f.create(factory, role, purpose); await session.close();
    assert.equal(seen.at(-1)!.requestTimeoutMs, timeout, `${role}/${purpose ?? 'author'}`);
  }
  const config = seen[0] as any;
  assert.equal(typeof config.requestWindow, 'function');
  assert.deepEqual(await config.requestWindow(), { deadlineAt: Date.parse(f.task.budget.originalDeadlineAt), cleanupMs: 5000 });
  await f.controller.stop('Offline stop');
  await assert.rejects(config.requestWindow(), { code: 'manual', reason: 'Offline stop' });
});

test('invalid coding author timeouts fail before constructing a session', () => {
  for (const codingAuthorRequestTimeoutMs of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => createRoleFactory({ maxOutputTokens: 500, maxRequests: 2, requestTimeoutMs: 120000,
      codingAuthorRequestTimeoutMs, estimatedMaxCostMicroCny: 100 } as any), /codingAuthorRequestTimeoutMs/);
  }
});

test('trusted design author timeout preserves omitted fallback, coding, planning and reviewer caps', async t => {
  const f = await fixture(t), seen: PiSessionOptions[] = [];
  for (const designAuthorRequestTimeoutMs of [undefined, 600000]) {
    const factory = createRoleFactory({ maxOutputTokens: 500, maxRequests: 2, requestTimeoutMs: 120000,
      codingAuthorRequestTimeoutMs: 600000, designAuthorRequestTimeoutMs, estimatedMaxCostMicroCny: 100,
      authorThinkingLevel: { design: 'high' },
      sessionFactory: async config => { seen.push(config); return { prompt: async () => ({ text: 'Complete' }), close: async () => {} }; } });
    for (const [role, purpose, timeout] of [['design', undefined, designAuthorRequestTimeoutMs ?? 120000], ['coding', undefined, 600000],
      ['art', undefined, 120000], ['cosmos', undefined, 120000], ['reviewer', undefined, 120000],
      ['cosmos', 'planning', 120000], ['design', 'planning', 120000], ['coding', 'planning', 120000]] as const) {
      const session = await f.create(factory, role, purpose); await session.close();
      assert.equal(seen.at(-1)!.requestTimeoutMs, timeout, `${role}/${purpose ?? 'author'}`);
      assert.deepEqual(await seen.at(-1)!.requestWindow!(), { deadlineAt: Date.parse(f.task.budget.originalDeadlineAt), cleanupMs: 5000 });
    }
  }
});

test('invalid design author timeouts fail before constructing a session', () => {
  for (const designAuthorRequestTimeoutMs of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => createRoleFactory({ maxOutputTokens: 500, maxRequests: 2, requestTimeoutMs: 120000,
      designAuthorRequestTimeoutMs, estimatedMaxCostMicroCny: 100 } as any), /designAuthorRequestTimeoutMs/);
  }
});

for (const role of ['coding', 'design'] as const) test(`${role} author can finish a progressing SSE body beyond the old short cap`, async t => {
  const f = await fixture(t); let sent = 0, progress = 0;
  const fetchMock = mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init); sent++;
    assert.equal(new URL(request.url).origin, 'https://api.deepseek.com');
    const body = new ReadableStream({ start(controller) {
      const tick = setInterval(() => {
        progress++;
        const final = progress === 7;
        const chunk = { model: 'deepseek-flash', choices: [{ index: 0, delta: { content: 'progress ' }, finish_reason: final ? 'stop' : null }],
          ...(final ? { usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 } } : {}) };
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
        if (final) { clearInterval(tick); controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); controller.close(); }
      }, 15);
      request.signal.addEventListener('abort', () => { clearInterval(tick); controller.error(new DOMException('Aborted', 'AbortError')); }, { once: true });
    } });
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
  });
  const limits = { maxOutputTokens: 500, maxRequests: 2, requestTimeoutMs: 40, codingAuthorRequestTimeoutMs: 1000, designAuthorRequestTimeoutMs: 1000,
    estimatedMaxCostMicroCny: 1000, env: { DEEPSEEK_API_KEY: 'offline-timeout-key' } };
  const session = await f.create(createRoleFactory(limits), role);
  t.after(async () => { await session.close(); fetchMock.mock.restore(); });
  const started = performance.now(), result = await session.prompt('Complete incrementally');
  assert.match(result.text, /progress/); assert.ok(performance.now() - started > 40);
  assert.equal(progress, 7); assert.equal(sent, 1);
  assert.equal((await f.controller.read()).ledger.entries[0].status, 'settled');
});

for (const role of ['coding', 'design'] as const) test(`controller stop cancels the longer ${role} allowance and retains unknown cost without tools or retry`, async t => {
  const f = await fixture(t); let started!: () => void, sent = 0, aborted = false;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const fetchMock = mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init); sent++;
    const chunk = { model: 'deepseek-flash', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'write-1', type: 'function',
      function: { name: 'write', arguments: JSON.stringify({ path: 'game/output.txt', content: 'must not appear' }) } }] }, finish_reason: null }] };
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
      request.signal.addEventListener('abort', () => { aborted = true; controller.error(new DOMException('Aborted', 'AbortError')); }, { once: true });
      started();
    } }), { headers: { 'content-type': 'text/event-stream' } });
  });
  const limits = { maxOutputTokens: 500, maxRequests: 2, requestTimeoutMs: 40, codingAuthorRequestTimeoutMs: 1000, designAuthorRequestTimeoutMs: 1000,
    estimatedMaxCostMicroCny: 1000, env: { DEEPSEEK_API_KEY: 'offline-timeout-key' } };
  const session = await f.create(createRoleFactory(limits), role);
  t.after(async () => { await session.close(); fetchMock.mock.restore(); });
  const pending = session.prompt('Wait for controller stop').then(() => undefined, error => error);
  await ready; const stopped = performance.now(); await f.controller.stop('Offline controller stop');
  assert.equal((await pending).code, 'cancelled'); assert.ok(performance.now() - stopped < 500);
  assert.equal(aborted, true); assert.equal(sent, 1);
  const entry = (await f.controller.read()).ledger.entries[0];
  assert.equal(entry.status, 'unknown'); assert.equal(entry.reservedMicroCny, 1000); assert.equal(entry.settledMicroCny, 0);
  await assert.rejects(session.prompt('retry'), { code: 'cancelled' });
  await assert.rejects(readFile(join(f.root, 'game/output.txt')), { code: 'ENOENT' });
});

for (const [role, timeout] of [['design', 600000], ['art', 600000], ['art', 200000]] as const) test(`${role} absolute timeout of ${timeout}ms survives early and later stream events without extending or retrying`, { timeout: 15000 }, async t => {
  const f = await fixture(t), responses: PiResponse[] = [];
  if (timeout < 600000) t.mock.method(Date, 'now', () => Date.parse(f.task.budget.originalDeadlineAt) - timeout - 5000);
  let body!: ReadableStreamDefaultController<Uint8Array>, sent = 0, aborted = false, observed!: () => void;
  const firstEvent = new Promise<void>(resolve => { observed = resolve; });
  const stream = ModelRuntime.prototype.streamSimple;
  t.mock.method(ModelRuntime.prototype, 'streamSimple', function(this: ModelRuntime, ...args: Parameters<typeof stream>) {
    const options = args[2];
    assert.equal(options?.timeoutMs, timeout); assert.equal(options?.maxRetries, 0);
    return stream.call(this, args[0], args[1], { ...options, onProviderStreamEvent: async (data, model) => {
      await options?.onProviderStreamEvent?.(data, model); observed();
    } });
  });
  const progress = () => body.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ model: 'deepseek-flash',
    choices: [{ index: 0, delta: { content: 'progress ' }, finish_reason: null }] })}\n\n`));
  t.mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init); sent++;
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      body = controller; progress();
      request.signal.addEventListener('abort', () => { aborted = true; controller.error(new DOMException('Aborted', 'AbortError')); }, { once: true });
    } }), { headers: { 'content-type': 'text/event-stream' } });
  });
  const session = await f.create(createRoleFactory({ maxOutputTokens: 500, maxRequests: 2, requestTimeoutMs: 120000,
    designAuthorRequestTimeoutMs: 600000, artAuthorRequestTimeoutMs: 600000, authorThinkingLevel: { design: 'high' }, estimatedMaxCostMicroCny: 1000,
    env: { DEEPSEEK_API_KEY: 'offline-timeout-key' }, sessionFactory: config => createPiSession({ ...config,
      budget: { ...config.budget, afterResponse: async response => { responses.push(response); await config.budget.afterResponse(response); } } }) }), role);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = session.prompt('Keep streaming within the original absolute cap').then(() => undefined, error => error);
    await Promise.race([firstEvent, pending.then(error => assert.fail('Stream ended before first event: ' + error))]);
    t.mock.timers.tick(120001); assert.equal(aborted, false, 'The old 120000 ms cap must no longer abort this author.');
    const laterEvent = new Promise<void>(resolve => { observed = resolve; }); progress(); await laterEvent;
    t.mock.timers.tick(timeout - 120002); assert.equal(aborted, false);
    const lastEvent = new Promise<void>(resolve => { observed = resolve; }); progress(); await lastEvent;
    t.mock.timers.tick(1);
    assert.equal((await pending).code, 'timeout'); assert.equal(aborted, true); assert.equal(sent, 1);
    assert.equal(responses.length, 1); assert.equal(responses[0].outcome, 'unknown');
    assert.ok(Number.isFinite(responses[0].firstResponseMs)); assert.equal(responses[0].usage, undefined);
    await assert.rejects(session.prompt('retry'), { code: 'timeout' }); assert.equal(sent, 1);
  } finally { t.mock.timers.reset(); await session.close(); }
  const entry = (await f.controller.read()).ledger.entries[0];
  assert.equal(entry.status, 'unknown'); assert.equal(entry.reservedMicroCny, 1000); assert.equal(entry.settledMicroCny, 0);
  await assert.rejects(readFile(join(f.root, 'game/output.txt')), { code: 'ENOENT' });
});
