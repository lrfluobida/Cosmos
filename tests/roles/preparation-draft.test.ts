import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as requirements from '../../src/roles/requirements.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { requestDesignDraft, requestDesignQuestions } from '../../src/roles/interview.ts';

const source = JSON.parse(await readFile(new URL('../../probes/transfer/requirements.json', import.meta.url), 'utf8'));
const selection = { kind: 'preparation', adapterId: 'cos16-input/1', sourceVersion: 'cos16-transfer-v1' };
const questions = [{ id: 'scope', prompt: '确认单关鼠标推箱子的范围？' }];
const preparation = () => ({ preparation: structuredClone(selection), brief: '我要单关鼠标推箱子，中文界面和保存后继续。', questions, answers: { scope: '一个玩家、两个箱子和两个目标。' }, acceptance: structuredClone(source.preparation.acceptance), unsupported: [] });
const browser = () => ({ brief: '点击星星', questions, answers: { scope: '点击获胜' }, acceptance: [{ acceptanceId: 'win', description: '点击获胜', steps: ['点击'], expected: '获胜', evidenceKinds: ['test_report'] }], scenario: { viewport: { width: 1280, height: 720 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#star', timeoutMs: 1000 }, { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#status' }, expected: '获胜', timeoutMs: 1000 }] }, unsupported: [] });
const validate = requirements.validateGameDraft as (value: unknown, mode?: string) => void;

test('preparation strictly preserves the full source contract without an executable scenario', () => {
  const draft = preparation();
  assert.doesNotThrow(() => validate(draft, 'cos16-input/1'));
  assert.deepEqual(draft.acceptance.slice(6), requirements.HOST_STAGE_ACCEPTANCE);
  assert.throws(() => validate(draft), /mode|browser|fields/i);
  assert.throws(() => validate(browser(), 'cos16-input/1'), /mode|preparation|fields/i);
  assert.throws(() => validate(draft, 'unknown'), /mode/i);
});

test('preparation refuses mixed fields, fake authority, mode/version switches and missing or weakened criteria', () => {
  for (const extra of [{ scenario: browser().scenario }, { map: {} }, { solution: [] }, { paths: {} }, { confirmedBy: 'model' }, { preparation: { ...selection, adapterId: 'arbitrary' } }, { preparation: { ...selection, sourceVersion: 'changed' } }, { preparation: { ...selection, kind: 'browser' } }]) {
    assert.throws(() => validate({ ...preparation(), ...extra }, 'cos16-input/1'), /fields|mode|version|preparation/i);
  }
  for (const acceptance of [source.preparation.acceptance.slice(1), source.preparation.acceptance.map((item: any, i: number) => i === 0 ? { ...item, expected: '缩小范围' } : item)]) {
    assert.throws(() => validate({ ...preparation(), acceptance }, 'cos16-input/1'), /acceptance|contract/i);
  }
  const draft = browser(), bytes = JSON.stringify(draft);
  validate(draft); assert.equal(JSON.stringify(draft), bytes);
  assert.deepEqual(Object.keys(draft), ['brief', 'questions', 'answers', 'acceptance', 'scenario', 'unsupported']);
});

test('SYNTHETIC native preparation receives persisted scope and emits no scenario or authority', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos53-native-'));
  const controller = await IntakeController.create({ root, runId: 'synthetic', ledgerId: 'one', specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 4, draftMode: 'cos16-input/1', allocations: [{ taskId: 'intake', amountMicroCny: 1000 }] } as any);
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  let calls = 0;
  const brief = preparation().brief, answers = preparation().answers;
  const options = { controller, brief, maxOutputTokens: 2048, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 100, sessionFactory: async (config: any) => ({
    async prompt(text: string) {
      calls++; assert.deepEqual(config.tools, []);
      const context = JSON.parse(config.context);
      assert.deepEqual(context.draftMode, selection);
      assert.equal(context.preparation.scope, source.preparation.brief);
      assert.deepEqual(context.preparation.acceptance, source.preparation.acceptance);
      assert.match(config.systemPrompt, /preparation/); assert.match(config.systemPrompt, /unsupported/);
      const requestId = `synthetic-${calls}`;
      await config.budget.beforeRequest({ requestId, modelId: 'deepseek-flash', maxOutputTokens: 2, inputBytes: 10, hasImages: false, estimatedMaxCostMicroCny: 100 });
      await config.budget.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
      return { text: JSON.stringify(JSON.parse(text).phase === 'questions' ? { questions } : { acceptance: source.preparation.acceptance, unsupported: [] }) };
    }, async close() {},
  }) };
  const asked = await requestDesignQuestions({ ...options, roundId: 'questions' });
  const draft = await requestDesignDraft({ ...options, roundId: 'draft', questions: asked, answers });
  assert.deepEqual(draft, preparation()); assert.equal(calls, 2);
  assert.deepEqual(await requestDesignDraft({ ...options, roundId: 'draft', questions: asked, answers }), draft); assert.equal(calls, 2);
  assert.equal((await controller.read()).ledger.entries.reduce((total, item) => total + item.settledMicroCny, 0), 20);
  for (const extra of [{ scenario: browser().scenario }, { kind: 'preparation' }, { adapterId: 'cos16-input/1' }, { confirmedBy: 'model' }]) {
    await assert.rejects(requestDesignDraft({ ...options, roundId: `bad-${Object.keys(extra)[0]}`, questions, answers, sessionFactory: async () => ({ async prompt() { return { text: JSON.stringify({ acceptance: source.preparation.acceptance, unsupported: [], ...extra }) }; }, async close() {} }) }), /fields|proposal/i);
  }
});

test('SYNTHETIC browser interviewer cannot switch its persisted default mode through model output', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos53-default-native-'));
  const controller = await IntakeController.create({ root, runId: 'synthetic-default', ledgerId: 'one', specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 2, allocations: [{ taskId: 'intake', amountMicroCny: 1000 }] });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  await assert.rejects(requestDesignDraft({ controller, roundId: 'switch', brief: preparation().brief, questions, answers: preparation().answers, maxOutputTokens: 2048, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 100,
    sessionFactory: async () => ({ async prompt() { return { text: JSON.stringify({ preparation: selection, acceptance: source.preparation.acceptance, unsupported: [] }) }; }, async close() {} }),
  }), /fields|proposal/i);
  assert.equal((await controller.read()).draft, null); assert.equal((await controller.read()).draftMode, undefined);
});
