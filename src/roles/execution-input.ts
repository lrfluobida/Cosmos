import { validateExecution, validateLedger, validateRequirement, validateRun, validateTask } from '../contracts/index.ts';
import type { ArtifactReference, BudgetLedger, RequirementContract, RunManifest, TaskContract, ValidationIssue } from '../contracts/index.ts';
import { checkShape, referenceShape } from '../contracts/structure.ts';
import { sameValue } from '../contracts/validation.ts';
import { freeze } from './requirements.ts';

export interface ValidationRequirement {
  formatVersion: 'validation-requirement-1';
  specVersion: string; sources: ArtifactReference[]; acceptance: RequirementContract['acceptance'];
  validation: {
    runId: string; ledgerId: string; caseId: string; windowId: string;
    reviewedPlatformSha: string; frozenCaseInputHash: string;
    decision: { kind: 'operator_validation'; decisionId: string; actorId: string; decidedAt: string; source: ArtifactReference; sourceRefs: ArtifactReference[] };
  };
}
export type ExecutionRequirement = RequirementContract | ValidationRequirement;
export type ExecutionInputProfile = 'human' | 'operator_validation';

/** Discriminator only. Callers must still validate shape, fixed scope and real controller authority. */
export function isValidationRequirement(value: ExecutionRequirement): value is ValidationRequirement {
  return 'formatVersion' in value && value.formatVersion === 'validation-requirement-1';
}

/** Data validation is not approval, frozen-scope authentication, or paid admission. */
export function validateExecutionRequirement(value: unknown, profile: ExecutionInputProfile): ValidationIssue[] {
  if (profile === 'human') return validateRequirement(value);
  const issues: ValidationIssue[] = [];
  const bad = (path: string, message: string) => { issues.push({ path, code: 'validation_input', message }); };
  if (profile !== 'operator_validation') { bad('$', 'Invalid execution input profile.'); return issues; }
  const object = (value: unknown, keys: string[], path: string): Record<string, unknown> | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { bad(path, 'Expected an explicit validation object.'); return null; }
    for (const key of Object.keys(value)) if (!keys.includes(key)) bad(`${path}.${key}`, 'Field is not allowed in validation input.');
    return value as Record<string, unknown>;
  };
  const text = (value: unknown, path: string) => { if (typeof value !== 'string' || !value.trim()) bad(path, 'Expected non-empty text.'); };
  const unique = (values: unknown[], path: string) => { if (new Set(values).size !== values.length) bad(path, 'Duplicate identifiers are not allowed.'); };
  const reference = (value: unknown, path: string) => { issues.push(...checkShape(value, referenceShape).map(issue => ({ ...issue, path: `${path}${issue.path.slice(1)}` }))); };
  const references = (value: unknown, path: string) => {
    if (!Array.isArray(value) || !value.length) { bad(path, 'At least one fixed reference is required.'); return; }
    value.forEach((ref, i) => reference(ref, `${path}[${i}]`)); unique(value.map(ref => ref?.artifactId), path);
  };
  const data = object(value, ['formatVersion', 'specVersion', 'sources', 'acceptance', 'validation'], '$');
  if (!data) return issues;
  if (data.formatVersion !== 'validation-requirement-1') bad('$.formatVersion', 'Expected the explicit validation requirement version.');
  text(data.specVersion, '$.specVersion'); references(data.sources, '$.sources');
  if (!Array.isArray(data.acceptance) || !data.acceptance.length) bad('$.acceptance', 'Complete acceptance items are required.');
  else {
    unique(data.acceptance.map(item => item?.acceptanceId), '$.acceptance');
    data.acceptance.forEach((value, index) => {
      const path = `$.acceptance[${index}]`, item = object(value, ['acceptanceId', 'description', 'steps', 'expected', 'evidenceKinds'], path);
      if (!item) return;
      for (const key of ['acceptanceId', 'description', 'expected']) text(item[key], `${path}.${key}`);
      if (!Array.isArray(item.steps) || !item.steps.length) bad(`${path}.steps`, 'Acceptance steps are required.');
      else item.steps.forEach((step, i) => text(step, `${path}.steps[${i}]`));
      if (!Array.isArray(item.evidenceKinds) || !item.evidenceKinds.length || item.evidenceKinds.some(kind => !['test_report', 'screenshot', 'video', 'log', 'billing_receipt', 'user_decision'].includes(kind))) bad(`${path}.evidenceKinds`, 'Declared evidence kinds are required.');
    });
  }
  const binding = object(data.validation, ['runId', 'ledgerId', 'caseId', 'windowId', 'reviewedPlatformSha', 'frozenCaseInputHash', 'decision'], '$.validation');
  if (!binding) return issues;
  for (const key of ['runId', 'ledgerId', 'caseId', 'windowId']) text(binding[key], `$.validation.${key}`);
  for (const [key, length] of [['reviewedPlatformSha', 40], ['frozenCaseInputHash', 64]] as const) {
    if (typeof binding[key] !== 'string' || !new RegExp(`^[a-f0-9]{${length}}$`).test(binding[key])) bad(`$.validation.${key}`, 'Expected an exact content identity.');
  }
  const decision = object(binding.decision, ['kind', 'decisionId', 'actorId', 'decidedAt', 'source', 'sourceRefs'], '$.validation.decision');
  if (!decision) return issues;
  if (decision.kind !== 'operator_validation') bad('$.validation.decision.kind', 'Validation requires an explicit operator decision source.');
  for (const key of ['decisionId', 'actorId']) text(decision[key], `$.validation.decision.${key}`);
  const at = decision.decidedAt;
  if (typeof at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at) || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) bad('$.validation.decision.decidedAt', 'Expected a real UTC decision timestamp.');
  reference(decision.source, '$.validation.decision.source'); references(decision.sourceRefs, '$.validation.decision.sourceRefs');
  return issues;
}

/** Preserve supplied operator data; do not manufacture a human confirmation or query a controller. */
export function createValidationRequirement(input: unknown): ValidationRequirement {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.hasOwn(input, 'formatVersion')) throw new Error('Invalid validation requirement input.');
  const result = { ...structuredClone(input), formatVersion: 'validation-requirement-1' };
  const issues = validateExecutionRequirement(result, 'operator_validation');
  if (issues.length) throw new Error(`Invalid validation requirement: ${issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')}`);
  return freeze(result as ValidationRequirement);
}

/** Keep the existing task/ledger/run checks without constructing a fictitious human requirement. */
export function validateExecutionInput(value: { requirement: ExecutionRequirement; task: TaskContract; ledger: BudgetLedger; run: RunManifest }): ValidationIssue[] {
  const { requirement, task, ledger, run } = value;
  if (!isValidationRequirement(requirement)) return validateExecution({ ...value, requirement });
  const issues = [...validateExecutionRequirement(requirement, 'operator_validation'), ...validateTask(task), ...validateLedger(ledger), ...validateRun(run)];
  if (issues.length) return issues;
  const match = (condition: boolean, path: string) => { if (!condition) issues.push({ path, code: 'validation_contract', message: 'Validation execution contract differs from its fixed input or shared run.' }); };
  match(run.kind === 'evaluation' && task.kind === run.kind && ledger.scope === 'validation' && task.runId === run.runId && requirement.validation.runId === run.runId && run.taskIds.includes(task.taskId), '$.task.runId');
  match(task.specVersion === requirement.specVersion && run.specVersion === requirement.specVersion, '$.task.specVersion');
  match(task.budget.ledgerId === ledger.ledgerId && run.ledgerId === ledger.ledgerId && requirement.validation.ledgerId === ledger.ledgerId, '$.task.budget.ledgerId');
  match(task.budget.originalDeadlineAt === run.originalDeadlineAt, '$.task.budget.originalDeadlineAt');
  match(ledger.allocations.some(item => item.taskId === task.taskId && item.amountMicroCny === task.budget.allocationMicroCny), '$.task.budget.allocationMicroCny');
  match(run.fees.reservedMicroCny === ledger.entries.reduce((sum, item) => sum + item.reservedMicroCny, 0) && run.fees.settledMicroCny === ledger.entries.reduce((sum, item) => sum + item.settledMicroCny, 0)
    && sameValue([...run.fees.unknownRequestIds].sort(), ledger.entries.filter(item => item.unknown).map(item => item.requestId).sort()), '$.run.fees');
  for (const item of task.acceptance) {
    const fixed = requirement.acceptance.find(acceptance => acceptance.acceptanceId === item.acceptanceId);
    match(!!fixed && sameValue(fixed.steps, item.steps) && fixed.expected === item.expected, '$.task.acceptance');
    if (fixed && task.review.verdict === 'approved') match(task.evidence.some(evidence => task.review.evidenceIds.includes(evidence.evidenceId) && evidence.outcome === 'passed'
      && evidence.acceptanceIds.includes(item.acceptanceId) && fixed.evidenceKinds.includes(evidence.kind) && task.artifacts.every(ref => evidence.artifactVersions.some(version => sameValue(ref, version)))), '$.task.evidence');
  }
  return issues;
}
