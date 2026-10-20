import assert from 'node:assert/strict';
import test from 'node:test';
import { withHostStages } from '../../src/roles/requirements.ts';
import { validateDesign } from '../../src/runtime/entrypoint-media.ts';
import { ordinaryDraft } from '../roles/ordinary.fixture.ts';
import { validateOrdinaryAcceptancePlan } from '../../src/runtime/entrypoint-acceptance-plan.ts';

const plans: { validateOrdinaryAcceptancePlan: typeof validateOrdinaryAcceptancePlan } = { validateOrdinaryAcceptancePlan };
const draft = withHostStages(ordinaryDraft());
const requirement = { artifactId: 'requirement-bundle', version: 'v1', location: 'registry/captures/requirement-bundle/v1/files' };
const scenario = () => ({ viewport: { width: 1280, height: 720 }, steps: [
  { id: 'click', kind: 'locator-click', selector: '#light', timeoutMs: 1000 },
  { id: 'complete', kind: 'assert', acceptanceId: 'light', observation: { kind: 'text', selector: '#status' }, expected: '显示完成', timeoutMs: 1000 },
] });
const plan = () => ({ formatVersion: 'ordinary-acceptance-plan/1', requirement, scenario: scenario() });
test('ordinary design plans validate all original visible checks without execution identities', () => {
  assert.equal(typeof plans.validateOrdinaryAcceptancePlan, 'function');
  plans.validateOrdinaryAcceptancePlan(plan(), draft);
  for (const change of [
    (p: any) => { p.candidate = requirement; },
    (p: any) => { p.scenario.steps[1].acceptanceId = 'another'; },
    (p: any) => { p.scenario.steps[1].observation = { kind: 'debug', path: ['won'] }; },
    (p: any) => { p.scenario.steps[0].kind = 'evaluate'; },
    (p: any) => { p.scenario.steps.shift(); },
    (p: any) => { p.requirement.extra = 'permission'; },
  ]) { const value = structuredClone(plan()); change(value); assert.throws(() => plans.validateOrdinaryAcceptancePlan(value, draft)); }
});
test('ordinary plans retain normal save and reopen checkpoints and classic requirements', () => {
  assert.equal(typeof plans.validateOrdinaryAcceptancePlan, 'function');
  const value: any = plan(), checkpoint = { expected: '已保存', snapshot: { kind: 'text', selector: '#progress' }, savedSnapshot: { kind: 'text', selector: '#saved' } };
  value.scenario.steps.push(...[checkpoint.snapshot, checkpoint.savedSnapshot].map((observation, i) => ({ id: `save-${i}`, kind: 'assert', acceptanceId: 'light', observation, expected: checkpoint.expected, timeoutMs: 1000 })));
  value.scenario.reopen = { checkpoint, steps: structuredClone(value.scenario.steps) };
  plans.validateOrdinaryAcceptancePlan(value, { ...draft, benchmark: 'classic-pc-runtime-policy/1' });
  assert.throws(() => plans.validateOrdinaryAcceptancePlan(plan(), { ...draft, benchmark: 'classic-pc-runtime-policy/1' }));
  value.scenario.reopen!.steps.pop(); assert.throws(() => plans.validateOrdinaryAcceptancePlan(value, draft));
});
test('new design maps the complete original experience list while legacy schema stays strict', () => {
  const value = { summary: '点亮目标', implementationNotes: ['鼠标操作'], acceptanceMapping: { light: '显示完成' },
    characters: [{ id: 'light', purpose: '目标', states: ['idle'] }], audio: [], experienceMapping: { readable: '清楚显示当前点亮状态' } };
  assert.doesNotThrow(() => (validateDesign as any)(value, ['light'], false, draft.experienceCriteria));
  assert.throws(() => (validateDesign as any)({ ...value, experienceMapping: {} }, ['light'], false, draft.experienceCriteria));
  assert.throws(() => validateDesign(value, ['light']));
});
