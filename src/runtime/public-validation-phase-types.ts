import type { ArtifactReference } from '../contracts/types.ts';

export interface PublicValidationPhaseQuote {
  formatVersion: 'public-validation-phase-quote/1'; scope: 'public_validation_funding'; activationAllowed: false;
  quoteId: string; sharedRoot: string; repositoryRoot: string;
  fromMicroCny: 30_000_000; toMicroCny: 40_000_000; lifetimeMicroCny: 150_000_000;
  maxRunMicroCny: 5_000_000; maxDurationMs: 1_800_000;
  basis: {
    runId: string; ledgerId: string; revision: number; snapshotSha256: string;
    committedMicroCny: number; heldMicroCny: number; allocatedMicroCny: number;
    allocationCount: number; entryCount: number; requestCount: number; caseCount: number;
    taskCount: number; closureCount: number; fundingCount: number; eventCount: number; historySha256: string;
  };
}
/** The trusted caller supplies a separate, explicit operator budget decision. */
export interface PublicValidationPhaseDecision {
  kind: 'operator_public_validation_phase_extension'; decisionId: string; actorId: string; decidedAt: string;
  source: ArtifactReference; sourceRefs: ArtifactReference[];
}
export interface PublicValidationPhaseReceipt {
  activationAllowed: false; appliedAt: string; quote: PublicValidationPhaseQuote;
  operatorDecision: PublicValidationPhaseDecision & { sourceSha256: string };
}
export interface PublicValidationPhaseOptions { root: string; repositoryRoot: string; now?: () => number }
