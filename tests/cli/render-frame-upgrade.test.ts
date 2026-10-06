import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { continuationSessionFixture } from './continuation-session.fixture.ts';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { roleToolEnvironment } from '../../src/roles/factory.ts';
import { runCli } from '../../src/cli/index.ts';

const output = () => { const stream = new PassThrough(); stream.resume(); return stream; };
async function tree(root: string, prefix = ''): Promise<Record<string, unknown>> {
  const files: Record<string, unknown> = {};
  for (const item of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) Object.assign(files, await tree(root, path));
    else { const bytes = await readFile(join(root, path)); files[path] = { hash: createHash('sha256').update(bytes).digest('hex'), mtime: (await stat(join(root, path))).mtimeMs }; }
  }
  return files;
}
/** Actual compiled installation copy; only its temporary template is upgraded. */
async function installation(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cos70-upgrade-')); t.after(() => removeOwned(tmpdir(), root));
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  await cp(join(repo, 'dist'), join(root, 'dist'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
  await symlink(join(repo, 'node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  await mkdir(join(root, 'templates/2d'), { recursive: true });
  const observer = await readFile(join(repo, 'templates/2d/render-frame-observer.ts'));
  await writeFile(join(root, 'templates/2d/render-frame-observer.ts'), observer);
  const execute = (args: string[]) => spawnSync(process.execPath, args, { encoding: 'utf8', env: roleToolEnvironment(), windowsHide: true, timeout: 15000 });
  return { root, cli: (...args: string[]) => execute([join(root, 'dist/cli/index.js'), ...args]),
    direct: (f: any, windowId?: string) => execute(['--input-type=module', '-e', `import {executeGeneration} from ${JSON.stringify(pathToFileURL(join(root, 'dist/runtime/entrypoint.js')).href)};const result=await executeGeneration(${JSON.stringify({ root: f.root, requirement: f.requirement, draft: f.draft, resume: true, ...(windowId ? { windowId } : {}) })});console.log(JSON.stringify(result));`]),
    guarded: (f: any, command: 'resume' | 'continue') => execute(['--input-type=module', '-e', `import {runCli} from ${JSON.stringify(pathToFileURL(join(root, 'dist/cli/index.js')).href)};import{Readable}from'node:stream';const fail=async()=>{throw new Error('Host dispatched before source refusal');};await runCli(${JSON.stringify([command, f.root, ...(command === 'continue' ? ['--add-cny', '1', '--add-minutes', '10'] : [])])},{host:{prepare:fail,execute:fail,questions:fail,draft:fail},input:Readable.from([]),output:process.stdout});`]),
    upgrade: () => writeFile(join(root, 'templates/2d/render-frame-observer.ts'), Buffer.concat([observer, Buffer.from('\n// Isolated upgraded installation fixture.\n')])) };
}
test('compiled completed original/direct/status survives installation upgrade and still refuses original capture drift', async t => {
  const f = await continuationSessionFixture(t, { completeOriginal: true, entrypointOriginal: true, renderFrames: true }), installed = await installation(t);
  await runCli(['experience', f.root], { input: Readable.from(['approve\n']), output: output() });
  assert.equal(installed.cli('resume', f.root).status, 0); const before = await tree(f.root), calls = [...f.calls];
  await installed.upgrade();
  for (const result of [installed.cli('resume', f.root), installed.direct(f), installed.cli('status', f.root)]) assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await tree(f.root), before); assert.deepEqual(f.calls, calls);
  await writeFile(join(f.root, 'registry/captures/render-frame-observer/v1/files/_cosmos/render-frame-observer.ts'), '// Changed original capture fixture\n', 'utf8');
  const changed = await tree(f.root), refused = installed.cli('resume', f.root); assert.notEqual(refused.status, 0); assert.match(refused.stderr, /capture bytes changed/);
  assert.deepEqual(await tree(f.root), changed); assert.deepEqual(f.calls, calls);
});
test('compiled completed window/direct remains readonly after installation upgrade', async t => {
  const f = await continuationSessionFixture(t, { renderFrames: true }), input = new PassThrough(), stream = new PassThrough(); let text = '', answered = false;
  stream.on('data', bytes => { text += bytes; const match = text.match(/confirm (cq1-[a-f0-9]{64})/); if (match && !answered) { answered = true; input.end(`confirm ${match[1]}\n`); } });
  const completed: any = await runCli(['continue', f.root, '--add-cny', '1', '--add-minutes', '10'], { host: f.host, input, output: stream });
  const installed = await installation(t), before = await tree(f.root), calls = [...f.calls]; await installed.upgrade();
  for (const result of [installed.cli('resume', f.root, '--window', completed.windowId), installed.direct(f, completed.windowId)]) {
    assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).report, completed.report);
  }
  assert.deepEqual(await tree(f.root), before); assert.deepEqual(f.calls, calls);
});
test('upgraded installation refuses unfinished resume and first continuation before host or window activity', async t => {
  const f = await continuationSessionFixture(t, { renderFrames: true }), installed = await installation(t), before = await tree(f.root), calls = [...f.calls];
  await installed.upgrade();
  for (const command of ['resume', 'continue'] as const) {
    const result = installed.guarded(f, command); assert.notEqual(result.status, 0); assert.match(result.stderr, /observer source bytes changed/);
  }
  assert.deepEqual(await tree(f.root), before); assert.deepEqual(f.calls, calls);
});
