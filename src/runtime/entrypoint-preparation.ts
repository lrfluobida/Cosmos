import type { ArtifactReference, TaskContract } from '../contracts/index.ts';
import type { ArtifactRegistry } from '../artifacts/index.ts';
import type { ExecutionRequirement } from '../roles/execution-input.ts';
import type { PlanningRolePolicy } from '../roles/planner.ts';

export interface BrowserPreparationContext {
  root: string; registry: ArtifactRegistry; requirement: ExecutionRequirement;
  requirementCapture: ArtifactReference; requirementFile: string;
  primaryDesign: ArtifactReference; candidates: { v1: ArtifactReference; v2: ArtifactReference };
  designTaskId: string;
  name(value: string): string; signal: AbortSignal; resume: boolean;
  requireScope(): Promise<void>;
}
/** Trusted source-code seam. Models, proposals and games never provide these callbacks. */
export interface BrowserInputPreparation {
  adapterId: string;
  initialize(context: BrowserPreparationContext): Promise<void>;
  requireCurrent(): Promise<void>;
  designOutputs: PlanningRolePolicy['outputs'];
  designWritePaths: string[]; designRules: string[]; codingRules: string[];
  captureDesignExtras(task: TaskContract, workspace: string): Promise<void>;
  verifyDesignExtras(task: TaskContract): Promise<void>;
  artExtraInputs(): ArtifactReference[];
  candidateExtraInputs(candidate: ArtifactReference): ArtifactReference[];
  bindCandidate(candidate: ArtifactReference): Promise<unknown>;
  close(): Promise<void>;
}
