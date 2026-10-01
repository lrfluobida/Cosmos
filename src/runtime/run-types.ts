import type { ArtifactReference, BudgetLedger, RunManifest, TaskContract } from '../contracts/index.ts';

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
  type: 'created' | 'reserved' | 'admitted' | 'settled' | 'unknown' | 'cancelled' | 'imported' | 'budget_warning' | 'stopped' | 'task_saved' | 'generation_activated';
  requestId: string | null;
  reason: string;
}

/** Runtime metadata and COS-02 contracts commit together, never as separate files. */
export interface RunSnapshot {
  formatVersion: 1;
  revision: number;
  run: RunManifest;
  ledger: BudgetLedger;
  tasks: TaskContract[];
  requests: { requestId: string; admittedAt: string | null }[];
  stopReason: StopReason | null;
  events: RunEvent[];
}
