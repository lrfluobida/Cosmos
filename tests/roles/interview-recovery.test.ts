import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { requestDesignDraft, requestDesignQuestions } from '../../src/roles/interview.ts';
import { createProductHost } from '../../src/runtime/entrypoint-host.ts';
import { fileURLToPath } from 'node:url';
import { proposal, recoveryFixture } from './interview-recovery.fixture.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { preparationAcceptance } from '../../src/roles/requirements.ts';
import { resolveDraftMode } from '../../src/roles/preparation-mode.ts';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { reconcileEntryReceipts } from '../../src/runtime/entrypoint.ts';

test('settled reasoning-only truncation gets one same-input successor and reuses its completed reply', async t => {
  const f = await recoveryFixture(t, ['length', 'draft']);
  await assert.rejects(requestDesignDraft(f.options), /truncated/);
  const original = join(f.root, 'intake-sessions/draft-1'), names = await readdir(original);
  const originalFiles = await Promise.all(names.filter(name => name.endsWith('.json')).map(async name => [name, await readFile(join(original, name))] as const));
  const failed = await f.controller.read();
  assert.equal(failed.ledger.entries[0].settledMicroCny, 69_839); assert.equal(failed.ledger.entries[0].status, 'settled');
  assert.equal(failed.draft, null); assert.equal(failed.confirmation, null);
  const draft = await requestDesignDraft({ ...f.options, maxOutputTokens: 16384 });
  assert.deepEqual(draft.acceptance, proposal.acceptance); assert.equal(f.bodies.length, 2);
  assert.deepEqual(f.bodies[1].messages, f.bodies[0].messages);
  assert.equal(f.configs[1].context, f.configs[0].context); assert.equal(f.configs[1].systemPrompt, f.configs[0].systemPrompt);
  assert.equal(f.bodies[1].max_tokens, 16384);
  assert.deepEqual(await requestDesignDraft({ ...f.options, maxOutputTokens: 16384 }), draft); assert.equal(f.bodies.length, 2);
  for (const [name, bytes] of originalFiles) assert.ok((await readFile(join(original, name))).equals(bytes));
  const state = await f.controller.read();
  assert.deepEqual(state.ledger.entries[0], failed.ledger.entries[0]); assert.equal(state.requests.length, 2);
  assert.equal(state.run.runId, failed.run.runId); assert.equal(state.run.originalStartedAt, undefined);
  assert.equal(state.confirmation, null); assert.equal(state.ledger.limitMicroCny, 5_000_000);
});

test('ordinary product draft selects 16384 tokens while question cap stays 4096', async t => {
  const f = await recoveryFixture(t, ['questions', 'draft']);
  const host = createProductHost(fileURLToPath(new URL('../../', import.meta.url)), { sessionFactory: f.sessionFactory });
  const questions = await host.questions({ controller: f.controller, roundId: 'questions-1', brief: f.options.brief });
  await host.draft({ controller: f.controller, roundId: 'draft-1', brief: f.options.brief, questions, answers: f.options.answers });
  assert.deepEqual(f.configs.map(x => x.maxOutputTokens), [4096, 16384]);
});

for (const outcome of ['length', 'unknown'] as const) test(`a ${outcome} successor cannot start a third request`, async t => {
  const f = await recoveryFixture(t, ['length', outcome, 'draft']);
  await assert.rejects(requestDesignDraft(f.options), /truncated/);
  await assert.rejects(requestDesignDraft({ ...f.options, maxOutputTokens: 16384 }), /truncated|unknown/i);
  const before = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(requestDesignDraft({ ...f.options, maxOutputTokens: 16384 }), /successor|settled/i);
  assert.equal(f.bodies.length, 2); assert.ok((await readFile(join(f.root, 'snapshot.json'))).equals(before));
});

test('an unknown original response cannot obtain a successor', async t => {
  const f = await recoveryFixture(t, ['unknown', 'draft']);
  await assert.rejects(requestDesignDraft(f.options), /unknown/i);
  const before = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(requestDesignDraft({ ...f.options, maxOutputTokens: 16384 }), /settled/i);
  assert.equal(f.bodies.length, 1); assert.ok((await readFile(join(f.root, 'snapshot.json'))).equals(before));
});

test('original input and billing identity or charge drift never authorizes a successor', async t => {
  const f = await recoveryFixture(t, ['length', 'draft']);
  await assert.rejects(requestDesignDraft(f.options), /truncated/);
  const root = join(f.root, 'intake-sessions/draft-1'), name = (await readdir(root)).find(name => name.startsWith('billing-'))!;
  const path = join(root, name), bytes = await readFile(path), receipt = JSON.parse(bytes.toString('utf8')), snapshot = await readFile(join(f.root, 'snapshot.json'));
  for (const input of [{ brief: 'changed' }, { answers: { win: 'changed' } }, { capabilities: 'changed' }]) {
    await assert.rejects(requestDesignDraft({ ...f.options, ...input, maxOutputTokens: 16384 }), /identity|input/i);
  }
  for (const field of ['requestId', 'runId', 'ledgerId', 'taskId', 'provider', 'pricingVersion', 'admittedAt', 'stopReason', 'outcome', 'usage']) {
    const changed = structuredClone(receipt);
    if (field === 'usage') changed.usage.output++;
    else changed[field] = field === 'stopReason' ? 'stop' : field === 'outcome' ? 'unknown' : 'different';
    await writeFile(path, JSON.stringify(changed), 'utf8');
    await assert.rejects(requestDesignDraft({ ...f.options, maxOutputTokens: 16384 }), /receipt|charge|settled|length/i, field);
    await writeFile(path, bytes);
  }
  await writeFile(join(root, 'billing-other.json'), bytes);
  await assert.rejects(requestDesignDraft({ ...f.options, maxOutputTokens: 16384 }), /one original/i);
  await unlink(join(root, 'billing-other.json')); await unlink(path);
  await assert.rejects(requestDesignDraft({ ...f.options, maxOutputTokens: 16384 }), /one original/i);
  assert.equal(f.bodies.length, 1); assert.ok((await readFile(join(f.root, 'snapshot.json'))).equals(snapshot));
});

test('completed successor stays bound to the original receipt and its own intent', async t => {
  const f = await recoveryFixture(t, ['length', 'draft']);
  await assert.rejects(requestDesignDraft(f.options), /truncated/);
  await requestDesignDraft({ ...f.options, maxOutputTokens: 16384 });
  const root = join(f.root, 'intake-sessions/draft-1'), receiptPath = join(root, (await readdir(root)).find(name => name.startsWith('billing-'))!);
  const bytes = await readFile(receiptPath), receipt = JSON.parse(bytes.toString('utf8'));
  receipt.elapsedMs++; await writeFile(receiptPath, JSON.stringify(receipt), 'utf8');
  await assert.rejects(requestDesignDraft({ ...f.options, maxOutputTokens: 16384 }), /source changed/i);
  await writeFile(receiptPath, bytes);
  const path = join(f.root, 'intake-sessions/draft-1-successor-1/intent.json'), intent = JSON.parse(await readFile(path, 'utf8'));
  intent.predecessor.requestId = 'different'; await writeFile(path, JSON.stringify(intent), 'utf8');
  await assert.rejects(requestDesignDraft({ ...f.options, maxOutputTokens: 16384 }), /source changed/i);
  assert.equal(f.bodies.length, 2);
});

test('lost successor intent cannot discard an existing failed successor and start again', async t => {
  const f = await recoveryFixture(t, ['length', 'length', 'draft'], 500_000);
  await assert.rejects(requestDesignDraft(f.options), /truncated/);
  await assert.rejects(requestDesignDraft({ ...f.options, maxOutputTokens: 16384 }), /truncated/);
  await unlink(join(f.root, 'intake-sessions/draft-1-successor-1/intent.json'));
  await assert.rejects(requestDesignDraft({ ...f.options, maxOutputTokens: 16384 }), /successor/i);
  assert.equal(f.bodies.length, 2);
});

for (const gate of ['allocation', 'request-count']) test(`successor retains the original ${gate} admission gate`, async t => {
  const f = await recoveryFixture(t, ['length', 'draft'], gate === 'allocation' ? 100_000 : 250_000, gate === 'request-count' ? 1 : 8);
  await assert.rejects(requestDesignDraft(f.options), /truncated/);
  const before = await f.controller.read();
  await assert.rejects(requestDesignDraft({ ...f.options, maxOutputTokens: 16384 }), /admission/i);
  const after = await f.controller.read();
  assert.deepEqual(after.ledger, before.ledger); assert.deepEqual(after.requests, before.requests); assert.equal(f.bodies.length, 1);
  const estimate = f.estimates.at(-1)!;
  assert.equal(estimate.estimate, estimate.inputBytes * 2 + 16384 * 8);
  if (gate === 'allocation') assert.ok(estimate.estimate > 100_000 - 69_839);
  await assert.rejects(requestDesignDraft({ ...f.options, maxOutputTokens: 16384 }), /successor/i);
  assert.equal(f.bodies.length, 1);
});

test('question truncation keeps the original no-retry rule', async t => {
  const f = await recoveryFixture(t, ['length', 'questions']);
  await assert.rejects(requestDesignQuestions(f.options), /truncated/);
  await assert.rejects(requestDesignQuestions(f.options), /Incomplete interview/i);
  assert.equal(f.bodies.length, 1);
});

test('existing receipt recovery can settle a successor interrupted after its durable billing receipt', async t => {
  const f = await recoveryFixture(t, ['length', 'draft']);
  await assert.rejects(requestDesignDraft(f.options), /truncated/);
  const settle = f.controller.settle.bind(f.controller);
  f.controller.settle = async () => { throw new Error('Synthetic interruption after billing publication'); };
  try { await assert.rejects(requestDesignDraft({ ...f.options, maxOutputTokens: 16384 }), /accounting/i); }
  finally { f.controller.settle = settle; }
  assert.equal((await f.controller.read()).ledger.entries.at(-1)!.status, 'unknown');
  await reconcileEntryReceipts(f.root, f.controller);
  assert.equal((await f.controller.read()).ledger.entries.at(-1)!.status, 'settled');
  await assert.rejects(requestDesignDraft({ ...f.options, maxOutputTokens: 16384 }), /successor/i);
  assert.equal(f.bodies.length, 2);
});

test('preparation draft keeps its original cap and does not gain a successor', async t => {
  const parent = await mkdtemp(join(tmpdir(), 'cos110-preparation-')), root = join(parent, 'run');
  const mode = resolveDraftMode('cos16-input/1')!, controller = await IntakeController.create({ root, runId: 'prep', ledgerId: 'prep-ledger',
    specVersion: '1.0', interviewTaskId: 'intake', maxRequests: 8, allocations: [{ taskId: 'intake', amountMicroCny: 250_000 }], draftMode: 'cos16-input/1' });
  t.after(async () => { await controller.close(); await removeOwned(tmpdir(), parent); });
  let sessions = 0;
  const host = createProductHost(fileURLToPath(new URL('../../', import.meta.url)), { sessionFactory: async config => {
    assert.equal(config.maxOutputTokens, 8192); sessions++;
    return { async close() {}, async prompt() { return { text: JSON.stringify({ acceptance: preparationAcceptance(mode), unsupported: [] }) }; } };
  } });
  const input = { controller, roundId: 'draft-1', brief: '中文推箱子', questions: [{ id: 'scope', prompt: '范围？' }], answers: { scope: '原准备范围' } };
  await host.draft(input);
  await unlink(join(root, 'intake-sessions/draft-1/reply.json'));
  await assert.rejects(host.draft(input), /Incomplete interview/i);
  assert.equal(sessions, 1);
});
