import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPiSession } from '../providers/pi.ts';
import type { PiSessionOptions } from '../providers/pi.ts';
import type { IntakeController } from '../runtime/intake.ts';
import { publishReceipt } from '../runtime/recovery/receipt-file.ts';
import { sameValue } from '../contracts/validation.ts';
import { createRoleBudget } from './provider-budget.ts';
import { prepareClarification, validateGameDraft } from './requirements.ts';
import type { GameDraft } from './requirements.ts';
import type { RoleSession } from './factory.ts';

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
For phase questions return exactly {"questions":[{"id":"...","prompt":"..."}]} with 1-12 nonempty unique IDs. Questions should resolve controls, goal, failure, scope, style and normal input acceptance for the actual brief, not a fixed tower-defense game.
For phase draft return exactly {"acceptance":[{"acceptanceId":"...","description":"...","steps":["..."],"expected":"...","evidenceKinds":["test_report"]}],"scenario":{"viewport":{"width":1280,"height":720},"steps":[...]},"unsupported":[]}. Use the supplied answers without changing them. Describe any unsupported requested capabilities in unsupported; never silently omit a requested requirement.
Scenario is data, not code. Supported inputs are {id,kind:"locator-click",selector,timeoutMs} or {id,kind:"mouse-click"|"mouse-move",x,y,selector?}. Checks are {id,kind:"assert"|"wait-for",acceptanceId,observation:{kind:"text"|"visible",selector},expected:string|number|boolean|null,timeoutMs}. Timeouts are 1..60000 ms; at most 200 steps. Each gameplay acceptance needs player input followed by a visible assertion. Read-only debug data is supplementary. No script, evaluate, shell or state setter is allowed. The host binds paths, URL and actual artifact versions later. Do not emit confirmed, actorId, sources, brief, answers or any other fields.`;

/** Durable step identity prevents a lost response from becoming an unbounded paid retry. */
async function request(options: InterviewOptions, input: { phase: 'questions' | 'draft'; brief: string; questions?: Questions; answers?: GameDraft['answers'] }): Promise<unknown> {
  const { controller } = options;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/.test(options.roundId) || !input.brief.trim()) throw new Error('Invalid interview round or brief.');
  controller.signal.throwIfAborted();
  const state = await controller.read();
  if (state.stopReason) throw new Error('Intake is stopped.');
  const root = join(controller.root, 'intake-sessions', options.roundId), intent = { formatVersion: 1, runId: state.run.runId, ledgerId: state.ledger.ledgerId, input, ...(options.capabilities ? { capabilities: options.capabilities } : {}) };
  await mkdir(root, { recursive: true });
  const recorded = await optionalJson(join(root, 'intent.json'));
  if (recorded !== null) {
    if (!sameValue(recorded, intent)) throw new Error('Interview input identity changed; reuse requires the exact original input.');
    const reply = await optionalJson(join(root, 'reply.json')) as { intent: unknown; proposal: unknown } | null;
    if (!reply || !sameValue(reply.intent, intent)) throw new Error('Incomplete interview reply; retain accounting and inspect the original run.');
    return reply.proposal;
  }
  await publishReceipt(join(root, 'intent.json'), intent);
  const session = await (options.sessionFactory ?? createPiSession)({
    workspace: controller.root, stateDirectory: join(root, 'native'), systemPrompt: `${systemPrompt}\nHost capabilities: ${options.capabilities ?? 'Only the declared normal-input acceptance vocabulary.'}`,
    context: JSON.stringify({ role: 'design-intake', runId: state.run.runId, ledgerId: state.ledger.ledgerId, input }), tools: [], modelId: 'deepseek-flash', thinkingLevel: 'low',
    maxOutputTokens: options.maxOutputTokens, maxRequests: 1, requestTimeoutMs: options.requestTimeoutMs,
    estimatedMaxCostMicroCny: options.estimatedMaxCostMicroCny, env: options.env,
    budget: createRoleBudget({ controller, taskId: state.interviewTaskId, evidenceDirectory: root }),
  });
  try {
    const result = await session.prompt(JSON.stringify(input), { signal: controller.signal });
    controller.signal.throwIfAborted();
    if (result.text.length > 128000) throw new Error('Interview proposal exceeds its output bound.');
    const proposal: unknown = JSON.parse(result.text);
    await publishReceipt(join(root, 'reply.json'), { intent, proposal });
    return proposal;
  } finally { await session.close(); }
}

export async function requestDesignQuestions(options: InterviewOptions): Promise<Questions> {
  const proposal = await request(options, { phase: 'questions', brief: options.brief }) as { questions: unknown };
  if (!proposal || typeof proposal !== 'object' || Object.keys(proposal).some(key => key !== 'questions')) throw new Error('Invalid design question proposal fields.');
  checkQuestions(proposal.questions); return structuredClone(proposal.questions);
}

export async function requestDesignDraft(options: InterviewOptions & { questions: Questions; answers: GameDraft['answers'] }): Promise<GameDraft> {
  checkQuestions(options.questions);
  const clarification = prepareClarification({ brief: options.brief, specVersion: 'draft', sources: [], acceptance: [], questions: options.questions, answers: options.answers });
  if (clarification.missingQuestionIds.length) throw new Error('All interview questions require a user answer before the draft.');
  const proposal = await request(options, { phase: 'draft', brief: options.brief, questions: options.questions, answers: options.answers }) as Pick<GameDraft, 'acceptance' | 'scenario' | 'unsupported'>;
  if (!proposal || typeof proposal !== 'object' || Object.keys(proposal).some(key => !['acceptance', 'scenario', 'unsupported'].includes(key))) throw new Error('Invalid design draft proposal fields.');
  const draft = { ...structuredClone(proposal), brief: options.brief, questions: structuredClone(options.questions), answers: structuredClone(options.answers) };
  validateGameDraft(draft); return draft;
}
