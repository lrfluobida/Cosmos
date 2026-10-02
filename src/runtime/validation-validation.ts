import { createHash } from 'node:crypto';
import { pathName } from '../artifacts/paths.ts';
import { sameValue } from '../contracts/validation.ts';
import type { ArtifactReference, TaskContract } from '../contracts/index.ts';
import { evidenceReferences } from '../budget/ledger.ts';
import type { RunSnapshot } from './run-types.ts';
import type { ValidationCaseWindow, ValidationDeclaration, ValidationPurpose, ValidationRequestMetadata, ValidationRole } from './validation-types.ts';

export const VALIDATION_ROLES: readonly ValidationRole[] = ['planning', 'design', 'art', 'coding', 'repair'];
export const validationHash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const validationInputHash = (declaration: ValidationDeclaration) => validationHash(JSON.stringify(declaration.inputs));
const integer = (value: unknown, minimum = 0): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
const sha = (value: unknown, length = 64): value is string => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function fail(message: string): never { throw new Error(`Validation case: ${message}`); }
function fields(value: unknown, keys: string[]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('Unexpected or missing declaration fields.');
}

export function validateValidationDeclaration(value: unknown): asserts value is ValidationDeclaration {
  const d = value as ValidationDeclaration;
  fields(d, ['formatVersion', 'profile', 'caseId', 'sourceModel', 'limits', 'grants', 'outputTokens', 'inputs']);
  if (d.formatVersion !== 'validation-declaration-1' || d.profile !== 'operator_validation' || !/^cos20-[a-z0-9][a-z0-9-]{0,40}$/.test(d.caseId) || d.sourceModel !== 'deepseek-flash') fail('Unsupported profile, consumed legacy case identity or model.');
  fields(d.limits, ['lifetimeMicroCny', 'cumulativeMicroCny', 'incrementalMicroCny', 'durationMs', 'maxRequests', 'maxRepairTasks', 'maxTaskAttempts', 'reviewProtocolCorrections']);
  const l = d.limits;
  if (l.lifetimeMicroCny !== 150_000_000 || l.cumulativeMicroCny !== 30_000_000 || !integer(l.incrementalMicroCny, 1) || l.incrementalMicroCny > 5_000_000
    || !integer(l.durationMs, 1) || l.durationMs > 2_700_000 || !integer(l.maxRequests, 1) || l.maxRequests > 40
    || !integer(l.maxRepairTasks) || l.maxRepairTasks > 1 || l.maxTaskAttempts !== 2 || !integer(l.reviewProtocolCorrections) || l.reviewProtocolCorrections > 1) fail('Limits exceed the fixed validation authorization.');
  fields(d.grants, [...VALIDATION_ROLES]);
  const amounts = { planning: 2_000_000, design: 1_900_000, art: 5_700_000, coding: 7_600_000, repair: 3_800_000 };
  for (const role of VALIDATION_ROLES) {
    const grant = d.grants[role]; fields(grant, ['taskId', 'amountMicroCny']);
    if (grant.taskId !== `${d.caseId}-${role}` || grant.amountMicroCny !== amounts[role]) fail('Grants require the fixed case-owned identities and reviewed role amounts.');
  }
  const total = VALIDATION_ROLES.reduce((sum, role) => sum + d.grants[role].amountMicroCny, 0);
  if (!integer(total, 1) || total > 21_000_000) fail('Declared grants exceed the bounded allocation envelope.');
  fields(d.outputTokens, ['planning', 'design', 'art', 'coding', 'reviewer']);
  if (!sameValue(d.outputTokens, { planning: 4096, design: 16384, art: 65536, coding: 65536, reviewer: 16384 })) fail('Reviewed output policy changed.');
  fields(d.inputs, ['requirements', 'template']); fields(d.inputs.requirements, ['version', 'path', 'sha256']); fields(d.inputs.template, ['sha256', 'files']);
  if (typeof d.inputs.requirements.version !== 'string' || !d.inputs.requirements.version.trim() || !Array.isArray(d.inputs.template.files) || !d.inputs.template.files.length || d.inputs.template.files.length > 256) fail('Missing fixed validation inputs.');
  const files = [d.inputs.requirements, ...d.inputs.template.files];
  for (const file of files) { pathName(file.path); if (!sha(file.sha256)) fail('Invalid fixed input hash.'); }
  for (const file of d.inputs.template.files) fields(file, ['path', 'sha256']);
  if (new Set(files.map(file => file.path.toLowerCase())).size !== files.length || d.inputs.template.sha256 !== validationHash(JSON.stringify(d.inputs.template.files))) fail('Fixed input manifest is ambiguous or changed.');
}

export function currentValidationCase(state: RunSnapshot): ValidationCaseWindow {
  const value = state.validation?.cases.find(item => item.caseId === state.validation!.currentCaseId);
  if (state.formatVersion !== 3 || !value) return fail('Explicit current operator validation profile is required.');
  return value;
}
export function validationRole(window: ValidationCaseWindow, taskId: string): ValidationRole | undefined {
  return VALIDATION_ROLES.find(role => window.quote.declaration.grants[role].taskId === taskId);
}
export function validationUsage(state: RunSnapshot, window: ValidationCaseWindow) {
  const ids = state.requests.filter(record => record.validation?.caseId === window.caseId).map(record => record.requestId);
  const committedMicroCny = state.ledger.entries.reduce((sum, entry) => sum + entry.settledMicroCny + entry.reservedMicroCny, 0);
  const caseCommittedMicroCny = state.ledger.entries.filter(entry => ids.includes(entry.requestId)).reduce((sum, entry) => sum + entry.settledMicroCny + entry.reservedMicroCny, 0);
  return { committedMicroCny, caseCommittedMicroCny, requestsUsed: ids.length };
}
export function validationOutputCap(window: ValidationCaseWindow, taskId: string, purpose: ValidationPurpose): number {
  const role = validationRole(window, taskId), d = window.quote.declaration;
  if (!role || !['planning', 'author', 'reviewer'].includes(purpose) || (role === 'planning') !== (purpose === 'planning')) return fail('Planning purpose cannot borrow another task grant.');
  if (role === 'repair') {
    const source = VALIDATION_ROLES.find(role => d.grants[role].taskId === window.repair?.sourceTaskId);
    if (!source || !['design', 'art', 'coding'].includes(source)) return fail('Semantic repair must be explicitly claimed first.');
    return purpose === 'reviewer' ? d.outputTokens.reviewer : d.outputTokens[source as 'design' | 'art' | 'coding'];
  }
  if (purpose === 'reviewer') return d.outputTokens.reviewer;
  return d.outputTokens[role];
}
export function validationReservation(metadata: Pick<ValidationRequestMetadata, 'maxOutputTokens' | 'inputBytes' | 'hasImages'>): number {
  if (!integer(metadata.maxOutputTokens, 1) || !integer(metadata.inputBytes) || typeof metadata.hasImages !== 'boolean') return fail('Actual SDK request bounds are required.');
  const amount = (metadata.hasImages ? 1_000_000 : metadata.inputBytes) * 2 + metadata.maxOutputTokens * 8;
  if (!integer(amount, 1)) return fail('Request reservation overflows safe money.');
  return amount;
}
export function requireValidationTask(state: RunSnapshot, task: TaskContract, window = currentValidationCase(state)): void {
  const role = validationRole(window, task.taskId);
  if (!role || role === 'planning') fail('Only declared case role tasks may be registered; planning is a billing purpose record.');
  const source = role === 'repair' ? state.tasks.find(item => item.taskId === window.repair?.sourceTaskId) : undefined;
  const expected = role === 'design' ? [window.quote.requirements.stageAcceptanceIds[0]] : role === 'art' ? [window.quote.requirements.stageAcceptanceIds[1]]
    : role === 'coding' ? window.quote.requirements.acceptanceIds : source?.acceptanceIds;
  if (!expected || !sameValue([...task.acceptanceIds].sort(), [...expected].sort()) || task.budget.allocationMicroCny !== window.quote.declaration.grants[role].amountMicroCny) fail('Task differs from its fixed case role acceptance or grant.');
  if (task.attempts.length > 1) fail('Each case task has one attempt; semantic repair requires the distinct declared repair task.');
  if (['ready', 'running'].includes(task.state) && task.attempts.some(attempt => attempt.outcome !== 'running')) fail('A finished attempt cannot return to author execution.');
  if (source && (source.taskId === task.taskId || source.authorId === task.authorId || source.context.contextId === task.context.contextId || !sameValue(source.acceptance, task.acceptance))) fail('Repair must retain source acceptance with a distinct task and author context.');
}

export function requireValidationRepairSource(state: RunSnapshot, sourceTaskId: string, feedback: ArtifactReference, window = currentValidationCase(state)): void {
  evidenceReferences([feedback]);
  const role = validationRole(window, sourceTaskId), source = state.tasks.find(task => task.taskId === sourceTaskId), attempt = source?.attempts.at(-1);
  if (!role || !['design', 'art', 'coding'].includes(role) || !source || source.attempts.length !== 1 || !attempt?.endedAt
    || !(source.state === 'failed' && attempt.failure?.classification === 'code_defect' || source.state === 'needs_changes' && source.review.verdict === 'changes_requested')) fail('Repair requires a failed or reviewed current case source with one completed attempt.');
  if (feedback.version !== attempt.attemptId || !(attempt.failure?.evidenceRefs.includes(feedback.location)
    || source.evidence.some(evidence => source.review.evidenceIds.includes(evidence.evidenceId) && sameValue(evidence.source, feedback)))) fail('Repair feedback must be fixed to the source failure or review evidence.');
}

export function validateValidationProfile(state: RunSnapshot): void {
  if (state.formatVersion !== 3) { if (state.validation !== undefined || state.requests.some(record => record.validation !== undefined)) fail('Legacy snapshots cannot contain operator validation authority.'); return; }
  if (state.continuation !== undefined || state.run.kind !== 'evaluation' || state.ledger.scope !== 'validation' || state.ledger.contractVersion !== '1.0.0' || state.ledger.limitMicroCny !== 150_000_000
    || state.validation?.profile !== 'operator_validation' || !Array.isArray(state.validation.cases) || !state.validation.cases.length) fail('Invalid validation profile or shared ledger.');
  const cases = state.validation.cases;
  for (const key of ['caseId', 'windowId'] as const) if (new Set(cases.map(item => item[key])).size !== cases.length) fail('Case claims cannot be repeated or renamed.');
  if (new Set(cases.map(item => item.operatorDecision.decisionId)).size !== cases.length || cases.at(-1)!.caseId !== state.validation.currentCaseId) fail('Duplicate decision or invalid current case.');
  const owned = new Map<string, ValidationCaseWindow>();
  for (const window of cases) {
    const quote = window.quote; validateValidationDeclaration(quote?.declaration);
    const { quoteId, ...payload } = quote;
    if (quote.formatVersion !== 'validation-case-quote-1' || quote.profile !== 'operator_validation' || quote.activationAllowed !== false || quoteId !== `vq1-${validationHash(JSON.stringify(payload))}`
      || window.caseId !== quote.declaration.caseId || window.windowId !== `validation-${quoteId}` || !timestamp(window.startedAt) || window.claimedAt !== window.startedAt || !timestamp(window.deadlineAt)
      || Date.parse(window.deadlineAt) - Date.parse(window.startedAt) !== quote.declaration.limits.durationMs || !sha(quote.identity.reviewedPlatformSha, 40)
      || quote.identity.frozenCaseInputHash !== validationInputHash(quote.declaration) || quote.basis.runId !== state.run.runId || quote.basis.ledgerId !== state.ledger.ledgerId
      || quote.basis.specVersion !== state.run.specVersion || quote.basis.originalStartedAt !== state.run.originalStartedAt || quote.basis.originalDeadlineAt !== state.run.originalDeadlineAt
      || quote.basis.originalLimitMicroCny !== state.ledger.limitMicroCny || quote.basis.revision >= state.revision || !sha(quote.basis.snapshotSha256)) fail('Invalid fixed validation quote, identity or case clock.');
    if (quote.requirements?.specVersion !== state.run.specVersion || quote.requirements.requirementVersion !== quote.declaration.inputs.requirements.version
      || !Array.isArray(quote.requirements.acceptanceIds) || !quote.requirements.acceptanceIds.length || !Array.isArray(quote.requirements.stageAcceptanceIds) || quote.requirements.stageAcceptanceIds.length !== 2) fail('Invalid frozen validation acceptance contract.');
    if (quote.basis.stopReason ? !sameValue(quote.basis.stopReason, state.stopReason)
      : state.stopReason?.code !== 'deadline' || Date.parse(state.stopReason.at) < Date.parse(state.run.originalDeadlineAt)) fail('Original stop history changed.');
    if (window.operatorDecision.kind !== 'operator_validation' || !window.operatorDecision.decisionId || !window.operatorDecision.actorId || !timestamp(window.operatorDecision.decidedAt)
      || Date.parse(window.operatorDecision.decidedAt) > Date.parse(window.startedAt) || !sha(window.operatorDecision.sourceSha256)) fail('Missing operator validation decision source.');
    if (window.stopReason !== null && (!['deadline', 'manual', 'charge_overrun'].includes(window.stopReason.code) || !timestamp(window.stopReason.at) || !window.stopReason.reason?.trim())) fail('Invalid case stop.');
    if (window.repair) {
      if (!quote.declaration.limits.maxRepairTasks || !timestamp(window.repair.claimedAt) || window.repair.taskId !== quote.declaration.grants.repair.taskId) fail('Invalid single semantic repair claim.');
      requireValidationRepairSource(state, window.repair.sourceTaskId, window.repair.feedback, window);
    }
    for (const role of VALIDATION_ROLES) {
      const grant = quote.declaration.grants[role];
      if (owned.has(grant.taskId) || !state.ledger.allocations.some(item => item.taskId === grant.taskId && item.amountMicroCny === grant.amountMicroCny)) fail('Case grant differs from the original shared ledger.');
      owned.set(grant.taskId, window);
    }
    const usage = validationUsage(state, window), overrun = window.stopReason?.code === 'charge_overrun';
    if (usage.requestsUsed > quote.declaration.limits.maxRequests || !integer(usage.caseCommittedMicroCny) || !overrun && usage.caseCommittedMicroCny > quote.declaration.limits.incrementalMicroCny) fail('Case budget or request ceiling exceeded.');
    if (state.tasks.some(task => task.taskId === quote.declaration.grants.planning.taskId)) fail('Planning cannot be represented as a fabricated task.');
    for (const task of state.tasks) if (validationRole(window, task.taskId)) requireValidationTask(state, task, window);
  }
  if (state.ledger.entries.reduce((sum, entry) => sum + entry.settledMicroCny + entry.reservedMicroCny, 0) > 30_000_000 && !cases.some(window => window.stopReason?.code === 'charge_overrun')) fail('Cumulative validation phase ceiling exceeded.');
  const first = cases[0];
  if (!sameValue(first.quote.basis.requestIds, state.ledger.entries.slice(0, first.quote.basis.requestIds.length).map(entry => entry.requestId))) fail('Historical request prefix changed.');
  for (const record of state.requests) {
    const entry = state.ledger.entries.find(item => item.requestId === record.requestId)!, window = owned.get(entry.taskId), meta = record.validation;
    if (!window) { if (meta !== undefined || record.windowId !== undefined || !first.quote.basis.requestIds.includes(record.requestId)) fail('Legacy request cannot acquire a validation window.'); continue; }
    if (!meta || record.windowId !== window.windowId || meta.windowId !== window.windowId || meta.caseId !== window.caseId || meta.modelId !== 'deepseek-flash'
      || entry.provider !== 'deepseek' || entry.pricingVersion !== 'deepseek-flash-peak-cny-2026-10-01' || meta.maxOutputTokens > validationOutputCap(window, entry.taskId, meta.purpose)) fail('Request lacks its exact validation case, purpose or model bounds.');
    fields(meta, ['caseId', 'windowId', 'purpose', 'modelId', 'maxOutputTokens', 'inputBytes', 'hasImages']);
    validationReservation(meta);
  }
}
