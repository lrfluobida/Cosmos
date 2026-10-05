import { readFile, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { sameValue } from '../../src/contracts/validation.ts';
import { validationHash } from '../../src/runtime/validation-validation.ts';
const dependencyNames = ['@earendil-works/pi-coding-agent', '@earendil-works/pi-ai', 'typebox', '@playwright/test'];
/** Only the fixed native execution import closure; no repository tree scan or model selector. */
export async function captureTransferCaseSevenSource(signal = new AbortController().signal) {
  const extension = import.meta.url.endsWith('.js') ? '.js' : '.ts', files = new Map<string, string>();
  async function visit(url: URL) {
    signal.throwIfAborted(); const path = await realpath(fileURLToPath(url)); if (files.has(path)) return;
    const bytes = await readFile(path); files.set(path, validationHash(bytes));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    for (const match of text.matchAll(/\b(?:import|export)(?!\s+type\b)[^;\n]*?\bfrom\s*['"](\.[^'"]+)['"]|\bimport\s*\(\s*['"](\.[^'"]+)['"]/g)) await visit(new URL(match[1] ?? match[2], url));
  }
  for (const path of ['validation-case-seven-run', 'validation-case-seven-driver', 'validation-case-seven-task']) await visit(new URL(path + extension, import.meta.url));
  for (const path of ['../e2e/validation-worker', '../../src/runtime/coding-check-worker', '../../src/acceptance/process']) await visit(new URL(path + extension, import.meta.url));
  const platformLockPath = await realpath(fileURLToPath(new URL('../../package-lock.json', import.meta.url)));
  const dependencies = [];
  for (const name of dependencyNames) {
    signal.throwIfAborted(); const entry = await realpath(fileURLToPath(import.meta.resolve(name))); let folder = dirname(entry);
    for (;;) {
      const path = join(folder, 'package.json');
      try {
        const bytes = await readFile(path), manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        if (manifest.name === name) { dependencies.push({ name, entry, entrySha256: validationHash(await readFile(entry)), path, sha256: validationHash(bytes), version: manifest.version as string }); break; }
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const parent = dirname(folder); if (parent === folder) throw new Error('Fixed C7 dependency manifest is missing.'); folder = parent;
    }
  }
  const value = { variant: extension === '.js' ? 'compiled' : 'source', files: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, sha256]) => ({ path, sha256 })),
    platformLock: { path: platformLockPath, sha256: validationHash(await readFile(platformLockPath)) }, dependencies };
  return { ...value, sha256: validationHash(JSON.stringify(value)) };
}
export async function requireTransferCaseSevenSource(source: Awaited<ReturnType<typeof captureTransferCaseSevenSource>>, signal = new AbortController().signal) {
  const { sha256, ...value } = source;
  if (sha256 !== validationHash(JSON.stringify(value))) throw new Error('C7 executed source receipt changed.');
  for (const file of [...source.files, source.platformLock, ...source.dependencies.flatMap(d => [{ path: d.entry, sha256: d.entrySha256 }, { path: d.path, sha256: d.sha256 }])]) {
    signal.throwIfAborted(); if (validationHash(await readFile(file.path)) !== file.sha256) throw new Error('C7 actual executed source or dependency bytes changed.');
  }
  if (!sameValue(source.dependencies.map(d => d.name), dependencyNames)) throw new Error('C7 fixed runtime dependency set changed.');
  for (const dependency of source.dependencies) if (await realpath(fileURLToPath(import.meta.resolve(dependency.name))) !== dependency.entry) throw new Error('C7 actual runtime dependency resolution changed.');
  if (!sameValue(await captureTransferCaseSevenSource(signal), source)) throw new Error('C7 actual execution import closure changed.');
}
