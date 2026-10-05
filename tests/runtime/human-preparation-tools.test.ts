import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';
import { createHumanTransferConsumerHost } from '../../src/runtime/adapters/transfer/runtime-host.ts';
import { humanFixture, installHumanTools } from '../transfer/human-preparation.fixture.ts';

test('actual installed TypeScript and Vite byte drift is refused before an owned callback', async t => {
  for (const relative of ['typescript/bin/tsc', 'vite/bin/vite.js']) {
    const f = await humanFixture(t); await installHumanTools(f.root);
    const host = await createHumanTransferConsumerHost(await f.input()); t.after(() => host.closePreparation());
    const path = join(f.root, 'toolchain/node_modules', relative), bytes = await readFile(path); await writeFile(path, Buffer.concat([bytes, Buffer.from('// drift\n')]));
    let entered = false; await assert.rejects(host.withPreparation(async () => { entered = true; }), /source|dependency|tool|bytes/i); assert.equal(entered, false);
    await assert.rejects(createHumanTransferConsumerHost(await f.input(true)), /source|binding/i);
  }
});

test('tool direct closure, manifest and lock byte drift are refused by current guards and cold resume', async t => {
  for (const relative of ['node_modules/typescript/lib/compiler.cjs', 'node_modules/vite/dist/node/cli.js', 'node_modules/typescript/package.json', 'package-lock.json']) {
    const f = await humanFixture(t), host = await createHumanTransferConsumerHost(await f.input()); t.after(() => host.closePreparation());
    const path = join(f.root, 'toolchain', relative), bytes = await readFile(path); await writeFile(path, Buffer.concat([bytes, Buffer.from('\n')]));
    let entered = false; await assert.rejects(host.withPreparation(async () => { entered = true; }), /source|dependency|tool|bytes/i); assert.equal(entered, false);
    await assert.rejects(createHumanTransferConsumerHost(await f.input(true)), /source|binding|version|lock/i);
  }
});

test('actual persistent runner Playwright entry and direct closure are present in the source receipt', async t => {
  const f = await humanFixture(t); await installHumanTools(f.root);
  const host = await createHumanTransferConsumerHost(await f.input()); t.after(() => host.closePreparation());
  const receipt = JSON.parse(await readFile(join(f.root, 'host-human-preparation-source.json'), 'utf8'));
  const playwright = receipt.execution.dependencies.find((item: any) => item.name === '@playwright/test');
  assert.ok(playwright, 'actual Playwright dependency source is missing'); assert.equal(playwright.version, '1.63.0');
  assert.ok(playwright.files.some((file: any) => /playwright[\\/]test\.mjs$/.test(file.path)), 'Playwright test wrapper closure is missing');
  assert.ok(playwright.files.some((file: any) => /playwright-core[\\/]lib[\\/]coreBundle\.js$/.test(file.path)), 'Actual Chromium implementation closure is missing');
  for (const tool of receipt.execution.toolchain.tools) { assert.equal(tool.version, tool.name === 'typescript' ? '5.9.3' : '8.3.1'); assert.ok(tool.files.length >= 2); }
});

test('actual installed TypeScript wrapper binds its executed compiler bundle without invoking it', async t => {
  const f = await humanFixture(t), repository = fileURLToPath(new URL('../../', import.meta.url)), packagePath = join(f.root, 'toolchain/node_modules/typescript');
  await rename(packagePath, join(f.root, 'toolchain/synthetic-typescript'));
  await symlink(join(repository, 'node_modules/typescript'), packagePath, process.platform === 'win32' ? 'junction' : 'dir');
  const host = await createHumanTransferConsumerHost(await f.input()); t.after(() => host.closePreparation());
  const receipt = JSON.parse(await readFile(join(f.root, 'host-human-preparation-source.json'), 'utf8')), tool = receipt.execution.toolchain.tools.find((tool: any) => tool.name === 'typescript');
  assert.equal(tool.version, '5.9.3'); assert.ok(tool.files.some((file: any) => file.path.endsWith('lib' + (process.platform === 'win32' ? '\\' : '/') + '_tsc.js')));
  await host.withPreparation(async () => {});
});

test('compiled actual tool and Playwright entry drift rejects current callback and original cold scope without changing installed dependencies', async t => {
  const repository = fileURLToPath(new URL('../../', import.meta.url)), compiled = await mkdtemp(join(tmpdir(), 'cos58-tool-sources-'));
  t.after(() => rm(compiled, { recursive: true, force: true }));
  const built = spawnSync(process.execPath, [join(repository, 'node_modules/typescript/bin/tsc'), '-p', join(repository, 'tsconfig.json'), '--outDir', join(compiled, 'dist')], { cwd: repository, encoding: 'utf8', windowsHide: true });
  assert.equal(built.status, 0, built.stdout + built.stderr);
  for (const file of ['package.json', 'package-lock.json']) await cp(join(repository, file), join(compiled, file));
  await mkdir(join(compiled, 'node_modules/@playwright'), { recursive: true });
  await cp(join(repository, 'node_modules/@playwright/test'), join(compiled, 'node_modules/@playwright/test'), { recursive: true });
  for (const name of ['@earendil-works', 'typebox', 'playwright', 'playwright-core']) await symlink(join(repository, 'node_modules', name), join(compiled, 'node_modules', name), process.platform === 'win32' ? 'junction' : 'dir');
  const api = await import(pathToFileURL(join(compiled, 'dist/runtime/adapters/transfer/runtime-host.js')).href);
  for (const name of ['typescript', 'vite', '@playwright/test']) {
    const f = await humanFixture(t), host = await api.createHumanTransferConsumerHost(await f.input()); t.after(() => host.closePreparation());
    const receipt = JSON.parse(await readFile(join(f.root, 'host-human-preparation-source.json'), 'utf8'));
    assert.equal(receipt.execution.variant, 'compiled'); assert.equal(receipt.execution.toolchain.tools.length, 2);
    const dependency = receipt.execution.dependencies.find((item: any) => item.name === '@playwright/test'); assert.ok(dependency.entry.startsWith(compiled));
    const path = name === '@playwright/test' ? dependency.entry : receipt.execution.toolchain.tools.find((tool: any) => tool.name === name).entry;
    const bytes = await readFile(path); await writeFile(path, Buffer.concat([bytes, Buffer.from('\n')]));
    let entered = false; await assert.rejects(host.withPreparation(async () => { entered = true; }), /source|dependency|bytes/i); assert.equal(entered, false);
    await assert.rejects(api.createHumanTransferConsumerHost(await f.input(true)), /source|binding/i);
  }
});
