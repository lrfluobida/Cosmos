import type { ArtifactReference, TaskContract } from '../contracts/index.ts';
import type { ArtifactRegistry } from '../artifacts/index.ts';
import type { ExecutionRequirement } from '../roles/execution-input.ts';
import type { PlanningRolePolicy } from '../roles/planner.ts';
import type { MediaMetadata } from '../artifacts/types.ts';
import type { PersistentAcceptanceSeries, PersistentAcceptanceOptions, PersistentAcceptanceReport } from '../acceptance/persistent.ts';
import type { HostIssue, HostPassedCheck } from './repair/feedback.ts';
import type { BrowserBuildReport } from './entrypoint-host.ts';
import type { RoleFactoryOptions } from '../roles/factory.ts';
import type { HistoricalPassedStages, VerifiedHistoricalStages } from './historical-passed-stages.ts';
import type { HumanPreparationScope } from './entrypoint-human-preparation.ts';
import type { HumanContinuationScope } from './entrypoint-human-continuation.ts';

export interface BrowserCandidateConsumerContext {
  root: string; task: TaskContract; candidate: ArtifactReference; project: string;
  mediaArtifact: ArtifactReference; media: MediaMetadata; manifestSha256: string; signal: AbortSignal; deadlineAt: number;
  requireCurrent(): Promise<void>;
  playPersistent(series: PersistentAcceptanceSeries, options: PersistentAcceptanceOptions): Promise<PersistentAcceptanceReport>;
}
export interface BrowserCandidateConsumerResult {
  passed: boolean; reportPath: string; mediaUsage: unknown; pictures: ArtifactReference[]; rawEvidence: ArtifactReference[];
  diagnostics: { reportValid: boolean; issues: HostIssue[]; passedChecks: Omit<HostPassedCheck, 'evidenceId'>[] };
}

export interface BrowserPreparationContext {
  root: string; registry: ArtifactRegistry; requirement: ExecutionRequirement;
  requirementCapture: ArtifactReference; requirementFile: string;
  primaryDesign: ArtifactReference; candidates: { v1: ArtifactReference; v2: ArtifactReference };
  /** Human factories expose these identities only after awaited binding; reference preparation has no placeholder IDs. */
  designTaskId: string;
  mediaTaskId: string; primaryMedia: ArtifactReference; candidateTaskIds: { v1: string; v2: string };
  name(value: string): string; signal: AbortSignal; resume: boolean;
  requireScope(): Promise<void>;
  human?: HumanPreparationScope | HumanContinuationScope;
  taskWorkspace?(taskId: string): string;
  inherited?: { binding: HistoricalPassedStages; verified: VerifiedHistoricalStages };
}
/** Trusted source-code seam. Models, proposals and games never provide these callbacks. */
export interface BrowserInputPreparation {
  adapterId: string;
  initialize(context: BrowserPreparationContext): Promise<void>;
  requireCurrent(): Promise<void>;
  /** Fixed current plans prepared before author context/signatures. */
  currentInputs?(): ArtifactReference[];
  designOutputs: PlanningRolePolicy['outputs'];
  designWritePaths: string[]; designRules: string[]; codingRules: string[];
  /** Source-owned author tools; audit writes remain mutable and unavailable to reviewers. */
  designHostTools?: { names: string[]; create: NonNullable<RoleFactoryOptions['hostTools']> };
  captureDesignExtras(task: TaskContract, workspace: string): Promise<void>;
  verifyDesignExtras(task: TaskContract): Promise<void>;
  artExtraInputs(): ArtifactReference[];
  candidateExtraInputs(candidate: ArtifactReference): ArtifactReference[];
  bindCandidate(candidate: ArtifactReference): Promise<unknown>;
  candidateConsumer?: (context: BrowserCandidateConsumerContext) => Promise<BrowserCandidateConsumerResult>;
  candidateBuildDiagnostic?: (task: TaskContract, report: BrowserBuildReport, path: string) => BrowserCandidateConsumerResult['diagnostics'];
  close(): Promise<void>;
}
