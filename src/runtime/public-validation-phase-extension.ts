import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { regularFile, safePath } from '../artifacts/paths.ts';
import { budgetCapacity, budgetSummary } from '../contracts/budget.ts';
import { sameValue } from '../contracts/validation.ts';
import { SnapshotStore } from './store.ts';
import { validateSnapshot } from './run-validation.ts';
import { requireNoRegistryWriter } from './window-idle.ts';
import { sharedSources } from './public-validation-funding.ts';
import { phaseDecisionIds, phaseHash, phaseHistoryHash, phaseSuccessorHistoryHash, requirePhaseHistoryStopped, validatePhaseQuote, validatePhaseSuccessorQuote, verifyPhaseDecision, verifyPhaseSuccessorDecision } from './public-validation-phase-validation.ts';
import type { RunSnapshot } from './run-types.ts';
import type { PublicValidationPhaseDecision, PublicValidationPhaseOptions, PublicValidationPhaseQuote, PublicValidationPhaseReceipt, PublicValidationPhaseSuccessorDecision, PublicValidationPhaseSuccessorQuote, PublicValidationPhaseSuccessorReceipt } from './public-validation-phase-types.ts';

async function absentOwner(root: string) {
  const path = await safePath(root, '.controller.lock');
  if (await lstat(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) throw new Error('Public phase owner or child drain is unresolved.');
  await requireNoRegistryWriter(root);
}
async function idle(options: PublicValidationPhaseOptions, state: RunSnapshot, owned: boolean) {
  for (const root of [options.root, options.repositoryRoot]) {
    if (!isAbsolute(root) || resolve(root) !== root || await realpath(await safePath(root)) !== root) throw new Error('Public phase requires original canonical roots.');
  }
  if (owned) await requireNoRegistryWriter(options.root); else await absentOwner(options.root);
  for (const window of state.validation!.cases) {
    const root = await safePath(options.repositoryRoot, `.cosmos/e2e/${window.caseId}`);
    if (!(await lstat(root)).isDirectory()) throw new Error('Public phase historical case root is missing.');
    await absentOwner(root);
  }
  for (const record of state.publicValidationFundings ?? []) {
    if (record.binding.sharedRoot !== options.root) throw new Error('Public phase historical funding root changed.');
    await safePath(record.binding.runRoot); await absentOwner(record.binding.runRoot);
  }
}
async function quoteFor(options: PublicValidationPhaseOptions, state: RunSnapshot, bytes: Buffer, owned: boolean): Promise<PublicValidationPhaseQuote> {
  if (state.publicValidationPhaseExtension) throw new Error('Public validation phase was already extended.');
  requirePhaseHistoryStopped(state); await idle(options, state, owned); await sharedSources(options.root, state);
  const basis: PublicValidationPhaseQuote['basis'] = {
    runId: state.run.runId, ledgerId: state.ledger.ledgerId, revision: state.revision, snapshotSha256: phaseHash(bytes),
    committedMicroCny: budgetSummary(state.ledger).committedMicroCny, heldMicroCny: 0, allocatedMicroCny: budgetCapacity(state.ledger).allocatedMicroCny,
    allocationCount: state.ledger.allocations.length, entryCount: state.ledger.entries.length, requestCount: state.requests.length,
    caseCount: state.validation!.cases.length, taskCount: state.tasks.length, closureCount: state.ledger.allocationClosures?.length ?? 0,
    fundingCount: state.publicValidationFundings?.length ?? 0, eventCount: state.events.length, historySha256: '',
  };
  basis.historySha256 = phaseHistoryHash(state, basis);
  const value: Omit<PublicValidationPhaseQuote, 'quoteId'> = {
    formatVersion: 'public-validation-phase-quote/1', scope: 'public_validation_funding', activationAllowed: false,
    sharedRoot: options.root, repositoryRoot: options.repositoryRoot,
    fromMicroCny: 30_000_000, toMicroCny: 40_000_000, lifetimeMicroCny: 150_000_000, maxRunMicroCny: 5_000_000, maxDurationMs: 1_800_000, basis,
  };
  const quote = { ...value, quoteId: `pvpq1-${phaseHash(JSON.stringify(value))}` }; validatePhaseQuote(quote, state);
  await idle(options, state, owned);
  if (!bytes.equals(await regularFile(options.root, 'snapshot.json'))) throw new Error('Public phase snapshot changed during preparation.');
  return quote;
}

/** Read only: no owner lock, clock, allocation or provider work is created. */
export async function preparePublicValidationPhaseExtension(options: PublicValidationPhaseOptions): Promise<PublicValidationPhaseQuote> {
  const bytes = await regularFile(options.root, 'snapshot.json'), state = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  validateSnapshot(state); return quoteFor(options, state, bytes, false);
}

/** Only an independent operator budget decision can append this one-time receipt. */
export async function applyPublicValidationPhaseExtension(options: PublicValidationPhaseOptions & { quote: PublicValidationPhaseQuote; decision: PublicValidationPhaseDecision }): Promise<PublicValidationPhaseReceipt> {
  const quote = structuredClone(options.quote), decision = structuredClone(options.decision), now = options.now ?? Date.now;
  if (quote.sharedRoot !== options.root || quote.repositoryRoot !== options.repositoryRoot) throw new Error('Public phase quote roots changed.');
  const store = await SnapshotStore.acquire(options.root);
  try {
    const state = await store.read(); validateSnapshot(state); validatePhaseQuote(quote, state);
    const operatorDecision = await verifyPhaseDecision(store.root, quote, decision, now());
    const decisions = await sharedSources(store.root, state), existing = state.publicValidationPhaseExtension;
    if (existing) {
      if (!sameValue(existing.quote, quote) || !sameValue(existing.operatorDecision, operatorDecision)) throw new Error('Public phase extension conflicts with its original decision.');
      return structuredClone(existing);
    }
    if (decisions.has(decision.decisionId) || phaseDecisionIds(state).includes(decision.decisionId)) throw new Error('Public phase decision identity was already consumed.');
    const bytes = await regularFile(store.root, 'snapshot.json');
    if (state.revision !== quote.basis.revision || phaseHash(bytes) !== quote.basis.snapshotSha256) throw new Error('Public phase quote is stale.');
    if (!sameValue(await quoteFor(options, state, bytes, true), quote)) throw new Error('Public phase quote or history changed.');
    await sharedSources(store.root, state); await idle(options, state, true);
    if (!sameValue(await verifyPhaseDecision(store.root, quote, decision, now()), operatorDecision)
      || !bytes.equals(await regularFile(store.root, 'snapshot.json'))) throw new Error('Public phase decision or snapshot changed before commit.');
    const receipt: PublicValidationPhaseReceipt = { activationAllowed: false, appliedAt: new Date(now()).toISOString(), quote, operatorDecision };
    const next = structuredClone(state); next.publicValidationPhaseExtension = receipt; next.revision++;
    next.events.push({ sequence: next.events.length + 1, at: receipt.appliedAt, type: 'public_validation_phase_extended', requestId: null,
      reason: JSON.stringify({ quoteId: quote.quoteId, decisionId: decision.decisionId }) });
    validateSnapshot(next); await store.write(next); return structuredClone(receipt);
  } finally { await store.close(); }
}

async function successorQuoteFor(options: PublicValidationPhaseOptions & { toMicroCny: number }, state: RunSnapshot, bytes: Buffer, owned: boolean): Promise<PublicValidationPhaseSuccessorQuote> {
  if (state.publicValidationPhaseSuccessor) throw new Error('Public validation phase successor was already applied.');
  const original = state.publicValidationPhaseExtension;
  if (!original) throw new Error('Public validation phase successor requires the original forty phase.');
  requirePhaseHistoryStopped(state); await idle(options, state, owned); await sharedSources(options.root, state);
  const basis: PublicValidationPhaseSuccessorQuote['basis'] = {
    runId: state.run.runId, ledgerId: state.ledger.ledgerId, revision: state.revision, snapshotSha256: phaseHash(bytes),
    committedMicroCny: budgetSummary(state.ledger).committedMicroCny, heldMicroCny: 0, allocatedMicroCny: budgetCapacity(state.ledger).allocatedMicroCny,
    allocationCount: state.ledger.allocations.length, entryCount: state.ledger.entries.length, requestCount: state.requests.length,
    caseCount: state.validation!.cases.length, taskCount: state.tasks.length, closureCount: state.ledger.allocationClosures?.length ?? 0,
    fundingCount: state.publicValidationFundings?.length ?? 0, eventCount: state.events.length, historySha256: '',
  };
  basis.historySha256 = phaseSuccessorHistoryHash(state, basis);
  const value: Omit<PublicValidationPhaseSuccessorQuote, 'quoteId'> = {
    formatVersion: 'public-validation-phase-successor-quote/1', scope: 'public_validation_funding', activationAllowed: false,
    sharedRoot: options.root, repositoryRoot: options.repositoryRoot,
    fromMicroCny: 40_000_000, toMicroCny: options.toMicroCny, lifetimeMicroCny: 150_000_000, maxRunMicroCny: 5_000_000, maxDurationMs: 1_800_000,
    predecessor: { quoteId: original.quote.quoteId, decisionId: original.operatorDecision.decisionId,
      receiptSha256: phaseHash(JSON.stringify(original)), sourceSha256: original.operatorDecision.sourceSha256 }, basis,
  };
  const quote = { ...value, quoteId: `pvpsq1-${phaseHash(JSON.stringify(value))}` }; validatePhaseSuccessorQuote(quote, state);
  await idle(options, state, owned);
  if (!bytes.equals(await regularFile(options.root, 'snapshot.json'))) throw new Error('Public phase snapshot changed during preparation.');
  return quote;
}

/** One explicit successor proposal; preparing it never acquires an owner or changes authority. */
export async function preparePublicValidationPhaseSuccessor(options: PublicValidationPhaseOptions & { toMicroCny: number }): Promise<PublicValidationPhaseSuccessorQuote> {
  const bytes = await regularFile(options.root, 'snapshot.json'), state = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  validateSnapshot(state); return successorQuoteFor(options, state, bytes, false);
}

/** Append a separate decision while preserving the original forty-phase receipt. */
export async function applyPublicValidationPhaseSuccessor(options: PublicValidationPhaseOptions & { quote: PublicValidationPhaseSuccessorQuote; decision: PublicValidationPhaseSuccessorDecision }): Promise<PublicValidationPhaseSuccessorReceipt> {
  const quote = structuredClone(options.quote), decision = structuredClone(options.decision), now = options.now ?? Date.now;
  if (quote.sharedRoot !== options.root || quote.repositoryRoot !== options.repositoryRoot) throw new Error('Public phase successor quote roots changed.');
  const store = await SnapshotStore.acquire(options.root);
  try {
    const state = await store.read(); validateSnapshot(state); validatePhaseSuccessorQuote(quote, state);
    const original = state.publicValidationPhaseExtension!;
    const operatorDecision = await verifyPhaseSuccessorDecision(store.root, quote, decision, original, now());
    const decisions = await sharedSources(store.root, state), existing = state.publicValidationPhaseSuccessor;
    if (existing) {
      if (!sameValue(existing.quote, quote) || !sameValue(existing.operatorDecision, operatorDecision)) throw new Error('Public phase successor conflicts with its original decision.');
      return structuredClone(existing);
    }
    if (decision.decisionId === original.operatorDecision.decisionId || decisions.has(decision.decisionId) || phaseDecisionIds(state).includes(decision.decisionId)) throw new Error('Public phase decision identity was already consumed.');
    const bytes = await regularFile(store.root, 'snapshot.json');
    if (state.revision !== quote.basis.revision || phaseHash(bytes) !== quote.basis.snapshotSha256) throw new Error('Public phase successor quote is stale.');
    if (!sameValue(await successorQuoteFor({ ...options, toMicroCny: quote.toMicroCny }, state, bytes, true), quote)) throw new Error('Public phase successor quote or history changed.');
    await sharedSources(store.root, state); await idle(options, state, true);
    if (!sameValue(await verifyPhaseSuccessorDecision(store.root, quote, decision, original, now()), operatorDecision)
      || !bytes.equals(await regularFile(store.root, 'snapshot.json'))) throw new Error('Public phase decision or snapshot changed before commit.');
    const receipt: PublicValidationPhaseSuccessorReceipt = { activationAllowed: false, appliedAt: new Date(now()).toISOString(), quote, operatorDecision };
    const next = structuredClone(state); next.publicValidationPhaseSuccessor = receipt; next.revision++;
    next.events.push({ sequence: next.events.length + 1, at: receipt.appliedAt, type: 'public_validation_phase_successor_applied', requestId: null,
      reason: JSON.stringify({ quoteId: quote.quoteId, decisionId: decision.decisionId }) });
    validateSnapshot(next); await store.write(next); return structuredClone(receipt);
  } finally { await store.close(); }
}
