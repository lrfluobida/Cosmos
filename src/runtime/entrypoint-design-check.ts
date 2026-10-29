import { defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { regularFile } from '../artifacts/paths.ts';
import { identifier } from '../media/validation.ts';
import { validateDesign } from './entrypoint-media.ts';
import { validateModuleContracts } from './modular-code.ts';
import { validateClassicEntryPlan } from './classic-entry-input.ts';
import type { ClassicEntrySelection } from './classic-entry-input.ts';
import type { AcceptancePlan } from '../acceptance/plan.ts';
import { validatePlan } from '../acceptance/plan.ts';
import { sameValue } from '../contracts/validation.ts';
import type { ArtifactReference } from '../contracts/types.ts';
import type { OrdinaryGameDraft } from '../roles/requirements.ts';
import { gameplayAcceptance } from '../roles/requirements.ts';
import { validateOrdinaryAcceptancePlan, ORDINARY_PLAN_SOURCE } from './entrypoint-acceptance-plan.ts';

export const GAME_DESIGN_CHECK = 'validate-game-design';
export const MEDIA_IDENTIFIER_RULE = 'Media IDs, state names and layer IDs must match ^[a-z][a-z0-9-]{0,47}$; con/prn/aux/nul/com1..9/lpt1..9 are reserved. These restrictions do not apply to Chinese or other display text.';
const FILE = 'authors/design/design.json';
interface Feedback { passed: boolean; errors: { path: string; message: string }[]; ordinaryDiagnostics?: string[] }

const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Reuse local format checks only; the strict validator still decides whether the complete plan passes. */
function ordinaryPlanDiagnostics(value: unknown, draft: OrdinaryGameDraft): string[][] {
  if (!object(value) || !object(value.scenario)) return [];
  const scenario = value.scenario, gameplay = gameplayAcceptance(draft);
  const stages = [{ steps: scenario.steps, path: 'scenario.steps' },
    ...(object(scenario.reopen) ? [{ steps: scenario.reopen.steps, path: 'scenario.reopen.steps' }] : [])];
  return stages.map(({ steps, path }) => {
    // Match validateBrowserScenario's stage IDs, while allowing malformed steps to reach validatePlan safely.
    const acceptanceIds = scenario.reopen ? gameplay.filter(item => Array.isArray(steps)
      && steps.some(step => object(step) && step.acceptanceId === item.acceptanceId)).map(item => item.acceptanceId) : gameplay.map(item => item.acceptanceId);
    return validatePlan({ viewport: scenario.viewport, steps, formatVersion: '1.0.0', projectId: 'draft', taskId: 'draft', runId: 'draft', reportId: 'draft', specVersion: 'draft',
      artifact: { artifactId: 'draft', version: 'v1', location: 'draft' }, url: 'http://127.0.0.1:1', acceptanceIds })
      .map(issue => issue.replace(/^steps(?=\[|:)/, path).replace(/^viewport(?=\.|:)/, 'scenario.viewport'));
  });
}

function ordinaryWriteFeedback(header: string, diagnostics: string[]): string {
  const groups = new Map<string, { message: string; paths: string[] }>();
  for (const diagnostic of diagnostics) {
    const parts = /^(scenario\.[^:]+|acceptanceIds): ([\s\S]*)$/.exec(diagnostic);
    const path = parts?.[1] ?? '', message = parts?.[2] ?? diagnostic;
    const group = groups.get(message) ?? { message, paths: [] };
    if (!group.paths.includes(path)) group.paths.push(path);
    groups.set(message, group);
  }
  const all = [...groups.values()], chosen: typeof all = [];
  const choose = (group: typeof all[number] | undefined) => { if (group && chosen.length < 8 && !chosen.includes(group)) chosen.push(group); };
  choose(all[0]); // The original strict error has priority, even when local errors are numerous.
  for (const stage of ['scenario.steps', 'scenario.reopen.steps']) choose(all.find(group => group.paths.some(path => path.startsWith(stage))));
  all.forEach(choose);
  let omittedLocations = 0, omittedCharacters = 0;
  // Reserve the omission notice before rendering; never slice it off after producing diagnostics.
  const lineLimit = Math.floor((4096 - header.length - 200) / chosen.length) - 1;
  const lines = chosen.map(group => {
    const paths: string[] = [];
    const add = (path: string | undefined) => { if (path !== undefined && !paths.includes(path)) paths.push(path); };
    add(group.paths[0]);
    for (const stage of ['scenario.steps', 'scenario.reopen.steps']) add(group.paths.find(path => path.startsWith(stage)));
    group.paths.forEach(add);
    const shown: string[] = [];
    for (const path of paths) {
      if ([...shown, path].join(', ').length <= Math.floor(lineLimit / 2)) shown.push(path);
      else omittedLocations++;
    }
    const prefix = `- ${ORDINARY_PLAN_SOURCE}: ${shown.filter(Boolean).join(', ')}${shown.some(Boolean) ? ': ' : ''}`;
    const room = lineLimit - prefix.length;
    let message = group.message;
    if (message.length > room) {
      omittedCharacters += message.length - (room - 1);
      message = `${message.slice(0, room - 1)}…`;
    }
    return `${prefix}${message}`;
  });
  const omittedGroups = all.length - chosen.length;
  const notice = omittedGroups || omittedLocations || omittedCharacters
    ? `\n${omittedGroups} diagnostic groups omitted; ${omittedLocations} locations omitted; ${omittedCharacters} detail characters omitted. Run ${GAME_DESIGN_CHECK} for all collected diagnostics.` : '';
  return `${header}\n${lines.join('\n')}${notice}`;
}

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
    let plan: unknown;
    if (result.passed && input.ordinary) try {
      plan = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(input.workspace, ORDINARY_PLAN_SOURCE)));
      validateOrdinaryAcceptancePlan(plan, input.ordinary.draft);
      if (!sameValue(plan.requirement, input.ordinary.requirement)) throw new Error('Plan must reference the original complete requirement capture.');
      viewport = plan.scenario.viewport;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ordinary plan is missing.';
      const stages = ordinaryPlanDiagnostics(plan, input.ordinary.draft);
      const strict = stages.find(issues => message === `Unsupported acceptance scenario: ${issues.join('; ')}`) ?? [message];
      const ordinaryDiagnostics = [...new Set([...strict, ...stages.flat()])];
      result = { passed: false, errors: [{ path: ORDINARY_PLAN_SOURCE, message },
        ...ordinaryDiagnostics.filter(issue => !strict.includes(issue)).map(message => ({ path: ORDINARY_PLAN_SOURCE, message }))], ordinaryDiagnostics };
    }
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
      const header = `Design write feedback (read-only, advisory): ${result.passed ? 'passed' : 'incomplete or invalid; continue writing or correct the fields below'}. Capture and independent review are still required.`;
      if (result.ordinaryDiagnostics) return ordinaryWriteFeedback(`${header} Additional diagnostics cover local format only.`, result.ordinaryDiagnostics);
      const diagnostics = result.errors.flatMap(error => error.message.replace(/^Unsupported acceptance scenario: /, '').split('; ')
        .map(message => `${error.path.startsWith('authors/') ? error.path : `${FILE}: ${error.path}`}: ${message}`)).slice(0, 8);
      return [header,
        ...diagnostics.map(message => `- ${message}`)].join('\n').slice(0, 4096);
    },
    tool: defineTool({ name: GAME_DESIGN_CHECK, label: 'Check current game design',
    description: `Read and validate the current ${gameDesignCheckFiles({ ordinary: !!input.ordinary, modular: input.modular, classicEntry: !!input.classicEntry }).join(', ')}. Write all listed outputs before calling and repair reported errors in the same author session. Returns advisory field errors; does not change files or establish acceptance. No arguments.`,
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute(_id, args, signal) {
      if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length) throw new Error('Game design check accepts no arguments.');
      const { passed, errors } = await check(signal);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ passed, errors }) }], details: {} };
    },
  }) };
}
