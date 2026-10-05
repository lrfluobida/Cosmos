import assert from 'node:assert/strict';
import test from 'node:test';
import { validateGameDraft } from '../../src/roles/requirements.ts';
import { genericPersistentDraft } from '../acceptance/generic-persistent.fixture.ts';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { requestDesignDraft } from '../../src/roles/interview.ts';

test('generic draft accepts two normal-input stages with separate acceptance IDs and visible save checks', () => {
  assert.doesNotThrow(() => validateGameDraft(genericPersistentDraft()));
});
test('ordinary interviewer proposes the bounded reopen vocabulary with tools and authority absent', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos66-interview-')), controller = await IntakeController.create({ root, runId: 'game', ledgerId: 'budget', specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 1,
    allocations: [{ taskId: 'intake', amountMicroCny: 100 }] });
  t.after(async () => { await controller.close(); await removeOwned(tmpdir(), root); });
  const expected = genericPersistentDraft(); let config: any;
  const result = await requestDesignDraft({ controller, roundId: 'draft-1', brief: expected.brief, questions: expected.questions, answers: expected.answers,
    maxOutputTokens: 2048, requestTimeoutMs: 1000, estimatedMaxCostMicroCny: 100, sessionFactory: async options => {
      config = options; return { async prompt() { return { text: JSON.stringify({ acceptance: expected.acceptance, scenario: expected.scenario, unsupported: [] }) }; }, async close() {} } as any;
    } });
  assert.deepEqual(result, expected); assert.deepEqual(config.tools, []); assert.match(config.systemPrompt, /scenario\.reopen/); assert.match(config.systemPrompt, /No URL, profile, PID, storage payload/);
  assert.equal((await controller.read()).confirmation, null); assert.equal((await controller.read()).requests.length, 0);
});
test('generic draft rejects unconfirmed transport fields, missing inputs and changed save checks', () => {
  const changes = [
    (d: any) => { d.scenario.reopen.profile = 'user-profile'; }, (d: any) => { d.scenario.reopen.url = 'http://127.0.0.1:1'; },
    (d: any) => { d.scenario.reopen.storageSeed = { coins: 7 }; }, (d: any) => { d.scenario.reopen.pid = 1; },
    (d: any) => { d.scenario.reopen.steps[0] = { id: 'continue', kind: 'evaluate', expression: 'coins=7' }; },
    (d: any) => { d.scenario.reopen.steps.shift(); }, (d: any) => { d.scenario.reopen.steps[1].expected = 'wrong'; },
    (d: any) => { d.scenario.reopen.checkpoint.snapshot = { kind: 'debug', path: ['save'] }; },
    (d: any) => { d.scenario.reopen.checkpoint.savedSnapshot = d.scenario.reopen.checkpoint.snapshot; },
    (d: any) => { d.scenario.reopen.steps = Array.from({ length: 201 }, (_, i) => ({ ...d.scenario.reopen.steps[0], id: 'click-' + i })); },
    (d: any) => { d.acceptance.push({ ...d.acceptance[0], acceptanceId: 'missing' }); },
  ];
  for (const change of changes) { const draft = genericPersistentDraft(); change(draft); assert.throws(() => validateGameDraft(draft)); }
});
