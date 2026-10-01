import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { ImageContent } from '@earendil-works/pi-ai';
import { createPiSession, createWorkspaceTools } from '../providers/pi.ts';
import type { PiSessionOptions } from '../providers/pi.ts';
import { validateRequirement, validateTask } from '../contracts/index.ts';
import type { RequirementContract, TaskContract } from '../contracts/index.ts';
import type { RunController } from '../runtime/run.ts';
import { createRoleBudget } from './provider-budget.ts';
import { freeze } from './requirements.ts';

export type AuthorRole = 'cosmos' | 'design' | 'coding' | 'art';
export type Role = AuthorRole | 'reviewer';
export interface RoleSession {
  prompt(text: string, options?: { signal?: AbortSignal; images?: ImageContent[] }): Promise<{ text: string }>;
  /** Host-only, idle-session boundary; native pi owns summarization and billing. */
  compact?(signal?: AbortSignal): Promise<unknown>;
  close(): Promise<void>;
}
export interface RoleInput {
  role: Role;
  purpose?: 'planning';
  task: TaskContract;
  requirement: RequirementContract;
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
  maxRequests: number;
  requestTimeoutMs: number;
  estimatedMaxCostMicroCny: PiSessionOptions['estimatedMaxCostMicroCny'];
  thinkingLevel?: PiSessionOptions['thinkingLevel'];
  env?: PiSessionOptions['env'];
  compactionKeepRecentTokens?: PiSessionOptions['compactionKeepRecentTokens'];
  /** Trusted host integrations only. Mutating tools are never supplied to a reviewer. */
  hostTools?: (input: Readonly<{ role: Role; taskId: string; workspace: string; signal: AbortSignal; childEnv: NodeJS.ProcessEnv }>) => Promise<{ tool: ToolDefinition; readOnly: boolean }[]>;
  sessionFactory?: (options: PiSessionOptions) => Promise<RoleSession>;
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
  return async input => {
    input.controller.signal.throwIfAborted();
    const task = structuredClone(input.task), requirement = structuredClone(input.requirement);
    const errors = [...validateTask(task), ...validateRequirement(requirement)];
    if (errors.length || task.specVersion !== requirement.specVersion) throw new Error('Invalid role task or confirmed requirements.');
    const workspace = await realpath(input.workspace);
    assertOwnership(task, workspace);
    const reviewer = input.role === 'reviewer';
    const contextId = reviewer ? `review-${randomUUID()}` : task.context.contextId;
    const actorId = reviewer ? `reviewer-${randomUUID()}` : task.authorId;
    const reads = reviewer ? [...task.inputs, ...task.artifacts, ...task.context.interfaces, ...task.evidence.map(e => e.source)].map(ref => ref.location) : [...task.ownership.readOnlyPaths, ...task.ownership.writePaths, ...task.inputs.map(ref => ref.location), ...task.context.interfaces.map(ref => ref.location)];
    const fileTools = await createWorkspaceTools({ workspace, readPaths: reads, writePaths: reviewer ? [] : task.ownership.writePaths });
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
      return tool.execute(id, args, combined, onUpdate, ctx);
    } } as ToolDefinition));
    const snapshot = await input.controller.read();
    const packet = freeze({ role: input.role, contextId, taskId: task.taskId, objective: task.objective, specVersion: requirement.specVersion,
      acceptance: requirement.acceptance.filter(item => task.acceptanceIds.includes(item.acceptanceId)),
      inputs: reviewer ? [...task.inputs, ...task.artifacts] : task.inputs,
      rules: task.context.rules, interfaces: task.context.interfaces, knownFailures: task.context.knownFailures,
      tools: tools.map(tool => tool.name), ownership: { readPaths: reads, writePaths: reviewer ? [] : task.ownership.writePaths },
      budget: { ...task.budget, committedMicroCny: snapshot.ledger.entries.filter(e => e.taskId === task.taskId).reduce((total, e) => total + e.reservedMicroCny + e.settledMicroCny, 0) },
      ...(reviewer ? { evidence: task.evidence } : { outputs: task.outputs }) });
    const session = await (options.sessionFactory ?? createPiSession)({
      workspace, stateDirectory: input.stateDirectory, tools,
      systemPrompt: input.purpose === 'planning'
        ? 'You are the Cosmos task planner. Return only JSON {tasks:[{taskId,role,objective,acceptanceIds,dependsOn}]}. Use only the host policies supplied in the prompt. When a policy has policyId, include that policyId in its task; select each policyId at most once. Otherwise select each role at most once. Cover every confirmed acceptance ID. Each dependency names a task in this plan. The host binds its declared output versions as inputs after the dependency passes. You cannot choose tools, paths, budget, acceptance steps, evidence or task state. This is a proposal, not a claim that the game passes.'
        : reviewer
        ? 'You are the independent Cosmos reviewer. Read only the fixed requirements, artifacts and host evidence. Return JSON {verdict:"approved"|"changes_requested",inputVersions:all packet inputs,evidenceIds:host evidence IDs,findings:string[]}. findings contains only unresolved actionable defects, not successful checks, positive observations or explanations. approved requires findings:[]; changes_requested requires at least one such defect with the unmet requirement and actual versus expected behavior. Do not hide actual defects to produce an empty array. Return only these JSON fields. Your verdict is a proposal checked by the host. Do not infer success from author claims.'
        : `You are Cosmos role ${input.role}. Work only within the declared scope. Requirements are fixed. Write deliverables incrementally in small complete chunks using the declared tools; finish each file or section before starting the next. Keep each tool call bounded instead of placing the whole deliverable in one large call. Preserve every required action, audio item and acceptance criterion. Return JSON {summary:string,remaining:string[],uncertainty:string[]}. remaining contains only unfinished required deliverables owned by this role. uncertainty contains only unresolved facts that block this role's assigned acceptance. Pending host capture, build, verification or independent review, other roles not yet running, and future choices permitted by the requirements are not your unfinished work: mention them in summary only. When this role's deliverable is complete, return empty arrays; never hide a real defect or unresolved requirement to obtain empty arrays. You are not the task planner unless explicitly assigned planning. Model text is a proposal; the host captures outputs and verifies evidence.`,
      context: JSON.stringify(packet), thinkingLevel: options.thinkingLevel ?? 'low', env: options.env,
      maxOutputTokens: input.role !== 'reviewer' && input.purpose !== 'planning' ? authorLimits[input.role] ?? options.maxOutputTokens : options.maxOutputTokens,
      maxRequests: options.maxRequests, requestTimeoutMs: options.requestTimeoutMs,
      estimatedMaxCostMicroCny: options.estimatedMaxCostMicroCny,
      compactionKeepRecentTokens: options.compactionKeepRecentTokens,
      budget: createRoleBudget({ controller: input.controller, taskId: task.taskId, evidenceDirectory: input.stateDirectory }),
    });
    return { contextId, actorId, prompt: (text, supplied = {}) => session.prompt(text, { images: supplied.images, signal: AbortSignal.any([input.controller.signal, ...(supplied.signal ? [supplied.signal] : [])]) }),
      ...(session.compact ? { compact: (signal?: AbortSignal) => session.compact!(AbortSignal.any([input.controller.signal, ...(signal ? [signal] : [])])) } : {}), close: () => session.close() };
  };
}
