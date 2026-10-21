import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { runProductSession } from '../../src/cli/session.ts';
import type { ProductHost } from '../../src/cli/session.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { preparationAcceptance, validateGameDraft } from '../../src/roles/requirements.ts';
import { resolveDraftMode } from '../../src/roles/preparation-mode.ts';
import { ordinaryDraft, profile, brief, questions } from '../roles/ordinary.fixture.ts';
import { proposal as legacyProposal } from '../roles/interview-recovery.fixture.ts';

const gaps = ['键盘与触摸操作尚未支持'];
const originalAnswer = '仅用鼠标，不需要键盘与触摸。';
const revisedAnswer = '仍然只用鼠标，键盘与触摸明确排除。';
const limits = { limitMicroCny: 5_000_000, durationMs: 1_800_000 };
async function charge(controller: IntakeController, requestId: string) {
  await controller.reserve({ requestId, taskId: 'intake', provider: 'deepseek', pricingVersion: 'fixture', estimatedMaxCostMicroCny: 100 });
  await controller.admit(requestId);
  await controller.settle(requestId, 10, [{ artifactId: 'fixture-bill', version: 'v1', location: 'fixture-bill.json' }]);
}
async function fixture(t: test.TestContext, mode: 'ordinary' | 'legacy' | 'preparation' = 'ordinary') {
  const root = await mkdtemp(join(tmpdir(), 'cos115-session-')); t.after(() => removeOwned(tmpdir(), root));
  const output = new PassThrough(); let text = '', executions = 0, questionCalls = 0;
  output.on('data', chunk => { text += chunk.toString(); });
  const draftMode = mode === 'preparation' ? 'cos16-input/1' as const : undefined;
  const host: ProductHost = {
    ...(mode === 'ordinary' ? { ordinaryProfile: profile } : {}),
    async prepare() { return { environmentReady: true, executionReady: true }; },
    async questions(input) { questionCalls++; await charge(input.controller, input.roundId); return questions; },
    async draft(input) {
      await charge(input.controller, input.roundId);
      const base = mode === 'ordinary' ? ordinaryDraft() : mode === 'legacy' ? legacyProposal
        : { preparation: resolveDraftMode(draftMode)!, acceptance: preparationAcceptance(resolveDraftMode(draftMode)!) };
      const draft = { ...base, brief: input.brief, questions: input.questions, answers: input.answers,
        unsupported: input.roundId === 'draft-1' ? [...gaps] : [] };
      validateGameDraft(draft, draftMode, mode === 'ordinary' ? profile : undefined); return draft;
    },
    async execute() { executions++; return { outcome: 'fixture-executed' }; },
  };
  const run = (command: 'new' | 'resume', input: string, selectedHost = host) => runProductSession({ command, root, host: selectedHost,
    ...(command === 'new' ? { brief, ...(draftMode ? { draftMode } : { limits }) } : {}), input: Readable.from([input]), output });
  const bytes = (path: string) => readFile(join(root, path));
  const state = async () => JSON.parse((await bytes('snapshot.json')).toString('utf8'));
  return { root, host, run, state, bytes, text: () => text, executions: () => executions, questionCalls: () => questionCalls };
}
function assertUnconfirmed(state: any) {
  assert.equal(state.formatVersion, 'intake-1'); assert.equal(state.confirmation, null); assert.equal(state.stopReason, null);
  assert.equal(state.run.originalStartedAt, undefined); assert.equal(state.run.originalDeadlineAt, undefined);
  assert.equal(state.events.filter((event: any) => event.type === 'generation_activated').length, 0);
}

test('unsupported new draft can edit to a supported revision without implicit confirmation', async t => {
  const f = await fixture(t);
  const result = await f.run('new', `${originalAnswer}\nedit\n${revisedAnswer}\ncancel\n`);
  const state = await f.state();
  assert.equal(state.draft.revision, 2); assert.deepEqual(state.draft.unsupported, []);
  assert.deepEqual(result, { outcome: 'unconfirmed' }); assertUnconfirmed(state); assert.equal(f.executions(), 0);
  assert.equal(state.draft.answers.goal, revisedAnswer); assert.equal(f.questionCalls(), 1);
  assert.deepEqual(JSON.parse((await f.bytes('requirements/v1/draft.json')).toString('utf8')).unsupported, gaps);
  assert.equal(JSON.parse((await f.bytes('intake-answers/v1.json')).toString('utf8')).answers.goal, originalAnswer);
  assert.match(f.text(), /尚不支持的要求/); assert.match(f.text(), /修改回答输入 edit；退出输入 cancel/);
  assert.match(f.text(), /confirm 2/);
});

test('unsupported direct confirm and invalid input never call confirmation or activation', async t => {
  const confirm = t.mock.method(IntakeController.prototype, 'confirm');
  const activate = t.mock.method(IntakeController.prototype, 'activateGeneration');
  const f = await fixture(t);
  assert.deepEqual(await f.run('new', `${originalAnswer}\nconfirm 1\nother\ncancel\n`), { outcome: 'unsupported', gaps });
  assert.match(f.text(), /必须先修改/); assert.doesNotMatch(f.text(), /确认当前版本请输入 confirm/);
  assert.equal(confirm.mock.callCount(), 0); assert.equal(activate.mock.callCount(), 0); assert.equal(f.executions(), 0);
  const state = await f.state(); assertUnconfirmed(state); assert.equal(state.requests.length, 2);
});

for (const input of ['cancel\n', '']) test(`unsupported ${input ? 'cancel' : 'EOF'} preserves the original result and history`, async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.run('new', `${originalAnswer}\n${input}`), { outcome: 'unsupported', gaps });
  const paths = ['snapshot.json', 'intake-origin.json', 'requirements/v1/draft.json', 'intake-answers/v1.json'];
  const before = await Promise.all(paths.map(f.bytes));
  assert.deepEqual(await f.run('resume', input), { outcome: 'unsupported', gaps });
  assert.deepEqual(await Promise.all(paths.map(f.bytes)), before);
  assert.match(f.text(), /修改回答输入 edit；退出输入 cancel/);
  assertUnconfirmed(await f.state()); assert.equal(f.executions(), 0); assert.equal(f.questionCalls(), 1);
});

test('unsupported resume edits the same intake with original questions, fees and limits and rejects stale confirmation', async t => {
  const f = await fixture(t); await f.run('new', `${originalAnswer}\ncancel\n`);
  const before = await f.state(), paths = ['intake-origin.json', 'requirements/v1/draft.json', 'intake-answers/v1.json'];
  const oldFiles = await Promise.all(paths.map(f.bytes));
  const resumedHost: ProductHost = { ...f.host, ordinaryProfile: undefined,
    async questions() { throw new Error('The original questions must be reused'); },
    async draft(input) { assert.deepEqual(input.questions, questions); return f.host.draft(input); } };
  assert.deepEqual(await f.run('resume', `edit\n${revisedAnswer}\nconfirm 1\ncancel\n`, resumedHost), { outcome: 'unconfirmed' });
  const revised = await f.state(); assertUnconfirmed(revised); assert.equal(revised.draft.revision, 2);
  assert.equal(revised.draft.ordinaryProfile, profile); assert.deepEqual(revised.draft.questions, before.draft.questions);
  for (const key of ['run', 'createdAt', 'durationMs', 'maxRequests', 'interviewTaskId', 'ordinaryProfile', 'modularRepairPolicy', 'draftMode']) assert.deepEqual(revised[key], before[key]);
  assert.deepEqual(revised.ledger.allocations, before.ledger.allocations); assert.equal(revised.ledger.ledgerId, before.ledger.ledgerId);
  assert.equal(revised.ledger.limitMicroCny, limits.limitMicroCny); assert.equal(revised.maxRequests, 8);
  assert.deepEqual(revised.ledger.entries.slice(0, 2), before.ledger.entries); assert.equal(revised.ledger.entries.length, 3);
  assert.deepEqual(revised.requests.slice(0, 2), before.requests); assert.equal(revised.requests.length, 3);
  assert.deepEqual(await Promise.all(paths.map(f.bytes)), oldFiles); assert.match(f.text(), /旧版本无效/);
  assert.equal(f.executions(), 0);
  await assert.rejects(f.bytes('requirements/v1/confirmation.json'), { code: 'ENOENT' });
  await assert.rejects(f.bytes('requirements/v2/confirmation.json'), { code: 'ENOENT' });
  assert.deepEqual(await f.run('resume', 'confirm 2\n', resumedHost), { outcome: 'fixture-executed' });
  const active = await f.state(); assert.equal(active.formatVersion, 1); assert.equal(f.executions(), 1);
  assert.equal(active.run.runId, before.run.runId); assert.deepEqual(active.ledger, revised.ledger); assert.deepEqual(active.requests, revised.requests);
  assert.equal(active.run.fees.settledMicroCny, 30);
  assert.equal(Date.parse(active.run.originalDeadlineAt) - Date.parse(active.run.originalStartedAt), limits.durationMs);
  assert.equal(JSON.parse((await f.bytes('requirements/v2/confirmation.json')).toString('utf8')).revision, 2);
});

test('unsupported edit cannot exceed the original intake request cap', async t => {
  const f = await fixture(t); await f.run('new', `${originalAnswer}\ncancel\n`);
  const controller = await IntakeController.open({ root: f.root });
  try { for (let index = 2; index < 8; index++) await charge(controller, `existing-${index}`); } finally { await controller.close(); }
  const before = await f.state();
  await assert.rejects(f.run('resume', `edit\n${revisedAnswer}\nconfirm 2\n`), /request limit/i);
  const after = await f.state(); assertUnconfirmed(after); assert.deepEqual(after.ledger, before.ledger); assert.deepEqual(after.requests, before.requests);
  assert.equal(after.maxRequests, 8); assert.equal(after.draft.revision, 1); assert.deepEqual(after.draft.unsupported, gaps); assert.equal(f.executions(), 0);
});

for (const mode of ['legacy', 'preparation'] as const) test(`${mode} unsupported edit retains its mode and confirms only the new revision`, async t => {
  const f = await fixture(t, mode);
  assert.deepEqual(await f.run('new', `${originalAnswer}\nedit\n${revisedAnswer}\nconfirm 1\nconfirm 2\n`), { outcome: 'fixture-executed' });
  assert.equal(f.executions(), 1); assert.equal(f.questionCalls(), 1); assert.match(f.text(), /旧版本无效/);
  const draft = JSON.parse((await f.bytes('requirements/v2/draft.json')).toString('utf8'));
  assert.equal(draft.ordinaryProfile, undefined); assert.deepEqual(draft.questions, questions);
  if (mode === 'preparation') assert.deepEqual(draft.preparation, resolveDraftMode('cos16-input/1'));
  else assert.deepEqual(draft.scenario, legacyProposal.scenario);
});
