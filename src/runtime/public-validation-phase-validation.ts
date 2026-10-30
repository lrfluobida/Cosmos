import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { evidenceReferences } from '../budget/ledger.ts';
import { budgetCapacity, budgetSummary } from '../contracts/budget.ts';
import { sameValue } from '../contracts/validation.ts';
import { id, regularFile } from '../artifacts/paths.ts';
import type { RunSnapshot } from './run-types.ts';
import type { PublicValidationAuthorization } from './public-validation-funding-types.ts';
import type { PublicValidationPhaseDecision, PublicValidationPhaseQuote, PublicValidationPhaseReceipt, PublicValidationPhaseSuccessorDecision, PublicValidationPhaseSuccessorQuote } from './public-validation-phase-types.ts';

export const phaseHash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
function fail(): never { throw new Error('Invalid public validation phase extension, decision or frozen history.'); }
function fields(value: unknown, names: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !sameValue(Object.keys(value).sort(), [...names].sort())) fail();
}
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const digest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const time = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

/** Preserve stopped tasks verbatim: an old running label is not dispatch authority. */
export function requirePhaseHistoryStopped(state: RunSnapshot): void {
  if (state.formatVersion !== 3 || state.run.kind !== 'evaluation' || state.ledger.scope !== 'validation'
    || !['3.0.0', '4.0.0', '5.0.0'].includes(state.ledger.contractVersion) || state.ledger.limitMicroCny !== 150_000_000
    || !state.stopReason || state.stopReason.code === 'charge_overrun' || !state.validation?.cases.length
    || state.validation.cases.some(window => !window.stopReason || window.stopReason.code === 'charge_overrun')
    || (state.publicValidationFundings ?? []).some(record => record.settlement?.outcome !== 'closed')
    || state.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny || !['settled', 'cancelled'].includes(entry.status))) fail();
  for (const task of state.tasks) if (task.state === 'running' || task.attempts.some(attempt => attempt.outcome === 'running')) {
    const owners = state.validation.cases.filter(window => Object.values(window.quote.declaration.grants).some(grant => grant.taskId === task.taskId));
    if (owners.length !== 1 || !owners[0].stopReason || owners[0].stopReason.code === 'charge_overrun') fail();
  }
}

/** Reconstruct only the frozen prefix; subsequent public grants and settlements append. */
function phaseHistoryPrefix(state: RunSnapshot, b: PublicValidationPhaseQuote['basis'], preserveOriginal: boolean): RunSnapshot {
  const prior = structuredClone(state);
  delete prior.publicValidationPhaseSuccessor;
  if (!preserveOriginal) delete prior.publicValidationPhaseExtension;
  prior.revision = b.revision;
  prior.ledger.allocations = prior.ledger.allocations.slice(0, b.allocationCount);
  prior.ledger.entries = prior.ledger.entries.slice(0, b.entryCount);
  if (prior.ledger.allocationClosures) prior.ledger.allocationClosures = prior.ledger.allocationClosures.slice(0, b.closureCount);
  prior.run.taskIds = prior.run.taskIds.slice(0, b.allocationCount);
  prior.run.fees = { settledMicroCny: prior.ledger.entries.reduce((sum, entry) => sum + entry.settledMicroCny, 0),
    reservedMicroCny: prior.ledger.entries.reduce((sum, entry) => sum + entry.reservedMicroCny, 0),
    unknownRequestIds: prior.ledger.entries.filter(entry => entry.unknown).map(entry => entry.requestId) };
  prior.requests = prior.requests.slice(0, b.requestCount); prior.tasks = prior.tasks.slice(0, b.taskCount);
  prior.events = prior.events.slice(0, b.eventCount);
  if (b.fundingCount) prior.publicValidationFundings = prior.publicValidationFundings!.slice(0, b.fundingCount);
  else delete prior.publicValidationFundings;
  return prior;
}
export const phaseHistory = (state: RunSnapshot, basis: PublicValidationPhaseQuote['basis']) => phaseHistoryPrefix(state, basis, false);
export const phaseHistoryHash = (state: RunSnapshot, basis: PublicValidationPhaseQuote['basis']) => phaseHash(JSON.stringify(phaseHistory(state, basis)));
export const phaseSuccessorHistoryHash = (state: RunSnapshot, basis: PublicValidationPhaseQuote['basis']) => phaseHash(JSON.stringify(phaseHistoryPrefix(state, basis, true)));

export function validatePhaseQuote(q: PublicValidationPhaseQuote, state: RunSnapshot): void {
  fields(q, ['formatVersion', 'scope', 'activationAllowed', 'quoteId', 'sharedRoot', 'repositoryRoot', 'fromMicroCny', 'toMicroCny', 'lifetimeMicroCny', 'maxRunMicroCny', 'maxDurationMs', 'basis']);
  const { quoteId, ...payload } = q;
  if (q.formatVersion !== 'public-validation-phase-quote/1' || q.scope !== 'public_validation_funding' || q.activationAllowed !== false
    || quoteId !== `pvpq1-${phaseHash(JSON.stringify(payload))}` || q.fromMicroCny !== 30_000_000 || q.toMicroCny !== 40_000_000
    || q.lifetimeMicroCny !== 150_000_000 || q.maxRunMicroCny !== 5_000_000 || q.maxDurationMs !== 1_800_000
    || [q.sharedRoot, q.repositoryRoot].some(root => typeof root !== 'string' || !isAbsolute(root) || resolve(root) !== root)) fail();
  validatePhaseBasis(q, state, false);
}
function validatePhaseBasis(q: PublicValidationPhaseQuote | PublicValidationPhaseSuccessorQuote, state: RunSnapshot, preserveOriginal: boolean): void {
  const b = q.basis;
  fields(b, ['runId', 'ledgerId', 'revision', 'snapshotSha256', 'committedMicroCny', 'heldMicroCny', 'allocatedMicroCny',
    'allocationCount', 'entryCount', 'requestCount', 'caseCount', 'taskCount', 'closureCount', 'fundingCount', 'eventCount', 'historySha256']);
  if (b.runId !== state.run.runId || b.ledgerId !== state.ledger.ledgerId || !integer(b.revision) || b.revision < 1 || b.revision > state.revision
    || !digest(b.snapshotSha256) || !digest(b.historySha256) || !integer(b.committedMicroCny) || b.committedMicroCny > q.fromMicroCny || b.heldMicroCny !== 0 || !integer(b.allocatedMicroCny)) fail();
  const counts = [[b.allocationCount, state.ledger.allocations.length], [b.entryCount, state.ledger.entries.length], [b.requestCount, state.requests.length],
    [b.caseCount, state.validation?.cases.length ?? 0], [b.taskCount, state.tasks.length], [b.closureCount, state.ledger.allocationClosures?.length ?? 0],
    [b.fundingCount, state.publicValidationFundings?.length ?? 0], [b.eventCount, state.events.length]];
  if (counts.some(([n, max]) => !integer(n) || n > max) || b.caseCount < 1 || b.caseCount !== state.validation?.cases.length
    || b.taskCount !== state.tasks.length || b.entryCount !== b.requestCount || !b.eventCount) fail();
  const prior = phaseHistoryPrefix(state, b, preserveOriginal);
  if (phaseHash(JSON.stringify(prior)) !== b.historySha256) fail();
  requirePhaseHistoryStopped(prior);
  if (budgetSummary(prior.ledger).committedMicroCny !== b.committedMicroCny || budgetCapacity(prior.ledger).allocatedMicroCny !== b.allocatedMicroCny) fail();
}

export function validatePhaseSuccessorQuote(q: PublicValidationPhaseSuccessorQuote, state: RunSnapshot): void {
  fields(q, ['formatVersion', 'scope', 'activationAllowed', 'quoteId', 'sharedRoot', 'repositoryRoot', 'fromMicroCny', 'toMicroCny', 'lifetimeMicroCny', 'maxRunMicroCny', 'maxDurationMs', 'predecessor', 'basis']);
  fields(q.predecessor, ['quoteId', 'decisionId', 'receiptSha256', 'sourceSha256']);
  const { quoteId, ...payload } = q, original = state.publicValidationPhaseExtension;
  if (!original || q.formatVersion !== 'public-validation-phase-successor-quote/1' || q.scope !== 'public_validation_funding' || q.activationAllowed !== false
    || quoteId !== `pvpsq1-${phaseHash(JSON.stringify(payload))}` || q.fromMicroCny !== 40_000_000 || !integer(q.toMicroCny) || q.toMicroCny <= q.fromMicroCny
    || q.toMicroCny > 150_000_000 || q.lifetimeMicroCny !== 150_000_000 || q.maxRunMicroCny !== 5_000_000 || q.maxDurationMs !== 1_800_000
    || q.sharedRoot !== original.quote.sharedRoot || q.repositoryRoot !== original.quote.repositoryRoot
    || !sameValue(q.predecessor, { quoteId: original.quote.quoteId, decisionId: original.operatorDecision.decisionId,
      receiptSha256: phaseHash(JSON.stringify(original)), sourceSha256: original.operatorDecision.sourceSha256 })) fail();
  validatePhaseBasis(q, state, true);
  const b = q.basis, old = original.quote.basis;
  if (b.revision <= old.revision || b.eventCount <= old.eventCount
    || (['allocationCount', 'entryCount', 'requestCount', 'closureCount', 'fundingCount'] as const).some(key => b[key] < old[key])) fail();
}

export function phaseDecisionIds(state: RunSnapshot): string[] {
  return [...state.run.humanDecisions.map(row => row.decisionId), ...(state.validation?.cases ?? []).map(row => row.operatorDecision.decisionId),
    ...(state.allocationClosureDecisions ?? []).map(row => row.operatorDecision.decisionId), ...(state.allocationSupplementDecisions ?? []).map(row => row.operatorDecision.decisionId)];
}
function validateDecision(d: PublicValidationPhaseDecision, withHash = false): void {
  fields(d, ['kind', 'decisionId', 'actorId', 'decidedAt', 'source', 'sourceRefs', ...(withHash ? ['sourceSha256'] : [])]);
  if (d.kind !== 'operator_public_validation_phase_extension' || typeof d.actorId !== 'string' || !d.actorId.trim() || !time(d.decidedAt)) fail();
  id(d.decisionId); evidenceReferences([d.source]); evidenceReferences(d.sourceRefs);
}
function validateSuccessorDecision(d: PublicValidationPhaseSuccessorDecision, withHash = false): void {
  fields(d, ['kind', 'decisionId', 'actorId', 'decidedAt', 'source', 'sourceRefs', ...(withHash ? ['sourceSha256'] : [])]);
  if (d.kind !== 'operator_public_validation_phase_successor' || typeof d.actorId !== 'string' || !d.actorId.trim() || !time(d.decidedAt)) fail();
  id(d.decisionId); evidenceReferences([d.source]); evidenceReferences(d.sourceRefs);
}
function requireSuccessorPredecessor(d: PublicValidationPhaseSuccessorDecision, original: PublicValidationPhaseReceipt) {
  if (Date.parse(d.decidedAt) < Date.parse(original.operatorDecision.decidedAt)
    || !d.sourceRefs.some(ref => sameValue(ref, original.operatorDecision.source))) fail();
}
export function validatePublicValidationPhaseExtension(state: RunSnapshot): void {
  const r = state.publicValidationPhaseExtension, events = state.events.filter(event => event.type === 'public_validation_phase_extended');
  const s = state.publicValidationPhaseSuccessor, successorEvents = state.events.filter(event => event.type === 'public_validation_phase_successor_applied');
  if (r === undefined) { if (s !== undefined || successorEvents.length || events.length || state.publicValidationFundings?.some(record => record.phaseDecisionId !== undefined)) fail(); return; }
  fields(r, ['activationAllowed', 'appliedAt', 'quote', 'operatorDecision']);
  validatePhaseQuote(r.quote, state); validateDecision(r.operatorDecision, true);
  const d = r.operatorDecision, b = r.quote.basis;
  if (r.activationAllowed !== false || !time(r.appliedAt) || Date.parse(d.decidedAt) > Date.parse(r.appliedAt) || !digest(d.sourceSha256)
    || b.revision >= state.revision || phaseDecisionIds(state).includes(d.decisionId)
    || events.length !== 1 || events[0].sequence !== b.eventCount + 1 || events[0].at !== r.appliedAt || events[0].requestId !== null
    || events[0].reason !== JSON.stringify({ quoteId: r.quote.quoteId, decisionId: d.decisionId })) fail();
  if (s === undefined) { if (successorEvents.length) fail(); }
  else {
    fields(s, ['activationAllowed', 'appliedAt', 'quote', 'operatorDecision']);
    validatePhaseSuccessorQuote(s.quote, state); validateSuccessorDecision(s.operatorDecision, true); requireSuccessorPredecessor(s.operatorDecision, r);
    const sd = s.operatorDecision, sb = s.quote.basis;
    if (s.activationAllowed !== false || !time(s.appliedAt) || Date.parse(sd.decidedAt) > Date.parse(s.appliedAt) || Date.parse(s.appliedAt) < Date.parse(r.appliedAt)
      || !digest(sd.sourceSha256) || sb.revision >= state.revision || sd.decisionId === d.decisionId || phaseDecisionIds(state).includes(sd.decisionId)
      || successorEvents.length !== 1 || successorEvents[0].sequence !== sb.eventCount + 1 || successorEvents[0].at !== s.appliedAt || successorEvents[0].requestId !== null
      || successorEvents[0].reason !== JSON.stringify({ quoteId: s.quote.quoteId, decisionId: sd.decisionId })) fail();
  }
  for (const [index, record] of (state.publicValidationFundings ?? []).entries()) {
    if (index < b.fundingCount) { if (record.phaseDecisionId !== undefined) fail(); continue; }
    const phase = s && index >= s.quote.basis.fundingCount ? s : r;
    if (record.phaseDecisionId !== phase.operatorDecision.decisionId
      || record.binding.limits.limitMicroCny > phase.quote.maxRunMicroCny || record.binding.limits.durationMs > phase.quote.maxDurationMs
      || record.basisRevision <= phase.quote.basis.revision || Date.parse(record.claimedAt) < Date.parse(phase.appliedAt)) fail();
  }
}

/** A number is usable only after validating the complete extension and frozen prefix. */
export function publicValidationPhaseLimit(state: RunSnapshot): number {
  validatePublicValidationPhaseExtension(state);
  return state.publicValidationPhaseSuccessor?.quote.toMicroCny ?? state.publicValidationPhaseExtension?.quote.toMicroCny ?? 30_000_000;
}
export async function verifyPhaseDecision(root: string, quote: PublicValidationPhaseQuote, decision: PublicValidationPhaseDecision, now: number) {
  validateDecision(decision);
  if (Date.parse(decision.decidedAt) > now) fail();
  const location = isAbsolute(decision.source.location) ? decision.source.location : resolve(root, decision.source.location);
  const bytes = await regularFile(dirname(location), basename(location));
  const { source: _source, ...fields } = decision;
  if (!sameValue(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), { formatVersion: 'operator-public-validation-phase-extension-decision/1', ...fields, quote })) fail();
  return { ...structuredClone(decision), sourceSha256: phaseHash(bytes) };
}
export async function verifyPublicValidationPhaseSource(root: string, state: RunSnapshot): Promise<void> {
  validatePublicValidationPhaseExtension(state);
  const r = state.publicValidationPhaseExtension; if (!r) return;
  const { sourceSha256: _hash, ...decision } = r.operatorDecision;
  if (r.quote.sharedRoot !== resolve(root) || !sameValue(await verifyPhaseDecision(root, r.quote, decision, Date.now()), r.operatorDecision)) fail();
  const s = state.publicValidationPhaseSuccessor; if (!s) return;
  const { sourceSha256: _successorHash, ...successorDecision } = s.operatorDecision;
  if (!sameValue(await verifyPhaseSuccessorDecision(root, s.quote, successorDecision, r, Date.now()), s.operatorDecision)) fail();
}
export async function verifyPhaseSuccessorDecision(root: string, quote: PublicValidationPhaseSuccessorQuote, decision: PublicValidationPhaseSuccessorDecision, original: PublicValidationPhaseReceipt, now: number) {
  validateSuccessorDecision(decision); requireSuccessorPredecessor(decision, original);
  if (Date.parse(decision.decidedAt) > now) fail();
  const location = isAbsolute(decision.source.location) ? decision.source.location : resolve(root, decision.source.location);
  const bytes = await regularFile(dirname(location), basename(location)), { source: _source, ...fields } = decision;
  if (!sameValue(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), { formatVersion: 'operator-public-validation-phase-successor-decision/1', ...fields, quote })) fail();
  return { ...structuredClone(decision), sourceSha256: phaseHash(bytes) };
}
export function requirePhaseFundingAuthorization(state: RunSnapshot, authorization: PublicValidationAuthorization, phaseDecisionId?: string): void {
  const phases = [state.publicValidationPhaseExtension, state.publicValidationPhaseSuccessor];
  const r = phaseDecisionId === undefined ? state.publicValidationPhaseSuccessor ?? state.publicValidationPhaseExtension
    : phases.find(phase => phase?.operatorDecision.decisionId === phaseDecisionId);
  if (!r) { if (phaseDecisionId !== undefined) fail(); return; }
  if (phases.some(phase => phase?.operatorDecision.decisionId === authorization.decisionId) || phaseDecisionIds(state).includes(authorization.decisionId)
    || authorization.runId === state.run.runId || authorization.ledgerId === state.ledger.ledgerId
    || Date.parse(authorization.decidedAt) < Date.parse(r.operatorDecision.decidedAt)
    || !authorization.sourceRefs.some(ref => sameValue(ref, r.operatorDecision.source))
    || authorization.limits.limitMicroCny > r.quote.maxRunMicroCny || authorization.limits.durationMs > r.quote.maxDurationMs) throw new Error('Public funding requires the exact phase decision source and bounded new run authority.');
}
