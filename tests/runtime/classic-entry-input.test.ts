import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { selectClassicEntry, requireClassicEntrySelection, createClassicEntryPlan, validateClassicEntryPlan } from '../../src/runtime/classic-entry-input.ts';
import { createGameDesignCheck } from '../../src/runtime/entrypoint-design-check.ts';
import { genericDesign } from '../acceptance/generic-persistent.fixture.ts';

async function source(t: test.TestContext, empty = false) {
  const root = await mkdtemp(join(tmpdir(), 'cos104-input-')); t.after(() => removeOwned(tmpdir(), root));
  for (const file of ['reference.json', 'catalog.json']) await cp(new URL(`../../benchmarks/classic-pc/reference/${file}`, import.meta.url), join(root, file));
  const catalog = JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8'));
  for (const row of catalog.entries) row.evidenceRefs = [];
  const entity = catalog.entries.find((row: any) => row.category === 'plants');
  entity.label = 'Synthetic plant fixture'; entity.referenceName = null; delete entity.referenceBinding;
  const measurement = { id: 'synthetic-cost', entryId: 'VALUE-PLANTS', entityId: entity.id, status: 'verified_for_reference', value: 7,
    unit: 'synthetic coins', metric: 'synthetic cost', method: 'SOURCE fixture only', tolerance: 'exact', evidenceRefs: ['synthetic-input', 'synthetic-rule'] };
  catalog.measurements = empty ? [] : [measurement];
  catalog.evidence = empty ? [] : ['normal_input', 'deterministic_rule'].map((kind, index) => ({ id: measurement.evidenceRefs[index], kind, referenceId: catalog.referenceId,
    status: 'pass', entryIds: [measurement.entryId, measurement.entityId], path: `evidence/synthetic-${index}.txt`, observedAt: '2026-10-17T00:00:00Z',
    preconditions: 'Synthetic SOURCE fixture', steps: 'Click fixture control', expected: '7', observed: '7' }));
  await mkdir(join(root, 'evidence'));
  for (const row of catalog.evidence) await writeFile(join(root, row.path), 'Synthetic reference fixture; no reference game observation.\n', 'utf8');
  const save = () => writeFile(join(root, 'catalog.json'), JSON.stringify(catalog), 'utf8');
  await save(); return { root, catalog, measurement, save };
}

test('empty fixture measurements bind an explicit non-executable selection', async t => {
  const { root } = await source(t, true), selected = await selectClassicEntry(root);
  assert.equal(selected.measurement, null); assert.equal(selected.reason, 'no_reference_measurements');
  assert.deepEqual(selected.evidence, []); assert.match(selected.catalogSha256, /^[a-f0-9]{64}$/);
});

test('only verified exact finite measurements can be selected, in original source order', async t => {
  const { root, catalog, measurement, save } = await source(t);
  catalog.measurements = [{ ...measurement, id: 'timing', tolerance: 'timing' }, { ...measurement, id: 'unknown', status: 'needs_reference' }];
  await save(); assert.equal((await selectClassicEntry(root)).reason, 'no_verified_exact_measurement');
  catalog.measurements.push(measurement, { ...measurement, id: 'second', value: 99 }); await save();
  const selected = await selectClassicEntry(root); assert.deepEqual(selected.measurement, measurement); assert.equal(selected.reason, null);
  assert.equal(selected.evidence.length, 2); assert.equal(selected.entityLabel, catalog.entries.find((row: any) => row.id === measurement.entityId).label);
  await requireClassicEntrySelection(selected, root);
  await assert.rejects(requireClassicEntrySelection({ ...selected, measurement: catalog.measurements.at(-1) }, root), /selection|source/i);
  await assert.rejects(requireClassicEntrySelection({ ...selected, measurement: { ...measurement, value: 999 } }, root), /selection|source/i);
});

test('unreadable first structural match never falls through to the second measurement', async t => {
  const { root, catalog, measurement, save } = await source(t);
  catalog.evidence.push(...catalog.evidence.map((row: any, index: number) => ({ ...row, id: `second-${index}` })));
  catalog.measurements.push({ ...measurement, id: 'second', evidenceRefs: ['second-0', 'second-1'] }); catalog.evidence[0].path = 'evidence/missing.txt'; await save();
  await assert.rejects(selectClassicEntry(root), /ENOENT|evidence/i);
});

for (const fault of ['reference', 'entity', 'unit', 'coverage', 'outside', 'absolute', 'nonfinite']) test(`fixed source rejects ${fault}`, async t => {
  const { root, catalog, measurement, save } = await source(t);
  if (fault === 'reference') catalog.referenceId = 'another';
  if (fault === 'entity') measurement.entityId = 'STARTUP';
  if (fault === 'unit') measurement.unit = '';
  if (fault === 'coverage') catalog.evidence[0].entryIds = [measurement.entryId];
  if (fault === 'outside') catalog.evidence[0].path = '../raw.txt';
  if (fault === 'absolute') catalog.evidence[0].path = 'C:/raw.txt';
  if (fault === 'nonfinite') measurement.value = Infinity;
  await save(); await assert.rejects(selectClassicEntry(root));
});

test('selection binds source bytes and both evidence bytes against later drift', async t => {
  const { root, catalog } = await source(t), selected = await selectClassicEntry(root);
  await writeFile(join(root, catalog.evidence[0].path), 'changed', 'utf8');
  await assert.rejects(requireClassicEntrySelection(selected, root), /selection|source/i);
});

test('fixed sidecar compiles only normal inputs plus one source-owned visible numeric assertion', async t => {
  const { root } = await source(t), selected = await selectClassicEntry(root);
  const mapping = { formatVersion: 'classic-entry-plan/1', measurementId: selected.measurement!.id, acceptanceId: 'save',
    inputs: [{ id: 'click-value', kind: 'locator-click', selector: '#cost-control', timeoutMs: 1000 }],
    observation: { kind: 'text', selector: '#cost' }, timeoutMs: 1000 };
  const binding = { projectId: 'game', taskId: 'coding', runId: 'run', reportId: 'coding-classic-entry', specVersion: '1.0',
    artifact: { artifactId: 'game', version: 'v1', location: 'candidate' }, url: 'http://127.0.0.1:1234', viewport: { width: 1280, height: 720 } };
  const plan = createClassicEntryPlan(mapping, selected, ['save'], binding);
  assert.deepEqual(plan.steps.slice(0, -1), mapping.inputs);
  assert.deepEqual(plan.steps.at(-1), { id: 'classic-entry-observe', kind: 'assert', acceptanceId: 'save', observation: mapping.observation, expected: '7', timeoutMs: 1000 });
  assert.deepEqual(plan.acceptanceIds, ['save']); assert.equal(plan.artifact, binding.artifact);
  for (const change of [{ measurementId: 'second' }, { acceptanceId: 'COSMOS-DESIGN' }, { expected: '99' }, { url: binding.url }, { candidate: binding.artifact },
    { observation: { kind: 'debug', path: ['cost'] } }, { timeoutMs: 60001 }, { inputs: [] }, { inputs: Array.from({ length: 200 }, (_, n) => ({ ...mapping.inputs[0], id: `click-${n}` })) },
    { inputs: [{ id: 'classic-entry-observe', kind: 'locator-click', selector: '#cost', timeoutMs: 1 }] },
    { inputs: [{ id: 'move', kind: 'mouse-move', x: 1, y: 1 }] }, { inputs: [...mapping.inputs, plan.steps.at(-1)] },
    { inputs: [{ ...mapping.inputs[0], script: 'cost=7' }] }, { mappings: [mapping, mapping] }]) {
    assert.throws(() => validateClassicEntryPlan({ ...mapping, ...change }, selected, ['save'], binding.viewport));
  }
});

test('original read-only design self-check applies the same fixed sidecar validator', async t => {
  const { root } = await source(t), selection = await selectClassicEntry(root);
  await mkdir(join(root, 'authors/design'), { recursive: true }); await writeFile(join(root, 'authors/design/design.json'), JSON.stringify(genericDesign), 'utf8');
  const tool = createGameDesignCheck({ workspace: root, gameplayIds: ['save', 'resume'], classicEntry: { selection, viewport: { width: 1280, height: 720 } }, guard: async () => {} });
  const check = async () => JSON.parse((await (tool.tool.execute as any)('fixed', {}, undefined)).content[0].text);
  assert.equal((await check()).passed, false);
  const mapping = { formatVersion: 'classic-entry-plan/1', measurementId: selection.measurement!.id, acceptanceId: 'save', inputs: [{ id: 'click', kind: 'locator-click', selector: '#cost', timeoutMs: 1 }], observation: { kind: 'text', selector: '#cost' }, timeoutMs: 1 };
  await writeFile(join(root, 'authors/design/classic-entry-plan.json'), JSON.stringify(mapping), 'utf8'); assert.equal((await check()).passed, true);
  await writeFile(join(root, 'authors/design/classic-entry-plan.json'), JSON.stringify({ ...mapping, expected: '999' }), 'utf8'); assert.equal((await check()).passed, false);
});
