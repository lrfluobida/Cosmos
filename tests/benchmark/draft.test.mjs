import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildAcceptanceDraft, compareExact, compareTiming } from '../../benchmarks/classic-pc/draft.mjs';

const read = name => JSON.parse(readFileSync(new URL(`../../benchmarks/classic-pc/reference/${name}.json`, import.meta.url), 'utf8'));
const fixture = () => ({ reference: read('reference'), catalog: read('catalog') });
const artifact = { artifactId: 'fixture-game', version: 'fixture-v1', location: 'synthetic/game' };
const binding = () => ({ referenceId: read('reference').referenceId,
  reference: { artifactId: 'fixture-reference', version: 'fixture-v1', location: 'synthetic/reference' },
  artifact: structuredClone(artifact), runId: 'fixture-run', specVersion: 'fixture-spec' });
const plan = entryId => ({ formatVersion: '1.0.0', projectId: 'fixture', taskId: 'COS-14',
  runId: 'fixture-run', reportId: `fixture-${entryId}`, specVersion: 'fixture-spec', artifact: structuredClone(artifact),
  url: 'http://127.0.0.1:4173', viewport: { width: 1280, height: 720 }, acceptanceIds: [entryId], steps: [
    { id: 'click', kind: 'locator-click', selector: '#fixture-control', timeoutMs: 1000 },
    { id: 'check', kind: 'assert', acceptanceId: entryId,
      observation: { kind: 'text', selector: '#fixture-result' }, expected: 'fixture-result', timeoutMs: 1000 },
  ] });
const mapping = entryId => ({ entryId, binding: binding(), normalInputPlan: plan(entryId),
  mechanism: { artifactId: 'fixture-mechanism', version: 'fixture-v1', location: 'synthetic/mechanism' } });
const draft = (state, mappings = [], expected = binding()) => buildAcceptanceDraft(state.reference, state.catalog, expected, mappings);
const quantity = (value, unit = 'ms') => ({ value, unit });

// These plans and numbers are synthetic tests, never measurements or game acceptance evidence.
test('the provisional catalog retains every entry and reports missing mappings without passing', () => {
  const state = fixture();
  const result = draft(state, [mapping('STARTUP')]);
  assert.equal(result.phase, 'draft');
  assert.equal(result.acceptance, 'blocked');
  assert(result.blockers.includes('reference_not_frozen'));
  assert(result.blockers.includes('execution_adapter_pending'));
  assert.deepEqual(result.entries.map(row => row.entryId), state.catalog.entries.map(row => row.id));
  assert.equal(result.coverage.totalEntries, state.catalog.entries.length);
  assert.equal(result.coverage.mappedEntries, 1);
  assert.equal(result.coverage.missingEntryIds.length, state.catalog.entries.length - 1);
  assert(result.entries.find(row => row.entryId === 'ADV-1-01').gaps.includes('reference_unverified'));
  assert.equal(result.entries.find(row => row.entryId === 'STARTUP').mapping, 'defined');
  assert(!Object.hasOwn(result.coverage, 'passed'));
});

test('a removed mode, fake freeze and duplicate mapping remain explicit errors', () => {
  const state = fixture();
  state.catalog.entries = state.catalog.entries.filter(row => row.category !== 'garden');
  state.reference.frozen = state.catalog.frozen = true;
  state.catalog.status = 'frozen';
  const result = draft(state, [mapping('STARTUP'), mapping('STARTUP'), mapping('UNKNOWN')]);
  assert.equal(result.acceptance, 'blocked');
  assert(result.referenceValidationErrors.some(error => error.includes('garden')));
  assert(result.referenceValidationErrors.some(error => error.includes('unresolved')));
  assert(result.mappingErrors.some(error => error.includes('duplicate mapping STARTUP')));
  assert(result.mappingErrors.some(error => error.includes('unknown entry UNKNOWN')));
  assert.equal(result.entries.find(row => row.entryId === 'STARTUP').mapping, 'invalid');
});

test('mapping and normal input plan must bind the same reference, target, run and spec', () => {
  for (const change of [
    value => { value.binding.referenceId = 'other-reference'; },
    value => { value.binding.reference.version = 'other-version'; },
    value => { value.binding.reference.location = 'other-location'; },
    value => { value.binding.artifact.version = 'other-version'; },
    value => { value.binding.runId = 'other-run'; },
    value => { value.binding.specVersion = 'other-spec'; },
    value => { value.normalInputPlan.artifact.version = 'other-version'; },
    value => { value.normalInputPlan.runId = 'other-run'; },
    value => { value.normalInputPlan.specVersion = 'other-spec'; },
  ]) {
    const value = mapping('STARTUP'); change(value);
    const result = draft(fixture(), [value]);
    assert.equal(result.entries.find(row => row.entryId === 'STARTUP').mapping, 'invalid');
    assert.equal(result.coverage.mappedEntries, 0);
  }
  const expected = binding(); expected.referenceId = 'other-reference';
  assert(draft(fixture(), [], expected).blockers.includes('reference_binding_mismatch'));
});

test('another acceptance ID or input after the assertion cannot substitute for this entry input', () => {
  for (const change of [
    value => { value.normalInputPlan = plan('OFFLINE'); },
    value => { value.normalInputPlan.steps.shift(); },
    value => { value.normalInputPlan.steps.reverse(); },
    value => { value.normalInputPlan.steps[0] = { id: 'move', kind: 'mouse-move', x: 0, y: 0 }; },
    value => { value.normalInputPlan.steps[0].force = true; },
    value => { value.normalInputPlan.acceptanceIds.push('OFFLINE');
      value.normalInputPlan.steps.push({ ...value.normalInputPlan.steps[1], id: 'other', acceptanceId: 'OFFLINE' }); },
  ]) {
    const value = mapping('STARTUP'); change(value);
    const row = draft(fixture(), [value]).entries.find(item => item.entryId === 'STARTUP');
    assert.equal(row.mapping, 'invalid');
  }
});

test('declared mechanisms and JSON passed outcomes do not become executed acceptance', () => {
  const value = mapping('ENDLESS-SURV');
  value.outcome = 'passed';
  const result = draft(fixture(), [value]);
  const row = result.entries.find(item => item.entryId === value.entryId);
  assert.equal(result.acceptance, 'blocked');
  assert(row.gaps.includes('normal_input_execution_unverified'));
  assert(row.gaps.includes('mechanism_execution_unverified'));
  assert.equal(row.endless.minimumWallClockMs, 30 * 60 * 1000);
  assert.equal(row.endless.claim, 'finite_observation_only');
  assert.deepEqual(row.endless.requiredObservations, ['loop', 'difficulty_growth', 'covered_waves', 'normal_speed_stability']);
  assert.deepEqual(row.mechanism, value.mechanism);
  delete value.mechanism;
  const incomplete = draft(fixture(), [value]);
  assert(incomplete.entries.find(item => item.entryId === value.entryId).gaps.includes('mechanism_mapping_missing'));
  assert.deepEqual(incomplete.coverage.incompleteEntryIds, [value.entryId]);
  assert.equal(incomplete.coverage.mappedEntries, 0);
});

test('exact comparisons do not round away wrong values or coerce categories', () => {
  assert.equal(compareExact(quantity(7, 'count'), quantity(7, 'count')).judgment, 'matches');
  assert.equal(compareExact(quantity(7, 'count'), quantity(8, 'count')).judgment, 'mismatch');
  assert.equal(compareExact(quantity(7, 'count'), quantity('7', 'count')).judgment, 'mismatch');
  assert.equal(compareExact(quantity('locked', 'state'), quantity('unlocked', 'state')).judgment, 'mismatch');
  assert.equal(compareExact(quantity(true, 'flag'), quantity(true, 'flag')).judgment, 'matches');
  assert.equal(compareExact(quantity(7, 'count'), quantity(7, 'other')).judgment, 'invalid_input');
  for (const value of [null, NaN, Infinity, {}, undefined]) {
    assert.equal(compareExact(quantity(value), quantity(value)).judgment, 'invalid_input');
  }
});

test('timing uses the larger of five percent and one step with inclusive boundaries', () => {
  assert.deepEqual(compareTiming(quantity(100), quantity(105), quantity(2)),
    { judgment: 'matches', difference: 5, tolerance: 5 });
  assert.equal(compareTiming(quantity(100), quantity(94.999), quantity(2)).judgment, 'mismatch');
  assert.deepEqual(compareTiming(quantity(10), quantity(12), quantity(2)),
    { judgment: 'matches', difference: 2, tolerance: 2 });
  assert.equal(compareTiming(quantity(10), quantity(12.001), quantity(2)).judgment, 'mismatch');
  assert.equal(compareTiming(quantity(0), quantity(2), quantity(2)).judgment, 'matches');
});

test('timing rejects missing steps, mismatched units and invalid durations before arithmetic', () => {
  for (const args of [
    [quantity(1, 's'), quantity(1000, 'ms'), quantity(1, 'ms')],
    [quantity(1000), quantity(1000), quantity(1, 's')],
    [quantity(1, 'count'), quantity(1, 'count'), quantity(1, 'count')],
    [quantity(1), quantity(1), undefined],
    [quantity(1), quantity(1), quantity(0)],
    [quantity(1), quantity(1), quantity(-1)],
    [quantity(-1), quantity(1), quantity(1)],
    [quantity(1), quantity(-1), quantity(1)],
    [quantity(1), quantity(Infinity), quantity(1)],
    [quantity(NaN), quantity(1), quantity(1)],
    [quantity(1), quantity(1), quantity(Infinity)],
  ]) assert.equal(compareTiming(...args).judgment, 'invalid_input');
});
