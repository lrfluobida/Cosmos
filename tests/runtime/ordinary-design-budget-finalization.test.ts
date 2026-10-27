import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { AgentSession, ModelRuntime } from '@earendil-works/pi-coding-agent';
import { lazyStream } from '@earendil-works/pi-ai';
import { createPiSession } from '../../src/providers/pi.ts';
import { requestInputBytes } from '../../src/providers/request-input.ts';
import { TaskJournal, RecoveryBlocked } from '../../src/runtime/recovery/task-journal.ts';
import { readRunSnapshot } from '../../src/cli/control.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';

test('COS136 F1 new ordinary policy is frozen on execution and design origin only', async t => {
  const f = await ordinaryHostFixture(t, { productionDefault: true, sessionFactory: async (config, fallback) => {
    if (JSON.parse(config.context).role === 'art') throw new Error('Source fixture cutoff after design approval.');
    return fallback;
  } });
  await f.execute();
  const execution = JSON.parse(await readFile(join(f.root, 'execution.json'), 'utf8'));
  assert.equal(execution.ordinaryDesignFinalizationPolicy, 'budget-followup/1');
  assert.equal(execution.authorProtocolCorrections, 1); assert.equal(execution.ordinaryDesignBudgetPolicy, 'review-reserve/1');
  const design = JSON.parse(await readFile(join(f.root, 'journal/task-design-task/origin.json'), 'utf8'));
  assert.equal(design.ordinaryDesignFinalizationPolicy, 'budget-followup/1');
  const art = JSON.parse(await readFile(join(f.root, 'journal/task-art-task/origin.json'), 'utf8'));
  assert.equal(art.ordinaryDesignFinalizationPolicy, undefined); assert.equal(f.plays.length, 0);
  let hosts = 0;
  for (const changed of [{ ordinaryDesignFinalizationPolicy: null }, { ordinaryDesignFinalizationPolicy: 'unknown' },
    { ordinaryDesignBudgetPolicy: undefined }, { authorProtocolCorrections: undefined }]) {
    await writeFile(join(f.root, 'execution.json'), JSON.stringify({ ...execution, ...changed }), 'utf8');
    await assert.rejects(executeGeneration({ root: f.root, draft: f.draft, requirement: execution.requirement, resume: true,
      createHost: async () => { hosts++; throw new Error('Invalid policy must reject before host assembly.'); } }), /(?:finalization|revision) policy/);
  }
  await writeFile(join(f.root, 'execution.json'), JSON.stringify(execution), 'utf8'); assert.equal(hosts, 0);

});


async function nativeHost(t: test.TestContext, mode = 'approved') {
  const dispatched: any[] = [], selections: any[] = [], guards: any[] = [];
  let native: any, f: Awaited<ReturnType<typeof ordinaryHostFixture>>;
  const prompt = AgentSession.prototype.prompt;
  t.mock.method(AgentSession.prototype, 'prompt', function(this: any, ...args: any[]) { native = this; return prompt.apply(this, args as any); });
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('NETWORK_DISABLED'); });
  const create = ModelRuntime.create;
  t.mock.method(ModelRuntime, 'create', async function(...args: any[]) {
    const runtime = await create.apply(this, args as any);
    runtime.streamSimple = (model: any, context: any, options: any) => {
      const readonly = native.getActiveToolNames().length === 0, index = dispatched.length;
      dispatched.push({ readonly, inputBytes: requestInputBytes(context), cap: options.maxTokens, tools: context.tools });
      const reply = mode === 'invalid' ? 'No complete JSON.' : JSON.stringify({ summary: 'Synthetic current design; host checks remain pending.', remaining: mode === 'remaining' ? ['Unverified coverage remains.'] : [], uncertainty: [] });
      const formatBudget = mode === 'format-budget' && index === 1;
      const content: any = formatBudget ? [{ type: 'text', text: 'Prose before a missing required JSON response.' }] : readonly ? [{ type: 'text', text: reply }] : [{ type: 'toolCall', id: 'read-' + index, name: 'read', arguments: { path: 'authors/design/design.json' } }];
      const stopReason = readonly || formatBudget ? 'stop' : 'toolUse';
      return lazyStream(model, async () => (async function* () {
        const usage = { input: readonly ? 1 : index === 0 ? 129500 : formatBudget ? 175000 : 129505, output: readonly ? 1 : 0, cacheRead: !readonly && !formatBudget && index === 1 ? 25 : 0,
          cacheWrite: 0, totalTokens: readonly ? 2 : index === 0 ? 129500 : formatBudget ? 175000 : 129530, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
        await options.onProviderStreamEvent({ model: 'deepseek-flash', usage: { prompt_tokens: usage.input, completion_tokens: usage.output } }, model);
        yield { type: 'done', reason: stopReason, message: { role: 'assistant', content, api: 'openai-completions', provider: 'deepseek', model: 'deepseek-flash', stopReason, timestamp: Date.now(), usage } };
      })());
    }; return runtime;
  });
  f = await ordinaryHostFixture(t, { productionDefault: true, limits: { limitMicroCny: 5000000, durationMs: 1800000 },
    fault: mode === 'review' ? 'review' : undefined, sessionFactory: async (config, fallback) => {
      const packet = JSON.parse(config.context);
      if (packet.role === 'art' || packet.role === 'design' && packet.taskId !== 'design-task') throw new Error('Bounded source fixture cutoff after initial design.');
      if (packet.role !== 'design') return fallback;
      const role = await createPiSession({ ...config, systemPrompt: config.systemPrompt + '\n' + 's'.repeat(70000), env: { DEEPSEEK_API_KEY: 'offline-cos136' },
        requestOutputLimit: async (request, signal) => { selections.push(request); return config.requestOutputLimit!(request, signal); } });
      return { ...role, prompt: async (text, options) => {
        await fallback.prompt(text, options);
        if (mode === 'host-failed') await writeFile(join(config.workspace, 'authors/design/acceptance-plan.json'), '{}', 'utf8');
        const check = config.tools.find(tool => tool.name === 'validate-game-design')!;
        guards.push(await check.execute('source-check', {}, undefined, undefined, undefined as any));
        return role.prompt(text, options);
      } };
    } });
  return { ...f, dispatched, selections, guards,
    state: async () => await readRunSnapshot(f.root) as any,
    json: async (path: string) => JSON.parse(await readFile(join(f.root, path), 'utf8')),
    resume: async () => f.host.execute({ root: f.root, draft: f.draft, requirement: JSON.parse(await readFile(join(f.root, 'execution.json'), 'utf8')).requirement, resume: true }) };
}

test('COS136 F5 F6 budget followup uses shared receipts and actual capture host check and independent review', async t => {
  const f = await nativeHost(t); await f.execute(); const state = await f.state(), design = state.tasks.find((row: any) => row.taskId === 'design-task');
  t.diagnostic(JSON.stringify({ sent: f.dispatched, selected: f.selections.map(r => ({ bytes: r.inputBytes, cap: r.maxOutputTokens })), state: design.state, failure: design.attempts[0].failure }));
  assert.equal(design.state, 'passed'); assert.equal(design.review.verdict, 'approved');
  assert.equal(f.dispatched.length, 3); assert.deepEqual(f.dispatched.map(row => row.readonly), [false, false, true]);
  assert.equal(f.dispatched[2].cap, 4096);
  const start = (await f.json('journal/task-design-task/author-correction-started.json')).value;
  const response = (await f.json('journal/task-design-task/author-correction-response.json')).value;
  assert.equal(start.kind, 'budget_finalization'); assert.equal(response.kind, 'budget_finalization');
  assert.equal(start.originalReply, undefined); assert.equal(start.parseFailure, undefined); assert.equal(start.unsent.floor, 8192);
  assert.ok(await f.json('journal/task-design-task/capture.json')); assert.ok(await f.json('journal/task-design-task/verified.json'));
  assert.equal(f.plays.length, 0);
});


for (const mode of ['remaining', 'invalid', 'host-failed', 'review']) test('COS136 F6 strict followup cannot bypass ' + mode, async t => {
  const f = await nativeHost(t, mode); await f.execute(); const state = await f.state(), design = state.tasks.find((row: any) => row.taskId === 'design-task');
  assert.notEqual(design.state, 'passed'); assert.equal(f.dispatched.length, 3);
  const start = (await f.json('journal/task-design-task/author-correction-started.json')).value;
  assert.equal(start.kind, 'budget_finalization'); assert.equal(start.used, 1);
  assert.equal(f.packets.filter((row: any) => row.role === 'art' || row.role === 'coding').length, 0);
  assert.equal(f.plays.length, 0);
  if (mode === 'remaining') assert.ok(design.handoff.remaining.includes('Unverified coverage remains.'));
  if (mode === 'invalid') assert.match(design.attempts[0].failure.actual, /protocol_failure/);
  if (mode === 'review') assert.equal(design.review.verdict, 'changes_requested');
  if (mode === 'host-failed') assert.equal(JSON.parse(f.guards[0].content[0].text).passed, false);
});

for (const interruption of ['started', 'response', 'native-source', 'origin-policy', 'execution-policy']) test('COS136 F7 cold recovery keeps one shared slot after ' + interruption, async t => {
  const f = await nativeHost(t), write = TaskJournal.prototype.write;
  const target = interruption === 'started' ? 'author-correction-started' : 'author-correction-response';
  const crash = t.mock.method(TaskJournal.prototype, 'write', async function(this: TaskJournal, stage, attemptId, value) {
    await write.call(this, stage, attemptId, value);
    if (stage === target && (value as any).kind === 'budget_finalization') throw new RecoveryBlocked('Synthetic interruption after durable followup receipt.');
  });
  await f.execute(); crash.mock.restore(); const before = f.dispatched.length;
  if (interruption === 'native-source') {
    const path = join(f.root, 'journal/task-design-task/author-correction-started.json'), receipt = JSON.parse(await readFile(path, 'utf8'));
    receipt.value.unsent.native.entryId = 'missing-source'; await writeFile(path, JSON.stringify(receipt), 'utf8');
  }
  if (interruption === 'origin-policy' || interruption === 'execution-policy') {
    const path = join(f.root, interruption === 'origin-policy' ? 'journal/task-design-task/origin.json' : 'execution.json');
    const value = JSON.parse(await readFile(path, 'utf8')); delete value.ordinaryDesignFinalizationPolicy; await writeFile(path, JSON.stringify(value), 'utf8');
  }
  await f.resume(); const state = await f.state(), design = state.tasks.find((row: any) => row.taskId === 'design-task');
  assert.equal(f.dispatched.length, before);
  if (interruption === 'response') assert.equal(design.state, 'passed'); else assert.equal(design.state, 'running');
  assert.equal(before, interruption === 'started' ? 2 : 3);
});


test('COS136 F5 format resource failure cannot obtain a budget followup', async t => {
  const f = await nativeHost(t, 'format-budget'); await f.execute();
  const started = (await f.json('journal/task-design-task/author-correction-started.json')).value;
  assert.equal(started.kind, undefined); assert.equal(started.unsent, undefined); assert.equal(started.used, 1);
  assert.equal(started.originalReply, 'Prose before a missing required JSON response.');
  assert.equal(f.dispatched.length, 2); assert.equal(f.plays.length, 0);
  await assert.rejects(readFile(join(f.root, 'journal/task-design-task/author-correction-response.json')), { code: 'ENOENT' });
});


test('COS136 F1 existing coding repair authenticates design policy without gaining the followup', async t => {
  const f = await ordinaryHostFixture(t, { productionDefault: true, fault: 'code-repair', limits: { limitMicroCny: 5000000, durationMs: 1800000 } });
  const result = await f.execute(), state: any = await readRunSnapshot(f.root);
  assert.equal(state.tasks.find((row: any) => row.taskId === 'design-task').state, 'passed');
  const repair = state.tasks.find((row: any) => row.taskId === 'coding-task-repair');
  assert.ok(repair, JSON.stringify(result.gaps)); assert.equal(repair.state, 'passed');
  const designOrigin = JSON.parse(await readFile(join(f.root, 'journal/task-design-task/origin.json'), 'utf8'));
  const repairOrigin = JSON.parse(await readFile(join(f.root, 'journal/task-coding-task-repair/origin.json'), 'utf8'));
  assert.equal(designOrigin.ordinaryDesignFinalizationPolicy, 'budget-followup/1');
  assert.equal(repairOrigin.ordinaryDesignFinalizationPolicy, undefined);
  assert.equal(f.packets.filter(row => row.role === 'design').length, 1);
});
