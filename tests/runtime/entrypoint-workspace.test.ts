import assert from 'node:assert/strict';
import { watch, writeFileSync } from 'node:fs';
import { link, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { materializeTaskInputs } from '../../src/runtime/entrypoint-workspace.ts';
import type { RequirementContract, TaskContract } from '../../src/contracts/index.ts';
import { requirement as requirementFixture, task as taskFixture } from '../contracts/fixtures.ts';

const capture = 'registry/captures/design/v1/files';
const bytes = Buffer.from([0, 255, 128, 1, 2, 13, 10]);
async function put(root: string, name: string, value: string | Buffer) {
  await mkdir(dirname(join(root, name)), { recursive: true }); await writeFile(join(root, name), value, { encoding: 'utf8', flag: 'wx' });
}
async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-input-mirror-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const task = taskFixture() as TaskContract, requirement = requirementFixture() as RequirementContract;
  task.inputs = [{ artifactId: 'design', version: 'v1', location: capture }];
  task.context.interfaces = [{ artifactId: 'diagnostic', version: 'v1', location: 'failure-sources/original/manifest.json' }];
  task.ownership = { writePaths: ['authors/design/design.json'], readOnlyPaths: ['requirements', 'registry', 'failure-sources'] };
  await put(root, requirement.sources[0].location, '{"需求":"保留准确中文"}\n');
  await put(root, `${capture}/_cosmos/design.json`, '{"说明":"相同固定输入"}\n');
  await put(root, `${capture}/public/角色.png`, bytes);
  await put(root, task.context.interfaces[0].location, '{"诊断":"仅为引用，未声明通过"}\n');
  await put(root, 'authors/design/design.json', '{"不完整旧作者文件":true}');
  await put(root, 'registry/captures/unrelated/v1/files/private.txt', '不应复制');
  const workspace = join(root, 'continuations/decision-1/workspace');
  const abort = new AbortController();
  return { root, options: { artifactRoot: root, workspace, task, requirement, signal: abort.signal }, abort };
}
async function fileState(root: string) {
  const files = (await readdir(root, { recursive: true }).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; })).sort();
  return Promise.all(files.map(async name => { const info = await lstat(join(root, name)); return [name, info.isFile() ? (await readFile(join(root, name))).toString('hex') : 'directory']; }));
}

test('mirrors only explicit fixed inputs as independent Chinese and binary files without changing sources', async t => {
  const { root, options } = await fixture(t);
  const paths = [options.requirement.sources[0].location, `${capture}/_cosmos/design.json`, `${capture}/public/角色.png`, options.task.context.interfaces[0].location];
  const before = await Promise.all(paths.map(async path => ({ path, bytes: await readFile(join(root, path)), info: await stat(join(root, path)) })));
  await materializeTaskInputs(options);
  for (const source of before) {
    const mirrored = join(options.workspace, source.path), info = await stat(mirrored);
    assert.deepEqual(await readFile(mirrored), source.bytes);
    assert.deepEqual(await readFile(join(root, source.path)), source.bytes);
    assert.equal((await stat(join(root, source.path))).mtimeMs, source.info.mtimeMs);
    assert.equal(info.nlink, 1); assert.notEqual(info.ino, source.info.ino);
  }
  assert.equal(await readFile(join(options.workspace, paths[0]), 'utf8'), '{"需求":"保留准确中文"}\n');
  assert.deepEqual(await readFile(join(options.workspace, `${capture}/public/角色.png`)), bytes);
  await assert.rejects(lstat(join(options.workspace, 'authors')), /ENOENT/);
  await assert.rejects(lstat(join(options.workspace, 'registry/captures/unrelated')), /ENOENT/);
});

test('repeated and concurrent calls preserve existing exact files and complete only missing files', async t => {
  const { options } = await fixture(t);
  const file = options.requirement.sources[0].location;
  await put(options.workspace, file, await readFile(join(options.artifactRoot, file)));
  await utimes(join(options.workspace, file), 1, 1);
  const before = await stat(join(options.workspace, file));
  await Promise.all([materializeTaskInputs(options), materializeTaskInputs(options), materializeTaskInputs({ ...options, task: structuredClone(options.task) })]);
  assert.equal((await stat(join(options.workspace, file))).mtimeMs, before.mtimeMs);
  assert.equal((await stat(join(options.workspace, file))).ino, before.ino);
  await materializeTaskInputs(options);
  assert.equal((await stat(join(options.workspace, file))).mtimeMs, before.mtimeMs);
  assert.deepEqual(await readFile(join(options.workspace, `${capture}/public/角色.png`)), bytes);
});

for (const conflict of ['content', 'extra-file'] as const) test(`refuses ${conflict} before adding any missing input`, async t => {
  const { options } = await fixture(t);
  await put(options.workspace, `${capture}/${conflict === 'content' ? '_cosmos/design.json' : 'unexpected.txt'}`, '不能覆盖');
  const before = await fileState(options.workspace);
  await assert.rejects(materializeTaskInputs(options), /conflict|unexpected|extra|differ/i);
  assert.deepEqual(await fileState(options.workspace), before);
});

test('workspace must be the isolated continuation workspace inside the same absolute run root', async t => {
  const { root, options } = await fixture(t);
  for (const workspace of [root, join(root, 'authors/design'), join(root, 'continuations/decision-1/other'), join(root, '../escaped-workspace'), 'relative/workspace']) {
    await assert.rejects(materializeTaskInputs({ ...options, workspace }), /workspace|absolute|continuation/i);
  }
  await assert.rejects(lstat(options.workspace), /ENOENT/);
});

test('fixed input paths cannot escape, mirror old author partial files or overlap author write scopes', async t => {
  const { root, options } = await fixture(t);
  for (const location of ['../outside', join(root, 'requirements/v1.json'), 'authors/design/design.json', 'continuations/old/workspace/file.json', 'registry\\file.json']) {
    const task = structuredClone(options.task); task.inputs[0].location = location;
    await assert.rejects(materializeTaskInputs({ ...options, task }), /path|source|author|continuation/i);
  }
  for (const write of ['.', 'registry', `${capture}/_cosmos/design.json`, 'requirements/v1.json']) {
    const task = structuredClone(options.task); task.ownership.writePaths = [write];
    await assert.rejects(materializeTaskInputs({ ...options, task }), /overlap|write/i);
  }
  await assert.rejects(lstat(options.workspace), /ENOENT/);
});

test('non-UTF-8 declared text fails before writing while binary assets remain byte-preserved', async t => {
  const { options } = await fixture(t);
  await writeFile(join(options.artifactRoot, `${capture}/_cosmos/design.json`), Buffer.from([0xff, 0xfe, 0x41, 0x00]));
  await assert.rejects(materializeTaskInputs(options), /UTF-8|encoding|encoded/i);
  await assert.rejects(lstat(options.workspace), /ENOENT/);
});

test('text without a standard text suffix cannot bypass UTF-8 validation', async t => {
  const { options } = await fixture(t);
  await put(options.artifactRoot, `${capture}/DIAGNOSTIC`, Buffer.from([0xff, 0xfe, 0x41, 0x00]));
  await assert.rejects(materializeTaskInputs(options), /UTF-8|encoding|encoded/i);
  await assert.rejects(lstat(options.workspace), /ENOENT/);
});

test('source links, destination junctions and hardlinked mirrors are rejected', async t => {
  const { root, options } = await fixture(t);
  await mkdir(options.workspace, { recursive: true });
  await symlink(join(root, 'requirements'), join(options.workspace, 'requirements'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(materializeTaskInputs(options), /link|junction/i);
  await rm(join(options.workspace, 'requirements'));
  await mkdir(join(options.workspace, 'requirements'));
  await link(join(root, 'requirements/v1.json'), join(options.workspace, 'requirements/v1.json'));
  await assert.rejects(materializeTaskInputs(options), /independent|link/i);
  await rm(join(options.workspace, 'requirements/v1.json'));
  const original = options.task.context.interfaces[0];
  await symlink(join(root, 'failure-sources/original'), join(root, 'linked-source'), process.platform === 'win32' ? 'junction' : 'dir');
  options.task.context.interfaces[0] = { ...original, location: 'linked-source/manifest.json' };
  await assert.rejects(materializeTaskInputs(options), /link|junction/i);
});

test('cancellation rejects without a success marker and a later independent call can complete missing inputs', async t => {
  const { options, abort } = await fixture(t);
  abort.abort(new Error('cancelled input preparation'));
  await assert.rejects(materializeTaskInputs(options), /cancelled/i);
  await assert.rejects(lstat(options.workspace), /ENOENT/);
  const next = new AbortController(), pending = materializeTaskInputs({ ...options, signal: next.signal });
  next.abort(new Error('cancelled while preparing'));
  await assert.rejects(pending, /cancelled/i);
  await materializeTaskInputs({ ...options, signal: new AbortController().signal });
  assert.equal((await fileState(options.workspace)).some(([name]) => String(name).includes('complete')), false);
});

test('cancellation after copying begins rejects and leaves source bytes unchanged', async t => {
  const { root, options, abort } = await fixture(t);
  await mkdir(options.workspace, { recursive: true });
  const before = await readFile(join(root, options.requirement.sources[0].location));
  let observed = false;
  const watcher = watch(options.workspace, { recursive: true }, (_event, name) => {
    if (!observed && String(name).replaceAll('\\', '/') === options.requirement.sources[0].location) {
      observed = true; abort.abort(new Error('cancelled after first mirror write'));
    }
  });
  try { await assert.rejects(materializeTaskInputs(options), /cancelled|abort/i); }
  finally { watcher.close(); }
  assert.equal(observed, true);
  assert.deepEqual(await readFile(join(root, options.requirement.sources[0].location)), before);
  await assert.rejects(lstat(join(options.workspace, `${capture}/public/角色.png`)), /ENOENT/);
});

test('source changes during copying cannot return a successful fixed mirror', async t => {
  const { root, options } = await fixture(t);
  await mkdir(options.workspace, { recursive: true });
  let changed = false;
  const watcher = watch(options.workspace, { recursive: true }, (_event, name) => {
    if (!changed && String(name).replaceAll('\\', '/') === options.requirement.sources[0].location) {
      changed = true;
      writeFileSync(join(root, `${capture}/_cosmos/design.json`), '{"说明":"来源在复制期间改变"}\n', 'utf8');
    }
  });
  try { await assert.rejects(materializeTaskInputs(options), /source changed/i); }
  finally { watcher.close(); }
  assert.equal(changed, true);
});
