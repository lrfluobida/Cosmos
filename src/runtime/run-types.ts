import type { ArtifactReference, BudgetLedger, RunManifest, TaskContract } from '../contracts/index.ts';
import type { ContinuationQuote } from './continuation-quote.ts';

export interface RequestInput {
  requestId: string;
  taskId: string;
  provider: string;
  pricingVersion: string;
  estimatedMaxCostMicroCny: number;
}

export interface ImportedCharge extends Omit<RequestInput, 'estimatedMaxCostMicroCny'> {
  actualCostMicroCny: number;
  evidence: ArtifactReference[];
}

export interface StopReason {
  code: 'deadline' | 'charge_overrun' | 'manual';
  reason: string;
  at: string;
}

export interface RunEvent {
  sequence: number;
  at: string;
  type: 'created' | 'reserved' | 'admitted' | 'settled' | 'unknown' | 'cancelled' | 'imported' | 'budget_warning' | 'stopped' | 'task_saved' | 'generation_activated' | 'continuation_activated' | 'window_stopped' | 'window_owner_drained' | 'window_owner_resumed';
  requestId: string | null;
  reason: string;
}

/** Runtime metadata and COS-02 contracts commit together, never as separate files. */
export interface RunSnapshot {
  formatVersion: 1 | 2;
  revision: number;
  run: RunManifest;
  ledger: BudgetLedger;
  tasks: TaskContract[];
  requests: { requestId: string; admittedAt: string | null; windowId?: string }[];
  stopReason: StopReason | null;
  events: RunEvent[];
  continuation?: { currentWindowId: string; windows: ExecutionWindow[] };
}

/** Supplied only by the trusted host after collecting a real user decision. */
export interface ContinuationConfirmation {
  decisionId: string; actorId: string; decidedAt: string; source: ArtifactReference;
}

export interface ExecutionWindow {
  windowId: string; decisionId: string; startedAt: string; deadlineAt: string; stopReason: StopReason | null;
  quote: ContinuationQuote;
  confirmation: ContinuationConfirmation & { sourceSha256: string };
  grants: { sourceTaskId: string; taskId: string; amountMicroCny: number }[];
  verification: { ownerAndAccounting: 'verified'; fixedQuoteInputs: 'verified'; artifactReuse: 'pending_task_validation' };
}

export interface ExecutionAuthority {
  windowId: string | null; deadlineAt: string; effectiveLimitMicroCny: number;
  taskGrantMicroCny: number; admissionAllowed: boolean;
}
