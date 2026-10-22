import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, type TestContext } from 'node:test';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { createPiSession } from '../../src/providers/pi.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';

export const questions = [{ id: 'win', prompt: '何时获胜？' }];
export const proposal = { acceptance: [{ acceptanceId: 'win', description: '点击目标后获胜', steps: ['点击目标'], expected: '胜利', evidenceKinds: ['test_report'] }],
  scenario: { viewport: { width: 1280, height: 720 }, steps: [
    { id: 'click', kind: 'locator-click', selector: '#target', timeoutMs: 1000 },
    { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 },
  ] }, unsupported: [] };
export type Reply = 'length' | 'unknown' | 'draft' | 'questions' | 'invalid' | 'error';

/** Actual Pi adapter and budget hooks; all transport is an in-memory synthetic stream. */
export function fakeInterviewSdk(t: TestContext, replies: Reply[], legacyFirstDraft = false, draftProposal: unknown = proposal) {
  const bodies: any[] = [], configs: { context?: string; systemPrompt: string; maxOutputTokens: number; maxRequests: number; tools: string[]; thinkingLevel?: string }[] = [];
  const estimates: { inputBytes: number; maxOutputTokens: number; estimate: number }[] = [];
  let drafts = 0;
  const fetchMock = mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    assert.equal(new URL(request.url).origin, 'https://api.deepseek.com');
    bodies.push(JSON.parse(await request.text()));
    const reply = replies.shift(); assert.ok(reply, 'Unexpected extra transport');
    if (reply === 'error') return new Response(JSON.stringify({ error: { message: 'Synthetic provider error' } }), { status: 400, headers: { 'content-type': 'application/json' } });
    const usage = reply === 'questions' ? { prompt_tokens: 1068, completion_tokens: 1292, completion_tokens_details: { reasoning_tokens: 811 } }
      : reply === 'length' ? { prompt_tokens: 2904, prompt_cache_hit_tokens: 768, completion_tokens: 8192, completion_tokens_details: { reasoning_tokens: 8192 } }
      : { prompt_tokens: 10, completion_tokens: 10 };
    const chunk = { id: 'offline-response', model: 'deepseek-flash',
      choices: [{ index: 0, delta: reply === 'length' ? { reasoning_content: 'Synthetic reasoning placeholder.' }
        : { content: JSON.stringify(reply === 'questions' ? { questions } : reply === 'invalid' ? { invalid: true } : typeof draftProposal === 'function' ? draftProposal() : draftProposal) },
        finish_reason: reply === 'length' ? 'length' : 'stop' }],
      ...(reply === 'unknown' ? {} : { usage }) };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  t.after(() => fetchMock.mock.restore());
  const sessionFactory = async (config: PiSessionOptions) => {
    const phase = JSON.parse(config.context!).input.phase;
    const maxOutputTokens = legacyFirstDraft && phase === 'draft' && ++drafts === 1 ? 8192 : config.maxOutputTokens;
    configs.push({ context: config.context, systemPrompt: config.systemPrompt, maxOutputTokens, maxRequests: config.maxRequests, tools: config.tools.map(tool => tool.name), thinkingLevel: config.thinkingLevel });
    const estimate = config.estimatedMaxCostMicroCny;
    return createPiSession({ ...config, maxOutputTokens, env: { DEEPSEEK_API_KEY: 'offline-fixture' }, estimatedMaxCostMicroCny: request => {
      const value = typeof estimate === 'function' ? estimate(request) : estimate;
      estimates.push({ inputBytes: request.inputBytes, maxOutputTokens: request.maxOutputTokens, estimate: value }); return value;
    } });
  };
  return { bodies, configs, estimates, sessionFactory };
}

export async function recoveryFixture(t: TestContext, replies: Reply[], grant = 250_000, maxRequests = 8) {
  const parent = await mkdtemp(join(tmpdir(), 'cos110-interview-')), root = join(parent, '原运行');
  const controller = await IntakeController.create({ root, runId: 'same-run', ledgerId: 'same-ledger', specVersion: '1.0',
    limitMicroCny: 5_000_000, durationMs: 1_800_000, interviewTaskId: 'intake', maxRequests, allocations: [{ taskId: 'intake', amountMicroCny: grant }] });
  t.after(async () => { await controller.close(); await removeOwned(tmpdir(), parent); });
  const sdk = fakeInterviewSdk(t, replies);
  const options = { controller, roundId: 'draft-1', brief: '点击目标小游戏', questions, answers: { win: '点击后显示胜利' },
    maxOutputTokens: 8192, requestTimeoutMs: 5000, estimatedMaxCostMicroCny: (r: { inputBytes: number; maxOutputTokens: number }) => r.inputBytes * 2 + r.maxOutputTokens * 8,
    capabilities: 'Normal mouse input and visible assertions.', sessionFactory: sdk.sessionFactory };
  return { root, controller, options, ...sdk };
}
