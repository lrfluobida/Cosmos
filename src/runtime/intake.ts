import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_BUDGETS, budgetSummary, validateLedger, validateRequirement } from '../contracts/index.ts';
import type { ArtifactReference, BudgetLedger, RequirementContract } from '../contracts/index.ts';
import { sameValue } from '../contracts/validation.ts';
import { appendEvidence, evidenceReferences, findRequest, nonEmpty, requireOpen, reserveEntry, settleEntry } from '../budget/ledger.ts';
import { confirmRequirements, validateGameDraft } from '../roles/requirements.ts';
import type { GameDraft } from '../roles/requirements.ts';
import { SnapshotStore } from './store.ts';
import { publishReceipt } from './recovery/receipt-file.ts';
import { validateSnapshot } from './run-validation.ts';
import type { RequestInput, RunEvent, RunSnapshot, StopReason } from './run-types.ts';

export interface StoredDraft extends GameDraft { revision: number; source: ArtifactReference }
export interface IntakeSnapshot {
  formatVersion: 'intake-1'; revision: number;
  run: { runId: string; kind: 'runtime_generation'; specVersion: string };
  ledger: BudgetLedger; requests: RunSnapshot['requests']; events: RunEvent[]; stopReason: StopReason | null;
  createdAt: string; durationMs: number; interviewTaskId: string; maxRequests: number;
  draft: StoredDraft | null;
  confirmation: { revision: number; requirement: RequirementContract; source: ArtifactReference } | null;
}
export interface CreateIntakeOptions {
  root: string; runId: string; ledgerId: string; specVersion: string; allocations: BudgetLedger['allocations'];
  interviewTaskId: string; maxRequests: number; limitMicroCny?: number; durationMs?: number; now?: () => number;
}
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const draftRef = (revision: number): ArtifactReference => ({ artifactId: 'requirement-draft', version: `v${revision}`, location: `requirements/v${revision}/draft.json` });
const confirmationRef = (revision: number): ArtifactReference => ({ artifactId: 'user-confirmation', version: `v${revision}`, location: `requirements/v${revision}/confirmation.json` });
const payload = ({ revision: _revision, source: _source, ...draft }: StoredDraft): GameDraft => draft;

/** Separate intake schema: no generated task, fake requirement or pretend deadline. */
export function validateIntakeSnapshot(value: unknown): asserts value is IntakeSnapshot {
  const state = value as IntakeSnapshot;
  if (!state || state.formatVersion !== 'intake-1') throw new Error('Expected intake snapshot; this run may already be activated.');
  if (!Number.isSafeInteger(state.revision) || state.revision < 1 || !timestamp(state.createdAt)
    || !state.run || state.run.kind !== 'runtime_generation' || Object.keys(state.run).some(key => !['runId', 'kind', 'specVersion'].includes(key))
    || !Number.isSafeInteger(state.durationMs) || state.durationMs <= 0 || state.durationMs > DEFAULT_BUDGETS.hardDurationMs
    || !Number.isSafeInteger(state.maxRequests) || state.maxRequests < 1 || state.maxRequests > 24) throw new Error('Invalid intake identity or limits.');
  nonEmpty(state.run.runId, 'runId'); nonEmpty(state.run.specVersion, 'specVersion'); nonEmpty(state.interviewTaskId, 'interviewTaskId');
  const stop = state.stopReason;
  if (stop !== null && (!stop || !['manual', 'charge_overrun'].includes(stop.code) || !timestamp(stop.at) || typeof stop.reason !== 'string' || !stop.reason.trim())) throw new Error('Invalid intake stop reason.');
  const errors = validateLedger(state.ledger).filter(issue => !(stop?.code === 'charge_overrun' && ['budget_exceeded', 'allocation_exceeded'].includes(issue.code)));
  if (errors.length || state.ledger.contractVersion !== '1.0.0' || state.ledger.scope !== 'generation' || !state.ledger.allocations.some(item => item.taskId === state.interviewTaskId)) throw new Error('Invalid intake generation ledger.');
  if (!Array.isArray(state.requests) || state.requests.length > state.maxRequests || state.requests.length !== state.ledger.entries.length
    || new Set(state.requests.map(item => item.requestId)).size !== state.requests.length) throw new Error('Invalid intake admissions.');
  for (const record of state.requests) {
    const entry = state.ledger.entries.find(item => item.requestId === record.requestId);
    if (!entry || entry.taskId !== state.interviewTaskId || (record.admittedAt !== null && !timestamp(record.admittedAt)) || (entry.status === 'unknown' && record.admittedAt === null)) throw new Error('Invalid intake admission identity.');
  }
  const events = ['created', 'reserved', 'admitted', 'settled', 'unknown', 'cancelled', 'budget_warning', 'stopped'];
  if (!Array.isArray(state.events) || state.events[0]?.type !== 'created') throw new Error('Missing intake history.');
  state.events.forEach((event, i) => {
    if (event.sequence !== i + 1 || !timestamp(event.at) || !events.includes(event.type) || typeof event.reason !== 'string'
      || (event.requestId !== null && !state.requests.some(item => item.requestId === event.requestId))) throw new Error('Invalid intake event.');
  });
  if (state.draft !== null) {
    if (!state.draft || !Number.isSafeInteger(state.draft.revision) || state.draft.revision < 1 || !sameValue(state.draft.source, draftRef(state.draft.revision))) throw new Error('Invalid draft revision.');
    validateGameDraft(payload(state.draft));
  }
  if (state.confirmation !== null) {
    const confirmed = state.confirmation;
    if (!confirmed || !state.draft || confirmed.revision !== state.draft.revision || !sameValue(confirmed.source, confirmationRef(confirmed.revision))
      || validateRequirement(confirmed.requirement).length || !sameValue(confirmed.requirement.acceptance, state.draft.acceptance)
      || confirmed.requirement.specVersion !== state.run.specVersion || !sameValue(confirmed.requirement.sources, [state.draft.source, confirmed.source])) throw new Error('Invalid or stale requirement confirmation.');
  }
}

/** Owns the one ledger before a formal generation clock exists. */
export class IntakeController {
  private store: SnapshotStore;
  private snapshot: IntakeSnapshot;
  private now: () => number;
  private pending: Promise<unknown> = Promise.resolve();
  private accounting: Promise<unknown> = Promise.resolve();
  private abort = new AbortController();
  private failed = false;
  private closing = false;
  private closed?: Promise<void>;
  private activated?: RunSnapshot;
  private constructor(store: SnapshotStore, snapshot: IntakeSnapshot, now: () => number) {
    this.store = store; this.snapshot = snapshot; this.now = now;
    if (snapshot.stopReason) this.abort.abort(snapshot.stopReason);
  }
  get signal(): AbortSignal { return this.abort.signal; }
  get root(): string { return this.store.root; }
  coordinateAccounting<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.accounting.then(operation); this.accounting = result.catch(() => {}); return result;
  }
  static async create(options: CreateIntakeOptions): Promise<IntakeController> {
    const now = options.now ?? Date.now, createdAt = new Date(now()).toISOString();
    const state: IntakeSnapshot = {
      formatVersion: 'intake-1', revision: 1, run: { runId: options.runId, kind: 'runtime_generation', specVersion: options.specVersion },
      ledger: { contractVersion: '1.0.0', ledgerId: options.ledgerId, scope: 'generation', limitMicroCny: options.limitMicroCny ?? DEFAULT_BUDGETS.generationMicroCny,
        warningThresholdPercent: 80, allocations: structuredClone(options.allocations), entries: [] }, requests: [],
      events: [{ sequence: 1, at: createdAt, type: 'created', requestId: null, reason: 'Intake budget fixed; formal generation has not started.' }], stopReason: null,
      createdAt, durationMs: options.durationMs ?? DEFAULT_BUDGETS.hardDurationMs, interviewTaskId: options.interviewTaskId, maxRequests: options.maxRequests, draft: null, confirmation: null,
    };
    validateIntakeSnapshot(state);
    const store = await SnapshotStore.acquire(options.root);
    try {
      if (await store.exists()) throw new Error('Snapshot already exists; intake cannot replace a run.');
      await store.write(state); return new IntakeController(store, state, now);
    } catch (error) { await store.close(); throw error; }
  }
  static async open(options: { root: string; now?: () => number }): Promise<IntakeController> {
    const store = await SnapshotStore.acquire(options.root);
    try {
      const state = await store.read(); validateIntakeSnapshot(state);
      const controller = new IntakeController(store, state, options.now ?? Date.now), next = structuredClone(state);
      for (const record of next.requests) {
        const entry = findRequest(next.ledger, record.requestId);
        if (record.admittedAt && entry.status === 'reserved') {
          entry.status = 'unknown'; entry.unknown = true;
          controller.event(next, 'unknown', record.requestId, 'Intake reopened without a durable response; reconcile before retry.');
        }
      }
      if (next.events.length !== state.events.length) await controller.commit(next);
      return controller;
    } catch (error) { await store.close(); throw error; }
  }
  read(): Promise<IntakeSnapshot> { return this.serial(() => { this.requireIntake(); return structuredClone(this.snapshot); }); }
  reserve(input: RequestInput) {
    const request = structuredClone(input);
    return this.serial(async () => {
      this.requireActive();
      if (request.taskId !== this.snapshot.interviewTaskId || this.snapshot.requests.length >= this.snapshot.maxRequests) throw new Error('Intake request limit or task identity refused.');
      const next = structuredClone(this.snapshot), entry = reserveEntry(next.ledger, request);
      next.requests.push({ requestId: request.requestId, admittedAt: null });
      this.event(next, 'reserved', request.requestId, 'Maximum intake cost reserved before dispatch.'); await this.commit(next); return structuredClone(entry);
    });
  }
  admit(requestId: string): Promise<void> {
    return this.serial(async () => {
      this.requireActive();
      if (budgetSummary(this.snapshot.ledger).reconciliationRequired) throw new Error('Reconciliation required before admission.');
      const next = structuredClone(this.snapshot); requireOpen(findRequest(next.ledger, requestId));
      const record = next.requests.find(item => item.requestId === requestId)!;
      if (record.admittedAt) throw new Error('Request was already admitted.');
      record.admittedAt = this.at(); this.event(next, 'admitted', requestId, 'Intake dispatch intent durably recorded.'); await this.commit(next);
    });
  }
  markUnknown(requestId: string, evidence: ArtifactReference[]): Promise<void> {
    const refs = structuredClone(evidence);
    return this.serial(async () => {
      this.requireIntake(); evidenceReferences(refs);
      const next = structuredClone(this.snapshot), entry = findRequest(next.ledger, requestId); requireOpen(entry);
      if (!next.requests.find(record => record.requestId === requestId)?.admittedAt) throw new Error('Unadmitted intake request.');
      entry.status = 'unknown'; entry.unknown = true; appendEvidence(entry, refs);
      this.event(next, 'unknown', requestId, 'Intake request requires reconciliation.'); await this.commit(next);
    });
  }
  settle(requestId: string, amount: number, evidence: ArtifactReference[]): Promise<{ halted: boolean }> {
    const refs = structuredClone(evidence);
    return this.serial(async () => {
      this.requireIntake(); const next = structuredClone(this.snapshot), entry = findRequest(next.ledger, requestId);
      if (!next.requests.find(record => record.requestId === requestId)?.admittedAt) throw new Error('Unadmitted intake request.');
      const overrun = settleEntry(entry, amount, refs); this.event(next, 'settled', requestId, 'Intake usage reconciled against evidence.');
      if (overrun) this.halt(next, 'charge_overrun', 'Actual intake cost exceeded its reservation.');
      await this.commit(next); return { halted: next.stopReason !== null };
    });
  }
  cancel(requestId: string, evidence: ArtifactReference[], options: { provenNoCost?: boolean } = {}): Promise<void> {
    const refs = structuredClone(evidence), proven = options.provenNoCost === true;
    return this.serial(async () => {
      this.requireIntake(); evidenceReferences(refs);
      const next = structuredClone(this.snapshot), entry = findRequest(next.ledger, requestId); requireOpen(entry);
      if (next.requests.find(record => record.requestId === requestId)?.admittedAt && !proven) throw new Error('Admitted requests need explicit no-cost evidence.');
      entry.status = 'cancelled'; entry.unknown = false; entry.reservedMicroCny = 0; appendEvidence(entry, refs);
      this.event(next, 'cancelled', requestId, 'Intake request cancelled with no-cost evidence.'); await this.commit(next);
    });
  }
  saveDraft(input: GameDraft): Promise<StoredDraft> {
    const draft = structuredClone(input); validateGameDraft(draft);
    return this.serial(async () => {
      this.requireActive(); const next = structuredClone(this.snapshot), revision = (next.draft?.revision ?? 0) + 1;
      next.draft = { ...draft, revision, source: draftRef(revision) }; next.confirmation = null;
      const path = join(this.store.root, `requirements/v${revision}`); await mkdir(path, { recursive: true });
      await publishReceipt(join(path, 'draft.json'), draft);
      await this.commit(next); return structuredClone(next.draft);
    });
  }
  confirm(input: { revision: number; confirmed: boolean; actorId: string; at: string }): Promise<RequirementContract> {
    const confirmation = structuredClone(input);
    return this.serial(async () => {
      this.requireActive(); const next = structuredClone(this.snapshot), draft = next.draft;
      if (!draft || draft.revision !== confirmation.revision) throw new Error('Confirmation must name the current draft revision.');
      if (draft.unsupported.length) throw new Error('Unsupported requirements need a decision before confirmation.');
      const source = confirmationRef(draft.revision);
      const requirement = confirmRequirements({ ...payload(draft), specVersion: next.run.specVersion, sources: [draft.source, source] }, confirmation);
      if (next.confirmation) {
        if (sameValue(next.confirmation.requirement, requirement)) return structuredClone(requirement);
        throw new Error('Confirmation already recorded for this revision.');
      }
      await this.requireDraftFile(draft);
      await publishReceipt(join(this.store.root, source.location), { ...confirmation, runId: next.run.runId, draft: draft.source });
      next.confirmation = { revision: draft.revision, requirement, source };
      await this.commit(next); return structuredClone(requirement);
    });
  }
  activateGeneration(readiness: { environmentReady: boolean; executionReady: boolean }): Promise<RunSnapshot> {
    const ready = { ...readiness };
    return this.serial(async () => {
      if (this.activated) return structuredClone(this.activated);
      this.requireActive(); const prior = this.snapshot, confirmed = prior.confirmation;
      if (!confirmed || !prior.draft || prior.draft.revision !== confirmed.revision) throw new Error('Current explicit confirmation is required.');
      if (ready.environmentReady !== true) throw new Error('Environment is not ready for formal generation.');
      if (ready.executionReady !== true) throw new Error('Execution prerequisites are not ready.');
      if (prior.ledger.entries.some(entry => entry.reservedMicroCny || entry.unknown)) throw new Error('Outstanding or unknown intake charges block activation.');
      if (budgetSummary(prior.ledger).exhausted) throw new Error('Budget exhausted before activation.');
      await this.requireDraftFile(prior.draft);
      const receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(join(this.store.root, confirmed.source.location))));
      if (!sameValue(receipt, { revision: confirmed.revision, confirmed: true, actorId: confirmed.requirement.confirmedBy, at: confirmed.requirement.confirmedAt, runId: prior.run.runId, draft: prior.draft.source })) throw new Error('Confirmation source changed.');
      const startedAt = this.at();
      const active: RunSnapshot = {
        formatVersion: 1, revision: prior.revision + 1, ledger: structuredClone(prior.ledger), requests: structuredClone(prior.requests), events: structuredClone(prior.events), stopReason: null, tasks: [],
        run: { contractVersion: '1.0.0', ...prior.run, ledgerId: prior.ledger.ledgerId, originalStartedAt: startedAt,
          originalDeadlineAt: new Date(Date.parse(startedAt) + prior.durationMs).toISOString(), state: 'running', taskIds: prior.ledger.allocations.map(item => item.taskId),
          fees: { settledMicroCny: prior.ledger.entries.reduce((sum, entry) => sum + entry.settledMicroCny, 0), reservedMicroCny: 0, unknownRequestIds: [] }, artifacts: [],
          humanDecisions: [{ decisionId: `requirements-v${confirmed.revision}`, actorId: confirmed.requirement.confirmedBy, decidedAt: confirmed.requirement.confirmedAt,
            reason: 'User confirmed this exact intake draft and answers before generation activation.', evidence: confirmed.requirement.sources }] },
      };
      active.events.push({ sequence: active.events.length + 1, at: startedAt, type: 'generation_activated', requestId: null, reason: 'Confirmed requirements and ready host activated the one original generation window.' });
      if (!sameValue(active.ledger, prior.ledger) || !sameValue(active.requests, prior.requests) || !sameValue(active.events.slice(0, -1), prior.events)) throw new Error('Activation cannot change accounting history.');
      validateSnapshot(active); await this.write(active); this.activated = active; this.abort.abort(new Error('Intake activated; open the original run.'));
      return structuredClone(active);
    });
  }
  stop(reason: string): Promise<void> {
    return this.serial(async () => {
      this.requireIntake(); nonEmpty(reason, 'Stop reason'); if (this.snapshot.stopReason) return;
      const next = structuredClone(this.snapshot); this.halt(next, 'manual', reason); await this.commit(next);
    });
  }
  close(): Promise<void> {
    if (this.closed) return this.closed;
    this.closing = true; this.abort.abort(new Error('Intake controller closed.'));
    this.closed = this.pending.then(() => this.store.close()).catch(error => { this.closed = undefined; throw error; }); return this.closed;
  }
  private serial<T>(operation: () => T | Promise<T>): Promise<T> {
    if (this.closing || this.failed) return Promise.reject(new Error('Intake controller closed or persistence failed.'));
    const result = this.pending.then(() => { if (this.failed) throw new Error('Intake persistence failed.'); return operation(); });
    this.pending = result.catch(() => {}); return result;
  }
  private at(): string { return new Date(this.now()).toISOString(); }
  private requireIntake(): void { if (this.activated) throw new Error('Generation already activated; use the original RunController.'); }
  private requireActive(): void { this.requireIntake(); if (this.snapshot.stopReason) throw new Error(`Intake stopped: ${this.snapshot.stopReason.code}.`); }
  private event(next: IntakeSnapshot, type: RunEvent['type'], requestId: string | null, reason: string): void { next.events.push({ sequence: next.events.length + 1, at: this.at(), type, requestId, reason }); }
  private halt(next: IntakeSnapshot, code: 'manual' | 'charge_overrun', reason: string): void {
    if (!next.stopReason || code === 'charge_overrun') next.stopReason = { code, at: this.at(), reason };
    for (const entry of next.ledger.entries) if (entry.status === 'reserved') {
      if (next.requests.find(record => record.requestId === entry.requestId)!.admittedAt) { entry.status = 'unknown'; entry.unknown = true; }
      else {
        entry.status = 'cancelled'; entry.reservedMicroCny = 0;
        entry.evidence.push({ artifactId: `intake-stop-${next.events.length + 1}`, version: `revision-${next.revision + 1}`, location: `snapshot.json#events/${next.events.length}` });
      }
      this.event(next, entry.status === 'unknown' ? 'unknown' : 'cancelled', entry.requestId, 'Stop retains dispatched exposure; only unsent reservations are released.');
    }
    this.event(next, 'stopped', null, reason);
  }
  private async requireDraftFile(draft: StoredDraft): Promise<void> {
    const saved = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(join(this.store.root, draft.source.location))));
    if (!sameValue(saved, payload(draft))) throw new Error('Fixed requirement draft source changed.');
  }
  private async write(value: unknown): Promise<void> {
    try { await this.store.write(value); } catch (error) { this.failed = true; this.abort.abort(error); throw error; }
  }
  private async commit(next: IntakeSnapshot): Promise<void> {
    next.revision = this.snapshot.revision + 1;
    if (budgetSummary(next.ledger).warning && !next.events.some(event => event.type === 'budget_warning')) this.event(next, 'budget_warning', null, 'Intake and generation share the same 80 percent budget warning.');
    validateIntakeSnapshot(next); await this.write(next); this.snapshot = next;
    if (next.stopReason) this.abort.abort(next.stopReason);
  }
}
