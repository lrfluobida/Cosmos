import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { regularFile, safePath, snapshot, within } from '../artifacts/paths.ts';
import { roleToolEnvironment } from '../roles/factory.ts';

export const CODING_CHECK_RESULT = 'COSMOS_CODING_BUILD_RESULT=';
export const CODING_TEMPLATE_FILES = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts'];
export const codingSignature = (files: Map<string, Buffer>) => createHash('sha256').update(JSON.stringify([...files].sort(([a], [b]) => a.localeCompare(b))
  .map(([name, bytes]) => [name, createHash('sha256').update(bytes).digest('hex')]))).digest('hex');
export async function codingInputSignature(root: string, locations: string[]): Promise<string> {
  const files = new Map<string, Buffer>();
  for (const location of new Set(locations)) {
    const path = await safePath(root, location), info = await lstat(path);
    if (info.isDirectory()) for (const [name, bytes] of await snapshot(path)) files.set(`${location}/${name}`, bytes);
    else files.set(location, await regularFile(root, location));
  }
  return codingSignature(files);
}
export interface CodingCheckRequest {
  taskId: string; attemptId: string; workspace: string; toolchain: string; template: string; media: string; deadlineAt: string;
  phase: 'typecheck' | 'build'; work?: string;
  sourceSignature: string; templateSignature: string; mediaSignature: string;
}
async function projectInputs(input: CodingCheckRequest) {
  const source = await snapshot(await safePath(input.workspace, 'authors/coding'));
  if (source.size < 2 || !source.has('index.html') || !source.has('src/main.ts')
    || [...source.keys()].some(name => name !== 'index.html' && !name.startsWith('src/'))) throw new Error('Coding check requires only current index.html and src files.');
  for (const bytes of source.values()) new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const template = new Map<string, Buffer>();
  for (const name of CODING_TEMPLATE_FILES) template.set(name, await regularFile(input.template, name));
  const media = await snapshot(await safePath(input.media, 'public/assets'));
  if (codingSignature(source) !== input.sourceSignature || codingSignature(template) !== input.templateSignature || codingSignature(media) !== input.mediaSignature) {
    throw new Error('Coding check source or fixed input bytes changed.');
  }
  return { source, template, media };
}
async function compiler(args: string[], cwd: string) {
  const child = spawn(process.execPath, args, { cwd, shell: false, windowsHide: true, env: roleToolEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  const append = (kind: 'stdout' | 'stderr', bytes: Buffer) => {
    if (kind === 'stdout') stdout = (stdout + bytes).slice(0, 24000); else stderr = (stderr + bytes).slice(0, 24000);
  };
  child.stdout.on('data', bytes => append('stdout', bytes)); child.stderr.on('data', bytes => append('stderr', bytes));
  const code = await new Promise<number | null>((done, reject) => { child.once('error', reject); child.once('close', done); });
  return { code, stdout, stderr, pid: child.pid };
}

/** Static host worker. All writes start only after runOwnedNode releases its registered launcher. */
async function check(input: CodingCheckRequest) {
  const { source, template, media } = await projectInputs(input);
  const modules = await realpath(await safePath(input.toolchain, 'node_modules'));
  for (const command of ['typescript/bin/tsc', 'vite/bin/vite.js']) await regularFile(modules, command);
  if (Date.parse(input.deadlineAt) - Date.now() <= 5000) throw new Error('Coding check has insufficient cleanup time.');
  const prefix = `cosmos-coding-${input.taskId}-${input.attemptId}-check-`;
  let work: string;
  if (input.phase === 'typecheck' && input.work === undefined) {
    work = await mkdtemp(join(tmpdir(), prefix));
    for (const [name, bytes] of [...template, ...source, ...[...media].map(([name, bytes]) => [`public/assets/${name}`, bytes] as const)]) {
      const path = await safePath(work, name); await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes, { flag: 'wx' });
    }
    await symlink(modules, join(work, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  } else if (input.phase === 'build' && input.work && within(tmpdir(), input.work) && basename(input.work).startsWith(prefix)) {
    work = await safePath(input.work);
    for (const [name, bytes] of [...template, ...source, ...[...media].map(([name, bytes]) => [`public/assets/${name}`, bytes] as const)]) {
      if (!(await regularFile(work, name)).equals(bytes)) throw new Error('Coding check assembled input bytes changed before Vite.');
    }
    if (await realpath(join(work, 'node_modules')) !== modules) throw new Error('Coding check assembled toolchain changed before Vite.');
  } else throw new Error('Coding check requires its fixed compiler phase and isolated project.');
  if (Date.parse(input.deadlineAt) - Date.now() <= 5000) throw new Error('Coding check has insufficient cleanup time.');
  const args = input.phase === 'typecheck' ? [join(modules, 'typescript/bin/tsc'), '--noEmit', '-p', 'tsconfig.json'] : [join(modules, 'vite/bin/vite.js'), 'build'];
  const result = await compiler(args, work);
  await projectInputs(input);
  return { passed: result.code === 0, work, workerPid: process.pid,
    diagnostics: (result.stdout + result.stderr).slice(0, 24000), results: [result] };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(CODING_CHECK_RESULT + JSON.stringify(await check(JSON.parse(process.argv[2]))) + '\n'); }
  catch (error) { process.stderr.write((error instanceof Error ? error.message : 'Coding build check failed.') + '\n'); process.exitCode = 1; }
}
