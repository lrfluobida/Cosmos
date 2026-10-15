import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { captureTransferCaseSevenSource } from '../../probes/transfer/validation-case-seven-source.ts';
test('C7 source binds the actual loaded Playwright descendants and compiler execution leaves', async () => {
  const require = createRequire(import.meta.url); require('playwright/test');
  const seed = require.cache[require.resolve('playwright/test')]!, paths = new Set<string>();
  function visit(module: NodeJS.Module) { if (paths.has(module.filename)) return; paths.add(module.filename); for (const child of module.children) visit(child); }
  visit(seed);
  const source: any = await captureTransferCaseSevenSource(), browser = source.dependencies.find((d: any) => d.name === '@playwright/test');
  for (const path of paths) assert.ok(browser.files?.some((file: any) => file.path === path), `Actual loaded Playwright module is unbound: ${path}`);
  assert.ok(source.toolchain?.tools?.some((tool: any) => tool.name === 'typescript' && tool.files.some((file: any) => file.relative.endsWith('_tsc.js'))), 'Actual tsc execution leaf is unbound.');
  assert.ok(source.toolchain?.tools?.some((tool: any) => tool.name === 'vite' && tool.files.some((file: any) => file.relative.endsWith('cli.js'))), 'Actual Vite execution leaf is unbound.');
});
for (const [name, mode] of [
  ['COS96 known source reads overlap in groups of four', 'overlap'],
  ['COS96 known source failure drains its group in original index order', 'failure'],
  ['COS96 known source pre-abort starts no reads and a later call is fresh', 'pre-abort'],
  ['COS96 known source cancellation drains started reads without another group', 'cancel'],
  ['COS96 known source late rejections after cancellation remain observed', 'late-reject'],
  ['COS96 known source real byte drift and restoration are read afresh by the same leaf', 'fresh'],
  ['COS96 known source overlapping calls each retain their own limit of four', 'concurrent'],
] as const) test(name, async t => {
  const fixture = fileURLToPath(new URL('./validation-case-seven-source.fixture.mjs', import.meta.url));
  const { stdout } = await promisify(execFile)(process.execPath, ['--experimental-strip-types', fixture, mode], { timeout: 10000 });
  assert.equal(JSON.parse(stdout).passed, true); t.diagnostic(stdout.trim());
});
