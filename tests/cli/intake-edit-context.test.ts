import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { runCli } from '../../src/cli/index.ts';
import { createProductHost } from '../../src/runtime/entrypoint-host.ts';
import { gameplayAcceptance, HOST_STAGE_ACCEPTANCE } from '../../src/roles/requirements.ts';
import { fakeInterviewSdk } from '../roles/interview-recovery.fixture.ts';
import { budgetFixture } from '../roles/interview-budget.fixture.ts';
import { requestDesignDraft } from '../../src/roles/interview.ts';
import { fundedIntakeWork } from '../../src/runtime/public-validation-funding-validation.ts';
import { proposal as ordinaryProposal, profile } from '../roles/ordinary.fixture.ts';

const sentinel = '旧稿独有：列表恢复前先制造未保存变化';
const proposal = {
  acceptance: [
    { acceptanceId: 'win', description: '完成目标', steps: ['点击目标'], expected: '胜利', evidenceKinds: ['test_report'] },
    { acceptanceId: 'restore', description: '恢复列表', steps: [sentinel, '点击恢复'], expected: '显示原列表', evidenceKinds: ['test_report'] },
  ],
  experienceCriteria: [{ criterionId: 'readable', description: '列表容易辨认', steps: ['观察恢复后的列表'], expected: '变化清楚' }],
  unsupported: [],
};

test('real public CLI edit sends the previous proposal to the SDK and saves a complete current revision', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos126-cli-'));
  t.after(() => removeOwned(tmpdir(), root));
  const previousKey = process.env.DEEPSEEK_API_KEY; process.env.DEEPSEEK_API_KEY = 'offline-fixture';
  t.after(() => { if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previousKey; });
  let draftCalls = 0, transportAssertion: unknown;
  const sdk = fakeInterviewSdk(t, ['questions', 'draft', 'draft'], false, () => {
    try {
      const context = JSON.parse(sdk.configs.at(-1)!.context!), body = sdk.bodies.at(-1)!;
      assert.ok(body.messages.some((message: any) => message.role === 'system'
        && typeof message.content === 'string' && message.content.includes(JSON.stringify(context))));
      if (++draftCalls === 1) { assert.equal(context.editContext, undefined); return proposal; }
      assert.ok(context.editContext, 'ordinary edit must include the previous generated proposal');
      assert.deepEqual(context.editContext.proposal, proposal);
      assert.equal(JSON.stringify(context.input).includes(sentinel), false);
      assert.deepEqual(context.input.answers, { win: '仅将胜利文字改为完成；保留其他条目。' });
      const revised = structuredClone(context.editContext.proposal);
      revised.acceptance[0].expected = '完成'; return revised;
    } catch (error) { transportAssertion = error; return proposal; }
  });
  const host = createProductHost(fileURLToPath(new URL('../../', import.meta.url)), { sessionFactory: sdk.sessionFactory });
  let text = ''; const output = new PassThrough(); output.on('data', bytes => { text += bytes; });
  assert.deepEqual(await runCli(['new', root, '--brief', '鼠标目标与可恢复列表小游戏'], { host, output,
    input: Readable.from(['点击后胜利，列表可以恢复。\nedit\n仅将胜利文字改为完成；保留其他条目。\nconfirm 1\ncancel\n']) }), { outcome: 'unconfirmed' });
  if (transportAssertion) throw transportAssertion;
  assert.equal(sdk.bodies.length, 3); assert.equal(draftCalls, 2);
  assert.equal('editContext' in JSON.parse(sdk.configs[0].context!), false);
  assert.equal(sdk.configs[1].systemPrompt, sdk.configs[2].systemPrompt);
  const read = async (path: string) => JSON.parse(await readFile(join(root, path), 'utf8'));
  const first = await read('requirements/v1/draft.json'), second = await read('requirements/v2/draft.json');
  assert.deepEqual(gameplayAcceptance(first), proposal.acceptance);
  assert.equal(gameplayAcceptance(second)[0].expected, '完成');
  assert.deepEqual(gameplayAcceptance(second)[1], proposal.acceptance[1]);
  assert.deepEqual(second.experienceCriteria, first.experienceCriteria);
  assert.deepEqual(second.acceptance.slice(-2), HOST_STAGE_ACCEPTANCE);
  assert.deepEqual(second.answers, { win: '仅将胜利文字改为完成；保留其他条目。' });
  assert.equal(JSON.stringify(await read('intake-answers/v2.json')).includes(sentinel), false);
  assert.equal('editContext' in second, false);
  const state = await read('snapshot.json');
  assert.equal(state.confirmation, null); assert.equal(state.run.originalStartedAt, undefined);
  assert.equal(state.draft.revision, 2); assert.match(text, /confirm 2/); assert.match(text, /旧版本无效/);
  assert.match(text, new RegExp(sentinel));
});

test('funded public resume edits saved v3 into v4 while retaining original version 1 evidence and funding', async t => {
  const previousKey = process.env.DEEPSEEK_API_KEY; process.env.DEEPSEEK_API_KEY = 'offline-fixture';
  t.after(() => { if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previousKey; });
  const f = await budgetFixture(t, ['draft', 'draft'], undefined, ordinaryProposal);
  const previous = await requestDesignDraft(f.options);
  for (let revision = 1; revision <= 3; revision++) {
    if (revision > 1) await writeFile(join(f.root, `intake-answers/v${revision}.json`),
      JSON.stringify({ brief: f.options.brief, questions: f.options.questions, answers: f.options.answers, ordinaryProfile: profile }), 'utf8');
    await f.controller.saveDraft(previous);
  }
  const oldPaths = ['intake-sessions/draft-1/intent.json', 'intake-sessions/draft-1/reply.json',
    ...[1, 2, 3].flatMap(revision => [`requirements/v${revision}/draft.json`, `intake-answers/v${revision}.json`])];
  const oldBytes = await Promise.all(oldPaths.map(path => readFile(join(f.root, path))));
  assert.equal(JSON.parse(oldBytes[0].toString('utf8')).formatVersion, 1);
  assert.equal('editContext' in JSON.parse(f.configs[0].context!), false);
  const before = await f.controller.read(); await f.controller.close();
  const host = createProductHost(fileURLToPath(new URL('../../', import.meta.url)), { sessionFactory: f.sessionFactory });
  let text = ''; const output = new PassThrough(); output.on('data', bytes => { text += bytes; });
  const run = (lines: string) => runCli(['resume', f.root], { host, output, input: Readable.from([lines]) });
  assert.deepEqual(await run('edit\n把完成文字改成已完成，保留其余项目。\nconfirm 3\ncancel\n'), { outcome: 'unconfirmed' });
  assert.equal(f.bodies.length, 2);
  const context = JSON.parse(f.configs[1].context!);
  assert.equal(context.editContext.previousRevision, 3); assert.deepEqual(context.editContext.proposal, ordinaryProposal);
  assert.deepEqual(context.input.answers, { goal: '把完成文字改成已完成，保留其余项目。' });
  const current = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(current.draft.revision, 4); assert.equal(current.confirmation, null); assert.equal(current.run.originalStartedAt, undefined);
  assert.deepEqual(current.validationFunding, before.validationFunding); assert.deepEqual(current.ledger.entries.slice(0, 1), before.ledger.entries);
  assert.deepEqual(current.ledger.allocations, before.ledger.allocations); assert.equal(fundedIntakeWork(current).pending.length, 0);
  assert.match(text, /草稿 v3/); assert.match(text, /confirm 4/); assert.match(text, /旧版本无效/);
  for (let i = 0; i < oldPaths.length; i++) assert.ok((await readFile(join(f.root, oldPaths[i]))).equals(oldBytes[i]));
  assert.deepEqual(await run(''), { outcome: 'unconfirmed' }); assert.equal(f.bodies.length, 2);
});
