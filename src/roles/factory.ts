import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { ImageContent } from '@earendil-works/pi-ai';
import { createPiSession, createWorkspaceTools } from '../providers/pi.ts';
import type { PiBudgetFinalizationSource, PiSessionOptions } from '../providers/pi.ts';
import { validateTask } from '../contracts/index.ts';
import { sameValue } from '../contracts/validation.ts';
import type { TaskContract } from '../contracts/index.ts';
import type { RunController } from '../runtime/run.ts';
import { createRoleBudget } from './provider-budget.ts';
import { freeze } from './requirements.ts';
import { validateExecutionInput, validateExecutionRequirement } from './execution-input.ts';
import type { ExecutionRequirement } from './execution-input.ts';
import { requireValidationScope } from '../runtime/validation-scope.ts';
import type { ValidationExecutionBinding } from '../runtime/validation-scope.ts';
import { validationReservation, validationRole } from '../runtime/validation-validation.ts';
import { requireOriginalTask } from '../runtime/recovery/task-journal.ts';
import { codingConcernReviewProtocol } from '../runtime/repair/coding-concerns.ts';
import type { CodingConcernReview } from '../runtime/repair/coding-concerns.ts';
import { designConcernReviewProtocol, isOrdinaryDesignRevisionPolicy } from '../runtime/repair/design-concerns.ts';
import type { DesignConcernReview, OrdinaryDesignRevisionPolicy } from '../runtime/repair/design-concerns.ts';
import { inputFilesProtocol, roleInputFiles } from './input-files.ts';
import { planningJsonExample } from './planning-protocol.ts';
import { authorBudgetCompaction, authorBudgetOutputLimit, requireOriginalAuthorBudget } from './author-output-budget.ts';

export type AuthorRole = 'cosmos' | 'design' | 'coding' | 'art';
export type Role = AuthorRole | 'reviewer';
export interface RoleSession {
  prompt(text: string, options?: { signal?: AbortSignal; images?: ImageContent[] }): Promise<{ text: string }>;
  /** Host-only format correction with native tool execution disabled. */
  readonlyPrompt?(text: string, options?: { signal?: AbortSignal }): Promise<{ text: string }>;
  /** Host-only, idle-session boundary; native pi owns summarization and billing. */
  budgetFinalization?(error: unknown): Promise<PiBudgetFinalizationSource | null>;
  finalizeBudget?(error: unknown, text: string, options?: { signal?: AbortSignal }): Promise<{ text: string }>;
  compact?(signal?: AbortSignal): Promise<unknown>;
  close(): Promise<void>;
}
export interface RoleInput {
  role: Role;
  purpose?: 'planning';
  task: TaskContract;
  requirement: ExecutionRequirement;
  validation?: ValidationExecutionBinding;
  /** Host-provided original coding concerns for the explicit validation review policy. */
  codingConcernReview?: CodingConcernReview;
  designConcernReview?: DesignConcernReview;
  workspace: string;
  stateDirectory: string;
  controller: RunController;
}
export interface CreatedRole extends RoleSession { contextId: string; actorId: string }
export type RoleFactory = (input: RoleInput) => Promise<CreatedRole>;
export interface RoleFactoryOptions {
  maxOutputTokens: number;
  /** Explicit author overrides; planning and review retain maxOutputTokens. */
  authorMaxOutputTokens?: Partial<Record<AuthorRole, number>>;
  /** Explicit trusted opt-in; select within the original grant between this floor and the author cap. */
  authorBudgetOutputFloor?: Partial<Record<AuthorRole, number>>;
  /** Trusted ordinary design selection; original budget quotes govern optional summaries. */
  ordinaryDesignBudgetCompaction?: true;
  ordinaryDesignBudgetPolicy?: 'review-reserve/1';
  ordinaryDesignFinalizationPolicy?: 'budget-followup/1';
  ordinaryDesignRevisionPolicy?: OrdinaryDesignRevisionPolicy;
  /** Trusted ordinary design reviewer selection; compact complete JSON reads and quote a 4096-8192 output cap. */
  ordinaryDesignReviewBudget?: (task: Readonly<TaskContract>) => boolean;
  maxRequests: number;
  /** Author overrides only; planning, review and fixed validation retain maxRequests. */
  authorMaxRequests?: Partial<Record<AuthorRole, number>>;
  requestTimeoutMs: number;
  /** Trusted coding author cap; planning and reviewers retain requestTimeoutMs. */
  codingAuthorRequestTimeoutMs?: number;
  estimatedMaxCostMicroCny: PiSessionOptions['estimatedMaxCostMicroCny'];
  thinkingLevel?: PiSessionOptions['thinkingLevel'];
  /** Author overrides only; planning, review and fixed validation retain thinkingLevel. */
  authorThinkingLevel?: Partial<Record<AuthorRole, NonNullable<PiSessionOptions['thinkingLevel']>>>;
  env?: PiSessionOptions['env'];
  compactionKeepRecentTokens?: PiSessionOptions['compactionKeepRecentTokens'];
  /** Trusted host integrations only. Mutating tools are never supplied to a reviewer. */
  hostTools?: (input: Readonly<{ role: Role; taskId: string; workspace: string; signal: AbortSignal; childEnv: NodeJS.ProcessEnv }>) => Promise<{ tool: ToolDefinition; readOnly: boolean }[]>;
  sessionFactory?: (options: PiSessionOptions) => Promise<RoleSession>;
  /** Optional trusted host admission immediately before an existing scoped tool. */
  beforeTool?: (input: Readonly<RoleInput>, signal: AbortSignal) => Promise<void>;
  /** Advisory host feedback after a scoped file write succeeds; never grants file access. */
  afterFileWrite?: (input: Readonly<RoleInput>, write: Readonly<{ name: 'write' | 'edit'; path: string }>, signal: AbortSignal) => Promise<string | undefined>;
}

/** Pass this allowlisted environment to every host child process, never process.env. */
export function roleToolEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const allowed = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMDATA', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'LANG', 'LC_ALL']);
  return Object.fromEntries(Object.entries(source).filter(([name, value]) => allowed.has(name.toUpperCase()) && value !== undefined));
}

export function pathsOverlap(a: string, b: string, workspace: string): boolean {
  const within = (left: string, right: string) => { const rel = relative(resolve(workspace, left), resolve(workspace, right)); return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)); };
  return within(a, b) || within(b, a);
}

export function assertOwnership(task: TaskContract, workspace: string): void {
  if (task.ownership.writePaths.some(write => task.ownership.readOnlyPaths.some(read => pathsOverlap(write, read, workspace)))) throw new Error('Write scope overlaps a read-only path.');
  const protectedPaths = [...task.inputs, ...task.context.interfaces].map(ref => ref.location);
  if (task.ownership.writePaths.some(write => protectedPaths.some(read => pathsOverlap(write, read, workspace)))) throw new Error('Write scope overlaps fixed input or interface artifacts.');
}

/** Thin role construction on the pinned native pi adapter, with no inherited conversation. */
export function createRoleFactory(options: RoleFactoryOptions): RoleFactory {
  const authorLimits = { ...options.authorMaxOutputTokens };
  if (Object.entries(authorLimits).some(([role, limit]) => !['cosmos', 'design', 'coding', 'art'].includes(role) || !Number.isSafeInteger(limit) || limit <= 0)) throw new Error('authorMaxOutputTokens requires valid author roles and positive safe integers.');
  const authorFloors = { ...options.authorBudgetOutputFloor };
  const revisionPolicy = options.ordinaryDesignRevisionPolicy;
  if (revisionPolicy !== undefined && (!isOrdinaryDesignRevisionPolicy(revisionPolicy) || options.ordinaryDesignBudgetPolicy !== 'review-reserve/1'
    || options.ordinaryDesignBudgetCompaction !== true || authorFloors.design !== 8192 || authorLimits.design !== 32768
    || authorFloors.art !== 8192 || authorLimits.art !== 65536 || authorFloors.coding !== 8192 || authorLimits.coding !== 65536)) throw new Error('Invalid ordinaryDesignRevisionPolicy output configuration.');
  for (const [role, floor] of Object.entries(authorFloors)) {
    const cap = authorLimits[role as AuthorRole] ?? options.maxOutputTokens;
    if (!['cosmos', 'design', 'coding', 'art'].includes(role) || !Number.isSafeInteger(floor) || floor <= 0
      || !Number.isSafeInteger(cap) || cap < floor || cap > (revisionPolicy && ['art', 'coding'].includes(role) ? 65536 : 32768)) throw new Error('authorBudgetOutputFloor requires valid author roles, positive safe integers and floor <= cap <= 32768.');
    authorLimits[role as AuthorRole] = cap;
  }
  const ordinaryDesignCompaction = options.ordinaryDesignBudgetCompaction;
  if (ordinaryDesignCompaction !== undefined && (ordinaryDesignCompaction !== true || authorFloors.design !== 8192 || authorLimits.design !== 32768)) {
    throw new Error('ordinaryDesignBudgetCompaction requires the original design floor 8192 and cap 32768.');
  }
  const recoveryPolicy = options.ordinaryDesignBudgetPolicy;
  if (recoveryPolicy !== undefined && (recoveryPolicy !== 'review-reserve/1' || !ordinaryDesignCompaction)) throw new Error('Invalid ordinaryDesignBudgetPolicy.');
  const authorRequestLimits = { ...options.authorMaxRequests };
  const finalizationPolicy = options.ordinaryDesignFinalizationPolicy;
  if (finalizationPolicy !== undefined && (finalizationPolicy !== 'budget-followup/1' || recoveryPolicy !== 'review-reserve/1' || authorRequestLimits.design !== 32)) throw new Error('Invalid ordinaryDesignFinalizationPolicy.');
  const ordinaryDesignReviewBudget = options.ordinaryDesignReviewBudget;
  if (ordinaryDesignReviewBudget !== undefined && (typeof ordinaryDesignReviewBudget !== 'function' || options.maxOutputTokens !== 8192)) {
    throw new Error('ordinaryDesignReviewBudget requires a trusted selector and the original 8192 output cap.');
  }
  if (Object.entries(authorRequestLimits).some(([role, limit]) => !['cosmos', 'design', 'coding', 'art'].includes(role) || !Number.isSafeInteger(limit) || limit <= 0)) throw new Error('authorMaxRequests requires valid author roles and positive safe integers.');
  const authorThinking = { ...options.authorThinkingLevel };
  if (Object.entries(authorThinking).some(([role, level]) => !['cosmos', 'design', 'coding', 'art'].includes(role) || !['off', 'low', 'high', 'max'].includes(level))) throw new Error('authorThinkingLevel requires valid author roles and supported thinking levels.');
  const codingTimeout = options.codingAuthorRequestTimeoutMs;
  if (codingTimeout !== undefined && (!Number.isSafeInteger(codingTimeout) || codingTimeout <= 0)) throw new Error('codingAuthorRequestTimeoutMs requires a positive safe integer.');
  return async input => {
    if (finalizationPolicy && input.validation) throw new Error('Ordinary design finalization cannot authorize validation roles.');
    if (revisionPolicy && input.validation) throw new Error('Ordinary design revision cannot authorize validation roles.');
    input.controller.signal.throwIfAborted();
    const task = structuredClone(input.task), requirement = structuredClone(input.requirement);
    const errors = [...validateTask(task), ...validateExecutionRequirement(requirement, input.validation ? 'operator_validation' : 'human')];
    if (errors.length || task.specVersion !== requirement.specVersion) throw new Error('Invalid role task or confirmed requirements.');
    const scope = input.validation ? await requireValidationScope(input.controller, requirement, input.validation) : undefined;
    if (input.designConcernReview && (revisionPolicy !== 'independent-review/2' || input.role !== 'reviewer' || input.purpose || input.validation || input.codingConcernReview
      || input.designConcernReview.policy !== 'independent-review/2' || input.designConcernReview.formatVersion !== 'ordinary-design-concern-review/1'
      || task.acceptanceIds.length !== 1 || task.acceptanceIds[0] !== 'COSMOS-DESIGN' || input.designConcernReview.taskId !== task.taskId
      || input.designConcernReview.attemptId !== task.attempts.at(-1)?.attemptId || input.designConcernReview.authorId !== task.authorId || input.designConcernReview.contextId !== task.context.contextId)) throw new Error('Design concern review requires its original ordinary design policy, task and attempt.');
    if (input.codingConcernReview && (!input.validation || input.role !== 'reviewer' || input.purpose || input.codingConcernReview.taskId !== task.taskId
      || input.codingConcernReview.attemptId !== task.attempts.at(-1)?.attemptId || input.codingConcernReview.authorId !== task.authorId || input.codingConcernReview.contextId !== task.context.contextId)) throw new Error('Coding concern review requires its original validation task and attempt.');
    const purpose = input.purpose === 'planning' ? 'planning' : input.role === 'reviewer' ? 'reviewer' : 'author';
    let designReviewBudget = false;
    if (ordinaryDesignReviewBudget && input.role === 'reviewer' && !input.purpose && !input.validation) {
      designReviewBudget = ordinaryDesignReviewBudget(freeze(structuredClone(task)));
      if (typeof designReviewBudget !== 'boolean') throw new Error('ordinaryDesignReviewBudget must return a boolean.');
    }
    const validation = input.validation ? await input.controller.validationAuthority(task.taskId, purpose) : undefined;
    const authorRequestLimit = purpose === 'author' && !validation && input.role !== 'reviewer' ? authorRequestLimits[input.role] : undefined;
    const authorFloor = purpose === 'author' && !validation && input.role !== 'reviewer' ? authorFloors[input.role] : undefined;
    const designCompaction = ordinaryDesignCompaction && purpose === 'author' && input.role === 'design' && !validation;
    const reviewReserve = !!(recoveryPolicy && designCompaction);
    const maxRequests = authorRequestLimit ?? options.maxRequests;
    const authority = validation ? undefined : await input.controller.executionAuthority(task.taskId);
    if (input.designConcernReview && authority?.windowId) throw new Error('A continuation reviewer cannot acquire ordinary design candidate authority.');
    input.controller.signal.throwIfAborted();
    if (validation ? !validation.admissionAllowed : authority!.windowId && !authority!.admissionAllowed) throw new Error('Role task has no active execution window authority.');
    if (scope) {
      let assigned = validationRole(scope.window, task.taskId);
      if (assigned === 'repair') assigned = validationRole(scope.window, scope.window.repair!.sourceTaskId);
      if ((purpose === 'planning' ? input.role !== 'cosmos' || assigned !== 'planning' : input.role !== 'reviewer' && input.role !== assigned)
        || validateExecutionInput({ requirement, task, ledger: scope.snapshot.ledger, run: scope.snapshot.run }).length) throw new Error('Validation role differs from its declared grant or fixed scope.');
      if (purpose === 'planning') {
        if (!sameValue([...task.acceptanceIds].sort(), requirement.acceptance.map(item => item.acceptanceId).sort())) throw new Error('Validation planning must retain every fixed acceptance item.');
      } else requireOriginalTask(scope.snapshot.tasks.find(item => item.taskId === task.taskId)!, task);
    }
    const workspace = await realpath(input.workspace);
    assertOwnership(task, workspace);
    const reviewer = input.role === 'reviewer';
    const contextId = reviewer ? `review-${randomUUID()}` : task.context.contextId;
    const actorId = reviewer ? `reviewer-${randomUUID()}` : task.authorId;
    const reads = reviewer ? [...task.inputs, ...task.artifacts, ...task.context.interfaces, ...task.evidence.map(e => e.source)].map(ref => ref.location) : [...task.ownership.readOnlyPaths, ...task.ownership.writePaths, ...task.inputs.map(ref => ref.location), ...task.context.interfaces.map(ref => ref.location)];
    const inputFiles = await roleInputFiles(workspace, [...task.inputs, ...task.context.interfaces, ...(reviewer ? [...task.artifacts, ...task.evidence.map(e => e.source)] : [])], input.controller.signal);
    const fileTools = await createWorkspaceTools({ workspace, readPaths: reads, writePaths: reviewer ? [] : task.ownership.writePaths,
      ...(designReviewBudget ? { compactFullJsonReads: true } : {}) });
    const hostTools = await options.hostTools?.({ role: input.role, taskId: task.taskId, workspace, signal: input.controller.signal, childEnv: roleToolEnvironment() }) ?? [];
    const scoped = fileTools.filter(tool => task.context.tools.includes(tool.name));
    for (const host of hostTools) {
      if (!task.context.tools.includes(host.tool.name) || (reviewer && !host.readOnly)) continue;
      if (['read', 'write', 'edit'].includes(host.tool.name) || scoped.some(tool => tool.name === host.tool.name)) throw new Error('Host tool name conflicts with a scoped tool.');
      scoped.push(host.tool);
    }
    const tools = scoped.map(tool => ({ ...tool, async execute(id, args, signal, onUpdate, ctx) {
      const combined = AbortSignal.any([input.controller.signal, ...(signal ? [signal] : [])]);
      combined.throwIfAborted();
      await options.beforeTool?.(input, combined);
      combined.throwIfAborted();
      const result = await tool.execute(id, args, combined, onUpdate, ctx);
      if (options.afterFileWrite && (tool.name === 'write' || tool.name === 'edit') && !('isError' in result && result.isError)) {
        combined.throwIfAborted();
        const feedback = await options.afterFileWrite(input, { name: tool.name, path: (args as { path: string }).path }, combined);
        combined.throwIfAborted();
        if (feedback) return { ...result, content: [...result.content, { type: 'text' as const, text: feedback }] };
      }
      return result;
    } } as ToolDefinition));
    const snapshot = await input.controller.read();
    const packet = freeze({ role: input.role, contextId, taskId: task.taskId, objective: task.objective, specVersion: requirement.specVersion,
      acceptance: requirement.acceptance.filter(item => task.acceptanceIds.includes(item.acceptanceId)),
      inputs: reviewer ? [...task.inputs, ...task.artifacts] : task.inputs, inputFiles,
      rules: task.context.rules, interfaces: task.context.interfaces, knownFailures: task.context.knownFailures,
      tools: tools.map(tool => tool.name), ownership: { readPaths: reads, writePaths: reviewer ? [] : task.ownership.writePaths },
      budget: { ...task.budget, committedMicroCny: snapshot.ledger.entries.filter(e => e.taskId === task.taskId).reduce((total, e) => total + e.reservedMicroCny + e.settledMicroCny, 0),
        ...(validation ? { validationCase: { ...validation } } : authority!.windowId ? { executionWindow: { windowId: authority!.windowId, deadlineAt: authority!.deadlineAt,
          effectiveLimitMicroCny: authority!.effectiveLimitMicroCny, taskGrantMicroCny: authority!.taskGrantMicroCny } } : {}) },
      ...(reviewer ? { evidence: task.evidence, ...(input.codingConcernReview ? { codingConcernReview: structuredClone(input.codingConcernReview) } : {}),
        ...(input.designConcernReview ? { designConcernReview: structuredClone(input.designConcernReview) } : {}) } : { outputs: task.outputs }) });
    const recoveryBudget = { controller: input.controller, original: snapshot, task, authority: authority!, floor: authorFloor!,
      maxOutputTokens: authorLimits.design!, estimate: options.estimatedMaxCostMicroCny, reviewReserve: true as const, failureCode: 'author_review_reserve' as const };
    const session = await (options.sessionFactory ?? createPiSession)({
      workspace, stateDirectory: input.stateDirectory, tools,
      systemPrompt: (input.purpose === 'planning'
        ? `You are the Cosmos task planner. Follow the host-supplied output schema and use only the host policies supplied in the prompt. Return only a JSON object without Markdown. When policies have policyId, use this shape:\n${planningJsonExample(true)}\npolicyId is required, must name a supplied policy, must match its role, and each policyId may be selected at most once. Otherwise use this shape:\n${planningJsonExample(false)}\nSelect each role at most once and do not add policyId. Cover every confirmed acceptance ID. Each dependency names a task in this plan. The host binds its declared output versions as inputs after the dependency passes. You cannot choose tools, paths, budget, acceptance steps, evidence or task state. This is a proposal, not a claim that the game passes.`
        : reviewer
        ? input.designConcernReview ? `You are the independent Cosmos design reviewer. ${designConcernReviewProtocol}` : input.codingConcernReview ? `You are the independent Cosmos reviewer. Read only the fixed requirements, artifacts and host evidence. ${codingConcernReviewProtocol} Your verdict is a proposal checked by the host.` : 'You are the independent Cosmos reviewer. Read only the fixed requirements, artifacts and host evidence. Return JSON {verdict:"approved"|"changes_requested",inputVersions:all packet inputs,evidenceIds:host evidence IDs,findings:string[]}. findings contains only unresolved actionable defects, not successful checks, positive observations or explanations. approved requires findings:[]; changes_requested requires at least one such defect with the unmet requirement and actual versus expected behavior. Do not hide actual defects to produce an empty array. Return only these JSON fields. Your verdict is a proposal checked by the host. Do not infer success from author claims.'
        : `You are Cosmos role ${input.role}. Work only within the declared scope. Requirements are fixed. Write deliverables incrementally in small complete chunks using the declared tools; finish each file or section before starting the next. Keep each tool call bounded instead of placing the whole deliverable in one large call. Preserve every required action, audio item and acceptance criterion. Return JSON {summary:string,remaining:string[],uncertainty:string[]}. remaining contains only unfinished required deliverables owned by this role. uncertainty contains only unresolved facts that block this role's assigned acceptance. Pending host capture, build, verification or independent review, other roles not yet running, and future choices permitted by the requirements are not your unfinished work: mention them in summary only. When this role's deliverable is complete, return empty arrays; never hide a real defect or unresolved requirement to obtain empty arrays. You are not the task planner unless explicitly assigned planning. Model text is a proposal; the host captures outputs and verifies evidence.`) + (authorRequestLimit === undefined ? '' : `\n\nThis author session permits at most ${maxRequests} model requests (model response rounds, not files or individual tool calls). Reserve requests for complete self-checks and the final JSON handoff. If defects remain, report the real unfinished work in remaining; never claim completion solely to finish within this limit.`) + `\n\n${inputFilesProtocol}`,
      context: JSON.stringify(packet), thinkingLevel: (purpose === 'author' && !validation && input.role !== 'reviewer' ? authorThinking[input.role] : undefined) ?? options.thinkingLevel ?? 'low', env: options.env,
      ...(purpose === 'planning' ? { jsonOutput: true } : {}),
      maxOutputTokens: designReviewBudget ? 8192 : validation?.maxOutputTokens ?? (input.role !== 'reviewer' && input.purpose !== 'planning' ? authorLimits[input.role] ?? options.maxOutputTokens : options.maxOutputTokens),
      maxRequests, requestTimeoutMs: input.role === 'coding' && purpose === 'author' ? codingTimeout ?? options.requestTimeoutMs : options.requestTimeoutMs,
      requestWindow: async () => {
        input.controller.signal.throwIfAborted();
        const current = validation ? await input.controller.validationAuthority(task.taskId, purpose) : await input.controller.executionAuthority(task.taskId);
        const original = validation ?? authority!;
        if (current.windowId !== original.windowId || current.deadlineAt !== original.deadlineAt
          || ('caseId' in current && current.caseId !== validation?.caseId)
          || !('executionAllowed' in current ? current.executionAllowed : current.admissionAllowed)) throw new Error('Role request has no current original window authority.');
        input.controller.signal.throwIfAborted();
        return { deadlineAt: Date.parse(current.deadlineAt), cleanupMs: 5000 };
      },
      ...(validation && input.role === 'coding' && purpose === 'author' ? { requestOutputLimit: async (request: Parameters<NonNullable<PiSessionOptions['requestOutputLimit']>>[0]) => {
        input.controller.signal.throwIfAborted();
        const current = await input.controller.validationAuthority(task.taskId, purpose);
        input.controller.signal.throwIfAborted();
        if (!current.admissionAllowed || current.caseId !== validation.caseId || current.windowId !== validation.windowId
          || current.deadlineAt !== validation.deadlineAt || current.maxOutputTokens !== validation.maxOutputTokens
          || request.maxOutputTokens > current.maxOutputTokens || !Number.isSafeInteger(current.remainingMicroCny) || current.remainingMicroCny <= 0) {
          throw new Error('Coding output limit has no current original validation authority.');
        }
        const affordable = (cap: number) => validationReservation({ ...request, maxOutputTokens: cap }) <= current.remainingMicroCny;
        if (affordable(request.maxOutputTokens)) return request.maxOutputTokens;
        let lower = Math.min(4096, request.maxOutputTokens), upper = request.maxOutputTokens;
        if (!affordable(lower)) throw new Error('Validation budget cannot afford the minimum coding output limit.');
        while (lower < upper) {
          const middle = lower + Math.ceil((upper - lower) / 2);
          if (affordable(middle)) lower = middle;
          else upper = middle - 1;
        }
        return lower;
      }, requestCompaction: async request => {
        input.controller.signal.throwIfAborted();
        const current = await input.controller.validationAuthority(task.taskId, purpose);
        input.controller.signal.throwIfAborted();
        if (!current.admissionAllowed || current.caseId !== validation.caseId || current.windowId !== validation.windowId
          || current.deadlineAt !== validation.deadlineAt || current.maxOutputTokens !== validation.maxOutputTokens
          || request.maxOutputTokens !== current.maxOutputTokens) throw new Error('Compaction has no current original validation authority.');
        return request.inputBytes >= 131072
          && validationReservation({ ...request, maxOutputTokens: Math.min(4096, request.maxOutputTokens) }) > current.remainingMicroCny;
      } } : {}),
      ...(authorFloor === undefined ? {} : { requestOutputLimit: authorBudgetOutputLimit({ controller: input.controller, original: snapshot,
        task, authority: authority!, floor: authorFloor, maxOutputTokens: authorLimits[input.role as AuthorRole]!, estimate: options.estimatedMaxCostMicroCny, ...(reviewReserve ? { reviewReserve: true, failureCode: 'author_review_reserve' } : {}) }) }),
      ...(designReviewBudget ? { requestOutputLimit: authorBudgetOutputLimit({ controller: input.controller, original: snapshot,
        task, authority: authority!, floor: 4096, maxOutputTokens: 8192, estimate: options.estimatedMaxCostMicroCny, ...(recoveryPolicy ? { failureCode: 'review_output_budget' } : {}) }) } : {}),
      ...(designCompaction ? authorBudgetCompaction({ controller: input.controller, original: snapshot, task, authority: authority!,
        floor: authorFloor!, maxOutputTokens: authorLimits.design!, estimate: options.estimatedMaxCostMicroCny, ...(reviewReserve ? { reviewReserve: true, failureCode: 'author_review_reserve' } : {}) }) : {}),
      ...(reviewReserve ? { readonlyMaxOutputTokens: 4096 as const, ...(finalizationPolicy ? { ordinaryDesignFinalizationPolicy: finalizationPolicy } : {}) } : {}),
      estimatedMaxCostMicroCny: options.estimatedMaxCostMicroCny,
      compactionKeepRecentTokens: designCompaction ? 8000 : options.compactionKeepRecentTokens,
      budget: createRoleBudget({ controller: input.controller, taskId: task.taskId, evidenceDirectory: input.stateDirectory,
        ...(reviewReserve ? { authorReviewReserve: { runId: snapshot.run.runId, ledgerId: snapshot.ledger.ledgerId, allocationMicroCny: task.budget.allocationMicroCny,
          requireAuthority: () => requireOriginalAuthorBudget(recoveryBudget) } } : {}),
        ...(authorFloor === undefined && !designReviewBudget ? {} : { recordRequest: true }),
        ...(validation ? { validation: { caseId: validation.caseId, windowId: validation.windowId, purpose } } : {}) }),
    });
    return { contextId, actorId, prompt: (text, supplied = {}) => session.prompt(text, { images: supplied.images, signal: AbortSignal.any([input.controller.signal, ...(supplied.signal ? [supplied.signal] : [])]) }),
      ...(session.budgetFinalization && session.finalizeBudget ? { budgetFinalization: async (error: unknown) => { input.controller.signal.throwIfAborted(); return session.budgetFinalization!(error); },
        finalizeBudget: (error: unknown, text: string, supplied: { signal?: AbortSignal } = {}) => session.finalizeBudget!(error, text, { signal: AbortSignal.any([input.controller.signal, ...(supplied.signal ? [supplied.signal] : [])]) }) } : {}),
      ...(session.readonlyPrompt ? { readonlyPrompt: (text: string, supplied: { signal?: AbortSignal } = {}) => session.readonlyPrompt!(text, { signal: AbortSignal.any([input.controller.signal, ...(supplied.signal ? [supplied.signal] : [])]) }) } : {}),
      ...(session.compact ? { compact: (signal?: AbortSignal) => session.compact!(AbortSignal.any([input.controller.signal, ...(signal ? [signal] : [])])) } : {}), close: () => session.close() };
  };
}
