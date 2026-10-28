import type { ArtifactReference, LedgerEntry } from '../contracts/types.ts';
import type { RunLimits } from '../cli/run-limits.ts';
import type { ConfirmedRequirementsSource } from './confirmed-requirements-source.ts';

interface PublicValidationAuthorizationFields {
  fundingId: string;
  sharedRoot: string; sharedRunId: string; sharedLedgerId: string;
  runRoot: string; runId: string; ledgerId: string;
  limits: RunLimits; brief: string; renderFrames: boolean;
  decisionId: string; actorId: string; decidedAt: string;
  sourceRefs: ArtifactReference[];
}
export type PublicValidationAuthorization = PublicValidationAuthorizationFields & (
  { formatVersion: 'public-validation-authorization/1'; requirementsSource?: never }
  | { formatVersion: 'public-validation-authorization/2'; requirementsSource: ConfirmedRequirementsSource }
);
export interface PublicValidationFundingBinding {
  formatVersion: 'public-validation-binding/1';
  fundingId: string;
  sharedRoot: string; sharedRunId: string; sharedLedgerId: string;
  runRoot: string; runId: string; ledgerId: string;
  limits: RunLimits;
  authorization: ArtifactReference; authorizationSha256: string;
}
export interface PublicValidationSettledRequest { entry: LedgerEntry; admittedAt: string | null }
export interface PublicValidationFundingRecord {
  binding: PublicValidationFundingBinding;
  phaseDecisionId?: string;
  taskId: string; claimedAt: string; basisRevision: number;
  settlement?: {
    settledAt: string; outcome: 'closed' | 'overrun';
    source: ArtifactReference; sourceSha256: string;
    settledMicroCny: number; releasedMicroCny: number;
    requests: PublicValidationSettledRequest[];
  };
}
