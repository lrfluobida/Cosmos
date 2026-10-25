import assert from 'node:assert/strict';
import { link, mkdir, readFile, readdir, rename, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { normalizeContext } from '@earendil-works/pi-ai';
import { convertToLlm } from '@earendil-works/pi-coding-agent';
import { requestInputBytes } from '../../src/providers/request-input.ts';
import { requestDesignDraft } from '../../src/roles/interview.ts';
import { withHostStages } from '../../src/roles/requirements.ts';
import { ordinaryDraftSha256 } from '../../src/runtime/ordinary-profile-source.ts';
import { fakeInterviewSdk, type Reply } from './interview-recovery.fixture.ts';
import { ordinaryIntake, ordinaryDraft, proposal, profile, brief, questions } from './ordinary.fixture.ts';
import { budgetFixture } from './interview-budget.fixture.ts';

const revisedAnswers = { goal: '只把完成文字改成已完成；其余要求保留。' };
async function setup(t: test.TestContext, replies: Reply[] = ['draft'], responses: unknown[] = [proposal]) {
  const f = await ordinaryIntake(t), previous = withHostStages(ordinaryDraft());
  await f.controller.saveDraft(previous);
  await writeFile(join(f.root, 'intake-answers/v2.json'), JSON.stringify({ brief, questions, answers: revisedAnswers, ordinaryProfile: profile }), 'utf8');
  const sdk = fakeInterviewSdk(t, replies, false, () => responses.shift());
  return { ...f, ...sdk, previous, options: { controller: f.controller, roundId: 'draft-2', brief, questions, answers: revisedAnswers,
    maxOutputTokens: 16384, requestTimeoutMs: 5000, estimatedMaxCostMicroCny: 200_000, sessionFactory: sdk.sessionFactory } };
}
const json = async (root: string, path: string) => JSON.parse(await readFile(join(root, path), 'utf8'));

test('new ordinary edit binds only generated proposal fields and reuses its cache at later revisions', async t => {
  const f = await setup(t), bytes = await readFile(join(f.root, 'requirements/v1/draft.json'));
  const result = await requestDesignDraft(f.options), intent = await json(f.root, 'intake-sessions/draft-2/intent.json');
  assert.equal(intent.formatVersion, 2);
  assert.equal(intent.editContext.previousRevision, 1); assert.equal(intent.editContext.previousDraftSha256, ordinaryDraftSha256(bytes));
  assert.equal(intent.editContext.formatVersion, 'ordinary-draft-edit/1');
  assert.deepEqual(intent.editContext.proposal, proposal);
  assert.match(intent.editContext.instruction, /unconfirmed/); assert.match(intent.editContext.instruction, /current/i);
  assert.deepEqual(JSON.parse(f.configs[0].context!).editContext, intent.editContext);
  assert.deepEqual(intent.input, { phase: 'draft', brief, questions, answers: revisedAnswers });
  assert.deepEqual(result.answers, revisedAnswers); assert.equal('editContext' in result, false);
  await f.controller.saveDraft(result);
  assert.deepEqual(await requestDesignDraft(f.options), result);
  await writeFile(join(f.root, 'intake-answers/v3.json'), JSON.stringify({ brief, questions, answers: revisedAnswers, ordinaryProfile: profile }), 'utf8');
  await f.controller.saveDraft(result);
  assert.deepEqual(await requestDesignDraft(f.options), result); assert.equal(f.bodies.length, 1);
  assert.ok((await readFile(join(f.root, 'requirements/v1/draft.json'))).equals(bytes));
});

test('confirmation binds only the current full draft and cache reuse cannot authorize another edit', async t => {
  const f = await setup(t), draft = await requestDesignDraft(f.options); await f.controller.saveDraft(draft);
  await assert.rejects(f.controller.confirm({ revision: 1, confirmed: true, actorId: 'fixture-user', at: new Date().toISOString() }), /current draft revision/);
  const requirement = await f.controller.confirm({ revision: 2, confirmed: true, actorId: 'fixture-user', at: new Date().toISOString() });
  const state = await f.controller.read(), receipt = await json(f.root, state.confirmation!.source.location);
  assert.deepEqual(requirement.acceptance, draft.acceptance); assert.equal('editContext' in requirement, false);
  assert.equal(receipt.ordinaryDraftSha256, ordinaryDraftSha256(await readFile(join(f.root, 'requirements/v2/draft.json'))));
  assert.equal('editContext' in receipt, false); assert.equal('proposal' in receipt, false);
  assert.deepEqual(await requestDesignDraft(f.options), draft);
  await assert.rejects(requestDesignDraft({ ...f.options, roundId: 'draft-3' }), /edit source/);
  assert.equal(f.bodies.length, 1); assert.equal('originalStartedAt' in state.run, false);
});

for (const failure of ['revision', 'confirmed', 'stopped', 'aborted', 'missing', 'draft', 'answers', 'origin', 'profile', 'utf8', 'hardlink', 'junction'] as const) {
  test(`new edit refuses ${failure} before creating a session`, async t => {
    const f = await setup(t), path = join(f.root, 'requirements/v1/draft.json');
    if (failure === 'revision') f.options.roundId = 'draft-3';
    else if (failure === 'confirmed') await f.controller.confirm({ revision: 1, confirmed: true, actorId: 'fixture-user', at: new Date().toISOString() });
    else if (failure === 'stopped') await f.controller.stop('Fixture stop');
    else if (failure === 'aborted') await f.controller.close();
    else if (failure === 'missing') await unlink(path);
    else if (failure === 'utf8') await writeFile(path, Buffer.from([0xff]));
    else if (failure === 'hardlink') await link(path, join(f.root, 'linked-draft.json'));
    else if (failure === 'junction') {
      await rename(join(f.root, 'requirements/v1'), join(f.root, 'linked'));
      await symlink(join(f.root, 'linked'), join(f.root, 'requirements/v1'), 'junction');
    } else {
      const target = failure === 'draft' ? 'requirements/v1/draft.json' : failure === 'answers' ? 'intake-answers/v1.json'
        : failure === 'origin' ? 'intake-origin.json' : 'intake-ordinary-profile.json';
      const changed = await json(f.root, target);
      if (failure === 'draft') changed.acceptance[0].expected = 'changed';
      else if (failure === 'answers') changed.answers.goal = 'changed';
      else if (failure === 'origin') changed.brief = 'changed';
      else changed.runId = 'changed';
      await writeFile(join(f.root, target), JSON.stringify(changed), 'utf8');
    }
    const snapshot = await readFile(join(f.root, 'snapshot.json'));
    await assert.rejects(requestDesignDraft(f.options));
    assert.equal(f.configs.length, 0); assert.equal(f.bodies.length, 0);
    assert.ok((await readFile(join(f.root, 'snapshot.json'))).equals(snapshot));
  });
}

test('new edit schema correction retains context and the original answers through its single successor', async t => {
  const invalid = { ...proposal, experienceCriteria: [{ ...proposal.experienceCriteria[0], evidenceKinds: ['test_report'] }] };
  const f = await setup(t, ['draft', 'draft'], [invalid, proposal]);
  const bytes = await readFile(join(f.root, 'intake-answers/v2.json'));
  const result = await requestDesignDraft(f.options);
  assert.equal(JSON.parse(f.configs[0].context!).editContext.previousRevision, 1);
  assert.equal(f.configs[0].context, f.configs[1].context); assert.equal(f.configs[0].systemPrompt, f.configs[1].systemPrompt);
  const content = f.bodies[1].messages.at(-1).content, input = JSON.parse(typeof content === 'string' ? content : content[0].text);
  assert.deepEqual(input.answers, revisedAnswers); assert.equal('editContext' in input, false); assert.ok(input.schemaCorrection);
  assert.ok((await readFile(join(f.root, 'intake-answers/v2.json'))).equals(bytes));
  assert.deepEqual(await requestDesignDraft(f.options), result); assert.equal(f.bodies.length, 2);
  assert.equal((await f.controller.read()).events.filter(event => event.type === 'intake_draft_successor_claimed').length, 1);
});

test('new edit length failure shares one successor and cannot send a third request', async t => {
  const f = await setup(t, ['length', 'length']);
  await assert.rejects(requestDesignDraft(f.options)); await assert.rejects(requestDesignDraft(f.options));
  assert.equal(JSON.parse(f.configs[0].context!).editContext.previousRevision, 1);
  assert.equal(f.configs[0].context, f.configs[1].context);
  await assert.rejects(requestDesignDraft(f.options)); assert.equal(f.bodies.length, 2);
});

test('cached edit rejects changed previous bytes and altered intent bindings without another session', async t => {
  const f = await setup(t); const result = await requestDesignDraft(f.options); await f.controller.saveDraft(result);
  const path = join(f.root, 'requirements/v1/draft.json'), bytes = await readFile(path);
  await writeFile(path, Buffer.concat([bytes, Buffer.from(' ')]));
  await assert.rejects(requestDesignDraft(f.options)); await writeFile(path, bytes);
  const intentPath = join(f.root, 'intake-sessions/draft-2/intent.json'), intent = await json(f.root, 'intake-sessions/draft-2/intent.json');
  for (const change of [
    { ...intent, formatVersion: 3 }, { ...intent, editContext: undefined },
    { ...intent, editContext: { ...intent.editContext, previousRevision: 2 } },
    { ...intent, editContext: { ...intent.editContext, proposal: { ...proposal, extra: true } } },
  ]) {
    await writeFile(intentPath, JSON.stringify(change), 'utf8'); await assert.rejects(requestDesignDraft(f.options));
  }
  assert.equal(f.configs.length, 1); assert.equal(f.bodies.length, 1);
});

test('old round cannot dispatch again after a new revision replaces the bound previous draft', async t => {
  const f = await setup(t, ['length', 'draft']); await assert.rejects(requestDesignDraft(f.options));
  await f.controller.saveDraft({ ...ordinaryDraft(), answers: revisedAnswers });
  await assert.rejects(requestDesignDraft(f.options)); assert.equal(f.bodies.length, 1);
  assert.equal((await f.controller.read()).events.filter(event => event.type === 'intake_draft_successor_claimed').length, 0);
});

test('edit projection retains optional proposal fields and excludes all fixed host stages and metadata', async t => {
  const f = await ordinaryIntake(t);
  const previous = withHostStages({ ...ordinaryDraft(), codeProfile: 'modular-code/1', benchmark: 'classic-pc-runtime-policy/1',
    classicEntry: { formatVersion: 'classic-entry-selection/1', referenceId: 'synthetic', referenceSha256: 'a'.repeat(64), catalogSha256: 'b'.repeat(64),
      measurement: null, entryLabel: null, entityLabel: null, evidence: [], reason: 'no_reference_measurements' }, unsupported: ['旧候选的能力判断'] });
  await f.controller.saveDraft(previous);
  const sdk = fakeInterviewSdk(t, ['draft'], false, proposal);
  const result = await requestDesignDraft({ controller: f.controller, roundId: 'draft-2', brief, questions, answers: revisedAnswers,
    maxOutputTokens: 16384, requestTimeoutMs: 5000, estimatedMaxCostMicroCny: 200_000, sessionFactory: sdk.sessionFactory });
  const projected = JSON.parse(sdk.configs[0].context!).editContext.proposal;
  assert.deepEqual(projected, { ...proposal, codeProfile: 'modular-code/1', benchmark: 'classic-pc-runtime-policy/1', unsupported: previous.unsupported });
  assert.deepEqual(result.unsupported, []); assert.equal('benchmark' in result, false); assert.equal(result.codeProfile, undefined);
  assert.deepEqual(Object.keys(result).sort(), ['acceptance', 'answers', 'brief', 'experienceCriteria', 'ordinaryProfile', 'questions', 'unsupported']);
});

for (const successor of [false, true]) test(`edit rechecks changed source before ${successor ? 'claiming its successor' : 'creating its session'}`, async t => {
  const f = await setup(t, successor ? ['length', 'draft'] : ['draft']);
  if (successor) await assert.rejects(requestDesignDraft(f.options));
  const before = await f.controller.read(), begin = f.controller.beginFundingWork.bind(f.controller);
  f.controller.beginFundingWork = async (...args) => {
    const work = await begin(...args), path = join(f.root, 'requirements/v1/draft.json');
    await writeFile(path, Buffer.concat([await readFile(path), Buffer.from(' ')])); return work;
  };
  await assert.rejects(requestDesignDraft(f.options), /edit source/i);
  const after = await f.controller.read();
  assert.deepEqual(after.ledger, before.ledger); assert.equal(f.configs.length, successor ? 1 : 0);
  assert.equal(after.events.filter(event => event.type === 'intake_draft_successor_claimed').length, 0);
});

for (const residue of ['original', 'successor'] as const) test(`missing original intent with ${residue} residue cannot become a new edit`, async t => {
  const f = await setup(t), directory = join(f.root, `intake-sessions/draft-2${residue === 'successor' ? '-successor-1' : ''}`);
  await mkdir(directory, { recursive: true }); await writeFile(join(directory, 'retained.json'), '{}', 'utf8');
  await assert.rejects(requestDesignDraft(f.options), /source is missing/); assert.equal(f.configs.length, 0);
});

test('new edit cannot regain a persistently claimed successor after deleting its request records', async t => {
  const f = await setup(t, ['length', 'length']);
  await assert.rejects(requestDesignDraft(f.options)); await assert.rejects(requestDesignDraft(f.options));
  await unlink(join(f.root, 'intake-sessions/draft-2/intent.json'));
  await assert.rejects(requestDesignDraft(f.options), /slot was consumed/); assert.equal(f.bodies.length, 2);
});

async function fundedEdit(t: test.TestContext) {
  const f = await budgetFixture(t);
  await f.controller.saveDraft({ ...ordinaryDraft(), brief: f.options.brief });
  const options = { ...f.options, roundId: 'draft-2', answers: revisedAnswers };
  await writeFile(join(f.root, 'intake-answers/v2.json'), JSON.stringify({ brief: options.brief, questions, answers: revisedAnswers, ordinaryProfile: profile }), 'utf8');
  return { ...f, options };
}
async function normalizedInput(root: string) {
  const directory = join(root, 'intake-sessions/draft-2/native'), path = join(directory, (await readdir(directory))[0]);
  const rows = (await readFile(path, 'utf8')).trimEnd().split('\n').map(line => JSON.parse(line));
  const messages = rows.filter(row => row.type === 'message' && ['system', 'user'].includes(row.message.role)).map(row => row.message);
  return { messages, bytes: requestInputBytes(normalizeContext({ messages: convertToLlm(messages) })) };
}

test('edit context is included in actual normalized SDK input and the original bounded output quote', async t => {
  const f = await fundedEdit(t); await f.spend(120_000); const before = await f.controller.read();
  await requestDesignDraft(f.options);
  const normalized = await normalizedInput(f.root), quote = f.estimates.at(-1)!;
  assert.equal(quote.inputBytes, normalized.bytes); assert.equal(f.bodies[0].max_tokens, quote.maxOutputTokens);
  assert.ok(quote.maxOutputTokens >= 8192 && quote.maxOutputTokens < 16384);
  const context = JSON.parse(f.configs[0].context!); assert.ok(context.editContext); delete context.editContext;
  normalized.messages[0].sections.preamble = `${f.configs[0].systemPrompt}\n\n${JSON.stringify(context)}`;
  assert.ok(requestInputBytes(normalizeContext({ messages: convertToLlm(normalized.messages) })) < quote.inputBytes);
  assert.deepEqual((await f.controller.read()).ledger.allocations, before.ledger.allocations);
});

test('context bytes can make the unchanged minimum output unaffordable without dispatch or new budget', async t => {
  const f = await fundedEdit(t), allocations = (await f.controller.read()).ledger.allocations;
  let previousFloor = 0, editFloor = 0;
  const sessionFactory: typeof f.sessionFactory = async config => {
    const select = config.requestOutputLimit!;
    config.requestOutputLimit = async request => {
      const normalized = await normalizedInput(f.root); assert.equal(request.inputBytes, normalized.bytes);
      const context = JSON.parse(config.context!); assert.ok(context.editContext); delete context.editContext;
      normalized.messages[0].sections.preamble = `${config.systemPrompt}\n\n${JSON.stringify(context)}`;
      previousFloor = f.options.estimatedMaxCostMicroCny({ inputBytes: requestInputBytes(normalizeContext({ messages: convertToLlm(normalized.messages) })), maxOutputTokens: 8192 });
      editFloor = f.options.estimatedMaxCostMicroCny({ ...request, maxOutputTokens: 8192 });
      assert.ok(editFloor > previousFloor + 1);
      await f.spend(250_000 - previousFloor - 1); return select(request);
    };
    return f.sessionFactory(config);
  };
  await assert.rejects(requestDesignDraft({ ...f.options, sessionFactory }), /output limit authority rejected/i);
  assert.ok(editFloor > previousFloor); assert.equal(f.bodies.length, 0);
  const state = await f.controller.read(); assert.equal(state.requests.length, 1); assert.deepEqual(state.ledger.allocations, allocations);
  assert.equal(state.confirmation, null); assert.equal('originalStartedAt' in state.run, false);
});
