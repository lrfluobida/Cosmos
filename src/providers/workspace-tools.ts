import { constants } from 'node:fs';
import { access, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createEditTool, createReadTool, createWriteTool, defineTool, detectSupportedImageMimeTypeFromFile, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { compactJsonReadBuffer, pagedPlanReadBuffer } from './json-read-display.ts';

export type BeforeFileWrite = (absolutePath: string, candidate: Buffer, signal: AbortSignal) => Promise<void>;
export type WriteCommitted = (toolCallId: string, absolutePath: string) => void;
export type ArtFrameRead = (checks: unknown[], offset: number, signal: AbortSignal) => Promise<unknown>;
const frameFields = { characterId: Type.String(), state: Type.String(), frame: Type.Optional(Type.Integer({ minimum: 0, maximum: 63 })) };
const artFrames = Type.Array(Type.Object({ ...frameFields, stepId: Type.String(), stage: Type.Optional(Type.Union([Type.Literal('main'), Type.Literal('reopen')])),
  background: Type.Optional(Type.Object(frameFields, { additionalProperties: false })) }, { additionalProperties: false }), { maxItems: 8 });

/** Host validation rejected a candidate before writing; the current valid draft remains intact. */
export class PreservedDesignDraftError extends Error {}

export interface WorkspaceToolOptions {
  workspace: string;
  readPaths: string[];
  writePaths: string[];
  compactFullJsonReads?: true;
  planReadPaths?: string[];
  planReadPurpose?: 'art';
  artFrameRead?: ArtFrameRead;
  beforeFileWrite?: BeforeFileWrite;
  onWriteCommitted?: WriteCommitted;
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
    const plans = scopes(options.planReadPaths ?? []);
    const parameters = plans.length ? Type.Object({ ...read.parameters.properties, ...(options.artFrameRead ? { artFrames: Type.Optional(artFrames) } : {}),
      planOffset: Type.Optional(Type.Integer({ minimum: 1, description: '1-based compact plan display line. Omit offset when using planOffset.' })) }) : read.parameters;
    const description = read.description + (options.compactFullJsonReads
      ? ' Whole-file JSON may use compact display; source formatting is unchanged. Before exact-text edits, use explicit offset/limit reads to obtain raw source text.' : '')
      + (options.artFrameRead ? ' On the fixed acceptance plan use artFrames:[] for a compact pixel-pattern index (offset=nextOffset for more). Supply 1..8 frame mappings for measured native art compositions. Each selects an approved stepId, characterId, state, optional zero-based frame and optional full-viewport background frame. Use stage to distinguish repeated step IDs. Omit artFrames or set it to null for ordinary file reads.' : '')
      + (plans.length ? ` For a full plan read, start with path alone (omit optional numbers, or use null if required). ${options.planReadPurpose === 'art' ? 'Use the displayed continuation when more steps are needed.' : 'Follow each continuation once until complete.'} planOffset counts display lines with one step per line; offset counts original file lines. Never infer unread steps.` : '');
    tools.push(defineTool({ ...read, description, parameters, async execute(id, args, signal, onUpdate) {
      const full = await check(args.path, reads, signal);
      await access(full);
      const planOffset = 'planOffset' in args ? args.planOffset as number | undefined : undefined;
      const planPath = plans.some(path => relative(path, full) === '');
      if ('artFrames' in args && args.artFrames != null) {
        if (!options.artFrameRead || !planPath || !Array.isArray(args.artFrames) || args.artFrames.length > 8
          || planOffset != null || args.limit != null || (args.offset != null && (args.artFrames.length || !Number.isSafeInteger(args.offset) || args.offset < 1)))
          throw new Error('Read artFrames only on the fixed art plan. Use [] for the index or 1..8 mappings; only the index accepts offset.');
        const report = await options.artFrameRead(args.artFrames, args.offset ?? 1, signal ?? new AbortController().signal);
        return { content: [{ type: 'text', text: JSON.stringify(report) }], details: {} };
      }
      if (planOffset != null && (!planPath || args.offset != null || !Number.isSafeInteger(planOffset) || planOffset < 1))
        throw new Error('Use planOffset only on the fixed acceptance plan, without a source offset.');
      if (planOffset != null && args.limit != null && (!Number.isSafeInteger(args.limit) || args.limit < 1))
        throw new Error('Plan display limit must be a positive integer.');
      const whole = args.offset == null && args.limit == null;
      const planRead = planPath && (whole || planOffset != null);
      let displayLines = false;
      const selected = planRead || options.compactFullJsonReads && whole
        ? createReadTool(workspace, { operations: {
          access: path => access(path, constants.R_OK),
          detectImageMimeType: detectSupportedImageMimeTypeFromFile,
          readFile: async path => {
            signal?.throwIfAborted();
            const buffer = await readFile(path, { signal });
            signal?.throwIfAborted();
            if (planRead) {
              const display = pagedPlanReadBuffer(buffer);
              if (display) { displayLines = true; return display; }
              if (planOffset != null) throw new Error('Plan display unavailable. Read source lines with offset=1.');
              return buffer;
            }
            return compactJsonReadBuffer(buffer);
          },
        } }) : read;
      const result = await selected.execute(id, { path: full, offset: planOffset ?? args.offset ?? undefined, limit: args.limit ?? undefined }, signal, onUpdate);
      if (displayLines) {
        for (const block of result.content) if (block.type === 'text')
          block.text = block.text.replace(/Use offset=(\d+) to continue\.\]$/, 'Use planOffset=$1 to continue.]');
      }
      return result;
    } }));
  }
  if (writes.length) {
    const write = createWriteTool(workspace);
    const edit = createEditTool(workspace);
    const before = options.beforeFileWrite;
    const mode = before ? { executionMode: 'sequential' as const } : {};
    const checkedWrite = (id: string, signal = new AbortController().signal) => async (path: string, content: string) => {
      const bytes = Buffer.from(content, 'utf8');
      signal.throwIfAborted();
      await before?.(path, bytes, signal);
      signal.throwIfAborted();
      await writeFile(path, bytes);
      signal.throwIfAborted();
      options.onWriteCommitted?.(id, path);
    };
    tools.push(defineTool({ ...write, ...mode, async execute(id, args, signal, onUpdate) {
      const full = await check(args.path, writes, signal);
      await checkEncoding(full);
      signal?.throwIfAborted();
      const selected = before || options.onWriteCommitted ? createWriteTool(workspace, { operations: {
        mkdir: async dir => { await mkdir(dir, { recursive: true }); }, writeFile: checkedWrite(id, signal),
      } }) : write;
      return selected.execute(id, { ...args, path: full }, signal, onUpdate);
    } }));
    tools.push(defineTool({ ...edit, ...mode, async execute(id, args, signal, onUpdate) {
      const full = await check(args.path, writes, signal);
      await checkEncoding(full);
      signal?.throwIfAborted();
      const selected = before || options.onWriteCommitted ? createEditTool(workspace, { operations: {
        access: path => access(path, constants.R_OK | constants.W_OK), readFile: path => readFile(path),
        writeFile: checkedWrite(id, signal),
      } }) : edit;
      return selected.execute(id, { ...args, path: full }, signal, onUpdate);
    } }));
  }
  return tools;
}
