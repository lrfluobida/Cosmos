import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';
import { createPiSession } from '../../src/providers/pi.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';
import { readRunSnapshot } from '../../src/cli/control.ts';
import { decodeModelJson } from '../../src/roles/protocol.ts';
import { TaskJournal, RecoveryBlocked } from '../../src/runtime/recovery/task-journal.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { authorCorrectionPolicy } from '../../src/runtime/entrypoint-successors.ts';

const proposal = { summary: 'Controlled source fixture only', remaining: [], uncertainty: [] };
const strictReply = JSON.stringify(proposal);
const proseReply = `Self-check passes with both deliverables in place.\n${strictReply}`;

async function fixture(t: TestContext, firstReply: string, correctionReply = strictReply, fault?: string) {
  const payloads: any[] = [], configs: PiSessionOptions[] = [], stages: string[] = [];
  let f!: Awaited<ReturnType<typeof ordinaryHostFixture>>;
  const fetch = t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    assert.equal(new URL(request.url).origin, 'https://api.deepseek.com', 'No non-fixture provider route is permitted');
    const payload = JSON.parse(await request.text()); payloads.push(payload);
    assert.ok(payloads.length <= 2, 'A third design transport is forbidden');
    const state = await readRunSnapshot(f.root), entry = state.ledger.entries.at(-1)!;
    assert.equal(entry.taskId, 'design-task'); assert.equal(entry.status, 'reserved');
    const chunk = { id: `cos128-${payloads.length}`, model: 'deepseek-flash', choices: [{ index: 0,
      delta: { content: payloads.length === 1 ? firstReply : correctionReply }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 30, completion_tokens: fault === 'budget' ? 18000 : 10, total_tokens: fault === 'budget' ? 18030 : 40 } };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  t.after(() => fetch.mock.restore());
  f = await ordinaryHostFixture(t, { productionDefault: true, fault,
    ...(fault === 'budget' ? { limits: { limitMicroCny: 1_500_000, durationMs: 12 * 60 * 60 * 1000 } } : {}), sessionFactory: async (config, fallback) => {
    const packet = JSON.parse(config.context); configs.push(config);
    if (packet.role === 'art') throw new Error('COS128 fixture cutoff after design review; no game generation');
    if (packet.role === 'reviewer') {
      assert.equal(packet.taskId, 'design-task');
      const captured = JSON.parse(await readFile(join(f.root, 'journal/task-design-task/capture.json'), 'utf8'));
      const verified = JSON.parse(await readFile(join(f.root, 'journal/task-design-task/verified.json'), 'utf8'));
      assert.ok(captured.value.captured.artifacts.length); assert.ok(verified.value.evidence.length);
      stages.push('capture', 'verify', 'review'); return fallback;
    }
    if (packet.role !== 'design') return fallback;
    const native = await createPiSession({ ...config, env: { DEEPSEEK_API_KEY: 'offline-cos128' } });
    return { ...native, prompt: async (text, options) => {
      // Only synthetic design files/self-checks come from the existing fixture. The handoff uses the real native session.
      await fallback.prompt(text, options); stages.push('author'); return native.prompt(text, options);
    } };
  } });
  return { ...f, payloads, configs, stages,
    execute: async () => { const result = await f.execute(); assert.ok(result && typeof result === 'object' && 'outcome' in result); return result; },
    state: async () => { const state = await readRunSnapshot(f.root); assert.notEqual(state.formatVersion, 'intake-1'); assert.ok('tasks' in state); return state; },
    resume: async () => f.host.execute({ root: f.root, draft: f.draft, requirement: JSON.parse(await readFile(join(f.root, 'execution.json'), 'utf8')).requirement, resume: true }),
    json: async (path: string) => JSON.parse(await readFile(join(f.root, path), 'utf8')) };
}

for (const corrected of [true, false]) test(corrected ? 'COS128 public ordinary corrects prose-prefixed handoff once' : 'COS128 public valid handoff makes no correction', async t => {
  const f = await fixture(t, corrected ? proseReply : strictReply);
  assert.throws(() => decodeModelJson(proseReply));
  const result = await f.execute(), state = await f.state(), design = state.tasks.find(task => task.taskId === 'design-task')!;
  assert.equal(design.state, 'passed', JSON.stringify(design.attempts));
  assert.equal(result.outcome, 'incomplete'); assert.equal(f.plays.length, 0);
  assert.deepEqual(f.stages, ['author', 'capture', 'verify', 'review']);
  assert.equal(f.configs.filter(config => JSON.parse(config.context).role === 'design').length, 1);
  assert.equal(design.attempts.length, 1); assert.equal(f.payloads.length, corrected ? 2 : 1);
  const entries = state.ledger.entries.filter(entry => entry.taskId === design.taskId);
  assert.equal(entries.length, corrected ? 2 : 1);
  assert.ok(entries.every(entry => entry.status === 'settled' && entry.settledMicroCny === 140));
  const execution = await f.json('execution.json'), origin = await f.json('journal/task-design-task/origin.json');
  if (corrected) { assert.equal(execution.authorProtocolCorrections, 1); assert.equal(origin.authorProtocolCorrections, 1); }
  assert.equal(origin.originalDeadlineAt, state.run.originalDeadlineAt);
  assert.equal(f.configs.find(config => JSON.parse(config.context).role === 'design')!.maxRequests, 32);
  if (corrected) {
    assert.equal(f.payloads[1].tools, undefined); assert.match(JSON.stringify(f.payloads[1].messages), /Self-check passes with both deliverables in place/);
    const started = (await f.json('journal/task-design-task/author-correction-started.json')).value;
    const response = (await f.json('journal/task-design-task/author-correction-response.json')).value;
    assert.equal(started.originalReply, proseReply); assert.equal(started.used, 1);
    assert.equal(started.attemptId, design.attempts[0].attemptId); assert.equal(response.contextId, started.contextId);
    assert.equal(response.authorId, design.authorId); assert.equal(response.reply, strictReply);
  } else await assert.rejects(readFile(join(f.root, 'journal/task-design-task/author-correction-started.json')), { code: 'ENOENT' });
  t.diagnostic('SOURCE only: native design session and readonly turn, synthetic HTTP, real design capture/verification, independent deterministic review; browser/game NONE.');
});

for (const mode of ['invalid', 'remaining', 'review'] as const) test(`COS128 public ${mode} handoff remains incomplete without a second correction`, async t => {
  const first = mode === 'remaining' ? JSON.stringify({ ...proposal, remaining: ['Unfinished assigned design content'] }) : proseReply;
  const f = await fixture(t, first, mode === 'invalid' ? '{}' : strictReply, mode === 'review' ? 'review' : undefined);
  const result = await f.execute(), state = await f.state(), design = state.tasks.find(task => task.taskId === 'design-task')!;
  assert.equal(result.outcome, 'incomplete'); assert.notEqual(design.state, 'passed');
  assert.equal(f.payloads.length, mode === 'remaining' ? 1 : 2); assert.equal(design.attempts.length, 1);
  assert.equal(f.configs.filter(config => JSON.parse(config.context).role === 'design').length, 1);
  if (mode === 'invalid') {
    assert.match(design.attempts[0].failure!.actual, /protocol_failure/);
    assert.notEqual(design.attempts[0].failure!.classification, 'code_defect');
  }
  if (mode === 'remaining') assert.ok(design.handoff.remaining.includes('Unfinished assigned design content'));
  if (mode === 'review') assert.equal(design.review.verdict, 'changes_requested');
  assert.equal(f.plays.length, 0);
});

test('COS128 public correction cannot afford its actual quote after the original settled request', async t => {
  const f = await fixture(t, proseReply, strictReply, 'budget'); await f.execute();
  const state = await f.state(), execution = await f.json('execution.json'), design = state.tasks.find(task => task.taskId === 'design-task')!;
  assert.equal(f.payloads.length, 1); assert.equal(state.requests.length, 1); assert.equal(state.ledger.entries.length, 1);
  assert.equal(state.ledger.entries[0].status, 'settled'); assert.equal(state.ledger.entries[0].settledMicroCny, 144060);
  assert.equal(state.ledger.limitMicroCny, 1_500_000); assert.equal(design.budget.allocationMicroCny, 202500);
  assert.deepEqual(design.budget, execution.tasks[0].task.budget); assert.equal(design.budget.originalDeadlineAt, state.run.originalDeadlineAt);
  const config = f.configs.find(config => JSON.parse(config.context).role === 'design')!;
  assert.equal(config.maxRequests, 32); assert.equal(config.maxOutputTokens, 32768); assert.ok(f.payloads[0].max_tokens >= 18000);
  assert.notEqual(design.state, 'passed'); assert.equal((await f.json('journal/task-design-task/author-correction-started.json')).value.used, 1);
  await assert.rejects(readFile(join(f.root, 'journal/task-design-task/author-correction-response.json')), { code: 'ENOENT' });
});

test('COS128 public new nonordinary host keeps the author policy omitted', async t => {
  const f = await fixture(t, strictReply);
  f.host.execute = input => executeGeneration({ ...input, createHost: async args => ({ ...await createBrowserHost({ ...args, ...f.hostOptions }), capability: 'controlled-nonordinary-fixture' }) });
  await f.execute(); const execution = await f.json('execution.json'), origin = await f.json('journal/task-design-task/origin.json');
  assert.equal(execution.capability, 'controlled-nonordinary-fixture');
  assert.equal(Object.hasOwn(execution, 'authorProtocolCorrections'), false); assert.equal(Object.hasOwn(origin, 'authorProtocolCorrections'), false);
  assert.equal(f.payloads.length, 1); assert.equal((await f.state()).tasks.find(task => task.taskId === 'design-task')!.state, 'passed');
});

test('COS128 public policy accepts only omitted or numeric one for ordinary capability', () => {
  assert.deepEqual(authorCorrectionPolicy({}, 'ordinary-design-execution/1'), {});
  assert.deepEqual(authorCorrectionPolicy({}, 'other'), {});
  assert.deepEqual(authorCorrectionPolicy({ authorProtocolCorrections: 1 }, 'ordinary-design-execution/1'), { authorProtocolCorrections: 1 });
  for (const value of [undefined, null, 0, '1', true, 2]) assert.throws(() => authorCorrectionPolicy({ authorProtocolCorrections: value }, 'ordinary-design-execution/1'), /policy/);
  assert.throws(() => authorCorrectionPolicy({ authorProtocolCorrections: 1 }, 'other'), /capability/);
});

async function omitPolicy(f: Awaited<ReturnType<typeof fixture>>) {
  for (const path of ['execution.json', ...(await f.state()).tasks.map(task => `journal/task-${task.taskId}/origin.json`)]) {
    const value = await f.json(path); delete value.authorProtocolCorrections; await writeFile(join(f.root, path), JSON.stringify(value), 'utf8');
  }
}

for (const mode of ['old-omitted', 'old-failed', 'missing-origin', 'origin-only', 'execution-delete', 'origin-delete', 'execution-add', 'origin-add'] as const) test(`COS128 public resume ${mode} sends no new author or correction`, async t => {
  const f = await fixture(t, mode === 'old-failed' ? proseReply : strictReply, '{}');
  const write = TaskJournal.prototype.write;
  const interrupt = mode === 'old-failed' ? undefined : t.mock.method(TaskJournal.prototype, 'write', async function(this: TaskJournal, name: Parameters<TaskJournal['write']>[0], attemptId: string, value: unknown) {
    if (name === 'author') throw new RecoveryBlocked('COS128 fixture interruption before durable author reply');
    return write.call(this, name, attemptId, value);
  });
  await f.execute(); interrupt?.mock.restore();
  if (mode.startsWith('old-') || mode.endsWith('-add')) await omitPolicy(f);
  const originPath = 'journal/task-design-task/origin.json';
  if (mode === 'missing-origin') await rm(join(f.root, originPath));
  if (mode.endsWith('-delete') || mode.endsWith('-add')) {
    const path = mode.startsWith('execution') ? 'execution.json' : originPath, value = await f.json(path);
    if (mode.endsWith('-delete')) delete value.authorProtocolCorrections; else value.authorProtocolCorrections = 1;
    await writeFile(join(f.root, path), JSON.stringify(value), 'utf8');
  }
  const before = await f.state(), calls = f.payloads.length, sessions = f.configs.length;
  const result = await f.resume(), after = await f.state();
  assert.equal(result.outcome, 'incomplete'); assert.equal(f.payloads.length, calls); assert.equal(f.configs.length, sessions);
  assert.deepEqual(after.requests, before.requests); assert.deepEqual(after.ledger, before.ledger); assert.deepEqual(after.tasks, before.tasks);
  if (mode === 'missing-origin') await assert.rejects(readFile(join(f.root, originPath)), { code: 'ENOENT' });
  if (mode === 'old-omitted') {
    assert.equal(Object.hasOwn(await f.json('execution.json'), 'authorProtocolCorrections'), false);
    assert.equal(Object.hasOwn(await f.json(originPath), 'authorProtocolCorrections'), false);
  }
});

test('COS128 public cold recovery consumes the durable correction response without another request', async t => {
  const f = await fixture(t, proseReply), write = TaskJournal.prototype.write;
  const interrupt = t.mock.method(TaskJournal.prototype, 'write', async function(this: TaskJournal, name: Parameters<TaskJournal['write']>[0], attemptId: string, value: unknown) {
    await write.call(this, name, attemptId, value);
    if (name === 'author-correction-response') throw new RecoveryBlocked('COS128 fixture interruption after the complete correction response');
  });
  await f.execute(); interrupt.mock.restore();
  const before = await f.state(); assert.equal(f.payloads.length, 2); assert.equal(before.tasks.find(task => task.taskId === 'design-task')!.state, 'running');
  await f.resume(); const after = await f.state(), design = after.tasks.find(task => task.taskId === 'design-task')!;
  assert.equal(design.state, 'passed'); assert.equal(f.payloads.length, 2); assert.equal(design.attempts.length, 1);
  assert.equal(f.configs.filter(config => JSON.parse(config.context).role === 'design').length, 1);
  assert.deepEqual(after.requests, before.requests); assert.deepEqual(after.ledger.entries, before.ledger.entries);
  assert.deepEqual(f.stages, ['author', 'capture', 'verify', 'review']);
});

test('COS128 public rejects invalid persisted policy before constructing any recovery session', async t => {
  const f = await fixture(t, strictReply), write = TaskJournal.prototype.write;
  const interrupt = t.mock.method(TaskJournal.prototype, 'write', async function(this: TaskJournal, name: Parameters<TaskJournal['write']>[0], attemptId: string, value: unknown) {
    if (name === 'author') throw new RecoveryBlocked('COS128 fixture interruption before durable author reply');
    return write.call(this, name, attemptId, value);
  });
  await f.execute(); interrupt.mock.restore();
  const before = await f.state(), execution = await f.json('execution.json'), calls = f.payloads.length, sessions = f.configs.length;
  for (const value of [null, 0, '1', true, 2]) {
    await writeFile(join(f.root, 'execution.json'), JSON.stringify({ ...execution, authorProtocolCorrections: value }), 'utf8');
    const result = await f.resume(); assert.equal(result.outcome, 'incomplete');
    assert.ok(result.gaps.some((gap: string) => /author correction policy/.test(gap)));
    assert.equal(f.payloads.length, calls); assert.equal(f.configs.length, sessions);
    const after = await f.state(); assert.deepEqual(after.tasks, before.tasks); assert.deepEqual(after.ledger, before.ledger); assert.deepEqual(after.requests, before.requests);
  }
});

for (const [enabled, change] of [[true, 'none'], [false, 'none'], [true, 'delete'], [false, 'add'], [true, 'zero'], [true, 'null']] as const)
  test(`COS128 legacy repair resume ${enabled ? 'enabled' : 'omitted'} policy ${change}`, async t => {
    // Exercise the actual legacy repair-plan writer with synthetic design files only.
    const f = await ordinaryHostFixture(t, { productionDefault: true, fault: 'missing' });
    f.host.execute = input => executeGeneration({ ...input, createHost: async args => ({
      ...await createBrowserHost({ ...args, ...f.hostOptions }), continuationTargets: undefined,
    }) });
    await f.execute();
    const json = async (path: string) => JSON.parse(await readFile(join(f.root, path), 'utf8'));
    const first = await readRunSnapshot(f.root); assert.ok('tasks' in first);
    const plan = await json('repair-plan.json');
    assert.equal(Object.hasOwn(plan, 'formatVersion'), false); assert.equal(plan.sourceTaskId, 'design-task');
    assert.equal(plan.replacementTaskId, 'design-task-repair'); assert.equal(plan.authorProtocolCorrections, 1);
    assert.equal(first.tasks.find(task => task.taskId === plan.replacementTaskId)!.state, 'passed');
    assert.equal(f.plays.length, 0);
    if (!enabled) for (const path of ['execution.json', 'repair-plan.json', ...first.tasks.map(task => `journal/task-${task.taskId}/origin.json`)]) {
      const value = await json(path); delete value.authorProtocolCorrections;
      await writeFile(join(f.root, path), JSON.stringify(value), 'utf8');
    }
    const current = await json('repair-plan.json');
    if (change === 'delete') delete current.authorProtocolCorrections;
    if (change === 'add') current.authorProtocolCorrections = 1;
    if (change === 'zero') current.authorProtocolCorrections = 0;
    if (change === 'null') current.authorProtocolCorrections = null;
    if (change !== 'none') await writeFile(join(f.root, 'repair-plan.json'), JSON.stringify(current), 'utf8');
    const before = await readRunSnapshot(f.root), calls = f.packets.length, fixedPlan = await readFile(join(f.root, 'repair-plan.json'));
    const execution = await json('execution.json');
    const result = await f.host.execute({ root: f.root, draft: f.draft, requirement: execution.requirement, resume: true });
    const after = await readRunSnapshot(f.root); assert.ok('tasks' in before && 'tasks' in after);
    assert.equal(result.outcome, 'incomplete'); assert.equal(f.packets.length, calls);
    assert.deepEqual(after.tasks, before.tasks); assert.deepEqual(after.ledger, before.ledger); assert.deepEqual(after.requests, before.requests);
    assert.deepEqual(await readFile(join(f.root, 'repair-plan.json')), fixedPlan);
    if (change === 'none') {
      assert.deepEqual(result.reusedTaskIds, ['design-task-repair']);
      assert.equal(Object.hasOwn(await json('execution.json'), 'authorProtocolCorrections'), enabled);
      assert.equal(Object.hasOwn(await json('journal/task-design-task-repair/origin.json'), 'authorProtocolCorrections'), enabled);
    } else {
      assert.deepEqual(result.reusedTaskIds, []);
      assert.ok(result.gaps.some((gap: string) => /author correction policy/.test(gap)), JSON.stringify(result.gaps));
    }
  });
