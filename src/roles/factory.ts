import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { ImageContent } from '@earendil-works/pi-ai';
import type { ArtFrameRead, BeforeFileWrite, WriteCommitted } from '../providers/workspace-tools.ts';
import { createPiSession, createWorkspaceTools } from '../providers/pi.ts';
import type { PiBudgetFinalizationSource, PiSessionOptions, PiVerdictCorrection } from '../providers/pi.ts';
import { validateTask } from '../contracts/index.ts';
import { sameValue } from '../contracts/validation.ts';
import type { ArtifactReference, TaskContract } from '../contracts/index.ts';
import type { RunController } from '../runtime/run.ts';
import { createRoleBudget } from './provider-budget.ts';
import { freeze } from './requirements.ts';
import { validateExecutionInput, validateExecutionRequirement } from './execution-input.ts';
import type { ExecutionRequirement } from './execution-input.ts';
import { requireValidationScope } from '../runtime/validation-scope.ts';
import type { ValidationExecutionBinding } from '../runtime/validation-scope.ts';
import { validationReservation, validationRole } from '../runtime/validation-validation.ts';
import { requireOriginalTask } from '../runtime/recovery/task-journal.ts';
import { ORDINARY_PLAN_FILE } from '../runtime/entrypoint-acceptance-plan.ts';
import type { SuppliedDesignHandoff } from '../runtime/supplied-design.ts';
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
  /** Only the same live ordinary reviewer can recognize its own exhausted turn. */
  reviewVerdictCorrection?(error: unknown): PiVerdictCorrection | undefined;
  /** Host-only, idle-session boundary; native pi owns summarization and billing. */
  budgetFinalization?(error: unknown): Promise<PiBudgetFinalizationSource | null>;
  finalizeBudget?(error: unknown, text: string, options?: { signal?: AbortSignal }): Promise<{ text: string }>;
  compact?(signal?: AbortSignal): Promise<unknown>;
  close(): Promise<void>;
}
export interface RoleInput {
  role: Role;
  purpose?: 'planning';
  /** The generic replacement for a design task cannot inherit its budget follow-up. */
  disableDesignFinalization?: true;
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
  /** Only preserved-draft validation failures may extend the ordinary design compaction boundary. */
  ordinaryDesignRejectedWriteCompaction?: true;
  ordinaryDesignSuccessfulWriteCompaction?: true;
  ordinaryDesignBudgetPolicy?: 'review-reserve/1';
  ordinaryDesignFinalizationPolicy?: 'budget-followup/1';
  ordinaryDesignRevisionPolicy?: OrdinaryDesignRevisionPolicy;
  /** Trusted ordinary design reviewer selection; compact complete JSON reads and quote down to the 4096 floor. */
  ordinaryDesignReviewBudget?: (task: Readonly<TaskContract>) => boolean;
  ordinaryCodingReviewImageQuote?: (task: Readonly<TaskContract>) => boolean;
  /** Check the pinned operator inputs and staged author bytes before projecting the fixed handoff. */
  ordinarySuppliedDesign?: (input: Readonly<RoleInput>) => Promise<SuppliedDesignHandoff>;
  /** Trusted host selects an authenticated draft or the fixed same-run design revision. */
  ordinaryDesignRevisionJsonReads?: (task: Readonly<TaskContract>) => Promise<boolean | 'reviewed-draft'>;
  /** Explicit trusted reviewer ceiling; omitted callers retain the original 8192 cap. */
  ordinaryDesignReviewMaxOutputTokens?: 16384;
  /** Trusted ordinary host verifies complete fixed sources before planning displays only acceptance IDs. */
  ordinaryPlanningAcceptanceIndex?: (input: Readonly<RoleInput>) => Promise<void>;
  /** Trusted ordinary planning opt-in; preserve 8192 when affordable, otherwise select down to this new floor. */
  ordinaryPlanningOutputFloor?: 4096;
  maxRequests: number;
  /** Author overrides only; planning, review and fixed validation retain maxRequests. */
  authorMaxRequests?: Partial<Record<AuthorRole, number>>;
  requestTimeoutMs: number;
  /** Trusted coding author cap; planning and reviewers retain requestTimeoutMs. */
  codingAuthorRequestTimeoutMs?: number;
  /** Trusted non-validation design author cap; planning and reviewers retain requestTimeoutMs. */
  designAuthorRequestTimeoutMs?: number;
  /** Trusted non-validation art author cap; planning and reviewers retain requestTimeoutMs. */
  artAuthorRequestTimeoutMs?: number;
  /** Select the independently approved design bound to this ordinary art task. */
  ordinaryArtDesignInput?: (task: Readonly<TaskContract>) => ArtifactReference;
  ordinaryArtFrameRead?: (input: Readonly<RoleInput>) => ArtFrameRead;
  beforeArtFileWrite?: (input: Readonly<RoleInput>) => BeforeFileWrite;
  estimatedMaxCostMicroCny: PiSessionOptions['estimatedMaxCostMicroCny'];
  thinkingLevel?: PiSessionOptions['thinkingLevel'];
  /** Author overrides only; planning, review and fixed validation retain thinkingLevel. */
  authorThinkingLevel?: Partial<Record<AuthorRole, NonNullable<PiSessionOptions['thinkingLevel']>>>;
  env?: PiSessionOptions['env'];
  compactionKeepRecentTokens?: PiSessionOptions['compactionKeepRecentTokens'];
  /** Trusted host integrations only. Mutating tools are never supplied to a reviewer. */
  hostTools?: (input: Readonly<{ role: Role; taskId: string; workspace: string; signal: AbortSignal; childEnv: NodeJS.ProcessEnv; onWriteCommitted?: WriteCommitted }>) => Promise<{ tool: ToolDefinition; readOnly: boolean }[]>;
  sessionFactory?: (options: PiSessionOptions) => Promise<RoleSession>;
  /** Optional trusted host admission immediately before an existing scoped tool. */
  beforeTool?: (input: Readonly<RoleInput>, signal: AbortSignal) => Promise<void>;
  /** Advisory host feedback after a scoped file write succeeds; never grants file access. */
  beforeDesignFileWrite?: (input: Readonly<RoleInput>) => BeforeFileWrite;
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
  if (options.ordinaryDesignSuccessfulWriteCompaction !== undefined && (options.ordinaryDesignSuccessfulWriteCompaction !== true
    || !ordinaryDesignCompaction || recoveryPolicy !== 'review-reserve/1')) throw new Error('Successful-write compaction requires ordinary design review-reserved compaction.');
  if (options.ordinaryDesignRejectedWriteCompaction !== undefined && (options.ordinaryDesignRejectedWriteCompaction !== true
    || !ordinaryDesignCompaction || !options.beforeDesignFileWrite)) throw new Error('Rejected-write compaction requires ordinary design budget compaction and draft protection.');
  if (recoveryPolicy !== undefined && (recoveryPolicy !== 'review-reserve/1' || !ordinaryDesignCompaction)) throw new Error('Invalid ordinaryDesignBudgetPolicy.');
  const authorRequestLimits = { ...options.authorMaxRequests };
  const finalizationPolicy = options.ordinaryDesignFinalizationPolicy;
  if (finalizationPolicy !== undefined && (finalizationPolicy !== 'budget-followup/1' || recoveryPolicy !== 'review-reserve/1' || ![32, 64].includes(authorRequestLimits.design!))) throw new Error('Invalid ordinaryDesignFinalizationPolicy.');
  const ordinaryDesignReviewBudget = options.ordinaryDesignReviewBudget;
  const ordinaryDesignRevisionJsonReads = options.ordinaryDesignRevisionJsonReads;
  const checkSuppliedHandoff = options.ordinarySuppliedDesign;
  if (ordinaryDesignRevisionJsonReads !== undefined && typeof ordinaryDesignRevisionJsonReads !== 'function') throw new Error('ordinaryDesignRevisionJsonReads requires a trusted selector.');
  if (ordinaryDesignReviewBudget !== undefined && (typeof ordinaryDesignReviewBudget !== 'function' || options.maxOutputTokens !== 8192)) {
    throw new Error('ordinaryDesignReviewBudget requires a trusted selector and the original 8192 output cap.');
  }
  const designReviewMaxOutputTokens = options.ordinaryDesignReviewMaxOutputTokens ?? 8192;
  if (options.ordinaryDesignReviewMaxOutputTokens !== undefined && (options.ordinaryDesignReviewMaxOutputTokens !== 16384 || !ordinaryDesignReviewBudget)) throw new Error('ordinaryDesignReviewMaxOutputTokens requires the trusted reviewer selector and the explicit 16384 cap.');
  const planningFloor = options.ordinaryPlanningOutputFloor;
  if (planningFloor !== undefined && (planningFloor !== 4096 || options.maxOutputTokens !== 8192)) throw new Error('ordinaryPlanningOutputFloor requires the fixed 4096 floor and original 8192 output cap.');
  if (Object.entries(authorRequestLimits).some(([role, limit]) => !['cosmos', 'design', 'coding', 'art'].includes(role) || !Number.isSafeInteger(limit) || limit <= 0)) throw new Error('authorMaxRequests requires valid author roles and positive safe integers.');
  const authorThinking = { ...options.authorThinkingLevel };
  if (Object.entries(authorThinking).some(([role, level]) => !['cosmos', 'design', 'coding', 'art'].includes(role) || !['off', 'low', 'high', 'max'].includes(level))) throw new Error('authorThinkingLevel requires valid author roles and supported thinking levels.');
  const codingTimeout = options.codingAuthorRequestTimeoutMs;
  if (codingTimeout !== undefined && (!Number.isSafeInteger(codingTimeout) || codingTimeout <= 0)) throw new Error('codingAuthorRequestTimeoutMs requires a positive safe integer.');
  const designTimeout = options.designAuthorRequestTimeoutMs;
  if (designTimeout !== undefined && (!Number.isSafeInteger(designTimeout) || designTimeout <= 0)) throw new Error('designAuthorRequestTimeoutMs requires a positive safe integer.');
  const artTimeout = options.artAuthorRequestTimeoutMs;
  if (artTimeout !== undefined && (!Number.isSafeInteger(artTimeout) || artTimeout <= 0)) throw new Error('artAuthorRequestTimeoutMs requires a positive safe integer.');
  const authorTimeouts: Partial<Record<Role, number>> = { coding: codingTimeout, design: designTimeout, art: artTimeout };
  const ordinaryArtDesignInput = options.ordinaryArtDesignInput;
  if (options.ordinaryPlanningAcceptanceIndex !== undefined && typeof options.ordinaryPlanningAcceptanceIndex !== 'function') throw new Error('ordinaryPlanningAcceptanceIndex requires a trusted source verifier.');
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
    const planningOutputBudget = planningFloor !== undefined && purpose === 'planning' && input.role === 'cosmos' && !input.validation;
    const planningAcceptanceIndex = !!options.ordinaryPlanningAcceptanceIndex && purpose === 'planning' && input.role === 'cosmos' && !input.validation;
    if (planningAcceptanceIndex) await options.ordinaryPlanningAcceptanceIndex!({ ...input, task, requirement });
    let designReviewBudget = false;
    if (ordinaryDesignReviewBudget && input.role === 'reviewer' && !input.purpose && !input.validation) {
      designReviewBudget = ordinaryDesignReviewBudget(freeze(structuredClone(task)));
      if (typeof designReviewBudget !== 'boolean') throw new Error('ordinaryDesignReviewBudget must return a boolean.');
    }
    let designRevisionJsonReads: boolean | 'reviewed-draft' = false;
    if (ordinaryDesignRevisionJsonReads && input.role === 'design' && !input.purpose && !input.validation) {
      designRevisionJsonReads = await ordinaryDesignRevisionJsonReads(freeze(structuredClone(task)));
      if (typeof designRevisionJsonReads !== 'boolean' && designRevisionJsonReads !== 'reviewed-draft') throw new Error('Invalid ordinaryDesignRevisionJsonReads selection.');
    }
    const readOnlyDesign = input.role === 'design' && task.context.tools.includes('validate-game-design') && !task.context.tools.includes('write');
    const reviewedDraftAuthor = designRevisionJsonReads === 'reviewed-draft';
    const validation = input.validation ? await input.controller.validationAuthority(task.taskId, purpose) : undefined;
    const authorRequestLimit = purpose === 'author' && !validation && input.role !== 'reviewer' ? authorRequestLimits[input.role] : undefined;
    const authorFloor = purpose === 'author' && !validation && input.role !== 'reviewer' ? authorFloors[input.role] : undefined;
    const designCompaction = ordinaryDesignCompaction && purpose === 'author' && input.role === 'design' && !validation;
    const reviewReserve = !!(recoveryPolicy && designCompaction);
    const maxRequests = authorRequestLimit ?? options.maxRequests;
    const authorTimeout = purpose === 'author' && (!validation || input.role === 'coding') ? authorTimeouts[input.role] : undefined;
    const authority = validation ? undefined : await input.controller.executionAuthority(task.taskId);
    const codingReviewImageQuote = purpose === 'reviewer' && !validation && !authority?.windowId
      && options.ordinaryCodingReviewImageQuote?.(freeze(structuredClone(task))) === true;
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
    const handoff = checkSuppliedHandoff && purpose === 'author' && input.role === 'design' && !input.validation
      && sameValue(task.context.tools, ['read', 'validate-game-design']) ? await checkSuppliedHandoff(input) : undefined;
    const reviewer = input.role === 'reviewer';
    const contextId = reviewer ? `review-${randomUUID()}` : task.context.contextId;
    const actorId = reviewer ? `reviewer-${randomUUID()}` : task.authorId;
    const reads = handoff ? [] : reviewer ? [...task.inputs, ...task.artifacts, ...task.context.interfaces, ...task.evidence.map(e => e.source)].map(ref => ref.location) : [...task.ownership.readOnlyPaths, ...task.ownership.writePaths, ...task.inputs.map(ref => ref.location), ...task.context.interfaces.map(ref => ref.location)];
    const writePaths = reviewer || handoff ? [] : task.ownership.writePaths;
    const inputFiles = handoff ? [] : await roleInputFiles(workspace, [...task.inputs, ...task.context.interfaces, ...(reviewer ? [...task.artifacts, ...task.evidence.map(e => e.source)] : [])], input.controller.signal);
    const committedWrites = new Map<string, string[]>();
    const onWriteCommitted: WriteCommitted | undefined = designCompaction && options.ordinaryDesignSuccessfulWriteCompaction ? (id, path) => {
      const owned = relative(workspace, path);
      if (!owned || isAbsolute(owned) || owned === '..' || owned.startsWith(`..${sep}`)
        || !task.ownership.writePaths.some(scope => { const rel = relative(resolve(workspace, scope), path);
          return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`); })) throw new Error('Successful write is outside its original task.');
      committedWrites.set(id, [...new Set([...(committedWrites.get(id) ?? []), owned.replaceAll('\\', '/')])]);
    } : undefined;
    const planReadPaths = designReviewBudget ? task.artifacts.filter(ref =>
      task.outputs.some(output => output.schema === 'game-design/2' && output.destination === ref.location)).map(ref => ref.location + '/' + ORDINARY_PLAN_FILE)
      : [];
    const rules = [...task.context.rules];
    let artFrameRead: ArtFrameRead | undefined, beforeArtFileWrite: BeforeFileWrite | undefined;
    if (ordinaryArtDesignInput && purpose === 'author' && input.role === 'art' && !validation) {
      const artDesign = ordinaryArtDesignInput(task);
      if (!task.inputs.some(ref => sameValue(ref, artDesign))) throw new Error('Art plan display requires the selected design input.');
      const planPath = artDesign.location + '/' + ORDINARY_PLAN_FILE;
      planReadPaths.push(planPath);
      artFrameRead = options.ordinaryArtFrameRead?.(input);
      beforeArtFileWrite = options.beforeArtFileWrite?.(input);
      if (beforeArtFileWrite) rules.push('When revising one asset in a valid media draft, use edit with a unique exact text match. Keep existing character IDs and their design states and existing audio IDs in each saved version.');
      rules.push(`Start with ${artDesign.location}/_cosmos/design.json for the required characters, states, visuals, audio triggers and loops. ${artFrameRead
        ? `Read ${planPath} with artFrames:[] for the compact pixel-pattern index. Check representative steps together (up to eight per read). Use {stepId,characterId,state,background?:{characterId,state}} for a visible item. An all-minus mask limits only the specified colour. When the scene calls for a removed item, draw just the viewport background using {stepId,background:{characterId,state}}. For a failed check, verify the composition first, then revise the affected asset only if needed. When the roster is complete, the intended compositions pass and the draft meets the design, hand off the existing draft for independent review. Consult raw plan pages for additional context.`
        : `Consult ${planPath} for graphics and audio constraints, including colours and silhouettes. Follow the displayed planOffset to check remaining pages as you work.`} Write completed asset batches to authors/art/media.json promptly, preserving earlier batches when adding the remaining assets. Before handing off, check the full roster against the file. Avoid transcribing the scenario or rereading completed pages.`);
    }
    const fileTools = handoff ? [] : await createWorkspaceTools({ workspace, readPaths: reads, writePaths, planReadPaths,
      artFrameRead, ...(beforeArtFileWrite ? { beforeFileWrite: beforeArtFileWrite } : {}),
      ...(input.role === 'art' ? { planReadPurpose: 'art' } : {}),
      ...(onWriteCommitted ? { onWriteCommitted } : {}),
      ...(input.role === 'design' && !input.purpose && !input.validation && options.beforeDesignFileWrite ? { beforeFileWrite: options.beforeDesignFileWrite(input) } : {}),
      ...(designReviewBudget || designRevisionJsonReads ? { compactFullJsonReads: true } : {}) });
    const hostTools = handoff ? [] : await options.hostTools?.({ role: input.role, taskId: task.taskId, workspace, signal: input.controller.signal, childEnv: roleToolEnvironment(), ...(onWriteCommitted ? { onWriteCommitted } : {}) }) ?? [];
    const scoped = fileTools.filter(tool => task.context.tools.includes(tool.name)).map(tool => (designReviewBudget || designRevisionJsonReads) && tool.name === 'read'
      ? { ...tool, description: (reviewedDraftAuthor ? 'Use offset/limit for the part of the existing draft identified by a finding or an exact edit. For a complete JSON read omit both (or use null when required). Follow any truncation notice when the entire file is needed.\n\n' : `For JSON ${designReviewBudget ? 'review' : 'revision'}, first request the complete file without numeric offset/limit: omit offset and limit when optional; if the tool schema requires them, set both to null (the SDK treats these as omitted). Do not fill in numeric defaults. If the result reports truncation or remaining lines, follow its paging instructions until complete; never treat a partial result as the full file. Keep normal paging for non-JSON files and targeted raw-source reads.\n\n`) + tool.description }
      : tool);
    for (const host of hostTools) {
      if (!task.context.tools.includes(host.tool.name) || (reviewer && !host.readOnly)) continue;
      if (['read', 'write', 'edit'].includes(host.tool.name) || scoped.some(tool => tool.name === host.tool.name)) throw new Error('Host tool name conflicts with a scoped tool.');
      scoped.push(host.tool);
    }
    const tools = scoped.map(tool => ({ ...tool, async execute(id, args, signal, onUpdate, ctx) {
      committedWrites.delete(id);
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
    const acceptance = requirement.acceptance.filter(item => task.acceptanceIds.includes(item.acceptanceId));
    const packet = freeze({ role: input.role, contextId, taskId: task.taskId,
      objective: handoff ? 'Hand off the two existing operator-supplied files identified by the host.' : task.objective, specVersion: requirement.specVersion,
      acceptance: planningAcceptanceIndex || handoff ? acceptance.map(({ acceptanceId }) => ({ acceptanceId })) : acceptance,
      inputs: reviewer ? [...task.inputs, ...task.artifacts] : task.inputs, inputFiles,
      rules: handoff ? ['Use the verified input identity, file digests and structural counts in suppliedDesignHandoff. Report any discrepancy that prevents handing off the listed pair.'] : rules,
      interfaces: task.context.interfaces, knownFailures: task.context.knownFailures, ...(handoff ? { suppliedDesignHandoff: handoff } : {}),
      tools: tools.map(tool => tool.name), ownership: { readPaths: reads, writePaths },
      budget: { ...task.budget, committedMicroCny: snapshot.ledger.entries.filter(e => e.taskId === task.taskId).reduce((total, e) => total + e.reservedMicroCny + e.settledMicroCny, 0),
        ...(validation ? { validationCase: { ...validation } } : authority!.windowId ? { executionWindow: { windowId: authority!.windowId, deadlineAt: authority!.deadlineAt,
          effectiveLimitMicroCny: authority!.effectiveLimitMicroCny, taskGrantMicroCny: authority!.taskGrantMicroCny } } : {}) },
      ...(reviewer ? { evidence: task.evidence, ...(input.codingConcernReview ? { codingConcernReview: structuredClone(input.codingConcernReview) } : {}),
        ...(input.designConcernReview ? { designConcernReview: structuredClone(input.designConcernReview) } : {}) } : { outputs: task.outputs }) });
    const recoveryBudget = { controller: input.controller, original: snapshot, task, authority: authority!, floor: authorFloor!,
      maxOutputTokens: authorLimits.design!, estimate: options.estimatedMaxCostMicroCny, reviewReserve: true as const, failureCode: 'author_review_reserve' as const };
    const session = await (options.sessionFactory ?? createPiSession)({
      workspace, stateDirectory: input.stateDirectory, tools,
      ...(onWriteCommitted ? { successfulWriteCompaction: {
        takeWrites: () => { const writes = new Map(committedWrites); committedWrites.clear(); return writes; },
        requireAuthority: async () => {
          await requireOriginalAuthorBudget(recoveryBudget);
          const current = await input.controller.read();
          return !current.ledger.entries.some(row => row.unknown || row.reservedMicroCny || !['settled', 'cancelled'].includes(row.status));
        },
      } } : {}),
      systemPrompt: handoff ? 'You are the Cosmos design handoff author. The host checked the two staged files against the pinned operator source and original confirmation. Use the suppliedDesignHandoff facts to identify the files you are handing off. Return one JSON object {summary:string,remaining:string[],uncertainty:string[]}. Report every unfinished handoff item or blocking uncertainty you identify. Use empty arrays when the handoff is complete. The independent reviewer evaluates semantic coverage after fresh capture. Claim only the structural and identity checks supported by this packet.'
        : (input.purpose === 'planning'
        ? `You are the Cosmos task planner. Follow the host-supplied output schema and use only the host policies supplied in the prompt. Return only a JSON object without Markdown. When policies have policyId, use this shape:\n${planningJsonExample(true)}\npolicyId is required, must name a supplied policy, must match its role, and each policyId may be selected at most once. Otherwise use this shape:\n${planningJsonExample(false)}\nSelect each role at most once and do not add policyId. Cover every confirmed acceptance ID. Each dependency names a task in this plan. The host binds its declared output versions as inputs after the dependency passes. You cannot choose tools, paths, budget, acceptance steps, evidence or task state. This is a proposal, not a claim that the game passes.`
        : reviewer
        ? input.designConcernReview ? `You are the independent Cosmos design reviewer. ${designConcernReviewProtocol}` : input.codingConcernReview ? `You are the independent Cosmos reviewer. Read only the fixed requirements, artifacts and host evidence. ${codingConcernReviewProtocol} Your verdict is a proposal checked by the host.` : 'You are the independent Cosmos reviewer. Read only the fixed requirements, artifacts and host evidence. Return JSON {verdict:"approved"|"changes_requested",inputVersions:all packet inputs,evidenceIds:host evidence IDs,findings:string[]}. findings contains only unresolved actionable defects, not successful checks, positive observations or explanations. approved requires findings:[]; changes_requested requires at least one such defect with the unmet requirement and actual versus expected behavior. Do not hide actual defects to produce an empty array. Return only these JSON fields. Your verdict is a proposal checked by the host. Do not infer success from author claims.'
        : `You are Cosmos role ${input.role}. Work only within the declared scope. Requirements are fixed. ${readOnlyDesign ? 'Read the fixed authors/design/design.json and authors/design/acceptance-plan.json. Use validate-game-design and report coverage, omissions and uncertainty against the complete confirmation. Hand off the existing files unchanged.' : reviewedDraftAuthor ? 'Revise the existing drafts with bounded changes to the affected sections identified from the findings and requirements.' : 'Write deliverables incrementally in small complete chunks using the declared tools; finish each file or section before starting the next.'} Keep each tool call bounded instead of placing the whole deliverable in one large call. Preserve every required action, audio item and acceptance criterion. Return JSON {summary:string,remaining:string[],uncertainty:string[]}. remaining contains only unfinished required deliverables owned by this role. uncertainty contains only unresolved facts that block this role's assigned acceptance. Pending host capture, build, verification or independent review, other roles not yet running, and future choices permitted by the requirements are not your unfinished work: mention them in summary only. When this role's deliverable is complete, return empty arrays; never hide a real defect or unresolved requirement to obtain empty arrays. You are not the task planner unless explicitly assigned planning. Model text is a proposal; the host captures outputs and verifies evidence.`) + (authorRequestLimit === undefined ? '' : `\n\nThis author session permits at most ${maxRequests} model requests (model response rounds, not files or individual tool calls). Reserve requests for complete self-checks and the final JSON handoff. If defects remain, report the real unfinished work in remaining; never claim completion solely to finish within this limit.`) + (planningAcceptanceIndex ? '\n\nPlanning acceptance is an exact ID index. Read every complete fixed requirement source at the exact version and location in inputs/inputFiles before producing the plan; continue any partial read until complete. Preserve all descriptions, steps, expected outcomes, evidence kinds, brief, questions, answers and experience criteria from those sources. Do not infer missing content from IDs.' : '') + `\n\n${inputFilesProtocol}`,
      context: JSON.stringify(packet), thinkingLevel: (purpose === 'author' && !validation && input.role !== 'reviewer' ? authorThinking[input.role] : undefined) ?? options.thinkingLevel ?? 'low', env: options.env,
      ...(purpose === 'planning' ? { jsonOutput: true } : {}),
      maxOutputTokens: designReviewBudget ? designReviewMaxOutputTokens : planningOutputBudget ? 8192 : validation?.maxOutputTokens ?? (input.role !== 'reviewer' && input.purpose !== 'planning' ? authorLimits[input.role] ?? options.maxOutputTokens : options.maxOutputTokens),
      maxRequests, requestTimeoutMs: authorTimeout ?? options.requestTimeoutMs,
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
      ...(designReviewBudget ? { ordinaryDesignReview: true as const, requestOutputLimit: authorBudgetOutputLimit({ controller: input.controller, original: snapshot,
        task, authority: authority!, floor: 4096, maxOutputTokens: designReviewMaxOutputTokens, estimate: options.estimatedMaxCostMicroCny, ...(recoveryPolicy ? { failureCode: 'review_output_budget' } : {}) }) } : {}),
      ...(planningOutputBudget ? { requestOutputLimit: authorBudgetOutputLimit({ controller: input.controller, original: snapshot,
        task, authority: authority!, floor: planningFloor, maxOutputTokens: 8192, estimate: options.estimatedMaxCostMicroCny }) } : {}),
      ...(designCompaction ? authorBudgetCompaction({ controller: input.controller, original: snapshot, task, authority: authority!,
        floor: authorFloor!, maxOutputTokens: authorLimits.design!, estimate: options.estimatedMaxCostMicroCny, ...(reviewReserve ? { reviewReserve: true, failureCode: 'author_review_reserve' } : {}) }) : {}),
      ...(designCompaction && options.ordinaryDesignRejectedWriteCompaction ? { compactRejectedDesignWrites: true as const } : {}),
      ...(reviewReserve ? { readonlyMaxOutputTokens: 4096 as const, ...(finalizationPolicy && !input.disableDesignFinalization ? { ordinaryDesignFinalizationPolicy: finalizationPolicy } : {}) } : {}),
      estimatedMaxCostMicroCny: options.estimatedMaxCostMicroCny,
      ...(codingReviewImageQuote ? { ordinaryCodingReviewImageQuote: true as const } : {}),
      compactionKeepRecentTokens: designCompaction ? 8000 : options.compactionKeepRecentTokens,
      budget: createRoleBudget({ controller: input.controller, taskId: task.taskId, evidenceDirectory: input.stateDirectory,
        ...(codingReviewImageQuote ? { cancelUnsentImageAdmission: true } : {}),
        ...(reviewReserve ? { authorReviewReserve: { runId: snapshot.run.runId, ledgerId: snapshot.ledger.ledgerId, allocationMicroCny: task.budget.allocationMicroCny,
          requireAuthority: () => requireOriginalAuthorBudget(recoveryBudget) } } : {}),
        ...(authorFloor === undefined && !designReviewBudget && !planningOutputBudget ? {} : { recordRequest: true }),
        ...(validation ? { validation: { caseId: validation.caseId, windowId: validation.windowId, purpose } } : {}) }),
    });
    return { contextId, actorId, prompt: (text, supplied = {}) => session.prompt(text, { images: supplied.images, signal: AbortSignal.any([input.controller.signal, ...(supplied.signal ? [supplied.signal] : [])]) }),
      ...(designReviewBudget && session.reviewVerdictCorrection ? { reviewVerdictCorrection: (error: unknown) => session.reviewVerdictCorrection!(error) } : {}),
      ...(session.budgetFinalization && session.finalizeBudget ? { budgetFinalization: async (error: unknown) => { input.controller.signal.throwIfAborted(); return session.budgetFinalization!(error); },
        finalizeBudget: (error: unknown, text: string, supplied: { signal?: AbortSignal } = {}) => session.finalizeBudget!(error, text, { signal: AbortSignal.any([input.controller.signal, ...(supplied.signal ? [supplied.signal] : [])]) }) } : {}),
      ...(session.readonlyPrompt ? { readonlyPrompt: (text: string, supplied: { signal?: AbortSignal } = {}) => session.readonlyPrompt!(text, { signal: AbortSignal.any([input.controller.signal, ...(supplied.signal ? [supplied.signal] : [])]) }) } : {}),
      ...(session.compact ? { compact: (signal?: AbortSignal) => session.compact!(AbortSignal.any([input.controller.signal, ...(signal ? [signal] : [])])) } : {}), close: () => session.close() };
  };
}
