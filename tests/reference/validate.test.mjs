import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validate } from '../../benchmarks/classic-pc/reference/validate.mjs';

const dir = new URL('../../benchmarks/classic-pc/reference/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
const fixture = () => ({ reference: read('reference.json'), catalog: read('catalog.json') });

test('provisional inventory is valid without claiming frozen', () => {
  const { reference, catalog } = fixture();
  assert.deepEqual(validate(reference, catalog), []);
  assert.equal(catalog.frozen, false);
});

test('cannot freeze the actual unresolved inventory by flipping flags', () => {
  const { reference, catalog } = fixture();
  reference.frozen = catalog.frozen = true;
  catalog.status = 'frozen';
  const errors = validate(reference, catalog);
  assert(errors.some(x => x.includes('unresolved')));
  assert(errors.some(x => x.includes('runtime')));
});

test('removing a required mode and duplicating an ID are rejected', () => {
  const { reference, catalog } = fixture();
  catalog.entries = catalog.entries.filter(x => x.category !== 'garden');
  catalog.entries.push(structuredClone(catalog.entries[0]));
  const errors = validate(reference, catalog);
  assert(errors.some(x => x.includes('garden')));
  assert(errors.some(x => x.includes('duplicate')));
});

test('a missing adventure slot cannot be hidden by changing the count', () => {
  const { reference, catalog } = fixture();
  catalog.entries = catalog.entries.filter(x => x.id !== 'ADV-5-10');
  catalog.candidateCounts.adventure = 49;
  assert(validate(reference, catalog).some(x => x.includes('ADV-5-10')));
});

test('source references must resolve to an actual source anchor', () => {
  const { reference, catalog } = fixture();
  catalog.entries[0].sourceRefs[0].anchor = 'made-up-anchor';
  assert(validate(reference, catalog).some(x => x.includes('source anchor')));
});

test('edition claims and metadata cannot stand in for gameplay evidence', () => {
  const { reference, catalog } = fixture();
  const row = catalog.entries[0];
  row.status = 'verified_for_reference';
  row.evidenceRefs = ['fake'];
  catalog.evidence.push({ id: 'fake', referenceId: 'EA-MAC', kind: 'metadata', path: 'reference.json' });
  const errors = validate(reference, catalog);
  assert(errors.some(x => x.includes('referenceId')));
  assert(errors.some(x => x.includes('evidence kind')));
});

test('a frozen claim must be rejected even if closure is falsely marked complete', () => {
  const { reference, catalog } = fixture();
  reference.frozen = catalog.frozen = true;
  catalog.status = 'frozen';
  catalog.closure.complete = true;
  catalog.closure.unresolved = [];
  reference.blockers = [];
  assert(validate(reference, catalog).some(x => x.includes('unresolved entry')));
});

test('unknown numeric values cannot be marked verified', () => {
  const { reference, catalog } = fixture();
  catalog.measurements.push({ id: 'M-TEST', entryId: 'VALUE-PLANTS', status: 'verified_for_reference', value: null, evidenceRefs: [] });
  assert(validate(reference, catalog).some(x => x.includes('measurement')));
});

test('reference gameplay cannot be relabeled as an acceptance policy', () => {
  const { reference, catalog } = fixture();
  catalog.entries[0].kind = 'acceptance_policy';
  catalog.entries[0].status = 'requirement_defined';
  assert(validate(reference, catalog).some(x => x.includes('invalid acceptance policy')));
});

// Synthetic evidence exercises linkage only; it is never written into the reference catalog.
function addEvidence({ reference, catalog }, entryIds) {
  const records = ['normal_input', 'deterministic_rule'].map(kind => ({
    id: `fixture-${kind}`, referenceId: reference.referenceId, kind, entryIds,
    status: 'pass', path: 'test-fixture-only', observedAt: 'test-fixture-only',
    preconditions: 'synthetic fixture', steps: 'synthetic fixture',
    expected: 'synthetic fixture', observed: 'synthetic fixture',
  }));
  catalog.evidence.push(...records);
  return records.map(x => x.id);
}

function measurement(entityId, evidenceRefs) {
  return { id: `M-${entityId}`, entryId: 'VALUE-PLANTS', entityId,
    status: 'verified_for_reference', value: 7, unit: 'fixture-unit',
    metric: 'fixture-metric', method: 'fixture-method', tolerance: 'exact', evidenceRefs };
}

test('verified measurements require an existing entity in the value group', () => {
  for (const entityId of [undefined, 'DOES-NOT-EXIST', 'AUDIO', 'ZOMBIE-01']) {
    const state = fixture();
    const refs = addEvidence(state, ['VALUE-PLANTS', 'PLANT-01']);
    state.catalog.measurements.push(measurement(entityId, refs));
    assert(validate(state.reference, state.catalog).some(x => x.includes('measurement entityId')), `${entityId} was accepted`);
  }
});

test('measurement evidence must cover both the value group and the measured entity', () => {
  for (const covered of [['AUDIO'], ['VALUE-PLANTS'], ['PLANT-01'], ['VALUE-PLANTS', 'PLANT-02']]) {
    const state = fixture();
    const refs = addEvidence(state, covered);
    state.catalog.measurements.push(measurement('PLANT-01', refs));
    assert(validate(state.reference, state.catalog).some(x => x.includes('measurement evidence coverage')), `${covered} was accepted`);
  }
});

test('each evidence kind must cover a measurement, even if the other kind covers it', () => {
  for (const kind of ['normal_input', 'deterministic_rule']) {
    const state = fixture();
    const refs = addEvidence(state, ['VALUE-PLANTS', 'PLANT-01']);
    state.catalog.evidence.find(x => x.kind === kind).entryIds = ['AUDIO'];
    state.catalog.measurements.push(measurement('PLANT-01', refs));
    assert(validate(state.reference, state.catalog).some(x => x.includes(`measurement evidence coverage ${kind}`)));
  }
});

test('interaction evidence must cover the interaction entry and both participants', () => {
  for (const covered of [['AUDIO'], ['INTERACTIONS', 'PLANT-01'], ['PLANT-01', 'ZOMBIE-01'], ['INTERACTIONS', 'PLANT-02', 'ZOMBIE-01']]) {
    const state = fixture();
    const refs = addEvidence(state, covered);
    state.catalog.interactions.push({ plantId: 'PLANT-01', zombieId: 'ZOMBIE-01', rule: 'fixture-only', evidenceRefs: refs });
    assert(validate(state.reference, state.catalog).some(x => x.includes('interaction evidence coverage')), `${covered} was accepted`);
  }
});

test('each evidence kind must cover an interaction', () => {
  for (const kind of ['normal_input', 'deterministic_rule']) {
    const state = fixture();
    const refs = addEvidence(state, ['INTERACTIONS', 'PLANT-01', 'ZOMBIE-01']);
    state.catalog.evidence.find(x => x.kind === kind).entryIds = ['AUDIO'];
    state.catalog.interactions.push({ plantId: 'PLANT-01', zombieId: 'ZOMBIE-01', rule: 'fixture-only', evidenceRefs: refs });
    assert(validate(state.reference, state.catalog).some(x => x.includes(`interaction evidence coverage ${kind}`)));
  }
});

test('shared evidence can cover multiple measured entities and interaction pairs', () => {
  const state = fixture();
  const refs = addEvidence(state, ['VALUE-PLANTS', 'INTERACTIONS', 'PLANT-01', 'PLANT-02', 'ZOMBIE-01']);
  for (const plantId of ['PLANT-01', 'PLANT-02']) {
    state.catalog.measurements.push(measurement(plantId, refs));
    state.catalog.interactions.push({ plantId, zombieId: 'ZOMBIE-01', rule: 'fixture-only', evidenceRefs: refs });
  }
  assert.deepEqual(validate(state.reference, state.catalog), []);
});

test('a complete synthetic frozen fixture rejects unrelated AUDIO evidence', () => {
  const state = fixture();
  const { reference, catalog } = state;
  const refs = addEvidence(state, catalog.entries.map(x => x.id));
  for (const entry of catalog.entries) {
    if (entry.status !== 'requirement_defined') {
      entry.status = 'verified_for_reference';
      entry.referenceName = `fixture-${entry.id}`;
      entry.evidenceRefs = refs;
    }
  }
  reference.frozen = catalog.frozen = reference.installation.runtimeObserved = true;
  reference.blockers = [];
  reference.freezeReview = { status: 'approved', reviewer: 'fixture', evidencePath: 'fixture' };
  catalog.status = 'frozen';
  catalog.closure = { complete: true, unresolved: [], referenceEvidenceRefs: refs };
  const subjects = { 'VALUE-PLANTS': 'PLANT-01', 'VALUE-ZOMBIES': 'ZOMBIE-01',
    'VALUE-WAVES': 'ADV-1-01', 'VALUE-ECONOMY': 'SHOP-CENSUS',
    'VALUE-STATUS': 'ENV-NIGHT', 'VALUE-ENDLESS': 'ENDLESS-SURV' };
  catalog.measurements = Object.entries(subjects).map(([entryId, entityId]) => ({
    ...measurement(entityId, refs), id: `M-${entryId}`, entryId,
  }));
  for (const plant of catalog.entries.filter(x => x.category === 'plants')) {
    for (const zombie of catalog.entries.filter(x => x.category === 'zombies')) {
      catalog.interactions.push({ plantId: plant.id, zombieId: zombie.id, rule: 'fixture-only', evidenceRefs: refs });
    }
  }
  assert.deepEqual(validate(reference, catalog), []);
  const unrelated = catalog.evidence.map(x => ({ ...x, id: `audio-${x.kind}`, entryIds: ['AUDIO'] }));
  catalog.evidence.push(...unrelated);
  for (const item of [...catalog.measurements, ...catalog.interactions]) item.evidenceRefs = unrelated.map(x => x.id);
  const errors = validate(reference, catalog);
  assert(errors.some(x => x.includes('measurement evidence coverage')));
  assert(errors.some(x => x.includes('interaction evidence coverage')));
});
