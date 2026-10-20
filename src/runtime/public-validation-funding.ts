import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { mkdir, readdir, realpath, lstat } from 'node:fs/promises';
import type { ArtifactReference } from '../contracts/types.ts';
import { budgetCapacity, budgetSummary } from '../contracts/budget.ts';
import { validateLedgerUpdate, validateRunUpdate } from '../contracts/index.ts';
import { sameValue } from '../contracts/validation.ts';
import { regularFile, safePath, within } from '../artifacts/paths.ts';
import { SnapshotStore } from './store.ts';
import { validateSnapshot } from './run-validation.ts';
import { publishReceipt } from './recovery/receipt-file.ts';
import { OwnerLock } from './recovery/ownership.ts';
import { requireNoRegistryWriter } from './window-idle.ts';
import { verifyValidationBudgetSources } from './validation-budget.ts';
import { reconcileRoleReceipt } from '../roles/provider-budget.ts';
import type { AccountingController } from '../roles/provider-budget.ts';
import type { IntakeSnapshot } from './intake.ts';
import type { RunSnapshot } from './run-types.ts';
import type { PublicValidationAuthorization, PublicValidationFundingBinding, PublicValidationFundingRecord } from './public-validation-funding-types.ts';
import { fundingBinding, fundingClosureId, fundingFields, fundingHash, fundingTaskId, publicFundingExposure, validateFundingAuthorization, validateFundingBinding } from './public-validation-funding-validation.ts';

const intentName = 'public-validation-origin.json';
const decode = (bytes: Uint8Array): any => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
async function optional(root: string, name: string): Promise<any | undefined> {
  try { return decode(await regularFile(root, name)); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
async function referenceBytes(root: string, ref: ArtifactReference) {
  const path = isAbsolute(ref.location) ? ref.location : resolve(root, ref.location);
  return regularFile(dirname(path), basename(path));
}
async function writeOnce(root: string, name: string, value: unknown) {
  await mkdir(dirname(await safePath(root, name)), { recursive: true });
  try { await publishReceipt(await safePath(root, name), value); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (!sameValue(decode(await regularFile(root, name)), value)) throw new Error('Public funding source or intent conflicts with its original receipt.');
  }
}
export async function readPublicValidationAuthorization(sharedRoot: string, authorization: ArtifactReference) {
  const ref = { ...authorization, location: isAbsolute(authorization.location) ? authorization.location : resolve(sharedRoot, authorization.location) };
  const bytes = await referenceBytes(sharedRoot, ref), payload = decode(bytes);
  validateFundingAuthorization(payload);
  if (within(payload.runRoot, ref.location)) throw new Error('Public funding authorization must be outside the generated run.');
  return { payload, binding: fundingBinding(payload, ref, bytes) };
}
export async function readPublicFundingIntent(root: string) {
  const intent = await optional(root, intentName);
  if (!intent) return undefined;
  fundingFields(intent, ['formatVersion', 'authorization', 'authorizationSha256']);
  if (intent.formatVersion !== 'public-validation-intent/1' || !isAbsolute(intent.authorization?.location ?? '')) throw new Error('Invalid public funding intent.');
  const result = await readPublicValidationAuthorization('', intent.authorization);
  if (result.binding.authorizationSha256 !== intent.authorizationSha256 || result.binding.runRoot !== resolve(root)) throw new Error('Public funding authorization or intent changed.');
  return result;
}
async function source(binding: PublicValidationFundingBinding) {
  validateFundingBinding(binding);
  const observed = await readPublicValidationAuthorization(binding.sharedRoot, binding.authorization);
  if (!sameValue(observed.binding, binding)) throw new Error('Public funding authorization source changed.');
  return observed.payload;
}
async function sharedSources(state: RunSnapshot) {
  for (const record of state.publicValidationFundings ?? []) {
    await source(record.binding);
    if (record.settlement) {
      const bytes = await referenceBytes(record.binding.sharedRoot, record.settlement.source), saved = decode(bytes);
      if (fundingHash(bytes) !== record.settlement.sourceSha256 || !sameValue(saved.binding, record.binding)
        || !sameValue(saved.requests, record.settlement.requests)) throw new Error('Public funding settlement source changed.');
    }
  }
}
async function commitShared(store: SnapshotStore, previous: RunSnapshot, next: RunSnapshot) {
  next.revision = previous.revision + 1;
  next.run.fees = {
    settledMicroCny: next.ledger.entries.reduce((sum, entry) => sum + entry.settledMicroCny, 0),
    reservedMicroCny: next.ledger.entries.reduce((sum, entry) => sum + entry.reservedMicroCny, 0),
    unknownRequestIds: next.ledger.entries.filter(entry => entry.unknown).map(entry => entry.requestId),
  };
  validateSnapshot(next);
  const issues = [...validateLedgerUpdate(previous.ledger, next.ledger, { role: 'system', actorId: 'public-funding' }),
    ...validateRunUpdate(previous.run, next.run, { role: 'system', actorId: 'public-funding' })];
  if (issues.length) throw new Error('Invalid public funding ledger update: ' + issues.map(row => row.message).join('; '));
  await store.write(next);
}

/** Whole-run allocation only; no provider request and no old case owner are created. */
export async function reservePublicValidationFunding(options: { sharedRoot: string; runRoot: string; authorization: ArtifactReference; now?: () => number }): Promise<PublicValidationFundingBinding> {
  const { payload, binding } = await readPublicValidationAuthorization(options.sharedRoot, options.authorization);
  const now = options.now ?? Date.now;
  if (binding.sharedRoot !== resolve(options.sharedRoot) || binding.runRoot !== resolve(options.runRoot) || Date.parse(payload.decidedAt) > now()) throw new Error('Public funding authorization does not match the requested roots or time.');
  await safePath(binding.runRoot); await safePath(binding.sharedRoot);
  await mkdir(binding.runRoot, { recursive: true });
  if (await realpath(binding.runRoot) !== binding.runRoot || await realpath(binding.sharedRoot) !== binding.sharedRoot) throw new Error('Public funding roots have aliases.');
  const child = await SnapshotStore.acquire(binding.runRoot);
  let shared: SnapshotStore | undefined;
  try {
    const existingIntent = await optional(binding.runRoot, intentName);
    if (!existingIntent && (await readdir(binding.runRoot)).some(name => name !== '.controller.lock')) throw new Error('Public funding requires an empty new run root.');
    await writeOnce(binding.runRoot, intentName, { formatVersion: 'public-validation-intent/1', authorization: binding.authorization, authorizationSha256: binding.authorizationSha256 });
    await readPublicFundingIntent(binding.runRoot);
    shared = await SnapshotStore.acquire(binding.sharedRoot);
    const state = await shared.read(); validateSnapshot(state); await requireNoRegistryWriter(binding.sharedRoot);
    await sharedSources(state); await verifyValidationBudgetSources(binding.sharedRoot, state);
    if (state.run.runId !== binding.sharedRunId || state.ledger.ledgerId !== binding.sharedLedgerId || state.formatVersion !== 3
      || state.ledger.limitMicroCny !== 150_000_000 || !['3.0.0', '4.0.0', '5.0.0'].includes(state.ledger.contractVersion)) throw new Error('Public funding requires the original audited shared ledger.');
    const existing = state.publicValidationFundings?.find(row => row.binding.fundingId === binding.fundingId);
    if (existing) {
      if (!sameValue(existing.binding, binding)) throw new Error('Public funding identity conflicts with its source.');
      return structuredClone(existing.binding);
    }
    const exposure = publicFundingExposure(state);
    if (exposure.overrun || state.stopReason?.code === 'charge_overrun' || state.validation!.cases.some(row => !row.stopReason || row.stopReason.code === 'charge_overrun')
      || state.ledger.entries.some(row => row.unknown || row.reservedMicroCny || !['settled', 'cancelled'].includes(row.status))) throw new Error('Public funding requires stopped and reconciled validation history.');
    const capacity = budgetCapacity(state.ledger);
    if (binding.limits.limitMicroCny > capacity.effectiveLimitMicroCny - capacity.allocatedMicroCny
      || budgetSummary(state.ledger).committedMicroCny + exposure.heldMicroCny + binding.limits.limitMicroCny > 30_000_000) throw new Error('Public funding exceeds shared allocation capacity or the original phase.');
    if (state.run.taskIds.includes(fundingTaskId(binding.fundingId)) || state.publicValidationFundings?.some(row => row.binding.runRoot.toLowerCase() === binding.runRoot.toLowerCase()
      || row.binding.runId === binding.runId || row.binding.ledgerId === binding.ledgerId)) throw new Error('Public funding run identity was already used.');
    const next = structuredClone(state), claimedAt = new Date(now()).toISOString();
    const record: PublicValidationFundingRecord = { binding, taskId: fundingTaskId(binding.fundingId), claimedAt, basisRevision: state.revision };
    next.publicValidationFundings = [...(next.publicValidationFundings ?? []), record];
    next.ledger.allocations.push({ taskId: record.taskId, amountMicroCny: binding.limits.limitMicroCny }); next.run.taskIds.push(record.taskId);
    next.events.push({ sequence: next.events.length + 1, type: 'public_funding_reserved', at: claimedAt, requestId: null, reason: binding.fundingId });
    await commitShared(shared, state, next); return structuredClone(binding);
  } finally { await shared?.close(); await child.close(); }
}

/** Caller already owns the child root. The returned read lock covers the local reserve/admit write. */
export async function acquirePublicFundingGate(root: string, snapshot: IntakeSnapshot | RunSnapshot, dispatch: boolean) {
  const intent = await readPublicFundingIntent(root), binding = snapshot.validationFunding;
  const origin = await optional(root, 'intake-origin.json');
  if (!binding && !intent && origin?.validationFunding === undefined) return { async close() {} };
  if (!binding || !intent || !sameValue(binding, intent.binding) || !sameValue(origin?.validationFunding, binding)) throw new Error('Public funding binding is missing or changed.');
  validateFundingBinding(binding);
  const duration = snapshot.formatVersion === 'intake-1' ? snapshot.durationMs : Date.parse(snapshot.run.originalDeadlineAt) - Date.parse(snapshot.run.originalStartedAt);
  if (binding.runRoot !== resolve(root) || binding.runId !== snapshot.run.runId || binding.ledgerId !== snapshot.ledger.ledgerId
    || binding.limits.limitMicroCny !== snapshot.ledger.limitMicroCny || binding.limits.durationMs !== duration
    || origin.brief !== intent.payload.brief || !!origin.renderFrames !== intent.payload.renderFrames) throw new Error('Public funding differs from the original public run.');
  const store = await SnapshotStore.acquire(binding.sharedRoot);
  try {
    const state = await store.read(); validateSnapshot(state);
    const record = state.publicValidationFundings?.find(row => row.binding.fundingId === binding.fundingId);
    if (!record || !sameValue(record.binding, binding)) throw new Error('Public funding has not been reserved in the shared ledger.');
    await source(binding);
    if (dispatch && (record.settlement || publicFundingExposure(state).overrun)) throw new Error('Public funding is closed or has an unresolved overrun.');
    return { close: () => store.close() };
  } catch (error) { await store.close(); throw error; }
}
export async function verifyPublicValidationFunding(options: { root: string; snapshot: IntakeSnapshot | RunSnapshot; dispatch: boolean }) {
  const gate = await acquirePublicFundingGate(options.root, options.snapshot, options.dispatch);
  await gate.close();
}
export async function rejectFundedContinuation(root: string, snapshot: RunSnapshot | IntakeSnapshot) {
  if (snapshot.validationFunding || await optional(root, intentName) || (await optional(root, 'intake-origin.json'))?.validationFunding) throw new Error('Public funding does not authorize a continuation window.');
}
export async function verifyFundedNew(root: string, binding: PublicValidationFundingBinding, brief: string, limits: PublicValidationFundingBinding['limits'], renderFrames: boolean) {
  validateFundingBinding(binding);
  const intent = await readPublicFundingIntent(root);
  if (!intent || !sameValue(intent.binding, binding) || intent.payload.brief !== brief || !sameValue(binding.limits, limits) || intent.payload.renderFrames !== renderFrames) throw new Error('Public funding new arguments differ from authorization.');
  const contents = await readdir(root);
  if (contents.some(name => ![intentName, 'intake-origin.json'].includes(name))) throw new Error('Funded new requires its original initialization files only; use resume for a saved run.');
}
export async function publishFundedOrigin(root: string, value: unknown) { await writeOnce(root, 'intake-origin.json', value); }

/** Accounting closure reads the child's real evidence; it never reopens execution or guesses charges. */
export async function settlePublicValidationFunding(options: { sharedRoot: string; runRoot: string; fundingId: string; now?: () => number }) {
  const root = resolve(options.runRoot), child = await SnapshotStore.acquire(root);
  let registry: OwnerLock | undefined, shared: SnapshotStore | undefined;
  try {
    const registryRoot = await safePath(root, 'registry');
    if (await lstat(registryRoot).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) registry = await OwnerLock.acquire(registryRoot, '.commit.lock');
    const bytes = await regularFile(root, 'snapshot.json'), snapshot = decode(bytes) as IntakeSnapshot | RunSnapshot;
    if (snapshot.formatVersion === 'intake-1') {
      const validateIntakeSnapshot: (value: unknown) => asserts value is IntakeSnapshot = (await import('./intake.ts')).validateIntakeSnapshot;
      validateIntakeSnapshot(snapshot);
    } else validateSnapshot(snapshot);
    await verifyPublicValidationFunding({ root, snapshot, dispatch: false });
    const binding = snapshot.validationFunding!;
    if (binding.sharedRoot !== resolve(options.sharedRoot) || binding.fundingId !== options.fundingId) throw new Error('Public funding settlement selects a different run.');
    if (snapshot.ledger.entries.some(row => row.unknown || row.reservedMicroCny || !['settled', 'cancelled'].includes(row.status))) throw new Error('Public funding retains its whole allocation until unknown or reserved charges are reconciled.');
    if (!snapshot.stopReason) {
      if (snapshot.formatVersion === 'intake-1') throw new Error('Public funding intake must be durably stopped before settlement.');
      const { readAutomaticReport } = await import('./experience.ts'), { readCompletionTiming } = await import('./completion-timing.ts');
      const { report } = await readAutomaticReport(root), timing = await readCompletionTiming(root, true);
      if (report.automaticAcceptance !== 'passed' || !report.acceptedCandidate || !timing.required || !['in_time', 'late'].includes(timing.current?.status)
        || timing.cleanup?.some((row: { outcome: string }) => row.outcome !== 'closed')) throw new Error('Public funding requires a completed and drained original run.');
    }
    const readonly: AccountingController = { read: async () => structuredClone(snapshot), coordinateAccounting: action => action(),
      reserve: async () => { throw new Error('Read-only funding evidence'); }, admit: async () => { throw new Error('Read-only funding evidence'); },
      markUnknown: async () => { throw new Error('Read-only funding evidence'); }, settle: async () => { throw new Error('Read-only funding evidence'); },
      cancel: async () => { throw new Error('Read-only funding evidence'); } };
    const receipts: { reference: ArtifactReference; sha256: string; contents: string }[] = [];
    for (const entry of snapshot.ledger.entries) {
      const admitted = snapshot.requests.find(row => row.requestId === entry.requestId)!;
      if (!admitted.admittedAt) {
        if (entry.status !== 'cancelled' || entry.settledMicroCny || !snapshot.events.some(event => event.requestId === entry.requestId && event.type === 'cancelled')) throw new Error('Unsent public funding charge lacks cancellation evidence.');
        continue;
      }
      const refs = entry.evidence.filter(ref => ref.artifactId === `billing-${entry.requestId}` && ref.version === 'v1');
      if (refs.length !== 1 || !isAbsolute(refs[0].location) || !within(root, refs[0].location)) throw new Error('Public funding billing receipt is missing or outside its run.');
      const checked = await reconcileRoleReceipt({ controller: readonly, requestId: entry.requestId, evidenceDirectory: dirname(refs[0].location) });
      if (checked.status !== 'already_closed') throw new Error('Public funding billing receipt is missing or conflicts with the original charge.');
      const raw = await referenceBytes(root, refs[0]);
      receipts.push({ reference: refs[0], sha256: fundingHash(raw), contents: new TextDecoder('utf-8', { fatal: true }).decode(raw) });
    }
    shared = await SnapshotStore.acquire(binding.sharedRoot);
    const previous = await shared.read(); validateSnapshot(previous); await sharedSources(previous);
    const current = previous.publicValidationFundings!.find(record => record.binding.fundingId === binding.fundingId)!;
    const requests = snapshot.ledger.entries.map(entry => ({ entry: structuredClone(entry), admittedAt: snapshot.requests.find(row => row.requestId === entry.requestId)!.admittedAt }));
    const evidence = { formatVersion: 'public-validation-settlement/1', binding, snapshotSha256: fundingHash(bytes), snapshot, requests, receipts };
    if (current.settlement) {
      if (!sameValue(decode(await referenceBytes(binding.sharedRoot, current.settlement.source)), evidence)) throw new Error('Public funding repeated settlement source conflicts.');
      return structuredClone(current.settlement);
    }
    const amount = snapshot.ledger.entries.reduce((sum, entry) => sum + entry.settledMicroCny, 0), outcome = amount > binding.limits.limitMicroCny ? 'overrun' as const : 'closed' as const;
    const reference = { artifactId: 'public-funding-settlement', version: binding.fundingId, location: `public-funding/${binding.fundingId}/settlement.json` };
    await writeOnce(binding.sharedRoot, reference.location, evidence);
    if (!bytes.equals(await regularFile(root, 'snapshot.json'))) throw new Error('Public funding source changed while closing.');
    const next = structuredClone(previous), record = next.publicValidationFundings!.find(row => row.binding.fundingId === binding.fundingId)!;
    const settlement = { settledAt: new Date((options.now ?? Date.now)()).toISOString(), outcome, source: reference,
      sourceSha256: fundingHash(await referenceBytes(binding.sharedRoot, reference)), settledMicroCny: amount,
      releasedMicroCny: outcome === 'closed' ? binding.limits.limitMicroCny - amount : 0, requests };
    if (outcome === 'closed') {
      for (const original of requests) {
        if (next.ledger.entries.some(row => row.requestId === original.entry.requestId)) throw new Error('Public funding request ID conflicts with shared history.');
        next.ledger.entries.push({ ...original.entry, taskId: record.taskId });
        next.requests.push({ requestId: original.entry.requestId, admittedAt: original.admittedAt, publicFunding: { fundingId: binding.fundingId, sourceTaskId: original.entry.taskId } });
      }
      next.ledger.allocationClosures!.push({ taskId: record.taskId, decisionId: fundingClosureId(binding.fundingId), releasedMicroCny: settlement.releasedMicroCny });
    }
    record.settlement = settlement;
    next.events.push({ sequence: next.events.length + 1, type: 'public_funding_settled', at: settlement.settledAt, requestId: null, reason: binding.fundingId });
    await commitShared(shared, previous, next); return structuredClone(settlement);
  } finally { await shared?.close(); await registry?.close(); await child.close(); }
}
