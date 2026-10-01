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
  const documents = readdirSync(directory).filter(name => name.endsWith('.schema.json')).map(name => read(`../../schemas/${name}`));
  const schemas = new Map(documents.map(schema => [schema.$id, schema]));
  function dereference(reference: string, base: string): { value: any; base: string } {
    const uri = new URL(reference, base), pointer = uri.hash;
    uri.hash = '';
    let target = schemas.get(uri.href); assert.ok(target, `Unresolved schema URI: ${uri.href}`);
    if (pointer) for (const segment of pointer.slice(2).split('/')) target = target[decodeURIComponent(segment).replace(/~1/g, '/').replace(/~0/g, '~')];
    assert.ok(target, `${base} -> ${reference}`);
    return { value: target, base: uri.href };
  }
  function inspect(value: any, base: string): void {
    if (!value || typeof value !== 'object') return;
    if (value.$id) base = new URL(value.$id, base).href;
    if (value.$ref) dereference(value.$ref, base);
    if (value.type === 'object') {
      assert.equal(value.additionalProperties, false);
      assert.deepEqual(value.required, Object.keys(value.properties));
    }
    for (const child of Object.values(value)) inspect(child, base);
  }
  for (const schema of schemas.values()) inspect(schema, schema.$id);
  const continuation = schemas.get('https://cosmos.local/contracts/2.0.0/ledger.schema.json');
  for (const [name, type] of [['ledgerId', 'string'], ['limitMicroCny', 'integer'], ['allocations', 'array'], ['entries', 'array']] as const) {
    const target = dereference(continuation.properties[name].$ref, continuation.$id);
    assert.equal(target.value.type, type, `${name} must resolve to the original schema, not itself`);
    assert.ok(target.base.startsWith('https://cosmos.local/contracts/1.0.0/'));
  }
});
