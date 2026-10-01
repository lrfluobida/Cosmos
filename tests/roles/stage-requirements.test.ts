import assert from 'node:assert/strict';
import test from 'node:test';
import * as requirements from '../../src/roles/requirements.ts';
const game = { brief: '点击星星', questions: [{ id: 'goal', prompt: '目标？' }], answers: { goal: '获胜' }, unsupported: [],
  acceptance: [{ acceptanceId: 'win', description: '点击获胜', steps: ['点击星星'], expected: '胜利', evidenceKinds: ['test_report'] }],
  scenario: { viewport: { width: 1280, height: 720 }, steps: [{ id: 'click', kind: 'locator-click', selector: '#star', timeoutMs: 1000 }, { id: 'win', kind: 'assert', acceptanceId: 'win', observation: { kind: 'text', selector: '#result' }, expected: '胜利', timeoutMs: 1000 }] } };
test('host stage checks are explicit separate criteria and preserve all original gameplay requirements', () => {
  assert.equal(typeof requirements.withHostStages, 'function', 'Host stages must be declared before user confirmation');
  const combined = requirements.withHostStages(game as any);
  assert.deepEqual(requirements.gameplayAcceptance(combined), game.acceptance);
  assert.equal(combined.acceptance.length, 3); assert.deepEqual(combined.scenario, game.scenario);
  assert.doesNotThrow(() => requirements.validateGameDraft(combined));
  const changed = structuredClone(combined); changed.acceptance[1].expected = 'Always pass';
  assert.throws(() => requirements.validateGameDraft(changed), /stage/i);
});
test('host stages cannot substitute for the actual gameplay acceptance', () => {
  assert.equal(typeof requirements.withHostStages, 'function');
  const combined = requirements.withHostStages(game as any); combined.acceptance.shift();
  assert.throws(() => requirements.validateGameDraft(combined), /gameplay|scenario/i);
});
