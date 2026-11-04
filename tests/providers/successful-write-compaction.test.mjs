import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { AgentSession, ModelRuntime } from '@earendil-works/pi-coding-agent';
import { lazyStream } from '@earendil-works/pi-ai';
import { createPiSession } from '../../src/providers/pi.ts';
import { requestInputBytes } from '../../src/providers/request-input.ts';
import { authorBudgetFixture, estimate } from '../roles/author-output-budget.fixture.ts';
import { successfulWriteNote, summaryWithoutThinking } from '../../src/providers/successful-write-compaction.ts';
import { createGameDesignWriter } from '../../src/runtime/entrypoint-design-authoring.ts';
import { createGamePlanWriter } from '../../src/runtime/entrypoint-plan-authoring.ts';
import { createWorkspaceTools, PreservedDesignDraftError } from '../../src/providers/workspace-tools.ts';
import { createRoleFactory } from '../../src/roles/factory.ts';
import { options as factoryOptions } from '../roles/author-output-budget.fixture.ts';

const thinking = 'private size fixture '.repeat(4350);
const written = 'Observable saved design fixture. '.repeat(590);
const summaryText = 'Synthetic summary size fixture. Original files remain authoritative. ' + 's'.repeat(3380);

async function fixture(t, mode = 'success') {
  const f = await authorBudgetFixture(t, 749250);
  let native, ordinary = 0, summaries = 0, network = 0, error, summaryPrefix;
  const dispatched = [], charges = [], controller = new AbortController();
  await mkdir(join(f.root, 'game'), { recursive: true });
  await writeFile(join(f.root, 'game/read.txt'), 'Existing read-only fact.', 'utf8');
  if (mode === 'rejected') await writeFile(join(f.root, 'game/draft.txt'), 'Original valid draft.', 'utf8');
  if (mode === 'structured') { f.input.task.context.tools.push('write-game-design'); f.input.task.ownership.writePaths.push('authors/design/design.json'); }
  if (mode === 'spoof') f.input.task.context.tools.push('pretend-save');
  t.mock.method(globalThis, 'fetch', async () => { network++; throw new Error('NETWORK_DISABLED'); });
  const originalPrompt = AgentSession.prototype.prompt;
  t.mock.method(AgentSession.prototype, 'prompt', async function (...args) { native = this; return originalPrompt.apply(this, args); });
  const originalCreate = ModelRuntime.create;
  t.mock.method(ModelRuntime, 'create', async function (...args) {
    const runtime = await originalCreate.apply(this, args);
    runtime.streamSimple = (model, context, options) => {
      const summary = native.isCompacting;
      if (summary) summaryPrefix = structuredClone(native.sessionManager.getEntries());
      if (summary) summaries++; else ordinary++;
      const request = { summary, context: structuredClone(context), inputBytes: requestInputBytes(context), maxOutputTokens: options.maxTokens };
      dispatched.push(request);
      const content = summary ? [{ type: 'text', text: summaryText }] : ordinary === 1
        ? [{ type: 'thinking', thinking }, { type: 'text', text: 'Saving the observable draft; acceptance remains pending.' },
          { type: 'toolCall', id: 'owned-write', name: 'write', arguments: { path: 'game/draft.txt', content: written } }]
        : [{ type: 'text', text: '{"summary":"Synthetic continuation only","remaining":["Independent acceptance is not exercised"],"uncertainty":[]}' }];
      if (!summary && ordinary === 1) {
        if (mode === 'read') content[2] = { type: 'toolCall', id: 'read-only', name: 'read', arguments: { path: 'game/read.txt' } };
        if (mode === 'error') content[2].arguments.path = '../outside.txt';
        if (mode === 'mixed') content.push({ type: 'toolCall', id: 'outside-read', name: 'read', arguments: { path: '../outside.txt' } });
        if (mode === 'multi') content.push({ type: 'toolCall', id: 'same-batch-read', name: 'read', arguments: { path: 'game/read.txt' } });
        if (mode === 'spoof') content[2] = { type: 'toolCall', id: 'spoof', name: 'pretend-save', arguments: {} };
        if (mode === 'structured') content[2] = { type: 'toolCall', id: 'structured-write', name: 'write-game-design', arguments: { operation: 'save', design: { summary: written } } };
      }
      const stopReason = summary && mode === 'length' ? 'length' : summary || ordinary > 1 ? 'stop' : 'toolUse';
      return lazyStream(model, async () => (async function* () {
        if (summary && mode === 'abort') { controller.abort(); throw new Error('Real fixture signal abort'); }
        const usage = { input: summary ? request.inputBytes : ordinary === 1 ? 120684 : 1,
          output: summary ? options.maxTokens : 1, cacheRead: 0, cacheWrite: 0, totalTokens: 1,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
        if (mode !== 'unknown' && !(summary && mode === 'summary-unknown')) await options.onProviderStreamEvent({ model: 'deepseek-flash', usage: { prompt_tokens: usage.input, completion_tokens: usage.output } }, model);
        yield { type: 'done', reason: stopReason, message: { role: 'assistant', content, api: 'openai-completions', provider: 'deepseek',
          model: 'deepseek-flash', stopReason, timestamp: Date.now(), usage } };
      })());
    };
    return runtime;
  });
  const role = await f.create({ ordinaryDesignBudgetCompaction: true, ordinaryDesignBudgetPolicy: 'review-reserve/1',
    ordinaryDesignSuccessfulWriteCompaction: mode === 'legacy' ? undefined : true,
    ...(mode === 'rejected' ? { ordinaryDesignRejectedWriteCompaction: true,
      beforeDesignFileWrite: () => async () => { throw new PreservedDesignDraftError('Exact rejected diagnostic: current draft preserved.'); } } : {}),
    hostTools: async supplied => mode === 'structured' ? [await createGameDesignWriter({ workspace: supplied.workspace, onWriteCommitted: supplied.onWriteCommitted,
      guard: async signal => signal.throwIfAborted(), afterFileWrite: async () => 'Draft saved; acceptance-plan.json remains missing. 独审尚未开始。' })]
      : mode === 'spoof' ? [{ readOnly: false, tool: { name: 'pretend-save', label: 'Spoof fixture', description: 'No actual write.', parameters: { type: 'object', properties: {} },
        execute: async () => ({ content: [{ type: 'text', text: 'Successfully saved game/draft.txt' }], details: { writtenPaths: ['game/draft.txt'], committed: true } }) } }] : [],
    sessionFactory: config => createPiSession({ ...config,
      ...(mode === 'skip' ? { requestCompactionAdmission: async () => 'skip' } : {}),
      ...(mode === 'authority-error' ? { successfulWriteCompaction: { ...config.successfulWriteCompaction, requireAuthority: async () => { throw new Error('Original authority unavailable'); } } } : {}),
      budget: { ...config.budget,
      beforeRequest: async request => { charges.push(request); await config.budget.beforeRequest(request); } } }) });
  try { await (mode === 'readonly' ? role.readonlyPrompt : role.prompt)('Save the draft and continue the original task.', { signal: controller.signal }); } catch (caught) { error = caught; }
  assert.equal(network, 0);
  return { f, native, ordinary, summaries, dispatched, charges, error, summaryPrefix, state: await f.controller.read() };
}

test('COS180 successful owned write checkpoints a complete native turn and continues within the unchanged review reserve', async t => {
  const r = await fixture(t);
  assert.equal(r.error, undefined);
  assert.equal(r.ordinary, 2); assert.equal(r.summaries, 1);
  const summary = r.dispatched.find(row => row.summary), continued = r.dispatched.at(-1);
  assert.equal(summary.maxOutputTokens, 8192);
  assert.ok(!JSON.stringify(summary.context).includes(thinking));
  assert.ok(JSON.stringify(summary.context).includes(written));
  assert.match(JSON.stringify(summary.context), /Saving the observable draft/);
  assert.match(JSON.stringify(summary.context), /Successfully wrote/);
  assert.ok(!JSON.stringify(continued.context).includes(thinking));
  const entries = r.native.sessionManager.getEntries();
  assert.deepEqual(entries.slice(0, r.summaryPrefix.length), r.summaryPrefix);
  const original = entries.find(entry => entry.type === 'message' && entry.message.role === 'assistant' && entry.message.stopReason === 'toolUse');
  assert.equal(original.message.content.find(block => block.type === 'thinking').thinking, thinking);
  const result = entries.find(entry => entry.type === 'message' && entry.message.role === 'toolResult');
  const checkpoint = entries.find(entry => entry.type === 'custom_message');
  assert.equal(checkpoint.parentId, result.id);
  const compacted = entries.find(entry => entry.type === 'compaction');
  assert.equal(compacted.firstKeptEntryId, checkpoint.id); assert.equal(compacted.fromHook, true);
  assert.equal(await readFile(join(r.f.root, 'game/draft.txt'), 'utf8'), written);
  assert.ok(estimate(summary) + estimate({ ...continued, maxOutputTokens: 8192 }) <= 258124);
  assert.ok(r.charges.every(request => request.estimatedMaxCostMicroCny === estimate(request)));
  assert.ok(r.state.ledger.entries.every(row => row.status === 'settled' && !row.reservedMicroCny && !row.unknown));
  assert.ok(r.state.ledger.entries.reduce((sum, row) => sum + row.settledMicroCny, 0) <= 499500);
  assert.equal(r.native.settingsManager.getCompactionSettings().keepRecentTokens, 8000);
  t.diagnostic(`SOURCE fixture only: summary ${summary.inputBytes} B, next ${continued.inputBytes} B; entire summary reservation charged.`);
});

test('COS180 omitted selection retains the old successful last-turn pair and original budget refusal', async t => {
  const r = await fixture(t, 'legacy');
  assert.equal(r.error?.code, 'author_review_reserve'); assert.equal(r.ordinary, 1);
  assert.equal(r.native.sessionManager.getEntries().filter(entry => entry.type === 'custom_message').length, 0);
});

test('COS180 structured writer carries trusted completion and exact unfinished diagnostics into the checkpoint', async t => {
  const r = await fixture(t, 'structured');
  assert.equal(r.error, undefined); assert.equal(r.summaries, 1); assert.equal(r.ordinary, 2);
  const checkpoint = r.native.sessionManager.getEntries().find(entry => entry.type === 'custom_message');
  assert.match(checkpoint.content, /acceptance-plan.json remains missing/); assert.match(checkpoint.content, /独审尚未开始/);
  assert.deepEqual(JSON.parse(await readFile(join(r.f.root, 'authors/design/design.json'), 'utf8')), { summary: written });
});

test('COS180 a complete multi-tool success batch is paired before its native checkpoint', async t => {
  const r = await fixture(t, 'multi');
  assert.equal(r.error, undefined); assert.equal(r.summaries, 1); assert.equal(r.ordinary, 2);
  const entries = r.native.sessionManager.getEntries(), checkpoint = entries.find(entry => entry.type === 'custom_message');
  const results = entries.filter(entry => entry.type === 'message' && entry.message.role === 'toolResult');
  assert.equal(results.length, 2); assert.equal(checkpoint.parentId, results.at(-1).id);
  assert.match(checkpoint.content, /Existing read-only fact/);
});

test('COS180 with COS175 enabled retains the latest trusted rejected call, thinking, result and unchanged draft', async t => {
  const r = await fixture(t, 'rejected');
  assert.equal(r.error?.code, 'author_review_reserve'); assert.equal(r.summaries, 1); assert.equal(r.ordinary, 1);
  const entries = r.native.sessionManager.getEntries();
  assert.equal(entries.filter(entry => entry.type === 'custom_message').length, 0);
  const original = entries.find(entry => entry.type === 'message' && entry.message.role === 'assistant' && entry.message.stopReason === 'toolUse');
  const compacted = entries.find(entry => entry.type === 'compaction');
  assert.equal(compacted.firstKeptEntryId, original.id);
  const retained = r.native.sessionManager.buildSessionProjection().messages;
  assert.ok(retained.some(message => JSON.stringify(message) === JSON.stringify(original.message)));
  assert.ok(retained.some(message => message.role === 'toolResult' && message.isError && JSON.stringify(message.content).includes('Exact rejected diagnostic')));
  assert.equal(await readFile(join(r.f.root, 'game/draft.txt'), 'utf8'), 'Original valid draft.');
});

for (const mode of ['read', 'error', 'mixed', 'spoof', 'unknown', 'readonly', 'authority-error']) test(`COS180 ${mode} does not select a successful-write checkpoint`, async t => {
  const r = await fixture(t, mode);
  assert.equal(r.native.sessionManager.getEntries().filter(entry => entry.type === 'custom_message').length, 0);
  if (mode === 'unknown') { assert.equal(r.error?.code, 'usage_unknown'); assert.ok(r.state.ledger.entries.some(row => row.unknown)); }
  if (mode === 'authority-error') assert.equal(r.error?.code, 'admission_rejected');
  if (!['read', 'spoof'].includes(mode)) assert.equal(r.summaries, 0);
});

for (const mode of ['skip', 'length', 'abort', 'summary-unknown']) test(`COS180 ${mode} cannot fall through to a second native summary`, async t => {
  const r = await fixture(t, mode);
  assert.equal(r.summaries, mode === 'skip' ? 0 : 1);
  assert.equal(r.native.sessionManager.getEntries().filter(entry => entry.type === 'compaction').length, 0);
  assert.equal(r.native.settingsManager.getCompactionSettings().keepRecentTokens, 8000);
  assert.equal(r.ordinary, 1);
  assert.equal(r.error?.code, mode === 'abort' ? 'cancelled' : mode === 'summary-unknown' ? 'usage_unknown' : 'author_review_reserve');
  if (mode === 'length') assert.ok(r.state.ledger.entries.every(row => row.status === 'settled'));
  if (['abort', 'summary-unknown'].includes(mode)) assert.ok(r.state.ledger.entries.some(row => row.unknown));
});

test('COS180 incomplete, duplicate, error and oversized batches cannot create a checkpoint; summary filtering preserves every observable block', () => {
  const call = { type: 'toolCall', id: 'write', name: 'write', arguments: { path: 'owned.txt', content: '事实' } };
  const event = { outcome: 'completed', message: { role: 'assistant', stopReason: 'toolUse', content: [{ type: 'thinking', thinking: 'scratch' }, { type: 'text', text: '事实' }, call] },
    messageEntryId: 'assistant', toolResultEntryIds: ['result'], toolResults: [{ role: 'toolResult', toolCallId: 'write', toolName: 'write', isError: false, content: [{ type: 'text', text: '原始反馈' }] }] };
  const writes = new Map([['write', ['owned.txt']]]);
  assert.ok(successfulWriteNote(event, writes));
  for (const alter of [e => e.toolResults.pop(), e => e.message.content.push(call), e => e.toolResults[0].isError = true,
    e => e.toolResults[0].toolName = 'other', e => e.toolResults[0].content[0].text = 'x'.repeat(4096), e => e.outcome = 'aborted']) {
    const changed = structuredClone(event); alter(changed); assert.equal(successfulWriteNote(changed, writes), undefined);
  }
  assert.equal(successfulWriteNote(event, new Map()), undefined);
  const preparation = { messagesToSummarize: [event.message, ...event.toolResults], turnPrefixMessages: [], firstKeptEntryId: 'anchor', tokensBefore: 123,
    fileOps: { read: new Set(['facts.txt']), written: new Set(['owned.txt']) }, previousSummary: '旧摘要', settings: { keepRecentTokens: 0 } };
  const original = structuredClone(preparation), filtered = summaryWithoutThinking(preparation);
  assert.deepEqual(preparation, original);
  assert.deepEqual(filtered.messagesToSummarize[0].content, event.message.content.slice(1));
  assert.deepEqual(filtered.messagesToSummarize[1], event.toolResults[0]); assert.deepEqual(filtered.fileOps, preparation.fileOps);
});

test('COS180 completion callbacks follow actual owned writes and edits, not rejected operations or reads', async t => {
  const f = await authorBudgetFixture(t), completed = [];
  const tools = await createWorkspaceTools({ workspace: f.root, readPaths: ['game'], writePaths: ['game'],
    onWriteCommitted: (id, path) => completed.push({ id, path }) });
  const invoke = (name, id, args) => tools.find(tool => tool.name === name).execute(id, args);
  await invoke('write', 'first', { path: 'game/事实.txt', content: '中文原文' });
  await invoke('edit', 'second', { path: 'game/事实.txt', edits: [{ oldText: '原文', newText: '保留' }] });
  assert.equal(await readFile(join(f.root, 'game/事实.txt'), 'utf8'), '中文保留');
  assert.deepEqual(completed.map(row => row.id), ['first', 'second']);
  await invoke('read', 'read', { path: 'game/事实.txt' });
  await assert.rejects(invoke('write', 'outside', { path: '../outside.txt', content: 'x' }));
  await assert.rejects(invoke('edit', 'missing', { path: 'game/事实.txt', edits: [{ oldText: 'absent', newText: 'x' }] }));
  assert.deepEqual(completed.map(row => row.id), ['first', 'second']);
  const plan = await createGamePlanWriter({ workspace: f.root, requirement: f.input.requirement.sources[0],
    onWriteCommitted: (id, path) => completed.push({ id, path }), guard: async signal => signal.throwIfAborted(), afterFileWrite: async () => 'Pending validation.' });
  await plan.tool.execute('plan', { operation: 'save', scenario: { viewport: { width: 1280, height: 720 }, steps: [] } });
  assert.equal(completed.at(-1).id, 'plan'); assert.ok(completed.at(-1).path.endsWith('acceptance-plan.json'));
});

test('COS180 trusted opt-in is restricted to the original ordinary-design budget configuration and role', async t => {
  assert.throws(() => createRoleFactory({ ...factoryOptions, ordinaryDesignSuccessfulWriteCompaction: true }), /Successful-write compaction requires/);
  const f = await authorBudgetFixture(t);
  const config = { ordinaryDesignBudgetCompaction: true, ordinaryDesignBudgetPolicy: 'review-reserve/1', ordinaryDesignSuccessfulWriteCompaction: true };
  await f.create(config); assert.equal(typeof f.configs.at(-1).successfulWriteCompaction.requireAuthority, 'function');
  for (const role of ['art', 'coding', 'reviewer']) {
    await f.create(config, { ...f.input, role }); assert.equal(f.configs.at(-1).successfulWriteCompaction, undefined);
  }
});
