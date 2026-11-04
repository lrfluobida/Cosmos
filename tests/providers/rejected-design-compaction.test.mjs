import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { AgentSession, ModelRuntime } from '@earendil-works/pi-coding-agent';
import { lazyStream } from '@earendil-works/pi-ai';
import { createPiSession } from '../../src/providers/pi.ts';
import { requestInputBytes } from '../../src/providers/request-input.ts';
import { createGameDesignCheck } from '../../src/runtime/entrypoint-design-check.ts';
import { createGamePlanWriter } from '../../src/runtime/entrypoint-plan-authoring.ts';
import { authorBudgetFixture, estimate } from '../roles/author-output-budget.fixture.ts';

async function fixture(t, mode = 'rejected', enabled = true) {
  const f = await authorBudgetFixture(t, 1125000), path = 'authors/design/acceptance-plan.json';
  f.input.task.ownership.writePaths.push('authors/design/');
  f.input.task.context.tools.push('write-game-plan');
  const requirement = f.input.task.inputs[0], scenario = { viewport: { width: 1280, height: 720 }, steps: [
    { id: 'click', kind: 'locator-click', selector: '#target', timeoutMs: 1000 },
    { id: 'result', kind: 'assert', acceptanceId: 'AC-1', observation: { kind: 'text', selector: '#status' }, expected: '完成', timeoutMs: 1000 },
  ] };
  const draft = { ordinaryProfile: 'ordinary-design/1', brief: '鼠标点亮目标', questions: [], answers: {}, unsupported: [],
    acceptance: f.input.requirement.acceptance, experienceCriteria: [{ criterionId: 'readable', description: '状态清楚', steps: ['查看'], expected: '容易辨认' }] };
  const design = { summary: '原创鼠标游戏', implementationNotes: ['正常鼠标操作'], acceptanceMapping: { 'AC-1': '点击目标后显示完成' },
    experienceMapping: { readable: '状态清楚' }, characters: [{ id: 'target', purpose: '目标', states: ['idle'] }], audio: [] };
  await mkdir(join(f.root, 'authors/design'), { recursive: true });
  await writeFile(join(f.root, 'authors/design/design.json'), JSON.stringify(design), 'utf8');
  await writeFile(join(f.root, path), JSON.stringify({ formatVersion: 'ordinary-acceptance-plan/1', requirement, scenario }), 'utf8');
  const before = await readFile(join(f.root, path));
  const guard = async signal => signal.throwIfAborted();
  const check = createGameDesignCheck({ workspace: f.root, gameplayIds: ['AC-1'], ordinary: { draft, requirement }, preserveValidDraft: true, guard });
  const beforeFileWrite = async (...args) => {
    try { await check.beforeFileWrite(...args); }
    catch (error) {
      // Exact diagnostic text and a forged type name still cannot confer host identity.
      if (mode === 'spoof') throw Object.assign(new Error(error.message), { name: 'PreservedDesignDraftError' });
      throw error;
    }
  };
  const writer = await createGamePlanWriter({ workspace: f.root, requirement, guard, beforeFileWrite, afterFileWrite: check.afterFileWrite });
  const malformed = structuredClone(scenario); malformed.steps[1].acceptanceId = 'not-confirmed';
  malformed.padding = 'Rejected proposal size fixture. '.repeat(1130);
  let native, ordinary = 0, summaries = 0, budgetSet = false, error, network = 0;
  const dispatched = [], boundaries = [], charges = [];
  t.mock.method(globalThis, 'fetch', async () => { network++; throw new Error('NETWORK_DISABLED'); });
  const originalPrompt = AgentSession.prototype.prompt;
  t.mock.method(AgentSession.prototype, 'prompt', async function (...args) {
    native = this;
    const prepare = this.agent.prepareNextTurnWithContext;
    this.agent.prepareNextTurnWithContext = async (turn, signal) => {
      if (ordinary === 2 && !budgetSet) {
        budgetSet = true;
        assert.deepEqual(await readFile(join(f.root, path)), before, 'Rejected writes keep the accepted draft bytes.');
        const state = await f.controller.read(), spent = state.ledger.entries.reduce((sum, row) => sum + row.settledMicroCny, 0);
        await f.spend(750000 - spent - (mode === 'budget' ? 100 : 384972));
        if (mode === 'deadline') t.mock.method(Date, 'now', () => Date.parse(f.input.task.budget.originalDeadlineAt));
      }
      const prior = this.sessionManager.getEntries().filter(entry => entry.type === 'compaction').length;
      const value = await prepare(turn, signal);
      boundaries.push({ turn, prior, after: this.sessionManager.getEntries().filter(entry => entry.type === 'compaction').length });
      return value;
    };
    return originalPrompt.apply(this, args);
  });
  const originalCreate = ModelRuntime.create;
  t.mock.method(ModelRuntime, 'create', async function (...args) {
    const runtime = await originalCreate.apply(this, args);
    runtime.streamSimple = (model, context, options) => {
      const summary = native.isCompacting; if (summary) summaries++; else ordinary++;
      const request = { summary, inputBytes: requestInputBytes(context), maxOutputTokens: options.maxTokens, context: structuredClone(context) };
      dispatched.push(request);
      let content, stopReason = 'toolUse';
      if (summary) { content = [{ type: 'text', text: 'Synthetic context size fixture; retained draft and diagnostics remain authoritative. ' + 's'.repeat(4640) }]; stopReason = 'stop'; }
      else if (ordinary === 1) content = [{ type: 'toolCall', id: 'history', name: 'write', arguments: { path: 'game/history.txt', content: 'Prior synthetic work. ' + 'h'.repeat(65000) } }];
      else if (ordinary === 2) {
        content = [{ type: 'toolCall', id: 'rejected', name: 'write-game-plan', arguments: { operation: 'save', scenario: malformed } }];
        if (mode === 'outside') content = [{ type: 'toolCall', id: 'outside', name: 'read', arguments: { path: '../outside.txt' } }];
        if (mode === 'mixed') content.push({ type: 'toolCall', id: 'outside', name: 'read', arguments: { path: '../outside.txt' } });
        if (mode === 'provider') { content = []; stopReason = 'error'; }
      } else if (ordinary === 3) content = [{ type: 'toolCall', id: 'repair', name: 'write-game-plan', arguments: { operation: 'save', scenario } }];
      else { content = [{ type: 'text', text: '{"summary":"SOURCE fixture only; pending capture and review","remaining":[],"uncertainty":[]}' }]; stopReason = 'stop'; }
      return lazyStream(model, async () => (async function* () {
        // Summary charges its entire reservation: feasibility does not depend on a cheap fake summary.
        const usage = { input: summary ? request.inputBytes : 1, output: summary ? options.maxTokens : 1, cacheRead: 0, cacheWrite: 0,
          totalTokens: summary ? request.inputBytes + options.maxTokens : 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
        await options.onProviderStreamEvent({ model: 'deepseek-flash', usage: { prompt_tokens: usage.input, completion_tokens: usage.output } }, model);
        yield { type: 'done', reason: stopReason, message: { role: 'assistant', content, api: 'openai-completions', provider: 'deepseek', model: 'deepseek-flash',
          stopReason, ...(stopReason === 'error' ? { errorMessage: 'Synthetic provider failure' } : {}), timestamp: Date.now(), usage } };
      })());
    };
    return runtime;
  });
  const role = await f.create({ ordinaryDesignBudgetCompaction: true, ordinaryDesignBudgetPolicy: 'review-reserve/1',
    ordinaryDesignRejectedWriteCompaction: enabled ? true : undefined,
    beforeDesignFileWrite: () => beforeFileWrite, hostTools: async () => [writer],
    sessionFactory: config => createPiSession({ ...config, budget: { ...config.budget,
      beforeRequest: async request => { charges.push(request); await config.budget.beforeRequest(request); } } }) });
  try { await role.prompt('Exercise only the synthetic design rejection boundary.'); } catch (caught) { error = caught; }
  const state = await f.controller.read();
  assert.equal(network, 0);
  return { f, before, path, native, dispatched, boundaries, charges, state, error, ordinary, summaries };
}

test('COS175 trusted preserved-draft rejection compacts before ordinary repair within the review reserve', async t => {
  const r = await fixture(t);
  assert.equal(r.error, undefined);
  assert.equal(r.summaries, 1, 'A rejected large draft must receive the existing budget-pressure compaction.');
  const boundary = r.boundaries.find(row => row.turn.toolResults.some(result => result.toolCallId === 'rejected'));
  assert.equal(boundary.after, boundary.prior + 1);
  const next = r.dispatched.findLast(row => !row.summary && row.context.messages.some(message => message.role === 'toolResult' && message.toolCallId === 'rejected'));
  const rejected = next.context.messages.find(message => message.role === 'toolResult' && message.toolCallId === 'rejected');
  assert.equal(rejected.isError, true); assert.match(JSON.stringify(rejected.content), /current draft preserved/);
  assert.deepEqual(rejected, boundary.turn.toolResults.find(result => result.toolCallId === 'rejected'));
  const latestCall = boundary.turn.message.content.find(block => block.type === 'toolCall' && block.id === 'rejected');
  assert.deepEqual(next.context.messages.flatMap(message => message.role === 'assistant' ? message.content : []).find(block => block.id === 'rejected'), latestCall);
  const journal = r.native.sessionManager.getEntries().filter(entry => entry.type === 'message').map(entry => entry.message);
  assert.ok(journal.some(message => message.role === 'assistant' && message.content.some(block => block.type === 'toolCall' && block.id === 'history')));
  assert.ok(journal.some(message => JSON.stringify(message) === JSON.stringify(boundary.turn.message)));
  assert.ok(next.context.messages.some(message => message.role === 'assistant' && message.content.some(block => block.type === 'toolCall' && block.id === 'rejected' && block.arguments.scenario.padding.length > 35000)));
  assert.ok(next.context.messages.some(message => message.role === 'toolResult' && message.toolCallId === 'repair' && !message.isError));
  assert.deepEqual(JSON.parse((await readFile(join(r.f.root, r.path))).toString()), JSON.parse(r.before.toString()));
  assert.ok(r.state.ledger.entries.every(row => row.status === 'settled' && !row.reservedMicroCny && !row.unknown));
  assert.ok(r.state.ledger.entries.reduce((sum, row) => sum + row.settledMicroCny, 0) <= 750000);
  assert.ok(r.charges.every(request => request.estimatedMaxCostMicroCny === estimate(request)));
  const summary = r.dispatched.find(row => row.summary), continued = r.dispatched[r.dispatched.indexOf(summary) + 1];
  assert.ok(estimate({ ...summary, maxOutputTokens: 8192 }) + estimate({ ...continued, maxOutputTokens: 8192 }) <= 384972);
  t.diagnostic(`SOURCE only: rejected proposal size fixture, summary input ${summary.inputBytes} B; next input ${continued.inputBytes} B; full summary reservation settled. No generated game claim.`);
});

for (const mode of ['outside', 'mixed', 'spoof', 'provider', 'budget', 'deadline']) test(`COS175 ${mode} cannot use rejected-write compaction authority`, async t => {
  const r = await fixture(t, mode);
  if (['provider', 'budget', 'deadline'].includes(mode)) { assert.equal(r.summaries, 0); assert.ok(r.error); assert.equal(r.ordinary, 2); }
  else {
    const boundary = r.boundaries.find(row => row.turn.toolResults.some(result => result.isError));
    assert.ok(boundary); assert.equal(boundary.after, boundary.prior);
    if (mode === 'spoof') assert.match(JSON.stringify(boundary.turn.toolResults), /current draft preserved/);
  }
});

test('COS175 omitted trusted selection preserves the non-error-only compaction boundary', async t => {
  const r = await fixture(t, 'rejected', false);
  const boundary = r.boundaries.find(row => row.turn.toolResults.some(result => result.toolCallId === 'rejected'));
  assert.equal(boundary.after, boundary.prior);
});
