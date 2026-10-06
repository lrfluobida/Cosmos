import assert from 'node:assert/strict';
import test from 'node:test';
import { gameplayAcceptance, validateGameDraft, withHostStages } from '../../src/roles/requirements.ts';

const draft = (): any => ({ brief: '原创点击游戏', questions: [{ id: 'goal', prompt: '目标？' }], answers: { goal: '点击获胜' }, unsupported: [],
  codeProfile: 'modular-code/1', acceptance: [{ acceptanceId: 'win', description: '点击获胜', steps: ['点击目标'], expected: '胜利', evidenceKinds: ['test_report'] }],
  scenario: { viewport: { width: 1280, height: 720 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#target', timeoutMs: 1000 },
    { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] } });
test('known modular profile adds two fixed local standards without shrinking original gameplay', () => {
  const selected = withHostStages(draft()); validateGameDraft(selected);
  assert.deepEqual(selected.acceptance.map(row => row.acceptanceId), ['win', 'COSMOS-DESIGN', 'COSMOS-MEDIA', 'COSMOS-MODULE-A', 'COSMOS-MODULE-B']);
  assert.deepEqual(gameplayAcceptance(selected).map(row => row.acceptanceId), ['win']);
  const changed = structuredClone(selected); changed.acceptance.at(-1)!.expected = 'file exists'; assert.throws(() => validateGameDraft(changed));
});
test('legacy remains three standards and modular authority cannot be model fields', () => {
  const legacy = draft(); delete legacy.codeProfile; assert.equal(withHostStages(legacy).acceptance.length, 3);
  for (const delta of [{ codeProfile: 'anything' }, { writePaths: ['.'] }, { codingBudget: 999 }]) assert.throws(() => validateGameDraft({ ...draft(), ...delta }));
});
test('unselected legacy gameplay IDs are not reclassified as module slots', () => {
  const legacy = draft(); delete legacy.codeProfile; legacy.acceptance[0].acceptanceId = 'COSMOS-MODULE-A'; legacy.scenario.steps[1].acceptanceId = 'COSMOS-MODULE-A';
  const selected = withHostStages(legacy); assert.deepEqual(gameplayAcceptance(selected).map(row => row.acceptanceId), ['COSMOS-MODULE-A']);
});
