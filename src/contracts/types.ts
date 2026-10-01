export type ContractVersion = '1.0.0';
export type TaskKind = 'platform_development' | 'runtime_generation' | 'evaluation';
export type TaskState = 'not_started' | 'ready' | 'running' | 'awaiting_review' | 'needs_changes' | 'passed' | 'failed' | 'waiting_user' | 'cancelled';
export type FailureClass = 'code_defect' | 'external_service' | 'requirement_conflict' | 'insufficient_evidence';
export type EvidenceKind = 'test_report' | 'screenshot' | 'video' | 'log' | 'billing_receipt' | 'user_decision';
export interface ValidationIssue { path: string; code: string; message: string }
export interface ArtifactReference { artifactId: string; version: string; location: string }
export interface ArtifactContract extends ArtifactReference {
  contractVersion: ContractVersion;
  taskId: string;
  runId: string;
  type: string;
  schema: string;
  dependencies: ArtifactReference[];
}
export interface FailureRecord {
  classification: FailureClass;
  summary: string;
  reproduction: string[];
  actual: string;
  expected: string;
  evidenceRefs: string[];
}
export interface ContextPackage {
  contextId: string;
  rules: string[];
  interfaces: ArtifactReference[];
  knownFailures: FailureRecord[];
  tools: string[];
}
export interface RequirementContract {
  contractVersion: ContractVersion;
  specVersion: string;
  confirmedBy: string;
  confirmedAt: string;
  sources: ArtifactReference[];
  acceptance: { acceptanceId: string; description: string; steps: string[]; expected: string; evidenceKinds: EvidenceKind[] }[];
}
export interface EvidenceContract {
  contractVersion: ContractVersion;
  evidenceId: string;
  taskId: string;
  acceptanceIds: string[];
  kind: EvidenceKind;
  source: ArtifactReference;
  artifactVersions: ArtifactReference[];
  outcome: 'passed' | 'failed' | 'observed';
  recordedAt: string;
  summary: string;
}
export interface AttemptRecord {
  attemptId: string;
  sessionRef: string;
  startedAt: string;
  endedAt: string | null;
  outcome: 'running' | 'passed' | 'failed' | 'cancelled';
  failure: FailureRecord | null;
}
export interface TaskContract {
  contractVersion: ContractVersion;
  taskId: string;
  kind: TaskKind;
  runId: string;
  specVersion: string;
  authorId: string;
  acceptanceIds: string[];
  objective: string;
  dependsOn: { taskId: string; requiredState: 'passed'; state: TaskState }[];
  inputs: ArtifactReference[];
  context: ContextPackage;
  ownership: { writePaths: string[]; readOnlyPaths: string[] };
  outputs: { type: string; schema: string; destination: string }[];
  acceptance: { acceptanceId: string; steps: string[]; expected: string; evidenceDestinations: string[] }[];
  budget: { ledgerId: string; allocationMicroCny: number; originalDeadlineAt: string };
  state: TaskState;
  stateReason: string | null;
  attempts: AttemptRecord[];
  artifacts: ArtifactReference[];
  evidence: EvidenceContract[];
  handoff: { completed: string[]; remaining: string[]; uncertainty: string[]; resumeFrom: string | null };
  review: { reviewerId: string | null; contextId: string | null; inputVersions: ArtifactReference[]; verdict: 'pending' | 'approved' | 'changes_requested'; evidenceIds: string[] };
}
export interface LedgerEntry {
  requestId: string;
  taskId: string;
  provider: string;
  pricingVersion: string;
  reservedMicroCny: number;
  settledMicroCny: number;
  unknown: boolean;
  status: 'reserved' | 'settled' | 'unknown' | 'cancelled';
  evidence: ArtifactReference[];
}
export interface BudgetLedger {
  contractVersion: ContractVersion;
  ledgerId: string;
  scope: 'validation' | 'generation';
  limitMicroCny: number;
  warningThresholdPercent: 80;
  allocations: { taskId: string; amountMicroCny: number }[];
  entries: LedgerEntry[];
}
export interface RunManifest {
  contractVersion: ContractVersion;
  runId: string;
  kind: TaskKind;
  specVersion: string;
  ledgerId: string;
  originalStartedAt: string;
  originalDeadlineAt: string;
  state: TaskState;
  taskIds: string[];
  fees: { reservedMicroCny: number; settledMicroCny: number; unknownRequestIds: string[] };
  artifacts: ArtifactReference[];
  humanDecisions: { decisionId: string; actorId: string; decidedAt: string; reason: string; evidence: ArtifactReference[] }[];
}
/** Supplied by the trusted caller, never taken from an agent-authored task document. */
export interface UpdateActor { actorId: string; role: 'author' | 'reviewer' | 'system' | 'user' }
export interface ExecutionContracts { requirement: RequirementContract; task: TaskContract; ledger: BudgetLedger; run: RunManifest }
