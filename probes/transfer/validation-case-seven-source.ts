import { readFile, realpath } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { sameValue } from '../../src/contracts/validation.ts';
import { validationHash } from '../../src/runtime/validation-validation.ts';
const dependencyNames = ['@earendil-works/pi-coding-agent', '@earendil-works/pi-ai', 'typebox', '@playwright/test'];
const templateNames = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts'];
async function sourcePath(path: string, signal: AbortSignal) {
  signal.throwIfAborted();
  try { const actual = await realpath(path); signal.throwIfAborted(); return actual; }
  catch (error) { signal.throwIfAborted(); throw error; }
}
async function sourceBytes(path: string, signal: AbortSignal) {
  signal.throwIfAborted();
  try { const bytes = await readFile(path, { signal }); signal.throwIfAborted(); return bytes; }
  catch (error) { signal.throwIfAborted(); throw error; }
}
async function packageSource(entry: string, name: string, signal: AbortSignal) {
  let folder = dirname(entry);
  for (;;) {
    signal.throwIfAborted();
    const path = join(folder, 'package.json');
    try { const bytes = await sourceBytes(path, signal), value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
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
    signal.throwIfAborted(); const path = await sourcePath(file, signal); signal.throwIfAborted(); if (files.has(path)) return;
    const bytes = await sourceBytes(path, signal); signal.throwIfAborted(); files.set(path, validationHash(bytes));
    if (!/\.(?:[cm]?js|json)$/.test(path) && path !== entry) return;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes), code = codePositions(text), require = createRequire(path);
    for (const match of text.matchAll(/\b(?:import|export)(?!\s+type\b)[^;\n]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*(?:\(\s*)?['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]/g)) {
      if (!code[match.index!]) continue; const ref = match[1] ?? match[2] ?? match[3];
      if (ref.startsWith('.')) await visit(require.resolve(ref));
      signal.throwIfAborted();
    }
  }
  await visit(entry); signal.throwIfAborted(); return [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, sha256]) => ({ path, sha256 }));
}
async function browserClosure(entry: string, signal: AbortSignal) {
  signal.throwIfAborted(); await import('@playwright/test'); signal.throwIfAborted();
  const require = createRequire(import.meta.url), runner = await sourcePath(fileURLToPath(import.meta.resolve('playwright/test')), signal);
  signal.throwIfAborted(); const paths = new Set([entry, runner]);
  const seed = require.cache[require.resolve('playwright/test')];
  if (!seed) throw new Error('Actual C7 Playwright runner is not loaded.');
  const seen = new Set<string>();
  function visit(module: NodeJS.Module) { if (seen.has(module.filename)) return; seen.add(module.filename); paths.add(module.filename); for (const child of module.children) visit(child); }
  visit(seed);
  for (const name of ['playwright', 'playwright-core']) {
    signal.throwIfAborted(); const selected = await sourcePath(require.resolve(name), signal); signal.throwIfAborted();
    const manifest = await packageSource(selected, name, signal); signal.throwIfAborted(); paths.add(selected); paths.add(manifest.path);
  }
  const files = [];
  for (const path of [...paths].sort()) { signal.throwIfAborted();
    const actual = await sourcePath(path, signal); signal.throwIfAborted();
    const bytes = await sourceBytes(path, signal); signal.throwIfAborted(); files.push({ path: actual, sha256: validationHash(bytes) }); }
  return files;
}
async function toolchainSource(root: string, signal: AbortSignal) {
  const files = [];
  for (const name of templateNames) { signal.throwIfAborted(); const path = await sourcePath(join(root, name), signal); signal.throwIfAborted();
    const bytes = await sourceBytes(path, signal); signal.throwIfAborted(); files.push({ name, path, sha256: validationHash(bytes) }); }
  const lockBytes = await sourceBytes(join(root, 'package-lock.json'), signal); signal.throwIfAborted();
  const lock = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(lockBytes)), tools = [];
  for (const [name, file] of [['typescript', 'typescript/bin/tsc'], ['vite', 'vite/bin/vite.js']]) {
    signal.throwIfAborted(); const invocation = join(root, 'node_modules', file), entry = await sourcePath(invocation, signal); signal.throwIfAborted();
    const manifest = await packageSource(entry, name, signal); signal.throwIfAborted(); const packageRoot = dirname(manifest.path);
    if (manifest.version !== lock.packages?.[`node_modules/${name}`]?.version) throw new Error('C7 installed tool version differs from its fixed template lock.');
    const closure = await directClosure(entry, signal); signal.throwIfAborted();
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
  return captureFixedTransferCodingSource('seven', signal);
}
/** Source-owned entry seeds only; the public runner accepts no closure selector. */
export async function captureFixedTransferCodingSource(name: 'seven' | 'eight' | 'nine' | 'ten' | 'eleven' | 'twelve' | 'thirteen' | 'fourteen' | 'fifteen' | 'sixteen', signal = new AbortController().signal) {
  const extension = import.meta.url.endsWith('.js') ? '.js' : '.ts', files = new Map<string, string>();
  async function visit(url: URL) {
    signal.throwIfAborted(); const path = await sourcePath(fileURLToPath(url), signal); signal.throwIfAborted(); if (files.has(path)) return;
    const bytes = await sourceBytes(path, signal); signal.throwIfAborted(); files.set(path, validationHash(bytes));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    for (const match of text.matchAll(/\b(?:import|export)(?!\s+type\b)[^;\n]*?\bfrom\s*['"](\.[^'"]+)['"]|\bimport\s*\(\s*['"](\.[^'"]+)['"]/g)) { await visit(new URL(match[1] ?? match[2], url)); signal.throwIfAborted(); }
  }
  for (const part of ['run', 'driver', 'task']) { await visit(new URL(`validation-case-${name}-${part}${extension}`, import.meta.url)); signal.throwIfAborted(); }
  for (const path of ['../e2e/validation-worker', '../../src/runtime/coding-check-worker', '../../src/acceptance/process']) { await visit(new URL(path + extension, import.meta.url)); signal.throwIfAborted(); }
  const platformLockPath = await sourcePath(fileURLToPath(new URL('../../package-lock.json', import.meta.url)), signal); signal.throwIfAborted();
  const dependencies = [];
  for (const name of dependencyNames) {
    signal.throwIfAborted(); const entry = await sourcePath(fileURLToPath(import.meta.resolve(name)), signal); signal.throwIfAborted();
    const manifest = await packageSource(entry, name, signal); signal.throwIfAborted();
    const bytes = await sourceBytes(entry, signal); signal.throwIfAborted();
    const closure = name === '@playwright/test' ? await browserClosure(entry, signal) : []; signal.throwIfAborted();
    dependencies.push({ name, entry, entrySha256: validationHash(bytes), ...manifest, files: closure });
  }
  const platformLockBytes = await sourceBytes(platformLockPath, signal); signal.throwIfAborted();
  const toolchain = await toolchainSource(fileURLToPath(new URL('../../templates/2d', import.meta.url)), signal); signal.throwIfAborted();
  const value = { variant: extension === '.js' ? 'compiled' : 'source', files: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, sha256]) => ({ path, sha256 })),
    platformLock: { path: platformLockPath, sha256: validationHash(platformLockBytes) }, dependencies, toolchain };
  return { ...value, sha256: validationHash(JSON.stringify(value)) };
}
export async function requireTransferCaseSevenSource(source: Awaited<ReturnType<typeof captureTransferCaseSevenSource>>, signal = new AbortController().signal) {
  return requireFixedTransferCodingSource('seven', source, signal);
}
export async function requireKnownTransferCodingSourceFiles(files: readonly { path: string; sha256: string }[], signal: AbortSignal) {
  for (let start = 0; start < files.length; start += 4) {
    signal.throwIfAborted();
    const settled = await Promise.allSettled(files.slice(start, start + 4).map(async file => {
      signal.throwIfAborted();
      if (validationHash(await readFile(file.path)) !== file.sha256) throw new Error('C7 actual executed source or dependency bytes changed.');
    }));
    for (const result of settled) if (result.status === 'rejected') throw result.reason;
    signal.throwIfAborted();
  }
}
export async function requireFixedTransferCodingSource(name: 'seven' | 'eight' | 'nine' | 'ten' | 'eleven' | 'twelve' | 'thirteen' | 'fourteen' | 'fifteen' | 'sixteen', source: Awaited<ReturnType<typeof captureTransferCaseSevenSource>>, signal = new AbortController().signal) {
  const { sha256, ...value } = source;
  if (sha256 !== validationHash(JSON.stringify(value))) throw new Error('C7 executed source receipt changed.');
  await requireKnownTransferCodingSourceFiles([...source.files, source.platformLock, ...source.dependencies.flatMap(d => [{ path: d.entry, sha256: d.entrySha256 }, { path: d.path, sha256: d.sha256 }, ...d.files])], signal);
  signal.throwIfAborted();
  if (!sameValue(source.dependencies.map(d => d.name), dependencyNames)) throw new Error('C7 fixed runtime dependency set changed.');
  for (const dependency of source.dependencies) { signal.throwIfAborted();
    const actual = await sourcePath(fileURLToPath(import.meta.resolve(dependency.name)), signal); signal.throwIfAborted();
    if (actual !== dependency.entry) throw new Error('C7 actual runtime dependency resolution changed.'); }
  const actual = await captureFixedTransferCodingSource(name, signal); signal.throwIfAborted();
  if (!sameValue(actual, source)) throw new Error('C7 actual execution import closure changed.');
}
/** Caller inputs and the code-owned baseline are the same fixed template before bootstrap. */
export async function requireTransferCaseSevenTemplate(source: Awaited<ReturnType<typeof captureTransferCaseSevenSource>>, repository: string, signal: AbortSignal) {
  for (const file of source.toolchain.files) { signal.throwIfAborted();
    const bytes = await sourceBytes(join(repository, 'templates/2d', file.name), signal); signal.throwIfAborted();
    if (validationHash(bytes) !== file.sha256) throw new Error('C7 caller template bytes differ from the executed source baseline.'); }
}
/** Rebind only fixed compiler invocations to the current case's actual installed bytes. */
export async function requireTransferCaseSevenToolchain(source: Awaited<ReturnType<typeof captureTransferCaseSevenSource>>, root: string, signal: AbortSignal) {
  const actual = await toolchainSource(join(root, 'toolchain'), signal); signal.throwIfAborted();
  if (!sameValue(actual.files.map(({ name, sha256 }) => ({ name, sha256 })), source.toolchain.files.map(({ name, sha256 }) => ({ name, sha256 })))
    || !sameValue(actual.tools.map(toolBinding), source.toolchain.tools.map(toolBinding))) throw new Error('C7 actual toolchain invocation, lock or execution closure bytes changed.');
}
