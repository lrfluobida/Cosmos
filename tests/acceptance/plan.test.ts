import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { validatePlan } from '../../src/acceptance/plan.ts';

export const plan = () => ({
  formatVersion: '1.0.0', projectId: 'generic', taskId: 'COS-08', runId: 'run-01', reportId: 'check-01',
  specVersion: '1.0', artifact: { artifactId: 'game', version: 'snapshot-01', location: 'artifacts/game' },
  url: 'http://127.0.0.1:4173', viewport: { width: 1280, height: 720 },
  acceptanceIds: ['input'], steps: [
    { id: 'click', kind: 'mouse-click', x: 100, y: 100 },
    { id: 'count', kind: 'wait-for', acceptanceId: 'input', observation: { kind: 'debug', path: ['clicks'] }, expected: 1, timeoutMs: 1000 },
  ],
});

test('validates a bounded declarative input plan without modifying it', () => {
  const value = plan(), before = structuredClone(value);
  assert.deepEqual(validatePlan(value), []);
  assert.deepEqual(value, before);
});

test('rejects unpinned versions, unsafe identity paths, remote URLs and executable steps', () => {
  for (const mutate of [
    (p: any) => { p.artifact.version = 'main'; },
    (p: any) => { p.reportId = '../overwrite'; },
    (p: any) => { p.reportId = 'report.'; },
    (p: any) => { p.url = 'https://example.com'; },
    (p: any) => { p.url = 'http://user:password@localhost'; },
    (p: any) => { p.steps[0] = { id: 'win', kind: 'evaluate', script: 'window.win = true' }; },
    (p: any) => { p.steps[0].script = 'window.win = true'; },
    (p: any) => { p.steps[1].timeoutMs = 0; },
    (p: any) => { p.steps[1].timeoutMs = 60_001; },
    (p: any) => { p.steps[1].observation.path = ['constructor']; },
    (p: any) => { p.steps[1].expected = NaN; },
    (p: any) => { p.steps[1].acceptanceId = 'unapproved'; },
    (p: any) => { p.steps = [p.steps[0]]; },
    (p: any) => { p.steps[1].id = 'click'; },
  ]) {
    const value = plan(); mutate(value);
    assert.ok(validatePlan(value).length > 0, JSON.stringify(value));
  }
});

test('invalid shapes produce validation issues instead of throwing', () => {
  for (const value of [null, [], 'plan', {}, { ...plan(), steps: [null] }, { ...plan(), artifact: null }]) {
    assert.ok(validatePlan(value).length > 0);
  }
});
