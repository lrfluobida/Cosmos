import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AgentSession, ModelRuntime, convertToLlm } from '@earendil-works/pi-coding-agent';
import { lazyStream, normalizeContext } from '@earendil-works/pi-ai';
import { authorBudgetFixture, estimate } from '../roles/author-output-budget.fixture.ts';
import { createPiSession } from '../../src/providers/pi.ts';
import { requestInputBytes } from '../../src/providers/request-input.ts';

const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

/** Real factory, budget, scoped file tools and pinned SDK. Only transport supplies synthetic responses. */
export async function ordinaryDesignCompactionFixture(t, mode = 'success', settings = {}) {
  const f = await authorBudgetFixture(t), dispatches = [], admissions = [], settlements = [], preflights = [], selections = [], boundaries = [], events = [];
  if (mode === 'noop') f.input.task.context.rules.push('Synthetic fixed context ' + 's'.repeat(120000));
  await mkdir(join(f.root, 'requirements'), { recursive: true });
  const sourceText = '完整冻结来源。中文、反斜杠\\与引号"。'.repeat(400);
  await writeFile(join(f.root, 'requirements/v1.json'), sourceText, 'utf8');
  await writeFile(join(f.root, 'outside.txt'), 'This is outside the role read scope.', 'utf8');
  let native, config, role, ordinary = 0, summaries = 0, networkCalls = 0, sdkCap, beforeCompaction, closing, error, result;
  const caller = new AbortController(), skipMode = mode === 'skip' || mode.startsWith('skip-');
  let prior = settings.history === true, mainStarted = !prior, sourceRead = false;
  const projected = () => normalizeContext({ messages: convertToLlm(native.sessionManager.buildSessionProjection().messages) });
  const compactions = () => native.sessionManager.getEntries().filter(entry => entry.type === 'compaction');
  const spendTo = async available => {
    const state = await f.controller.read(), spent = state.ledger.entries.reduce((sum, row) => sum + row.settledMicroCny + row.reservedMicroCny, 0);
    const amount = state.ledger.limitMicroCny - spent - available;
    if (amount > 0) await f.spend(amount, 'synthetic-pressure-' + state.ledger.entries.length);
  };
  t.mock.method(globalThis, 'fetch', async () => { networkCalls++; throw new Error('NETWORK_DISABLED'); });
  if (mode === 'skip-missing-event') {
    const subscribe = AgentSession.prototype.subscribe;
    t.mock.method(AgentSession.prototype, 'subscribe', function (listener) {
      return subscribe.call(this, event => { if (event.type !== 'compaction_end') listener(event); });
    });
  }
  const originalPrompt = AgentSession.prototype.prompt;
  t.mock.method(AgentSession.prototype, 'prompt', async function (...args) {
    if (!native) {
      native = this;
      const stream = native.agent.streamFunction;
      native.agent.streamFunction = (model, context, options) => {
        if (native.isCompacting) sdkCap = options.maxTokens;
        return stream(model, context, options);
      };
      native.subscribe(event => {
        if (event.type === 'compaction_start') beforeCompaction = { leaf: native.sessionManager.getLeafId(), projection: JSON.stringify(projected()), checkpoints: compactions().length };
        if (event.type === 'compaction_end') events.push({ ...event, projectionUnchanged: JSON.stringify(projected()) === beforeCompaction.projection,
          leafUnchanged: native.sessionManager.getLeafId() === beforeCompaction.leaf, checkpoints: compactions().length });
      });
      const prepare = native.agent.prepareNextTurnWithContext;
      native.agent.prepareNextTurnWithContext = async (turn, signal) => {
        const n = ordinary - (prior ? 1 : 0);
        if (n === 2) await spendTo(507835);
        const context = projected(), boundary = { inputBytes: requestInputBytes(context), ordinary, summaries, checkpoints: compactions().length,
          before: JSON.stringify(context), leaf: native.sessionManager.getLeafId() };
        boundaries.push(boundary);
        const value = await prepare(turn, signal);
        boundary.after = JSON.stringify(projected()); boundary.afterCheckpoints = compactions().length;
        return value;
      };
    }
    return originalPrompt.apply(this, args);
  });
  const originalCreate = ModelRuntime.create;
  t.mock.method(ModelRuntime, 'create', async function (...args) {
    const runtime = await originalCreate.apply(this, args);
    runtime.streamSimple = (model, context, options) => {
      const summary = native?.isCompacting ?? false;
      if (summary) summaries++; else ordinary++;
      const observed = { kind: summary ? 'summary' : 'ordinary', inputBytes: requestInputBytes(context), cap: options.maxTokens,
        ...(summary ? { sdkCap } : {}), context: JSON.stringify(context) };
      dispatches.push(observed);
      if (!summary) {
        assert.ok(observed.context.includes(JSON.stringify(config.context).slice(1, -1)), 'The complete original authority packet survives compaction.');
        assert.deepEqual(native.getActiveToolNames().sort(), ['edit', 'read', 'write']);
        sourceRead ||= context.messages.some(message => message.role === 'toolResult' && JSON.stringify(message).includes('完整冻结来源'));
      }
      let content, stopReason = 'stop';
      if (summary) {
        content = [{ type: 'text', text: settings.summaryText ?? '原生摘要：继续读取原授权路径；保留中文、反斜杠\\和引号"。' }];
        if (mode === 'toolcall') { stopReason = 'toolUse'; content = [{ type: 'toolCall', id: 'illegal-summary', name: 'write', arguments: { path: 'game/illegal.txt', content: 'must not execute' } }]; }
        if (mode === 'sdk-error') stopReason = 'error';
        if (mode === 'length') stopReason = 'length';
      } else if (!mainStarted) content = [{ type: 'text', text: 'Earlier history. '.repeat(500) }];
      else {
        const n = ordinary - (prior ? 1 : 0);
        if (n === settings.finalAt) content = [{ type: 'text', text: JSON.stringify({ summary: '合成有界交接', remaining: [], uncertainty: [] }) }];
        else if (n <= 2) {
          stopReason = 'toolUse';
          content = [{ type: 'toolCall', id: 'write-' + n, name: 'write', arguments: { path: 'game/plan.txt', content: '合成计划第' + n + '版。' + 'p'.repeat(mode === 'noop' ? 50 : 55000) } }];
        } else if (n === 3) {
          stopReason = 'toolUse'; content = [{ type: 'toolCall', id: 'read-source', name: 'read', arguments: { path: 'requirements/v1.json' } }];
        } else if (n === 4) {
          stopReason = 'toolUse'; content = [{ type: 'toolCall', id: 'write-final', name: 'write', arguments: { path: 'game/note.txt', content: 'Synthetic author output. 中文保持。' } }];
        } else content = [{ type: 'text', text: JSON.stringify({ summary: '合成作者交接，仍待验证与独审', remaining: [], uncertainty: [] }) }];
      }
      return lazyStream(model, async () => (async function* () {
        if (!(summary && mode === 'unknown')) await options.onProviderStreamEvent({ model: 'deepseek-flash', usage: { prompt_tokens: 1, completion_tokens: 1 } }, model);
        yield { type: 'done', reason: stopReason, message: { role: 'assistant', content, api: 'openai-completions', provider: 'deepseek',
          model: 'deepseek-flash', stopReason, timestamp: Date.now(), usage } };
      })());
    };
    return runtime;
  });
  role = await f.create({ ordinaryDesignBudgetCompaction: mode === 'disabled' ? undefined : true,
    maxRequests: settings.maxRequests ?? 32, authorThinkingLevel: { design: 'off' },
    estimatedMaxCostMicroCny: request => (skipMode || mode === 'split-skip' && request.inputBytes > 20000) && request.maxOutputTokens === 8192 && request.inputBytes < 100000 ? 1000000 : estimate(request),
    afterFileWrite: async (_input, write) => write.path === 'game/plan.txt' && mode !== 'noop' ? '合成只读反馈：仍须按原要求逐项自检。' + 'f'.repeat(4000) : undefined,
    sessionFactory: async supplied => {
      config = supplied;
      return createPiSession({ ...supplied,
        ...(supplied.requestCompactionAdmission ? { requestCompactionAdmission: async (input, signal) => {
          const observation = { ...input, admissions: admissions.length, settlements: settlements.length, dispatches: dispatches.length };
          preflights.push(observation);
          if (mode === 'floor-unaffordable') await spendTo(100);
          observation.result = await supplied.requestCompactionAdmission(input, signal);
          if (mode === 'skip-cancel') caller.abort();
          if (mode === 'skip-close') closing = role.close();
          if (mode === 'skip-deadline') t.mock.method(Date, 'now', () => Date.parse(f.input.task.budget.originalDeadlineAt));
          if (mode === 'skip-leaf') native.sessionManager.appendCustomEntry('unexpected-entry', { changed: true });
          if (mode === 'skip-projection') native.sessionManager.appendMessage({ role: 'user', content: 'unexpected context change', timestamp: Date.now() });
          return observation.result;
        } } : {}),
        requestOutputLimit: async (request, signal) => {
          selections.push({ ...request, kind: native?.isCompacting ? 'summary' : 'ordinary' });
          return supplied.requestOutputLimit(request, signal);
        }, budget: {
          beforeRequest: async request => {
            admissions.push({ ...request, kind: native?.isCompacting ? 'summary' : 'ordinary' });
            if (native?.isCompacting && mode === 'reserve-race') await spendTo(1);
            await supplied.budget.beforeRequest(request);
          },
          afterResponse: async response => {
            settlements.push({ ...response, kind: native?.isCompacting ? 'summary' : 'ordinary' }); await supplied.budget.afterResponse(response);
            if (native?.isCompacting && mode === 'split-floor-unaffordable') await spendTo(100);
          },
        } });
    } });
  if (prior) await role.prompt('An earlier real SDK turn retained as history.');
  mainStarted = true;
  try { result = await role.prompt('按完整中文来源分块编写合成计划，读取来源后交接。', { signal: caller.signal }); } catch (caught) { error = { code: caught.code, message: caught.message }; }
  await closing;
  const state = await f.controller.read();
  assert.equal(networkCalls, 0);
  return { f, role, native, config, state, report: { error, result, ordinary, summaries, sourceRead, networkCalls, dispatches, admissions, settlements, preflights, selections, boundaries, events, compactions: compactions().length },
    readOutput: () => readFile(join(f.root, 'game/note.txt'), 'utf8') };
}
