import type { ArtifactReference, BudgetLedger, LedgerEntry } from '../contracts/index.ts';
import type { RunSnapshot, StopReason } from './run-types.ts';

export type ValidationRole = 'planning' | 'design' | 'art' | 'coding' | 'repair';
export type ValidationPurpose = 'planning' | 'author' | 'reviewer';

/** A reviewed host declaration, never an execution permission by itself. */
export interface ValidationDeclaration {
  readonly formatVersion: 'validation-declaration-1' | 'validation-declaration-2' | 'validation-declaration-3'; readonly profile: 'operator_validation'; readonly caseId: string;
  readonly sourceModel: 'deepseek-flash';
  readonly limits: {
    readonly lifetimeMicroCny: number; readonly cumulativeMicroCny: number; readonly incrementalMicroCny: number;
    readonly durationMs: number; readonly maxRequests: number; readonly maxRepairTasks: number;
    readonly maxTaskAttempts: number; readonly reviewProtocolCorrections: number;
  };
  readonly grants: Readonly<Record<ValidationRole, { readonly taskId: string; readonly amountMicroCny: number }>>;
  readonly outputTokens: Readonly<Record<'planning' | 'design' | 'art' | 'coding' | 'reviewer', number>>;
  readonly inputs: {
    readonly requirements: { readonly version: string; readonly path: string; readonly sha256: string };
    readonly template: { readonly sha256: string; readonly files: readonly { readonly path: string; readonly sha256: string }[] };
  };
  readonly budgetGroup?: { readonly parentTaskId: 'COS-16'; readonly allocationMicroCny: 10_000_000 };
}

export interface ValidationBudgetGroupBinding {
  parentAllocation: { index: number; taskId: 'COS-16'; amountMicroCny: 10_000_000; sha256: string; source: ArtifactReference };
  authorizationDecisionId: string | null; memberCaseIds: string[];
  committedMicroCny: number; allocatedMicroCny: number; availableAllocationMicroCny: number;
}

export interface ValidationIdentity { reviewedPlatformSha: string; frozenCaseInputHash: string }
/** Trusted, read-only, non-reentrant observer of actual repository identity and frozen inputs. */
export type ValidationIdentityReader = (signal: AbortSignal) => Promise<ValidationIdentity>;
export interface ValidationContextOptions {
  root: string; repositoryRoot: string; identityReader: ValidationIdentityReader;
  /** A caller may shorten the 5 second maximum; never enlarge it. */
  identityTimeoutMs?: number; now?: () => number; signal?: AbortSignal;
}
export interface ValidationCaseQuote {
  formatVersion: 'validation-case-quote-1' | 'validation-case-quote-2'; profile: 'operator_validation'; activationAllowed: false; quoteId: string;
  declaration: ValidationDeclaration; identity: ValidationIdentity;
  requirements: { specVersion: string; requirementVersion: string; acceptanceIds: string[]; stageAcceptanceIds: string[] };
  basis: {
    runId: string; ledgerId: string; specVersion: string; revision: number; snapshotSha256: string;
    originalStartedAt: string; originalDeadlineAt: string; originalLimitMicroCny: number; stopReason: StopReason | null;
    committedMicroCny: number; allocatedMicroCny: number; requestIds: string[];
  };
  budgetGroup?: ValidationBudgetGroupBinding;
}
export interface OperatorValidationDecision {
  kind: 'operator_validation'; decisionId: string; actorId: string; decidedAt: string;
  /** Exact operator decision receipt, separate from human requirement confirmations. */
  source: ArtifactReference; sourceRefs: ArtifactReference[];
}
export interface ValidationCaseWindow {
  caseId: string; windowId: string; claimedAt: string; startedAt: string; deadlineAt: string; stopReason: StopReason | null;
  quote: ValidationCaseQuote;
  operatorDecision: OperatorValidationDecision & { sourceSha256: string };
  repair: { sourceTaskId: string; taskId: string; claimedAt: string; feedback: ArtifactReference } | null;
}
export interface ValidationProfile {
  profile: 'operator_validation'; currentCaseId: string; cases: ValidationCaseWindow[];
}
export interface ValidationRequestMetadata {
  caseId: string; windowId: string; purpose: ValidationPurpose;
  modelId: 'deepseek-flash'; maxOutputTokens: number; inputBytes: number; hasImages: boolean;
}
export interface ValidationAuthority {
  profile: 'operator_validation'; caseId: string; windowId: string; deadlineAt: string; purpose: ValidationPurpose;
  taskId: string; taskGrantMicroCny: number; maxOutputTokens: number;
  lifetimeLimitMicroCny: number; cumulativeLimitMicroCny: number; incrementalLimitMicroCny: number;
  committedMicroCny: number; caseCommittedMicroCny: number; remainingMicroCny: number;
  requestsUsed: number; requestsRemaining: number; executionAllowed: boolean; admissionAllowed: boolean;
  budgetGroup?: { parentTaskId: 'COS-16'; limitMicroCny: number; committedMicroCny: number; remainingMicroCny: number };
}
export interface OpenValidationCaseOptions extends ValidationContextOptions { caseId: string; windowId: string; accountingOnly?: boolean }
export interface ClaimValidationCaseOptions extends ValidationContextOptions { quote: ValidationCaseQuote; decision: OperatorValidationDecision }

export interface ValidationAllocationClosureQuote {
  formatVersion: 'validation-allocation-closure-quote-1' | 'validation-allocation-closure-quote-2'; profile: 'operator_validation_allocation_closure'; activationAllowed: false; quoteId: string;
  identity: ValidationIdentity;
  basis: {
    runId: string; ledgerId: string; specVersion: string; revision: number; snapshotSha256: string; currentCaseId: string;
    originalStartedAt: string; originalDeadlineAt: string; originalLimitMicroCny: number; stopReason: StopReason | null;
    allocatedMicroCny: number; committedMicroCny: number;
    allocations: BudgetLedger['allocations']; entries: LedgerEntry[]; requests: RunSnapshot['requests'];
    allocationDelegations?: NonNullable<BudgetLedger['allocationDelegations']>;
  };
  cases: {
    caseId: string; artifactRoot: string; windowId: string; stopReason: StopReason;
    originalQuoteId: string; originalOperatorSourceSha256: string; taskIds: string[]; requestIds: string[];
  }[];
  closures: { caseId: string; taskId: string; allocatedMicroCny: number; spentMicroCny: number; releasedMicroCny: number }[];
  releasedMicroCny: number; allocatedAfterMicroCny: number;
}
export interface OperatorValidationAllocationClosureDecision {
  kind: 'operator_validation_allocation_closure'; decisionId: string; actorId: string; decidedAt: string;
  source: ArtifactReference; sourceRefs: ArtifactReference[];
}
export interface ValidationAllocationClosureReceipt {
  appliedAt: string; quote: ValidationAllocationClosureQuote;
  operatorDecision: OperatorValidationAllocationClosureDecision & { sourceSha256: string };
}
export interface PrepareValidationAllocationClosureOptions extends ValidationContextOptions { caseIds: string[] }
export interface ApplyValidationAllocationClosureOptions extends ValidationContextOptions {
  quote: ValidationAllocationClosureQuote; decision: OperatorValidationAllocationClosureDecision;
}
