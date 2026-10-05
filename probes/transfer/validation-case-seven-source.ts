import { readFile, realpath } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { sameValue } from '../../src/contracts/validation.ts';
import { validationHash } from '../../src/runtime/validation-validation.ts';
const dependencyNames = ['@earendil-works/pi-coding-agent', '@earendil-works/pi-ai', 'typebox', '@playwright/test'];
const templateNames = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts'];
async function packageSource(entry: string, name: string) {
  let folder = dirname(entry);
  for (;;) {
    const path = join(folder, 'package.json');
    try { const bytes = await readFile(path), value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (value.name === name) return { path, sha256: validationHash(bytes), version: value.version as string }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const parent = dirname(folder); if (parent === folder) throw new Error('C7 actual dependency manifest is missing.'); folder = parent;
  }
}
/** Follow only executable literal relative imports/requires; never enumerate vendor directories. */
async function directClosure(entry: string, signal: AbortSignal) {
  const files = new Map<string, string>();
  function codePositions(text: string) {
    const code = new Uint8Array(text.length); let quote = '', comment = '';
    for (let i = 0; i < text.length; i++) {
      const char = text[i], next = text[i + 1];
      if (comment === 'line') { if (char === '\n') comment = ''; continue; }
      if (comment === 'block') { if (char === '*' && next === '/') { comment = ''; i++; } continue; }
      if (quote) { if (char === '\\') i++; else if (char === quote) quote = ''; continue; }
      if (char === '/' && (next === '/' || next === '*')) { comment = next === '/' ? 'line' : 'block'; i++; continue; }
      code[i] = 1; if (char === '"' || char === "'" || char === '`') quote = char;
    }
    return code;
  }
  async function visit(file: string) {
    signal.throwIfAborted(); const path = await realpath(file); if (files.has(path)) return;
    const bytes = await readFile(path); files.set(path, validationHash(bytes));
    if (!/\.(?:[cm]?js|json)$/.test(path) && path !== entry) return;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes), code = codePositions(text), require = createRequire(path);
    for (const match of text.matchAll(/\b(?:import|export)(?!\s+type\b)[^;\n]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*(?:\(\s*)?['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]/g)) {
      if (!code[match.index!]) continue; const ref = match[1] ?? match[2] ?? match[3];
      if (ref.startsWith('.')) await visit(require.resolve(ref));
    }
  }
  await visit(entry); return [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, sha256]) => ({ path, sha256 }));
}
async function browserClosure(entry: string, signal: AbortSignal) {
  await import('@playwright/test');
  const require = createRequire(import.meta.url), paths = new Set([entry, await realpath(fileURLToPath(import.meta.resolve('playwright/test')))]);
  const seed = require.cache[require.resolve('playwright/test')];
  if (!seed) throw new Error('Actual C7 Playwright runner is not loaded.');
  const seen = new Set<string>();
  function visit(module: NodeJS.Module) { if (seen.has(module.filename)) return; seen.add(module.filename); paths.add(module.filename); for (const child of module.children) visit(child); }
  visit(seed);
  for (const name of ['playwright', 'playwright-core']) {
    const selected = await realpath(require.resolve(name)), manifest = await packageSource(selected, name); paths.add(selected); paths.add(manifest.path);
  }
  const files = [];
  for (const path of [...paths].sort()) { signal.throwIfAborted(); files.push({ path: await realpath(path), sha256: validationHash(await readFile(path)) }); }
  return files;
}
async function toolchainSource(root: string, signal: AbortSignal) {
  const files = [];
  for (const name of templateNames) { const path = await realpath(join(root, name)); files.push({ name, path, sha256: validationHash(await readFile(path)) }); }
  const lock = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(join(root, 'package-lock.json')))), tools = [];
  for (const [name, file] of [['typescript', 'typescript/bin/tsc'], ['vite', 'vite/bin/vite.js']]) {
    signal.throwIfAborted(); const invocation = join(root, 'node_modules', file), entry = await realpath(invocation), manifest = await packageSource(entry, name), packageRoot = dirname(manifest.path);
    if (manifest.version !== lock.packages?.[`node_modules/${name}`]?.version) throw new Error('C7 installed tool version differs from its fixed template lock.');
    const closure = await directClosure(entry, signal);
    const bound = closure.map(item => { const path = relative(packageRoot, item.path).replaceAll('\\', '/');
      if (path.startsWith('../')) throw new Error('C7 tool execution closure escapes its fixed package.'); return { relative: path, sha256: item.sha256 }; });
    tools.push({ name, invocation, entry, ...manifest, files: bound });
  }
  return { root, files, tools };
}
function toolBinding(tool: Awaited<ReturnType<typeof toolchainSource>>['tools'][number]) {
  return { name: tool.name, version: tool.version, manifestSha256: tool.sha256, files: tool.files };
}
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
    signal.throwIfAborted(); const entry = await realpath(fileURLToPath(import.meta.resolve(name))), manifest = await packageSource(entry, name);
    dependencies.push({ name, entry, entrySha256: validationHash(await readFile(entry)), ...manifest, files: name === '@playwright/test' ? await browserClosure(entry, signal) : [] });
  }
  const value = { variant: extension === '.js' ? 'compiled' : 'source', files: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, sha256]) => ({ path, sha256 })),
    platformLock: { path: platformLockPath, sha256: validationHash(await readFile(platformLockPath)) }, dependencies,
    toolchain: await toolchainSource(fileURLToPath(new URL('../../templates/2d', import.meta.url)), signal) };
  return { ...value, sha256: validationHash(JSON.stringify(value)) };
}
export async function requireTransferCaseSevenSource(source: Awaited<ReturnType<typeof captureTransferCaseSevenSource>>, signal = new AbortController().signal) {
  const { sha256, ...value } = source;
  if (sha256 !== validationHash(JSON.stringify(value))) throw new Error('C7 executed source receipt changed.');
  for (const file of [...source.files, source.platformLock, ...source.dependencies.flatMap(d => [{ path: d.entry, sha256: d.entrySha256 }, { path: d.path, sha256: d.sha256 }, ...d.files])]) {
    signal.throwIfAborted(); if (validationHash(await readFile(file.path)) !== file.sha256) throw new Error('C7 actual executed source or dependency bytes changed.');
  }
  if (!sameValue(source.dependencies.map(d => d.name), dependencyNames)) throw new Error('C7 fixed runtime dependency set changed.');
  for (const dependency of source.dependencies) if (await realpath(fileURLToPath(import.meta.resolve(dependency.name))) !== dependency.entry) throw new Error('C7 actual runtime dependency resolution changed.');
  if (!sameValue(await captureTransferCaseSevenSource(signal), source)) throw new Error('C7 actual execution import closure changed.');
}
/** Caller inputs and the code-owned baseline are the same fixed template before bootstrap. */
export async function requireTransferCaseSevenTemplate(source: Awaited<ReturnType<typeof captureTransferCaseSevenSource>>, repository: string, signal: AbortSignal) {
  for (const file of source.toolchain.files) { signal.throwIfAborted();
    if (validationHash(await readFile(join(repository, 'templates/2d', file.name))) !== file.sha256) throw new Error('C7 caller template bytes differ from the executed source baseline.'); }
}
/** Rebind only fixed compiler invocations to the current case's actual installed bytes. */
export async function requireTransferCaseSevenToolchain(source: Awaited<ReturnType<typeof captureTransferCaseSevenSource>>, root: string, signal: AbortSignal) {
  const actual = await toolchainSource(join(root, 'toolchain'), signal);
  if (!sameValue(actual.files.map(({ name, sha256 }) => ({ name, sha256 })), source.toolchain.files.map(({ name, sha256 }) => ({ name, sha256 })))
    || !sameValue(actual.tools.map(toolBinding), source.toolchain.tools.map(toolBinding))) throw new Error('C7 actual toolchain invocation, lock or execution closure bytes changed.');
}
