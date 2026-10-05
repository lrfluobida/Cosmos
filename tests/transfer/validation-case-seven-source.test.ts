import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { realpath } from 'node:fs/promises';
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
