import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { regularFile, safePath, snapshot, within } from '../artifacts/paths.ts';
import { roleToolEnvironment } from '../roles/factory.ts';
import type { ArtifactReference } from '../contracts/types.ts';
import { OBSERVER_SOURCE, renderFrameBuildArguments } from './entrypoint-frames.ts';
import { MODULE_CONTRACTS, MODULE_SLOTS, moduleDirectory, moduleProbe, moduleSource, validateModuleContracts, validateModuleFiles, validateModuleProgram } from './modular-code.ts';
import type { ModularCompilerInputs } from './modular-code.ts';

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
  observer?: { directory: string; ref: ArtifactReference; sha256: string };
  modular?: ModularCompilerInputs;
}
export async function projectInputs(input: CodingCheckRequest) {
  const slot = input.modular?.slot, source = await snapshot(await safePath(input.workspace, slot && slot !== 'integration' ? moduleSource(slot) : 'authors/coding'));
  if (slot && slot !== 'integration') validateModuleFiles(source, slot);
  else if (source.size < 2 || !source.has('index.html') || !source.has('src/main.ts')
    || [...source.keys()].some(name => name !== 'index.html' && (slot === 'integration' ? name !== 'src/main.ts' && !name.startsWith('src/integration/') : !name.startsWith('src/')))) throw new Error('Coding check requires only current scoped index.html and src files.');
  for (const bytes of source.values()) new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const template = new Map<string, Buffer>();
  for (const name of CODING_TEMPLATE_FILES) template.set(name, await regularFile(input.template, name));
  const media = await snapshot(await safePath(input.media, 'public/assets'));
  if (codingSignature(source) !== input.sourceSignature || codingSignature(template) !== input.templateSignature || codingSignature(media) !== input.mediaSignature) {
    throw new Error('Coding check source or fixed input bytes changed.');
  }
  if (input.observer) {
    const bytes = await regularFile(input.observer.directory, OBSERVER_SOURCE);
    if (input.observer.ref.artifactId !== 'render-frame-observer' || input.observer.ref.version !== 'v1'
      || input.observer.ref.location !== 'registry/captures/render-frame-observer/v1/files'
      || !resolve(input.observer.directory).replaceAll('\\', '/').endsWith('/' + input.observer.ref.location)
      || createHash('sha256').update(bytes).digest('hex') !== input.observer.sha256) throw new Error('Coding check selected observer capture/signature changed.');
    template.set(OBSERVER_SOURCE, bytes);
  }
  if (input.modular) {
    const fixed = input.modular.contracts, bytes = await regularFile(fixed.directory, MODULE_CONTRACTS);
    if (fixed.ref.artifactId !== 'design' || fixed.ref.version !== 'v1' || fixed.ref.location !== 'registry/captures/design/v1/files'
      || !resolve(fixed.directory).replaceAll('\\', '/').endsWith('/' + fixed.ref.location) || createHash('sha256').update(bytes).digest('hex') !== fixed.sha256) throw new Error('Protected module interface capture changed.');
    validateModuleContracts(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); template.set(MODULE_CONTRACTS, bytes);
    if (slot !== 'integration') template.set('src/cosmos-module-probe.ts', Buffer.from(moduleProbe(slot!)));
    else {
      if (input.modular.modules?.length !== 2) throw new Error('Integration compiler needs both fixed modules.');
      for (const [index, module] of input.modular.modules.entries()) {
        if (module.slot !== MODULE_SLOTS[index] || module.ref.artifactId !== `module-${module.slot}` || !['v1', 'v2'].includes(module.ref.version)
          || module.ref.location !== `registry/captures/module-${module.slot}/${module.ref.version}/files` || !resolve(module.directory).replaceAll('\\', '/').endsWith('/' + module.ref.location)) throw new Error('Integration module identity changed.');
        const files = await snapshot(module.directory); validateModuleFiles(files, module.slot);
        if (codingSignature(files) !== module.signature) throw new Error('Integration module capture bytes changed.');
        for (const [name, bytes] of files) template.set(name, bytes);
      }
    }
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
  const args = input.phase === 'typecheck' ? [join(modules, 'typescript/bin/tsc'), '--noEmit', '-p', 'tsconfig.json'] : renderFrameBuildArguments(input.toolchain, !!input.observer);
  const result = await compiler(args, work);
  let moduleCheck: { passed: boolean; exports?: string[]; error?: string } | undefined;
  if (input.modular && input.modular.slot !== 'integration' && result.code === 0) {
    try { moduleCheck = { passed: true, exports: validateModuleProgram(work, input.modular.slot) }; }
    catch (error) { moduleCheck = { passed: false, error: error instanceof Error ? error.message : 'Actual namespace proof failed.' }; }
  }
  await projectInputs(input);
  return { passed: result.code === 0 && moduleCheck?.passed !== false, work, workerPid: process.pid, ...(moduleCheck ? { moduleCheck } : {}),
    diagnostics: (result.stdout + result.stderr + (moduleCheck?.error ?? '')).slice(0, 24000), results: [result] };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(CODING_CHECK_RESULT + JSON.stringify(await check(JSON.parse(process.argv[2]))) + '\n'); }
  catch (error) { process.stderr.write((error instanceof Error ? error.message : 'Coding build check failed.') + '\n'); process.exitCode = 1; }
}
