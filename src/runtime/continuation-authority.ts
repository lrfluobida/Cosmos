import { createHash } from 'node:crypto';
import { regularFile } from '../artifacts/paths.ts';
import { evidenceReferences, nonEmpty } from '../budget/ledger.ts';
import { sameValue } from '../contracts/validation.ts';
import { validateLedgerUpdate, validateRunUpdate } from '../contracts/updates.ts';
import { SnapshotStore } from './store.ts';
import { validateSnapshot } from './run-validation.ts';
import type { ContinuationQuote } from './continuation-quote.ts';
import type { ContinuationConfirmation, ExecutionWindow } from './run-types.ts';

export interface ActivateContinuationOptions {
  root: string; quote: ContinuationQuote; confirmation: ContinuationConfirmation; now?: () => number;
}

/** Only this explicit host API upgrades a stopped formal run. It does not return an executor. */
export async function activateContinuation(options: ActivateContinuationOptions): Promise<ExecutionWindow> {
  const { root } = options, quote = structuredClone(options.quote), confirmation = structuredClone(options.confirmation);
  const store = await SnapshotStore.acquire(root);
  try {
    const previous = await store.read(); validateSnapshot(previous);
    for (const key of ['decisionId', 'actorId', 'decidedAt'] as const) nonEmpty(confirmation[key], key);
    evidenceReferences([confirmation.source]);
    const decidedAt = Date.parse(confirmation.decidedAt);
    const now = (options.now ?? Date.now)();
    if (!Number.isSafeInteger(now) || !Number.isFinite(new Date(now).getTime()) || !Number.isFinite(decidedAt) || new Date(decidedAt).toISOString() !== confirmation.decidedAt || decidedAt > now) throw new Error('Invalid confirmation or activation time.');
    const sourceBytes = await regularFile(store.root, confirmation.source.location);
    const receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes));
    if (!sameValue(receipt, { formatVersion: 'continuation-confirmation-1', decisionId: confirmation.decisionId, actorId: confirmation.actorId, decidedAt: confirmation.decidedAt, confirmed: true, quote })) throw new Error('Exact quote confirmation source is missing, forged or changed.');
    const fixedConfirmation = { ...confirmation, sourceSha256: createHash('sha256').update(sourceBytes).digest('hex') };
    const existing = previous.continuation?.windows.find(window => window.decisionId === confirmation.decisionId);
    if (existing) {
      if (!sameValue(existing.quote, quote) || !sameValue(existing.confirmation, fixedConfirmation)) throw new Error('Continuation decision conflicts with its recorded authorization.');
      return structuredClone(existing);
    }
    if (previous.formatVersion !== 1) throw new Error('A further continuation requires a separately supported quote version; existing windows are never restarted.');
    if (previous.ledger.scope !== 'generation' || previous.run.kind !== 'runtime_generation') throw new Error('Continuation is formal generation only.');
    if (previous.stopReason?.code === 'charge_overrun') throw new Error('Historical charge overrun requires separate resolution; continuation is blocked.');
    if (previous.run.humanDecisions.some(item => item.decisionId === confirmation.decisionId)) throw new Error('Decision ID already exists.');
    if (previous.ledger.entries.some(entry => entry.reservedMicroCny || entry.unknown || !['settled', 'cancelled'].includes(entry.status))) throw new Error('Outstanding or unknown charges block continuation.');
    if (previous.tasks.some(task => task.attempts.some(attempt => attempt.outcome === 'running'))) throw new Error('A running source attempt must quiesce before continuation.');
    const { buildContinuationQuote } = await import('./continuation-quote.ts');
    const current = await buildContinuationQuote({ root: store.root, ...quote.requested, now });
    if (!sameValue(current, quote)) throw new Error('Stale or altered continuation quote; confirm the current exact proposal.');
    const verifiedHere = ['explicit_confirmation_required', 'owner_quiescence_unverified', 'allocation_closures_unverified', 'original_stop_not_recorded', 'fixed_evidence_unverified'];
    if (quote.blockers.some(item => !verifiedHere.includes(item.code) && !(item.code === 'source_evidence_missing'
      && previous.tasks.find(task => task.taskId === item.taskId)?.attempts.at(-1)?.outcome === 'cancelled'))) throw new Error('Continuation quote has unresolved source, mapping or budget blockers.');
    if (!quote.proposed.grants.length || quote.proposed.grants.length !== quote.proposed.targets.length) throw new Error('Continuation requires a complete new grant mapping.');
    const next = structuredClone(previous), at = new Date(now).toISOString();
    if (!next.stopReason) {
      if (now < Date.parse(next.run.originalDeadlineAt)) throw new Error('Original run has not stopped.');
      next.stopReason = { code: 'deadline', reason: 'Original hard deadline reached before continuation authorization.', at };
      next.events.push({ sequence: next.events.length + 1, type: 'stopped', at, requestId: null, reason: next.stopReason.reason });
    }
    next.run.state = 'waiting_user';
    const windowId = `window-${quote.quoteId}`;
    const window: ExecutionWindow = {
      windowId, decisionId: confirmation.decisionId, startedAt: at, deadlineAt: new Date(now + quote.requested.additionalDurationMs).toISOString(), stopReason: null,
      quote, confirmation: fixedConfirmation, grants: structuredClone(quote.proposed.grants),
      verification: { ownerAndAccounting: 'verified', fixedQuoteInputs: 'verified', artifactReuse: 'pending_task_validation' },
    };
    next.formatVersion = 2;
    next.ledger.contractVersion = '2.0.0';
    next.ledger.authorizations = [{ decisionId: confirmation.decisionId, windowId, additionalMicroCny: quote.requested.additionalMicroCny }];
    next.ledger.allocationClosures = quote.proposed.allocationClosures.map(item => ({ taskId: item.taskId, decisionId: confirmation.decisionId, releasedMicroCny: item.proposedReleaseMicroCny }));
    for (const grant of window.grants) {
      next.ledger.allocations.push({ taskId: grant.taskId, amountMicroCny: grant.amountMicroCny });
      next.run.taskIds.push(grant.taskId);
    }
    next.continuation = { currentWindowId: windowId, windows: [window] };
    next.run.humanDecisions.push({ decisionId: confirmation.decisionId, actorId: confirmation.actorId, decidedAt: confirmation.decidedAt, reason: `Explicit continuation authorization for exact quote ${quote.quoteId}.`, evidence: [confirmation.source] });
    next.events.push({ sequence: next.events.length + 1, type: 'continuation_activated', at, requestId: null, reason: `Authorized execution window ${windowId}; artifact reuse remains pending task validation.` });
    next.revision++;
    validateSnapshot(next);
    const issues = [...validateRunUpdate(previous.run, next.run, { role: 'system', actorId: 'runtime' }),
      ...validateLedgerUpdate(previous.ledger, next.ledger, { role: 'system', actorId: 'runtime' }, { continuationUpgrade: true })];
    if (issues.length) throw new Error(`Invalid continuation run update: ${issues.map(item => item.message).join('; ')}`);
    await store.write(next);
    return structuredClone(window);
  } finally { await store.close(); }
}
