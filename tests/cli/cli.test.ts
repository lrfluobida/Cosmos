import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const cli = fileURLToPath(new URL('../../src/cli/index.ts', import.meta.url));

function run(args: string[], cwd: string) {
  return spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], {
    cwd, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, OPENAI_API_KEY: '', DEEPSEEK_API_KEY: '' },
  });
}

async function temporary(t: { after: (fn: () => Promise<void>) => void }) {
  const path = await mkdtemp(join(tmpdir(), 'cosmos-cli-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test('init creates a standalone locked project in an empty path with spaces and Chinese', async (t) => {
  const cwd = await temporary(t);
  const target = join(cwd, '新工程 with spaces');
  await mkdir(target);
  const result = run(['init', target], cwd);
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(target, 'package-lock.json'), 'utf8'));
  assert.equal(manifest.dependencies.phaser, lock.packages[''].dependencies.phaser);
  assert.equal(lock.lockfileVersion, 3);
  assert.match(await readFile(join(target, 'src/main.ts'), 'utf8'), /Phaser/);
  assert.deepEqual((await readdir(cwd)).sort(), ['新工程 with spaces']);
  assert.ok(!(await readdir(target)).includes('node_modules'));
  assert.ok(!(await readdir(target)).includes('dist'));
});

test('init refuses an occupied directory and preserves its content', async (t) => {
  const cwd = await temporary(t);
  await writeFile(join(cwd, '保留.txt'), '不能覆盖\n', 'utf8');
  const result = run(['init', cwd], cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /empty directory/i);
  assert.equal(await readFile(join(cwd, '保留.txt'), 'utf8'), '不能覆盖\n');
  assert.deepEqual(await readdir(cwd), ['保留.txt']);
});

test('init refuses a junction destination', async (t) => {
  const cwd = await temporary(t);
  const actual = join(cwd, 'actual');
  const link = join(cwd, 'link');
  await mkdir(actual);
  await symlink(actual, link, process.platform === 'win32' ? 'junction' : 'dir');
  const result = run(['init', link], cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /symbolic link|junction/i);
  assert.deepEqual(await readdir(actual), []);
});

test('init refuses to copy the template into its own source tree before writing', async (t) => {
  const cwd = await temporary(t);
  const target = fileURLToPath(new URL(`../../templates/2d/src/copy-${process.pid}`, import.meta.url));
  t.after(() => rm(target, { recursive: true, force: true }));
  const result = run(['init', target], cwd);
  assert.equal(result.status, 1);
  await assert.rejects(access(target), { code: 'ENOENT' });
});

test('run-dir creates only explicit workspace folders and refuses reuse', async (t) => {
  const cwd = await temporary(t);
  const target = join(cwd, 'run-01');
  const result = run(['run-dir', target], cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await readdir(target)).sort(), ['artifacts', 'evidence', 'logs']);
  assert.equal(run(['run-dir', target], cwd).status, 1);
  assert.deepEqual(await readdir(cwd), ['run-01']);
});

test('invalid input fails with actionable errors', async (t) => {
  const cwd = await temporary(t);
  for (const args of [[], ['init'], ['init', ''], ['unknown', cwd], ['build', cwd], ['preview', cwd, '--port', '0']]) {
    const result = run(args, cwd);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.match(result.stderr, /Usage:|package.json|port/i);
    assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
  }
  assert.equal(run(['--help'], cwd).status, 0);
});

test('a linked package bin still executes the public CLI', async t => {
  const cwd = await temporary(t), linked = join(cwd, 'linked-package');
  await symlink(fileURLToPath(new URL('../../', import.meta.url)), linked, process.platform === 'win32' ? 'junction' : 'dir');
  const result = spawnSync(process.execPath, ['--experimental-strip-types', join(linked, 'src/cli/index.ts'), '--help'], { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /cosmos new/);
});

test('build requires the project local install and propagates compilation failure', async (t) => {
  const cwd = await temporary(t);
  const target = resolve(cwd, 'project');
  assert.equal(run(['init', target], cwd).status, 0);
  const missing = run(['build', target], cwd);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /npm ci/i);
  await mkdir(join(target, 'node_modules/typescript/bin'), { recursive: true });
  await writeFile(join(target, 'node_modules/typescript/bin/tsc'), 'process.exit(7);\n', 'utf8');
  const failed = run(['build', target], cwd);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /exited with code 7/);
});
