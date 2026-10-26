import { isAbsolute, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { id, within } from '../artifacts/paths.ts';
import { evidenceReferences } from '../budget/ledger.ts';
import { validateRunLimits } from '../cli/run-limits.ts';
import { sameValue } from '../contracts/validation.ts';
import { budgetSummary } from '../contracts/budget.ts';
import type { RunSnapshot } from './run-types.ts';
import type { PublicValidationAuthorization, PublicValidationFundingBinding, PublicValidationFundingRecord } from './public-validation-funding-types.ts';
import { requireSeparateRequirementsRoot, validateConfirmedRequirementsSource } from './confirmed-requirements-source.ts';

export const fundingHash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
export const fundingTaskId = (fundingId: string) => `public-funding-${fundingId}`;
export const fundingClosureId = (fundingId: string) => `public-funding-close-${fundingId}`;
export function fundingFields(value: unknown, fields: string[]): asserts value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !sameValue(Object.keys(value).sort(), [...fields].sort())) throw new Error('Public funding has unexpected or missing fields.');
}
export function fundingTime(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('Invalid public funding timestamp.');
}
function digest(value: unknown) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid public funding source hash.'); }
const identities = ['fundingId', 'sharedRoot', 'sharedRunId', 'sharedLedgerId', 'runRoot', 'runId', 'ledgerId', 'limits'];
function identity(value: PublicValidationFundingBinding | PublicValidationAuthorization) {
  for (const key of ['fundingId', 'sharedRunId', 'sharedLedgerId', 'runId', 'ledgerId'] as const) id(value[key]);
  id(fundingTaskId(value.fundingId)); id(fundingClosureId(value.fundingId));
  for (const path of [value.runRoot, value.sharedRoot]) if (!isAbsolute(path) || resolve(path) !== path) throw new Error('Public funding requires canonical absolute roots.');
  if (within(value.sharedRoot, value.runRoot) || within(value.runRoot, value.sharedRoot)) throw new Error('Public funding roots must be separate.');
  validateRunLimits(value.limits);
}
export function validateFundingAuthorization(value: unknown): asserts value is PublicValidationAuthorization {
  const v2 = (value as PublicValidationAuthorization)?.formatVersion === 'public-validation-authorization/2';
  fundingFields(value, ['formatVersion', ...identities, 'brief', 'renderFrames', 'decisionId', 'actorId', 'decidedAt', 'sourceRefs', ...(v2 ? ['requirementsSource'] : [])]);
  const input = value as unknown as PublicValidationAuthorization;
  if (!['public-validation-authorization/1', 'public-validation-authorization/2'].includes(input.formatVersion) || typeof input.brief !== 'string' || !input.brief.trim()
    || typeof input.renderFrames !== 'boolean' || typeof input.actorId !== 'string' || !input.actorId.trim()) throw new Error('Invalid public funding authorization.');
  identity(input); id(input.decisionId); fundingTime(input.decidedAt); evidenceReferences(input.sourceRefs);
  if (v2) {
    validateConfirmedRequirementsSource(input.requirementsSource); requireSeparateRequirementsRoot(input.runRoot, input.requirementsSource);
    if (input.runId === input.requirementsSource.runId) throw new Error('Public funding requires a new attempt identity.');
  }
}
export function validateFundingBinding(value: unknown): asserts value is PublicValidationFundingBinding {
  fundingFields(value, ['formatVersion', ...identities, 'authorization', 'authorizationSha256']);
  const input = value as unknown as PublicValidationFundingBinding;
  if (input.formatVersion !== 'public-validation-binding/1') throw new Error('Invalid public funding binding.');
  identity(input); evidenceReferences([input.authorization]); digest(input.authorizationSha256);
}
export function fundingBinding(input: PublicValidationAuthorization, authorization: PublicValidationFundingBinding['authorization'], bytes: Uint8Array): PublicValidationFundingBinding {
  validateFundingAuthorization(input);
  const { fundingId, sharedRoot, sharedRunId, sharedLedgerId, runRoot, runId, ledgerId, limits } = input;
  return { formatVersion: 'public-validation-binding/1', fundingId, sharedRoot, sharedRunId, sharedLedgerId, runRoot, runId, ledgerId,
    limits: structuredClone(limits), authorization: structuredClone(authorization), authorizationSha256: fundingHash(bytes) };
}
export function publicFundingExposure(state: Pick<RunSnapshot, 'publicValidationFundings'>) {
  const records = state.publicValidationFundings ?? [];
  return { heldMicroCny: records.filter(record => record.settlement?.outcome !== 'closed').reduce((sum, record) => sum + record.binding.limits.limitMicroCny, 0),
    overrun: records.some(record => record.settlement?.outcome === 'overrun') };
}
export function requireLegacyFundingAvailable(state: Pick<RunSnapshot, 'publicValidationFundings'>) {
  const exposure = publicFundingExposure(state);
  if (exposure.heldMicroCny || exposure.overrun) throw new Error('Public funding holds or overrun block new validation case dispatch.');
}
export function publicFundingClosures(state: Pick<RunSnapshot, 'publicValidationFundings'>) {
  return (state.publicValidationFundings ?? []).filter(record => record.settlement?.outcome === 'closed')
    .map(record => ({ taskId: record.taskId, decisionId: fundingClosureId(record.binding.fundingId), releasedMicroCny: record.settlement!.releasedMicroCny }));
}
export function fundedIntakeWork(state: Pick<RunSnapshot, 'events' | 'validationFunding'>) {
  const pending = new Map<string, { workId: string; ownerToken: string; kind: string }>();
  const seen = new Set<string>(), recoveries: { work: { workId: string; ownerToken: string; kind: string }; source: import('../contracts/types.ts').ArtifactReference; sourceSha256: string }[] = [];
  for (const event of state.events.filter(event => event.type.startsWith('public_intake_'))) {
    if (!state.validationFunding || event.requestId !== null) throw new Error('Unbound public intake cleanup history.');
    if (event.type === 'public_intake_work_started') {
      const work = JSON.parse(event.reason); fundingFields(work, ['workId', 'ownerToken', 'kind']);
      id(work.workId); id(work.ownerToken);
      if (!['session', 'interview'].includes(work.kind) || seen.has(work.workId)) throw new Error('Invalid public intake work identity.');
      seen.add(work.workId); pending.set(work.workId, { workId: work.workId, ownerToken: work.ownerToken, kind: work.kind });
    } else if (event.type === 'public_intake_work_finished') {
      if (!pending.delete(event.reason)) throw new Error('Public intake work finish has no original start.');
    } else if (event.type === 'public_intake_work_recovered') {
      const recovered = JSON.parse(event.reason); fundingFields(recovered, ['workId', 'source', 'sourceSha256']);
      const work = pending.get(recovered.workId);
      if (!work) throw new Error('Public intake recovery has no original work.');
      evidenceReferences([recovered.source]); digest(recovered.sourceSha256);
      recoveries.push({ work, source: recovered.source, sourceSha256: recovered.sourceSha256 }); pending.delete(work.workId);
    } else if (event.type === 'public_intake_drained') {
      const proof = JSON.parse(event.reason); fundingFields(proof, ['nonceSha256']);
      digest(proof.nonceSha256);
      if (pending.size) throw new Error('Public intake cleanup is not drained.');
    }
  }
  return { pending: [...pending.values()], recoveries };
}
/** Pure validation: every extra request and closure must belong to a fixed public settlement. */
export function validatePublicValidationFundings(state: RunSnapshot): void {
  fundedIntakeWork(state);
  if (state.validationFunding !== undefined) {
    validateFundingBinding(state.validationFunding);
    if (state.formatVersion !== 1 || state.run.kind !== 'runtime_generation' || state.ledger.scope !== 'generation'
      || state.validationFunding.runId !== state.run.runId || state.validationFunding.ledgerId !== state.ledger.ledgerId
      || state.validationFunding.limits.limitMicroCny !== state.ledger.limitMicroCny
      || state.validationFunding.limits.durationMs !== Date.parse(state.run.originalDeadlineAt) - Date.parse(state.run.originalStartedAt)) throw new Error('Public funding child identity changed.');
  }
  const records = state.publicValidationFundings;
  if (records === undefined) {
    if (state.requests.some(record => record.publicFunding) || state.events.some(event => event.type.startsWith('public_funding_'))) throw new Error('Missing public funding source.');
    return;
  }
  if (state.formatVersion !== 3 || state.run.kind !== 'evaluation' || state.ledger.scope !== 'validation' || !Array.isArray(records) || !records.length
    || state.validationFunding !== undefined || !['3.0.0', '4.0.0', '5.0.0'].includes(state.ledger.contractVersion)) throw new Error('Invalid shared public funding profile.');
  const names = new Set<string>(), roots = new Set<string>(), requests = new Set<string>();
  for (const record of records) {
    fundingFields(record, ['binding', 'taskId', 'claimedAt', 'basisRevision', ...(record.settlement ? ['settlement'] : [])]);
    validateFundingBinding(record.binding); fundingTime(record.claimedAt);
    const b = record.binding;
    if (names.has(b.fundingId) || roots.has(b.runRoot.toLowerCase()) || record.taskId !== fundingTaskId(b.fundingId)
      || b.sharedRunId !== state.run.runId || b.sharedLedgerId !== state.ledger.ledgerId || !Number.isSafeInteger(record.basisRevision)
      || record.basisRevision < 1 || record.basisRevision >= state.revision
      || !state.ledger.allocations.some(grant => grant.taskId === record.taskId && grant.amountMicroCny === b.limits.limitMicroCny)
      || state.validation!.cases.some(window => Object.values(window.quote.declaration.grants).some(grant => grant.taskId === record.taskId))
      || state.tasks.some(task => task.taskId === record.taskId)) throw new Error('Public funding grant identity changed.');
    names.add(b.fundingId); roots.add(b.runRoot.toLowerCase());
    const matches = state.events.filter(event => event.type === 'public_funding_reserved' && event.reason === b.fundingId);
    if (matches.length !== 1 || matches[0].at !== record.claimedAt || matches[0].requestId !== null) throw new Error('Missing public funding reservation event.');
    const settled = record.settlement;
    if (!settled) {
      if (state.ledger.entries.some(entry => entry.taskId === record.taskId) || state.ledger.allocationClosures?.some(row => row.taskId === record.taskId)) throw new Error('Open public funding cannot release or import costs.');
      continue;
    }
    fundingFields(settled, ['settledAt', 'outcome', 'source', 'sourceSha256', 'settledMicroCny', 'releasedMicroCny', 'requests']);
    fundingTime(settled.settledAt); evidenceReferences([settled.source]); digest(settled.sourceSha256);
    if (!Array.isArray(settled.requests) || !['closed', 'overrun'].includes(settled.outcome)) throw new Error('Invalid public funding settlement.');
    let total = 0;
    for (const original of settled.requests) {
      fundingFields(original, ['entry', 'admittedAt']); const e = original.entry;
      fundingFields(e, ['requestId', 'taskId', 'provider', 'pricingVersion', 'reservedMicroCny', 'settledMicroCny', 'unknown', 'status', 'evidence']);
      for (const value of [e.requestId, e.taskId, e.provider, e.pricingVersion]) if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid public funding request identity.');
      evidenceReferences(e.evidence);
      if (!e || !['settled', 'cancelled'].includes(e.status) || e.reservedMicroCny || e.unknown || !Number.isSafeInteger(e.settledMicroCny) || e.settledMicroCny < 0
        || requests.has(e.requestId)) throw new Error('Public funding requires unique closed original requests.');
      if (original.admittedAt !== null) fundingTime(original.admittedAt);
      if (e.status === 'settled' && original.admittedAt === null || e.status === 'cancelled' && e.settledMicroCny !== 0) throw new Error('Public funding charge lacks original admission.');
      requests.add(e.requestId); total += e.settledMicroCny;
      const imported = state.ledger.entries.find(entry => entry.requestId === e.requestId), admission = state.requests.find(row => row.requestId === e.requestId);
      if (settled.outcome === 'closed' && (!sameValue(imported, { ...e, taskId: record.taskId }) || !sameValue(admission, { requestId: e.requestId,
        admittedAt: original.admittedAt, publicFunding: { fundingId: b.fundingId, sourceTaskId: e.taskId } }))) throw new Error('Public funding request lost its original source.');
      if (settled.outcome === 'overrun' && imported) throw new Error('Public overrun cannot import beyond the original shared grant.');
    }
    if (state.ledger.entries.filter(entry => entry.taskId === record.taskId).length !== (settled.outcome === 'closed' ? settled.requests.length : 0)) throw new Error('Public funding contains an unowned imported entry.');
    if (!Number.isSafeInteger(total) || total !== settled.settledMicroCny || (settled.outcome === 'closed'
      ? total > b.limits.limitMicroCny || settled.releasedMicroCny !== b.limits.limitMicroCny - total
      : total <= b.limits.limitMicroCny || settled.releasedMicroCny !== 0)) throw new Error('Public funding settlement amount changed.');
    const closure = state.ledger.allocationClosures?.filter(row => row.taskId === record.taskId) ?? [];
    if (!sameValue(closure, settled.outcome === 'closed' ? [{ taskId: record.taskId, decisionId: fundingClosureId(b.fundingId), releasedMicroCny: settled.releasedMicroCny }] : [])) throw new Error('Public funding closure differs from settlement.');
    const events = state.events.filter(event => event.type === 'public_funding_settled' && event.reason === b.fundingId);
    if (events.length !== 1 || events[0].at !== settled.settledAt || events[0].requestId !== null) throw new Error('Missing public funding settlement event.');
  }
  for (const row of state.requests.filter(row => row.publicFunding)) if (!requests.has(row.requestId)) throw new Error('Unowned public funding request.');
  if (state.events.filter(event => event.type === 'public_funding_reserved').length !== records.length
    || state.events.filter(event => event.type === 'public_funding_settled').length !== records.filter(row => row.settlement).length
    || budgetSummary(state.ledger).committedMicroCny + publicFundingExposure(state).heldMicroCny > 30_000_000) throw new Error('Public funding exceeds the original phase or event history.');
}
