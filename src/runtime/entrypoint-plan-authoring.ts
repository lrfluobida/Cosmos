import { defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import type { ArtifactReference, TaskContract } from '../contracts/types.ts';
import { sameValue } from '../contracts/validation.ts';
import { regularFile } from '../artifacts/paths.ts';
import { createWorkspaceTools } from '../providers/workspace-tools.ts';
import { ORDINARY_PLAN_SOURCE } from './entrypoint-acceptance-plan.ts';

export const GAME_PLAN_WRITE = 'write-game-plan';
export const ORDINARY_PLAN_AUTHORING_RULE = 'First write authors/design/design.json. Prefer write-game-plan with {operation:"save",scenario:{viewport,steps,reopen?}} to establish the acceptance plan draft, then {operation:"append",stage:"main"|"reopen",steps:[...],checkpoint?} for bounded ordered batches. The host supplies the fixed formatVersion and original requirement reference and nests reopen inside scenario. The first reopen append requires your checkpoint; a different checkpoint requires explicit save or local edit. Raw read/write/edit remain available for local corrections. Saving a draft does not establish structural validity, coverage, capture, independent approval or acceptance. Run validate-game-design after both files are complete and correct its diagnostics within this author session.';
export type OrdinaryPlanAuthoringPolicy = 'structured-plan/1';

/** A missing selection is legacy only when the frozen task has no new author surface. */
export function requirePlanAuthoringTasks(tasks: { role: string; task: TaskContract }[], selected?: OrdinaryPlanAuthoringPolicy): void {
  for (const { role, task } of tasks) {
    const tools = task.context.tools.filter(name => name === GAME_PLAN_WRITE);
    const rules = task.context.rules.filter(rule => rule === ORDINARY_PLAN_AUTHORING_RULE);
    if (selected && role === 'design' ? tools.length !== 1 || rules.length !== 1 || rules[0] !== ORDINARY_PLAN_AUTHORING_RULE : tools.length || rules.length) {
      throw new Error('Frozen task differs from its ordinary plan authoring policy.');
    }
  }
}

export function readPlanAuthoringPolicy(execution: any, planning: any, eligible: boolean): OrdinaryPlanAuthoringPolicy | undefined {
  const selected = execution?.ordinaryPlanAuthoringPolicy;
  if (selected !== undefined && (selected !== 'structured-plan/1' || !eligible || execution.capability !== 'ordinary-design-execution/1')) throw new Error('Invalid ordinary plan authoring policy.');
  if (planning?.ordinaryPlanAuthoringPolicy !== selected) throw new Error('Original planning ordinary plan authoring policy changed.');
  if (selected && !planning) throw new Error('Original planning ordinary plan authoring policy is unavailable.');
  if (execution) requirePlanAuthoringTasks(execution.tasks, selected);
  return selected;
}

type JsonObject = Record<string, any>;
const object = (value: unknown): value is JsonObject => !!value && typeof value === 'object' && !Array.isArray(value);
/** Reject values that JSON.stringify would drop, coerce or execute through a getter/toJSON. */
function requireJson(value: unknown, parents = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || parents.has(value)) throw new Error('Plan authoring accepts JSON data only.');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== (Array.isArray(value) ? Array.prototype : Object.prototype)) throw new Error('Plan authoring requires plain JSON containers.');
  parents.add(value);
  const keys = Reflect.ownKeys(value);
  if (Array.isArray(value) && (keys.length !== value.length + 1 || keys.some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)))) throw new Error('Plan authoring requires dense JSON arrays.');
  for (const key of keys) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('Plan authoring accepts enumerable JSON data only.');
    requireJson(descriptor.value, parents);
  }
  parents.delete(value);
}
function keys(value: JsonObject, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unknown or inapplicable plan authoring field.');
}
function containers(plan: JsonObject, requirement: ArtifactReference) {
  keys(plan, ['formatVersion', 'requirement', 'scenario']);
  if (plan.formatVersion !== 'ordinary-acceptance-plan/1' || !sameValue(plan.requirement, requirement)
    || !object(plan.scenario) || !Array.isArray(plan.scenario.steps)
    || Object.hasOwn(plan.scenario, 'reopen') && (!object(plan.scenario.reopen) || !Array.isArray(plan.scenario.reopen.steps) || !object(plan.scenario.reopen.checkpoint))) {
    throw new Error('Existing draft envelope, requirement or step containers are invalid; use explicit save.');
  }
}

/** Writes only the mutable author draft. Validation and approval stay with the original host. */
export async function createGamePlanWriter(input: { workspace: string; requirement: ArtifactReference; seededRevision?: boolean;
  guard(signal: AbortSignal): Promise<void>; afterFileWrite(signal: AbortSignal): Promise<string> }) {
  const requirement = structuredClone(input.requirement);
  const writer = (await createWorkspaceTools({ workspace: input.workspace, readPaths: [], writePaths: [ORDINARY_PLAN_SOURCE] })).find(tool => tool.name === 'write')!;
  return { readOnly: false, tool: defineTool({ name: GAME_PLAN_WRITE, label: 'Save game acceptance plan draft', executionMode: 'sequential',
    description: `Save structured scenario data or append main/reopen steps to ${ORDINARY_PLAN_SOURCE}. Save replaces the entire scenario, including viewport, all steps and reopen; omitted content is not retained. Append adds steps to the chosen stage in order. Supply game-specific values yourself. The host fixes the envelope and requirement reference. Save may record an incomplete draft; diagnostics, capture and independent review still decide validity and acceptance. No path, reference, authority or script arguments.`
      + (input.seededRevision ? ' Revision workspace: editable authors/design/design.json and authors/design/acceptance-plan.json are seeded from the previous capture and remain unapproved drafts. Read the current drafts and actual review findings first. Prefer targeted edits that preserve unaffected coverage and reopen structure; do not save an empty plan just to start revision. Intentional full replacement remains allowed: supply the full replacement and pass the existing checks. Raw read/write/edit remain available. For complete JSON reads, use null for unspecified offset/limit when the schema requires them; before exact-text edits, read numeric pages for exact source anchors.' : ''),
    parameters: Type.Object({ operation: Type.Union([Type.Literal('save'), Type.Literal('append')]),
      scenario: Type.Optional(Type.Object({}, { additionalProperties: true })),
      stage: Type.Optional(Type.Union([Type.Literal('main'), Type.Literal('reopen')])), steps: Type.Optional(Type.Array(Type.Unknown())),
      checkpoint: Type.Optional(Type.Object({}, { additionalProperties: true })) }, { additionalProperties: false }),
    async execute(id, supplied, signal, onUpdate, context) {
      const active = signal ?? new AbortController().signal;
      active.throwIfAborted(); await input.guard(active); active.throwIfAborted();
      requireJson(supplied);
      if (!object(supplied)) throw new Error('Plan authoring requires an operation object.');
      const args = supplied as JsonObject;
      if (args.operation === 'save') {
        keys(args, ['operation', 'scenario']);
        if (!object(args.scenario)) throw new Error('Save requires a scenario JSON object.');
      } else if (args.operation === 'append') {
        keys(args, ['operation', 'stage', 'steps', 'checkpoint']);
        if (!['main', 'reopen'].includes(args.stage) || !Array.isArray(args.steps)
          || Object.hasOwn(args, 'checkpoint') && (args.stage !== 'reopen' || !object(args.checkpoint))) throw new Error('Append requires main/reopen, a steps array and only an optional reopen checkpoint object.');
      } else throw new Error('Unknown plan authoring operation.');
      let bytes: Buffer | undefined;
      try { bytes = await regularFile(input.workspace, ORDINARY_PLAN_SOURCE, active); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      let previous: string | undefined;
      if (bytes) try { previous = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { throw new Error('Existing file is not UTF-8; refusing to edit.'); }
      let plan: JsonObject;
      if (args.operation === 'save') plan = { formatVersion: 'ordinary-acceptance-plan/1', requirement, scenario: args.scenario };
      else {
        if (previous === undefined) throw new Error('Existing draft is missing; use explicit save.');
        try { plan = JSON.parse(previous); }
        catch { throw new Error('Existing draft is not complete JSON; use explicit save.'); }
        if (!object(plan)) throw new Error('Existing draft requires an object envelope; use explicit save.');
        requireJson(plan);
        containers(plan, requirement);
        if (args.stage === 'main') plan.scenario.steps.push(...args.steps);
        else if (!Object.hasOwn(plan.scenario, 'reopen')) {
          if (!object(args.checkpoint)) throw new Error('The first reopen append requires an author checkpoint.');
          plan.scenario.reopen = { steps: args.steps, checkpoint: args.checkpoint };
        } else {
          if (Object.hasOwn(args, 'checkpoint') && !sameValue(plan.scenario.reopen.checkpoint, args.checkpoint)) throw new Error('Reopen checkpoint differs; use explicit save or local edit.');
          plan.scenario.reopen.steps.push(...args.steps);
        }
      }
      const newline = previous?.includes('\r\n') ? '\r\n' : '\n';
      const bom = bytes?.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? '\ufeff' : '';
      const serialized = bom + JSON.stringify(plan, null, 2).replaceAll('\n', newline) + newline;
      await input.guard(active); active.throwIfAborted();
      const result = await writer.execute(id, { path: ORDINARY_PLAN_SOURCE, content: serialized }, active, onUpdate, context);
      if ('isError' in result && result.isError) return result;
      const feedback = await input.afterFileWrite(active); active.throwIfAborted();
      return { ...result, content: [{ type: 'text' as const, text: `Saved acceptance plan draft to ${ORDINARY_PLAN_SOURCE}. This is not approval or acceptance.` }, { type: 'text' as const, text: feedback }] };
    },
  }) };
}
