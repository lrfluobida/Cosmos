import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { inspectClassicMapping } from '../../src/runtime/entrypoint-classic.ts';

const read = async (name: string) => JSON.parse(await readFile(new URL(`../../benchmarks/classic-pc/reference/${name}.json`, import.meta.url), 'utf8'));
const binding = { formatVersion: 'classic-policy-mapping/1', selection: 'classic-pc-runtime-policy/1', referenceId: 'pvz-pc-goty-1.2.0.1073-c04c524c6a37',
  reference: { artifactId: 'reference', version: 'v1', location: 'reference' }, catalog: { artifactId: 'catalog', version: 'v1', location: 'catalog' },
  requirement: { artifactId: 'requirements', version: 'v1', location: 'requirements' }, design: { artifactId: 'design', version: 'v1', location: 'design' },
  candidate: { artifactId: 'game', version: 'v1', location: 'game' }, runId: 'run', taskId: 'coding', specVersion: '1.0', scenario: { steps: ['fixed fixture'] },
  mappings: [{ entryId: 'STARTUP', consumer: 'clean-delivery-finally' }, { entryId: 'OFFLINE', consumer: 'normal-save-process-reopen' }] };
test('fixed policy mapping accepts the full provisional catalog without claiming execution', async () => {
  assert.deepEqual(await inspectClassicMapping(await read('reference'), await read('catalog'), binding, binding), []);
});
test('changed identity, duplicate mapping, missing modes and fake freeze stay invalid', async () => {
  const reference = await read('reference'), catalog = await read('catalog');
  for (const key of ['runId', 'taskId', 'specVersion', 'scenario', 'candidate', 'requirement', 'design', 'reference', 'catalog', 'selection']) {
    assert.ok((await inspectClassicMapping(reference, catalog, { ...binding, [key]: 'changed' }, binding)).length, key);
  }
  assert.ok((await inspectClassicMapping(reference, catalog, { ...binding, mappings: [...binding.mappings, binding.mappings[0]] }, binding)).some(error => /duplicate/.test(error)));
  const removed = structuredClone(catalog); removed.entries = removed.entries.filter((row: any) => row.category !== 'garden');
  assert.ok((await inspectClassicMapping(reference, removed, binding, binding)).some(error => /garden|denominator/.test(error)));
  const frozen = structuredClone(catalog); frozen.frozen = true; frozen.status = 'frozen';
  assert.ok((await inspectClassicMapping({ ...reference, frozen: true }, frozen, binding, binding)).some(error => /unresolved|freeze|frozen/.test(error)));
});
