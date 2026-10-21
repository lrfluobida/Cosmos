import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { lazyStream } from '@earendil-works/pi-ai';

export const { createPiSession } = await import(new URL(process.env.COSMOS_OUTPUT_CAP_COMPILED === '1'
  ? '../../dist/providers/pi.js' : '../../src/providers/pi.ts', import.meta.url));
export const { validationReservation } = await import(new URL(process.env.COSMOS_OUTPUT_CAP_COMPILED === '1'
  ? '../../dist/runtime/validation-validation.js' : '../../src/runtime/validation-validation.ts', import.meta.url));

export function syntheticContext(bytes = 405672, hasImages = false) {
  const context = { messages: [{ role: 'user', content: [{ type: 'text', text: '' },
    ...(hasImages ? [{ type: 'image', data: 'AA==', mimeType: 'image/png' }] : [])], timestamp: 0 }] };
  context.messages[0].content[0].text = 'x'.repeat(bytes - Buffer.byteLength(JSON.stringify(context)));
  assert.equal(Buffer.byteLength(JSON.stringify(context)), bytes);
  return context;
}

/** Real Pi admission/dispatch boundary; fake provider, synthetic inputs and zero network. */
export async function outputLimitFixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-output-cap-')), workspace = join(root, 'workspace');
  await mkdir(workspace);
  const admissions = [], settlements = [], dispatches = []; let runtime, network = 0;
  const nativeCreate = ModelRuntime.create;
  t.mock.method(globalThis, 'fetch', async () => { network++; throw new Error('NETWORK_DISABLED'); });
  t.mock.method(ModelRuntime, 'create', async function(...args) {
    runtime = await nativeCreate.apply(this, args);
    runtime.streamSimple = (model, context, config) => {
      dispatches.push({ context: structuredClone(context), maxTokens: config.maxTokens, maxRetries: config.maxRetries });
      return lazyStream(model, async () => (async function* () {
        await config.onProviderStreamEvent({ model: 'deepseek-flash', usage: { prompt_tokens: 1, completion_tokens: 1 } }, model);
        const message = { role: 'assistant', content: [], api: 'openai-completions', provider: 'deepseek', model: 'deepseek-flash',
          stopReason: options.stopReason ?? 'stop', timestamp: 0,
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
        yield { type: 'done', reason: message.stopReason, message };
      })());
    };
    return runtime;
  });
  const sessions = [];
  t.after(async () => { for (const session of sessions) await session.close(); assert.equal(network, 0); await rm(root, { recursive: true, force: true }); });
  const config = { workspace, stateDirectory: join(root, 'session'), systemPrompt: 'Synthetic fixture', context: 'Fixed synthetic context', tools: [],
    env: { DEEPSEEK_API_KEY: 'offline-synthetic-key' }, maxOutputTokens: 65536, maxRequests: 4, requestTimeoutMs: 1000,
    estimatedMaxCostMicroCny: validationReservation,
    budget: { beforeRequest: async request => { admissions.push(request); }, afterResponse: async response => { settlements.push(response); } } };
  return { root, workspace, config, admissions, settlements, dispatches,
    create: async overrides => { const session = await createPiSession({ ...config, ...overrides }); sessions.push(session); return session; },
    /** @param {import('@earendil-works/pi-ai').Context} [context] */
    dispatch: async (context = syntheticContext()) => {
      for await (const event of runtime.streamSimple(runtime.getModel('deepseek', 'deepseek-flash'), context, {})) {
        if (event.type === 'error') throw new Error(event.error.errorMessage);
      }
    } };
}
