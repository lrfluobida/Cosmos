import { createHash } from 'node:crypto';
import { DEFAULT_BUDGETS } from '../contracts/budget.ts';
import { sameValue } from '../contracts/validation.ts';
import type { TaskContract } from '../contracts/types.ts';
import type { ExecutionWindow, RunSnapshot } from './run-types.ts';

const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const stop = (value: ExecutionWindow['stopReason']) => value === null || !!value && ['manual', 'deadline', 'charge_overrun'].includes(value.code) && timestamp(value.at) && typeof value.reason === 'string' && !!value.reason.trim();

/** A grant is linked to its exact source; it cannot be repurposed as an arbitrary task budget. */
export function requireContinuationTask(state: RunSnapshot, task: TaskContract): void {
  const window = state.continuation?.windows.find(item => item.windowId === state.continuation?.currentWindowId);
  const grant = window?.grants.find(item => item.taskId === task.taskId);
  const source = state.tasks.find(item => item.taskId === grant?.sourceTaskId);
  if (!window || !grant || !source) throw new Error('Task has no quoted continuation source grant.');
  const sourceTarget = window.quote.proposed.targets.find(item => item.sourceTaskId === source.taskId);
  if (!sourceTarget || source.state === 'passed' || task.objective !== source.objective || !sameValue(task.acceptanceIds, sourceTarget.acceptanceIds)
    || !sameValue(task.acceptance, source.acceptance) || !sameValue(task.ownership, source.ownership)
    || task.budget.allocationMicroCny !== grant.amountMicroCny || task.authorId === source.authorId || task.context.contextId === source.context.contextId) throw new Error('Continuation task must retain the quoted source objective, acceptance and ownership with a new author context.');
  if (task.attempts.length > window.quote.proposed.attemptPolicy.newAttemptsPerTarget) throw new Error('Continuation authorizes only one new attempt per target.');
}

/** The current release supports one explicit v1-to-v2 authorization, including durable recovery. */
export function validateContinuation(state: RunSnapshot): void {
  if (state.formatVersion === 1) {
    if (state.continuation !== undefined || state.ledger.contractVersion !== '1.0.0' || state.requests.some(record => record.windowId !== undefined)) throw new Error('Original v1 snapshot cannot contain continuation authority.');
    return;
  }
  const data = state.continuation;
  if (state.run.kind !== 'runtime_generation' || state.ledger.scope !== 'generation' || state.ledger.contractVersion !== '2.0.0' || !state.stopReason
    || !data || !Array.isArray(data.windows) || data.windows.length !== 1) throw new Error('Invalid formal continuation snapshot.');
  const window = data.windows[0], quote = window?.quote;
  if (!window || !quote || window.windowId !== data.currentWindowId || window.windowId !== `window-${quote.quoteId}` || !timestamp(window.startedAt) || !timestamp(window.deadlineAt)
    || !stop(window.stopReason) || !timestamp(window.confirmation?.decidedAt) || Date.parse(window.confirmation.decidedAt) > Date.parse(window.startedAt)
    || window.decisionId !== window.confirmation.decisionId || !/^[a-f0-9]{64}$/.test(window.confirmation.sourceSha256)
    || !sameValue(window.verification, { ownerAndAccounting: 'verified', fixedQuoteInputs: 'verified', artifactReuse: 'pending_task_validation' })) throw new Error('Invalid continuation window or confirmation.');
  const { quoteId, ...payload } = quote;
  if (quote.formatVersion !== 'continuation-quote-1' || quote.kind !== 'proposal' || quote.activationAllowed !== false
    || quoteId !== `cq1-${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`
    || quote.basis.runId !== state.run.runId || quote.basis.ledgerId !== state.ledger.ledgerId || quote.basis.specVersion !== state.run.specVersion
    || quote.basis.originalStartedAt !== state.run.originalStartedAt || quote.basis.originalDeadlineAt !== state.run.originalDeadlineAt || quote.basis.originalLimitMicroCny !== state.ledger.limitMicroCny
    || !Number.isSafeInteger(quote.basis.revision) || quote.basis.revision >= state.revision
    || !Number.isSafeInteger(quote.requested.additionalDurationMs) || quote.requested.additionalDurationMs < 60_000 || quote.requested.additionalDurationMs > DEFAULT_BUDGETS.hardDurationMs
    || Date.parse(window.deadlineAt) - Date.parse(window.startedAt) !== quote.requested.additionalDurationMs
    || !sameValue(quote.proposed.attemptPolicy, { newAttemptsPerTarget: 1, automaticRepairs: 0 })) throw new Error('Invalid fixed continuation quote or deadline.');
  if (quote.basis.stopReason ? !sameValue(quote.basis.stopReason, state.stopReason)
    : state.stopReason.code !== 'deadline' || state.stopReason.at !== window.startedAt || Date.parse(window.startedAt) < Date.parse(state.run.originalDeadlineAt)) throw new Error('Original stop history cannot change during continuation.');
  if (!sameValue(state.ledger.authorizations, [{ decisionId: window.decisionId, windowId: window.windowId, additionalMicroCny: quote.requested.additionalMicroCny }])
    || !sameValue(state.ledger.allocationClosures, quote.proposed.allocationClosures.map(item => ({ taskId: item.taskId, decisionId: window.decisionId, releasedMicroCny: item.proposedReleaseMicroCny })))
    || !sameValue(window.grants, quote.proposed.grants) || !window.grants.length || window.grants.length !== quote.proposed.targets.length
    || new Set(window.grants.map(item => item.taskId)).size !== window.grants.length || new Set(window.grants.map(item => item.sourceTaskId)).size !== window.grants.length) throw new Error('Continuation grants and closures differ from the exact authorization.');
  if (!state.run.humanDecisions.some(item => item.decisionId === window.decisionId && item.actorId === window.confirmation.actorId && item.decidedAt === window.confirmation.decidedAt && sameValue(item.evidence, [window.confirmation.source]))) throw new Error('Continuation is missing its exact human decision.');
  const grantIds = window.grants.map(item => item.taskId);
  if (state.ledger.allocations.some(item => !grantIds.includes(item.taskId) && !state.ledger.allocationClosures!.some(closure => closure.taskId === item.taskId))) throw new Error('All original grants must remain closed.');
  for (const grant of window.grants) {
    const source = state.tasks.find(item => item.taskId === grant.sourceTaskId);
    if (!source || grantIds.includes(grant.sourceTaskId) || !Number.isSafeInteger(grant.amountMicroCny) || grant.amountMicroCny <= 0
      || !quote.proposed.targets.some(item => item.sourceTaskId === source.taskId && sameValue(item.acceptanceIds, source.acceptanceIds))
      || !state.ledger.allocations.some(item => item.taskId === grant.taskId && item.amountMicroCny === grant.amountMicroCny)
      || state.ledger.allocationClosures!.some(item => item.taskId === grant.taskId)) throw new Error('Invalid continuation source or new grant.');
  }
  for (const record of state.requests) {
    const entry = state.ledger.entries.find(item => item.requestId === record.requestId)!;
    if (grantIds.includes(entry.taskId) ? record.windowId !== window.windowId || !state.tasks.some(task => task.taskId === entry.taskId) : record.windowId !== undefined) throw new Error('Request must retain its original execution window and registered task admission.');
  }
  for (const task of state.tasks) if (grantIds.includes(task.taskId)) requireContinuationTask(state, task);
}
