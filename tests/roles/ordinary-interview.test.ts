import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { requestDesignDraft, requestDesignQuestions } from '../../src/roles/interview.ts';
import { fakeInterviewSdk } from './interview-recovery.fixture.ts';
import { ordinaryIntake, proposal, profile, brief, questions, answers } from './ordinary.fixture.ts';

async function setup(t: test.TestContext, replies: Parameters<typeof fakeInterviewSdk>[1], response: unknown = proposal) {
  const f = await ordinaryIntake(t), sdk = fakeInterviewSdk(t, replies, false, response);
  return { ...f, ...sdk, options: { controller: f.controller, roundId: 'draft-1', brief, questions, answers,
    maxOutputTokens: 16384, requestTimeoutMs: 5000, estimatedMaxCostMicroCny: 200_000, sessionFactory: sdk.sessionFactory } };
}
test('ordinary draft sends disabled thinking through the real Pi transport and preserves complete intent', async t => {
  const f = await setup(t, ['draft']);
  const draft = await requestDesignDraft(f.options);
  assert.equal(draft.ordinaryProfile, profile); assert.equal(draft.scenario, undefined);
  assert.deepEqual(draft.experienceCriteria, proposal.experienceCriteria); assert.deepEqual(draft.answers, answers);
  assert.deepEqual(f.bodies[0].thinking, { type: 'disabled' }); assert.equal(f.bodies[0].reasoning_effort, undefined);
  assert.equal(f.bodies[0].max_tokens, 16384);
  const intent = JSON.parse(await readFile(join(f.root, 'intake-sessions/draft-1/intent.json'), 'utf8'));
  assert.equal(intent.ordinaryProfile, profile); assert.equal(intent.requestConfig.thinkingLevel, 'off');
  assert.deepEqual(intent.input.answers, answers);
  assert.match(f.configs[0].systemPrompt, /experienceCriteria/); assert.match(f.configs[0].systemPrompt, /unsupported/);
  assert.deepEqual(await requestDesignDraft(f.options), draft); assert.equal(f.bodies.length, 1);
});
test('ordinary questions retain low thinking and cannot inject draft authority', async t => {
  const f = await setup(t, ['questions']);
  await requestDesignQuestions({ ...f.options, roundId: 'questions-1', maxOutputTokens: 4096 });
  assert.deepEqual(f.bodies[0].thinking, { type: 'enabled' }); assert.equal(f.bodies[0].reasoning_effort, 'low');
  assert.equal(f.bodies[0].max_tokens, 4096);
});
test('ordinary draft prompt distinguishes excluded features from unsupported requests', async t => {
  const f = await setup(t, ['draft']);
  const excluded = { goal: '仅用鼠标；排除键盘、触摸、外部联网和计时。' };
  await requestDesignDraft({ ...f.options, answers: excluded });
  assert.match(f.configs[0].systemPrompt, /Only list capabilities the user actually requests and the current capabilities cannot support in unsupported/);
  assert.match(f.configs[0].systemPrompt, /Keep explicitly excluded features as exclusions; do not list them in unsupported/);
  assert.ok(f.configs[0].context); assert.deepEqual(JSON.parse(f.configs[0].context).input.answers, excluded);
});
test('ordinary settled length reuses the original single successor and cache with identical off configuration', async t => {
  const f = await setup(t, ['length', 'draft']);
  await assert.rejects(requestDesignDraft(f.options));
  const first = await f.controller.read(), draft = await requestDesignDraft(f.options);
  assert.equal(draft.ordinaryProfile, profile); assert.equal(f.bodies.length, 2);
  for (const body of f.bodies) { assert.deepEqual(body.thinking, { type: 'disabled' }); assert.equal(body.reasoning_effort, undefined); }
  assert.deepEqual(await requestDesignDraft(f.options), draft); assert.equal(f.bodies.length, 2);
  assert.deepEqual((await f.controller.read()).ledger.entries[0], first.ledger.entries[0]);
});
test('ordinary successor failure cannot create a third request', async t => {
  const f = await setup(t, ['length', 'length']);
  await assert.rejects(requestDesignDraft(f.options)); await assert.rejects(requestDesignDraft(f.options));
  const before = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(requestDesignDraft(f.options), /successor/i);
  assert.equal(f.bodies.length, 2); assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
});
for (const field of ['ordinaryProfile', 'requestConfig']) test(`ordinary cached request rejects ${field} drift before another transport`, async t => {
  const f = await setup(t, ['length']);
  await assert.rejects(requestDesignDraft(f.options));
  const path = join(f.root, 'intake-sessions/draft-1/intent.json'), intent = JSON.parse(await readFile(path, 'utf8'));
  if (field === 'ordinaryProfile') delete intent.ordinaryProfile;
  else intent.requestConfig = { ...intent.requestConfig, thinkingLevel: 'low' };
  await writeFile(path, JSON.stringify(intent), 'utf8');
  await assert.rejects(requestDesignDraft(f.options), /identity|input/i); assert.equal(f.bodies.length, 1);
});
for (const injected of [{ ordinaryProfile: profile }, { confirmed: true }, { scenario: {} }]) test(`ordinary model cannot inject ${Object.keys(injected)[0]}`, async t => {
  const f = await setup(t, ['draft', 'draft'], { ...proposal, ...injected });
  await assert.rejects(requestDesignDraft(f.options), /fields/i);
  assert.equal((await f.controller.read()).confirmation, null);
});
