import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { executeTaskDag, resumeTaskDag } from '../../src/runtime/orchestrator.ts';
import { createRoleBudget } from '../../src/roles/provider-budget.ts';
import { dagFixture } from '../runtime/recovery/dag-fixture.ts';
import { RecoveryBlocked, TaskJournal } from '../../src/runtime/recovery/task-journal.ts';

const native = JSON.parse(await readFile(new URL('./fixtures/native-author-handoff.json', import.meta.url), 'utf8'));
const corrected = JSON.parse(native.reply.slice(native.reply.indexOf('\n\n') + 2));

async function setup(t: test.TestContext, mode = 'corrected', enabled: 0 | 1 = 1) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-author-protocol-'));
  const f = await dagFixture(root, true);
  const original = f.options.roleFactory, abort = new AbortController();
  if (mode === 'shared-root') {
    f.options.sessionRoot = join(f.workspace, 'native-sessions');
    f.options.recovery!.journalRoot = join(f.workspace, 'host-journal');
  }
  let authorCalls = 0, correctionCalls = 0;
  Object.assign(f.options, { authorProtocolCorrections: enabled, signal: abort.signal });
  f.options.roleFactory = async input => {
    const role = await original(input);
    if (input.role === 'reviewer') return role;
    const budget = createRoleBudget({ controller: f.controller, taskId: input.task.taskId, evidenceDirectory: input.stateDirectory });
    return { ...role, async prompt(text, options) {
      authorCalls++; await role.prompt(text, options);
      if (mode === 'cancel') abort.abort();
      if (mode === 'unknown') await budget.beforeRequest({ requestId: 'lost-request', modelId: 'deepseek-flash', maxOutputTokens: 10, inputBytes: 10, hasImages: false, estimatedMaxCostMicroCny: 100 });
      return { text: native.reply };
    }, async readonlyPrompt(text: string, options?: { signal?: AbortSignal }) {
      correctionCalls++; options?.signal?.throwIfAborted();
      assert.match(text, /only.*JSON|JSON.*only/i);
      assert.match(text, /genuine|real.*unfinished|unfinished.*real/i);
      await budget.beforeRequest({ requestId: 'author-format', modelId: 'deepseek-flash', maxOutputTokens: 10, inputBytes: Buffer.byteLength(text), hasImages: false, estimatedMaxCostMicroCny: 100 });
      await budget.afterResponse({ requestId: 'author-format', outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
      if (mode === 'changed') await writeFile(join(f.workspace, 'authors/code/main.ts'), 'changed', 'utf8');
      return { text: mode === 'invalid' ? native.reply : JSON.stringify({ ...corrected, remaining: mode === 'unresolved' ? ['真实未完成'] : [] }) };
    } };
  };
  if (mode === 'host-failed') { const verify = f.options.verify; f.options.verify = async (...args) => (await verify(...args)).map(e => ({ ...e, outcome: 'failed' })); }
  t.after(async () => { await f.controller.close(); await rm(root, { recursive: true, force: true }); });
  return { ...f, counts: () => ({ authorCalls, correctionCalls }) };
}

test('actual native prose plus JSON fails strict parsing, then one same-attempt format response follows normal acceptance', async t => {
  assert.equal(createHash('sha256').update(native.reply).digest('hex'), native.replySha256);
  const f = await setup(t);
  const [task] = await executeTaskDag(f.options);
  assert.equal(task.state, 'passed');
  assert.deepEqual(f.counts(), { authorCalls: 1, correctionCalls: 1 });
  assert.equal(task.attempts.length, 1);
  assert.deepEqual(await f.calls(), ['author', 'capture', 'verify', 'review']);
  const state = await f.controller.read();
  assert.equal(state.ledger.entries.length, 3);
  assert.equal(state.run.fees.settledMicroCny, 30);
  assert.ok(state.ledger.entries.every(entry => entry.taskId === task.taskId));
  const receipt = JSON.parse(await readFile(join(f.root, 'recovery/task-code/author-correction-started.json'), 'utf8')).value;
  assert.equal(receipt.used, 1); assert.equal(receipt.originalReply, native.reply);
  assert.equal(receipt.originalReplySha256, native.replySha256);
  assert.deepEqual(receipt.parseFailure, { code: 'invalid_proposal', reason: 'requires_complete_json' });
  assert.equal(receipt.authorId, task.authorId); assert.equal(receipt.contextId, task.context.contextId);
  assert.equal(await readFile(join(f.workspace, 'authors/code/main.ts'), 'utf8'), '// 原创结果\n');
  const resumed = await resumeTaskDag(f.options);
  assert.deepEqual(resumed.reusedTaskIds, ['code']);
  assert.deepEqual(f.counts(), { authorCalls: 1, correctionCalls: 1 });
});

for (const mode of ['invalid', 'unresolved', 'host-failed', 'changed', 'cancel', 'unknown']) test(`author correction cannot pass ${mode}`, async t => {
  const f = await setup(t, mode);
  const [task] = await executeTaskDag(f.options);
  assert.notEqual(task.state, 'passed');
  assert.equal(f.counts().correctionCalls, ['cancel', 'unknown'].includes(mode) ? 0 : 1);
  const before = f.counts();
  const resumed = await resumeTaskDag(f.options);
  assert.ok(resumed.blocked.length); assert.deepEqual(f.counts(), before);
  if (mode === 'invalid') {
    assert.equal(task.attempts[0].failure?.classification, 'insufficient_evidence');
    const feedback = JSON.parse(await readFile(join(task.attempts[0].sessionRef, 'failure.json'), 'utf8'));
    assert.equal(feedback.issues[0].checkId, 'author_protocol');
    assert.match(feedback.issues[0].actual, /protocol_failure/);
  }
  if (mode === 'unresolved') assert.ok(task.handoff.remaining.includes('真实未完成'));
  if (mode === 'host-failed') assert.deepEqual(await f.calls(), ['author', 'capture', 'verify']);
});

test('omitted correction policy retains strict historical failure and spends no format request', async t => {
  const f = await setup(t, 'corrected', 0);
  const [task] = await executeTaskDag(f.options);
  assert.equal(task.state, 'failed');
  assert.deepEqual(f.counts(), { authorCalls: 1, correctionCalls: 0 });
  assert.equal(task.attempts[0].failure?.classification, 'insufficient_evidence');
});

test('case-root workspace permits native session and host receipt writes while author output bytes stay fixed', async t => {
  const f = await setup(t, 'shared-root');
  const [task] = await executeTaskDag(f.options);
  assert.equal(task.state, 'passed');
  assert.deepEqual(f.counts(), { authorCalls: 1, correctionCalls: 1 });
  assert.equal(await readFile(join(f.workspace, 'authors/code/main.ts'), 'utf8'), '// 原创结果\n');
  const receipt = JSON.parse(await readFile(join(f.workspace, 'host-journal/task-code/author-correction-started.json'), 'utf8'));
  assert.equal(receipt.value.workspaceSignature.length, 1);
  assert.equal(receipt.value.workspaceSignature[0].location, join(f.workspace, 'authors/code'));
  assert.deepEqual(receipt.value.workspaceSignature[0].files.map((file: any) => file.path), ['main.ts']);
});

for (const stage of ['author-correction-started', 'author-correction-response', 'author'] as const) test(`durable ${stage} interruption never grants a second paid author or correction`, async t => {
  const f = await setup(t);
  const write = TaskJournal.prototype.write;
  const crash = mock.method(TaskJournal.prototype, 'write', async function(this: TaskJournal, name: Parameters<TaskJournal['write']>[0], attemptId: string, value: unknown) {
    await write.call(this, name, attemptId, value);
    if (name === stage) throw new RecoveryBlocked('Simulated interruption after receipt publication.');
  });
  const [task] = await executeTaskDag(f.options);
  crash.mock.restore();
  assert.equal(task.state, 'running');
  assert.deepEqual(f.counts(), { authorCalls: 1, correctionCalls: stage === 'author-correction-started' ? 0 : 1 });
  const resumed = await resumeTaskDag(f.options);
  if (stage === 'author-correction-started') {
    assert.equal(resumed.tasks[0].state, 'running');
    assert.match(resumed.blocked[0].reason, /do not repeat paid formatting/);
  } else {
    assert.equal(resumed.tasks[0].state, 'passed');
    assert.deepEqual(await f.calls(), ['author', 'capture', 'verify', 'review']);
  }
  assert.deepEqual(f.counts(), { authorCalls: 1, correctionCalls: stage === 'author-correction-started' ? 0 : 1 });
});

for (const mode of ['expired', 'exhausted'] as const) test(`author ${mode} authority sends no format request`, async t => {
  const f = await setup(t);
  const original = f.controller.executionAuthority.bind(f.controller);
  const authority = mock.method(f.controller, 'executionAuthority', async (taskId: string) => {
    const value = await original(taskId);
    return mode === 'expired' ? { ...value, deadlineAt: '2026-09-01T00:00:00.000Z' } : { ...value, taskGrantMicroCny: 0 };
  });
  const [task] = await executeTaskDag(f.options); authority.mock.restore();
  assert.equal(task.state, 'failed');
  assert.deepEqual(f.counts(), { authorCalls: 1, correctionCalls: 0 });
  assert.equal((await f.controller.read()).ledger.entries.length, 1);
  assert.match(task.attempts[0].failure!.actual, /authority_exhausted/);
});

for (const change of ['identity', 'response', 'workspace'] as const) test(`stored format response rejects altered ${change} without paid dispatch`, async t => {
  const f = await setup(t);
  const write = TaskJournal.prototype.write;
  const crash = mock.method(TaskJournal.prototype, 'write', async function(this: TaskJournal, name: Parameters<TaskJournal['write']>[0], attemptId: string, value: unknown) {
    await write.call(this, name, attemptId, value);
    if (name === 'author-correction-response') throw new RecoveryBlocked('Simulated interruption.');
  });
  await executeTaskDag(f.options); crash.mock.restore();
  if (change === 'workspace') await writeFile(join(f.workspace, 'authors/code/main.ts'), 'changed', 'utf8');
  else {
    const path = join(f.root, 'recovery/task-code/author-correction-response.json');
    const response = JSON.parse(await readFile(path, 'utf8'));
    if (change === 'identity') response.value.contextId = 'another-context';
    else response.value.reply = '{}';
    await writeFile(path, JSON.stringify(response) + '\n', 'utf8');
  }
  const resumed = await resumeTaskDag(f.options);
  assert.equal(resumed.blocked.length, 1);
  assert.deepEqual(f.counts(), { authorCalls: 1, correctionCalls: 1 });
  assert.deepEqual(await f.calls(), ['author']);
});
