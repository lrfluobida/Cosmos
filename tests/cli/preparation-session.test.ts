import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, PassThrough } from 'node:stream';
import test from 'node:test';
import { runProductSession } from '../../src/cli/session.ts';

const source = JSON.parse(await readFile(new URL('../../probes/transfer/requirements.json', import.meta.url), 'utf8'));
async function fixture(t: test.TestContext) {
  const parent = await mkdtemp(join(tmpdir(), 'cos53-stdin-')), root = join(parent, 'run');
  t.after(() => rm(parent, { recursive: true, force: true }));
  let text = '', calls = 0, executed: any;
  const output = new PassThrough(); output.on('data', chunk => { text += chunk; });
  const host = {
    async prepare() { return { environmentReady: true, executionReady: true }; },
    async questions(input: any) { calls++; assert.equal((await input.controller.read()).draftMode.adapterId, 'cos16-input/1'); return [{ id: 'scope', prompt: '请确认推箱子范围？' }]; },
    async draft(input: any) { calls++; return { preparation: { kind: 'preparation', adapterId: 'cos16-input/1', sourceVersion: 'cos16-transfer-v1' }, brief: input.brief, questions: input.questions, answers: input.answers, acceptance: structuredClone(source.preparation.acceptance), unsupported: input.answers.scope === '要战斗' ? ['战斗要求超出当前可信模式。'] : [] }; },
    async execute(input: any) { executed = input; return { outcome: 'synthetic_only' }; },
  };
  return { root, host, output, text: () => text, calls: () => calls, executed: () => executed };
}
const brief = '中文单关鼠标推箱子；保存并继续游戏。';
const run = (options: any) => runProductSession(options);

test('unknown internal selection has no directory, provider or stdin effect', async t => {
  const f = await fixture(t); let prepared = 0;
  await assert.rejects(run({ ...f, command: 'new', brief, draftMode: 'unknown', input: Readable.from([]), host: { ...f.host, async prepare() { prepared++; return { environmentReady: true, executionReady: true }; } } }), /mode/i);
  assert.equal(prepared, 0); assert.equal(f.calls(), 0); assert.equal(f.text(), '');
  await assert.rejects(access(f.root), { code: 'ENOENT' });
});

test('SYNTHETIC stdin editing displays full preparation requirements and confirms the exact second revision', async t => {
  const f = await fixture(t);
  await run({ ...f, command: 'new', brief, draftMode: 'cos16-input/1', input: Readable.from(['两个箱子\nedit\n两个箱子和两个目标\nconfirm 1\nconfirm 2\n']) });
  assert.equal(f.executed().draft.brief, brief); assert.equal(f.executed().draft.answers.scope, '两个箱子和两个目标');
  assert.equal(f.executed().requirement.sources[0].version, 'v2'); assert.equal(f.executed().requirement.confirmedBy, 'local-user');
  assert.ok(!('scenario' in f.executed().draft)); assert.match(f.text(), /运行时设计|准备模式/);
  for (const item of source.preparation.acceptance) assert.ok(f.text().includes(item.description));
  const snapshot = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(snapshot.formatVersion, 1); assert.equal(snapshot.ledger.ledgerId, `${snapshot.run.runId}-budget`);
  assert.equal(snapshot.events.filter((event: any) => event.type === 'generation_activated').length, 1);
});

for (const answer of ['cancel', '']) test(`SYNTHETIC preparation refusal/EOF ${answer || 'EOF'} never activates`, async t => {
  const f = await fixture(t);
  await run({ ...f, command: 'new', brief, draftMode: 'cos16-input/1', input: Readable.from([`两个箱子\n${answer}\n`]) });
  assert.equal(f.executed(), undefined);
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.formatVersion, 'intake-1'); assert.equal(state.confirmation, null); assert.equal(state.run.originalStartedAt, undefined);
});

test('unsupported requested scope stays visible and cannot be silently confirmed', async t => {
  const f = await fixture(t);
  const result = await run({ ...f, command: 'new', brief: brief + '另要战斗', draftMode: 'cos16-input/1', input: Readable.from(['要战斗\nconfirm 1\n']) });
  assert.equal(result.outcome, 'unsupported'); assert.equal(f.executed(), undefined); assert.match(f.text(), /战斗要求超出/); assert.ok(f.text().includes('另要战斗'));
});

test('cold intake and activated resume reuse the original mode and exact records without generic fallback', async t => {
  const f = await fixture(t);
  await run({ ...f, command: 'new', brief, draftMode: 'cos16-input/1', input: Readable.from(['两个箱子\ncancel\n']) });
  const first = await readFile(join(f.root, 'requirements/v1/draft.json')), calls = f.calls();
  const before = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(run({ ...f, command: 'resume', draftMode: 'browser', input: Readable.from([]) }), /mode|original/i);
  assert.equal(f.calls(), calls); assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  await run({ ...f, command: 'resume', input: Readable.from(['confirm 1\n']) });
  assert.equal(f.calls(), calls); assert.deepEqual(await readFile(join(f.root, 'requirements/v1/draft.json')), first);
  assert.equal(f.executed().draft.preparation.adapterId, 'cos16-input/1'); assert.equal(f.executed().resume, false);
  const snapshot = await readFile(join(f.root, 'snapshot.json'));
  await run({ ...f, command: 'resume', input: Readable.from([]), host: { ...f.host, async questions() { throw new Error('Do not interview again'); }, async draft() { throw new Error('Do not draft again'); } } });
  assert.equal(f.executed().resume, true); assert.equal(f.executed().draft.preparation.sourceVersion, 'cos16-transfer-v1');
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), snapshot);
  await assert.rejects(run({ ...f, command: 'resume', draftMode: 'browser', input: Readable.from([]) }), /mode|original/i);
});
