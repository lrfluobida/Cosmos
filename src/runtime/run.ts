import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { regularFile } from '../artifacts/paths.ts';
import { DEFAULT_BUDGETS, budgetCapacity, budgetSummary, validateLedgerUpdate, validateRunUpdate, validateTaskUpdate } from '../contracts/index.ts';
import type { ArtifactReference, BudgetLedger, LedgerEntry, TaskContract, TaskKind, UpdateActor } from '../contracts/index.ts';
import { appendEvidence, evidenceReferences, findRequest, money, nonEmpty, requireOpen, reserveEntry, settleEntry } from '../budget/ledger.ts';
import { SnapshotStore } from './store.ts';
import { validateSnapshot } from './run-validation.ts';
import { activateContinuation } from './continuation-authority.ts';
import { claimValidationCase, verifyOperatorDecision, verifyValidationIdentity } from './validation-window.ts';
import { applyValidationAllocationClosure, prepareValidationAllocationClosure } from './validation-allocations.ts';
import { currentValidationCase, requireValidationRepairSource, requireValidationTask, validationOutputCap, validationReservation, validationRole, validationUsage } from './validation-validation.ts';
import { sameValue } from '../contracts/validation.ts';
import { validateExecutionInput } from '../roles/execution-input.ts';
import type { ValidationRequirement } from '../roles/execution-input.ts';
import type { OpenValidationCaseOptions, ValidationAuthority, ValidationCaseWindow, ValidationPurpose, ValidationRequestMetadata } from './validation-types.ts';
import { requireContinuationTask } from './continuation-validation.ts';
import { OwnedWork } from './recovery/owned-work.ts';
import { idleAnchor, idleHash, publishWindowIdle, requireNoRegistryWriter, requireWindowIdle } from './window-idle.ts';
import type { ExecutionAuthority, ExecutionWindow, ImportedCharge, RequestInput, RunEvent, RunSnapshot, StopReason } from './run-types.ts';
export type { ImportedCharge, RequestInput, RunSnapshot } from './run-types.ts';

export interface OpenRunOptions { root: string; now?: () => number; windowId?: string }
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
  static activateContinuation = activateContinuation;
  static claimValidationCase = claimValidationCase;
  static prepareValidationAllocationClosure = prepareValidationAllocationClosure;
  static applyValidationAllocationClosure = applyValidationAllocationClosure;
  private store: SnapshotStore;
  private snapshot: RunSnapshot;
  private now: () => number;
  private pending: Promise<unknown> = Promise.resolve();
  private accounting: Promise<unknown> = Promise.resolve();
  private closing = false;
  private closePromise?: Promise<void>;
  private failed = false;
  private abort = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private readonly windowId?: string;
  private childTasks = new Map<string, string>();
  private readonly validationContext?: OpenValidationCaseOptions;
  private readonly combinedSignal?: AbortSignal;

  private constructor(store: SnapshotStore, snapshot: RunSnapshot, now: () => number, windowId?: string, validationContext?: OpenValidationCaseOptions) {
    this.store = store; this.snapshot = snapshot; this.now = now;
    this.windowId = windowId;
    this.validationContext = validationContext;
    if (validationContext?.signal) this.combinedSignal = AbortSignal.any([this.abort.signal, validationContext.signal]);
    if (this.activeStop()) this.abort.abort(this.activeStop());
    if (validationContext?.accountingOnly) this.abort.abort(new Error('Accounting-only validation owner cannot dispatch work.'));
  }

  get signal(): AbortSignal { return this.combinedSignal ?? this.abort.signal; }

  /** Legacy executors must reject before read() can expire or otherwise mutate a window. */
  requireOriginalExecution(): void {
    if (this.snapshot.formatVersion !== 1) throw new Error('Continuation execution is unsupported by this legacy entrypoint.');
  }

  /** Identity check only: no read/expiration side effect and no new admission authority. */
  requireExecutionWindow(windowId?: string): void {
    if (windowId === undefined) { this.requireOriginalExecution(); return; }
    if (this.snapshot.formatVersion !== 2 || windowId !== this.windowId || windowId !== this.snapshot.continuation?.currentWindowId) throw new Error('Explicit current execution window does not match this controller.');
  }

  requireValidationCase(caseId: string, windowId: string): void {
    const current = this.validationWindow();
    if (caseId !== current.caseId || windowId !== current.windowId) throw new Error('Explicit validation case/window does not match this controller.');
    this.requireActive();
    if (this.now() >= Date.parse(current.deadlineAt)) throw new Error('Validation case deadline expired.');
  }

  /** Host-only, non-reentrant coordination of admission or receipt settlement.
   * Do not hold this across a provider call. Public ledger methods retain their
   * own persistence queue; this separate queue never recursively enters serial. */
  coordinateAccounting<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.accounting.then(operation);
    this.accounting = result.catch(() => {});
    return result;
  }

  /** Persist before spawn; a pending ticket blocks automatic recovery after a crash. */
  prepareOwnedChild(authority?: { taskId: string; windowId: string }): Promise<string> {
    return this.serial(async () => {
      this.requireActive();
      if (this.windowId) {
        if (!authority || authority.windowId !== this.windowId) throw new Error('Owned child requires its explicit task and window authority.');
        this.requireTaskAuthority(authority.taskId);
      }
      const ticket = await this.store.prepareOwnedChild();
      if (authority && this.windowId) this.childTasks.set(ticket, authority.taskId);
      return ticket;
    });
  }
  /** Bind the waiting child before releasing its startup barrier or allowing writes. */
  registerOwnedChild(pid: number, ticket: string): Promise<void> {
    return this.serial(async () => {
      // Retain the PID even when authority expired, so close/recovery cannot lose a writer.
      await this.store.registerOwnedChild(pid, ticket);
      if (this.windowId) { this.requireActive(); this.requireTaskAuthority(this.childTasks.get(ticket) ?? ''); }
    });
  }

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
      if (snapshot.formatVersion === 3) throw new Error('Validation profile requires explicit openValidationCase; legacy and formal entrypoints are unsupported.');
      if (snapshot.formatVersion === 2 ? options.windowId !== snapshot.continuation!.currentWindowId : options.windowId !== undefined) throw new Error('Continuation snapshot requires its explicit current execution window; ordinary execution entrypoints are unsupported.');
      const controller = new RunController(store, snapshot, options.now ?? Date.now, options.windowId);
      const next = structuredClone(snapshot);
      const anchor = idleAnchor(next);
      if (anchor) controller.event(next, 'window_owner_resumed', null, JSON.stringify({ windowId: anchor.windowId, anchorSequence: anchor.sequence }));
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

  static async openValidationCase(options: OpenValidationCaseOptions): Promise<RunController> {
    const store = await SnapshotStore.acquire(options.root);
    try {
      const snapshot = await store.read(); validateSnapshot(snapshot);
      const window = currentValidationCase(snapshot), now = options.now ?? Date.now;
      if (window.caseId !== options.caseId || window.windowId !== options.windowId) throw new Error('Wrong validation case or window.');
      if (!options.accountingOnly && (window.stopReason || now() >= Date.parse(window.deadlineAt))) throw new Error('Validation case is stopped or its deadline expired.');
      await requireNoRegistryWriter(store.root);
      await verifyValidationIdentity(options, window.quote.declaration, window.quote.identity, options.accountingOnly ? undefined : window.deadlineAt);
      const { sourceSha256, ...decision } = window.operatorDecision;
      if ((await verifyOperatorDecision(store.root, window.quote, decision, now())).sourceSha256 !== sourceSha256) throw new Error('Operator validation source changed.');
      const context: OpenValidationCaseOptions = { root: store.root, repositoryRoot: options.repositoryRoot, caseId: options.caseId, windowId: options.windowId,
        identityReader: options.identityReader, identityTimeoutMs: options.identityTimeoutMs, accountingOnly: options.accountingOnly, now, signal: options.signal };
      const controller = new RunController(store, snapshot, now, window.windowId, context), next = structuredClone(snapshot);
      for (const record of next.requests) {
        const entry = findRequest(next.ledger, record.requestId);
        if (record.admittedAt && entry.status === 'reserved') { entry.status = 'unknown'; entry.unknown = true; controller.event(next, 'unknown', entry.requestId, 'Validation owner reopened without a durable response; reconcile before new dispatch.'); }
      }
      if (next.events.length !== snapshot.events.length) await controller.commit(next);
      await controller.expire();
      if (!options.accountingOnly) controller.armDeadline();
      return controller;
    } catch (error) { await store.close(); throw error; }
  }

  async read(): Promise<RunSnapshot> { return this.serial(async () => structuredClone(this.snapshot)); }

  /** One authority view for all window-aware host admission paths. */
  executionAuthority(taskId: string): Promise<ExecutionAuthority> {
    if (this.snapshot.formatVersion === 3) return Promise.reject(new Error('Validation profile requires validationAuthority; the legacy SDK path is unsupported.'));
    return this.serial(async () => this.taskAuthority(taskId));
  }

  validationAuthority(taskId: string, purpose: ValidationPurpose): Promise<ValidationAuthority> {
    this.validationWindow();
    return this.serial(async () => this.validationTaskAuthority(taskId, purpose));
  }

  /** Explicit generic host guard; identity checking may persist the existing deadline stop. */
  requireValidationHost(caseId: string, windowId: string, artifactRoot: string): Promise<void> {
    return this.serial(async () => {
      this.requireValidationCase(caseId, windowId);
      if (resolve(artifactRoot) !== resolve(this.validationContext!.repositoryRoot, '.cosmos/e2e', caseId)) throw new Error('Validation host root differs from its current case.');
      if (this.snapshot.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny > 0)) throw new Error('Validation host charges require reconciliation before dispatch.');
      await this.checkValidationIdentity();
      this.requireValidationCase(caseId, windowId);
    });
  }

  async claimValidationRepair(input: { sourceTaskId: string; feedback: ArtifactReference }): Promise<NonNullable<ValidationCaseWindow['repair']>> {
    const request = structuredClone(input);
    return this.serial(async () => {
      this.requireActive(); const window = this.validationWindow();
      if (window.repair) {
        if (window.repair.sourceTaskId !== request.sourceTaskId || !sameValue(window.repair.feedback, request.feedback)) throw new Error('Semantic repair was already claimed for another source or feedback.');
        return structuredClone(window.repair);
      }
      if (window.quote.declaration.limits.maxRepairTasks !== 1) throw new Error('This case does not permit a semantic repair.');
      requireValidationRepairSource(this.snapshot, request.sourceTaskId, request.feedback);
      await this.checkValidationIdentity();
      const next = structuredClone(this.snapshot), current = this.validationWindow(next);
      current.repair = { ...request, taskId: current.quote.declaration.grants.repair.taskId, claimedAt: this.at() };
      this.event(next, 'validation_repair_claimed', null, `One distinct repair task claimed for ${request.sourceTaskId}.`);
      await this.commit(next); return structuredClone(current.repair);
    });
  }

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
      if (this.snapshot.formatVersion === 3) {
        this.requireValidationRequest(request.taskId, request.validation);
        if (request.provider !== 'deepseek' || request.pricingVersion !== 'deepseek-flash-peak-cny-2026-10-01') throw new Error('Validation provider or pricing changed.');
        if (this.snapshot.ledger.entries.some(entry => entry.unknown)) throw new Error('Reconcile unknown requests before validation admission.');
        const authority = this.validationTaskAuthority(request.taskId, request.validation!.purpose);
        if (!authority.admissionAllowed) throw new Error('Validation request ceiling, budget or task admission is unavailable.');
        if (request.estimatedMaxCostMicroCny < validationReservation(request.validation!) || request.estimatedMaxCostMicroCny > authority.remainingMicroCny) throw new Error('Validation reservation does not fit the actual output cap or remaining case budget.');
        await this.checkValidationIdentity();
      } else {
        if (request.validation) throw new Error('Validation metadata requires the explicit validation profile.');
        this.requireTaskAuthority(request.taskId);
      }
      const next = structuredClone(this.snapshot);
      const entry = reserveEntry(next.ledger, request);
      next.requests.push({ requestId: request.requestId, admittedAt: null, ...(this.windowId ? { windowId: this.windowId } : {}), ...(request.validation ? { validation: request.validation } : {}) });
      this.event(next, 'reserved', request.requestId, 'Maximum known cost reserved before dispatch.');
      await this.commit(next);
      return structuredClone(entry);
    });
  }

  /** Persist dispatch intent immediately before the provider call. Never call twice. */
  async admit(requestId: string): Promise<void> {
    return this.serial(async () => {
      this.requireActive();
      const entry = findRequest(this.snapshot.ledger, requestId);
      if (this.snapshot.formatVersion === 3) {
        this.requireValidationRequest(entry.taskId, this.snapshot.requests.find(record => record.requestId === requestId)?.validation);
        requireOpen(entry);
        if (this.snapshot.requests.find(record => record.requestId === requestId)?.admittedAt) throw new Error('Validation request already admitted.');
        await this.checkValidationIdentity();
      } else this.requireTaskAuthority(entry.taskId);
      if (this.snapshot.requests.find(record => record.requestId === requestId)?.windowId !== this.windowId) throw new Error('Request belongs to another execution window.');
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
      return { halted: this.activeStop(next) !== null };
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
      if (this.windowId) throw new Error('Historical imports must be reconciled before continuation; closed grants cannot receive new charges.');
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
        if (next.formatVersion === 3) requireValidationTask(next, task);
        else if (this.windowId) requireContinuationTask(next, task);
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
      if (this.windowId) {
        if (next.formatVersion === 3) {
          if (this.validationContext?.accountingOnly) throw new Error('Accounting-only validation cannot write task or attempt history.');
          requireValidationTask(next, value);
        } else requireContinuationTask(next, value);
        if (!previous) throw new Error('Use registerTasks for a fresh continuation task.');
        if (this.activeStop() && (!['cancelled', 'failed', 'waiting_user'].includes(value.state) || value.attempts.some(attempt => attempt.outcome === 'running')
          || value.attempts.length !== previous.attempts.length || value.attempts.some((attempt, i) => attempt.attemptId !== previous.attempts[i].attemptId))) throw new Error('Stopped window permits only finalizing existing attempts; it cannot start another attempt.');
      }
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

  /** Complete only the current validation coding review. Both existing actor
   * transitions are checked before the single final snapshot publication. */
  async saveValidationReviewCompletion(input: {
    caseId: string; windowId: string; requirement: ValidationRequirement;
    expectedPrevious: TaskContract; completion: TaskContract; reviewed: TaskContract; reviewerId: string; contextId: string;
  }): Promise<void> {
    const value = structuredClone(input);
    return this.serial(async () => {
      if (this.snapshot.formatVersion !== 3 || !this.validationContext || this.validationContext.accountingOnly) throw new Error('Atomic review completion requires the active validation owner.');
      this.requireValidationCase(value.caseId, value.windowId);
      const next = structuredClone(this.snapshot), window = currentValidationCase(next), previous = next.tasks.find(task => task.taskId === value.expectedPrevious.taskId);
      const role = validationRole(window, value.expectedPrevious.taskId), { sourceSha256: _hash, ...decision } = window.operatorDecision;
      if (!previous || !sameValue(previous, value.expectedPrevious) || previous.state !== 'awaiting_review' || previous.review.verdict !== 'pending'
        || previous.attempts.at(-1)?.outcome !== 'running' || !(role === 'coding' || role === 'repair' && window.repair?.sourceTaskId === window.quote.declaration.grants.coding.taskId)
        || !this.validationTaskAuthority(previous.taskId, 'reviewer').executionAllowed || next.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny > 0)) throw new Error('Atomic coding completion requires the exact pending task and reconciled current case.');
      const data = value.requirement.validation;
      if (!data || data.runId !== next.run.runId || data.ledgerId !== next.ledger.ledgerId || data.caseId !== window.caseId || data.windowId !== window.windowId
        || data.reviewedPlatformSha !== window.quote.identity.reviewedPlatformSha || data.frozenCaseInputHash !== window.quote.identity.frozenCaseInputHash
        || !sameValue(data.decision, decision)) throw new Error('Atomic coding completion requires its exact fixed validation requirement.');
      if (!value.reviewerId.trim() || !value.contextId.trim() || value.reviewerId === previous.authorId || value.contextId === previous.context.contextId
        || value.reviewed.review.reviewerId !== value.reviewerId || value.reviewed.review.contextId !== value.contextId
        || !['passed', 'needs_changes'].includes(value.reviewed.state) || (value.reviewed.state === 'passed') !== (value.reviewed.review.verdict === 'approved')
        || value.completion.attempts.at(-1)?.outcome !== 'passed' || !sameValue(value.reviewed.evidence, previous.evidence)) throw new Error('Atomic coding completion requires the exact independent final review.');
      for (const key of Object.keys(previous) as (keyof TaskContract)[]) if (!['attempts', 'handoff'].includes(key) && !sameValue(value.completion[key], previous[key])) throw new Error('Atomic completion can only finalize the pending attempt and handoff.');
      if (!sameValue(value.completion.handoff.completed, previous.handoff.completed) || value.completion.handoff.resumeFrom !== previous.handoff.resumeFrom) throw new Error('Atomic completion must retain the original author handoff.');
      requireValidationTask(next, value.completion); requireValidationTask(next, value.reviewed);
      const issues = [...validateTaskUpdate(previous, value.completion, { role: 'system', actorId: 'orchestrator' }),
        ...validateTaskUpdate(value.completion, value.reviewed, { role: 'reviewer', actorId: value.reviewerId }),
        ...validateExecutionInput({ requirement: value.requirement, task: value.reviewed, ledger: next.ledger, run: next.run })];
      if (issues.length) throw new Error(`Invalid atomic coding review completion: ${issues.map(issue => issue.message).join('; ')}`);
      next.tasks[next.tasks.indexOf(previous)] = value.reviewed;
      this.event(next, 'task_saved', null, `Task contract persisted: ${previous.taskId}`);
      await this.commit(next);
    });
  }

  async stop(reason: string): Promise<void> {
    if (this.snapshot.formatVersion === 3) { nonEmpty(reason, 'Stop reason'); this.abort.abort(new Error(reason)); }
    return this.serial(async () => {
      nonEmpty(reason, 'Stop reason');
      if (this.activeStop()) return;
      const next = structuredClone(this.snapshot);
      this.halt(next, 'manual', reason);
      await this.commit(next);
    });
  }

  /** An idle receipt proves lifecycle convergence only, never new execution authority. */
  static async stopIdleWindow(options: { root: string; windowId: string; reason?: string; now?: () => number }): Promise<{ runId: string; windowId: string; stopped: true }> {
    const store = await SnapshotStore.acquire(options.root);
    let controller: RunController | undefined;
    try {
      const state = await store.read(); validateSnapshot(state);
      await requireWindowIdle(store.root, state, options.windowId);
      controller = new RunController(store, state, options.now ?? Date.now, options.windowId);
      await controller.stop(options.reason ?? 'User requested an idle window stop.');
      return { runId: state.run.runId, windowId: options.windowId, stopped: true };
    } finally { if (controller) await controller.close(); else await store.close(); }
  }

  /** Drain real host work, retain a private nonce through owner close, then publish proof. */
  async closeAfterDrain(work: OwnedWork): Promise<void> {
    this.requireExecutionWindow(this.windowId);
    if (!this.windowId || !(work instanceof OwnedWork) || this.closing || this.failed) throw new Error('Idle close requires a current window and its open owned work.');
    await work.cancelAndDrain('Window owner is closing.');
    await this.accounting;
    await requireNoRegistryWriter(this.store.root);
    if (this.closing || this.failed) throw new Error('Window owner closed before idle proof was prepared.');
    this.closing = true; clearTimeout(this.timer);
    const nonce = randomBytes(32).toString('hex');
    const anchored = this.pending.then(async () => {
      if (this.failed) throw new Error('Window persistence failed before idle proof.');
      await this.expire();
      const next = structuredClone(this.snapshot);
      this.event(next, 'window_owner_drained', null, JSON.stringify({ windowId: this.windowId, nonceSha256: idleHash(nonce) }));
      await this.commit(next);
      return { state: structuredClone(this.snapshot), bytes: await regularFile(this.store.root, 'snapshot.json') };
    });
    this.pending = anchored.catch(() => {});
    const proof = await anchored;
    await this.close();
    await publishWindowIdle(this.store.root, proof.state, nonce, proof.bytes);
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    clearTimeout(this.timer);
    this.abort.abort(new Error('Run controller closed.'));
    this.closePromise = this.pending.then(() => this.store.close()).catch(error => { this.closePromise = undefined; throw error; });
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
    if (this.validationContext?.accountingOnly) throw new Error('Accounting-only validation owner cannot dispatch work.');
    const stop = this.activeStop();
    if (stop) throw new Error(`Run stopped: ${stop.code}: ${stop.reason}`);
    this.signal.throwIfAborted();
  }

  private validationWindow(state = this.snapshot): ValidationCaseWindow {
    const window = currentValidationCase(state);
    if (!this.validationContext || this.validationContext.caseId !== window.caseId || this.windowId !== window.windowId) throw new Error('Validation case authority is not bound to this instance.');
    return window;
  }

  private window(state = this.snapshot): ExecutionWindow | ValidationCaseWindow | undefined {
    if (!this.windowId) return undefined;
    if (state.formatVersion === 3) return this.validationWindow(state);
    const window = state.continuation?.windows.find(item => item.windowId === this.windowId);
    if (!window || state.continuation?.currentWindowId !== this.windowId) throw new Error('Execution window authority is no longer current.');
    return window;
  }

  private activeStop(state = this.snapshot): StopReason | null {
    const window = this.window(state); return window ? window.stopReason : state.stopReason;
  }

  private deadlineAt(): string { return this.window()?.deadlineAt ?? this.snapshot.run.originalDeadlineAt; }

  private taskAuthority(taskId: string): ExecutionAuthority {
    const grant = this.snapshot.ledger.allocations.find(item => item.taskId === taskId);
    const task = this.snapshot.tasks.find(item => item.taskId === taskId);
    const window = this.snapshot.formatVersion === 2 ? this.window() as ExecutionWindow : undefined;
    const eligible = !window || !!task && window.grants.some(item => item.taskId === taskId) && ['not_started', 'ready', 'running', 'awaiting_review'].includes(task.state) && task.attempts.length <= 1;
    return { windowId: this.windowId ?? null, deadlineAt: this.deadlineAt(), effectiveLimitMicroCny: budgetCapacity(this.snapshot.ledger).effectiveLimitMicroCny,
      taskGrantMicroCny: grant?.amountMicroCny ?? 0, admissionAllowed: !!grant && eligible && !this.activeStop() && this.now() < Date.parse(this.deadlineAt()) && !this.snapshot.ledger.allocationClosures?.some(item => item.taskId === taskId) && !budgetSummary(this.snapshot.ledger).reconciliationRequired };
  }

  private requireTaskAuthority(taskId: string): void {
    if (this.snapshot.formatVersion === 3) {
      if (this.snapshot.ledger.entries.some(entry => entry.unknown)) throw new Error('Unknown requests require reconciliation before owned child dispatch.');
      const authority = this.validationTaskAuthority(taskId, validationRole(this.validationWindow(), taskId) === 'planning' ? 'planning' : 'author');
      if (!authority.executionAllowed) throw new Error('Task has no validation execution authority.');
      return;
    }
    if (!this.windowId) return;
    if (budgetSummary(this.snapshot.ledger).reconciliationRequired) throw new Error('Reconciliation required before further execution admission.');
    if (!this.taskAuthority(taskId).admissionAllowed) throw new Error('Task is not registered with active execution authority, or its grant is closed.');
  }

  private validationTaskAuthority(taskId: string, purpose: ValidationPurpose): ValidationAuthority {
    const window = this.validationWindow(), d = window.quote.declaration, role = validationRole(window, taskId);
    const maxOutputTokens = validationOutputCap(window, taskId, purpose);
    if (!role) throw new Error('Unknown validation case task grant.');
    const task = this.snapshot.tasks.find(item => item.taskId === taskId), usage = validationUsage(this.snapshot, window);
    const taskCommitted = this.snapshot.ledger.entries.filter(entry => entry.taskId === taskId).reduce((sum, entry) => sum + entry.reservedMicroCny + entry.settledMicroCny, 0);
    const remainingMicroCny = Math.max(0, Math.min(d.limits.lifetimeMicroCny - usage.committedMicroCny, d.limits.cumulativeMicroCny - usage.committedMicroCny,
      d.limits.incrementalMicroCny - usage.caseCommittedMicroCny, d.grants[role].amountMicroCny - taskCommitted));
    const executionAllowed = !this.validationContext!.accountingOnly && !this.signal.aborted && !window.stopReason && this.now() < Date.parse(window.deadlineAt)
      && (role === 'planning' || !!task && ['not_started', 'ready', 'running', 'awaiting_review'].includes(task.state));
    const purposeAllowed = purpose !== 'author' || !task?.attempts.some(attempt => attempt.outcome !== 'running');
    return { profile: 'operator_validation', caseId: window.caseId, windowId: window.windowId, deadlineAt: window.deadlineAt, purpose, taskId,
      taskGrantMicroCny: d.grants[role].amountMicroCny, maxOutputTokens, lifetimeLimitMicroCny: d.limits.lifetimeMicroCny, cumulativeLimitMicroCny: d.limits.cumulativeMicroCny,
      incrementalLimitMicroCny: d.limits.incrementalMicroCny, ...usage, remainingMicroCny, requestsRemaining: Math.max(0, d.limits.maxRequests - usage.requestsUsed), executionAllowed,
      admissionAllowed: executionAllowed && purposeAllowed && usage.requestsUsed < d.limits.maxRequests && remainingMicroCny > 0 && !this.snapshot.ledger.entries.some(entry => entry.unknown) };
  }

  private requireValidationRequest(taskId: string, metadata?: ValidationRequestMetadata): void {
    const window = this.validationWindow();
    if (!metadata || metadata.caseId !== window.caseId || metadata.windowId !== window.windowId || metadata.modelId !== window.quote.declaration.sourceModel) throw new Error('Validation request metadata has the wrong case, window or model.');
    if (metadata.maxOutputTokens > validationOutputCap(window, taskId, metadata.purpose)) throw new Error('Validation request exceeds its reviewed output token cap.');
    validationReservation(metadata);
    if (metadata.purpose === 'author' && this.snapshot.tasks.find(task => task.taskId === taskId)?.attempts.some(attempt => attempt.outcome !== 'running')) throw new Error('A finished author attempt cannot dispatch another author request.');
    if (!this.validationTaskAuthority(taskId, metadata.purpose).executionAllowed) throw new Error('Validation task has no active purpose authority.');
  }

  private async checkValidationIdentity(): Promise<void> {
    const window = this.validationWindow();
    try { await verifyValidationIdentity({ ...this.validationContext!, signal: this.signal }, window.quote.declaration, window.quote.identity, window.deadlineAt); }
    finally { await this.expire(); }
    this.requireActive();
  }

  private halt(next: RunSnapshot, code: StopReason['code'], reason: string): void {
    // An overcharge discovered after another stop remains an explicit durable incident.
    const window = this.window(next);
    if (window) {
      if (!window.stopReason || code === 'charge_overrun') window.stopReason = { code, reason, at: this.at() };
    } else if (!next.stopReason || code === 'charge_overrun') next.stopReason = { code, reason, at: this.at() };
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
    this.event(next, next.formatVersion === 3 ? 'validation_case_stopped' : window ? 'window_stopped' : 'stopped', null, reason);
  }

  private async expire(): Promise<void> {
    if (!this.activeStop() && this.now() >= Date.parse(this.deadlineAt())) {
      const next = structuredClone(this.snapshot);
      this.halt(next, 'deadline', this.windowId ? 'Execution window hard deadline reached.' : 'Original hard deadline reached.');
      await this.commit(next);
    }
  }

  private armDeadline(): void {
    if (this.activeStop()) return;
    const delay = Math.max(1, Date.parse(this.deadlineAt()) - this.now());
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
    if (next.formatVersion !== 1) issues.push(...validateLedgerUpdate(this.snapshot.ledger, next.ledger, { role: 'system', actorId: 'runtime' }, { allowOverrunFacts: this.activeStop(next)?.code === 'charge_overrun' }));
    if (issues.length) throw new Error(`Invalid run update: ${issues.map(i => i.message).join('; ')}`);
    try { await this.store.write(next); }
    catch (error) { this.failed = true; clearTimeout(this.timer); this.abort.abort(error); throw error; }
    this.snapshot = next;
    if (this.activeStop(next)) { clearTimeout(this.timer); this.abort.abort(this.activeStop(next)); }
  }
}
