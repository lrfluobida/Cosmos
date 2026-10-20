import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { validateGameDraft, withHostStages, gameplayAcceptance, HOST_STAGE_ACCEPTANCE, MODULE_ACCEPTANCE_IDS } from '../../src/roles/requirements.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { ordinaryDraft, ordinaryIntake, profile } from './ordinary.fixture.ts';

test('source-selected ordinary intent preserves automatic and experience requirements without scenario', () => {
  const draft = ordinaryDraft();
  assert.doesNotThrow(() => validateGameDraft(draft, 'browser', profile));
  const staged = withHostStages({ ...draft, codeProfile: 'modular-code/1' });
  assert.equal(staged.scenario, undefined); assert.deepEqual(staged.experienceCriteria, draft.experienceCriteria);
  assert.deepEqual(gameplayAcceptance(staged), draft.acceptance);
  assert.deepEqual(staged.acceptance.map(item => item.acceptanceId), ['light', ...HOST_STAGE_ACCEPTANCE.map(item => item.acceptanceId), ...MODULE_ACCEPTANCE_IDS]);
  assert.throws(() => validateGameDraft(draft), /profile|fields/i, 'model data cannot select a new host profile');
});

test('ordinary schema rejects executable fields, forged authority and colliding or malformed experience IDs', () => {
  for (const change of [
    { scenario: {} }, { preparation: {} }, { confirmed: true }, { actorId: 'model' }, { sources: [] }, { paths: [] },
    { ordinaryProfile: 'unknown' }, { experienceCriteria: undefined }, { acceptance: [] },
    { experienceCriteria: [{ ...ordinaryDraft().experienceCriteria[0], criterionId: 'light' }] },
    { experienceCriteria: [...ordinaryDraft().experienceCriteria, ...ordinaryDraft().experienceCriteria] },
    { experienceCriteria: [{ ...ordinaryDraft().experienceCriteria[0], expected: '' }] },
  ]) assert.throws(() => validateGameDraft({ ...ordinaryDraft(), ...change }, 'browser', profile));
});
test('ordinary objective acceptance cannot require only a user decision or carry extra question authority', () => {
  const automatic = ordinaryDraft(); automatic.acceptance[0].evidenceKinds = ['user_decision'];
  assert.throws(() => validateGameDraft(automatic, 'browser', profile), /automatic|evidence/i);
  assert.throws(() => validateGameDraft({ ...ordinaryDraft(), questions: [{ ...ordinaryDraft().questions[0], confirmed: true }] }, 'browser', profile), /question/i);
});

test('ordinary intake binds original profile, exact revision and Chinese source before activation', async t => {
  const { root, controller } = await ordinaryIntake(t);
  assert.equal((await controller.read()).ordinaryProfile, profile);
  const saved = await controller.saveDraft(ordinaryDraft());
  await assert.rejects(controller.confirm({ revision: saved.revision + 1, confirmed: true, actorId: 'local-user', at: new Date().toISOString() }), /revision/i);
  const requirement = await controller.confirm({ revision: saved.revision, confirmed: true, actorId: 'local-user', at: new Date().toISOString() });
  assert.deepEqual(JSON.parse(await readFile(join(root, requirement.sources[0].location), 'utf8')), ordinaryDraft());
  assert.equal(JSON.parse(await readFile(join(root, requirement.sources[1].location), 'utf8')).ordinaryProfile, profile);
  const before = await controller.read();
  const active = await controller.activateGeneration({ environmentReady: true, executionReady: true });
  assert.deepEqual(active.ledger, before.ledger);
  assert.deepEqual(active.requests, before.requests);
  assert.equal(Date.parse(active.run.originalDeadlineAt) - Date.parse(active.run.originalStartedAt), before.durationMs);
});

test('ordinary unsupported cannot confirm and profile/source deletion cannot downgrade resumed intake', async t => {
  const { root, controller } = await ordinaryIntake(t);
  const saved = await controller.saveDraft({ ...ordinaryDraft(), unsupported: ['当前不能根据观察选择下一步。'] });
  await assert.rejects(controller.confirm({ revision: saved.revision, confirmed: true, actorId: 'local-user', at: new Date().toISOString() }), /unsupported/i);
  await controller.close();
  const original = JSON.parse(await readFile(join(root, 'intake-origin.json'), 'utf8'));
  delete original.ordinaryProfile; await writeFile(join(root, 'intake-origin.json'), JSON.stringify(original), 'utf8');
  await assert.rejects(IntakeController.open({ root }), /profile|source|origin/i);
});
test('deleting both initial selectable profile fields cannot discard the write-once source', async t => {
  const { root, controller } = await ordinaryIntake(t); await controller.close();
  for (const name of ['snapshot.json', 'intake-origin.json']) {
    const path = join(root, name), value = JSON.parse(await readFile(path, 'utf8'));
    delete value.ordinaryProfile; await writeFile(path, JSON.stringify(value), 'utf8');
  }
  await assert.rejects(IntakeController.open({ root }), /profile|source/i);
});
