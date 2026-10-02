import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runChild } from '../../probes/e2e/host.ts';
import { VALIDATION_CASE } from '../../probes/e2e/validation-declaration.ts';
import * as identity from '../../probes/e2e/validation-identity.ts';
const repository = fileURLToPath(new URL('../../', import.meta.url));
const signal = () => new AbortController().signal;

async function fixture(t: test.TestContext) {
  assert.equal(typeof identity.createValidationIdentityReader, 'function', 'An actual Git identity reader is required.');
  const root = await mkdtemp(join(tmpdir(), 'cosmos-identity-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = async (...args: string[]) => {
    const result = await runChild('git', ['-c', 'user.name=Offline Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false',
      '-c', `core.hooksPath=${join(root, '.git/no-hooks')}`, ...args], { cwd: root, signal: signal(), timeoutMs: 5000 });
    assert.equal(result.code, 0, 'Fixture Git operation must succeed'); return result.stdout.trim();
  };
  await git('init', '--initial-branch=main'); await git('config', 'core.autocrlf', 'false');
  for (const file of [VALIDATION_CASE.inputs.requirements, ...VALIDATION_CASE.inputs.template.files]) {
    await mkdir(dirname(join(root, file.path)), { recursive: true }); await writeFile(join(root, file.path), await readFile(join(repository, file.path)));
  }
  await mkdir(join(root, 'src')); await writeFile(join(root, 'src/platform.ts'), '// Offline identity fixture\n', 'utf8');
  await writeFile(join(root, '.gitignore'), 'ignored-output/\n', 'utf8');
  await git('add', '.'); await git('commit', '-m', 'Offline fixture');
  const head = await git('rev-parse', 'HEAD');
  return { root, head, git, read: identity.createValidationIdentityReader({ repository: root, reviewedPlatformSha: head }) };
}
async function files(root: string): Promise<Record<string, { hash: string; mtimeMs: number }>> {
  const result: Record<string, { hash: string; mtimeMs: number }> = {};
  async function visit(folder: string) {
    for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await visit(path);
      else result[path] = { hash: createHash('sha256').update(await readFile(join(root, path))).digest('hex'), mtimeMs: (await stat(join(root, path))).mtimeMs };
    }
  }
  await visit(''); return result;
}

test('clean actual main and frozen inputs yield the exact identity without writes, including Git index refreshes', async t => {
  const f = await fixture(t); await mkdir(join(f.root, 'ignored-output')); await writeFile(join(f.root, 'ignored-output/result.json'), '{"generatedByCosmos":false}', 'utf8');
  const before = await files(f.root);
  assert.deepEqual(await f.read(signal()), { reviewedPlatformSha: f.head, frozenCaseInputHash: createHash('sha256').update(JSON.stringify(VALIDATION_CASE.inputs)).digest('hex') });
  assert.deepEqual(await files(f.root), before);
});

test('a supplied reviewed SHA cannot substitute for actual HEAD', async t => {
  const f = await fixture(t), read = identity.createValidationIdentityReader({ repository: f.root, reviewedPlatformSha: '0'.repeat(40) });
  await assert.rejects(read(signal()), /HEAD|identity|reviewed/i);
});

test('a different branch or detached HEAD cannot use the main identity reader', async t => {
  const f = await fixture(t); await f.git('switch', '-c', 'other'); await assert.rejects(f.read(signal()), /main|branch|identity/i);
  await f.git('switch', '--detach', f.head); await assert.rejects(f.read(signal()), /main|branch|identity|Git/i);
});

for (const changed of ['frozen-input', 'tracked-source', 'untracked-source'] as const) test(`actual ${changed} changes refuse admission`, async t => {
  const f = await fixture(t), path = join(f.root, changed === 'frozen-input' ? 'probes/e2e/requirements.json' : changed === 'tracked-source' ? 'src/platform.ts' : 'src/untracked.ts');
  await writeFile(path, '// Offline changed source\n', 'utf8');
  await assert.rejects(f.read(signal()), /changed|dirty|clean|identity/i);
});

test('a committed frozen input drift still fails even when the caller selects that actual clean SHA', async t => {
  const f = await fixture(t), path = join(f.root, 'templates/2d/src/main.ts');
  await writeFile(path, Buffer.concat([await readFile(path), Buffer.from('\n')])); await f.git('add', '.'); await f.git('commit', '-m', 'Changed fixed input');
  const head = await f.git('rev-parse', 'HEAD'), read = identity.createValidationIdentityReader({ repository: f.root, reviewedPlatformSha: head });
  await assert.rejects(read(signal()), /fixed|changed/i);
});

test('a reader rechecks identity on every call and refuses a later actual commit', async t => {
  const f = await fixture(t); await f.read(signal());
  await writeFile(join(f.root, 'src/platform.ts'), '// Later offline version\n', 'utf8'); await f.git('add', '.'); await f.git('commit', '-m', 'Later source');
  await assert.rejects(f.read(signal()), /HEAD|identity|reviewed/i);
});

test('aborted and in-flight cancelled identity checks cannot return success', async t => {
  const f = await fixture(t), before = new AbortController(); before.abort(new Error('Offline abort'));
  await assert.rejects(f.read(before.signal), /abort/i);
  const during = new AbortController(), pending = f.read(during.signal);
  const timer = setTimeout(() => during.abort(new Error('Offline abort during read')), 30);
  try { await assert.rejects(pending, /abort/i); } finally { clearTimeout(timer); }
});

test('source changes concurrent with the reader are rejected', async t => {
  const f = await fixture(t), pending = f.read(signal());
  await writeFile(join(f.root, 'src/platform.ts'), '// Concurrent offline change\n', 'utf8');
  await assert.rejects(pending, /changed|dirty|clean|identity/i);
});

for (const flag of ['--assume-unchanged', '--skip-worktree']) test(`hidden index ${flag} cannot conceal changed platform source`, async t => {
  const f = await fixture(t);
  await f.git('update-index', flag, 'src/platform.ts');
  await writeFile(join(f.root, 'src/platform.ts'), '// Hidden offline source change\n', 'utf8');
  assert.equal(await f.git('status', '--porcelain=v1', '--untracked-files=all'), '', 'Reproduce Git status hiding the actual change');
  const before = await files(f.root);
  await assert.rejects(f.read(signal()), /index|assume|skip.worktree/i);
  assert.deepEqual(await files(f.root), before, 'Refusal must not clear or rewrite index flags');
});
