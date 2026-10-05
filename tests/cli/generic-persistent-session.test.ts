import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { genericPersistentDraft } from '../acceptance/generic-persistent.fixture.ts';

test('public CLI displays and confirms both save stages then dispatches the exact draft without orchestration changes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos66-cli-')); t.after(() => removeOwned(tmpdir(), root));
  let stdout = '', executed: any; const output = new PassThrough(); output.on('data', chunk => { stdout += chunk; });
  const draft = genericPersistentDraft();
  await runCli(['new', root, '--brief', draft.brief], { input: Readable.from([draft.answers.save + '\nedit\n' + draft.answers.save + '\nconfirm 1\nconfirm 2\n']), output, host: {
    async prepare() { return { environmentReady: true, executionReady: true }; }, async questions() { return draft.questions; },
    async draft(input) { return { ...draft, questions: input.questions, answers: input.answers, brief: input.brief }; },
    async execute(input) { executed = input; return { outcome: 'incomplete', gaps: ['Injected dispatch; no native generation'] }; },
  } });
  assert.ok(executed); assert.match(stdout, /关闭浏览器进程/); assert.match(stdout, /#continue/); assert.match(stdout, /#buy/);
  assert.equal(executed.requirement.sources[0].version, 'v2'); assert.equal(executed.requirement.confirmedBy, 'local-user');
  assert.deepEqual(executed.draft.scenario.reopen, draft.scenario.reopen);
  const path = join(root, executed.requirement.sources[0].location), changed = JSON.parse(await readFile(path, 'utf8')); changed.scenario.reopen.checkpoint.expected = 'changed';
  await writeFile(path, JSON.stringify(changed), 'utf8');
  await assert.rejects(runCli(['resume', root], { input: Readable.from([]), output, host: {
    async prepare() { throw new Error('Unexpected preparation'); }, async questions() { throw new Error('Unexpected interview'); }, async draft() { throw new Error('Unexpected draft'); },
    async execute() { throw new Error('Changed source must not execute'); },
  } }));
});
