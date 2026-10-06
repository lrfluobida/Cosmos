import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { validateGameDraft, withHostStages } from '../../src/roles/requirements.ts';
import { preparationAcceptance } from '../../src/roles/requirements.ts';
import { resolveDraftMode } from '../../src/roles/preparation-mode.ts';

test('public stdin displays both module criteria and fixed profile before cancellation without activation', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos71-confirm-')); t.after(() => removeOwned(tmpdir(), root));
  let text = '', executed = 0; const output = new PassThrough(); output.on('data', bytes => { text += bytes; });
  const host = { prepare: async () => ({ environmentReady: true, executionReady: true }), questions: async () => [{ id: 'goal', prompt: '目标？' }],
    draft: async (input: any) => withHostStages({ codeProfile: 'modular-code/1', brief: input.brief, questions: input.questions, answers: input.answers, unsupported: [],
      acceptance: [{ acceptanceId: 'win', description: '点击获胜', steps: ['点击目标'], expected: '胜利', evidenceKinds: ['test_report'] }],
      scenario: { viewport: { width: 1280, height: 720 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#target', timeoutMs: 1000 },
        { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] } } as any),
    execute: async () => { executed++; } };
  await runCli(['new', root, '--brief', '分模块点击游戏'], { host, input: Readable.from(['点击获胜\ncancel\n']), output });
  assert.match(text, /编码模块 A/); assert.match(text, /编码模块 B/); assert.match(text, /局部编译/); assert.match(text, /40%/);
  const state = JSON.parse(await readFile(join(root, 'snapshot.json'), 'utf8'));
  assert.equal(state.formatVersion, 'intake-1'); assert.equal(state.confirmation, null); assert.equal(state.draft.codeProfile, 'modular-code/1');
  assert.equal(executed, 0); assert.deepEqual(state.ledger.entries, []);
});
test('preparation cannot silently enable a modular browser profile', () => {
  const preparation = resolveDraftMode('cos16-input/1')!;
  assert.throws(() => validateGameDraft({ brief: '推箱子', questions: [{ id: 'goal', prompt: '目标？' }], answers: { goal: '获胜' }, unsupported: [],
    preparation, acceptance: preparationAcceptance(preparation), codeProfile: 'modular-code/1' }, 'cos16-input/1'));
});
