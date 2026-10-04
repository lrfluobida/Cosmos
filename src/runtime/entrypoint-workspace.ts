import { lstat, realpath, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { directory, pathName, regularFile, safePath, snapshot } from '../artifacts/paths.ts';
import { checkShape, referenceShape } from '../contracts/structure.ts';
import type { ArtifactReference, TaskContract } from '../contracts/index.ts';
import type { ExecutionRequirement } from '../roles/execution-input.ts';

export interface MaterializeTaskInputsOptions {
  artifactRoot: string; workspace: string; task: TaskContract; requirement: ExecutionRequirement; signal: AbortSignal;
  validation?: { caseId: string; taskId: string };
}
interface FixedInput { location: string; directory: boolean; files: Map<string, Buffer> }
const pending = new Map<string, Promise<void>>();
const binaryExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp', '.wav', '.mp3', '.ogg', '.flac', '.mp4', '.webm', '.woff', '.woff2', '.ttf', '.otf', '.bin', '.zip', '.pdf']);
const overlaps = (a: string, b: string) => a === '.' || b === '.' || a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

async function readInput(root: string, location: string, signal: AbortSignal): Promise<FixedInput> {
  signal.throwIfAborted();
  const source = await safePath(root, location), info = await lstat(source);
  if (!info.isDirectory() && !info.isFile()) throw new Error('Fixed input must be a regular file or directory.');
  const files = info.isDirectory() ? await snapshot(source) : new Map([['', await regularFile(root, location)]]);
  for (const [name, bytes] of files) {
    signal.throwIfAborted();
    if (!binaryExtensions.has(extname(name || location).toLowerCase())) {
      try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { throw new Error(`Fixed text input is not UTF-8; preserve its encoding and investigate: ${location}${name ? `/${name}` : ''}`); }
    }
  }
  return { location, directory: info.isDirectory(), files };
}

async function checkMirror(workspace: string, input: FixedInput, complete: boolean, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const path = await safePath(workspace, input.location);
  const info = await lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (!info) { if (complete) throw new Error('Fixed input mirror is incomplete.'); return; }
  if (info.isDirectory() !== input.directory) throw new Error('Fixed input mirror path conflicts with its source type.');
  for (const name of input.files.keys()) {
    signal.throwIfAborted();
    const target = await safePath(workspace, name ? `${input.location}/${name}` : input.location);
    const leaf = await lstat(target).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (leaf && (!leaf.isFile() || leaf.nlink !== 1)) throw new Error('Fixed input mirror planned file conflicts with an existing non-independent file or directory.');
  }
  const files = input.directory ? await snapshot(path) : new Map([['', await regularFile(workspace, input.location)]]);
  for (const [name, bytes] of files) {
    signal.throwIfAborted();
    if (!input.files.get(name)?.equals(bytes)) throw new Error('Fixed input mirror has conflicting content or unexpected extra files.');
  }
  if (complete && files.size !== input.files.size) throw new Error('Fixed input mirror is incomplete.');
}

async function materialize(options: MaterializeTaskInputsOptions): Promise<void> {
  const { artifactRoot, workspace, task, requirement, signal } = options;
  signal.throwIfAborted();
  if (!isAbsolute(artifactRoot) || !isAbsolute(workspace)) throw new Error('Input mirror roots must be explicit absolute paths.');
  await safePath(artifactRoot);
  const root = await realpath(artifactRoot), name = relative(root, resolve(workspace)).split(sep).join('/');
  const parts = name.split('/');
  if (options.validation ? name !== `validation/${options.validation.caseId}/${options.validation.taskId}/workspace` || options.validation.taskId !== task.taskId
    : parts.length !== 3 || parts[0] !== 'continuations' || parts[2] !== 'workspace') throw new Error('Workspace must match its explicit isolated task binding.');
  await safePath(root, name);
  if (task.specVersion !== requirement.specVersion) throw new Error('Task and requirement input versions differ.');
  const writes = task.ownership.writePaths.map(path => pathName(path, true).toLowerCase());
  const refs = new Map<string, ArtifactReference>();
  for (const ref of [...requirement.sources, ...task.inputs, ...task.context.interfaces]) {
    if (checkShape(ref, referenceShape).length) throw new Error('Invalid fixed input reference.');
    pathName(ref.location);
    const key = ref.location.toLowerCase();
    if (['authors', 'continuations', ...(options.validation ? ['validation'] : [])].includes(key.split('/')[0])) throw new Error('Old author files and workspace copies cannot be fixed input sources.');
    if (writes.some(write => overlaps(write, key))) throw new Error('Fixed input destination overlaps an author write scope.');
    if (refs.has(key) && refs.get(key)!.location !== ref.location) throw new Error('Fixed input paths have conflicting case aliases.');
    refs.set(key, ref);
  }
  const inputs: FixedInput[] = [];
  for (const ref of refs.values()) {
    const input = await readInput(root, ref.location, signal);
    await checkMirror(workspace, input, false, signal);
    inputs.push(input);
  }
  // Copying follows the complete preflight; source registry and acceptance remain read-only.
  signal.throwIfAborted();
  await directory(root, name);
  for (const input of inputs) {
    if (input.directory) await directory(workspace, input.location);
    for (const [suffix, bytes] of input.files) {
      signal.throwIfAborted();
      const location = suffix ? `${input.location}/${suffix}` : input.location;
      const path = await safePath(workspace, location);
      await directory(workspace, dirname(location).split(sep).join('/'));
      try { await writeFile(path, bytes, { flag: 'wx', signal }); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (!(await regularFile(workspace, location)).equals(bytes)) throw new Error('Existing fixed input mirror content conflicts; no file was replaced.');
      }
    }
  }
  for (const input of inputs) {
    const current = await readInput(root, input.location, signal);
    if (current.directory !== input.directory || current.files.size !== input.files.size || [...current.files].some(([path, bytes]) => !input.files.get(path)?.equals(bytes))) throw new Error('Fixed input source changed during materialization.');
    await checkMirror(workspace, input, true, signal);
  }
  signal.throwIfAborted();
}

/** Copies fixed bytes only. Original registry/journal verification must happen in the host first. */
export async function materializeTaskInputs(options: MaterializeTaskInputsOptions): Promise<void> {
  options.signal.throwIfAborted();
  const input = { ...options, task: structuredClone(options.task), requirement: structuredClone(options.requirement) };
  const key = resolve(options.workspace).toLowerCase();
  const operation = (pending.get(key) ?? Promise.resolve()).then(() => materialize(input));
  const settled = operation.then(() => {}, () => {});
  pending.set(key, settled);
  void settled.then(() => { if (pending.get(key) === settled) pending.delete(key); });
  return operation;
}
