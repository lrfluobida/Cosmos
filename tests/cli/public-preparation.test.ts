import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { preparationAcceptance } from '../../src/roles/requirements.ts';
import { resolveDraftMode } from '../../src/roles/preparation-mode.ts';
import { createProductHost } from '../../src/runtime/entrypoint-host.ts';
import { fakePublicSdk } from '../transfer/human-preparation.fixture.ts';
import { fileURLToPath } from 'node:url';

async function fixture(t: test.TestContext) {
  const base = await mkdtemp(join(tmpdir(), 'cos58-public-')), root = join(base, '中文 run');
  t.after(() => rm(base, { recursive: true, force: true }));
  let prepared = 0, executed: any, text = '';
  const output = new PassThrough(); output.on('data', bytes => { text += bytes; });
  const preparation = resolveDraftMode('cos16-input/1')!;
  const host = {
    async prepare() { prepared++; return { environmentReady: true, executionReady: true }; },
    async questions(input: any) { assert.deepEqual((await input.controller.read()).draftMode, preparation); return [{ id: 'scope', prompt: '请说明游戏范围。' }]; },
    async draft(input: any) { return { brief: input.brief, questions: input.questions, answers: input.answers, unsupported: [], preparation, acceptance: preparationAcceptance(preparation) }; },
    async execute(input: any) { executed = input; return { outcome: 'synthetic_only' }; },
  };
  const io = (stdin: string[]) => ({ host, output, input: Readable.from(stdin) });
  return { root, host, io, text: () => text, prepared: () => prepared, executed: () => executed };
}

test('public sokoban selection reaches the original exact stdin confirmation and human ledger', async t => {
  const f = await fixture(t);
  await runCli(['new', f.root, '--adapter', 'sokoban', '--brief', '中文单关鼠标推箱子'], f.io(['两个箱子和两个目标\nconfirm 0\nconfirm 1\n']));
  assert.equal(f.executed().requirement.confirmedBy, 'local-user');
  assert.equal(f.executed().draft.preparation.adapterId, 'cos16-input/1');
  assert.ok(!('scenario' in f.executed().draft)); assert.match(f.text(), /草稿 v1|当前版本/);
  const snapshot = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(snapshot.formatVersion, 1); assert.equal(snapshot.ledger.scope, 'generation');
  assert.equal(snapshot.ledger.limitMicroCny, 200_000_000); assert.equal(snapshot.events.filter((event: any) => event.type === 'generation_activated').length, 1);
});

test('public parser rejects unknown duplicate and missing adapter values before effects', async t => {
  for (const options of [['--adapter', 'unknown', '--brief', 'x'], ['--adapter', 'sokoban', '--adapter', 'sokoban', '--brief', 'x'], ['--brief', 'x', '--adapter']]) {
    const f = await fixture(t);
    await assert.rejects(runCli(['new', f.root, ...options], f.io([])));
    assert.equal(f.prepared(), 0); assert.equal(f.text(), ''); await assert.rejects(access(f.root), { code: 'ENOENT' });
  }
});

test('preparation EOF and cancel keep the original unactivated intake', async t => {
  for (const answer of [[], ['两个箱子\ncancel\n']]) {
    const f = await fixture(t);
    const result: any = await runCli(['new', f.root, '--brief', '推箱子', '--adapter', 'sokoban'], f.io(answer));
    assert.equal(result.outcome, 'unconfirmed'); assert.equal(f.executed(), undefined);
    const snapshot = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')); assert.equal(snapshot.formatVersion, 'intake-1');
  }
});

test('cold public resume selects its saved mode and refuses extra formal windows before prepare', async t => {
  const f = await fixture(t);
  await runCli(['new', f.root, '--brief', '推箱子', '--adapter', 'sokoban'], f.io(['两个箱子\nconfirm 1\n']));
  const original = await readFile(join(f.root, 'snapshot.json'));
  await runCli(['resume', f.root], f.io([])); assert.equal(f.executed().resume, true);
  const prepared = f.prepared();
  for (const args of [['continue', f.root, '--quote', '--add-cny', '1', '--add-minutes', '1'], ['continue', f.root, '--add-cny', '1', '--add-minutes', '1'], ['resume', f.root, '--window', 'extra']]) {
    await assert.rejects(runCli(args, f.io(['confirm anything\n'])), /preparation|准备模式/i);
    assert.equal(f.prepared(), prepared); assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), original);
  }
});

test('public source CLI assembles the actual human product host after SYNTHETIC stdin confirmation', async t => {
  const f = await fixture(t), calls: string[] = [], sessionFactory = fakePublicSdk(calls);
  const host = (createProductHost as any)(fileURLToPath(new URL('../../', import.meta.url)), { sessionFactory, io: {
    async build() { return { passed: false, diagnostics: 'Synthetic environment gap' }; }, async play() { throw new Error('No browser fallback'); },
  } });
  host.prepare = async () => { await mkdir(join(f.root, 'toolchain'), { recursive: true }); for (const name of ['package.json','package-lock.json','tsconfig.json','vite.config.ts']) await writeFile(join(f.root, 'toolchain', name), name.endsWith('.ts') ? 'export default {}\n' : '{}\n', 'utf8'); return { environmentReady: true, executionReady: true }; };
  const result: any = await runCli(['new', f.root, '--adapter', 'sokoban', '--brief', '中文单关推箱子'], { host, output: f.io([]).output, input: Readable.from(['两个箱子\nconfirm 1\n']) });
  assert.equal(result.outcome, 'incomplete'); assert.equal(result.taskHistory.find((task: any) => task.taskId === 'actual-art-58')?.state, 'passed', JSON.stringify(result));
  assert.ok(calls.includes('design:actual-design-58'));
});
