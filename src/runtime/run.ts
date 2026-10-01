import { DEFAULT_BUDGETS, budgetSummary, validateRunUpdate, validateTaskUpdate } from '../contracts/index.ts';
import type { ArtifactReference, BudgetLedger, LedgerEntry, TaskContract, TaskKind, UpdateActor } from '../contracts/index.ts';
import { appendEvidence, evidenceReferences, findRequest, money, nonEmpty, requireOpen, reserveEntry, settleEntry } from '../budget/ledger.ts';
import { SnapshotStore } from './store.ts';
import { validateSnapshot } from './run-validation.ts';
import type { ImportedCharge, RequestInput, RunEvent, RunSnapshot, StopReason } from './run-types.ts';
export type { ImportedCharge, RequestInput, RunSnapshot } from './run-types.ts';

export interface OpenRunOptions { root: string; now?: () => number }
export interface CreateRunOptions extends OpenRunOptions {
  runId: string;
  ledgerId: string;
  kind: TaskKind;
  specVersion: string;
  scope: BudgetLedger['scope'];
  allocations: BudgetLedger['allocations'];
  limitMicroCny?: number;
  durationMs?: number;
}

/** Trusted local controller. Agents receive hooks, never the mutable controller state. */
export class RunController {
  private store: SnapshotStore;
  private snapshot: RunSnapshot;
  private now: () => number;
  private pending: Promise<unknown> = Promise.resolve();
  private closing = false;
  private closePromise?: Promise<void>;
  private failed = false;
  private abort = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;

  private constructor(store: SnapshotStore, snapshot: RunSnapshot, now: () => number) {
    this.store = store; this.snapshot = snapshot; this.now = now;
    if (snapshot.stopReason) this.abort.abort(snapshot.stopReason);
  }

  get signal(): AbortSignal { return this.abort.signal; }

  static async create(options: CreateRunOptions): Promise<RunController> {
    const input = { ...options, allocations: structuredClone(options.allocations) };
    const now = input.now ?? Date.now;
    const startedAt = new Date(now()).toISOString();
    const duration = input.durationMs ?? DEFAULT_BUDGETS.hardDurationMs;
    if (!Number.isSafeInteger(duration) || duration <= 0 || duration > DEFAULT_BUDGETS.hardDurationMs) throw new Error('Duration must be positive and within the 12 hour hard deadline.');
    const limit = input.limitMicroCny ?? (input.scope === 'validation' ? DEFAULT_BUDGETS.validationMicroCny : DEFAULT_BUDGETS.generationMicroCny);
    const snapshot: RunSnapshot = {
      formatVersion: 1, revision: 1,
      run: { contractVersion: '1.0.0', runId: input.runId, kind: input.kind, specVersion: input.specVersion, ledgerId: input.ledgerId, originalStartedAt: startedAt, originalDeadlineAt: new Date(Date.parse(startedAt) + duration).toISOString(), state: 'running', taskIds: input.allocations.map(a => a.taskId), fees: { reservedMicroCny: 0, settledMicroCny: 0, unknownRequestIds: [] }, artifacts: [], humanDecisions: [] },
      ledger: { contractVersion: '1.0.0', ledgerId: input.ledgerId, scope: input.scope, limitMicroCny: limit, warningThresholdPercent: 80, allocations: input.allocations, entries: [] },
      tasks: [], requests: [], stopReason: null,
      events: [{ sequence: 1, at: startedAt, type: 'created', requestId: null, reason: 'Original budget and deadline fixed.' }],
    };
    validateSnapshot(snapshot);
    const store = await SnapshotStore.acquire(input.root);
    try {
      if (await store.exists()) throw new Error('Run snapshot already exists; open it to retain its original budget and deadline.');
      await store.write(snapshot);
      const controller = new RunController(store, snapshot, now);
      controller.armDeadline();
      return controller;
    } catch (error) { await store.close(); throw error; }
  }

  static async open(options: OpenRunOptions): Promise<RunController> {
    const store = await SnapshotStore.acquire(options.root);
    try {
      const snapshot = await store.read();
      validateSnapshot(snapshot);
      const controller = new RunController(store, snapshot, options.now ?? Date.now);
      const next = structuredClone(snapshot);
      for (const record of next.requests) {
        const entry = findRequest(next.ledger, record.requestId);
        if (record.admittedAt && entry.status === 'reserved') {
          entry.status = 'unknown'; entry.unknown = true;
          controller.event(next, 'unknown', entry.requestId, 'Controller reopened without a durable response; reconcile before retry.');
        }
      }
      if (next.events.length !== snapshot.events.length) await controller.commit(next);
      await controller.expire();
      controller.armDeadline();
      return controller;
    } catch (error) { await store.close(); throw error; }
  }

  async read(): Promise<RunSnapshot> { return this.serial(async () => structuredClone(this.snapshot)); }

  async summary() {
    const { run, ledger, stopReason } = await this.read();
    return {
      runId: run.runId, ledgerId: ledger.ledgerId, state: run.state,
      originalStartedAt: run.originalStartedAt, originalDeadlineAt: run.originalDeadlineAt,
      limitMicroCny: ledger.limitMicroCny, ...run.fees, ...budgetSummary(ledger), stopReason,
    };
  }

  async reserve(input: RequestInput): Promise<LedgerEntry> {
    const request = structuredClone(input);
    return this.serial(async () => {
      this.requireActive();
      const next = structuredClone(this.snapshot);
      const entry = reserveEntry(next.ledger, request);
      next.requests.push({ requestId: request.requestId, admittedAt: null });
      this.event(next, 'reserved', request.requestId, 'Maximum known cost reserved before dispatch.');
      await this.commit(next);
      return structuredClone(entry);
    });
  }

  /** Persist dispatch intent immediately before the provider call. Never call twice. */
  async admit(requestId: string): Promise<void> {
    return this.serial(async () => {
      this.requireActive();
      if (budgetSummary(this.snapshot.ledger).reconciliationRequired) throw new Error('Reconciliation required before paid admission.');
      const next = structuredClone(this.snapshot);
      requireOpen(findRequest(next.ledger, requestId));
      const record = next.requests.find(r => r.requestId === requestId)!;
      if (record.admittedAt !== null) throw new Error('Request was already admitted; do not dispatch it twice.');
      record.admittedAt = this.at();
      this.event(next, 'admitted', requestId, 'Dispatch intent durably recorded.');
      await this.commit(next);
      await this.expire();
      this.requireActive();
    });
  }

  async settle(requestId: string, actualCostMicroCny: number, evidence: ArtifactReference[]): Promise<{ halted: boolean }> {
    const references = structuredClone(evidence);
    return this.serial(async () => {
      const next = structuredClone(this.snapshot);
      const entry = findRequest(next.ledger, requestId);
      if (!next.requests.find(r => r.requestId === requestId)?.admittedAt) throw new Error('Unadmitted requests cannot incur new charges; use importSettled for prior usage.');
      const overrun = settleEntry(entry, actualCostMicroCny, references);
      this.event(next, 'settled', requestId, 'Provider cost reconciled against evidence.');
      if (overrun) this.halt(next, 'charge_overrun', `Actual charge exceeded the reservation for ${requestId}.`);
      await this.commit(next);
      return { halted: next.stopReason !== null };
    });
  }

  async markUnknown(requestId: string, evidence: ArtifactReference[]): Promise<void> {
    const references = structuredClone(evidence);
    return this.serial(async () => {
      evidenceReferences(references);
      const next = structuredClone(this.snapshot), entry = findRequest(next.ledger, requestId);
      requireOpen(entry);
      if (!next.requests.find(r => r.requestId === requestId)?.admittedAt) throw new Error('Unadmitted request has not been sent.');
      entry.status = 'unknown'; entry.unknown = true; appendEvidence(entry, references);
      this.event(next, 'unknown', requestId, 'Unknown provider result; reservation retained for reconciliation.');
      await this.commit(next);
    });
  }

  async cancel(requestId: string, evidence: ArtifactReference[], options: { provenNoCost?: boolean } = {}): Promise<void> {
    const references = structuredClone(evidence), provenNoCost = options.provenNoCost === true;
    return this.serial(async () => {
      evidenceReferences(references);
      const next = structuredClone(this.snapshot), entry = findRequest(next.ledger, requestId);
      requireOpen(entry);
      if (next.requests.find(r => r.requestId === requestId)?.admittedAt && !provenNoCost) throw new Error('Admitted requests require explicit no-cost evidence before cancellation.');
      entry.status = 'cancelled'; entry.unknown = false; entry.reservedMicroCny = 0;
      appendEvidence(entry, references);
      this.event(next, 'cancelled', requestId, provenNoCost ? 'Provider proved no charge.' : 'Cancelled before admission.');
      await this.commit(next);
    });
  }

  /** Generic idempotent import; the caller supplies the prior charge and its source. */
  async importSettled(input: ImportedCharge): Promise<void> {
    const charge = structuredClone(input);
    return this.serial(async () => {
      money(charge.actualCostMicroCny);
      evidenceReferences(charge.evidence);
      for (const key of ['requestId', 'taskId', 'provider', 'pricingVersion'] as const) nonEmpty(charge[key], key);
      const existing = this.snapshot.ledger.entries.find(e => e.requestId === charge.requestId);
      if (existing) {
        if (existing.status !== 'settled' || existing.taskId !== charge.taskId || existing.provider !== charge.provider || existing.pricingVersion !== charge.pricingVersion || existing.settledMicroCny !== charge.actualCostMicroCny || JSON.stringify(existing.evidence) !== JSON.stringify(charge.evidence)) throw new Error('Imported charge conflicts with the existing request ID.');
        return;
      }
      const next = structuredClone(this.snapshot);
      if (!next.ledger.allocations.some(a => a.taskId === charge.taskId)) throw new Error('Imported charge requires an existing shared task allocation.');
      next.ledger.entries.push({ requestId: charge.requestId, taskId: charge.taskId, provider: charge.provider, pricingVersion: charge.pricingVersion, settledMicroCny: charge.actualCostMicroCny, reservedMicroCny: 0, status: 'settled', unknown: false, evidence: charge.evidence });
      next.requests.push({ requestId: charge.requestId, admittedAt: null });
      this.event(next, 'imported', charge.requestId, 'Prior settled usage imported with source evidence.');
      const allocation = next.ledger.allocations.find(a => a.taskId === charge.taskId)!;
      const committed = next.ledger.entries.filter(e => e.taskId === charge.taskId).reduce((sum, e) => sum + e.reservedMicroCny + e.settledMicroCny, 0);
      if (budgetSummary(next.ledger).availableMicroCny < 0 || committed > allocation.amountMicroCny) this.halt(next, 'charge_overrun', 'Imported historical charges exceed the original budget.');
      await this.commit(next);
    });
  }

  /** Append host-validated task drafts and allocations without changing the original budget. */
  async registerTasks(tasks: TaskContract[]): Promise<void> {
    const values = structuredClone(tasks);
    return this.serial(async () => {
      this.requireActive();
      const next = structuredClone(this.snapshot);
      for (const task of values) {
        if (task.state !== 'not_started' || task.attempts.length || task.evidence.length || task.artifacts.length || task.review.verdict !== 'pending') throw new Error('Register only fresh task drafts.');
        if (next.tasks.some(t => t.taskId === task.taskId)) throw new Error('Task already registered.');
        const allocation = next.ledger.allocations.find(a => a.taskId === task.taskId);
        if (allocation && allocation.amountMicroCny !== task.budget.allocationMicroCny) throw new Error('Existing allocation cannot be changed.');
        if (!allocation) {
          next.ledger.allocations.push({ taskId: task.taskId, amountMicroCny: task.budget.allocationMicroCny });
          next.run.taskIds.push(task.taskId);
        }
        next.tasks.push(task);
      }
      this.event(next, 'task_saved', null, 'Planned tasks registered atomically within the original shared allocation cap.');
      await this.commit(next);
    });
  }

  /** Persist full COS-02 attempts, evidence and handoff. */
  async saveTask(task: TaskContract, actor: UpdateActor): Promise<void> {
    const value = structuredClone(task), trustedActor = structuredClone(actor);
    return this.serial(async () => {
      const next = structuredClone(this.snapshot);
      const previous = next.tasks.find(t => t.taskId === value.taskId);
      if (previous) {
        const issues = validateTaskUpdate(previous, value, trustedActor);
        if (issues.length) throw new Error(`Invalid task update: ${issues.map(i => i.message).join('; ')}`);
        next.tasks[next.tasks.indexOf(previous)] = value;
      } else {
        if (trustedActor.role !== 'system') throw new Error('Only the trusted runtime can register a task.');
        next.tasks.push(value);
      }
      this.event(next, 'task_saved', null, `Task contract persisted: ${value.taskId}`);
      await this.commit(next);
    });
  }

  async stop(reason: string): Promise<void> {
    return this.serial(async () => {
      nonEmpty(reason, 'Stop reason');
      if (this.snapshot.stopReason) return;
      const next = structuredClone(this.snapshot);
      this.halt(next, 'manual', reason);
      await this.commit(next);
    });
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    clearTimeout(this.timer);
    this.abort.abort(new Error('Run controller closed.'));
    this.closePromise = this.pending.then(() => this.store.close());
    return this.closePromise;
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closing || this.failed) return Promise.reject(new Error('Run controller is closed or persistence failed.'));
    const result = this.pending.then(async () => {
      if (this.failed) throw new Error('Run controller persistence failed.');
      await this.expire();
      return operation();
    });
    this.pending = result.catch(() => {});
    return result;
  }

  private at(): string { return new Date(this.now()).toISOString(); }

  private event(next: RunSnapshot, type: RunEvent['type'], requestId: string | null, reason: string): void {
    next.events.push({ sequence: next.events.length + 1, at: this.at(), type, requestId, reason });
  }

  private requireActive(): void {
    if (this.snapshot.stopReason) throw new Error(`Run stopped: ${this.snapshot.stopReason.code}: ${this.snapshot.stopReason.reason}`);
  }

  private halt(next: RunSnapshot, code: StopReason['code'], reason: string): void {
    // An overcharge discovered after another stop remains an explicit durable incident.
    if (!next.stopReason || code === 'charge_overrun') next.stopReason = { code, reason, at: this.at() };
    next.run.state = 'waiting_user';
    for (const entry of next.ledger.entries) {
      if (entry.status !== 'reserved') continue;
      const admitted = next.requests.find(r => r.requestId === entry.requestId)!.admittedAt;
      if (admitted) { entry.status = 'unknown'; entry.unknown = true; }
      else {
        entry.status = 'cancelled'; entry.reservedMicroCny = 0;
        entry.evidence.push({ artifactId: `runtime-event-${next.events.length + 1}`, version: `revision-${next.revision + 1}`, location: `snapshot.json#events/${next.events.length}` });
      }
      this.event(next, admitted ? 'unknown' : 'cancelled', entry.requestId, admitted ? 'Stop cannot prove that a dispatched request was free.' : 'Runtime admission history proves the request was never dispatched.');
    }
    this.event(next, 'stopped', null, reason);
  }

  private async expire(): Promise<void> {
    if (!this.snapshot.stopReason && this.now() >= Date.parse(this.snapshot.run.originalDeadlineAt)) {
      const next = structuredClone(this.snapshot);
      this.halt(next, 'deadline', 'Original hard deadline reached.');
      await this.commit(next);
    }
  }

  private armDeadline(): void {
    if (this.snapshot.stopReason) return;
    const delay = Math.max(1, Date.parse(this.snapshot.run.originalDeadlineAt) - this.now());
    this.timer = setTimeout(() => {
      void this.serial(async () => { this.armDeadline(); }).catch(() => { this.abort.abort(new Error('Deadline persistence failed.')); });
    }, delay);
    this.timer.unref();
  }

  private async commit(next: RunSnapshot): Promise<void> {
    next.revision = this.snapshot.revision + 1;
    next.run.fees = {
      reservedMicroCny: next.ledger.entries.reduce((sum, e) => sum + e.reservedMicroCny, 0),
      settledMicroCny: next.ledger.entries.reduce((sum, e) => sum + e.settledMicroCny, 0),
      unknownRequestIds: next.ledger.entries.filter(e => e.unknown).map(e => e.requestId),
    };
    if (budgetSummary(next.ledger).warning && !next.events.some(e => e.type === 'budget_warning')) this.event(next, 'budget_warning', null, 'Settled and reserved exposure reached 80% of the shared budget.');
    validateSnapshot(next);
    const issues = validateRunUpdate(this.snapshot.run, next.run, { role: 'system', actorId: 'runtime' });
    if (issues.length) throw new Error(`Invalid run update: ${issues.map(i => i.message).join('; ')}`);
    try { await this.store.write(next); }
    catch (error) { this.failed = true; clearTimeout(this.timer); this.abort.abort(error); throw error; }
    this.snapshot = next;
    if (next.stopReason) { clearTimeout(this.timer); this.abort.abort(next.stopReason); }
  }
}
