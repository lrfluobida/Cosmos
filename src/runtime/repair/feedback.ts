import { validateContext, validateTask } from '../../contracts/index.ts';
import { sameValue } from '../../contracts/validation.ts';
import type { ArtifactReference, FailureRecord, TaskContract } from '../../contracts/types.ts';
import { PiSessionError } from '../../providers/pi.ts';
import type { RunSnapshot } from '../run-types.ts';

export interface HostIssue extends FailureRecord { acceptanceId: string; checkId: string }
/** The trusted host extracts a passed step from this current report. A report
 * may still fail other steps; this witness never becomes completion evidence. */
export interface HostPassedCheck { acceptanceId: string; checkId: string; evidenceId: string }
export type FailureStage = 'execution' | 'author_handoff' | 'host_verification' | 'independent_review';
export interface RepairFeedback {
  formatVersion: 1;
  reference: ArtifactReference;
  runId: string; specVersion: string; sourceTaskId: string; sourceAttemptId: string; sessionRef: string;
  originalDeadlineAt: string;
  acceptance: TaskContract['acceptance']; artifactVersions: ArtifactReference[];
  issues: HostIssue[];
  passedChecks: HostPassedCheck[];
  charges: { requestId: string; settledMicroCny: number; reservedMicroCny: number; status: string }[];
}

/** Only trusted host checks construct this error, using public diagnostics.
 * Never wrap raw provider exceptions, tool output or model text in HostFailure. */
export class HostFailure extends Error {
  readonly issues: HostIssue[];
  readonly passedChecks: HostPassedCheck[];
  constructor(issues: HostIssue[], passedChecks: HostPassedCheck[] = []) {
    super('Trusted host checks found unresolved failures.');
    this.issues = structuredClone(issues);
    this.passedChecks = structuredClone(passedChecks);
  }
}

export const FEEDBACK_PREFIX = 'repair-feedback-';
export function feedbackReference(task: TaskContract): ArtifactReference {
  const attempt = task.attempts.at(-1);
  if (!attempt) throw new Error('Failure feedback requires a source attempt.');
  // Portable location for host staging in author/reviewer snapshots. The durable
  // source bytes stay at <sessionRef>/failure.json, alongside the native sessions.
  return { artifactId: `${FEEDBACK_PREFIX}${task.taskId}`, version: attempt.attemptId, location: `repair-feedback/task-${encodeURIComponent(task.taskId)}-${encodeURIComponent(attempt.attemptId)}.json` };
}

export function failureRecord(issues: HostIssue[]): FailureRecord {
  return { classification: issues.every(issue => issue.classification === issues[0].classification) ? issues[0].classification : 'insufficient_evidence',
    summary: issues.map(issue => issue.summary).join('; '), reproduction: [...new Set(issues.flatMap(issue => issue.reproduction))],
    actual: issues.map(issue => issue.actual).join('; '), expected: issues.map(issue => issue.expected).join('; '),
    evidenceRefs: [...new Set(issues.flatMap(issue => issue.evidenceRefs))] };
}

export function validateHostIssues(task: TaskContract, issues: HostIssue[]): void {
  if (!Array.isArray(issues) || !issues.length) throw new Error('At least one unresolved host issue is required.');
  const keys = new Set<string>();
  for (const issue of issues) {
    if (!task.acceptanceIds.includes(issue.acceptanceId) || typeof issue.checkId !== 'string' || !issue.checkId.trim()) throw new Error('Host issue requires a fixed acceptance ID and check ID.');
    const key = JSON.stringify([issue.acceptanceId, issue.checkId]);
    if (keys.has(key)) throw new Error('Duplicate unresolved acceptance check.');
    keys.add(key);
    const { acceptanceId: _acceptance, checkId: _check, ...record } = issue;
    if (validateContext({ contextId: 'host-feedback', rules: [], interfaces: [], knownFailures: [record], tools: [] }).length) throw new Error('Invalid host failure record.');
  }
}

export function validatePassedChecks(task: TaskContract, issues: HostIssue[], passedChecks: HostPassedCheck[]): void {
  if (!Array.isArray(passedChecks)) throw new Error('Host passed checks must be an array.');
  const keys = new Set<string>();
  for (const check of passedChecks) {
    const key = JSON.stringify([check.acceptanceId, check.checkId]);
    const evidence = task.evidence.find(item => item.evidenceId === check.evidenceId);
    if (!task.acceptanceIds.includes(check.acceptanceId) || !check.checkId.trim() || keys.has(key)
      || issues.some(issue => issue.acceptanceId === check.acceptanceId && issue.checkId === check.checkId)
      || !evidence || evidence.outcome === 'observed' || evidence.kind !== 'test_report' || !evidence.acceptanceIds.includes(check.acceptanceId)
      || ![...task.inputs, ...task.artifacts].every(ref => evidence.artifactVersions.some(version => sameValue(ref, version)))) throw new Error('Passed host checks require current fixed-version evidence and distinct stable check IDs.');
    keys.add(key);
  }
}

/** No unknown exception text enters durable feedback. Public host diagnostics
 * are explicit; otherwise only stable stage/provider categories are recorded. */
export function buildRepairFeedback(task: TaskContract, error: unknown, stage: FailureStage, snapshot?: RunSnapshot): RepairFeedback {
  if (validateTask(task).length) throw new Error('Feedback requires a valid task snapshot.');
  const reference = feedbackReference(task), attempt = task.attempts.at(-1)!;
  const serviceCodes = ['timeout', 'provider_error', 'usage_unknown', 'accounting_error', 'model_mismatch'];
  const service = error instanceof PiSessionError && serviceCodes.includes(error.code);
  const actual = stage === 'author_handoff' ? 'Author handoff declares unresolved assigned work or uncertainty.'
    : stage === 'independent_review' ? 'No valid independent review proposal for the fixed inputs and host evidence.'
    : service ? 'Provider request failed or requires reconciliation.' : 'Host execution did not establish passing evidence.';
  const issues: HostIssue[] = error instanceof HostFailure ? structuredClone(error.issues) : task.acceptance.map(item => ({
    acceptanceId: item.acceptanceId, checkId: service ? error.code : stage,
    classification: service ? 'external_service' : 'insufficient_evidence', summary: actual,
    reproduction: [...item.steps], actual, expected: item.expected, evidenceRefs: task.evidence.filter(e => e.acceptanceIds.includes(item.acceptanceId)).map(e => e.source.location),
  }));
  validateHostIssues(task, issues);
  const passedChecks = error instanceof HostFailure ? structuredClone(error.passedChecks) : [];
  validatePassedChecks(task, issues, passedChecks);
  return { formatVersion: 1, reference, runId: task.runId, specVersion: task.specVersion,
    sourceTaskId: task.taskId, sourceAttemptId: attempt.attemptId, sessionRef: attempt.sessionRef,
    originalDeadlineAt: task.budget.originalDeadlineAt, acceptance: structuredClone(task.acceptance),
    artifactVersions: structuredClone([...task.inputs, ...task.artifacts]), issues, passedChecks,
    charges: (snapshot?.ledger.entries ?? []).filter(entry => entry.taskId === task.taskId).map(({ requestId, settledMicroCny, reservedMicroCny, status }) => ({ requestId, settledMicroCny, reservedMicroCny, status })),
  };
}
