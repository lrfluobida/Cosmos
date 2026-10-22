import assert from 'node:assert/strict';
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { requestDesignDraft } from '../../src/roles/interview.ts';
import { fakeInterviewSdk } from './interview-recovery.fixture.ts';
import type { Reply } from './interview-recovery.fixture.ts';
import { budgetFixture } from './interview-budget.fixture.ts';
import { ordinaryIntake, proposal, brief, questions, answers } from './ordinary.fixture.ts';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { fundedIntakeWork } from '../../src/runtime/public-validation-funding-validation.ts';
import { settlePublicValidationFunding } from '../../src/runtime/public-validation-funding.ts';
import { runCli } from '../../src/cli/index.ts';
import { ordinaryDraftProposal } from '../../src/roles/interview-draft.ts';
import { IntakeController, validateIntakeSnapshot } from '../../src/runtime/intake.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { RunController } from '../../src/runtime/run.ts';

const invalid = () => ({ ...structuredClone(proposal), experienceCriteria: proposal.experienceCriteria.map(item => ({ ...item, evidenceKinds: ['test_report'] })) });

async function setup(t: test.TestContext, funded = false, replies: Reply[] = ['draft', 'draft'], responses: unknown[] = [invalid(), proposal]) {
  if (funded) return budgetFixture(t, replies, undefined, () => responses.shift());
  const f = await ordinaryIntake(t), sdk = fakeInterviewSdk(t, replies, false, () => responses.shift());
  return { ...f, ...sdk, options: { controller: f.controller, roundId: 'draft-1', brief, questions, answers, maxOutputTokens: 16384,
    requestTimeoutMs: 5000, estimatedMaxCostMicroCny: 200_000, sessionFactory: sdk.sessionFactory } };
}
async function cachedFailure(f: Awaited<ReturnType<typeof setup>>) {
  const path = join(f.root, 'intake-answers/v1.json'), bytes = await readFile(path);
  await unlink(path);
  try { await assert.rejects(requestDesignDraft(f.options), /ENOENT/); }
  finally { await writeFile(path, bytes); }
  assert.equal(f.bodies.length, 1);
}

test('ordinary settled schema failure gets one complete correction and preserves the original reply', async t => {
  const f = await ordinaryIntake(t), responses = [invalid(), proposal];
  const sdk = fakeInterviewSdk(t, ['draft', 'draft'], false, () => responses.shift());
  const options = { controller: f.controller, roundId: 'draft-1', brief, questions, answers, maxOutputTokens: 16384,
    requestTimeoutMs: 5000, estimatedMaxCostMicroCny: 200_000, sessionFactory: sdk.sessionFactory };
  const draft = await requestDesignDraft(options);
  assert.deepEqual(draft.experienceCriteria, proposal.experienceCriteria);
  assert.deepEqual(draft.answers, answers); assert.equal(sdk.bodies.length, 2);
  const original = join(f.root, 'intake-sessions/draft-1/reply.json'), bytes = await readFile(original);
  assert.deepEqual(JSON.parse(bytes.toString('utf8')).proposal, invalid());
  assert.deepEqual(await requestDesignDraft(options), draft); assert.equal(sdk.bodies.length, 2);
  assert.ok((await readFile(original)).equals(bytes));
  const state = await f.controller.read();
  assert.equal(state.events.filter(event => event.type === 'intake_draft_successor_claimed').length, 1);
  assert.equal(state.requests.length, 2); assert.equal(state.confirmation, null);
  assert.deepEqual(state.ledger.allocations, [{ taskId: 'intake', amountMicroCny: 1_000_000 }, { taskId: 'planning', amountMicroCny: 1_000_000 }]);
});

test('funded cached-invalid draft retains source and funding history while correcting once', async t => {
  const f = await setup(t, true); await cachedFailure(f);
  const before = await f.controller.read(), original = await readFile(join(f.root, 'intake-sessions/draft-1/reply.json'));
  const draft = await requestDesignDraft(f.options), saved = await f.controller.saveDraft(draft);
  assert.equal(saved.revision, 1); assert.deepEqual(saved.answers, f.options.answers);
  assert.equal(f.bodies.length, 2); assert.equal(f.configs[1].systemPrompt, f.configs[0].systemPrompt); assert.equal(f.configs[1].context, f.configs[0].context);
  const user = f.bodies[1].messages.at(-1), input = JSON.parse(typeof user.content === 'string' ? user.content : user.content[0].text);
  assert.deepEqual(input.answers, f.options.answers); assert.deepEqual(input.questions, f.options.questions);
  assert.deepEqual(input.schemaCorrection.rejectedProposal, invalid()); assert.equal(input.schemaCorrection.diagnostic.code, 'experience_fields');
  assert.equal(input.schemaCorrection.native, undefined); assert.equal(f.bodies[1].tools, undefined);
  for (const body of f.bodies) assert.deepEqual(body.thinking, { type: 'disabled' });
  for (const config of f.configs) { assert.deepEqual(config.tools, []); assert.equal(config.maxRequests, 1); assert.equal(config.thinkingLevel, 'off'); }
  assert.ok((await readFile(join(f.root, 'intake-sessions/draft-1/reply.json'))).equals(original));
  const state = await f.controller.read();
  assert.deepEqual(state.ledger.entries[0], before.ledger.entries[0]); assert.deepEqual(state.validationFunding, before.validationFunding);
  assert.equal(state.events.filter(event => event.type === 'intake_draft_successor_claimed').length, 1);
  assert.equal(fundedIntakeWork(state).pending.length, 0); assert.equal(state.confirmation, null);
  assert.deepEqual(await requestDesignDraft(f.options), draft); assert.equal(f.bodies.length, 2);
  await f.controller.stop('Synthetic funded intake complete'); await f.controller.close();
  const closed = await readFile(join(f.root, 'snapshot.json'));
  const settlement = await settlePublicValidationFunding(state.validationFunding!);
  assert.equal(settlement.settledMicroCny, state.ledger.entries.reduce((sum, entry) => sum + entry.settledMicroCny, 0));
  assert.ok((await readFile(join(f.root, 'snapshot.json'))).equals(closed));
});

for (const funded of [false, true]) for (const outcome of ['draft', 'length', 'unknown', 'error'] as const) {
  test(`${funded ? 'funded' : 'ordinary'} ${outcome} correction failure cannot chain or regain its deleted slot`, async t => {
    const f = await setup(t, funded, ['draft', outcome, 'draft'], [invalid(), invalid(), proposal]);
    await assert.rejects(requestDesignDraft(f.options)); assert.equal(f.bodies.length, 2);
    await assert.rejects(requestDesignDraft(f.options)); assert.equal(f.bodies.length, 2);
    await removeOwned(tmpdir(), join(f.root, 'intake-sessions/draft-1-successor-1'));
    await assert.rejects(requestDesignDraft(f.options));
    await removeOwned(tmpdir(), join(f.root, 'intake-sessions/draft-1'));
    await assert.rejects(requestDesignDraft(f.options), /consumed|source/i);
    assert.equal(f.bodies.length, 2);
    assert.equal((await f.controller.read()).events.filter(event => event.type === 'intake_draft_successor_claimed').length, 1);
    assert.equal(fundedIntakeWork(await f.controller.read()).pending.length, 0);
  });
}

for (const failure of ['creation', 'publish', 'admission'] as const) test(`non-funded ${failure} failure consumes the slot before another provider dispatch`, async t => {
  const f = await setup(t); await cachedFailure(f);
  const claim = f.controller.claimDraftSuccessor.bind(f.controller);
  if (failure === 'publish') f.controller.claimDraftSuccessor = async (...args) => { await claim(...args); await writeFile(join(f.root, 'intake-sessions/draft-1-successor-1/intent.json'), '{}', 'utf8'); };
  const reserve = f.controller.reserve.bind(f.controller);
  if (failure === 'admission') f.controller.reserve = async () => { throw new Error('Synthetic admission failure'); };
  await assert.rejects(requestDesignDraft({ ...f.options, ...(failure === 'creation' ? { sessionFactory: async () => { throw new Error('Synthetic session creation failure'); } } : {}) }));
  f.controller.reserve = reserve; f.controller.claimDraftSuccessor = claim;
  assert.equal(f.bodies.length, 1);
  await removeOwned(tmpdir(), join(f.root, 'intake-sessions/draft-1-successor-1'));
  await assert.rejects(requestDesignDraft(f.options), /consumed/); assert.equal(f.bodies.length, 1);
});

test('schema successor refuses changed original configuration, input, native, billing and ambiguous files', async t => {
  const f = await setup(t); await cachedFailure(f);
  for (const changes of [{ brief: 'changed' }, { answers: { goal: 'changed' } }, { capabilities: 'changed' }, { maxOutputTokens: 8192 }]) {
    await assert.rejects(requestDesignDraft({ ...f.options, ...changes }), /identity/);
  }
  const original = join(f.root, 'intake-sessions/draft-1'), billingPath = join(original, (await readdir(original)).find(name => name.startsWith('billing-'))!);
  const billingBytes = await readFile(billingPath), billing = JSON.parse(billingBytes.toString('utf8'));
  for (const mutate of [
    (value: typeof billing) => { value.usage.output++; }, (value: typeof billing) => { value.request.inputBytes++; },
    (value: typeof billing) => { value.request.estimatedMaxCostMicroCny++; }, (value: typeof billing) => { value.stopReason = 'length'; },
    (value: typeof billing) => { value.request.modelId = 'other'; }, (value: typeof billing) => { value.runId = 'other'; },
  ]) {
    const changed = structuredClone(billing); mutate(changed); await writeFile(billingPath, JSON.stringify(changed), 'utf8');
    await assert.rejects(requestDesignDraft(f.options)); await writeFile(billingPath, billingBytes);
  }
  const nativePath = join(original, 'native', (await readdir(join(original, 'native')))[0]), nativeBytes = await readFile(nativePath);
  for (const row of [1, 2, 3, 4, 5]) {
    const rows = nativeBytes.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line));
    if (row === 1) rows[row].modelId = 'other'; else if (row === 2) rows[row].thinkingLevel = 'low';
    else if (row === 3) rows[row].message.sections.preamble += 'changed';
    else if (row === 4) rows[row].message.content[0].text += 'changed'; else rows[row].message.content[0].text = JSON.stringify(proposal);
    await writeFile(nativePath, rows.map(value => JSON.stringify(value)).join('\n') + '\n', 'utf8');
    await assert.rejects(requestDesignDraft(f.options)); await writeFile(nativePath, nativeBytes);
  }
  await writeFile(join(original, 'billing-other.json'), billingBytes);
  await assert.rejects(requestDesignDraft(f.options)); await unlink(join(original, 'billing-other.json'));
  assert.equal(f.bodies.length, 1); assert.equal((await f.controller.read()).events.filter(event => event.type === 'intake_draft_successor_claimed').length, 0);
  await requestDesignDraft(f.options); assert.equal(f.bodies.length, 2);
  await writeFile(nativePath, nativeBytes.toString('utf8') + '\n', 'utf8');
  await assert.rejects(requestDesignDraft(f.options)); assert.equal(f.bodies.length, 2);
});

test('cached correction must still match its own complete native response and settled receipt', async t => {
  const f = await setup(t); await requestDesignDraft(f.options);
  const path = join(f.root, 'intake-sessions/draft-1-successor-1/reply.json'), bytes = await readFile(path), value = JSON.parse(bytes.toString('utf8'));
  value.proposal.acceptance[0].expected = '伪造结果'; await writeFile(path, JSON.stringify(value), 'utf8');
  await assert.rejects(requestDesignDraft(f.options), /source/); assert.equal(f.bodies.length, 2);
  await writeFile(path, bytes); await unlink(join(f.root, 'intake-sessions/draft-1-successor-1', (await readdir(join(f.root, 'intake-sessions/draft-1-successor-1'))).find(name => name.startsWith('billing-'))!));
  await assert.rejects(requestDesignDraft(f.options)); assert.equal(f.bodies.length, 2);
});

test('a valid-looking replacement of the original rejected reply cannot bypass the saved claim', async t => {
  const f = await setup(t); await requestDesignDraft(f.options);
  const path = join(f.root, 'intake-sessions/draft-1/reply.json'), value = JSON.parse(await readFile(path, 'utf8'));
  value.proposal = proposal; await writeFile(path, JSON.stringify(value), 'utf8');
  await assert.rejects(requestDesignDraft(f.options), /source/); assert.equal(f.bodies.length, 2);
});

test('concurrent ordinary resumes claim one slot before creating a correction session', async t => {
  const f = await setup(t); await cachedFailure(f);
  const results = await Promise.allSettled([requestDesignDraft(f.options), requestDesignDraft(f.options)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(f.bodies.length, 2);
  assert.equal((await f.controller.read()).events.filter(event => event.type === 'intake_draft_successor_claimed').length, 1);
});

test('source drift after initial eligibility is rejected before publication or dispatch', async t => {
  const f = await setup(t); await cachedFailure(f);
  const begin = f.controller.beginFundingWork.bind(f.controller), path = join(f.root, 'intake-sessions/draft-1/reply.json');
  const bytes = await readFile(path); let checked = false;
  f.controller.beginFundingWork = async kind => { const result = await begin(kind); checked = true; await writeFile(path, bytes.toString('utf8') + '\n', 'utf8'); return result; };
  await assert.rejects(requestDesignDraft(f.options), /source/); assert.equal(checked, true); assert.equal(f.bodies.length, 1);
  f.controller.beginFundingWork = begin;
  assert.equal((await f.controller.read()).events.filter(event => event.type === 'intake_draft_successor_claimed').length, 0);
});

for (const gate of ['later-request', 'stopped', 'request-count'] as const) test(`${gate} blocks a cached schema failure without a new transport`, async t => {
  const f = await setup(t); await cachedFailure(f);
  if (gate === 'stopped') await f.controller.stop('Synthetic closed intake');
  else if (gate === 'later-request') {
    await f.controller.reserve({ requestId: 'later', taskId: 'intake', provider: 'deepseek', pricingVersion: 'deepseek-flash-peak-cny-2026-10-01', estimatedMaxCostMicroCny: 1 });
    await f.controller.admit('later'); await f.controller.settle('later', 1, [{ artifactId: 'later', version: 'v1', location: 'synthetic' }]);
  } else {
    const reserve = f.controller.reserve.bind(f.controller);
    f.controller.reserve = async () => { throw new Error('Intake request limit or task identity refused.'); };
    await assert.rejects(requestDesignDraft(f.options), /admission/); f.controller.reserve = reserve;
  }
  await assert.rejects(requestDesignDraft(f.options)); assert.equal(f.bodies.length, 1);
});

test('old completed length successor without a claim keeps its original evidence rule without backfill', async t => {
  const f = await setup(t, false, ['length', 'draft'], [proposal]);
  await assert.rejects(requestDesignDraft(f.options), /truncated/); const draft = await requestDesignDraft(f.options);
  const state = await f.controller.read(); await f.controller.close();
  state.events = state.events.filter(event => event.type !== 'intake_draft_successor_claimed').map((event, index) => ({ ...event, sequence: index + 1 }));
  await writeFile(join(f.root, 'snapshot.json'), JSON.stringify(state), 'utf8');
  const reopened = await IntakeController.open({ root: f.root });
  try {
    assert.deepEqual(await requestDesignDraft({ ...f.options, controller: reopened }), draft);
    assert.equal((await reopened.read()).events.filter(event => event.type === 'intake_draft_successor_claimed').length, 0);
  } finally { await reopened.close(); }
  assert.equal(f.bodies.length, 2);
});

test('schema failure cannot follow a length successor', async t => {
  const f = await setup(t, false, ['length', 'draft', 'draft'], [invalid(), proposal]);
  await assert.rejects(requestDesignDraft(f.options), /truncated/);
  await assert.rejects(requestDesignDraft(f.options), /experience/);
  await assert.rejects(requestDesignDraft(f.options), /experience/); assert.equal(f.bodies.length, 2);
});

test('valid unsupported and host-stage violations never trigger schema requests', async t => {
  const f = await setup(t, false, ['draft'], [{ ...proposal, unsupported: ['原需求需要动态视觉决策'] }]);
  assert.deepEqual((await requestDesignDraft(f.options)).unsupported, ['原需求需要动态视觉决策']); assert.equal(f.bodies.length, 1);
  const shape = ordinaryDraftProposal({ ...proposal, codeProfile: 'modular-code/1', acceptance: null }, { brief, questions, answers });
  assert.equal(shape.ok, false);
  assert.throws(() => ordinaryDraftProposal({ ...proposal, acceptance: [{ ...proposal.acceptance[0], acceptanceId: 'COSMOS-DESIGN' }] }, { brief, questions, answers }), /Host stage/);
  assert.throws(() => ordinaryDraftProposal({ ...proposal, acceptance: [proposal.acceptance[0], proposal.acceptance[0]] }, { brief, questions, answers }), /acceptance/);
});

test('serial duplicate claims are rejected and the one event survives activation and runtime stop', async t => {
  const f = await setup(t); const draft = await requestDesignDraft(f.options), before = await f.controller.read();
  const claim = JSON.parse(before.events.find(event => event.type === 'intake_draft_successor_claimed')!.reason);
  const results = await Promise.allSettled([f.controller.claimDraftSuccessor(claim, before.revision), f.controller.claimDraftSuccessor(claim, before.revision)]);
  assert.ok(results.every(result => result.status === 'rejected'));
  const saved = await f.controller.saveDraft(draft);
  await f.controller.confirm({ revision: saved.revision, confirmed: true, actorId: 'real-test-user', at: new Date().toISOString() });
  await assert.rejects(requestDesignDraft(f.options), /source/);
  const active = await f.controller.activateGeneration({ environmentReady: true, executionReady: true }); validateSnapshot(active);
  assert.equal(active.events.filter(event => event.type === 'intake_draft_successor_claimed').length, 1);
  await f.controller.close(); const run = await RunController.open({ root: f.root });
  try { await run.stop('Retain synthetic accounting and claim'); validateSnapshot(await run.read()); } finally { await run.close(); }
  const corrupted = structuredClone(before); corrupted.events.push({ ...corrupted.events.find(event => event.type === 'intake_draft_successor_claimed')!, sequence: corrupted.events.length + 1 });
  assert.throws(() => validateIntakeSnapshot(corrupted), /duplicate/);
});

test('public resume corrects the saved ordinary answers and still waits for actual current revision confirmation', async t => {
  const f = await setup(t); await cachedFailure(f); await f.controller.close();
  const output = new PassThrough(); let text = ''; output.on('data', chunk => { text += chunk; });
  await runCli(['resume', f.root], { input: Readable.from(['cancel\n']), output, host: {
    ordinaryProfile: 'ordinary-design/1', async prepare() { return { environmentReady: true, executionReady: true }; },
    async questions() { return questions; }, async draft(input) { return requestDesignDraft({ ...f.options, ...input }); },
    async execute() { throw new Error('No real confirmation was supplied'); },
  } });
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.match(text, /confirm 1/); assert.equal(state.confirmation, null); assert.equal(state.run.originalStartedAt, undefined);
  assert.equal(state.draft.revision, 1); assert.deepEqual(state.draft.answers, answers); assert.equal(f.bodies.length, 2);
  const reopened = await IntakeController.open({ root: f.root }); await reopened.stop('Synthetic cleanup'); await reopened.close();
});
