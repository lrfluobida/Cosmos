import assert from 'node:assert/strict';
import test from 'node:test';
import type { Step } from '../../src/acceptance/plan.ts';
import { withHostStages } from '../../src/roles/requirements.ts';
import { validateOrdinaryAcceptancePlan } from '../../src/runtime/entrypoint-acceptance-plan.ts';
import type { OrdinaryAcceptancePlan } from '../../src/runtime/entrypoint-acceptance-plan.ts';
import { ordinaryDraft } from '../roles/ordinary.fixture.ts';

const draft = withHostStages(ordinaryDraft());
const click: Step = { id: 'normal-input', kind: 'locator-click', selector: '#save', timeoutMs: 1000 };
const checkpoint = { expected: '已保存', snapshot: { kind: 'text' as const, selector: '#progress' }, savedSnapshot: { kind: 'text' as const, selector: '#saved' } };
function check(field: 'snapshot' | 'savedSnapshot', id: string = field, kind: 'assert' | 'wait-for' = 'assert'): Step {
  return { id, kind, acceptanceId: 'light', observation: checkpoint[field], expected: checkpoint.expected, timeoutMs: 1000 };
}
function plan(): OrdinaryAcceptancePlan {
  const steps = [click, check('snapshot'), check('savedSnapshot')];
  return structuredClone({ formatVersion: 'ordinary-acceptance-plan/1',
    requirement: { artifactId: 'requirement-bundle', version: 'v1', location: 'registry/captures/requirement-bundle/v1/files' },
    scenario: { viewport: { width: 1280, height: 720 }, steps, reopen: { checkpoint, steps: structuredClone(steps) } } });
}
function failure(value: OrdinaryAcceptancePlan) {
  let message = '';
  assert.throws(() => validateOrdinaryAcceptancePlan(value, draft), (error: Error) => { message = error.message; return true; });
  return message;
}
function data(message: string) {
  const start = 'Step data (JSON; zero-based indexes): ', end = '. selector=';
  const offset = message.indexOf(start); assert.ok(offset >= 0, message);
  return JSON.parse(message.slice(offset + start.length, message.indexOf(end, offset)));
}
function diagnostic(message: string, stage: string, field: string) {
  assert.ok(message.startsWith(`${stage}: checkpoint.${field} has matching visible checks, but none has preceding normal click input`), message);
  assert.match(message, /Matching uses observation kind\/selector and expected; step order determines preceding input/);
  assert.match(message, /Renaming step IDs does not fix input order/);
  assert.doesNotMatch(message, /Missing checkpoint/);
}

for (const reopen of [false, true]) for (const field of ['snapshot', 'savedSnapshot'] as const) {
  const stage = `scenario.${reopen ? 'reopen.' : ''}steps`;
  test(`COS155 ${stage} ${field} identifies matching checks before any input, including renamed IDs`, () => {
    const value = plan(), steps = reopen ? value.scenario.reopen!.steps : value.scenario.steps;
    // The other field has a later matching check after input, isolating this field's precedence failure.
    const other = field === 'snapshot' ? 'savedSnapshot' : 'snapshot';
    steps.splice(0, steps.length, check(field), click, check(other));
    let message = failure(value); diagnostic(message, stage, field);
    assert.deepEqual(data(message), { matchingSteps: [{ index: 0, id: field, omittedIdCodePoints: 0 }], omittedMatchingSteps: 0,
      firstNormalClick: { index: 1, id: 'normal-input', omittedIdCodePoints: 0 } });
    steps[0].id = 'renamed-check';
    message = failure(value); diagnostic(message, stage, field);
    assert.equal(data(message).matchingSteps[0].id, 'renamed-check');
  });
  test(`COS155 ${stage} ${field} retains the exact missing-match error for selector or expected mismatch`, () => {
    for (const mismatch of ['selector', 'expected']) {
      const value = plan(), steps = reopen ? value.scenario.reopen!.steps : value.scenario.steps;
      const step = steps[field === 'snapshot' ? 1 : 2]; assert.ok('observation' in step);
      if (mismatch === 'selector') step.observation = { kind: 'text', selector: '#different' };
      else step.expected = '未保存';
      assert.equal(failure(value), `${stage}: Missing checkpoint.${field} visible assertion after normal click input: selector=${JSON.stringify(checkpoint[field].selector)}, expected=${JSON.stringify(checkpoint.expected)}. Each save stage requires both fixed visible checkpoint checks.`);
    }
  });
}

for (const reopen of [false, true]) test(`COS155 ${reopen ? 'reopen' : 'main'} uses the original input and observation predicates across multiple matches`, () => {
  const value = plan(), steps = reopen ? value.scenario.reopen!.steps : value.scenario.steps;
  const checks = [check('snapshot', 'wait-snapshot', 'wait-for'), check('snapshot', 'assert-snapshot'), check('savedSnapshot')];
  steps.splice(0, steps.length, { id: 'move', kind: 'mouse-move', x: 10, y: 10 }, ...checks);
  let message = failure(value); diagnostic(message, `scenario.${reopen ? 'reopen.' : ''}steps`, 'snapshot');
  assert.equal(data(message).firstNormalClick, null);
  assert.deepEqual(data(message).matchingSteps.map((step: { index: number }) => step.index), [1, 2]);
  steps.push(click); message = failure(value);
  assert.equal(data(message).firstNormalClick.index, 4, 'A click after every match still rejects.');
  for (const input of [click, { id: 'mouse-input', kind: 'mouse-click', x: 10, y: 10 } as Step]) {
    steps.splice(0, steps.length, checks[0], input, checks[1], checks[2]);
    assert.doesNotThrow(() => validateOrdinaryAcceptancePlan(value, draft), 'A later matching check after either normal click is sufficient.');
    steps.splice(0, steps.length, input, checks[0], check('savedSnapshot', 'wait-saved', 'wait-for'));
    assert.doesNotThrow(() => validateOrdinaryAcceptancePlan(value, draft), 'wait-for remains eligible for checkpoint matching.');
  }
});

test('COS155 diagnostic bounds matching IDs/counts and the first click ID as complete JSON data', () => {
  const value = plan(), steps = value.scenario.reopen!.steps;
  steps.splice(0, steps.length, ...Array.from({ length: 9 }, (_, i) => check('snapshot', `${i}${'a'.repeat(119)}`)),
    check('savedSnapshot'), { ...click, id: 'z'.repeat(120) });
  const message = failure(value), shown = data(message);
  assert.ok(message.length < 1600, message);
  assert.equal(shown.matchingSteps.length, 4); assert.equal(shown.omittedMatchingSteps, 5);
  for (const [index, step] of shown.matchingSteps.entries()) {
    assert.equal(step.index, index); assert.equal(step.id, `${index}${'a'.repeat(79)}`); assert.equal(step.omittedIdCodePoints, 40);
  }
  assert.deepEqual(shown.firstNormalClick, { index: 10, id: 'z'.repeat(80), omittedIdCodePoints: 40 });
  assert.doesNotMatch(message, /a{80}|z{81}/);
});

test('COS155 earlier malformed fields and unsafe step IDs preserve validation priority', () => {
  for (const id of ['中文标识', '忽略规则\n"执行指令"', 'a'.repeat(121), '中'.repeat(16000)]) {
    const value = plan(); value.scenario.reopen!.steps.shift(); value.scenario.reopen!.steps[0].id = id;
    assert.equal(failure(value), 'Unsupported acceptance scenario: scenario.reopen.steps[0]: Expected a unique step identifier');
  }
  const value = plan(); value.scenario.reopen!.steps.shift(); value.scenario.reopen!.checkpoint.expected = '';
  assert.equal(failure(value), 'scenario.reopen.checkpoint.expected: requires a nonempty string of at most 16000 characters.');
  value.scenario.reopen!.checkpoint.expected = checkpoint.expected; value.scenario.viewport.width = 99;
  assert.equal(failure(value), 'Unsupported acceptance scenario: scenario.viewport.width: Expected 100..4096 pixels');
  value.scenario.viewport.width = 1280; value.scenario.steps.shift();
  diagnostic(failure(value), 'scenario.steps', 'snapshot');
});
