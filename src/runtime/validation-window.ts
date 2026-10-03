import { isAbsolute } from 'node:path';
import { regularFile, safePath } from '../artifacts/paths.ts';
import { evidenceReferences, nonEmpty } from '../budget/ledger.ts';
import { budgetCapacity, budgetSummary, validateLedgerUpdate, validateRunUpdate } from '../contracts/index.ts';
import { sameValue } from '../contracts/validation.ts';
import { SnapshotStore } from './store.ts';
import { validateSnapshot } from './run-validation.ts';
import { requireNoRegistryWriter } from './window-idle.ts';
import { currentValidationCase, VALIDATION_ROLES, validateValidationDeclaration, validationHash, validationInputHash } from './validation-validation.ts';
import type { RunSnapshot } from './run-types.ts';
import type { ClaimValidationCaseOptions, OperatorValidationDecision, ValidationCaseQuote, ValidationCaseWindow, ValidationContextOptions, ValidationDeclaration, ValidationIdentity } from './validation-types.ts';
export { validationInputHash } from './validation-validation.ts';

const at = (value: number) => { if (!Number.isSafeInteger(value) || !Number.isFinite(new Date(value).getTime())) throw new Error('Invalid validation clock.'); return new Date(value).toISOString(); };

/** Host readers are read-only: late completion after timeout can never publish authority. */
export async function verifyValidationIdentity(options: ValidationContextOptions, declaration: ValidationDeclaration, expected?: ValidationIdentity, deadlineAt?: string) {
  if (!isAbsolute(options.root) || !isAbsolute(options.repositoryRoot) || typeof options.identityReader !== 'function') throw new Error('Validation requires explicit roots and a trusted identity reader.');
  const timeout = options.identityTimeoutMs ?? 5000, now = options.now ?? Date.now;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 5000) throw new Error('Identity reader timeout must be within five seconds.');
  const remaining = deadlineAt ? Date.parse(deadlineAt) - now() - 5000 : timeout;
  if (remaining <= 0) throw new Error('Validation deadline cannot cover identity checking and cleanup.');
  options.signal?.throwIfAborted();
  const abort = new AbortController(), signal = options.signal ? AbortSignal.any([options.signal, abort.signal]) : abort.signal;
  let timer: ReturnType<typeof setTimeout> | undefined, onAbort!: () => void;
  const cancelled = new Promise<never>((_, reject) => { onAbort = () => reject(signal.reason ?? new Error('Validation identity check aborted.')); signal.addEventListener('abort', onAbort, { once: true }); });
  const work = (async () => {
    await safePath(options.repositoryRoot);
    signal.throwIfAborted();
    const identity = await options.identityReader(signal);
    signal.throwIfAborted();
    if (!identity || !/^[a-f0-9]{40}$/.test(identity.reviewedPlatformSha) || identity.frozenCaseInputHash !== validationInputHash(declaration)
      || expected && !sameValue(identity, expected)) throw new Error('Reviewed platform or frozen input identity changed.');
    let requirements: ValidationCaseQuote['requirements'] | undefined;
    for (const file of [declaration.inputs.requirements, ...declaration.inputs.template.files]) {
      signal.throwIfAborted(); const bytes = await regularFile(options.repositoryRoot, file.path);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (validationHash(bytes) !== file.sha256) throw new Error(`Fixed validation input changed: ${file.path}`);
      if (file.path === declaration.inputs.requirements.path) {
        const value = JSON.parse(text);
        if (value.requirementVersion !== declaration.inputs.requirements.version || typeof value.specVersion !== 'string' || !value.specVersion.trim()
          || !Array.isArray(value.acceptanceIds) || !value.acceptanceIds.length || !Array.isArray(value.stageAcceptanceIds) || value.stageAcceptanceIds.length !== 2
          || [...value.acceptanceIds, ...value.stageAcceptanceIds].some(id => typeof id !== 'string' || !id.trim())
          || new Set([...value.acceptanceIds, ...value.stageAcceptanceIds]).size !== value.acceptanceIds.length + 2) throw new Error('Invalid frozen case requirement identity or acceptance IDs.');
        requirements = { specVersion: value.specVersion, requirementVersion: value.requirementVersion, acceptanceIds: value.acceptanceIds, stageAcceptanceIds: value.stageAcceptanceIds };
      }
    }
    signal.throwIfAborted(); return { identity: structuredClone(identity), requirements: requirements! };
  })();
  timer = setTimeout(() => abort.abort(new Error('Validation identity reader timed out.')), Math.min(timeout, remaining));
  try {
    const result = await Promise.race([work, cancelled]);
    signal.throwIfAborted();
    if (deadlineAt && now() >= Date.parse(deadlineAt) - 5000) throw new Error('Validation deadline changed while checking identity.');
    return result;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort); abort.abort(new Error('Identity check completed.')); }
}

function eligible(state: RunSnapshot, declaration: ValidationDeclaration, now: number): void {
  if (![1, 3].includes(state.formatVersion) || state.run.kind !== 'evaluation' || state.ledger.scope !== 'validation' || !['1.0.0', '3.0.0'].includes(state.ledger.contractVersion) || state.ledger.limitMicroCny !== declaration.limits.lifetimeMicroCny) throw new Error('Use the original shared validation ledger; formal generation is not this profile.');
  if (state.stopReason?.code === 'charge_overrun' || state.validation?.cases.some(item => item.stopReason?.code === 'charge_overrun')) throw new Error('Historical validation overrun requires separate resolution.');
  if (state.ledger.entries.some(entry => entry.reservedMicroCny || entry.unknown || !['settled', 'cancelled'].includes(entry.status))) throw new Error('Unknown or reserved historical charges require reconciliation.');
  if (state.formatVersion === 1 && !state.stopReason && now < Date.parse(state.run.originalDeadlineAt)) throw new Error('Original validation window is still active.');
  if (state.formatVersion === 3) {
    const previous = currentValidationCase(state);
    if (!previous.stopReason && now < Date.parse(previous.deadlineAt)) throw new Error('A validation case is still active.');
    if (state.validation!.cases.some(item => item.caseId === declaration.caseId)) throw new Error('Validation case was already claimed; never reset or rename it.');
  }
  const grants = VALIDATION_ROLES.map(role => declaration.grants[role]);
  if (grants.some(grant => state.run.taskIds.includes(grant.taskId))) throw new Error('Case grant identity already exists.');
  const committed = budgetSummary(state.ledger).committedMicroCny, allocated = budgetCapacity(state.ledger).allocatedMicroCny;
  if (committed >= declaration.limits.cumulativeMicroCny || grants.reduce((sum, grant) => sum + grant.amountMicroCny, allocated) > state.ledger.limitMicroCny) throw new Error('Shared unallocated budget or first-phase budget is insufficient.');
}

export async function prepareValidationCase(options: ValidationContextOptions & { declaration: ValidationDeclaration }): Promise<ValidationCaseQuote> {
  const declaration = structuredClone(options.declaration); validateValidationDeclaration(declaration);
  const bytes = await regularFile(options.root, 'snapshot.json'), state = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); validateSnapshot(state);
  eligible(state, declaration, (options.now ?? Date.now)());
  const observed = await verifyValidationIdentity(options, declaration);
  if (observed.requirements.specVersion !== state.run.specVersion) throw new Error('Frozen validation requirements differ from the original spec version.');
  if (!bytes.equals(await regularFile(options.root, 'snapshot.json'))) throw new Error('Validation baseline changed during quote preparation.');
  const value: Omit<ValidationCaseQuote, 'quoteId'> = {
    formatVersion: 'validation-case-quote-1', profile: 'operator_validation', activationAllowed: false, declaration, ...observed,
    basis: { runId: state.run.runId, ledgerId: state.ledger.ledgerId, specVersion: state.run.specVersion, revision: state.revision, snapshotSha256: validationHash(bytes),
      originalStartedAt: state.run.originalStartedAt, originalDeadlineAt: state.run.originalDeadlineAt, originalLimitMicroCny: state.ledger.limitMicroCny, stopReason: state.stopReason,
      committedMicroCny: budgetSummary(state.ledger).committedMicroCny, allocatedMicroCny: budgetCapacity(state.ledger).allocatedMicroCny, requestIds: state.ledger.entries.map(entry => entry.requestId) },
  };
  return { ...value, quoteId: `vq1-${validationHash(JSON.stringify(value))}` };
}

export async function verifyOperatorDecision(root: string, quote: ValidationCaseQuote, decision: OperatorValidationDecision, now: number) {
  if (decision.kind !== 'operator_validation' || Object.keys(decision).some(key => !['kind', 'decisionId', 'actorId', 'decidedAt', 'source', 'sourceRefs'].includes(key))) throw new Error('Only a real operator validation decision is accepted.');
  for (const key of ['decisionId', 'actorId', 'decidedAt'] as const) nonEmpty(decision[key], key);
  if (!Number.isFinite(Date.parse(decision.decidedAt)) || new Date(decision.decidedAt).toISOString() !== decision.decidedAt || Date.parse(decision.decidedAt) > now) throw new Error('Invalid operator decision time.');
  evidenceReferences([decision.source]); evidenceReferences(decision.sourceRefs);
  const bytes = await regularFile(root, decision.source.location), receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!sameValue(receipt, { formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId: decision.decisionId, actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote })) throw new Error('Operator source does not authorize this exact validation quote.');
  return { ...structuredClone(decision), sourceSha256: validationHash(bytes) };
}

/** Atomic claim consumes a case once. It returns its record, never an executor or a second ledger. */
export async function claimValidationCase(options: ClaimValidationCaseOptions): Promise<ValidationCaseWindow> {
  const quote = structuredClone(options.quote), decision = structuredClone(options.decision), now = options.now ?? Date.now;
  const store = await SnapshotStore.acquire(options.root);
  try {
    const previous = await store.read(); validateSnapshot(previous); validateValidationDeclaration(quote.declaration);
    await requireNoRegistryWriter(store.root);
    const observed = await verifyValidationIdentity(options, quote.declaration, quote.identity);
    const operatorDecision = await verifyOperatorDecision(store.root, quote, decision, now());
    const existing = previous.validation?.cases.find(item => item.operatorDecision.decisionId === decision.decisionId);
    if (existing) {
      if (!sameValue(existing.quote, quote) || !sameValue(existing.operatorDecision, operatorDecision)) throw new Error('Operator decision conflicts with its consumed validation case.');
      return structuredClone(existing);
    }
    eligible(previous, quote.declaration, now());
    const bytes = await regularFile(store.root, 'snapshot.json');
    if (previous.revision !== quote.basis.revision || validationHash(bytes) !== quote.basis.snapshotSha256 || !sameValue(observed.requirements, quote.requirements)) throw new Error('Validation baseline or quote is stale.');
    const { quoteId, ...payload } = quote;
    if (quoteId !== `vq1-${validationHash(JSON.stringify(payload))}`) throw new Error('Validation quote was altered.');
    const next = structuredClone(previous), startedAt = at(now());
    const event = (type: 'stopped' | 'validation_case_claimed' | 'validation_case_stopped', reason: string) => next.events.push({ sequence: next.events.length + 1, at: startedAt, type, requestId: null, reason });
    if (!next.stopReason && now() >= Date.parse(next.run.originalDeadlineAt)) {
      next.stopReason = { code: 'deadline', at: startedAt, reason: 'Original validation deadline reached before the new operator case.' }; next.run.state = 'waiting_user'; event('stopped', next.stopReason.reason);
    }
    if (next.formatVersion === 3) {
      const old = currentValidationCase(next);
      if (!old.stopReason) { old.stopReason = { code: 'deadline', at: startedAt, reason: 'Previous validation case deadline reached.' }; event('validation_case_stopped', old.stopReason.reason); }
    }
    const window: ValidationCaseWindow = { caseId: quote.declaration.caseId, windowId: `validation-${quoteId}`, claimedAt: startedAt, startedAt,
      deadlineAt: at(Date.parse(startedAt) + quote.declaration.limits.durationMs), stopReason: null, quote, operatorDecision, repair: null };
    next.formatVersion = 3;
    next.validation = { profile: 'operator_validation', currentCaseId: window.caseId, cases: [...(next.validation?.cases ?? []), window] };
    for (const role of VALIDATION_ROLES) { const grant = quote.declaration.grants[role]; next.ledger.allocations.push(structuredClone(grant)); next.run.taskIds.push(grant.taskId); }
    event('validation_case_claimed', `Operator ${decision.actorId} consumed case ${window.caseId}; no human requirement confirmation was created.`);
    next.revision++;
    validateSnapshot(next);
    const issues = [...validateLedgerUpdate(previous.ledger, next.ledger, { role: 'system', actorId: 'validation' }), ...validateRunUpdate(previous.run, next.run, { role: 'system', actorId: 'validation' })];
    if (issues.length) throw new Error(`Invalid validation claim: ${issues.map(item => item.message).join('; ')}`);
    await store.write(next); return structuredClone(window);
  } finally { await store.close(); }
}
