import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { IntakeController } from '../../src/runtime/intake.ts';
import { validateGameDraft } from '../../src/roles/requirements.ts';
import * as interview from '../../src/roles/interview.ts';
const questions = [{ id: 'win', prompt: '何时获胜？' }];
const proposal = { acceptance: [{ acceptanceId: 'win', description: '点击目标后获胜', steps: ['点击目标'], expected: '胜利', evidenceKinds: ['test_report'] }],
  scenario: { viewport: { width: 1280, height: 720 }, steps: [
    { id: 'click', kind: 'locator-click', selector: '#target', timeoutMs: 1000 },
    { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 },
  ] }, unsupported: [] };
async function fixture(t: test.TestContext) {
  assert.equal(typeof interview.requestDesignQuestions, 'function', 'Native design intake entrypoint is required');
  const root = await mkdtemp(join(tmpdir(), 'cosmos-interview-'));
  const controller = await IntakeController.create({ root, runId: 'interview', ledgerId: 'one-ledger', specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 8,
    allocations: [{ taskId: 'intake', amountMicroCny: 1000 }] });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  let calls = 0;
  const settings = { controller, maxOutputTokens: 2048, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 100, env: { DEEPSEEK_API_KEY: 'secret-fixture' },
    sessionFactory: async (config: any) => ({
      async prompt(text: string) {
        calls++;
        assert.deepEqual(config.tools, []); assert.equal(config.modelId, 'deepseek-flash');
        assert.ok(!config.context.includes('secret-fixture')); assert.ok(!config.context.includes('confirmedBy'));
        const requestId = `request-${calls}`;
        await config.budget.beforeRequest({ requestId, modelId: 'deepseek-flash', maxOutputTokens: 2048, inputBytes: 20, hasImages: false, estimatedMaxCostMicroCny: 100 });
        await config.budget.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
        return { text: JSON.stringify(JSON.parse(text).phase === 'questions' ? { questions } : proposal) };
      }, async close() {},
    }),
  };
  return { root, controller, settings, calls: () => calls };
}

for (const brief of ['点击星星得分', '收集宝物并躲避障碍']) test(`native design accepts a dynamic brief: ${brief}`, async t => {
  const { controller, settings, calls } = await fixture(t);
  const asked = await interview.requestDesignQuestions({ ...settings, roundId: 'questions-1', brief });
  assert.deepEqual(asked, questions);
  const draft = await interview.requestDesignDraft({ ...settings, roundId: 'draft-1', brief, questions: asked, answers: { win: '点击目标获胜' } });
  assert.equal(draft.brief, brief); assert.deepEqual(draft.questions, questions); assert.equal(draft.answers.win, '点击目标获胜');
  assert.equal(calls(), 2); assert.equal((await controller.read()).ledger.entries.reduce((sum, item) => sum + item.settledMicroCny, 0), 20);
  assert.equal((await controller.read()).confirmation, null);
});

test('reusing an exact completed interview step reads its receipt without another paid request', async t => {
  const { settings, calls } = await fixture(t);
  const options = { ...settings, roundId: 'questions-1', brief: '点击星星得分' };
  assert.deepEqual(await interview.requestDesignQuestions(options), questions);
  assert.deepEqual(await interview.requestDesignQuestions(options), questions); assert.equal(calls(), 1);
  await assert.rejects(interview.requestDesignQuestions({ ...options, brief: '不同需求' }), /identity|input|changed/i);
  assert.equal(calls(), 1);
});

test('a started interview with no durable reply cannot be blindly repeated', async t => {
  const { settings, calls } = await fixture(t);
  const failed = { ...settings, sessionFactory: async () => ({ async prompt() { throw new Error('lost reply'); }, async close() {} }) };
  await assert.rejects(interview.requestDesignQuestions({ ...failed, roundId: 'questions-1', brief: '点击星星得分' }), /lost reply|incomplete/i);
  await assert.rejects(interview.requestDesignQuestions({ ...settings, roundId: 'questions-1', brief: '点击星星得分' }), /incomplete|reply/i);
  assert.equal(calls(), 0);
});

test('model cannot provide user confirmation or replace host brief and answers', async t => {
  const { settings } = await fixture(t);
  for (const injected of [{ questions, confirmed: true }, { ...proposal, actorId: 'model-user' }, { ...proposal, brief: '替换用户需求' }]) {
    const options = { ...settings, roundId: `bad-${Object.keys(injected).at(-1)}`, brief: '点击星星得分', questions, answers: { win: '获胜' },
      sessionFactory: async () => ({ async prompt() { return { text: JSON.stringify(injected) }; }, async close() {} }) };
    const method = 'questions' in injected ? interview.requestDesignQuestions : interview.requestDesignDraft;
    await assert.rejects(method(options), /field|proposal|question/i);
  }
});

test('only read-only debug assertions or executable scenario steps are rejected before confirmation', () => {
  const draft = { brief: '点击星星得分', questions, answers: { win: '获胜' }, ...proposal };
  for (const steps of [
    [{ id: 'write', kind: 'evaluate', expression: 'state.win=true' }],
    [proposal.scenario.steps[0], { ...proposal.scenario.steps[1], observation: { kind: 'debug', path: ['win'] }, expected: true }],
  ]) assert.throws(() => validateGameDraft({ ...draft, scenario: { ...draft.scenario, steps } }), /Unsupported|scenario/i);
});
