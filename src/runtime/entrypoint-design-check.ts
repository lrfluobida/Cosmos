import { defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { regularFile } from '../artifacts/paths.ts';
import { identifier } from '../media/validation.ts';
import { validateDesign } from './entrypoint-media.ts';
import { validateModuleContracts } from './modular-code.ts';

export const GAME_DESIGN_CHECK = 'validate-game-design';
export const MEDIA_IDENTIFIER_RULE = 'Media IDs, state names and layer IDs must match ^[a-z][a-z0-9-]{0,47}$; con/prn/aux/nul/com1..9/lpt1..9 are reserved. These restrictions do not apply to Chinese or other display text.';
const FILE = 'authors/design/design.json';
interface Feedback { passed: boolean; errors: { path: string; message: string }[] }

/** Advisory author feedback only. Capture and independent review still validate actual output. */
export function createGameDesignCheck(input: { workspace: string; gameplayIds: string[]; modular?: boolean; guard(signal: AbortSignal): Promise<void> }) {
  const gameplayIds = [...input.gameplayIds];
  function evaluate(bytes: Buffer | null): Feedback {
    const failed = (message: string): Feedback => ({ passed: false, errors: [{ path: FILE, message }] });
    if (!bytes) return failed('Required design output is missing.');
    let text: string, value: unknown;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { return failed('Design output must use valid UTF-8.'); }
    try { value = JSON.parse(text); }
    catch { return failed('Design output requires one complete JSON object.'); }
    try { validateDesign(value, gameplayIds, input.modular); return { passed: true, errors: [] }; }
    catch (error) {
      const errors: Feedback['errors'] = [];
      const check = (value: unknown, path: string) => { try { identifier(value); } catch { errors.push({ path, message: MEDIA_IDENTIFIER_RULE }); } };
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const design = value as Record<string, unknown>;
        if (Array.isArray(design.characters)) design.characters.forEach((character, index) => {
          if (!character || typeof character !== 'object' || Array.isArray(character)) return;
          check(character.id, `characters[${index}].id`);
          if (Array.isArray(character.states)) character.states.forEach((state: unknown, number: number) => check(state, `characters[${index}].states[${number}]`));
        });
        if (Array.isArray(design.audio)) design.audio.forEach((audio, index) => {
          if (audio && typeof audio === 'object' && !Array.isArray(audio)) check(audio.id, `audio[${index}].id`);
        });
      }
      return errors.length ? { passed: false, errors } : failed(error instanceof Error ? error.message : 'Design output violates its fixed schema.');
    }
  }
  return { readOnly: true, tool: defineTool({ name: GAME_DESIGN_CHECK, label: 'Check current game design',
    description: 'Read and validate the current authors/design/design.json. Returns advisory field errors; does not change files or establish acceptance. No arguments.',
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute(_id, args, signal) {
      if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length) throw new Error('Game design check accepts no arguments.');
      const active = signal ?? new AbortController().signal;
      active.throwIfAborted(); await input.guard(active); active.throwIfAborted();
      let bytes: Buffer | null;
      try { bytes = await regularFile(input.workspace, FILE); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; bytes = null; }
      let result = evaluate(bytes);
      if (result.passed && input.modular) try { validateModuleContracts(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(input.workspace, 'authors/design/module-contracts.d.ts'))); }
      catch (error) { result = { passed: false, errors: [{ path: 'authors/design/module-contracts.d.ts', message: error instanceof Error ? error.message : 'Protected interfaces are missing.' }] }; }
      await input.guard(active); active.throwIfAborted();
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], details: {} };
    },
  }) };
}
