import assert from 'node:assert/strict';
import test from 'node:test';
import { validateGameDraft } from '../../src/roles/requirements.ts';
import { genericPersistentDraft } from '../acceptance/generic-persistent.fixture.ts';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { IntakeController } from '../../src/runtime/intake.ts';
import { requestDesignDraft } from '../../src/roles/interview.ts';
import { removeOwned } from '../../src/artifacts/paths.ts';

test('classic policy selection is exact data in the confirmable browser draft', () => {
  const draft = { ...genericPersistentDraft(), benchmark: 'classic-pc-runtime-policy/1' };
  assert.doesNotThrow(() => validateGameDraft(draft));
  for (const selection of ['classic', 'latest', { outcome: 'passed' }, true]) {
    assert.throws(() => validateGameDraft({ ...draft, benchmark: selection }));
  }
});
test('selected offline policy requires confirmed normal save and reopen steps', () => {
  const draft: any = { ...genericPersistentDraft(), benchmark: 'classic-pc-runtime-policy/1' };
  delete draft.scenario.reopen; assert.throws(() => validateGameDraft(draft));
  assert.doesNotThrow(() => validateGameDraft(genericPersistentDraft()));
});
test('ordinary interview may propose the exact policy selection without choosing outcomes or confirming', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos67-interview-')), controller = await IntakeController.create({ root, runId: 'fixture', ledgerId: 'fixture', specVersion: '1.0',
    interviewTaskId: 'intake', maxRequests: 1, allocations: [{ taskId: 'intake', amountMicroCny: 100 }] });
  t.after(async () => { await controller.close(); await removeOwned(tmpdir(), root); });
  const draft = genericPersistentDraft();
  const actual = await requestDesignDraft({ controller, roundId: 'fixture-draft', brief: draft.brief, questions: draft.questions, answers: draft.answers,
    maxOutputTokens: 2000, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 100, sessionFactory: async config => {
      assert.match(config.systemPrompt, /classic-pc-runtime-policy\/1/); assert.deepEqual(config.tools, []);
      return { async prompt() { return { text: JSON.stringify({ acceptance: draft.acceptance, scenario: draft.scenario, unsupported: [], benchmark: 'classic-pc-runtime-policy/1' }) }; }, async close() {} } as any;
    } });
  assert.equal(actual.benchmark, 'classic-pc-runtime-policy/1'); assert.equal((await controller.read()).confirmation, null); assert.equal((await controller.read()).requests.length, 0);
});
