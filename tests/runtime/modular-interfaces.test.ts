import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { roleToolEnvironment } from '../../src/roles/factory.ts';
import { moduleProbe, validateModuleContracts, validateModuleFiles, validateModuleProgram } from '../../src/runtime/modular-code.ts';

const contracts = 'export interface ModuleA { advance(value: number): number; }\nexport interface ModuleB { label(): string; }\n';
test('all TypeScript import forms stay inside captured module/interface or pinned Phaser scope', () => {
  for (const prefix of ['type Outside = import("C:/outside.d.ts").Value;', 'import Outside = require("C:/outside.d.ts");']) {
    assert.throws(() => validateModuleFiles(new Map([['src/modules/a/index.ts', Buffer.from(prefix + '\nexport function advance(value:number):number{return value;}')]]), 'a'));
  }
  validateModuleFiles(new Map([['src/modules/a/index.ts', Buffer.from('type Own=import("./types").Value;export function advance(value:Own):number{return value;}')],
    ['src/modules/a/types.ts', Buffer.from('export type Value=number;')]]), 'a');
});
test('protected declarations require two concrete callable interfaces and reject weakening', () => {
  validateModuleContracts(contracts);
  for (const first of ['export interface ModuleA {}', 'export interface ModuleA { advance?(value: number): number; }',
    'export interface ModuleA { advance(value: any): number; }', 'export interface ModuleA { advance(): unknown; }',
    'export interface ModuleA { [key: string]: () => number; }', 'export interface ModuleA { toString(): string; }', 'export type ModuleA = {};']) {
    assert.throws(() => validateModuleContracts(first + '\nexport interface ModuleB { label(): string; }'));
  }
  assert.throws(() => validateModuleContracts(contracts + '\nexport const mutable = 1;'));
});
test('actual pinned compiler checks real module namespace; empty namespace fails the required export', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos71-contract-')); t.after(() => removeOwned(tmpdir(), root));
  const toolchain = resolve(process.env.COSMOS_TEMPLATE_ROOT ?? fileURLToPath(new URL('../../templates/2d', import.meta.url)));
  await mkdir(join(root, '_cosmos')); await mkdir(join(root, 'src/modules/a'), { recursive: true });
  await writeFile(join(root, '_cosmos/module-contracts.d.ts'), contracts, 'utf8');
  await writeFile(join(root, 'tsconfig.json'), await readFile(join(toolchain, 'tsconfig.json')));
  await symlink(join(toolchain, 'node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  await writeFile(join(root, 'src/cosmos-module-probe.ts'), moduleProbe('a'), 'utf8');
  const compile = () => spawnSync(process.execPath, [join(toolchain, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', 'tsconfig.json'],
    { cwd: root, env: roleToolEnvironment(), encoding: 'utf8', windowsHide: true, timeout: 10000 });
  await writeFile(join(root, 'src/modules/a/index.ts'), 'export function advance(value: number) { return value + 1; }\n', 'utf8');
  const valid = compile(); assert.equal(valid.status, 0, valid.stdout + valid.stderr);
  assert.deepEqual(validateModuleProgram(root, 'a'), ['advance']);
  await writeFile(join(root, 'src/modules/a/index.ts'), 'export const advance: any = (value: number) => value + 1;\n', 'utf8');
  const weak = compile(); assert.equal(weak.status, 0, weak.stdout + weak.stderr); assert.throws(() => validateModuleProgram(root, 'a'));
  await writeFile(join(root, 'src/modules/a/index.ts'), 'export {};\n', 'utf8');
  const empty = compile(); assert.notEqual(empty.status, 0); assert.match(empty.stdout, /advance|ModuleA/);
});
