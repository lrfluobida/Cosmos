import type { ArtifactContract, ArtifactReference, BudgetLedger, ContextPackage, EvidenceContract, ExecutionContracts, RequirementContract, RunManifest, TaskContract, ValidationIssue } from './types.ts';
import { artifactShape, checkShape, contextShape, evidenceShape, issue, ledgerShape, referenceShape, requirementShape, runShape, taskShape } from './structure.ts';
import { budgetCapacity, budgetSummary, DEFAULT_BUDGETS } from './budget.ts';

export function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, i) => sameValue(value, right[i]));
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
}
function unique(values: string[], path: string, issues: ValidationIssue[]): void {
  if (new Set(values).size !== values.length) issue(issues, path, 'duplicate', 'Identifiers must be unique.');
}
function refs(values: ArtifactReference[], path: string, issues: ValidationIssue[]): void { unique(values.map(item => item.artifactId), path, issues); }
function containsRef(values: ArtifactReference[], expected: ArtifactReference): boolean { return values.some(value => sameValue(value, expected)); }

export function validateContext(value: unknown): ValidationIssue[] {
  const issues = checkShape(value, contextShape); if (issues.length) return issues;
  refs((value as ContextPackage).interfaces, '$.interfaces', issues); return issues;
}
export function validateArtifact(value: unknown): ValidationIssue[] {
  const issues = checkShape(value, artifactShape); if (issues.length) return issues;
  const artifact = value as ArtifactContract;
  refs(artifact.dependencies, '$.dependencies', issues);
  if (artifact.dependencies.some(ref => ref.artifactId === artifact.artifactId)) issue(issues, '$.dependencies', 'self_dependency', 'An artifact cannot depend on itself.');
  return issues;
}
export function validateEvidence(value: unknown): ValidationIssue[] {
  const issues = checkShape(value, evidenceShape); if (issues.length) return issues;
  const evidence = value as EvidenceContract;
  unique(evidence.acceptanceIds, '$.acceptanceIds', issues); refs(evidence.artifactVersions, '$.artifactVersions', issues);
  if (evidence.outcome === 'passed' && (!evidence.acceptanceIds.length || !evidence.artifactVersions.length)) issue(issues, '$', 'unsubstantiated_pass', 'Passed evidence must identify acceptance items and fixed artifact versions.');
  return issues;
}
export function validateRequirement(value: unknown): ValidationIssue[] {
  const issues = checkShape(value, requirementShape); if (issues.length) return issues;
  const requirement = value as RequirementContract;
  unique(requirement.acceptance.map(item => item.acceptanceId), '$.acceptance', issues); refs(requirement.sources, '$.sources', issues); return issues;
}
export function validateTask(value: unknown): ValidationIssue[] {
  const issues = checkShape(value, taskShape); if (issues.length) return issues;
  const task = value as TaskContract;
  unique(task.acceptanceIds, '$.acceptanceIds', issues);
  unique(task.acceptance.map(item => item.acceptanceId), '$.acceptance', issues);
  unique(task.dependsOn.map(item => item.taskId), '$.dependsOn', issues);
  unique(task.attempts.map(item => item.attemptId), '$.attempts', issues);
  unique(task.evidence.map(item => item.evidenceId), '$.evidence', issues);
  unique(task.review.evidenceIds, '$.review.evidenceIds', issues);
  refs(task.inputs, '$.inputs', issues); refs(task.artifacts, '$.artifacts', issues); refs(task.review.inputVersions, '$.review.inputVersions', issues);
  issues.push(...validateContext(task.context).map(item => ({ ...item, path: `$.context${item.path.slice(1)}` })));
  if (!sameValue([...task.acceptanceIds].sort(), task.acceptance.map(item => item.acceptanceId).sort())) issue(issues, '$.acceptance', 'acceptance_mismatch', 'Acceptance steps must cover exactly the fixed acceptance IDs.');
  if (task.dependsOn.some(dep => dep.taskId === task.taskId)) issue(issues, '$.dependsOn', 'self_dependency', 'A task cannot depend on itself.');
  if (['ready', 'running', 'awaiting_review', 'passed'].includes(task.state) && task.dependsOn.some(dep => dep.state !== dep.requiredState)) issue(issues, '$.dependsOn', 'dependency_not_ready', 'Required dependency states must be satisfied.');
  if (['cancelled', 'waiting_user', 'failed'].includes(task.state) && !task.stateReason) issue(issues, '$.stateReason', 'reason_required', 'Stopping or waiting requires a reason.');
  if (['running', 'awaiting_review', 'needs_changes', 'passed'].includes(task.state) && !task.attempts.length) issue(issues, '$.attempts', 'attempt_required', 'Started work must retain its attempt and session record.');
  task.attempts.forEach((attempt, index) => {
    const p = `$.attempts[${index}]`;
    if ((attempt.outcome === 'running') !== (attempt.endedAt === null)) issue(issues, p, 'attempt_state', 'Only a running attempt has no end time.');
    if (attempt.endedAt && Date.parse(attempt.endedAt) < Date.parse(attempt.startedAt)) issue(issues, p, 'attempt_time', 'Attempt end precedes its start.');
    if ((attempt.outcome === 'failed') !== (attempt.failure !== null)) issue(issues, p, 'failure_required', 'A failed attempt requires a classified failure; other outcomes must have no failure.');
  });
  task.evidence.forEach((evidence, index) => {
    issues.push(...validateEvidence(evidence).map(item => ({ ...item, path: `$.evidence[${index}]${item.path.slice(1)}` })));
    if (evidence.taskId !== task.taskId || evidence.acceptanceIds.some(id => !task.acceptanceIds.includes(id))) issue(issues, `$.evidence[${index}]`, 'evidence_owner', 'Evidence must belong to this task and its acceptance items.');
  });
  const review = task.review;
  if (review.verdict !== 'pending') {
    if (!review.reviewerId || review.reviewerId === task.authorId || !review.contextId || review.contextId === task.context.contextId) issue(issues, '$.review', 'independent_review', 'Review requires a different actor and context.');
    const snapshots = [...task.inputs, ...task.artifacts];
    if (review.inputVersions.length !== snapshots.length || snapshots.some(ref => !containsRef(review.inputVersions, ref))) issue(issues, '$.review.inputVersions', 'review_snapshot', 'Review must read all fixed input and output versions.');
    if (!review.evidenceIds.length || review.evidenceIds.some(id => !task.evidence.some(e => e.evidenceId === id))) issue(issues, '$.review.evidenceIds', 'review_evidence', 'Review must reference recorded evidence.');
  }
  if (task.state === 'passed' && review.verdict !== 'approved') issue(issues, '$.review.verdict', 'review_required', 'Passed tasks require independent approval.');
  if (review.verdict === 'approved') {
    if (!task.artifacts.length) issue(issues, '$.artifacts', 'artifact_required', 'Approval requires versioned output artifacts.');
    for (const id of task.acceptanceIds) {
      if (!task.evidence.some(e => e.outcome === 'passed' && e.acceptanceIds.includes(id) && review.evidenceIds.includes(e.evidenceId) && task.artifacts.every(ref => containsRef(e.artifactVersions, ref)))) issue(issues, '$.evidence', 'acceptance_evidence', `No passing evidence for ${id} at the reviewed artifact versions.`);
    }
  }
  return issues;
}
export function validateTaskInputs(value: unknown, available: unknown): ValidationIssue[] {
  const issues = validateTask(value); if (issues.length) return issues;
  if (!Array.isArray(available)) return [{ path: '$.available', code: 'array', message: 'Expected available artifact references.' }];
  available.forEach((ref, i) => issues.push(...checkShape(ref, referenceShape).map(item => ({ ...item, path: `$.available[${i}]${item.path.slice(1)}` }))));
  if (issues.length) return issues;
  refs(available as ArtifactReference[], '$.available', issues);
  for (const ref of (value as TaskContract).inputs) if (!containsRef(available as ArtifactReference[], ref)) issue(issues, '$.inputs', 'input_version', `Missing fixed artifact ${ref.artifactId}@${ref.version} at ${ref.location}.`);
  return issues;
}
export function validateLedger(value: unknown): ValidationIssue[] {
  const issues = checkShape(value, ledgerShape); if (issues.length) return issues;
  const ledger = value as BudgetLedger;
  const cap = ledger.scope === 'validation' ? DEFAULT_BUDGETS.validationMicroCny : DEFAULT_BUDGETS.generationMicroCny;
  if (ledger.limitMicroCny <= 0 || ledger.limitMicroCny > cap) issue(issues, '$.limitMicroCny', 'hard_limit', `The ${ledger.scope} limit must be positive and at most ${cap} micro-CNY.`);
  unique(ledger.allocations.map(item => item.taskId), '$.allocations', issues); unique(ledger.entries.map(item => item.requestId), '$.entries', issues);
  const summary = { ...budgetSummary(ledger), ...budgetCapacity(ledger) };
  if (![summary.effectiveLimitMicroCny, summary.allocatedMicroCny, summary.committedMicroCny, ledger.allocations.reduce((sum, item) => sum + item.amountMicroCny, 0)].every(Number.isSafeInteger)) issue(issues, '$', 'money_overflow', 'Cumulative budget amounts must remain safe integers.');
  if (ledger.contractVersion === '2.0.0') {
    if (ledger.scope !== 'generation') issue(issues, '$.scope', 'continuation_scope', 'Continuation is formal generation only.');
    unique(ledger.authorizations!.map(item => item.decisionId), '$.authorizations', issues);
    unique(ledger.authorizations!.map(item => item.windowId), '$.authorizations', issues);
    unique(ledger.allocationClosures!.map(item => item.taskId), '$.allocationClosures', issues);
    for (const authorization of ledger.authorizations!) if (authorization.additionalMicroCny > DEFAULT_BUDGETS.generationMicroCny) issue(issues, '$.authorizations', 'hard_limit', 'Each additional authorization is bounded by the generation cap.');
    for (const closure of ledger.allocationClosures!) {
      const allocation = ledger.allocations.find(item => item.taskId === closure.taskId);
      const entries = ledger.entries.filter(item => item.taskId === closure.taskId);
      const spent = entries.reduce((sum, item) => sum + item.settledMicroCny, 0);
      if (!allocation || !ledger.authorizations!.some(item => item.decisionId === closure.decisionId) || entries.some(item => item.reservedMicroCny || item.unknown || !['settled', 'cancelled'].includes(item.status)) || closure.releasedMicroCny !== allocation.amountMicroCny - spent) issue(issues, '$.allocationClosures', 'invalid_closure', 'Close a reconciled grant exactly once, releasing only its unused amount.');
    }
  }
  if (summary.allocatedMicroCny > summary.effectiveLimitMicroCny) issue(issues, '$.allocations', 'overallocated', 'Task allocations cannot create additional budget.');
  ledger.entries.forEach((entry, index) => {
    const p = `$.entries[${index}]`;
    if (!ledger.allocations.some(item => item.taskId === entry.taskId)) issue(issues, p, 'allocation_missing', 'Request must use an existing task allocation.');
    if (entry.unknown !== (entry.status === 'unknown')) issue(issues, p, 'unknown_status', 'Unknown flag and request status must agree.');
    if (['reserved', 'unknown'].includes(entry.status) && entry.reservedMicroCny <= 0) issue(issues, p, 'reservation_required', 'In-flight and unknown requests must retain a positive reservation.');
    if (['settled', 'cancelled'].includes(entry.status) && (entry.reservedMicroCny !== 0 || !entry.evidence.length)) issue(issues, p, 'reconciliation_required', 'Closing a request requires reconciliation evidence and zero outstanding reservation.');
    if (['reserved', 'cancelled'].includes(entry.status) && entry.settledMicroCny !== 0) issue(issues, p, 'settlement_status', 'Reserved or cancelled requests cannot have settled costs.');
    refs(entry.evidence, `${p}.evidence`, issues);
  });
  for (const allocation of ledger.allocations) {
    const committed = ledger.entries.filter(entry => entry.taskId === allocation.taskId).reduce((sum, entry) => sum + entry.reservedMicroCny + entry.settledMicroCny, 0);
    if (committed > allocation.amountMicroCny) issue(issues, '$.entries', 'allocation_exceeded', `Requests exceed allocation for ${allocation.taskId}.`);
  }
  if (summary.committedMicroCny > summary.effectiveLimitMicroCny) issue(issues, '$.entries', 'budget_exceeded', 'Settled costs and outstanding reservations exceed the shared hard limit.');
  return issues;
}
export function validateRun(value: unknown): ValidationIssue[] {
  const issues = checkShape(value, runShape); if (issues.length) return issues;
  const run = value as RunManifest, duration = Date.parse(run.originalDeadlineAt) - Date.parse(run.originalStartedAt);
  if (duration <= 0 || duration > DEFAULT_BUDGETS.hardDurationMs) issue(issues, '$.originalDeadlineAt', 'duration', 'Original deadline must be after start and within 12 hours.');
  unique(run.taskIds, '$.taskIds', issues); unique(run.fees.unknownRequestIds, '$.fees.unknownRequestIds', issues); unique(run.humanDecisions.map(item => item.decisionId), '$.humanDecisions', issues);
  unique(run.artifacts.map(item => `${item.artifactId}@${item.version}`), '$.artifacts', issues);
  if (run.state === 'passed' && !run.artifacts.length) issue(issues, '$.artifacts', 'artifact_required', 'A passed run must preserve its output artifacts.');
  return issues;
}
export function validateExecution(value: ExecutionContracts): ValidationIssue[] {
  const issues = [...validateRequirement(value.requirement), ...validateTask(value.task), ...validateLedger(value.ledger), ...validateRun(value.run)];
  if (issues.length) return issues;
  const { requirement, task, ledger, run } = value;
  const match = (condition: boolean, path: string, message: string) => { if (!condition) issue(issues, path, 'contract_mismatch', message); };
  match(task.runId === run.runId && task.kind === run.kind && run.taskIds.includes(task.taskId), '$.task.runId', 'Task must belong to this run and kind.');
  match(task.specVersion === requirement.specVersion && run.specVersion === requirement.specVersion, '$.task.specVersion', 'All records must pin the same confirmed requirement version.');
  match(task.budget.ledgerId === ledger.ledgerId && run.ledgerId === ledger.ledgerId, '$.task.budget.ledgerId', 'All records must use the shared ledger.');
  match(task.budget.originalDeadlineAt === run.originalDeadlineAt, '$.task.budget.originalDeadlineAt', 'Task must retain the original run deadline.');
  match(ledger.allocations.some(item => item.taskId === task.taskId && item.amountMicroCny === task.budget.allocationMicroCny), '$.task.budget.allocationMicroCny', 'Task must use its ledger allocation.');
  match(run.fees.reservedMicroCny === ledger.entries.reduce((sum, e) => sum + e.reservedMicroCny, 0) && run.fees.settledMicroCny === ledger.entries.reduce((sum, e) => sum + e.settledMicroCny, 0), '$.run.fees', 'Run fees must reconcile with the shared ledger.');
  match(sameValue([...run.fees.unknownRequestIds].sort(), ledger.entries.filter(e => e.unknown).map(e => e.requestId).sort()), '$.run.fees.unknownRequestIds', 'Run must retain every unknown request.');
  for (const acceptance of task.acceptance) {
    const fixed = requirement.acceptance.find(item => item.acceptanceId === acceptance.acceptanceId);
    match(!!fixed && sameValue(fixed.steps, acceptance.steps) && fixed.expected === acceptance.expected, '$.task.acceptance', 'Task acceptance must match confirmed requirements.');
    if (fixed && task.review.verdict === 'approved') match(task.evidence.some(e =>
      task.review.evidenceIds.includes(e.evidenceId) && e.outcome === 'passed' &&
      e.acceptanceIds.includes(acceptance.acceptanceId) && fixed.evidenceKinds.includes(e.kind) &&
      task.artifacts.every(ref => containsRef(e.artifactVersions, ref))
    ), '$.task.evidence', 'The same evidence must satisfy the required kind and current artifact versions.');
  }
  return issues;
}
