import { validateRequirement } from '../contracts/index.ts';
import type { RequirementContract } from '../contracts/index.ts';
import { validatePlan } from '../acceptance/plan.ts';
import type { AcceptancePlan } from '../acceptance/plan.ts';
import { sameValue } from '../contracts/validation.ts';
import { modeFromSelection, preparationContract, resolveDraftMode } from './preparation-mode.ts';
import type { DraftMode, PreparationSelection } from './preparation-mode.ts';

export const DESIGN_ACCEPTANCE_ID = 'COSMOS-DESIGN';
export const MEDIA_ACCEPTANCE_ID = 'COSMOS-MEDIA';
export const MODULE_ACCEPTANCE_IDS = ['COSMOS-MODULE-A', 'COSMOS-MODULE-B'] as const;
export const MODULE_STAGE_ACCEPTANCE = freeze<RequirementContract['acceptance']>(MODULE_ACCEPTANCE_IDS.map((acceptanceId, index) => ({
  acceptanceId, description: `编码模块 ${index ? 'B' : 'A'}：独立开发并符合固定设计接口。`,
  steps: ['用固定模板和本模块实际源码编译，核对受保护接口，再由独立上下文审查源码。'],
  expected: '模块具有必需值导出，实际编译与接口检查通过，固定产物独立审查通过；不表示完整玩法通过。', evidenceKinds: ['test_report'],
})));
export const HOST_STAGE_ACCEPTANCE = freeze<RequirementContract['acceptance']>([
  { acceptanceId: DESIGN_ACCEPTANCE_ID, description: '设计检查：玩法要求均有对应设计，角色动作和音频用途清楚。',
    steps: ['检查设计内容覆盖全部已确认玩法，并由独立评审核对。'], expected: '全部玩法都有设计映射；角色、动作、音频与触发用途明确。', evidenceKinds: ['test_report'] },
  { acceptanceId: MEDIA_ACCEPTANCE_ID, description: '美术与音频检查：独立 art 角色产出原创素材，文件与设计清单一致。',
    steps: ['渲染 art 角色的新素材规范，核对来源、全部动作帧和音频文件，再交独立评审。'], expected: '所有设计声明的素材均已生成并通过格式、动作清单和音频检查。', evidenceKinds: ['test_report'] },
]);
export function gameplayAcceptance(draft: Pick<GameDraft, 'acceptance'>) {
  return draft.acceptance.filter(item => ![...HOST_STAGE_ACCEPTANCE, ...MODULE_STAGE_ACCEPTANCE].some(stage => stage.acceptanceId === item.acceptanceId));
}
/** Host criteria are displayed and frozen in the same user-confirmed revision. */
export function withHostStages(draft: GameDraft): BrowserGameDraft {
  requireBrowserDraft(draft);
  for (const item of draft.acceptance) {
    const stage = [...HOST_STAGE_ACCEPTANCE, ...MODULE_STAGE_ACCEPTANCE].find(stage => stage.acceptanceId === item.acceptanceId);
    if (stage && !sameValue(stage, item) || MODULE_ACCEPTANCE_IDS.includes(item.acceptanceId as any) && !draft.codeProfile) throw new Error('Host stage acceptance cannot be redefined.');
  }
  const result = { ...structuredClone(draft), acceptance: [...structuredClone(gameplayAcceptance(draft)), ...structuredClone(HOST_STAGE_ACCEPTANCE),
    ...(draft.codeProfile ? structuredClone(MODULE_STAGE_ACCEPTANCE) : [])] };
  validateGameDraft(result); return result;
}

interface DraftFields {
  brief: string;
  questions: ClarificationInput['questions'];
  answers: ClarificationInput['answers'];
  acceptance: RequirementContract['acceptance'];
  unsupported: string[];
}
export interface BrowserScenario extends Pick<AcceptancePlan, 'viewport' | 'steps'> {
  reopen?: { steps: AcceptancePlan['steps']; checkpoint: { expected: string;
    snapshot: { kind: 'text'; selector: string }; savedSnapshot: { kind: 'text'; selector: string } } };
}
export interface BrowserGameDraft extends DraftFields { scenario: BrowserScenario; benchmark?: 'classic-pc-runtime-policy/1'; codeProfile?: 'modular-code/1'; preparation?: never }
export interface PreparationGameDraft extends DraftFields { preparation: PreparationSelection; scenario?: never; codeProfile?: never }
export type GameDraft = BrowserGameDraft | PreparationGameDraft;

export function requireBrowserDraft(draft: GameDraft): asserts draft is BrowserGameDraft {
  if (!draft || 'preparation' in draft) throw new Error('The browser host cannot dispatch an unconnected preparation draft.');
}
export function preparationAcceptance(selection: PreparationSelection): RequirementContract['acceptance'] {
  return [...preparationContract(selection).acceptance, ...structuredClone(HOST_STAGE_ACCEPTANCE)];
}

/** A proposal is data only; host identities and confirmation are never model fields. */
export function validateGameDraft(value: unknown, expectedMode: DraftMode = 'browser'): asserts value is GameDraft {
  const selection = resolveDraftMode(expectedMode);
  const draft = value as GameDraft;
  const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 16000;
  const fields = ['brief', 'questions', 'answers', 'acceptance', 'unsupported', ...(selection ? ['preparation'] : ['scenario', 'benchmark', 'codeProfile'])];
  if (!draft || typeof draft !== 'object' || Object.keys(draft).some(key => !fields.includes(key))
    || !text(draft.brief) || !Array.isArray(draft.questions) || !draft.answers || typeof draft.answers !== 'object' || Array.isArray(draft.answers)
    || Object.values(draft.answers).some(answer => typeof answer !== 'string') || !Array.isArray(draft.unsupported) || draft.unsupported.some(item => !text(item))) throw new Error('Invalid game draft fields.');
  if (selection && draft.questions.some(question => !question || typeof question !== 'object' || Array.isArray(question)
    || Object.keys(question).some(key => !['id', 'prompt'].includes(key)) || typeof question.id !== 'string' || typeof question.prompt !== 'string')) throw new Error('Invalid preparation question fields.');
  prepareClarification({ ...draft, specVersion: 'draft', sources: [] });
  if (selection) {
    if (!sameValue(draft.preparation, selection)) throw new Error('Preparation mode or source version changed.');
    modeFromSelection(draft.preparation);
    if (!sameValue(draft.acceptance, preparationAcceptance(selection))) throw new Error('Preparation requires the complete source acceptance contract.');
    return;
  }
  requireBrowserDraft(draft);
  if (draft.codeProfile !== undefined && draft.codeProfile !== 'modular-code/1') throw new Error('Unknown coding profile.');
  if (draft.codeProfile ? MODULE_STAGE_ACCEPTANCE.some(stage => !draft.acceptance.some(item => sameValue(item, stage)))
    : draft.acceptance.some(item => MODULE_ACCEPTANCE_IDS.includes(item.acceptanceId as any))) throw new Error('Modular coding requires both complete fixed local standards.');
  if (draft.benchmark !== undefined && (draft.benchmark !== 'classic-pc-runtime-policy/1' || !draft.scenario?.reopen)) throw new Error('Classic runtime policies require the exact selection and normal save/reopen scenario.');
  validateBrowserScenario(draft);
}

/** Declarative browser checks shared by human drafts and explicit operator inputs. */
export function validateBrowserScenario(draft: Pick<BrowserGameDraft, 'acceptance' | 'scenario'>): void {
  const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 16000;
  if (!Array.isArray(draft.acceptance) || !draft.acceptance.length || draft.acceptance.length > 100
    || new Set(draft.acceptance.map(item => item?.acceptanceId)).size !== draft.acceptance.length
    || draft.acceptance.some(item => !item || Object.keys(item).some(key => !['acceptanceId', 'description', 'steps', 'expected', 'evidenceKinds'].includes(key))
      || !text(item.acceptanceId) || !text(item.description) || !Array.isArray(item.steps) || !item.steps.length || item.steps.some(step => !text(step))
      || !text(item.expected) || !Array.isArray(item.evidenceKinds) || !item.evidenceKinds.length || item.evidenceKinds.some(kind => !['test_report', 'screenshot', 'video', 'log', 'user_decision'].includes(kind)))) throw new Error('Invalid acceptance draft.');
  if (!draft.scenario || Object.keys(draft.scenario).some(key => !['viewport', 'steps', 'reopen'].includes(key))) throw new Error('Invalid scenario fields.');
  for (const item of draft.acceptance) {
    const stage = [...HOST_STAGE_ACCEPTANCE, ...MODULE_STAGE_ACCEPTANCE].find(stage => stage.acceptanceId === item.acceptanceId);
    if (stage && !sameValue(stage, item)) throw new Error('Host stage acceptance cannot be redefined.');
  }
  const gameplay = gameplayAcceptance(draft);
  if (!gameplay.length) throw new Error('At least one gameplay acceptance is required.');
  // Placeholder bindings validate declarative input only; they are never evidence or execution authority.
  const stages = [draft.scenario.steps];
  if (draft.scenario.reopen !== undefined) {
    const reopen = draft.scenario.reopen, checkpoint = reopen?.checkpoint;
    if (!reopen || Object.keys(reopen).some(key => !['steps', 'checkpoint'].includes(key)) || !checkpoint
      || Object.keys(checkpoint).some(key => !['expected', 'snapshot', 'savedSnapshot'].includes(key)) || !text(checkpoint.expected)
      || [checkpoint.snapshot, checkpoint.savedSnapshot].some(observation => !observation || observation.kind !== 'text'
        || Object.keys(observation).some(key => !['kind', 'selector'].includes(key)) || !text(observation.selector))
      || sameValue(checkpoint.snapshot, checkpoint.savedSnapshot)) throw new Error('Invalid visible save checkpoint.');
    stages.push(reopen.steps);
  }
  for (const steps of stages) {
    const acceptanceIds = draft.scenario.reopen ? gameplay.filter(item => Array.isArray(steps)
      && steps.some(step => 'acceptanceId' in step && step.acceptanceId === item.acceptanceId)).map(item => item.acceptanceId) : gameplay.map(item => item.acceptanceId);
    const issues = validatePlan({ viewport: draft.scenario.viewport, steps, formatVersion: '1.0.0', projectId: 'draft', taskId: 'draft', runId: 'draft', reportId: 'draft', specVersion: 'draft',
      artifact: { artifactId: 'draft', version: 'v1', location: 'draft' }, url: 'http://127.0.0.1:1', acceptanceIds });
    if (issues.length) throw new Error(`Unsupported acceptance scenario: ${issues.join('; ')}`);
    if (draft.scenario.reopen) for (const observation of [draft.scenario.reopen.checkpoint.snapshot, draft.scenario.reopen.checkpoint.savedSnapshot]) {
      if (!steps.some((step, index) => 'observation' in step && sameValue(step.observation, observation)
        && step.expected === draft.scenario.reopen!.checkpoint.expected && steps.slice(0, index).some(previous => ['mouse-click', 'locator-click'].includes(previous.kind)))) {
        throw new Error('Each save stage requires normal input followed by both fixed visible checkpoint checks.');
      }
    }
  }
  for (const item of gameplay) {
    if (!stages.some(steps => steps.some((step, index) => (step.kind === 'assert' || step.kind === 'wait-for') && step.acceptanceId === item.acceptanceId
      && step.observation.kind !== 'debug' && steps.slice(0, index).some(previous => ['mouse-click', 'locator-click'].includes(previous.kind))))) {
      throw new Error(`Unsupported acceptance ${item.acceptanceId}: require player input followed by a visible assertion.`);
    }
  }
}

export function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export interface ClarificationInput {
  brief: string;
  specVersion: string;
  sources: RequirementContract['sources'];
  acceptance: RequirementContract['acceptance'];
  questions: { id: string; prompt: string }[];
  answers: Record<string, string>;
}

/** Host-supplied concentrated questions and acceptance draft; this phase makes no model calls. */
export function prepareClarification(input: ClarificationInput) {
  if (!input.brief?.trim() || input.questions.length < 1 || input.questions.length > 12) throw new Error('A brief and 1 to 12 clarification questions are required.');
  if (new Set(input.questions.map(q => q.id)).size !== input.questions.length || input.questions.some(q => !q.id.trim() || !q.prompt.trim())) throw new Error('Question IDs and prompts must be non-empty and unique.');
  if (Object.keys(input.answers).some(id => !input.questions.some(q => q.id === id))) throw new Error('Answers must refer to declared questions.');
  const missingQuestionIds = input.questions.filter(q => typeof input.answers[q.id] !== 'string' || !input.answers[q.id].trim()).map(q => q.id);
  return freeze(structuredClone({ brief: input.brief, specVersion: input.specVersion, sources: input.sources, acceptance: input.acceptance, questions: input.questions, answers: input.answers, missingQuestionIds }));
}

/** Called only with the user's explicit confirmation of this exact draft and its answers. */
export function confirmRequirements(draft: ClarificationInput, confirmation: { confirmed: boolean; actorId: string; at: string }): RequirementContract {
  const current = prepareClarification(draft);
  if (current.missingQuestionIds.length) throw new Error('Required clarification answers are missing.');
  if (confirmation.confirmed !== true) throw new Error('Explicit user confirmation is required.');
  const result: RequirementContract = { contractVersion: '1.0.0', specVersion: current.specVersion, sources: current.sources, acceptance: current.acceptance, confirmedBy: confirmation.actorId, confirmedAt: confirmation.at };
  const errors = validateRequirement(result);
  if (errors.length) throw new Error(`Invalid confirmed requirement: ${errors.map(e => e.message).join('; ')}`);
  return freeze(result);
}
