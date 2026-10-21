import { defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { regularFile } from '../artifacts/paths.ts';
import { identifier } from '../media/validation.ts';
import { validateDesign } from './entrypoint-media.ts';
import { validateModuleContracts } from './modular-code.ts';
import { validateClassicEntryPlan } from './classic-entry-input.ts';
import type { ClassicEntrySelection } from './classic-entry-input.ts';
import type { AcceptancePlan } from '../acceptance/plan.ts';
import { sameValue } from '../contracts/validation.ts';
import type { ArtifactReference } from '../contracts/types.ts';
import type { OrdinaryGameDraft } from '../roles/requirements.ts';
import { validateOrdinaryAcceptancePlan, ORDINARY_PLAN_SOURCE } from './entrypoint-acceptance-plan.ts';

export const GAME_DESIGN_CHECK = 'validate-game-design';
export const MEDIA_IDENTIFIER_RULE = 'Media IDs, state names and layer IDs must match ^[a-z][a-z0-9-]{0,47}$; con/prn/aux/nul/com1..9/lpt1..9 are reserved. These restrictions do not apply to Chinese or other display text.';
const FILE = 'authors/design/design.json';
interface Feedback { passed: boolean; errors: { path: string; message: string }[] }

export function gameDesignCheckFiles(scope: { ordinary?: boolean; modular?: boolean; classicEntry?: boolean }): string[] {
  return [FILE, ...(scope.ordinary ? [ORDINARY_PLAN_SOURCE] : []), ...(scope.modular ? ['authors/design/module-contracts.d.ts'] : []),
    ...(scope.classicEntry ? ['authors/design/classic-entry-plan.json'] : [])];
}

/** Advisory author feedback only. Capture and independent review still validate actual output. */
export function createGameDesignCheck(input: { workspace: string; gameplayIds: string[]; modular?: boolean;
  ordinary?: { draft: OrdinaryGameDraft; requirement: ArtifactReference };
  classicEntry?: { selection: ClassicEntrySelection; viewport?: AcceptancePlan['viewport'] }; guard(signal: AbortSignal): Promise<void> }) {
  const gameplayIds = [...input.gameplayIds];
  function evaluate(bytes: Buffer | null): Feedback {
    const failed = (message: string): Feedback => ({ passed: false, errors: [{ path: FILE, message }] });
    if (!bytes) return failed('Required design output is missing.');
    let text: string, value: unknown;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { return failed('Design output must use valid UTF-8.'); }
    try { value = JSON.parse(text); }
    catch { return failed('Design output requires one complete JSON object.'); }
    try { validateDesign(value, gameplayIds, input.modular, input.ordinary?.draft.experienceCriteria); return { passed: true, errors: [] }; }
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
  async function check(signal?: AbortSignal): Promise<Feedback> {
    const active = signal ?? new AbortController().signal;
    active.throwIfAborted(); await input.guard(active); active.throwIfAborted();
    let bytes: Buffer | null;
    try { bytes = await regularFile(input.workspace, FILE); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; bytes = null; }
    let result = evaluate(bytes);
    let viewport = input.classicEntry?.viewport;
    if (result.passed && input.ordinary) try {
      const plan = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(input.workspace, ORDINARY_PLAN_SOURCE)));
      validateOrdinaryAcceptancePlan(plan, input.ordinary.draft);
      if (!sameValue(plan.requirement, input.ordinary.requirement)) throw new Error('Plan must reference the original complete requirement capture.');
      viewport = plan.scenario.viewport;
    } catch (error) { result = { passed: false, errors: [{ path: ORDINARY_PLAN_SOURCE, message: error instanceof Error ? error.message : 'Ordinary plan is missing.' }] }; }
    if (result.passed && input.modular) try { validateModuleContracts(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(input.workspace, 'authors/design/module-contracts.d.ts'))); }
    catch (error) { result = { passed: false, errors: [{ path: 'authors/design/module-contracts.d.ts', message: error instanceof Error ? error.message : 'Protected interfaces are missing.' }] }; }
    if (result.passed && input.classicEntry) try {
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(input.workspace, 'authors/design/classic-entry-plan.json')));
      if (!viewport) throw new Error('Design plan viewport is unavailable.');
      validateClassicEntryPlan(value, input.classicEntry.selection, gameplayIds, viewport);
    } catch (error) { result = { passed: false, errors: [{ path: 'authors/design/classic-entry-plan.json', message: error instanceof Error ? error.message : 'Fixed classic entry plan is missing.' }] }; }
    await input.guard(active); active.throwIfAborted();
    return result;
  }
  return { readOnly: true,
    async afterFileWrite(signal: AbortSignal): Promise<string> {
      const result = await check(signal);
      const diagnostics = result.errors.flatMap(error => error.message.replace(/^Unsupported acceptance scenario: /, '').split('; ')
        .map(message => `${error.path.startsWith('authors/') ? error.path : `${FILE}: ${error.path}`}: ${message}`)).slice(0, 8);
      return [`Design write feedback (read-only, advisory): ${result.passed ? 'passed' : 'incomplete or invalid; continue writing or correct the fields below'}. Capture and independent review are still required.`,
        ...diagnostics.map(message => `- ${message}`)].join('\n').slice(0, 4096);
    },
    tool: defineTool({ name: GAME_DESIGN_CHECK, label: 'Check current game design',
    description: `Read and validate the current ${gameDesignCheckFiles({ ordinary: !!input.ordinary, modular: input.modular, classicEntry: !!input.classicEntry }).join(', ')}. Write all listed outputs before calling and repair reported errors in the same author session. Returns advisory field errors; does not change files or establish acceptance. No arguments.`,
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute(_id, args, signal) {
      if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length) throw new Error('Game design check accepts no arguments.');
      return { content: [{ type: 'text' as const, text: JSON.stringify(await check(signal)) }], details: {} };
    },
  }) };
}
