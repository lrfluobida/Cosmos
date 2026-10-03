import type { BudgetLedger, RunManifest, TaskContract, TaskState, UpdateActor, ValidationIssue } from './types.ts';
import { issue } from './structure.ts';
import { sameValue, validateLedger, validateRun, validateTask } from './validation.ts';

const NEXT: Record<TaskState, readonly TaskState[]> = {
  not_started: ['ready', 'waiting_user', 'cancelled'], ready: ['running', 'waiting_user', 'cancelled'],
  running: ['awaiting_review', 'failed', 'waiting_user', 'cancelled'], awaiting_review: ['passed', 'needs_changes', 'waiting_user', 'cancelled'],
  needs_changes: ['running', 'waiting_user', 'failed', 'cancelled'], waiting_user: ['ready', 'running', 'awaiting_review', 'needs_changes', 'failed', 'cancelled'],
  passed: [], failed: [], cancelled: [],
};
function transition(before: TaskState, after: TaskState, issues: ValidationIssue[]): void {
  if (before !== after && !NEXT[before].includes(after)) issue(issues, '$.state', 'illegal_transition', `Cannot move from ${before} to ${after}.`);
}
function fixed<T>(before: T, after: T, keys: (keyof T)[], issues: ValidationIssue[]): void {
  for (const key of keys) if (!sameValue(before[key], after[key])) issue(issues, `$.${String(key)}`, 'immutable', 'This field is fixed for the lifetime of the record.');
}
function appendOnly<T>(before: T[], after: T[], path: string, issues: ValidationIssue[]): void {
  if (before.length > after.length || before.some((item, i) => !sameValue(item, after[i]))) issue(issues, path, 'history_changed', 'Existing history cannot be removed or rewritten.');
}
export function validateTaskUpdate(previous: unknown, next: unknown, actor: UpdateActor): ValidationIssue[] {
  const issues = [...validateTask(previous), ...validateTask(next)]; if (issues.length) return issues;
  const before = previous as TaskContract, after = next as TaskContract;
  transition(before.state, after.state, issues);
  if (actor.role === 'reviewer') {
    for (const key of Object.keys(before) as (keyof TaskContract)[]) {
      if (!['review', 'state', 'evidence'].includes(key) && !sameValue(before[key], after[key])) issue(issues, `$.${key}`, 'reviewer_scope', 'Reviewers cannot change author-owned task content.');
    }
    for (const evidence of after.evidence.slice(before.evidence.length)) {
      if (!after.review.evidenceIds.includes(evidence.evidenceId)) issue(issues, '$.evidence', 'reviewer_scope', 'New reviewer evidence must be referenced by the review.');
    }
  }
  fixed(before, after, ['contractVersion', 'taskId', 'kind', 'runId', 'specVersion', 'authorId', 'acceptanceIds', 'objective', 'inputs', 'ownership', 'outputs', 'acceptance', 'budget'], issues);
  if (before.context.contextId !== after.context.contextId) issue(issues, '$.context.contextId', 'immutable', 'The author context identity is fixed.');
  if (!sameValue(before.dependsOn.map(({ taskId, requiredState }) => ({ taskId, requiredState })), after.dependsOn.map(({ taskId, requiredState }) => ({ taskId, requiredState })))) issue(issues, '$.dependsOn', 'immutable', 'Dependency IDs and required states are fixed.');
  if (actor.role === 'author' && actor.actorId !== before.authorId) issue(issues, '$', 'actor', 'Only the assigned author may author this task.');
  if (!sameValue(before.review, after.review)) {
    if (after.review.verdict === 'pending') {
      if (!(before.state === 'needs_changes' && after.state === 'running')) issue(issues, '$.review', 'review_reset', 'Review resets only when starting required rework.');
    } else if (actor.role !== 'reviewer' || actor.actorId !== after.review.reviewerId || actor.actorId === before.authorId) issue(issues, '$.review', 'review_authority', 'Only the assigned independent reviewer may record a verdict.');
  }
  if (after.state === 'passed' && before.state !== 'passed' && (actor.role !== 'reviewer' || actor.actorId !== after.review.reviewerId)) issue(issues, '$.state', 'review_authority', 'An independent reviewer must approve the transition to passed.');
  appendOnly(before.evidence, after.evidence, '$.evidence', issues);
  for (let i = 0; i < before.attempts.length; i++) {
    const old = before.attempts[i], current = after.attempts[i];
    if (!current) { issue(issues, '$.attempts', 'history_changed', 'Attempt history cannot be deleted.'); continue; }
    if (old.outcome !== 'running') { if (!sameValue(old, current)) issue(issues, `$.attempts[${i}]`, 'history_changed', 'Completed attempts are immutable.'); }
    else fixed(old, current, ['attemptId', 'sessionRef', 'startedAt'], issues);
  }
  if (['passed', 'failed', 'cancelled'].includes(before.state) && !sameValue(before, after)) issue(issues, '$', 'terminal_record', 'Terminal tasks are immutable; create a linked new task for new work.');
  return issues;
}
export function validateLedgerUpdate(previous: unknown, next: unknown, actor: UpdateActor, options: { continuationUpgrade?: boolean; validationClosureUpgrade?: boolean; allowOverrunFacts?: boolean } = {}): ValidationIssue[] {
  const issues = [...validateLedger(previous), ...validateLedger(next)].filter(item => !(options.allowOverrunFacts && ['budget_exceeded', 'allocation_exceeded'].includes(item.code))); if (issues.length) return issues;
  const before = previous as BudgetLedger, after = next as BudgetLedger;
  if (!sameValue(before, after) && actor.role !== 'system') issue(issues, '$', 'ledger_authority', 'Only the budget service may update the shared ledger.');
  fixed(before, after, ['ledgerId', 'scope', 'limitMicroCny', 'warningThresholdPercent'], issues);
  const upgrade = options.continuationUpgrade && before.contractVersion === '1.0.0' && after.contractVersion === '2.0.0' && before.scope === 'generation'
    || options.validationClosureUpgrade && before.contractVersion === '1.0.0' && after.contractVersion === '3.0.0' && before.scope === 'validation';
  if (!upgrade) fixed(before, after, ['contractVersion'], issues);
  appendOnly(before.allocations, after.allocations, '$.allocations', issues);
  appendOnly(before.authorizations ?? [], after.authorizations ?? [], '$.authorizations', issues);
  appendOnly(before.allocationClosures ?? [], after.allocationClosures ?? [], '$.allocationClosures', issues);
  for (const entry of before.entries) {
    const current = after.entries.find(item => item.requestId === entry.requestId);
    if (!current) { issue(issues, '$.entries', 'history_changed', 'A recorded request cannot be removed.'); continue; }
    fixed(entry, current, ['requestId', 'taskId', 'provider', 'pricingVersion'], issues);
    appendOnly(entry.evidence, current.evidence, '$.entries.evidence', issues);
    if (entry.status === 'settled' || entry.status === 'cancelled') {
      if (!sameValue(entry, current)) issue(issues, '$.entries', 'closed_request', 'Reconciled request records are immutable.');
    } else {
      if (current.settledMicroCny < entry.settledMicroCny) issue(issues, '$.entries', 'cost_reset', 'Settled costs cannot decrease.');
      if (current.status === 'reserved' && entry.status === 'unknown') issue(issues, '$.entries', 'unknown_retry', 'Unknown requests require reconciliation before further work.');
      if (['reserved', 'unknown'].includes(current.status) && current.reservedMicroCny + current.settledMicroCny < entry.reservedMicroCny + entry.settledMicroCny) issue(issues, '$.entries', 'reservation_reset', 'Outstanding exposure cannot decrease before reconciliation.');
    }
  }
  return issues;
}
export function validateRunUpdate(previous: unknown, next: unknown, actor: UpdateActor): ValidationIssue[] {
  const issues = [...validateRun(previous), ...validateRun(next)]; if (issues.length) return issues;
  const before = previous as RunManifest, after = next as RunManifest;
  if (!sameValue(before, after) && actor.role !== 'system') issue(issues, '$', 'run_authority', 'Only the runtime may update the run manifest.');
  fixed(before, after, ['contractVersion', 'runId', 'kind', 'specVersion', 'ledgerId', 'originalStartedAt', 'originalDeadlineAt'], issues);
  transition(before.state, after.state, issues);
  appendOnly(before.taskIds, after.taskIds, '$.taskIds', issues);
  appendOnly(before.artifacts, after.artifacts, '$.artifacts', issues);
  appendOnly(before.humanDecisions, after.humanDecisions, '$.humanDecisions', issues);
  if (after.fees.settledMicroCny < before.fees.settledMicroCny) issue(issues, '$.fees.settledMicroCny', 'cost_reset', 'Settled run costs cannot decrease.');
  return issues;
}
