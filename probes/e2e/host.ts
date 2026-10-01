import { spawn } from 'node:child_process';
import { cp, lstat, mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import type { ArtifactReference } from '../../src/contracts/types.ts';
import { directory, pathName, regularFile, safePath } from '../../src/artifacts/paths.ts';
import { stopBrowserProcess } from '../../src/acceptance/process.ts';
import { filteredChildEnvironment } from './admission.ts';

export async function jsonFile(root: string, path: string): Promise<any> {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, path)));
}
export async function writeJson(root: string, path: string, value: unknown): Promise<void> {
  const destination = await safePath(root, path); await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
}
export async function files(root: string, folder = '.'): Promise<string[]> {
  const names: string[] = [];
  for (const entry of await readdir(await safePath(root, folder), { withFileTypes: true })) {
    const path = folder === '.' ? entry.name : `${folder}/${entry.name}`; pathName(path);
    if (entry.isDirectory()) names.push(...await files(root, path));
    else { await regularFile(root, path); names.push(path); }
  }
  return names.sort();
}
export async function copyReviewInputs(root: string, reviewRoot: string, refs: ArtifactReference[]): Promise<void> {
  await mkdir(reviewRoot, { recursive: true });
  for (const location of new Set(refs.map(ref => ref.location))) {
    const source = await safePath(root, location), target = await safePath(reviewRoot, location);
    await mkdir(dirname(target), { recursive: true });
    if ((await lstat(source)).isDirectory()) {
      for (const name of await files(source)) {
        const bytes = await regularFile(source, name), destination = await safePath(target, name);
        await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, bytes, { flag: 'wx' });
      }
    } else await writeFile(target, await regularFile(root, location), { flag: 'wx' });
  }
}

/** Runs a fixed host command. No shell, inherited secrets, unbounded output or surviving owned child. */
export async function runChild(executable: string, args: string[], options: { cwd: string; signal: AbortSignal; timeoutMs: number }) {
  options.signal.throwIfAborted();
  const child = spawn(executable, args, { cwd: options.cwd, env: filteredChildEnvironment(process.env), shell: false, windowsHide: true,
    detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', reason = '', cleanup: Promise<void> | undefined;
  const stop = (message: string) => { reason ||= message; cleanup ??= stopBrowserProcess(child, 3000); void cleanup.catch(() => {}); };
  const collect = (kind: 'stdout' | 'stderr', data: Buffer) => {
    if (stdout.length + stderr.length > 2_000_000) { stop('Host command output limit reached'); return; }
    if (kind === 'stdout') stdout += String(data); else stderr += String(data);
  };
  child.stdout.on('data', data => collect('stdout', data)); child.stderr.on('data', data => collect('stderr', data));
  const abort = () => stop('Host command aborted'); options.signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => stop('Host command timed out'), options.timeoutMs);
  try {
    const code = await new Promise<number | null>((done, reject) => { child.once('error', reject); child.once('close', done); });
    await cleanup;
    if (reason) throw new Error(reason);
    return { code, stdout, stderr };
  } finally { clearTimeout(timer); options.signal.removeEventListener('abort', abort); }
}

export async function prepareToolchain(repository: string, root: string, signal: AbortSignal): Promise<string> {
  const tools = await directory(root, 'toolchain');
  await cp(join(repository, 'templates/2d'), tools, { recursive: true, filter: path => !path.split(sep).includes('node_modules') && !path.split(sep).includes('dist') });
  const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const installed = await runChild(process.execPath, [npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: tools, signal, timeoutMs: 180_000 });
  await writeJson(root, 'toolchain-install.json', installed);
  if (installed.code !== 0) throw new Error('Generic toolchain installation failed; inspect toolchain-install.json');
  return tools;
}

/** Builds outside the registered project. Only fresh dist bytes are added to the candidate. */
export async function buildProject(root: string, project: string, toolchain: string, name: string, signal: AbortSignal) {
  const work = await directory(root, `builds/${name}`);
  await cp(toolchain, work, { recursive: true });
  // Template game entry is overwritten by the registered model output; no host-written gameplay exists.
  await cp(project, work, { recursive: true, filter: path => !path.split(sep).includes('node_modules') && !path.split(sep).includes('dist') });
  const results = [];
  for (const args of [[join(toolchain, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', 'tsconfig.json'], [join(toolchain, 'node_modules/vite/bin/vite.js'), 'build']]) {
    const result = await runChild(process.execPath, args, { cwd: work, signal, timeoutMs: 120_000 }); results.push(result);
    if (result.code !== 0) return { passed: false, results, work };
  }
  await cp(join(work, 'dist'), join(project, 'dist'), { recursive: true, errorOnExist: true, force: false });
  return { passed: true, results, work };
}

/** Read-only static server serves the exact candidate dist; it never receives model credentials. */
export async function serveBuild(project: string) {
  const { createServer: httpServer } = await import('node:http');
  const root = join(project, 'dist');
  const server = httpServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const name = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
      const bytes = await regularFile(root, name);
      const type = name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.js') ? 'text/javascript; charset=utf-8'
        : name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.wav') ? 'audio/wav' : name.endsWith('.json') ? 'application/json' : 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); response.end(bytes);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No loopback server address');
  return { url: `http://127.0.0.1:${address.port}`, async close() { server.closeAllConnections(); await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); } };
}
