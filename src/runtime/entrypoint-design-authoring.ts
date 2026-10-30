import { defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { regularFile } from '../artifacts/paths.ts';
import { createWorkspaceTools } from '../providers/workspace-tools.ts';
import { requireAuthorJson } from './structured-author-json.ts';

export const GAME_DESIGN_WRITE = 'write-game-design';
export const GAME_DESIGN_SOURCE = 'authors/design/design.json';
export const ORDINARY_DESIGN_AUTHORING_RULE = 'Prefer write-game-design with {operation:"save",design:{...}} to establish the structured design draft, then {operation:"set",section,value} to replace one complete top-level section while retaining all other sections. Sections are summary, implementationNotes, acceptanceMapping, experienceMapping, characters and audio. The host serializes your JSON data at authors/design/design.json. Save replaces the whole object; set replaces the whole selected section, not individual nested values. Supply all game-specific content yourself. Raw read/write/edit remain available. Saving a partial or invalid draft is not structural validity, capture, independent approval or acceptance; use the existing write feedback and validate-game-design checks.';
const sections = ['summary', 'implementationNotes', 'acceptanceMapping', 'experienceMapping', 'characters', 'audio'] as const;
type JsonObject = Record<string, any>;
const object = (value: unknown): value is JsonObject => !!value && typeof value === 'object' && !Array.isArray(value);
function keys(value: JsonObject, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unknown or inapplicable design authoring field.');
}

/** Writes only the mutable author draft. Validation and approval stay with the original host. */
export async function createGameDesignWriter(input: { workspace: string; seededRevision?: boolean;
  guard(signal: AbortSignal): Promise<void>; afterFileWrite(signal: AbortSignal): Promise<string> }) {
  const writer = (await createWorkspaceTools({ workspace: input.workspace, readPaths: [], writePaths: [GAME_DESIGN_SOURCE] })).find(tool => tool.name === 'write')!;
  return { readOnly: false, tool: defineTool({ name: GAME_DESIGN_WRITE, label: 'Save game design draft', executionMode: 'sequential',
    description: `Save structured design data or replace one known top-level section at ${GAME_DESIGN_SOURCE}. Save replaces the entire design object; omitted content is not retained. Set replaces the entire selected section and preserves every other section; it does not merge nested values or append arrays. Expected design types: summary:string, implementationNotes:string[], acceptanceMapping and experienceMapping:objects mapping original IDs to strings, characters:[{id,purpose,states:string[]}], audio:[{id,trigger,loop:boolean}]. Supply game-specific values yourself. Partial or invalid drafts may be saved; existing diagnostics, capture and independent review still decide validity and acceptance. Set requires an existing complete JSON object; malformed JSON requires explicit save, not automatic repair. Raw read/write/edit remain available. No path, reference, authority or script arguments.`
      + (input.seededRevision ? ' Revision workspace: this file is seeded from the previous capture and remains an unapproved draft. Read the current draft and actual review findings first. Prefer set for the affected section and retain other sections; intentional full replacement remains allowed with explicit save.' : ''),
    parameters: Type.Object({ operation: Type.Union([Type.Literal('save'), Type.Literal('set')]),
      design: Type.Optional(Type.Object({}, { additionalProperties: true })), section: Type.Optional(Type.Union(sections.map(section => Type.Literal(section)))),
      value: Type.Optional(Type.Union([Type.String(), Type.Array(Type.Unknown()), Type.Object({}, { additionalProperties: true })])) }, { additionalProperties: false }),
    async execute(id, supplied, signal, onUpdate, context) {
      const active = signal ?? new AbortController().signal;
      active.throwIfAborted(); await input.guard(active); active.throwIfAborted();
      requireAuthorJson(supplied, 'Design authoring');
      if (!object(supplied)) throw new Error('Design authoring requires an operation object.');
      const args = supplied as JsonObject;
      if (args.operation === 'save') {
        keys(args, ['operation', 'design']);
        if (!object(args.design)) throw new Error('Save requires a design JSON object.');
      } else if (args.operation === 'set') {
        keys(args, ['operation', 'section', 'value']);
        if (!sections.includes(args.section) || !Object.hasOwn(args, 'value')) throw new Error('Set requires a known design section and its value.');
        const valid = args.section === 'summary' ? typeof args.value === 'string'
          : ['acceptanceMapping', 'experienceMapping'].includes(args.section) ? object(args.value) : Array.isArray(args.value);
        if (!valid) throw new Error('Set value has the wrong top-level type for its design section.');
      } else throw new Error('Unknown design authoring operation.');
      let bytes: Buffer | undefined;
      try { bytes = await regularFile(input.workspace, GAME_DESIGN_SOURCE, active); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      let previous: string | undefined;
      if (bytes) try { previous = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { throw new Error('Existing file is not UTF-8; refusing to edit.'); }
      let design: JsonObject;
      if (args.operation === 'save') design = args.design;
      else {
        if (previous === undefined) throw new Error('Existing design draft is missing; use explicit save.');
        try { design = JSON.parse(previous); }
        catch { throw new Error('Existing design draft is not complete JSON; use explicit save.'); }
        if (!object(design)) throw new Error('Existing design draft requires a JSON object; use explicit save.');
        try { requireAuthorJson(design, 'Design authoring'); }
        catch { throw new Error('Existing design draft contains non-JSON data; use explicit save.'); }
        design[args.section] = args.value;
      }
      const newline = previous?.includes('\r\n') ? '\r\n' : '\n';
      const bom = bytes?.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? '\ufeff' : '';
      const serialized = bom + JSON.stringify(design, null, 2).replaceAll('\n', newline) + newline;
      await input.guard(active); active.throwIfAborted();
      const result = await writer.execute(id, { path: GAME_DESIGN_SOURCE, content: serialized }, active, onUpdate, context);
      if ('isError' in result && result.isError) return result;
      const feedback = await input.afterFileWrite(active); active.throwIfAborted();
      return { ...result, content: [{ type: 'text' as const, text: `Saved game design draft to ${GAME_DESIGN_SOURCE}. This is not approval or acceptance.` }, { type: 'text' as const, text: feedback }] };
    },
  }) };
}
