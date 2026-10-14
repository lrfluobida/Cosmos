import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { AgentSession, ModelRuntime, convertToLlm } from '@earendil-works/pi-coding-agent';
import { lazyStream, normalizeContext } from '@earendil-works/pi-ai';
import { Type } from 'typebox';

const workspace = fileURLToPath(new URL('../../', import.meta.url));
const source = process.env.COSMOS_COMPACTION_COMPILED === '1' ? 'dist' : 'src', extension = source === 'dist' ? 'js' : 'ts';
const local = path => import(pathToFileURL(join(workspace, path)).href);
const { validationRoutingFixture } = await local('tests/runtime/validation-routing.fixture.ts');
const { planTaskDag } = await local('src/roles/planner.ts');
const { createRoleFactory } = await local(source + '/roles/factory.' + extension);
const { createPiSession } = await local(source + '/providers/pi.' + extension);
const { validationReservation } = await local('src/runtime/validation-validation.ts');

const bytesOf = context => Buffer.byteLength(JSON.stringify(context));
const compactCount = session => session.sessionManager.getEntries().filter(entry => entry.type === 'compaction').length;
const usage = (big = false) => big
  ? { input: 0, output: 40511, cacheRead: 75, cacheWrite: 0, totalTokens: 40586, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
  : { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

export async function codingCompactionFixture(t, mode = 'success', priorHistory = false) {
  const affordableBalance = { 'affordable-full': 1067661, 'affordable-reduced': 500000, 'affordable-floor': 294912 }[mode];
  const f = await validationRoutingFixture(t), plan = await planTaskDag(f.planning);
  const task = structuredClone(plan.tasks.find(item => item.role === 'coding').task);
  // Isolated coding contract uses the fixture's real fixed requirement capture only.
  // It does not claim that the fixture's unexecuted design/art proposals already produced captures.
  task.dependsOn = []; task.inputs = [structuredClone(f.source)]; task.context.tools = ['synthetic_read', 'write'];
  if (mode === 'noop') task.context.rules.push('Synthetic fixed system packet: ' + 's'.repeat(160000));
  await f.controller.registerTasks([task]);
  task.state = 'ready'; await f.controller.saveTask(task, { role: 'system', actorId: 'SOURCE-COS79' });
  task.state = 'running'; task.attempts = [{ attemptId: randomUUID(), sessionRef: join(f.artifactRoot, 'SOURCE-COS79-session'),
    startedAt: new Date().toISOString(), endedAt: null, outcome: 'running', failure: null }];
  await f.controller.saveTask(task, { role: 'system', actorId: 'SOURCE-COS79' });
  const originalTask = structuredClone(task), admissions = [], dispatches = [], events = [], boundaries = [], summaries = [], settlements = [], selections = [], policies = [], pressures = [];
  let native, ordinary = 0, summaryRequests = 0, networkCalls = 0, roleConfig, readonlyTurn = false, closing;
  let mainStarted = false, sdkOutputCap, injected = false, lastTurn, compactionBefore, partialToolCalls = 0;
  let syntheticCharge = 0;
  const spendTo = async target => {
    const before = await f.controller.validationAuthority(task.taskId, 'author'), amount = before.remainingMicroCny - target;
    assert.ok(amount >= 8);
    const requestId = 'SOURCE-pressure-' + (++syntheticCharge);
    await f.controller.reserve({ requestId, taskId: task.taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: amount,
      validation: { caseId: f.window.caseId, windowId: f.window.windowId, purpose: 'author', modelId: 'deepseek-flash', maxOutputTokens: 1, inputBytes: 0, hasImages: false } });
    await f.controller.admit(requestId); await f.controller.settle(requestId, amount, [{ artifactId: requestId, version: 'SOURCE-only', location: 'SOURCE synthetic concurrent cost; no provider' }]);
  };
  const projected = () => normalizeContext({ messages: convertToLlm(native.sessionManager.buildSessionProjection().messages) });
  t.mock.method(globalThis, 'fetch', async () => { networkCalls++; throw new Error('NETWORK_DISABLED'); });
  const originalPrompt = AgentSession.prototype.prompt;
  t.mock.method(AgentSession.prototype, 'prompt', async function(...args) {
    if (!native) {
      native = this;
      const sdkStream = native.agent.streamFunction;
      native.agent.streamFunction = (model, context, options) => {
        if (native.isCompacting) {
          if (mode === 'invalid-sdk-cap') options = { ...options, maxTokens: NaN };
          if (mode === 'small-sdk-cap') options = { ...options, maxTokens: 4096 };
          sdkOutputCap = options.maxTokens;
        }
        return sdkStream(model, context, options);
      };
      native.subscribe(event => {
        if (event.type === 'compaction_start') compactionBefore = { projection: JSON.stringify(projected()), entries: JSON.stringify(native.sessionManager.getEntries()) };
        if (event.type.startsWith('compaction')) events.push({ type: event.type, reason: event.reason, willRetry: event.willRetry,
          aborted: event.aborted, errorMessage: event.errorMessage, saved: compactCount(native),
          ...(event.type === 'compaction_end' ? { projectionUnchanged: JSON.stringify(projected()) === compactionBefore.projection,
            entriesUnchanged: JSON.stringify(native.sessionManager.getEntries()) === compactionBefore.entries } : {}) });
      });
      // Observe the real production hook; this fixture does not implement compaction.
      const previous = native.agent.prepareNextTurnWithContext;
      native.agent.prepareNextTurnWithContext = async (turn, signal) => {
        lastTurn = turn;
        if (mode === 'summary-too-large' && ordinary === 2 && !injected) { injected = true; await spendTo(1000000); }
        let current = await f.controller.validationAuthority(task.taskId, 'author'), pressure;
        const inputBytes = bytesOf(projected()), floor = validationReservation({ inputBytes, hasImages: false, maxOutputTokens: 4096 });
        // Existing lifecycle cases need real temporary pressure now that an affordable ordinary floor skips compaction.
        // Keep the original grant and settle/cancel only through the controller; the policy remains the real factory hook.
        if (affordableBalance === undefined && !['disabled', 'low-pressure', 'summary-too-large'].includes(mode)
          && inputBytes >= 131072 && current.remainingMicroCny >= floor) {
          const requestId = 'SOURCE-temporary-pressure-' + (pressures.length + 1), amount = current.remainingMicroCny - floor + 1;
          assert.ok(amount >= 8);
          pressure = { requestId, inputBytes, beforeMicroCny: current.remainingMicroCny, reservedMicroCny: amount };
          await f.controller.reserve({ requestId, taskId: task.taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: amount,
            validation: { caseId: f.window.caseId, windowId: f.window.windowId, purpose: 'author', modelId: 'deepseek-flash', maxOutputTokens: 1, inputBytes: 0, hasImages: false } });
          pressures.push(pressure); current = await f.controller.validationAuthority(task.taskId, 'author');
          assert.equal(current.remainingMicroCny, floor - 1);
        }
        const beforeProjection = JSON.stringify(projected());
        const boundary = { inputBytes: bytesOf(projected()), remainingMicroCny: current.remainingMicroCny, ordinaryBefore: ordinary,
          summaryBefore: summaryRequests, savedBefore: compactCount(native), policyBefore: policies.length };
        boundaries.push(boundary);
        try {
          const result = await previous(turn, signal);
          boundary.afterBytes = bytesOf(projected()); boundary.savedAfter = compactCount(native);
          boundary.projectionUnchanged = JSON.stringify(projected()) === beforeProjection;
          boundary.trigger = policies.slice(boundary.policyBefore).some(item => item.selected);
          if (mode === 'noop' && !injected) {
            injected = true;
            const counts = { ordinary, summaryRequests, policies: policies.length };
            await previous(turn, signal);
            assert.deepEqual({ ordinary, summaryRequests, policies: policies.length }, counts);
            boundary.repeatedSameProjectionVerified = true;
          }
          return result;
        } finally {
          if (pressure) {
            // stop() already cancels unadmitted reservations; do not cancel a closed row twice.
            const row = (await f.controller.read()).ledger.entries.find(entry => entry.requestId === pressure.requestId);
            if (row.status !== 'cancelled') await f.controller.cancel(pressure.requestId, [{ artifactId: pressure.requestId, version: 'SOURCE-only', location: 'SOURCE unadmitted synthetic reservation; no provider' }]);
            pressure.released = true;
          }
        }
      };
    }
    return originalPrompt.apply(this, args);
  });
  const nativeCreate = ModelRuntime.create;
  t.mock.method(ModelRuntime, 'create', async function(...args) {
    const runtime = await nativeCreate.apply(this, args);
    runtime.streamSimple = (model, context, options) => {
      const summary = native?.isCompacting ?? false;
      if (summary) summaryRequests++; else ordinary++;
      const observed = { kind: summary ? 'summary' : 'ordinary', inputBytes: bytesOf(context), sentCap: options.maxTokens, sdkRetries: options.maxRetries, ...(summary ? { sdkRequestedCap: sdkOutputCap } : {}) };
      dispatches.push(observed); if (summary) summaries.push(observed);
      if (!summary) {
        assert.ok(JSON.stringify(context).includes(JSON.stringify(roleConfig.context).slice(1, -1)), 'Frozen authority packet must survive native compaction');
        assert.deepEqual(native.getActiveToolNames().sort(), readonlyTurn ? [] : ['synthetic_read', 'write']);
        if (!readonlyTurn) assert.ok(context.messages.flatMap(message => message.toolsAdded ?? []).some(tool => tool.name === 'write'));
      }
      let content, stopReason = 'stop', big = false, largeHistory = false;
      if (summary) {
        assert.ok(options.maxTokens <= 8192);
        content = mode === 'toolcall' ? [{ type: 'toolCall', id: 'illegal-summary-tool', name: 'write', arguments: { path: 'authors/coding.txt', content: 'must not run' } }]
          : [{ type: 'text', text: 'Synthetic provider summary. Preserve the fixed task and known read results; continue writing only authors/coding.txt.' }];
        if (mode === 'length' || mode.startsWith('length-') && (mode !== 'length-split' || summaryRequests === 2)) {
          stopReason = 'length';
          content.push({ type: 'toolCall', id: 'truncated-partial', name: 'synthetic_read', arguments: { ordinal: 99 } });
        }
        if (mode === 'toolcall') stopReason = 'toolUse';
      } else if (priorHistory && !mainStarted) {
        content = [{ type: 'text', text: 'Earlier synthetic turn retained as history. '.repeat(200) }];
      } else {
        const n = ordinary - (priorHistory ? 1 : 0);
        if (mode === 'no-benefit' && n >= 3 || mode === 'noop' && n >= 3 || affordableBalance !== undefined && n >= 4) content = [{ type: 'text', text: JSON.stringify({ summary: 'Synthetic bounded continuation', remaining: [], uncertainty: [] }) }];
        else if (n <= 3) { stopReason = 'toolUse'; largeHistory = mode === 'summary-too-large' && n === 1;
          content = [{ type: 'thinking', thinking: largeHistory ? 'x'.repeat(500000) : 'synthetic reading rationale' },
          { type: 'toolCall', id: 'read-' + n, name: 'synthetic_read', arguments: { ordinal: n } }]; }
        else if (n === 4) { stopReason = 'toolUse'; big = !mode.startsWith('length-'); content = [{ type: 'thinking', thinking: 'x'.repeat(142685) },
          { type: 'toolCall', id: 'write-final', name: 'write', arguments: { path: 'authors/coding.txt', content: 'Synthetic Cosmos output. 中文保持。' } }]; }
        else content = [{ type: 'text', text: JSON.stringify({ summary: 'Synthetic file completed', remaining: [], uncertainty: [] }) }];
      }
      return lazyStream(model, async () => (async function* () {
        const actualUsage = summary && mode === 'summary-peak' ? { ...usage(), input: observed.inputBytes, output: observed.sentCap, totalTokens: observed.inputBytes + observed.sentCap }
          : largeHistory ? { ...usage(), output: 62500, totalTokens: 62501 } : usage(big);
        if (!(summary && ['unknown', 'length-unknown'].includes(mode))) await options.onProviderStreamEvent({ model: summary && mode === 'length-model' ? 'wrong-model' : 'deepseek-flash',
          usage: { prompt_tokens: actualUsage.input + actualUsage.cacheRead, completion_tokens: actualUsage.output } }, model);
        const message = { role: 'assistant', content, api: 'openai-completions', provider: 'deepseek', model: 'deepseek-flash', stopReason, timestamp: Date.now(), usage: actualUsage };
        yield { type: 'done', reason: stopReason, message };
      })());
    };
    return runtime;
  });
  const syntheticTool = { name: 'synthetic_read', label: 'Synthetic read', description: 'Produce synthetic fixture data only',
    parameters: Type.Object({ ordinal: Type.Number() }, { additionalProperties: false }), async execute(id, args) {
      if (args.ordinal === 99) { partialToolCalls++; throw new Error('Truncated summary tool must not execute'); }
      const content = [{ type: 'text', text: '' }], message = { role: 'toolResult', toolCallId: id, toolName: 'synthetic_read', content,
        details: {}, isError: false, timestamp: Date.now() };
      const context = normalizeContext({ messages: convertToLlm([...native.sessionManager.buildSessionProjection().messages, message]) });
      const target = mode === 'no-benefit' ? args.ordinal === 1 ? 251339 : bytesOf(context) + 40000
        : mode === 'noop' ? bytesOf(context) + 100
        : mode === 'summary-too-large' ? [600000, 700000][args.ordinal - 1]
        : affordableBalance !== undefined ? [40000, 80000, 131072][args.ordinal - 1] : [80000, 125000, 251339][args.ordinal - 1], difference = target - bytesOf(context);
      assert.ok(difference > 0); content[0].text = 'r'.repeat(difference); assert.equal(bytesOf(context), target);
      return { content, details: {} };
    } };
  const factory = createRoleFactory({ maxOutputTokens: 65536, maxRequests: 16, requestTimeoutMs: 3000, estimatedMaxCostMicroCny: validationReservation,
    env: { DEEPSEEK_API_KEY: 'offline-synthetic-key' }, compactionKeepRecentTokens: 16000,
    hostTools: async () => [{ tool: syntheticTool, readOnly: true }],
    sessionFactory: async config => {
      roleConfig = config;
      return createPiSession({ ...config,
        requestCompaction: mode === 'disabled' ? undefined : config.requestCompaction && (async request => {
          if (mode === 'close-during-policy' && request.inputBytes >= 131072) closing = role.close();
          const selected = await config.requestCompaction(request), current = await f.controller.validationAuthority(task.taskId, 'author');
          policies.push({ ...request, selected, remainingMicroCny: current.remainingMicroCny });
          if (selected) assert.ok(validationReservation({ ...request, maxOutputTokens: Math.min(4096, request.maxOutputTokens) }) > current.remainingMicroCny);
          return selected;
        }), requestOutputLimit: async request => {
        if (native?.isCompacting && !injected) {
          if (mode === 'budget-first') { injected = true; await spendTo(100); }
          if (mode === 'deadline') { injected = true; t.mock.method(Date, 'now', () => Date.parse(f.window.deadlineAt)); }
          if (mode === 'cancel') { injected = true; await f.controller.stop('SOURCE cancelled before compaction dispatch'); }
        }
        selections.push({ inputBytes: request.inputBytes, kind: native?.isCompacting ? 'summary' : 'ordinary', sourceCap: request.maxOutputTokens });
        return config.requestOutputLimit(request);
      }, budget: { beforeRequest: async request => {
        admissions.push({ ...request, kind: native?.isCompacting ? 'summary' : 'ordinary' });
        if (native?.isCompacting && mode === 'balance-race' && !injected) { injected = true; await spendTo(100); }
        await config.budget.beforeRequest(request);
      }, afterResponse: async response => {
        settlements.push({ ...response, kind: native?.isCompacting ? 'summary' : 'ordinary' });
        await config.budget.afterResponse(response);
        if (native?.isCompacting && mode === 'budget-second' && !injected) { injected = true; await spendTo(100); }
        if (native?.isCompacting && response.stopReason === 'length') {
          if (mode === 'length-accounting') throw new Error('Synthetic accounting completion failure');
          if (mode === 'length-cancel') await f.controller.stop('SOURCE cancelled during summary settlement');
          if (mode === 'length-close') closing = role.close();
          if (mode === 'length-deadline') t.mock.method(Date, 'now', () => Date.parse(f.window.deadlineAt));
          if (mode === 'length-source') f.setIdentityCheck(async () => { throw new Error('SOURCE identity changed after summary'); });
          if (mode === 'length-history') native.sessionManager.appendCustomEntry('SOURCE-unexpected-entry', { changed: true });
        }
      } } });
    } });
  const role = await factory({ role: 'coding', task, requirement: f.requirement, validation: f.binding, controller: f.controller,
    workspace: f.artifactRoot, stateDirectory: join(task.attempts[0].sessionRef, 'author') });
  t.after(async () => { await role.close(); assert.equal(networkCalls, 0); });
  if (priorHistory) await role.prompt('A separate synthetic history turn.');
  const authority = await f.controller.validationAuthority(task.taskId, 'author'), charge = authority.remainingMicroCny - (affordableBalance !== undefined ? affordableBalance + 30 : ['low-pressure', 'summary-too-large'].includes(mode) ? 4000000 : 1069783);
  await f.controller.reserve({ requestId: 'SOURCE-budget-baseline', taskId: task.taskId, provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: charge,
    validation: { caseId: f.window.caseId, windowId: f.window.windowId, purpose: 'author', modelId: 'deepseek-flash', maxOutputTokens: 1, inputBytes: 0, hasImages: false } });
  await f.controller.admit('SOURCE-budget-baseline'); await f.controller.settle('SOURCE-budget-baseline', charge, [{ artifactId: 'SOURCE-budget-baseline', version: 'v1', location: 'SOURCE synthetic budget fixture; no provider charge' }]);
  mainStarted = true;
  let error, result;
  try { result = await role.prompt('Read the synthetic inputs, then write authors/coding.txt and report completion.'); } catch (caught) { error = { code: caught.code, message: caught.message }; }
  await closing;
  const snapshot = await f.controller.read(), compactEntries = native.sessionManager.getEntries().filter(entry => entry.type === 'compaction');
  assert.deepEqual(snapshot.tasks.find(item => item.taskId === task.taskId), originalTask);
  let captured = false;
  if (!error && affordableBalance === undefined && !['no-benefit', 'noop', 'close-during-policy'].includes(mode)) {
    const capture = await f.capture(task);
    assert.equal(await readFile(join(f.artifactRoot, capture.artifacts[0].location, 'fixture.txt'), 'utf8'), 'Synthetic Cosmos output. 中文保持。');
    captured = true;
  }
  assert.ok(pressures.every(pressure => pressure.released));
  for (const pressure of pressures) {
    const row = snapshot.ledger.entries.find(entry => entry.requestId === pressure.requestId);
    assert.equal(row.status, 'cancelled'); assert.equal(row.reservedMicroCny, 0); assert.equal(row.settledMicroCny, 0);
    assert.equal(snapshot.requests.find(request => request.requestId === pressure.requestId).admittedAt, null);
  }
  const report = { mode, priorHistory, error, result, networkCalls, ordinary, summaryRequests, partialToolCalls, admissions, dispatches, boundaries, events, settlements, selections, policies, pressures,
    compactions: compactEntries.length, summaryCharacters: compactEntries.map(entry => entry.summary.length), remainingMicroCny: (await f.controller.validationAuthority(task.taskId, 'author')).remainingMicroCny,
    currentTaskUnchanged: true, fixedPacketAndToolsRetained: true, captured, ledger: snapshot.ledger.entries.filter(entry => admissions.some(request => request.requestId === entry.requestId)),
    autoCompactionRestoredDisabled: native.settingsManager.getCompactionSettings(native.model).enabled === false };
  return { report, native, role, f, task, roleConfig, lastTurn, requestCounts: () => ({ ordinary, summaryRequests }),
    readonlyPrompt: async () => { readonlyTurn = true; try { return await role.readonlyPrompt('Format the existing synthetic facts only.'); } finally { readonlyTurn = false; } } };
}
