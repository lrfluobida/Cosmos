import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { createProductHost } from '../../src/runtime/entrypoint-host.ts';
import { fileURLToPath } from 'node:url';
import { withHostStages } from '../../src/roles/requirements.ts';

/** Public stdin and persisted runtime state; provider replies are synthetic and unbilled. */
async function fixture(t: test.TestContext) {
  const parent = await mkdtemp(join(tmpdir(), 'cos70-cli-')), root = join(parent, '中文运行');
  t.after(() => removeOwned(tmpdir(), parent));
  let text = ''; const output = new PassThrough(); output.on('data', bytes => { text += bytes; });
  const calls: string[] = [], executed: any[] = [];
  const host = {
    async prepare() { calls.push('prepare'); return { environmentReady: true, executionReady: true }; },
    async questions() { calls.push('questions'); return [{ id: 'goal', prompt: '怎样获胜？' }]; },
    async draft(input: any) { calls.push('draft'); return withHostStages({ brief: input.brief, questions: input.questions, answers: input.answers, unsupported: [],
      acceptance: [{ acceptanceId: 'win', description: '点击获胜', steps: ['点击目标'], expected: '胜利', evidenceKinds: ['test_report'] }],
      scenario: { viewport: { width: 1280, height: 720 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#star', timeoutMs: 1000 },
        { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] } } as any); },
    async execute(input: any) { calls.push('execute'); executed.push(input); return { outcome: 'incomplete', fixtureOnly: true }; },
  };
  const run = (args: string[], lines = '') => runCli(args, { host, output, input: Readable.from([lines]) });
  return { root, calls, executed, run, text: () => text };
}
test('public selection is displayed before exact confirmation and anchored in its source', async t => {
  const f = await fixture(t);
  await f.run(['new', f.root, '--brief', '点击星星', '--render-frames', 'true'], '点击获胜\nconfirm 1\n');
  assert.equal(f.executed.length, 1); assert.equal(f.executed[0].renderFrames, true);
  assert.match(f.text(), /渲染帧采样/); assert.match(f.text(), /未冻结|未执行/);
  const origin = JSON.parse(await readFile(join(f.root, 'intake-origin.json'), 'utf8'));
  assert.equal(origin.renderFrames.enabled, true); assert.match(origin.renderFrames.observerSha256, /^[a-f0-9]{64}$/);
  const ref = f.executed[0].requirement.sources[1];
  assert.equal(ref.version, `v1-frames-${origin.renderFrames.observerSha256}`);
  const confirmed = JSON.parse(await readFile(join(f.root, ref.location), 'utf8'));
  assert.deepEqual(confirmed.renderFrames, origin.renderFrames); assert.equal(f.executed[0].draft.renderFrames, undefined);
  const snapshot = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(snapshot.formatVersion, 1); assert.deepEqual(snapshot.ledger.entries, []);
});
test('incomplete resume restores omitted selection and rejects an explicit conflict without effects', async t => {
  const f = await fixture(t);
  await f.run(['new', f.root, '--brief', '点击星星', '--render-frames', 'true'], '点击获胜\nconfirm 1\n');
  const before = await readFile(join(f.root, 'snapshot.json'));
  await f.run(['resume', f.root]); assert.equal(f.executed[1].renderFrames, true);
  const count = f.calls.length;
  await assert.rejects(f.run(['resume', f.root, '--render-frames', 'false']), /original|selection|采样|选择/i);
  assert.equal(f.calls.length, count); assert.ok((await readFile(join(f.root, 'snapshot.json'))).equals(before));
});
for (const answer of ['cancel', '']) test(`selection cancel/EOF ${answer || 'EOF'} keeps an unconfirmed intake`, async t => {
  const f = await fixture(t);
  await f.run(['new', f.root, '--brief', '点击星星', '--render-frames', 'true'], `点击获胜\n${answer}\n`);
  assert.equal(f.executed.length, 0); const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(state.formatVersion, 'intake-1'); assert.equal(state.renderFrames.enabled, true);
  assert.equal(state.confirmation, null); assert.deepEqual(state.ledger.entries, []);
});
test('preparation and malformed selection refuse before provider, confirmation or activation', async t => {
  for (const options of [['--adapter', 'sokoban', '--render-frames', 'true'], ['--render-frames', 'yes'], ['--render-frames', 'true', '--render-frames', 'false']]) {
    const f = await fixture(t);
    await assert.rejects(f.run(['new', f.root, '--brief', '点击星星', ...options]));
    assert.deepEqual(f.calls, []); await assert.rejects(access(f.root), { code: 'ENOENT' });
  }
});
test('actual runtime assembly restores the selected source into the existing host capture seam', async t => {
  const f = await fixture(t);
  await f.run(['new', f.root, '--brief', '点击星星', '--render-frames', 'true'], '点击获胜\nconfirm 1\n');
  await mkdir(join(f.root, 'toolchain'));
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) await writeFile(join(f.root, 'toolchain', name), name.endsWith('.ts') ? 'export default {}' : '{}', 'utf8');
  let captured = false;
  const host = createProductHost(fileURLToPath(new URL('../../', import.meta.url)), { sessionFactory: async config => {
    const packet = JSON.parse(config.context!);
    const ref = packet.inputs.find((ref: any) => ref.artifactId === 'render-frame-observer'); assert.ok(ref);
    assert.ok((await readFile(join(f.root, ref.location, '_cosmos/render-frame-observer.ts'))).equals(await readFile(new URL('../../templates/2d/render-frame-observer.ts', import.meta.url))));
    captured = true;
    return { close: async () => {}, prompt: async () => { throw new Error('Synthetic session boundary; no provider request'); } };
  } });
  const result: any = await host.execute(f.executed[0]); assert.equal(result.outcome, 'incomplete'); assert.equal(captured, true);
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')); assert.deepEqual(state.ledger.entries, []);
});
test('lost intake choice cannot become a legacy default before confirmation', async t => {
  const f = await fixture(t);
  await f.run(['new', f.root, '--brief', '点击星星', '--render-frames', 'true'], '点击获胜\ncancel\n');
  for (const name of ['snapshot.json', 'intake-origin.json']) {
    const path = join(f.root, name), value = JSON.parse(await readFile(path, 'utf8')); delete value.renderFrames; await writeFile(path, JSON.stringify(value), 'utf8');
  }
  const calls = f.calls.length;
  await assert.rejects(runCli(['status', f.root], { output: new PassThrough() }), /selection|original|采样|选择/i);
  await assert.rejects(f.run(['resume', f.root]), /selection|original|采样|选择/i); assert.equal(f.calls.length, calls);
});
test('omitted and explicit false preserve the legacy confirmation reference and choice fields', async t => {
  for (const options of [[], ['--render-frames', 'false']]) {
    const f = await fixture(t); await f.run(['new', f.root, '--brief', '--render-frames', ...options], '点击获胜\nconfirm 1\n');
    assert.equal(f.executed[0].renderFrames, undefined); assert.equal(f.executed[0].requirement.sources[1].version, 'v1');
    const origin = JSON.parse(await readFile(join(f.root, 'intake-origin.json'), 'utf8')); assert.equal(origin.renderFrames, undefined);
    const confirmation = JSON.parse(await readFile(join(f.root, f.executed[0].requirement.sources[1].location), 'utf8')); assert.equal(confirmation.renderFrames, undefined);
  }
});
test('actual product factory rejects conflicting explicit call selection before assembly', async t => {
  const f = await fixture(t); await f.run(['new', f.root, '--brief', '点击星星'], '点击获胜\nconfirm 1\n');
  const host = createProductHost(fileURLToPath(new URL('../../', import.meta.url)), { renderFrames: false });
  await assert.rejects(host.execute({ ...f.executed[0], renderFrames: true }), /selection|original|采样|选择/i);
});
