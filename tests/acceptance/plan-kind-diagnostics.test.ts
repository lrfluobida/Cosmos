import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePlan } from '../../src/acceptance/plan.ts';

const inputSteps = [
  { id: 'click', kind: 'mouse-click', x: 100, y: 100 },
  { id: 'move', kind: 'mouse-move', x: 0.5, y: 0.5, selector: '#target' },
  { id: 'locate', kind: 'locator-click', selector: '#target', timeoutMs: 1000 },
];
const observations = [{ kind: 'text', selector: '#status' }, { kind: 'visible', selector: '#target' }, { kind: 'debug', path: ['ready'] }];
const plan = (): any => ({
  formatVersion: '1.0.0', projectId: 'generic', taskId: 'COS-158', runId: 'run-01', reportId: 'check-01',
  specVersion: '1.0', artifact: { artifactId: 'game', version: 'snapshot-01', location: 'artifacts/game' },
  url: 'http://127.0.0.1:4173', viewport: { width: 1280, height: 720 }, acceptanceIds: ['ready'],
  steps: [structuredClone(inputSteps[0]), { id: 'ready', kind: 'assert', acceptanceId: 'ready', observation: observations[0], expected: true, timeoutMs: 1000 }],
});
const forbidden = (kind: string) => `acceptanceId is forbidden on ${kind}; required on assert/wait-for. Do not remove it from assertions.`;
const missing = (kind: string) => `Missing required field: acceptanceId for ${kind}. Use the original criterion ID for this assertion.`;

test('COS158 correct input and assertion kinds retain validity and source values', () => {
  for (const input of inputSteps) for (const kind of ['assert', 'wait-for']) for (const observation of observations) {
    const value = plan(); value.steps[0] = structuredClone(input); Object.assign(value.steps[1], { kind, observation });
    const before = structuredClone(value);
    assert.deepEqual(validatePlan(value), []);
    assert.deepEqual(value, before);
  }
});

test('COS158 forbidden input IDs augment one unknown-fields issue in its original key order', () => {
  for (const input of inputSteps) for (const additional of [false, true]) {
    const value = plan();
    value.steps[0] = { ...input, ...(additional ? { extra: true } : {}), acceptanceId: 'ready', ...(additional ? { script: 'untrusted value' } : {}) };
    const before = structuredClone(value);
    assert.deepEqual(validatePlan(value), [`steps[0]: Unknown field: ${additional ? '"extra", "acceptanceId", "script"' : '"acceptanceId"'}. ${forbidden(input.kind)}`]);
    assert.deepEqual(value, before);
  }
});

test('COS158 absent assertion IDs are required for both assertion kinds and every observation kind', () => {
  for (const kind of ['assert', 'wait-for']) for (const observation of observations) {
    const value = plan(); Object.assign(value.steps[1], { kind, observation }); delete value.steps[1].acceptanceId;
    assert.deepEqual(validatePlan(value), [`steps[1]: ${missing(kind)}`, 'acceptanceIds: Missing assertion for ready']);
    assert.equal(Object.hasOwn(value.steps[1], 'acceptanceId'), false);
  }
});

test('COS158 present empty null undefined and unknown assertion IDs retain the original error without echoing values', () => {
  for (const kind of ['assert', 'wait-for']) for (const acceptanceId of ['', null, undefined, 'unknown', 'arbitrary model prose']) {
    const value = plan(); Object.assign(value.steps[1], { kind, acceptanceId });
    assert.deepEqual(validatePlan(value), ['steps[1]: Unknown acceptanceId', 'acceptanceIds: Missing assertion for ready']);
    assert.equal(Object.hasOwn(value.steps[1], 'acceptanceId'), true);
  }
});

test('COS158 unrelated unknown fields and unsupported kinds keep their original diagnostics', () => {
  const value = plan(); value.acceptanceId = 'ready'; value.steps[0].extra = true;
  value.steps[1].observation = { ...observations[0], acceptanceId: 'ready' };
  assert.deepEqual(validatePlan(value), ['$: Unknown field: "acceptanceId"', 'steps[0]: Unknown field: "extra"', 'steps[1]: Unknown field: "acceptanceId"']);
  value.steps[0] = { id: 'click', kind: 'unsupported', acceptanceId: 'ready' }; delete value.acceptanceId;
  value.steps[1].observation = observations[0];
  assert.deepEqual(validatePlan(value), ['steps[0]: Unsupported step kind']);
});

test('COS158 missing and forbidden hints preserve the order and count of other failed guards', () => {
  const value = plan(); value.steps[0] = { id: 'click', kind: 'mouse-click', selector: '#target', x: -1, y: 2, acceptanceId: 'ready' };
  delete value.steps[1].acceptanceId;
  Object.assign(value.steps[1], { expected: {}, timeoutMs: 0, observation: { kind: 'visible', selector: '' } });
  assert.deepEqual(validatePlan(value), [
    `steps[0]: Unknown field: "acceptanceId". ${forbidden('mouse-click')}`,
    'steps[0].x: Coordinates must be within viewport or normalized selector bounds [0,1)',
    'steps[0].y: Coordinates must be within viewport or normalized selector bounds [0,1)',
    `steps[1]: ${missing('assert')}`, 'steps[1]: Expected a finite JSON scalar', 'steps[1]: Expected timeoutMs 1..60000',
    'steps[1]: Expected a selector', 'steps[1]: Visibility expects a boolean', 'acceptanceIds: Missing assertion for ready',
  ]);
  value.steps[1].observation = { kind: 'debug', path: ['constructor'] };
  assert.ok(validatePlan(value).includes('steps[1]: Expected a read-only cosmosDebug data path'));
});

test('COS158 own-field message selection does not change the existing ID membership predicate', () => {
  const value = plan(); delete value.steps[1].acceptanceId;
  Object.setPrototypeOf(value.steps[1], { acceptanceId: 'ready' });
  assert.deepEqual(validatePlan(value), []);
});
