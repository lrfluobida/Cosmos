import { lstat, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { Ownership } from './types.ts';

export function fail(message: string): never { throw new Error(`Artifact registry: ${message}`); }
export function text(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096) fail(`Invalid ${label}`);
}
export function id(value: string, version = false): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value) || value.includes('..')
    || value.endsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) fail('Invalid ID/version');
  if (version && /^(latest|current|head|main|master|dev|develop)$/i.test(value)) fail('A fixed version is required');
  return value;
}
export function pathName(value: string, root = false): string {
  if (root && value === '.') return value;
  if (typeof value !== 'string' || !value || value.length > 1024 || value.includes('\\') || isAbsolute(value)
    || value.split('/').some(part => !part || part === '.' || part === '..' || /[<>:"|?*\x00-\x1f]/.test(part)
      || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) fail(`Invalid relative path: ${value}`);
  return value;
}
export function within(root: string, target: string): boolean {
  const part = relative(resolve(root), resolve(target));
  return part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`));
}
/** Check all ancestors too: a confined lexical path may still traverse a junction. */
export async function safePath(root: string, name = '.'): Promise<string> {
  pathName(name, true);
  const target = resolve(root, name);
  if (!within(root, target)) fail('Path escapes declared root');
  for (let current = target; ; current = dirname(current)) {
    const stat = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (stat?.isSymbolicLink()) fail(`Symbolic link or junction is forbidden: ${current}`);
    if (current !== target && stat && !stat.isDirectory()) fail(`Non-directory path ancestor: ${current}`);
    if (dirname(current) === current) break;
  }
  return target;
}
export async function directory(root: string, name: string): Promise<string> {
  const target = await safePath(root, name); await mkdir(target, { recursive: true }); return target;
}
export async function removeOwned(root: string, target: string): Promise<void> {
  if (resolve(root) === resolve(target) || !within(root, target)) fail('Refusing destructive root/outside operation');
  await safePath(root, relative(root, target).split(sep).join('/'));
  await rm(target, { recursive: true, force: true });
}
const under = (path: string, prefix: string) => prefix === '.' || path === prefix || path.startsWith(`${prefix}/`);
export function owns(ownership: Ownership, destination: string): void {
  pathName(destination);
  if (!ownership || !Array.isArray(ownership.writePaths) || !Array.isArray(ownership.readOnlyPaths)) fail('Invalid ownership');
  const write = ownership.writePaths.map(value => pathName(value, true).toLowerCase());
  const read = ownership.readOnlyPaths.map(value => pathName(value, true).toLowerCase());
  const path = destination.toLowerCase();
  if (!write.some(prefix => under(path, prefix)) || read.some(prefix => under(path, prefix) || under(prefix, path))) fail(`Ownership excludes ${destination}`);
}
export function noConflicts(paths: string[]): void {
  const seen: string[] = [];
  for (const name of paths) {
    const key = pathName(name).toLowerCase();
    if (seen.some(prior => under(key, prior) || under(prior, key))) fail(`Duplicate destination/path conflict: ${name}`);
    seen.push(key);
  }
}
export async function regularFile(root: string, name: string): Promise<Buffer> {
  const target = await safePath(root, name);
  const stat = await lstat(target);
  if (!stat.isFile() || stat.nlink !== 1) fail(`Expected an independent regular file: ${name}`);
  return readFile(target);
}
export async function snapshot(root: string): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  async function visit(folder: string) {
    const entries = await readdir(await safePath(root, folder), { withFileTypes: true });
    for (const entry of entries) {
      const path = folder === '.' ? entry.name : `${folder}/${entry.name}`;
      pathName(path);
      if (entry.isDirectory()) await visit(path);
      else files.set(path, await regularFile(root, path));
    }
  }
  await visit('.'); return files;
}
