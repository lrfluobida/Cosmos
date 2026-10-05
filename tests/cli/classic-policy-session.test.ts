import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { genericPersistentDraft } from '../acceptance/generic-persistent.fixture.ts';

test('public stdin displays the full classic gap and persists only the explicitly confirmed selection', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos67-cli-')); t.after(() => removeOwned(tmpdir(), root));
  const draft = { ...genericPersistentDraft(), benchmark: 'classic-pc-runtime-policy/1' as const }; let executed: any, stdout = '';
  const output = new PassThrough(); output.on('data', chunk => { stdout += chunk; });
  await runCli(['new', root, '--brief', draft.brief], { input: Readable.from([draft.answers.save + '\nconfirm 1\n']), output, host: {
    async prepare() { return { environmentReady: true, executionReady: true }; }, async questions() { return draft.questions; },
    async draft(input) { return { ...draft, brief: input.brief, questions: input.questions, answers: input.answers }; },
    async execute(input) { executed = input; return { outcome: 'incomplete', gaps: ['Explicit CLI transport fixture; no provider/game generation'] }; },
  } });
  assert.ok(executed); assert.match(stdout, /230.*221.*7/); assert.match(stdout, /完整经典验收仍未通过/);
  assert.equal(executed.draft.benchmark, draft.benchmark); assert.equal(executed.requirement.confirmedBy, 'local-user');
  const source = JSON.parse(await readFile(join(root, executed.requirement.sources[0].location), 'utf8'));
  assert.deepEqual(source, executed.draft); assert.equal(source.benchmark, draft.benchmark);
  const confirmation = JSON.parse(await readFile(join(root, executed.requirement.sources[1].location), 'utf8'));
  assert.deepEqual(confirmation.draft, executed.requirement.sources[0]); assert.equal(confirmation.confirmed, true);
});
