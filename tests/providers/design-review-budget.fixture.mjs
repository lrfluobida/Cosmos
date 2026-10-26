import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AgentSession, ModelRuntime } from '@earendil-works/pi-coding-agent';
import { lazyStream } from '@earendil-works/pi-ai';
import { authorBudgetFixture, estimate } from '../roles/author-output-budget.fixture.ts';
import { createPiSession } from '../../src/providers/pi.ts';
import { requestInputBytes } from '../../src/providers/request-input.ts';
import { createRoleFactory } from '../../src/roles/factory.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';

export const findings = [
  'AC-1 要求启动后显示完整状态；实际只有占位文字，期望显示当前阶段与下一步操作。',
  'AC-1 要求非法输入有明确反馈；实际静默忽略，期望保留状态并显示原因。',
  'AC-1 要求正常退出保存进度；实际重新打开回到初始状态，期望恢复最后已完成步骤。',
];
const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

/** Temporary synthetic DAG; real factory, scoped read, Pi, SDK and review parser. Only provider transport is fake. */
export async function designReviewFixture(t, mode = 'changes_requested') {
  const f = await authorBudgetFixture(t), task = f.input.task;
  Object.assign(task, { dependsOn: [], state: 'not_started', attempts: [], artifacts: [], evidence: [] });
  task.inputs.push({ artifactId: 'confirmation', version: 'v1', location: 'requirements/confirmation.json' });
  task.context.tools = ['read'];
  const artifacts = [{ artifactId: 'design', version: 'v1', location: 'artifacts/design.json' },
    { artifactId: 'acceptance-plan', version: 'v1', location: 'artifacts/acceptance-plan.json' }];
  const sources = [...task.inputs, ...artifacts], originals = new Map(), reviewRoot = join(f.root, 'review');
  await mkdir(reviewRoot); await writeFile(join(reviewRoot, 'outside.json'), '{ "unauthorized": true }', 'utf8');
  for (const [index, ref] of sources.entries()) {
    const text = '{\n' + ' '.repeat(6000) + '"data": "' + 'x'.repeat(19500) + '",\n "中文": "原文 空格\\t\\u4e2d\\\"\\\\", "n": 9007199254740993, "n": -0.1200e+02, "index": ' + index + '\n}\n';
    originals.set(ref.location, text);
    for (const root of [f.root, reviewRoot]) { await mkdir(dirname(join(root, ref.location)), { recursive: true }); await writeFile(join(root, ref.location), text, 'utf8'); }
  }
  const evidence = { contractVersion: '1.0.0', evidenceId: 'synthetic-host', taskId: task.taskId, acceptanceIds: task.acceptanceIds,
    kind: 'test_report', source: { artifactId: 'host-report', version: 'v1', location: 'evidence/report.json' },
    artifactVersions: [...task.inputs, ...artifacts], outcome: 'passed', recordedAt: new Date().toISOString(), summary: 'Synthetic protocol evidence only; no runtime acceptance.' };
  await mkdir(join(reviewRoot, 'evidence')); await writeFile(join(reviewRoot, evidence.source.location), JSON.stringify(evidence), 'utf8');
  const dispatches = [], admissions = [], selections = [], receipts = [], sessions = [];
  let currentConfig, native, config, reviewCalls = 0, networkCalls = 0;
  const spendTo = async available => {
    const state = await f.controller.read(), spent = state.ledger.entries.reduce((sum, row) => sum + row.settledMicroCny + row.reservedMicroCny, 0);
    const amount = state.ledger.limitMicroCny - spent - available;
    if (amount > 0) await f.spend(amount, 'synthetic-history-' + state.ledger.entries.length);
  };
  t.mock.method(globalThis, 'fetch', async () => { networkCalls++; throw new Error('NETWORK_DISABLED'); });
  const originalPrompt = AgentSession.prototype.prompt;
  t.mock.method(AgentSession.prototype, 'prompt', function (...args) {
    if (JSON.parse(currentConfig.context).role === 'reviewer') native = this;
    return originalPrompt.apply(this, args);
  });
  const originalCreate = ModelRuntime.create;
  t.mock.method(ModelRuntime, 'create', async function (...args) {
    const supplied = currentConfig, packet = JSON.parse(supplied.context), runtime = await originalCreate.apply(this, args);
    runtime.streamSimple = (model, context, options) => {
      const reviewing = packet.role === 'reviewer'; if (reviewing) reviewCalls++;
      dispatches.push({ role: packet.role, cap: options.maxTokens, inputBytes: requestInputBytes(context), context: structuredClone(context) });
      let content, stopReason = 'stop';
      if (!reviewing) content = [{ type: 'text', text: JSON.stringify({ summary: 'Synthetic author handoff only.', remaining: [], uncertainty: [] }) }];
      else if (reviewCalls === 1) {
        stopReason = 'toolUse'; content = sources.map((ref, index) => ({ type: 'toolCall', id: 'read-' + index, name: 'read', arguments: { path: ref.location } }));
        if (mode === 'outside') content.push({ type: 'toolCall', id: 'outside', name: 'read', arguments: { path: 'outside.json' } });
      } else {
        const verdict = { verdict: mode === 'approved' || mode === 'length' ? 'approved' : 'changes_requested',
          inputVersions: packet.inputs, evidenceIds: packet.evidence.map(item => item.evidenceId), findings: mode === 'approved' || mode === 'length' ? [] : findings };
        if (mode === 'empty-findings') verdict.findings = [];
        if (mode === 'stale') verdict.inputVersions = [{ ...packet.inputs[0], version: 'stale' }];
        content = [{ type: 'text', text: JSON.stringify(verdict) }]; if (mode === 'length') stopReason = 'length';
      }
      return lazyStream(model, async () => (async function* () {
        await options.onProviderStreamEvent({ model: 'deepseek-flash', usage: { prompt_tokens: 1, completion_tokens: 1 } }, model);
        yield { type: 'done', reason: stopReason, message: { role: 'assistant', content, api: 'openai-completions', provider: 'deepseek', model: 'deepseek-flash', stopReason, timestamp: Date.now(), usage } };
      })());
    };
    return runtime;
  });
  const factory = createRoleFactory({ maxOutputTokens: mode === 'raw-floor' ? 4096 : 8192, maxRequests: 16, requestTimeoutMs: 120000,
    ordinaryDesignReviewBudget: mode === 'raw-floor' ? undefined : () => true, estimatedMaxCostMicroCny: estimate, env: { DEEPSEEK_API_KEY: 'synthetic-cos127' },
    sessionFactory: async supplied => {
      currentConfig = supplied; const reviewing = JSON.parse(supplied.context).role === 'reviewer'; if (reviewing) config = supplied;
      const role = await createPiSession({ ...supplied,
        ...(reviewing && supplied.requestOutputLimit ? { requestOutputLimit: mode === 'compact-cap' ? undefined : async (request, signal) => {
          if (reviewCalls === 1 && ['floor', 'below-floor'].includes(mode)) await spendTo(estimate({ ...request, maxOutputTokens: 4096 }) - (mode === 'below-floor' ? 1 : 0));
          const observed = { ...request }; selections.push(observed); const cap = await supplied.requestOutputLimit(request, signal); observed.selected = cap; return cap;
        } } : {}),
        budget: { beforeRequest: async request => {
          if (reviewing) admissions.push(request);
          if (reviewing && reviewCalls === 1 && mode === 'race') await spendTo(1);
          await supplied.budget.beforeRequest(request);
        }, afterResponse: async response => {
          await supplied.budget.afterResponse(response);
          if (reviewing && reviewCalls === 1 && response.outcome === 'settled') await spendTo(229213);
        } },
      });
      sessions.push(role); return role;
    } });
  t.after(async () => { for (const session of sessions) await session.close(); });
  const [result] = await executeTaskDag({ controller: f.controller, requirement: f.input.requirement, tasks: [{ task, role: 'design', workspace: f.root }],
    sessionRoot: join(f.root, 'sessions'), availableArtifacts: task.inputs, roleFactory: factory, reviewProtocolCorrections: 1,
    capture: async () => ({ artifacts, reviewWorkspace: reviewRoot }), verify: async () => [evidence] });
  const state = await f.controller.read(), nativePath = native?.sessionManager.getSessionFile();
  const nativeEntries = nativePath ? (await readFile(nativePath, 'utf8')).trim().split('\n').map(line => JSON.parse(line)) : [];
  for (const admission of admissions) {
    try { receipts.push(JSON.parse(await readFile(join(config.stateDirectory, `billing-${admission.requestId}.json`), 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const [path, original] of originals) assert.equal(await readFile(join(reviewRoot, path), 'utf8'), original);
  assert.equal(networkCalls, 0);
  return { result, state, config, dispatches, admissions, selections, receipts, nativeEntries, originals, reviewCalls };
}
