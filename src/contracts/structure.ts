import type { ValidationIssue } from './types.ts';

export const STATES = ['not_started', 'ready', 'running', 'awaiting_review', 'needs_changes', 'passed', 'failed', 'waiting_user', 'cancelled'] as const;
const KINDS = ['platform_development', 'runtime_generation', 'evaluation'];
const EVIDENCE_KINDS = ['test_report', 'screenshot', 'video', 'log', 'billing_receipt', 'user_decision'];
type Check = (value: unknown, path: string, issues: ValidationIssue[]) => void;
export const issue = (issues: ValidationIssue[], path: string, code: string, message: string): void => { issues.push({ path, code, message }); };

// These helpers check explicit fields; they do not interpret JSON Schema.
const text: Check = (v, p, e) => { if (typeof v !== 'string' || !v.trim()) issue(e, p, 'string', 'Expected a non-empty string.'); };
const enumeration = (values: readonly unknown[]): Check => (v, p, e) => { if (!values.includes(v)) issue(e, p, 'enum', `Expected one of: ${values.join(', ')}.`); };
const nullable = (check: Check): Check => (v, p, e) => { if (v !== null) check(v, p, e); };
const money: Check = (v, p, e) => { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) issue(e, p, 'money', 'Expected non-negative integer micro-CNY within the safe integer range.'); };
const boolean: Check = (v, p, e) => { if (typeof v !== 'boolean') issue(e, p, 'boolean', 'Expected a boolean.'); };
const timestamp: Check = (v, p, e) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v) issue(e, p, 'timestamp', 'Expected a real UTC timestamp in YYYY-MM-DDTHH:mm:ss.sssZ form.');
};
const array = (check: Check, minimum = 0): Check => (v, p, e) => {
  if (!Array.isArray(v)) { issue(e, p, 'array', 'Expected an array.'); return; }
  if (v.length < minimum) issue(e, p, 'required_items', `Expected at least ${minimum} item(s).`);
  v.forEach((item, index) => check(item, `${p}[${index}]`, e));
};
const object = (fields: Record<string, Check>): Check => (v, p, e) => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) { issue(e, p, 'object', 'Expected an object.'); return; }
  const value = v as Record<string, unknown>;
  for (const key of Object.keys(value)) if (!Object.hasOwn(fields, key)) issue(e, `${p}.${key}`, 'unknown_field', 'Field is not allowed by this contract.');
  for (const [key, check] of Object.entries(fields)) check(value[key], `${p}.${key}`, e);
};
const strings = array(text), nonEmptyStrings = array(text, 1), version = enumeration(['1.0.0']);
const state = enumeration(STATES), kind = enumeration(KINDS);
const referenceFields = { artifactId: text, version: text, location: text };
export const referenceShape = object(referenceFields);
const references = array(referenceShape);
const failure = object({ classification: enumeration(['code_defect', 'external_service', 'requirement_conflict', 'insufficient_evidence']), summary: text, reproduction: nonEmptyStrings, actual: text, expected: text, evidenceRefs: strings });
export const contextShape = object({ contextId: text, rules: strings, interfaces: references, knownFailures: array(failure), tools: strings });
export const artifactShape = object({ contractVersion: version, ...referenceFields, taskId: text, runId: text, type: text, schema: text, dependencies: references });
export const evidenceShape = object({ contractVersion: version, evidenceId: text, taskId: text, acceptanceIds: strings, kind: enumeration(EVIDENCE_KINDS), source: referenceShape, artifactVersions: references, outcome: enumeration(['passed', 'failed', 'observed']), recordedAt: timestamp, summary: text });
export const requirementShape = object({
  contractVersion: version, specVersion: text, confirmedBy: text, confirmedAt: timestamp, sources: array(referenceShape, 1),
  acceptance: array(object({ acceptanceId: text, description: text, steps: nonEmptyStrings, expected: text, evidenceKinds: array(enumeration(EVIDENCE_KINDS), 1) }), 1),
});
export const taskShape = object({
  contractVersion: version, taskId: text, kind, runId: text, specVersion: text, authorId: text, acceptanceIds: nonEmptyStrings, objective: text,
  dependsOn: array(object({ taskId: text, requiredState: enumeration(['passed']), state })), inputs: references, context: contextShape,
  ownership: object({ writePaths: strings, readOnlyPaths: strings }), outputs: array(object({ type: text, schema: text, destination: text }), 1),
  acceptance: array(object({ acceptanceId: text, steps: nonEmptyStrings, expected: text, evidenceDestinations: nonEmptyStrings }), 1),
  budget: object({ ledgerId: text, allocationMicroCny: money, originalDeadlineAt: timestamp }), state, stateReason: nullable(text),
  attempts: array(object({ attemptId: text, sessionRef: text, startedAt: timestamp, endedAt: nullable(timestamp), outcome: enumeration(['running', 'passed', 'failed', 'cancelled']), failure: nullable(failure) })),
  artifacts: references, evidence: array(evidenceShape),
  handoff: object({ completed: strings, remaining: strings, uncertainty: strings, resumeFrom: nullable(text) }),
  review: object({ reviewerId: nullable(text), contextId: nullable(text), inputVersions: references, verdict: enumeration(['pending', 'approved', 'changes_requested']), evidenceIds: strings }),
});
const ledgerFields = {
  ledgerId: text, scope: enumeration(['validation', 'generation']), limitMicroCny: money, warningThresholdPercent: enumeration([80]),
  allocations: array(object({ taskId: text, amountMicroCny: money })),
  entries: array(object({ requestId: text, taskId: text, provider: text, pricingVersion: text, reservedMicroCny: money, settledMicroCny: money, unknown: boolean, status: enumeration(['reserved', 'settled', 'unknown', 'cancelled']), evidence: references })),
};
const originalLedgerShape = object({ contractVersion: version, ...ledgerFields });
const continuationLedgerShape = object({
  contractVersion: enumeration(['2.0.0']), ...ledgerFields,
  authorizations: array(object({ decisionId: text, windowId: text, additionalMicroCny: money }), 1),
  allocationClosures: array(object({ taskId: text, decisionId: text, releasedMicroCny: money })),
});
const validationClosureLedgerShape = object({
  contractVersion: enumeration(['3.0.0']), ...ledgerFields,
  allocationClosures: array(object({ taskId: text, decisionId: text, releasedMicroCny: money })),
});
export const ledgerShape: Check = (value, path, issues) => {
  const version = (value as { contractVersion?: unknown })?.contractVersion;
  (version === '3.0.0' ? validationClosureLedgerShape : version === '2.0.0' ? continuationLedgerShape : originalLedgerShape)(value, path, issues);
};
export const runShape = object({
  contractVersion: version, runId: text, kind, specVersion: text, ledgerId: text, originalStartedAt: timestamp, originalDeadlineAt: timestamp, state, taskIds: nonEmptyStrings,
  fees: object({ reservedMicroCny: money, settledMicroCny: money, unknownRequestIds: strings }), artifacts: references,
  humanDecisions: array(object({ decisionId: text, actorId: text, decidedAt: timestamp, reason: text, evidence: array(referenceShape, 1) })),
});
export function checkShape(value: unknown, check: Check): ValidationIssue[] {
  const issues: ValidationIssue[] = []; check(value, '$', issues); return issues;
}
