import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import * as contracts from '../../src/contracts/index.ts';

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const validators = { artifact: contracts.validateArtifact, context: contracts.validateContext, evidence: contracts.validateEvidence, ledger: contracts.validateLedger, requirement: contracts.validateRequirement, run: contracts.validateRun, task: contracts.validateTask };

test('documented valid examples pass executable contract validation', () => {
  for (const [name, validate] of Object.entries(validators)) assert.deepEqual(validate(read(`../../docs/contracts/examples/valid/${name}.json`)), [], name);
  assert.deepEqual(contracts.validateTask(read('../../docs/contracts/examples/valid/task-approved.json')), []);
});

test('documented invalid examples are rejected for their advertised reason', () => {
  const cases = [
    ['task-missing-input-version', contracts.validateTask, 'string'],
    ['task-no-acceptance-ids', contracts.validateTask, 'required_items'],
    ['task-no-success-evidence', contracts.validateTask, 'acceptance_evidence'],
    ['task-self-review', contracts.validateTask, 'independent_review'],
    ['ledger-over-allocation', contracts.validateLedger, 'allocation_exceeded'],
  ] as const;
  for (const [name, validate, code] of cases) assert.ok(validate(read(`../../docs/contracts/examples/invalid/${name}.json`)).some(issue => issue.code === code), name);
  const update = read('../../docs/contracts/examples/invalid/illegal-transition.json');
  assert.ok(contracts.validateTaskUpdate(update.previous, update.next, update.actor).some(issue => issue.code === 'illegal_transition'));
});

test('schema references resolve locally and declare closed required object fields', () => {
  const directory = new URL('../../schemas/', import.meta.url);
  const schemas = new Map(readdirSync(directory).filter(name => name.endsWith('.schema.json')).map(name => [name, read(`../../schemas/${name}`)]));
  function inspect(value: any): void {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      const [file, pointer] = value.$ref.split('#');
      let target = schemas.get(file); assert.ok(target, value.$ref);
      if (pointer) for (const segment of pointer.slice(1).split('/')) target = target[segment];
      assert.ok(target, value.$ref);
    }
    if (value.type === 'object') {
      assert.equal(value.additionalProperties, false);
      assert.deepEqual(value.required, Object.keys(value.properties));
    }
    for (const child of Object.values(value)) inspect(child);
  }
  for (const schema of schemas.values()) inspect(schema);
});
