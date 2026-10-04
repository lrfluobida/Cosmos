import { lstat, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { safePath, within } from '../artifacts/paths.ts';
import type { ArtifactReference } from '../contracts/index.ts';

export interface InputFiles extends ArtifactReference {
  kind: 'file' | 'directory' | 'missing';
  /** Empty suffix for a file reference; otherwise paths relative to location. */
  files: string[];
}

/** Discovery metadata for selected references only; no contents or verification. */
export async function roleInputFiles(workspace: string, references: ArtifactReference[], signal: AbortSignal): Promise<InputFiles[]> {
  const result: InputFiles[] = [], seen = new Set<string>();
  for (const ref of references) {
    signal.throwIfAborted();
    const key = JSON.stringify([ref.artifactId, ref.version, ref.location]);
    if (seen.has(key)) continue;
    seen.add(key);
    const absolute = resolve(workspace, ref.location);
    if (absolute === workspace || !within(workspace, absolute)) throw new Error('Role inventory references must name fixed files or directories inside the workspace.');
    const name = relative(workspace, absolute).split(sep).join('/');
    const path = await safePath(workspace, name);
    const info = await lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (!info) { result.push({ ...ref, kind: 'missing', files: [] }); continue; }
    const files: string[] = [];
    async function visit(suffix: string): Promise<void> {
      signal.throwIfAborted();
      const target = await safePath(workspace, suffix ? `${name}/${suffix}` : name), entry = await lstat(target);
      if (entry.isDirectory()) {
        for (const child of await readdir(target)) await visit(suffix ? `${suffix}/${child}` : child);
      } else if (entry.isFile() && entry.nlink === 1) files.push(suffix);
      else throw new Error('Role inventory requires independent regular files or directories.');
    }
    await visit('');
    result.push({ ...ref, kind: info.isDirectory() ? 'directory' : 'file', files: files.sort() });
  }
  signal.throwIfAborted();
  return result;
}

export const inputFilesProtocol = 'Use the frozen inputFiles inventory to locate selected reference files. Each entry retains its exact artifactId, version and location. For kind:"directory", read location + "/" + a listed relative filename; for kind:"file", files:[""] means read location itself. kind:"missing" with files:[] means the selected location is absent in this workspace, supplies no readable filename and must not be guessed. A directory inventory lists actual files, so never assume a template contains index.html, README.md or src files unless listed. Use the current selected version and distinguish separate plan roots. The file inventory is not verification evidence or approval and grants no additional tools, read paths or write paths.';
