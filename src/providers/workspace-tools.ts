import { constants } from 'node:fs';
import { access, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createEditTool, createReadTool, createWriteTool, defineTool, detectSupportedImageMimeTypeFromFile, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { compactJsonReadBuffer } from './json-read-display.ts';

export type BeforeFileWrite = (absolutePath: string, candidate: Buffer, signal: AbortSignal) => Promise<void>;

export interface WorkspaceToolOptions {
  workspace: string;
  readPaths: string[];
  writePaths: string[];
  compactFullJsonReads?: true;
  beforeFileWrite?: BeforeFileWrite;
}

function within(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

/** Capability checks for our file tools; this is not an OS sandbox. */
export async function createWorkspaceTools(options: WorkspaceToolOptions): Promise<ToolDefinition[]> {
  const workspace = await realpath(options.workspace);
  const scopes = (paths: string[]) => paths.map(path => {
    const full = resolve(workspace, path);
    if (!within(workspace, full)) throw new Error('Tool scope is outside the workspace');
    return full;
  });
  const reads = scopes(options.readPaths);
  const writes = scopes(options.writePaths);
  async function check(path: string, allowed: string[], signal?: AbortSignal) {
    signal?.throwIfAborted();
    const full = resolve(workspace, path);
    if (!within(workspace, full) || !allowed.some(scope => within(scope, full))) {
      throw new Error('Path is outside allowed task paths');
    }
    let existing = full;
    for (;;) {
      try {
        await lstat(existing);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        existing = dirname(existing);
      }
    }
    if (!within(workspace, await realpath(existing))) throw new Error('Symlink is outside allowed workspace');
    // Reject links even within the workspace: a linked path must not bypass the role's scopes.
    for (let component = full; relative(workspace, component) !== ''; component = dirname(component)) {
      try {
        if ((await lstat(component)).isSymbolicLink()) throw new Error('Symlink is outside allowed task paths');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    signal?.throwIfAborted();
    return full;
  }
  async function checkEncoding(path: string) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      if (error instanceof TypeError) throw new Error('Existing file is not UTF-8; refusing to edit');
      throw error;
    }
  }
  const tools: ToolDefinition[] = [];
  if (reads.length) {
    const read = createReadTool(workspace);
    const description = read.description + (options.compactFullJsonReads
      ? ' Whole-file JSON may use compact display; source formatting is unchanged. Before exact-text edits, use explicit offset/limit reads to obtain raw source text.' : '');
    tools.push(defineTool({ ...read, description, async execute(id, args, signal, onUpdate) {
      const full = await check(args.path, reads, signal);
      await access(full);
      // Each invocation owns its operations; a concurrent paged read must still see raw bytes.
      const selected = options.compactFullJsonReads && args.offset === undefined && args.limit === undefined
        ? createReadTool(workspace, { operations: {
          access: path => access(path, constants.R_OK),
          detectImageMimeType: detectSupportedImageMimeTypeFromFile,
          readFile: async path => {
            signal?.throwIfAborted();
            const buffer = await readFile(path, { signal });
            signal?.throwIfAborted();
            return compactJsonReadBuffer(buffer);
          },
        } }) : read;
      return selected.execute(id, { ...args, path: full }, signal, onUpdate);
    } }));
  }
  if (writes.length) {
    const write = createWriteTool(workspace);
    const edit = createEditTool(workspace);
    const before = options.beforeFileWrite;
    const mode = before ? { executionMode: 'sequential' as const } : {};
    const checkedWrite = (guard: BeforeFileWrite, signal = new AbortController().signal) => async (path: string, content: string) => {
      const bytes = Buffer.from(content, 'utf8');
      signal.throwIfAborted();
      await guard(path, bytes, signal);
      signal.throwIfAborted();
      await writeFile(path, bytes);
    };
    tools.push(defineTool({ ...write, ...mode, async execute(id, args, signal, onUpdate) {
      const full = await check(args.path, writes, signal);
      await checkEncoding(full);
      signal?.throwIfAborted();
      const selected = before ? createWriteTool(workspace, { operations: {
        mkdir: async dir => { await mkdir(dir, { recursive: true }); }, writeFile: checkedWrite(before, signal),
      } }) : write;
      return selected.execute(id, { ...args, path: full }, signal, onUpdate);
    } }));
    tools.push(defineTool({ ...edit, ...mode, async execute(id, args, signal, onUpdate) {
      const full = await check(args.path, writes, signal);
      await checkEncoding(full);
      signal?.throwIfAborted();
      const selected = before ? createEditTool(workspace, { operations: {
        access: path => access(path, constants.R_OK | constants.W_OK), readFile: path => readFile(path),
        writeFile: checkedWrite(before, signal),
      } }) : edit;
      return selected.execute(id, { ...args, path: full }, signal, onUpdate);
    } }));
  }
  return tools;
}
