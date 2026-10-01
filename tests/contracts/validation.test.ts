import assert from 'node:assert/strict';
import test from 'node:test';
import { validateArtifact, validateContext, validateEvidence, validateLedger, validateRequirement, validateRun, validateTask, validateTaskInputs, validateExecution } from '../../src/contracts/index.ts';
import { artifact, context, evidence, ledger, passedTask, requirement, run, task } from './fixtures.ts';

function rejected(issues: unknown[]) { assert.ok(issues.length > 0, 'invalid contract must have validation issues'); }

test('accepts complete versioned contracts and an independently approved task', () => {
  assert.deepEqual(validateTask(task()), []);
  assert.deepEqual(validateTask(passedTask()), []);
  assert.deepEqual(validateContext(context()), []);
  assert.deepEqual(validateEvidence(evidence()), []);
  assert.deepEqual(validateRequirement(requirement()), []);
  assert.deepEqual(validateLedger(ledger()), []);
  assert.deepEqual(validateRun(run()), []);
  assert.deepEqual(validateArtifact({ contractVersion: '1.0.0', ...artifact(), taskId: 'COS-example', runId: 'run-1', type: 'game', schema: 'game/1', dependencies: [] }), []);
});

test('rejects missing input versions', () => {
  const value: any = task(); delete value.inputs[0].version; rejected(validateTask(value));
});

test('rejects missing or mismatched acceptance IDs', () => {
  const value = task(); value.acceptanceIds = []; rejected(validateTask(value));
  value.acceptanceIds = ['AC-other']; rejected(validateTask(value));
});

test('rejects unsupported kinds, states and contract versions', () => {
  for (const [key, bad] of [['kind', 'game'], ['state', 'done'], ['contractVersion', '2.0.0']]) {
    rejected(validateTask({ ...task(), [key]: bad }));
  }
});

test('rejects unknown fields including credentials and full history', () => {
  rejected(validateTask({ ...task(), credentials: 'secret' }));
  rejected(validateContext({ ...context(), fullHistory: ['unrelated conversation'] }));
});

test('rejects malformed nested documents without throwing', () => {
  for (const value of [null, [], 1, 'text', {}, { ...task(), budget: null }, { ...task(), evidence: [null] }]) {
    rejected(validateTask(value));
  }
});

test('rejects success without acceptance evidence or evidence source', () => {
  const value = passedTask(); value.evidence = []; rejected(validateTask(value));
  const broken: any = passedTask(); delete broken.evidence[0].source; rejected(validateTask(broken));
});

test('rejects evidence from another task or stale artifact version', () => {
  const value = passedTask(); value.evidence[0].taskId = 'another-task'; rejected(validateTask(value));
  const stale = passedTask(); stale.evidence[0].artifactVersions[0].version = 'old'; rejected(validateTask(stale));
});

test('rejects self-review, shared review context and stale review inputs', () => {
  const value = passedTask(); value.review.reviewerId = value.authorId; rejected(validateTask(value));
  const sameContext = passedTask(); sameContext.review.contextId = sameContext.context.contextId; rejected(validateTask(sameContext));
  const stale: any = passedTask(); stale.review.inputVersions[0].version = 'old'; rejected(validateTask(stale));
});

test('requires passed dependencies before work starts', () => {
  const value = task(); value.dependsOn[0].state = 'failed'; rejected(validateTask(value));
});

test('rejects cancelled tasks without a reason and persistent attempts without sessions', () => {
  const value = task(); value.state = 'cancelled'; rejected(validateTask(value));
  const broken: any = task(); delete broken.attempts[0].sessionRef; rejected(validateTask(broken));
});

test('rejects unsupported failure classes and invalid attempt times', () => {
  const value: any = task(); value.attempts[0].failure = { classification: 'anything', summary: 'error', reproduction: ['run'], actual: 'failed', expected: 'pass', evidenceRefs: [] }; rejected(validateTask(value));
  const badTime = task(); badTime.attempts[0].endedAt = '2026-09-30T01:00:00.000Z'; rejected(validateTask(badTime));
});

test('checks actual input identity, version and location against the fixed contract', () => {
  assert.deepEqual(validateTaskInputs(task(), task().inputs), []);
  rejected(validateTaskInputs(task(), []));
  rejected(validateTaskInputs(task(), [artifact('requirements', 'v2', 'requirements/v1.json')]));
  rejected(validateTaskInputs(task(), [artifact('requirements', 'v1', 'somewhere-else')]));
});

test('rejects fractional, negative, unsafe and excessive money values', () => {
  for (const bad of [0.1, -1, Number.MAX_SAFE_INTEGER + 1, 200_000_001]) rejected(validateLedger({ ...ledger(), limitMicroCny: bad }));
});

test('rejects oversubscribed task allocations and requests exceeding allocation', () => {
  const value = ledger(); value.allocations[0].amountMicroCny = 200_000_001; rejected(validateLedger(value));
  const request = ledger(); request.entries[0].reservedMicroCny = 50_000_001; rejected(validateLedger(request));
});

test('unknown requests must retain reservation and known pricing versions', () => {
  const value = ledger(); Object.assign(value.entries[0], { status: 'unknown', unknown: true }); assert.deepEqual(validateLedger(value), []);
  value.entries[0].reservedMicroCny = 0; rejected(validateLedger(value));
  const bad: any = ledger(); delete bad.entries[0].pricingVersion; rejected(validateLedger(bad));
});

test('settled or cancelled requests require reconciliation evidence', () => {
  for (const status of ['settled', 'cancelled']) {
    const value = ledger(); Object.assign(value.entries[0], { status, reservedMicroCny: 0, settledMicroCny: status === 'settled' ? 900_000 : 0 });
    rejected(validateLedger(value));
    value.entries[0].evidence = [artifact('receipt')]; assert.deepEqual(validateLedger(value), []);
  }
});

test('rejects duplicate request IDs, evidence IDs and acceptance IDs', () => {
  const budget = ledger(); budget.entries.push(structuredClone(budget.entries[0])); rejected(validateLedger(budget));
  const value = task(); value.evidence.push(evidence()); rejected(validateTask(value));
  const spec = requirement(); spec.acceptance.push(structuredClone(spec.acceptance[0])); rejected(validateRequirement(spec));
});

test('run timestamps must be UTC and preserve a positive duration of at most 12 hours', () => {
  for (const deadline of ['invalid', '2026-10-01T13:00:00.000Z', '2026-10-01T00:00:00.000Z', '2026-10-01T12:00:00+00:00']) {
    rejected(validateRun({ ...run(), originalDeadlineAt: deadline }));
  }
});

test('checks shared run, ledger, requirements and task references together', () => {
  const value = { requirement: requirement(), task: task(), ledger: ledger(), run: run() };
  assert.deepEqual(validateExecution(value), []);
  for (const changed of [
    { ...value, task: { ...task(), runId: 'renamed-run' } },
    { ...value, task: { ...task(), budget: { ...task().budget, ledgerId: 'new-ledger' } } },
    { ...value, task: { ...task(), specVersion: 'other-spec' } },
    { ...value, task: { ...task(), budget: { ...task().budget, originalDeadlineAt: '2026-10-01T11:00:00.000Z' } } },
    { ...value, run: { ...run(), fees: { ...run().fees, reservedMicroCny: 0 } } },
    { ...value, requirement: { ...requirement(), acceptance: [{ ...requirement().acceptance[0], expected: 'different' }] } },
  ]) rejected(validateExecution(changed));
});

test('approved evidence must satisfy kind and current versions in the same record', () => {
  const value = { requirement: requirement(), task: passedTask(), ledger: ledger(), run: run() };
  assert.deepEqual(validateExecution(value), []);
  value.task.evidence[0].kind = 'log';
  const stale = structuredClone(value.task.evidence[0]);
  stale.evidenceId = 'old-test-report'; stale.kind = 'test_report'; stale.artifactVersions[0].version = 'old';
  value.task.evidence.push(stale); value.task.review.evidenceIds.push(stale.evidenceId);
  assert.deepEqual(validateTask(value.task), []);
  assert.ok(validateExecution(value).some(issue => issue.path === '$.task.evidence'));
});
