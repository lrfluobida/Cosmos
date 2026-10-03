import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { executeTaskDag, resumeTaskDag } from '../../src/runtime/orchestrator.ts';
import type { AuthorProposal, DagOptions } from '../../src/runtime/orchestrator.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import { createRoleBudget } from '../../src/roles/provider-budget.ts';
import { TaskJournal, RecoveryBlocked } from '../../src/runtime/recovery/task-journal.ts';
import { withDagOwner } from '../../src/runtime/scheduler/index.ts';
import { requestReservation } from '../../probes/e2e/admission.ts';
import { validationRoutingFixture } from '../runtime/validation-routing.fixture.ts';

// Only the generated final proposal: no native session, context, user metadata or game bytes.
const native: AuthorProposal = JSON.parse(await readFile(new URL('./fixtures/native-coding-handoff.json', import.meta.url), 'utf8'));
const nativeHash = '9882e85471b8279085ba2689188cbd02751ee863ae7ce2419f4875b4c2bd8bbf';
const revised: AuthorProposal = { summary: `${native.summary}\nPending host observations:\n${native.uncertainty.join('\n')}`, remaining: [], uncertainty: [] };

async function setup(t: test.TestContext, mode = 'clarified', enabled?: 0 | 1) {
  const f = await validationRoutingFixture(t), planned = await planTaskDag(f.planning);
  const codingItem = planned.tasks.find(item => item.role === 'coding')!;
  const scopeInterface = { artifactId: 'offline-coding-interface', version: 'v1', location: 'coding-interface.json' };
  await writeFile(join(f.artifactRoot, scopeInterface.location), '{"接口":"只读固定版本"}\n', 'utf8');
  codingItem.task.context.interfaces.push(scopeInterface);
  const abort = new AbortController(), stages: string[] = []; let clarifications = 0;
  const options: DagOptions & { codingHandoffClarifications?: 0 | 1 } = {
    controller: f.controller, validation: f.binding, requirement: f.requirement, tasks: planned.tasks, sessionRoot: f.planning.sessionRoot,
    availableArtifacts: [f.source], roleFactory: f.roleFactory, capture: async (...args) => { stages.push(`capture:${args[0].taskId}`); return f.capture(args[0]); },
    verify: async (...args) => { stages.push(`verify:${args[0].taskId}`); const evidence = await f.verify(args[0]); return mode === 'host-failed' && args[0].taskId.endsWith('-coding') ? evidence.map(item => ({ ...item, outcome: 'failed' as const })) : evidence; },
    recovery: f.recovery, reviewProtocolCorrections: 1, signal: abort.signal,
    ...(enabled !== undefined ? { codingHandoffClarifications: enabled } : {}),
    ...(mode === 'format-first' ? { authorProtocolCorrections: 1 as const } : {}),
  };
  const selectedRole = mode === 'design' ? 'design' : 'coding';
  options.roleFactory = async input => {
    const role = await f.roleFactory(input);
    if (input.role === 'reviewer') { stages.push(`review:${input.task.taskId}`); return role; }
    if (input.role !== selectedRole) return role;
    const budget = createRoleBudget({ controller: f.controller, taskId: input.task.taskId, evidenceDirectory: input.stateDirectory,
      validation: { caseId: f.window.caseId, windowId: f.window.windowId, purpose: 'author' } });
    const request = (requestId: string) => ({ requestId, modelId: 'deepseek-flash' as const, maxOutputTokens: 65536, inputBytes: 100, hasImages: false });
    return { ...role, ...(mode === 'identity' ? { contextId: 'different-live-context' } : {}), async prompt(text, supplied) {
      await role.prompt(text, supplied);
      if (mode === 'cancel') abort.abort();
      if (mode === 'unknown') { const value = request('offline-lost-scope'); await budget.beforeRequest({ ...value, estimatedMaxCostMicroCny: requestReservation(value) }); }
      if (['expired', 'grant', 'count', 'owner'].includes(mode)) {
        const authority = f.controller.validationAuthority.bind(f.controller);
        t.mock.method(f.controller, 'validationAuthority', async (taskId: string, purpose: Parameters<typeof f.controller.validationAuthority>[1]) => {
          const value = await authority(taskId, purpose);
          return taskId === input.task.taskId && purpose === 'author' ? { ...value,
            ...(mode === 'expired' ? { deadlineAt: '2026-09-01T00:00:00.000Z' } : mode === 'grant' ? { taskGrantMicroCny: 0 } : mode === 'count' ? { requestsRemaining: 0 } : { admissionAllowed: false }) } : value;
        });
      }
      const proposal = mode === 'own-work' ? { ...native, remaining: ['真实未完成的编码工作'] } : mode === 'complete' ? revised : native;
      return { text: mode === 'format-first' ? `Native author prose\n\n${JSON.stringify(proposal)}` : mode === 'fenced' ? `\`\`\`json\n${JSON.stringify(proposal)}\n\`\`\`` : JSON.stringify(proposal) };
    }, ...(mode === 'unavailable' ? {} : { async readonlyPrompt(text: string, supplied?: { signal?: AbortSignal }) {
      supplied?.signal?.throwIfAborted(); clarifications++;
      assert.match(text, /JSON/); assert.match(text, /genuine|unfinished/i); assert.match(text, /tools.*disabled/i);
      if (mode !== 'format-first') { assert.match(text, /scope|responsibilit/i); assert.match(text, /verbatim|exact/i); }
      const value = request(`offline-scope-${clarifications}`);
      await budget.beforeRequest({ ...value, estimatedMaxCostMicroCny: requestReservation(value) });
      await budget.afterResponse({ requestId: value.requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
      if (mode === 'output-changed') await writeFile(join(f.artifactRoot, 'authors/coding.txt'), 'changed', 'utf8');
      if (mode === 'input-changed') await writeFile(join(f.artifactRoot, input.task.inputs[0].location, 'requirements.json'), '{}', 'utf8');
      if (mode === 'interface-changed') await writeFile(join(f.artifactRoot, scopeInterface.location), '{}', 'utf8');
      return { text: mode === 'invalid' ? '{}' : JSON.stringify(mode === 'format-first' || mode === 'unresolved' ? native : mode === 'dropped' ? { ...native, uncertainty: [] } : mode === 'revised-work' ? { ...revised, remaining: ['真实未完成'] } : revised) };
    } }) };
  };
  const coding = () => f.controller.read().then(state => state.tasks.find(task => task.taskId.endsWith('-coding'))!);
  const receipt = async (name: string) => JSON.parse(await readFile(join(f.recovery.journalRoot, `task-${f.window.caseId}-coding`, `${name}.json`), 'utf8'));
  return { ...f, options, coding, receipt, stages, scopeInterface, counts: () => clarifications };
}

test('actual native coding concerns get one read-only clarification and still require fixed host acceptance and independent review', async t => {
  assert.equal(createHash('sha256').update(JSON.stringify(native)).digest('hex'), nativeHash);
  const f = await setup(t, 'clarified', 1), before = (await f.controller.read()).requests.length;
  await executeTaskDag(f.options); const task = await f.coding(), state = await f.controller.read();
  assert.equal(task.state, 'passed'); assert.equal(task.attempts.length, 1); assert.equal(f.counts(), 1);
  assert.deepEqual(f.stages.filter(stage => stage.endsWith('-coding')), [`capture:${task.taskId}`, `verify:${task.taskId}`, `review:${task.taskId}`]);
  const started = (await f.receipt('author-correction-started')).value;
  assert.equal(started.kind, 'coding_scope'); assert.equal(started.used, 1); assert.equal(started.originalReplySha256, nativeHash);
  assert.deepEqual(started.originalProposal, native); assert.equal(started.originalProposalSha256, nativeHash);
  assert.equal(started.authorId, task.authorId); assert.equal(started.contextId, task.context.contextId);
  const charged = state.requests.find(request => request.requestId === 'offline-scope-1')!;
  assert.equal(charged.validation?.purpose, 'author'); assert.equal(charged.validation?.caseId, f.window.caseId);
  assert.equal(state.requests.length - before, 8); assert.equal(state.run.fees.settledMicroCny, 190);
  assert.deepEqual(state.ledger.entries.slice(0, f.original.ledger.entries.length), f.original.ledger.entries);
  assert.equal(state.run.originalDeadlineAt, f.original.run.originalDeadlineAt);
  native.uncertainty.forEach(concern => assert.ok(task.handoff.completed[0].includes(concern)));
  const resumed = await resumeTaskDag(f.options); assert.deepEqual(resumed.blocked, []); assert.equal(f.counts(), 1);
});

for (const enabled of [undefined, 0] as const) test(`default scope policy preserves old origin and unresolved failure: ${enabled}`, async t => {
  const f = await setup(t, 'clarified', enabled); await executeTaskDag(f.options);
  const task = await f.coding(); assert.equal(task.state, 'failed'); assert.equal(f.counts(), 0);
  assert.deepEqual(task.handoff.uncertainty.slice(0, native.uncertainty.length), native.uncertainty);
  assert.equal(Object.hasOwn(await f.receipt('origin'), 'codingHandoffClarifications'), false);
});

for (const mode of ['own-work', 'complete', 'design'] as const) test(`scope eligibility excludes ${mode}`, async t => {
  const f = await setup(t, mode, 1), tasks = await executeTaskDag(f.options); assert.equal(f.counts(), 0);
  assert.equal(tasks.find(task => task.taskId.endsWith(mode === 'design' ? '-design' : '-coding'))!.state, mode === 'complete' ? 'passed' : 'failed');
});

test('the approved single JSON fence retains its existing eligibility contract', async t => {
  const f = await setup(t, 'fenced', 1); await executeTaskDag(f.options); assert.equal((await f.coding()).state, 'passed'); assert.equal(f.counts(), 1);
});

test('format correction consumes the shared turn and cannot clarify its revised uncertainty', async t => {
  const f = await setup(t, 'format-first', 1); await executeTaskDag(f.options);
  const task = await f.coding(); assert.equal(task.state, 'failed'); assert.equal(f.counts(), 1);
  assert.equal((await f.receipt('author-correction-started')).value.parseFailure.code, 'invalid_proposal');
  assert.equal(task.attempts[0].failure?.classification, 'insufficient_evidence');
  const feedback = JSON.parse(await readFile(join(task.attempts[0].sessionRef, 'failure.json'), 'utf8'));
  assert.equal(feedback.issues[0].checkId, 'author_handoff');
});

for (const mode of ['unresolved', 'revised-work', 'dropped', 'invalid', 'host-failed', 'output-changed', 'input-changed', 'interface-changed', 'cancel', 'unknown', 'expired', 'grant', 'count', 'owner', 'identity', 'unavailable'] as const) test(`scope clarification cannot pass ${mode}`, async t => {
  const f = await setup(t, mode, 1); await executeTaskDag(f.options); const task = await f.coding();
  assert.notEqual(task.state, 'passed'); assert.equal(f.counts(), ['cancel', 'unknown', 'expired', 'grant', 'count', 'owner', 'identity', 'unavailable'].includes(mode) ? 0 : 1);
  if (['unresolved', 'revised-work'].includes(mode)) {
    const feedback = JSON.parse(await readFile(join(task.attempts[0].sessionRef, 'failure.json'), 'utf8'));
    assert.equal(feedback.issues[0].checkId, 'author_handoff'); assert.equal(feedback.issues[0].classification, 'insufficient_evidence');
  }
  if (mode === 'host-failed') assert.equal(f.stages.includes(`review:${task.taskId}`), false);
  const calls = f.counts();
  if (mode === 'input-changed') await assert.rejects(resumeTaskDag(f.options), /fixed source changed/);
  else await resumeTaskDag(f.options);
  assert.equal(f.counts(), calls);
});

for (const stage of ['author-correction-started', 'author-correction-response', 'author'] as const) test(`scope durable interruption at ${stage} never repeats paid author work`, async t => {
  const f = await setup(t, 'clarified', 1), write = TaskJournal.prototype.write;
  const crash = mock.method(TaskJournal.prototype, 'write', async function(this: TaskJournal, name: Parameters<TaskJournal['write']>[0], attemptId: string, value: unknown) {
    await write.call(this, name, attemptId, value);
    if (name === stage && typeof value === 'object' && value && ('kind' in value || 'proposal' in value && (value as { proposal: AuthorProposal }).proposal.summary === revised.summary)) throw new RecoveryBlocked('Offline scope durable interruption.');
  });
  await executeTaskDag(f.options); crash.mock.restore(); assert.equal((await f.coding()).state, 'running');
  const resumed = await resumeTaskDag(f.options);
  assert.equal((await f.coding()).state, stage === 'author-correction-started' ? 'running' : 'passed');
  if (stage === 'author-correction-started') assert.ok(resumed.blocked.some(item => /durable response/.test(item.reason)));
  assert.equal(f.counts(), stage === 'author-correction-started' ? 0 : 1);
});

for (const changed of ['identity', 'reply', 'original', 'input', 'interface', 'output'] as const) test(`stored scope response refuses altered ${changed} without paid dispatch`, async t => {
  const f = await setup(t, 'clarified', 1), write = TaskJournal.prototype.write;
  const crash = mock.method(TaskJournal.prototype, 'write', async function(this: TaskJournal, name: Parameters<TaskJournal['write']>[0], attemptId: string, value: unknown) {
    await write.call(this, name, attemptId, value); if (name === 'author-correction-response') throw new RecoveryBlocked('Offline interruption.');
  });
  await executeTaskDag(f.options); crash.mock.restore();
  if (changed === 'output') await writeFile(join(f.artifactRoot, 'authors/coding.txt'), 'changed', 'utf8');
  else if (changed === 'input') await writeFile(join(f.artifactRoot, f.source.location, 'requirements.json'), '{}', 'utf8');
  else if (changed === 'interface') await writeFile(join(f.artifactRoot, f.scopeInterface.location), '{}', 'utf8');
  else {
    const stage = changed === 'original' ? 'author-correction-started' : 'author-correction-response', receipt = await f.receipt(stage);
    if (changed === 'identity') receipt.value.contextId = 'different';
    else if (changed === 'original') receipt.value.originalProposal.uncertainty = [];
    else receipt.value.reply = '{}';
    await writeFile(join(f.recovery.journalRoot, `task-${f.window.caseId}-coding`, `${stage}.json`), JSON.stringify(receipt), 'utf8');
  }
  if (changed === 'input') await assert.rejects(resumeTaskDag(f.options), /fixed source changed/);
  else { const resumed = await resumeTaskDag(f.options); assert.ok(resumed.blocked.some(item => item.taskId.endsWith('-coding'))); }
  assert.equal(f.counts(), 1); assert.equal((await f.coding()).state, 'running');
});

test('scope clarification requires explicit validation authority before any author', async t => {
  const f = await setup(t, 'clarified', 1); delete f.options.validation;
  await assert.rejects(executeTaskDag(f.options), /validation|legacy entrypoint/i); assert.equal(f.counts(), 0);
});

test('an existing DAG owner refuses scoped dispatch without consuming a clarification', async t => {
  const f = await setup(t, 'clarified', 1), requests = f.requests.length;
  await withDagOwner(f.controller, async () => { await assert.rejects(executeTaskDag(f.options), /active DAG/i); }, undefined, f.binding);
  assert.equal(f.requests.length, requests); assert.equal(f.counts(), 0);
});
