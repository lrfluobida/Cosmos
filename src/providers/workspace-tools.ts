import { access, lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createEditTool, createReadTool, createWriteTool, defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';

export interface WorkspaceToolOptions {
  workspace: string;
  readPaths: string[];
  writePaths: string[];
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
    for (let component = full; component !== workspace; component = dirname(component)) {
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
    tools.push(defineTool({ ...read, async execute(id, args, signal, onUpdate) {
      const full = await check(args.path, reads, signal);
      await access(full);
      return read.execute(id, { ...args, path: full }, signal, onUpdate);
    } }));
  }
  if (writes.length) {
    const write = createWriteTool(workspace);
    const edit = createEditTool(workspace);
    tools.push(defineTool({ ...write, async execute(id, args, signal, onUpdate) {
      const full = await check(args.path, writes, signal);
      await checkEncoding(full);
      signal?.throwIfAborted();
      return write.execute(id, { ...args, path: full }, signal, onUpdate);
    } }));
    tools.push(defineTool({ ...edit, async execute(id, args, signal, onUpdate) {
      const full = await check(args.path, writes, signal);
      await checkEncoding(full);
      signal?.throwIfAborted();
      return edit.execute(id, { ...args, path: full }, signal, onUpdate);
    } }));
  }
  return tools;
}
