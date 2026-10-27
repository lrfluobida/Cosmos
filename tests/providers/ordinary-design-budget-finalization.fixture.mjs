import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AgentSession, ModelRuntime } from '@earendil-works/pi-coding-agent';
import { lazyStream } from '@earendil-works/pi-ai';
import { authorBudgetFixture } from '../roles/author-output-budget.fixture.ts';
import { createPiSession } from '../../src/providers/pi.ts';
import { requestInputBytes } from '../../src/providers/request-input.ts';

/** Real role factory, scoped tools, SDK and TEMP accounting; only model transport is synthetic. */
export async function finalizationFixture(t, settings = {}) {
  const f = await authorBudgetFixture(t, 1125000), dispatches = [], selections = [], admissions = [];
  const workAt = settings.workAt ?? 30;
  let native, role, error, finalizing = false;
  const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('NETWORK_DISABLED'); });
  const prompt = AgentSession.prototype.prompt;
  t.mock.method(AgentSession.prototype, 'prompt', function (...args) { native = this; return prompt.apply(this, args); });
  const create = ModelRuntime.create;
  t.mock.method(ModelRuntime, 'create', async function (...args) {
    const runtime = await create.apply(this, args);
    runtime.streamSimple = (model, context, options) => {
      const observation = { inputBytes: requestInputBytes(context), cap: options.maxTokens, tools: context.tools, activeTools: native.getActiveToolNames(), callableTools: native.getCallableToolNames() };
      dispatches.push(observation);
      const content = finalizing ? [{ type: 'text', text: settings.reply ?? JSON.stringify({ summary: 'Only synthetic source output; checks pending.', remaining: [], uncertainty: [] }) }]
        : [{ type: 'toolCall', id: 'write-plan', name: 'write', arguments: { path: 'game/plan.txt', content: 'x'.repeat(dispatches.length === workAt ? 65000 : 1) } }];
      const stopReason = !finalizing && settings.earlyFailure === 'length' ? 'length' : finalizing ? 'stop' : 'toolUse';
      return lazyStream(model, async () => (async function* () {
        const measured = finalizing && settings.peak ? { ...usage, input: observation.inputBytes, output: observation.cap, totalTokens: observation.inputBytes + observation.cap } : usage;
        if (settings.earlyFailure !== 'unknown') await options.onProviderStreamEvent({ model: 'deepseek-flash', usage: { prompt_tokens: measured.input, completion_tokens: measured.output } }, model);
        yield { type: 'done', reason: stopReason, message: { role: 'assistant', content, api: 'openai-completions', provider: 'deepseek', model: 'deepseek-flash', stopReason, timestamp: Date.now(), usage: measured } };
      })());
    }; return runtime;
  });
  role = await f.create({ ordinaryDesignBudgetCompaction: true, ordinaryDesignBudgetPolicy: 'review-reserve/1',
    ...(settings.legacy ? {} : { ordinaryDesignFinalizationPolicy: 'budget-followup/1' }),
    authorMaxRequests: { design: 32 }, authorThinkingLevel: { design: 'off' }, sessionFactory: async config => createPiSession({ ...config,
      ...(settings.summaryBudget ? { requestCompactionAdmission: async (input, signal) => {
        const state = await f.controller.read(); await f.spend(1125000 - state.run.fees.settledMicroCny - 1, 'summary-race');
        return config.requestCompactionAdmission(input, signal); } } : {}),
      requestOutputLimit: async (request, signal) => { selections.push(request); const cap = await config.requestOutputLimit(request, signal);
        if (settings.race && dispatches.length === workAt && !finalizing) await f.spend(518011 - workAt * 10); return cap; },
      budget: { beforeRequest: async request => { admissions.push(request); await config.budget.beforeRequest(request); }, afterResponse: async response => { await config.budget.afterResponse(response); if (dispatches.length === workAt && !finalizing && !settings.race) await f.spend(518011 - workAt * 10); } },
    }) });
  try { await role.prompt('Write the complete synthetic plan, then report the required proposal.'); } catch (caught) { error = caught; }
  return { ...f, role, error, dispatches, selections, admissions, native,
    finalize: async text => { finalizing = true; return role.finalizeBudget(error, text); },
    nativeEntries: async () => (await readFile(native.sessionManager.getSessionFile(), 'utf8')).trim().split('\n').map(line => JSON.parse(line)) };
}
