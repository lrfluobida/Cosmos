import { lstat, mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createPiSession } from '../providers/pi.ts';
import type { PiSessionOptions } from '../providers/pi.ts';
import type { IntakeController } from '../runtime/intake.ts';
import { publishReceipt } from '../runtime/recovery/receipt-file.ts';
import { sameValue } from '../contracts/validation.ts';
import { createRoleBudget } from './provider-budget.ts';
import { prepareClarification, preparationAcceptance, validateGameDraft, withHostStages } from './requirements.ts';
import { modeFromSelection, preparationContract } from './preparation-mode.ts';
import type { GameDraft } from './requirements.ts';
import type { RoleSession } from './factory.ts';
import { decodeModelJson } from './protocol.ts';
import { truncatedDraftSuccessor } from './interview-recovery.ts';
import { deniedDraftSuccessor, requireInterviewHistorySources } from './interview-denial.ts';
import { ordinaryDraftOutputLimit } from './interview-budget.ts';

export interface InterviewOptions {
  controller: IntakeController; roundId: string; brief: string;
  maxOutputTokens: number; requestTimeoutMs: number; estimatedMaxCostMicroCny: PiSessionOptions['estimatedMaxCostMicroCny'];
  env?: PiSessionOptions['env']; sessionFactory?: (options: PiSessionOptions) => Promise<RoleSession>;
  capabilities?: string;
}
type Questions = GameDraft['questions'];
function checkQuestions(value: unknown): asserts value is Questions {
  if (!Array.isArray(value) || value.some(item => !item || Object.keys(item).some(key => !['id', 'prompt'].includes(key)))) throw new Error('Invalid question fields.');
  prepareClarification({ brief: 'question schema', specVersion: 'draft', sources: [], acceptance: [], questions: value, answers: {} });
}
async function optionalJson(path: string): Promise<unknown | null> {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new Error('Incomplete interview record; inspect the original run before retrying.'); }
}
const systemPrompt = `You are the Cosmos design interviewer. Ask concentrated questions before proposing requirements. You have no tools and cannot create a game, confirm a requirement, impersonate the user or choose budget/run identities.
For requested modular organization in an ordinary browser game, you may propose only codeProfile:"modular-code/1". The host adds two fixed local module standards and displays five tasks before real stdin confirmation. You cannot choose module paths, interfaces, grants, thresholds or task identities here. Runtime design freezes interfaces later; modules prove compile/interface/source review and final integration still proves every gameplay requirement.
For phase questions return exactly {"questions":[{"id":"...","prompt":"..."}]} with 1-12 nonempty unique IDs. Questions should resolve controls, goal, failure, scope, style and normal input acceptance for the actual brief, not a fixed tower-defense game.
For phase draft return exactly {"acceptance":[{"acceptanceId":"...","description":"...","steps":["..."],"expected":"...","evidenceKinds":["test_report"]}],"scenario":{"viewport":{"width":1280,"height":720},"steps":[...]},"unsupported":[]}. Use the supplied answers without changing them. Describe any unsupported requested capabilities in unsupported; never silently omit a requested requirement. For explicitly requested classic-PC scope, you may add benchmark:"classic-pc-runtime-policy/1" with the normal save/reopen scenario. This runs STARTUP/OFFLINE only; the host retains all 230 catalog entries, 221 reference unknowns and seven other unexecuted policies. Full classic acceptance remains partial.
Scenario is data, not code. Supported inputs are {id,kind:"locator-click",selector,timeoutMs} or {id,kind:"mouse-click"|"mouse-move",x,y,selector?}. Checks are {id,kind:"assert"|"wait-for",acceptanceId,observation:{kind:"text"|"visible",selector},expected:string|number|boolean|null,timeoutMs}. Timeouts are 1..60000 ms; at most 200 steps per stage. Each gameplay acceptance needs player input followed by a visible assertion. For save/reopen requirements, add scenario.reopen:{steps:[...],checkpoint:{expected:string,snapshot:{kind:"text",selector},savedSnapshot:{kind:"text",selector}}}. The first steps normally play/unlock/buy/save; reopen.steps click continue and check restored state. Both stages must assert the same checkpoint expected string at two distinct visible selectors after normal input; their union covers all gameplay acceptance IDs. The host closes the real browser process and reopens the same private profile/origin between stages. No URL, profile, PID, storage payload, script, evaluate, shell, state setter or time authority is allowed. Read-only debug data is supplementary. The host binds paths, URL and actual artifact versions later. Do not emit confirmed, actorId, sources, brief, answers or any other fields.`;
const preparationPrompt = `You are the Cosmos design interviewer for a source-selected preparation mode. You have no tools and cannot generate a game or runtime design, confirm requirements, impersonate the user, change the selected mode/version or choose budget/run identities.
For phase questions return exactly {"questions":[{"id":"...","prompt":"..."}]} with 1-12 nonempty unique IDs. Compare the actual brief with the supplied complete scope and ask concentrated questions about controls, goal, failure, scope, style and acceptance. Preserve every requested requirement; do not silently choose or truncate the brief to fit this mode.
For phase draft return exactly {"acceptance":[...],"unsupported":[]}. Copy the complete supplied acceptance without changes, including all six T16 and both host stages. Use the supplied answers without changing them. Describe each requested capability outside the supplied scope in unsupported; an unsupported request cannot be confirmed. Runtime design produces the map, solution and executable acceptance later. Do not emit a scenario, map, solution, paths, preparation selector, sourceVersion, confirmed, confirmedBy, actorId, sources, brief, answers or any other fields.`;
export const ordinaryPrompt = `You are the Cosmos design interviewer for ordinary-design/1. You have no tools and cannot generate a game, executable plan, user confirmation, runtime identity or budget.
For phase questions return exactly {"questions":[{"id":"...","prompt":"..."}]} with 1-12 nonempty unique IDs. Resolve controls, goal, failure, scope, style and acceptance for the supplied brief.
For phase draft return exactly {"acceptance":[{"acceptanceId":"...","description":"...","steps":["..."],"expected":"...","evidenceKinds":["test_report"]}],"experienceCriteria":[{"criterionId":"...","description":"...","steps":["..."],"expected":"..."}],"unsupported":[]}. Preserve the complete brief, questions and answers as requirements; never omit or weaken a requested capability. acceptance contains objective automatic requirements and at least one gameplay item. experienceCriteria contains only subjective feel, visual recognizability, listening and overall experience, with unique IDs distinct from acceptance IDs; it may be empty. Do not move an objective requirement to experienceCriteria to avoid unsupported automatic checks.
Use human-readable actions and outcomes without choosing selectors, coordinates, maps, solutions or executable steps. Runtime design creates the concrete acceptance plan after real user confirmation, within the original generation clock. Static mouse/locator input and fixed visible equality assertions are supported; choosing later inputs from newly observed random states, hidden-state access, numeric ranges and duration measurements are not. A wait timeout does not prove a duration. List unsupported requested capabilities explicitly; do not fix randomized layouts or replace exact timing with eventual success. Only list capabilities the user actually requests and the current capabilities cannot support in unsupported. Keep explicitly excluded features as exclusions; do not list them in unsupported merely because the platform also cannot support them. This is your semantic judgment, not a trusted host detection result; independent design review checks the full original answers.
For requested modular organization you may add only codeProfile:"modular-code/1"; the host supplies its fixed stages. For explicitly requested classic-PC scope you may add only benchmark:"classic-pc-runtime-policy/1"; STARTUP/OFFLINE require a runtime-designed normal save/reopen plan and full classic acceptance remains partial. Do not emit scenario, ordinaryProfile, preparation, paths, sourceVersion, confirmed, confirmedBy, actorId, sources, brief, questions, answers or other fields.`;

/** Durable step identity prevents a lost response from becoming an unbounded paid retry. */
async function request(options: InterviewOptions, input: { phase: 'questions' | 'draft'; brief: string; questions?: Questions; answers?: GameDraft['answers'] }): Promise<unknown> {
  const { controller } = options;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/.test(options.roundId) || !input.brief.trim()) throw new Error('Invalid interview round or brief.');
  controller.signal.throwIfAborted();
  const state = await controller.read();
  modeFromSelection(state.draftMode);
  if (state.stopReason) throw new Error('Intake is stopped.');
  const thinkingLevel = state.ordinaryProfile && input.phase === 'draft' ? 'off' : 'low';
  const modeContext = state.draftMode ? { draftMode: state.draftMode, preparation: { ...preparationContract(state.draftMode), acceptance: preparationAcceptance(state.draftMode) } }
    : state.ordinaryProfile ? { ordinaryProfile: state.ordinaryProfile, requestConfig: { modelId: 'deepseek-flash', thinkingLevel, maxOutputTokens: options.maxOutputTokens, requestTimeoutMs: options.requestTimeoutMs } } : {};
  let root = join(controller.root, 'intake-sessions', options.roundId);
  let intent: Record<string, unknown> = { formatVersion: 1, runId: state.run.runId, ledgerId: state.ledger.ledgerId, input, ...(options.capabilities ? { capabilities: options.capabilities } : {}), ...modeContext };
  const prompt = {
    systemPrompt: `${state.draftMode ? preparationPrompt : state.ordinaryProfile ? ordinaryPrompt : systemPrompt}\nHost capabilities: ${options.capabilities ?? 'Only the declared normal-input acceptance vocabulary.'}`,
    context: JSON.stringify({ role: 'design-intake', runId: state.run.runId, ledgerId: state.ledger.ledgerId, input, ...modeContext }),
  };
  let recheck: ((work: string | undefined) => Promise<void>) | undefined;
  let successorAttempt = false;
  const recorded = await optionalJson(join(root, 'intent.json'));
  if (recorded !== null) {
    if (!sameValue(recorded, intent)) throw new Error('Interview input identity changed; reuse requires the exact original input.');
    const reply = await optionalJson(join(root, 'reply.json')) as { intent: unknown; proposal: unknown } | null;
    if (reply !== null) {
      if (!sameValue(reply.intent, intent)) throw new Error('Incomplete interview reply; retain accounting and inspect the original run.');
      return reply.proposal;
    }
    if (input.phase !== 'draft' || state.draftMode) throw new Error('Incomplete interview reply; retain accounting and inspect the original run.');
    const billing = (await readdir(root)).filter(name => name.startsWith('billing-'));
    const successor = state.ordinaryProfile && billing.length === 0
      ? await deniedDraftSuccessor(controller, options.roundId, intent, prompt)
      : await truncatedDraftSuccessor(controller, options.roundId, intent);
    root = successor.root; intent = successor.intent;
    const started = await optionalJson(join(root, 'intent.json'));
    if (started !== null) {
      const completed = await optionalJson(join(root, 'reply.json')) as { intent: unknown; proposal: unknown } | null;
      if (!sameValue(started, intent) || !completed || !sameValue(completed.intent, intent)) throw new Error('Draft successor is incomplete or its source changed; no further request is allowed.');
      return completed.proposal;
    }
    if ('canStart' in successor && !successor.canStart) throw new Error('Draft successor slot was consumed by later interview or request history.');
    successorAttempt = true;
    if ('recheck' in successor) recheck = successor.recheck;
    const existing = await readdir(root).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; });
    if (existing.length) throw new Error('Draft successor source is missing; existing files cannot authorize another request.');
    await mkdir(root, { recursive: true });
  } else {
    const existing = await readdir(root).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; });
    const successor = await lstat(`${root}-successor-1`).then(() => true, (error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return false; throw error; });
    if (existing.length || successor) throw new Error('Original interview source is missing; existing records cannot authorize a new request.');
    if (state.ordinaryProfile) await requireInterviewHistorySources(controller);
    await mkdir(root, { recursive: true });
  }
  if (!successorAttempt) await publishReceipt(join(root, 'intent.json'), intent);
  const fundingWork = await controller.beginFundingWork('interview');
  let session: RoleSession | undefined;
  try {
    if (successorAttempt) {
      await recheck?.(fundingWork);
      await publishReceipt(join(root, 'intent.json'), intent);
    }
    session = await (options.sessionFactory ?? createPiSession)({
      workspace: controller.root, stateDirectory: join(root, 'native'), ...prompt, tools: [], modelId: 'deepseek-flash', thinkingLevel,
      maxOutputTokens: options.maxOutputTokens, maxRequests: 1, requestTimeoutMs: options.requestTimeoutMs,
      estimatedMaxCostMicroCny: options.estimatedMaxCostMicroCny, env: options.env,
      ...(state.ordinaryProfile && input.phase === 'draft' ? { requestOutputLimit: ordinaryDraftOutputLimit(controller, state, options.estimatedMaxCostMicroCny) } : {}),
      budget: createRoleBudget({ controller, taskId: state.interviewTaskId, evidenceDirectory: root, recordRequest: !!state.ordinaryProfile && input.phase === 'draft' }),
    });
    const result = await session.prompt(JSON.stringify(input), { signal: controller.signal });
    controller.signal.throwIfAborted();
    if (result.text.length > 128000) throw new Error('Interview proposal exceeds its output bound.');
    const proposal = decodeModelJson(result.text);
    await publishReceipt(join(root, 'reply.json'), { intent, proposal });
    return proposal;
  } finally { await session?.close(); await controller.finishFundingWork(fundingWork); }
}

export async function requestDesignQuestions(options: InterviewOptions): Promise<Questions> {
  const proposal = await request(options, { phase: 'questions', brief: options.brief }) as { questions: unknown };
  if (!proposal || typeof proposal !== 'object' || Object.keys(proposal).some(key => key !== 'questions')) throw new Error('Invalid design question proposal fields.');
  checkQuestions(proposal.questions); return structuredClone(proposal.questions);
}

export async function requestDesignDraft(options: InterviewOptions & { questions: Questions; answers: GameDraft['answers'] }): Promise<GameDraft> {
  const { draftMode, ordinaryProfile } = await options.controller.read(), mode = modeFromSelection(draftMode);
  checkQuestions(options.questions);
  const clarification = prepareClarification({ brief: options.brief, specVersion: 'draft', sources: [], acceptance: [], questions: options.questions, answers: options.answers });
  if (clarification.missingQuestionIds.length) throw new Error('All interview questions require a user answer before the draft.');
  const proposal = await request(options, { phase: 'draft', brief: options.brief, questions: options.questions, answers: options.answers }) as Pick<GameDraft, 'acceptance' | 'scenario' | 'unsupported'>;
  const fields = draftMode ? ['acceptance', 'unsupported'] : ['acceptance', ordinaryProfile ? 'experienceCriteria' : 'scenario', 'unsupported', 'benchmark', 'codeProfile'];
  if (!proposal || typeof proposal !== 'object' || Object.keys(proposal).some(key => !fields.includes(key))) throw new Error('Invalid design draft proposal fields.');
  const draft = { ...structuredClone(proposal), brief: options.brief, questions: structuredClone(options.questions), answers: structuredClone(options.answers), ...(draftMode ? { preparation: draftMode } : {}),
    ...(ordinaryProfile ? { ordinaryProfile } : {}) };
  const selected = !draftMode && (draft as GameDraft).codeProfile ? withHostStages(draft as GameDraft) : draft;
  validateGameDraft(selected, mode, ordinaryProfile); return selected;
}
