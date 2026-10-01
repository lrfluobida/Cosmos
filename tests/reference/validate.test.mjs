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
