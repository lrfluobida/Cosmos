import assert from 'node:assert/strict';
import { access, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { createRoleBudget } from '../../src/roles/provider-budget.ts';
import { runProductSession } from '../../src/cli/session.ts';

async function fixture(t: test.TestContext) {
  const parent = await mkdtemp(join(tmpdir(), 'cos107-limits-')), root = join(parent, '中文运行');
  t.after(() => removeOwned(tmpdir(), parent));
  let calls = 0, text = ''; const output = new PassThrough(); output.on('data', bytes => { text += bytes; });
  const host = { async prepare() { calls++; return { environmentReady: false, executionReady: false }; },
    async questions() { throw new Error('No interview expected'); }, async draft() { throw new Error('No draft expected'); }, async execute() { throw new Error('No execution expected'); } };
  return { root, calls: () => calls, text: () => text, run: (args: string[]) => runCli(args, { host, output, input: Readable.from([]) }) };
}

test('public new accepts a five-yuan thirty-minute limit before the host boundary', async t => {
  const f = await fixture(t);
  await f.run(['new', f.root, '--brief', '鼠标记忆配对', '--max-cny', '5', '--max-minutes', '30']);
  assert.equal(f.calls(), 1);
  const snapshot = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(snapshot.ledger.limitMicroCny, 5_000_000); assert.equal(snapshot.durationMs, 1_800_000);
  assert.deepEqual(snapshot.ledger.allocations.map((row: any) => row.amountMicroCny), [250_000, 250_000]);
  assert.deepEqual(JSON.parse(await readFile(join(f.root, 'intake-origin.json'), 'utf8')).limits, { limitMicroCny: 5_000_000, durationMs: 1_800_000 });
  assert.match(f.text(), /¥5 总额/); assert.match(f.text(), /30 分钟/);
});

test('invalid limits and options outside new are rejected before host or directory creation', async t => {
  const money = ['0', '-1', '+1', '01', '.5', '1.', ' 5', '5 ', '200.000001', '0.0000001', '1e2', 'NaN', 'Infinity', ''];
  const minutes = ['0', '-1', '01', '721', '1.5', '1e2', ' 5', 'Infinity', ''];
  const invalid = [...money.map(value => ['--max-cny', value]), ...minutes.map(value => ['--max-minutes', value]),
    ['--max-cny'], ['--max-minutes'], ['--max-cny', '5', '--max-cny', '6'], ['--max-minutes', '30', '--max-minutes', '40']];
  for (const options of invalid) {
    const f = await fixture(t);
    await assert.rejects(f.run(['new', f.root, '--brief', '点击星星', ...options]));
    assert.equal(f.calls(), 0); await assert.rejects(access(f.root), { code: 'ENOENT' });
  }
  for (const command of ['resume', 'stop', 'status', 'continue', 'experience', 'init', 'run-dir', 'build', 'preview']) {
    const f = await fixture(t);
    await assert.rejects(f.run([command, f.root, '--max-cny', '5']), /new|新建|Usage/);
    assert.equal(f.calls(), 0); await assert.rejects(access(f.root), { code: 'ENOENT' });
  }
});

test('independent defaults and exact micro-CNY boundaries preserve proportional grants', async t => {
  for (const [options, money, duration] of [
    [[], 200_000_000, 43_200_000],
    [['--max-cny', '200', '--max-minutes', '720'], 200_000_000, 43_200_000],
    [['--max-cny', '5.123456'], 5_123_456, 43_200_000],
    [['--max-minutes', '1'], 200_000_000, 60_000],
    [['--max-cny', '0.000021'], 21, 43_200_000],
    [['--max-cny', '0.000001'], 1, 43_200_000],
  ] as [string[], number, number][]) {
    const f = await fixture(t); await f.run(['new', f.root, '--brief', '点击星星', ...options]);
    const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
    assert.equal(state.ledger.limitMicroCny, money); assert.equal(state.durationMs, duration);
    assert.deepEqual(state.ledger.allocations.map((row: any) => row.amountMicroCny), [Math.floor(money / 20), Math.floor(money / 20)]);
    const origin = JSON.parse(await readFile(join(f.root, 'intake-origin.json'), 'utf8'));
    assert.deepEqual(origin.limits, options.length ? { limitMicroCny: money, durationMs: duration } : undefined);
  }
});

test('a one-micro-CNY budget is never raised to admit an interview request', async t => {
  const f = await fixture(t), output = new PassThrough(); output.resume(); let transportStarts = 0;
  await assert.rejects(runCli(['new', f.root, '--brief', '点击星星', '--max-cny', '0.000001'], {
    input: Readable.from([]), output, host: {
      async prepare() { return { environmentReady: true, executionReady: true }; },
      async questions({ controller }) {
        const budget = createRoleBudget({ controller, taskId: 'intake', evidenceDirectory: join(f.root, 'intake-sessions/questions-1') });
        await budget.beforeRequest({ requestId: 'unaffordable', modelId: 'deepseek-flash', inputBytes: 1, hasImages: false, maxOutputTokens: 1, estimatedMaxCostMicroCny: 1 });
        transportStarts++; throw new Error('Provider transport must not start');
      },
      async draft() { throw new Error('No draft expected'); }, async execute() { throw new Error('No execution expected'); },
    },
  }), /budget|allocat|capacity/i);
  assert.equal(transportStarts, 0);
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.ledger.limitMicroCny, 1); assert.deepEqual(state.ledger.entries, []);
  assert.equal(state.run.originalStartedAt, undefined);
});

test('preparation rejects non-default limits before CLI or session effects', async t => {
  for (const [money, minutes] of [['5', '720'], ['200', '30']]) {
    const f = await fixture(t);
    await assert.rejects(f.run(['new', f.root, '--adapter', 'sokoban', '--brief', '推箱子', '--max-cny', money, '--max-minutes', minutes]), /准备.*限额/);
    assert.equal(f.calls(), 0); await assert.rejects(access(f.root), { code: 'ENOENT' });
    const output = new PassThrough(); output.resume(); let hostRead = false;
    await assert.rejects(runProductSession({ command: 'new', root: f.root, brief: '推箱子', draftMode: 'cos16-input/1',
      limits: { limitMicroCny: Number(money) * 1_000_000, durationMs: Number(minutes) * 60_000 },
      get host() { hostRead = true; throw new Error('Host must not be read'); }, input: Readable.from([]), output }), /准备.*限额/);
    assert.equal(hostRead, false); await assert.rejects(access(f.root), { code: 'ENOENT' });
  }
});

test('preparation explicit defaults retain its original intake source shape', async t => {
  const f = await fixture(t);
  await f.run(['new', f.root, '--adapter', 'sokoban', '--brief', '推箱子', '--max-cny', '200', '--max-minutes', '720']);
  assert.equal(f.calls(), 1);
  const origin = JSON.parse(await readFile(join(f.root, 'intake-origin.json'), 'utf8'));
  assert.equal(origin.limits, undefined); assert.equal(origin.draftMode.adapterId, 'cos16-input/1');
});
