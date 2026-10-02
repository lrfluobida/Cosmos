import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { createArtifactRegistry } from '../../src/artifacts/index.ts';

async function fixture(t: { after: (fn: () => Promise<void>) => void }, signal?: AbortSignal) {
  const base = tmpdir(), workspaceRoot = await fs.mkdtemp(join(base, 'cosmos-publication-'));
  const part = relative(base, workspaceRoot);
  assert.ok(!isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`));
  t.after(() => fs.rm(workspaceRoot, { recursive: true, force: true }));
  const registry = await createArtifactRegistry({ workspaceRoot, registryRoot: 'registry', signal });
  await fs.mkdir(join(workspaceRoot, 'author'));
  await fs.writeFile(join(workspaceRoot, 'author/main.ts'), '// 中文保持原样\n', 'utf8');
  const register = () => registry.registerCapture({
    taskId: 'publication', artifactRef: registry.artifactRef('template', 'v1'), sourceRoot: 'author',
    files: [{ source: 'main.ts', destination: 'src/main.ts' }],
    ownership: { writePaths: ['src'], readOnlyPaths: [] },
    metadata: { kind: 'code', provenance: { kind: 'original-procedural', sourceRefs: ['test'], generator: 'local fixture' } },
    dependencies: [],
  });
  return { workspaceRoot, registry, register, destination: join(workspaceRoot, 'registry/captures/template/v1') };
}

test('publishes a capture when Windows file sharing is unrestricted', async t => {
  const f = await fixture(t), capture = await f.register();
  assert.deepEqual(await f.registry.getCapture(capture.artifactRef), capture);
  assert.equal(await fs.readFile(join(f.destination, 'files/src/main.ts'), 'utf8'), '// 中文保持原样\n');
});

test('publishes atomically after a real Windows no-delete file handle is released', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t);
  const script = join(f.workspaceRoot, 'hold.ps1');
  await fs.writeFile(script, `$ErrorActionPreference = 'Stop'
[Console]::WriteLine('ready')
$HeldPath = [Console]::ReadLine()
$stream = [IO.File]::Open($HeldPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
try { [Console]::WriteLine('locked'); [Console]::ReadLine() | Out-Null }
finally { $stream.Dispose() }
`, 'utf8');
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].flatMap(name => process.env[name] ? [[name, process.env[name]!]] : []));
  const child = spawn(join(env.SystemRoot ?? env.WINDIR, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-File', script], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', bytes => { stdout += bytes; });
  child.stderr.on('data', bytes => { stderr += bytes; });
  const exited = new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Handle fixture exited ${code}: ${stderr}`)));
  });
  void exited.catch(() => {});
  const waitFor = (message: string) => new Promise<void>((resolve, reject) => {
    if (stdout.includes(message)) resolve();
    child.stdout.on('data', () => { if (stdout.includes(message)) resolve(); });
    child.on('error', reject);
    child.on('exit', () => reject(new Error(`Handle fixture stopped before ${message}: ${stderr}`)));
  });
  const timer = setTimeout(() => child.kill(), 5000);
  const original = fs.rename;
  let observed: NodeJS.ErrnoException | undefined;
  t.mock.method(fs, 'rename', async (source: string, destination: string) => {
    if (destination !== f.destination || observed) return original(source, destination);
    child.stdin.write(join(source, 'capture.json') + '\n'); await waitFor('locked');
    try { await original(source, destination); }
    catch (error) { observed = error as NodeJS.ErrnoException; }
    assert.equal(observed?.code, 'EPERM');
    assert.equal(observed?.syscall, 'rename');
    child.stdin.end('\n'); await exited;
    throw observed;
  });
  syncBuiltinESMExports();
  t.after(async () => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  try {
    await waitFor('ready');
    const capture = await f.register();
    assert.equal(observed?.code, 'EPERM');
    assert.deepEqual(await f.registry.getCapture(capture.artifactRef), capture);
    assert.deepEqual(await fs.readdir(join(f.workspaceRoot, 'registry/tmp')), []);
  } finally {
    child.stdin.end();
    if (child.exitCode === null) child.kill();
    await exited.catch(() => {}); clearTimeout(timer);
  }
});

const sharingDenied = () => Object.assign(new Error('Windows publication sharing denied'), { code: 'EPERM', syscall: 'rename' });

test('persistent Windows publication denial is bounded and leaves no registered version', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t), error = sharingDenied(); let attempts = 0;
  t.mock.method(fs, 'rename', async () => { attempts++; throw error; }); syncBuiltinESMExports();
  t.after(async () => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const started = performance.now();
  await assert.rejects(f.register(), candidate => candidate === error);
  assert.ok(attempts > 1 && attempts <= 6);
  assert.ok(performance.now() - started < 2000);
  await assert.rejects(fs.lstat(f.destination), { code: 'ENOENT' });
  assert.deepEqual(await fs.readdir(join(f.workspaceRoot, 'registry/tmp')), []);
});

test('abort interrupts the Windows publication wait without another rename', { skip: process.platform !== 'win32' }, async t => {
  const abort = new AbortController(), f = await fixture(t, abort.signal); let attempts = 0;
  t.mock.method(fs, 'rename', async () => { attempts++; setTimeout(() => abort.abort(new Error('case deadline')), 5); throw sharingDenied(); });
  syncBuiltinESMExports(); t.after(async () => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  await assert.rejects(f.register(), /abort|deadline/i);
  assert.equal(attempts, 1);
  await assert.rejects(fs.lstat(f.destination), { code: 'ENOENT' });
  assert.deepEqual(await fs.readdir(join(f.workspaceRoot, 'registry/tmp')), []);
});

test('a version appearing during the Windows publication wait is preserved', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t); let attempts = 0;
  t.mock.method(fs, 'rename', async () => {
    attempts++; await fs.mkdir(f.destination); await fs.writeFile(join(f.destination, 'other-writer.txt'), 'keep', 'utf8'); throw sharingDenied();
  });
  syncBuiltinESMExports(); t.after(async () => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  await assert.rejects(f.register(), /immutable|exists/i);
  assert.equal(attempts, 1);
  assert.equal(await fs.readFile(join(f.destination, 'other-writer.txt'), 'utf8'), 'keep');
  assert.deepEqual(await fs.readdir(join(f.workspaceRoot, 'registry/tmp')), []);
});

test('changed registry ownership stops the Windows publication retry', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t), lock = join(f.workspaceRoot, 'registry/.commit.lock'); let attempts = 0, owner: Buffer | undefined;
  t.mock.method(fs, 'rename', async () => {
    attempts++; owner = await fs.readFile(lock); const changed = JSON.parse(owner.toString('utf8')); changed.token = 'different-owner';
    await fs.writeFile(lock, JSON.stringify(changed), 'utf8'); throw sharingDenied();
  });
  syncBuiltinESMExports(); t.after(async () => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  await assert.rejects(f.register(), /ownership/i);
  assert.equal(attempts, 1);
  await assert.rejects(fs.lstat(f.destination), { code: 'ENOENT' });
  assert.deepEqual(await fs.readdir(join(f.workspaceRoot, 'registry/tmp')), []);
  // Restore only this test's lock so its own fixture can release it safely.
  assert.ok(owner); await fs.writeFile(lock, owner);
});

test('non-sharing publication errors fail immediately', async t => {
  const f = await fixture(t), error = Object.assign(new Error('missing source'), { code: 'ENOENT' }); let attempts = 0;
  t.mock.method(fs, 'rename', async () => { attempts++; throw error; }); syncBuiltinESMExports();
  t.after(async () => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  await assert.rejects(f.register(), candidate => candidate === error);
  assert.equal(attempts, 1);
  assert.deepEqual(await fs.readdir(join(f.workspaceRoot, 'registry/tmp')), []);
});

test('a junction introduced during the Windows publication wait stops retry', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t); let attempts = 0;
  await fs.writeFile(join(f.workspaceRoot, 'author/keep.txt'), 'keep', 'utf8');
  t.mock.method(fs, 'rename', async () => {
    attempts++; const parent = join(f.workspaceRoot, 'registry/captures/template');
    await fs.rmdir(parent); await fs.symlink(join(f.workspaceRoot, 'author'), parent, 'junction'); throw sharingDenied();
  });
  syncBuiltinESMExports(); t.after(async () => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  await assert.rejects(f.register(), /symbolic|junction/i);
  assert.equal(attempts, 1);
  assert.equal(await fs.readFile(join(f.workspaceRoot, 'author/keep.txt'), 'utf8'), 'keep');
  assert.deepEqual(await fs.readdir(join(f.workspaceRoot, 'registry/tmp')), []);
});

test('a delayed retry timer cannot publish after the Windows retry cutoff', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t), error = sharingDenied(), original = fs.rename; let attempts = 0;
  t.mock.method(fs, 'rename', async (source: string, destination: string) => {
    attempts++;
    if (attempts === 1) {
      setTimeout(() => { const until = performance.now() + 1100; while (performance.now() < until) {} }, 1);
      throw error;
    }
    return original(source, destination);
  });
  syncBuiltinESMExports(); t.after(async () => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  await assert.rejects(f.register(), candidate => candidate === error);
  assert.equal(attempts, 1);
  await assert.rejects(fs.lstat(f.destination), { code: 'ENOENT' });
  assert.deepEqual(await fs.readdir(join(f.workspaceRoot, 'registry/tmp')), []);
});
