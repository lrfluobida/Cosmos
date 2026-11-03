import assert from 'node:assert/strict';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { runCli } from '../../src/cli/index.ts';
import { hasPackagedLauncher } from '../../src/runtime/entrypoint-delivery.ts';
import { freshPlaytestAction } from '../../src/runtime/experience.ts';
import { confirmedSource } from '../runtime/confirmed-requirements.fixture.ts';
import { ordinaryHostFixture } from '../runtime/ordinary-design.fixture.ts';

test('public new, resume and status lead to the same undecided playable delivery', async t => {
  const f = await ordinaryHostFixture(t), source = await confirmedSource(t, { draft: f.draft });
  t.after(() => removeOwned(tmpdir(), f.root));
  async function cli(args: string[], answer = '') {
    const output = new PassThrough(), chunks: string[] = [];
    output.on('data', chunk => chunks.push(chunk.toString('utf8')));
    const result = await runCli(args, { host: f.host, input: Readable.from([answer]), output });
    return { result: result as Record<string, any>, chunks };
  }
  const created = await cli(['new', f.root, '--requirements-from', source.root, '--requirements-revision', '2']);
  assert.equal(created.result.outcome, 'awaiting_user_experience', JSON.stringify(created.result.gaps));
  const timing = created.result.completionTiming;
  assert.deepEqual(await freshPlaytestAction(f.root, created.result.outcome, { ...timing, binding: { ...timing.binding, candidate: null } }), {},
    'A cleanup proof without an accepted candidate cannot guide the player');
  const action = { command: 'cosmos', args: ['experience', f.root] };
  for (const response of [created, await cli(['resume', f.root]), await cli(['status', f.root])]) {
    assert.deepEqual(JSON.parse(response.chunks.at(-1)!).nextAction, action);
    assert.deepEqual(response.result.nextAction, action);
  }
  const report = JSON.parse(await readFile(join(f.root, created.result.report), 'utf8'));
  assert.equal(report.nextAction, undefined);
  const play = await cli(action.args, 'cancel\n');
  assert.match(play.chunks.join(''), /双击 Play\.cmd/);
  assert.equal(play.result.outcome, 'unconfirmed');
  const project = join(f.root, created.result.delivery);
  assert.ok(play.chunks.join('').includes(join(project, 'Play.cmd')));
  for (const lock of ['.controller.lock', 'registry/.commit.lock']) {
    const path = join(f.root, lock);
    await writeFile(path, 'fixture owner', { flag: 'wx' });
    assert.equal((await cli(['status', f.root])).result.nextAction, undefined);
    await unlink(path);
  }
  for (const name of ['Play.cmd', 'standalone-launcher.mjs']) {
    const file = join(project, name), bytes = await readFile(file);
    await writeFile(file, 'changed launcher', 'utf8');
    assert.equal(await hasPackagedLauncher(project), false);
    const changed = await cli(action.args, 'cancel\n');
    assert.doesNotMatch(changed.chunks.join(''), /双击 Play\.cmd/);
    assert.match(changed.chunks.join(''), /查看试玩工程目录/);
    assert.equal((await cli(['status', f.root])).result.nextAction, undefined);
    assert.equal((await cli(['resume', f.root])).result.nextAction, undefined);
    await writeFile(file, bytes);
  }
  await cli(action.args, 'reject\n');
  for (const cmd of ['resume', 'status']) assert.equal(Object.hasOwn((await cli([cmd, f.root])).result, 'nextAction'), false);
  const reopened = await cli(action.args);
  assert.equal(reopened.result.outcome, 'unconfirmed');
  assert.match(reopened.chunks.join(''), /本次未新增体验决定，原决定为已拒绝/);
  assert.doesNotMatch(reopened.chunks.join(''), /请输入 approve|请输入 changes|未记录体验决定/);
});
