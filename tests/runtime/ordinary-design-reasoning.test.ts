import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { AgentSession, ModelRuntime } from '@earendil-works/pi-coding-agent';
import { createPiSession } from '../../src/providers/pi.ts';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';

test('ordinary initial and unique revision inherit low in native compaction with total-output charging', async t => {
  const requests: any[] = [], summaries: any[] = [], configs: any[] = [], timeouts: any[] = [];
  let native: AgentSession, active: any, round = 0;
  const prompt = AgentSession.prototype.prompt;
  t.mock.method(AgentSession.prototype, 'prompt', function(this: AgentSession, ...args: Parameters<typeof prompt>) {
    native = this; return prompt.apply(this, args);
  });
  const stream = ModelRuntime.prototype.streamSimple;
  t.mock.method(ModelRuntime.prototype, 'streamSimple', function(this: ModelRuntime, ...args: Parameters<typeof stream>) {
    const options = args[2];
    assert.equal(options?.timeoutMs, 600000); assert.equal(options?.maxRetries, 0);
    timeouts.push({ taskId: JSON.parse(active.context).taskId, summary: native.isCompacting });
    return stream.apply(this, args);
  });
  const f = await ordinaryHostFixture(t, { productionDefault: true, revisionPolicy: 'independent-review/2', fault: 'review',
    limits: { limitMicroCny: 4480000, durationMs: 1800000 }, sessionFactory: async (config, fallback) => {
      const packet = JSON.parse(config.context);
      if (packet.role !== 'design') return fallback;
      configs.push(config);
      const session = await createPiSession({ ...config, env: { DEEPSEEK_API_KEY: 'offline-cos176' } });
      return { ...session, prompt: async (...args) => {
        if (packet.taskId === 'design-task') await fallback.prompt(...args);
        active = config; round = 0;
        const result = await session.prompt(...args);
        summaries.push(...native.sessionManager.getEntries().filter(entry => entry.type === 'compaction')
          .map(entry => ({ taskId: packet.taskId, entry })));
        return result;
      } };
    } });
  t.mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init), body = JSON.parse(await request.text());
    const packet = JSON.parse(active.context), summary = native.isCompacting;
    const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), entry = state.ledger.entries.at(-1);
    assert.equal(body.model, 'deepseek-flash');
    assert.deepEqual(body.thinking, { type: 'enabled' }); assert.equal(body.reasoning_effort, 'low');
    assert.equal(entry.status, 'reserved'); assert.equal(entry.taskId, packet.taskId);
    assert.equal(state.requests.at(-1).requestId, entry.requestId);
    assert.ok(entry.reservedMicroCny > body.max_tokens * 8);
    assert.ok(body.max_tokens <= (summary ? 8192 : 32768));
    assert.ok(body.max_tokens >= 8192);
    requests.push({ taskId: packet.taskId, summary, cap: body.max_tokens, requestId: entry.requestId });
    if (!summary) round++;
    let delta: any, finish = 'stop';
    if (summary) delta = { content: 'Synthetic summary only. The fixed requirements, actual files and independent findings remain authoritative; continue the original scoped task.' };
    else if (round <= 3) {
      const revise = packet.taskId !== 'design-task' && round === 3;
      const args = revise ? { path: 'authors/design/design.json', edits: [{ oldText: '原创鼠标游戏', newText: '原创鼠标游戏，点击后明确显示完成' }] }
        : { path: packet.inputs.find((ref: any) => ref.artifactId === 'requirement-draft').location, offset: null, limit: null };
      // Synthetic context pressure exercises the existing budget selector, not a new compaction override.
      delta = { content: 'Synthetic bounded history. ' + 'h'.repeat(100000), tool_calls: [{ index: 0, id: `source-${round}`,
        type: 'function', function: { name: revise ? 'edit' : 'read', arguments: JSON.stringify(args) } }] }; finish = 'tool_calls';
    } else if (round === 4) {
      delta = { tool_calls: [{ index: 0, id: 'self-check', type: 'function', function: { name: 'validate-game-design', arguments: '{}' } }] }; finish = 'tool_calls';
    } else delta = { content: JSON.stringify({ summary: 'Synthetic transport fixture; capture and independent review remain required.', remaining: [], uncertainty: [] }) };
    const chunk = { id: 'offline-cos176', model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason: finish }],
      usage: { prompt_tokens: 30, completion_tokens: 1000, completion_tokens_details: { reasoning_tokens: 600 }, total_tokens: 1030 } };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  const result: any = await f.execute(), state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(configs[0].thinkingLevel, 'low');
  assert.equal(result.outcome, 'incomplete'); assert.match(result.gaps.join(' '), /design_revision_limit/);
  assert.deepEqual(state.tasks.map((task: any) => [task.taskId, task.state]), [['design-task', 'needs_changes'], ['design-task-revision', 'needs_changes']]);
  assert.deepEqual(configs.map(config => [JSON.parse(config.context).taskId, config.thinkingLevel]), [['design-task', 'low'], ['design-task-revision', 'low']]);
  for (const config of configs) {
    const packet = JSON.parse(config.context);
    assert.equal(config.maxOutputTokens, 32768); assert.equal(config.maxRequests, 64); assert.equal(config.requestTimeoutMs, 600000);
    assert.equal(config.compactionKeepRecentTokens, 8000); assert.equal(packet.budget.originalDeadlineAt, state.run.originalDeadlineAt);
    assert.ok(summaries.some(summary => summary.taskId === packet.taskId), 'Both original and revision must perform real native compaction.');
    assert.ok(requests.some(request => request.taskId === packet.taskId && request.summary));
    assert.ok(timeouts.some(request => request.taskId === packet.taskId && request.summary));
    assert.ok(timeouts.some(request => request.taskId === packet.taskId && !request.summary));
  }
  assert.equal(timeouts.length, requests.length);
  assert.equal(state.ledger.limitMicroCny, 4480000); assert.equal(state.ledger.entries.length, requests.length);
  assert.ok(state.ledger.entries.every((entry: any) => entry.status === 'settled' && entry.reservedMicroCny === 0 && !entry.unknown));
  for (const request of requests) {
    assert.equal(state.ledger.entries.find((entry: any) => entry.requestId === request.requestId).settledMicroCny, 8060,
      'Total completion tokens already include reasoning: 30 * 2 + 1000 * 8, with no second reasoning charge.');
  }
  assert.equal(f.packets.filter(packet => packet.role === 'reviewer').length, 2);
  assert.ok(f.packets.filter(packet => packet.role === 'reviewer').every(packet => packet.ownership.writePaths.length === 0));
  assert.equal(f.packets.some(packet => ['art', 'coding'].includes(packet.role)), false); assert.equal(f.plays.length, 0);
  t.diagnostic(JSON.stringify({ requests: requests.map(({ requestId, ...request }) => request), compactions: summaries.length,
    settledMicroCny: state.ledger.entries.reduce((sum: number, entry: any) => sum + entry.settledMicroCny, 0) }));
});
