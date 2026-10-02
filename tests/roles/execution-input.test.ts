import assert from 'node:assert/strict';
import test from 'node:test';
import { requirement, artifact } from '../contracts/fixtures.ts';
import { validateRequirement } from '../../src/contracts/index.ts';
import * as input from '../../src/roles/execution-input.ts';

/** Data-only fixtures: generatedByCosmos:false; no ledger, real decision, file or provider. */
function fixture() {
  const human = requirement();
  return { specVersion: human.specVersion, sources: human.sources, acceptance: human.acceptance,
    validation: { runId: 'offline-run', ledgerId: 'offline-ledger', caseId: 'offline-case', windowId: 'offline-window',
      reviewedPlatformSha: 'a'.repeat(40), frozenCaseInputHash: 'b'.repeat(64),
      decision: { kind: 'operator_validation', decisionId: 'offline-decision', actorId: 'offline-operator', decidedAt: '2026-10-02T00:00:00.000Z',
        source: artifact('operator-decision', 'v1', 'offline/operator.json'), sourceRefs: [artifact('standing-authorization', 'v1', 'offline/source.json')] } } };
}
const create = (value = fixture()) => {
  assert.equal(typeof input.createValidationRequirement, 'function', 'An explicit validation execution input adapter is required.');
  return input.createValidationRequirement(value);
};

test('validation execution data preserves full acceptance without manufacturing human confirmation', () => {
  const source = fixture(), value = create(source);
  assert.equal(value.formatVersion, 'validation-requirement-1'); assert.deepEqual(value.acceptance, source.acceptance); assert.deepEqual(value.validation.decision, source.validation.decision);
  assert.deepEqual(input.validateExecutionRequirement(value, 'operator_validation'), []);
  for (const key of ['confirmed', 'confirmedBy', 'confirmedAt', 'humanDecisions', 'budget', 'startedAt', 'deadlineAt']) assert.equal(Object.hasOwn(value, key), false);
  assert.ok(validateRequirement(value).length, 'The legacy human schema must still reject validation data');
});

test('profiles explicitly reject crossing between existing human and validation inputs', () => {
  const value = create(), human = requirement();
  assert.deepEqual(input.validateExecutionRequirement(human, 'human'), validateRequirement(human));
  assert.ok(input.validateExecutionRequirement(value, 'human').length);
  assert.ok(input.validateExecutionRequirement(human, 'operator_validation').length);
  assert.ok(input.validateExecutionRequirement(value, 'unknown' as never).length);
});

test('validation data is a detached deep frozen copy', () => {
  const source = fixture(), value = create(source); source.acceptance[0].expected = 'changed'; source.validation.decision.sourceRefs[0].location = 'changed';
  assert.equal(value.acceptance[0].expected, '退出码为 0'); assert.equal(value.validation.decision.sourceRefs[0].location, 'offline/source.json');
  assert.ok(Object.isFrozen(value)); assert.ok(Object.isFrozen(value.acceptance[0].steps)); assert.ok(Object.isFrozen(value.validation.decision.source));
});

for (const field of ['confirmed', 'confirmedBy', 'confirmedAt', 'humanDecisions']) test(`validation rejects a fabricated ${field} field`, () => {
  create();
  const value: any = { ...fixture(), [field]: field === 'confirmed' ? true : 'invented' };
  assert.throws(() => create(value), /invalid|field|validation/i);
});

test('validation rejects missing or malformed operator source and binding data', () => {
  create();
  for (const mutate of [
    (value: any) => { value.validation.caseId = ''; }, (value: any) => { delete value.validation.windowId; },
    (value: any) => { value.validation.reviewedPlatformSha = 'HEAD'; }, (value: any) => { value.validation.frozenCaseInputHash = 'current'; },
    (value: any) => { value.validation.decision.kind = 'user'; }, (value: any) => { value.validation.decision.sourceRefs = []; },
    (value: any) => { value.validation.decision.decidedAt = 'yesterday'; }, (value: any) => { value.validation.decision.source.location = ''; },
    (value: any) => { value.validation.decision.confirmed = true; }, (value: any) => { value.validation.deadlineAt = 'later'; },
  ]) { const value = fixture(); mutate(value); assert.throws(() => create(value), /invalid|validation/i); }
});

test('validation checks complete acceptance shape and uniqueness without replacing it by IDs alone', () => {
  create();
  for (const mutate of [
    (value: any) => { value.acceptance = []; }, (value: any) => { value.acceptance.push(structuredClone(value.acceptance[0])); },
    (value: any) => { value.acceptance[0].steps = []; }, (value: any) => { value.acceptance[0].expected = ''; },
    (value: any) => { value.acceptance[0].evidenceKinds = ['invented']; }, (value: any) => { value.acceptance[0].passed = true; },
    (value: any) => { value.sources.push(structuredClone(value.sources[0])); },
  ]) { const value = fixture(); mutate(value); assert.throws(() => create(value), /invalid|validation/i); }
  const validShape = fixture(); validShape.acceptance[0].expected = '不同的合法形状';
  assert.deepEqual(input.validateExecutionRequirement(create(validShape), 'operator_validation'), [], 'Shape validation does not authenticate the frozen case scope or grant authority');
});
