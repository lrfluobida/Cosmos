import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { continuationSessionFixture } from './continuation-session.fixture.ts';

const args = (root: string) => ['continue', root, '--add-cny', '1', '--add-minutes', '10'];
function streams(answer?: (quoteId: string) => Promise<string> | string) {
  const input = new PassThrough(), output = new PassThrough(); let text = '', answered = false;
  output.on('data', async bytes => {
    text += bytes;
    const match = text.match(/confirm (cq1-[a-f0-9]{64})/);
    if (answer && match && !answered) { answered = true; input.end(await answer(match[1])); }
  });
  return { input, output, text: () => text };
}

test('public continue collects exact stdin confirmation, delivers a first window, then public resume reuses it without billing', async t => {
  const f = await continuationSessionFixture(t), before = [...f.calls], io = streams(id => `confirm ${id}\n`);
  const result: any = await runCli(args(f.root), { ...io, host: f.host });
  assert.equal(result.outcome, 'awaiting_user_experience'); assert.match(io.text(), /只读续跑提案|续跑提案/); assert.match(io.text(), /report-/);
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), window = state.continuation.windows[0];
  assert.equal(state.formatVersion, 2); assert.deepEqual(state.stopReason, f.original.stopReason); assert.equal(state.run.originalDeadlineAt, f.original.run.originalDeadlineAt);
  assert.ok(f.original.run.fees.settledMicroCny > 0); assert.equal(state.run.fees.settledMicroCny, f.original.run.fees.settledMicroCny + 20);
  assert.deepEqual(state.ledger.entries.slice(0, f.original.ledger.entries.length), f.original.ledger.entries);
  assert.ok(state.requests.slice(f.original.requests.length).every((request: any) => request.windowId === window.windowId));
  assert.equal(state.run.humanDecisions.at(-1).actorId, 'local-user'); assert.equal(result.originalResult.outcome, 'not_met'); assert.equal(result.windowId, window.windowId);
  assert.equal(await readFile(join(f.root, 'authors/coding/index.html'), 'utf8'), '<div>旧未完成产物</div>');
  assert.equal(f.calls.slice(before.length).filter(call => call.startsWith('coding:')).length, 1); assert.equal(f.calls.slice(before.length).filter(call => /^(design|art):/.test(call)).length, 0);
  const calls = [...f.calls], fees = state.run.fees, plan = await readFile(join(f.root, `continuations/${window.decisionId}/plan.json`), 'utf8');
  assert.ok(state.tasks.at(-1).attempts[0].sessionRef.startsWith(join(f.root, 'sessions')));
  const again = streams(); const resumed: any = await runCli(['resume', f.root, '--window', window.windowId], { ...again, host: f.host });
  assert.equal(resumed.outcome, 'awaiting_user_experience'); assert.match(again.text(), /report-/); assert.deepEqual(f.calls, calls);
  assert.deepEqual(JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')).run.fees, fees); assert.equal(await readFile(join(f.root, `continuations/${window.decisionId}/plan.json`), 'utf8'), plan);
  const stopped: any = await runCli(['stop', f.root, '--window', window.windowId], streams());
  assert.deepEqual(stopped, { runId: state.run.runId, windowId: window.windowId, stopped: true });
  const final = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.deepEqual(final.run.fees, fees); assert.deepEqual(final.stopReason, f.original.stopReason);
  await assert.rejects(runCli(['resume', f.root, '--window', window.windowId], { ...streams(), host: f.host }), /持久停止/);
});

for (const mode of ['cancel', 'eof', 'not-ready', 'not-ready-after-confirm', 'stale', 'changed-source', 'wrong-confirmation'] as const) test(`public continue ${mode} does not activate or charge`, async t => {
  const f = await continuationSessionFixture(t), before = [...f.calls], stateBefore = await readFile(join(f.root, 'snapshot.json'), 'utf8');
  if (mode === 'not-ready') f.setReady(false);
  if (mode === 'not-ready-after-confirm') { let checks = 0; f.host.prepare = async () => ({ environmentReady: ++checks === 1, executionReady: checks === 1, reason: 'Offline changed prerequisite' }); }
  const io = streams(async id => {
    if (mode === 'stale') { const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')); state.revision++; await writeFile(join(f.root, 'snapshot.json'), JSON.stringify(state), 'utf8'); return `confirm ${id}\n`; }
    if (mode === 'changed-source') { const path = f.original.run.humanDecisions[0].evidence[0].location; await writeFile(join(f.root, path), await readFile(join(f.root, path), 'utf8') + ' ', 'utf8'); return `confirm ${id}\n`; }
    if (mode === 'wrong-confirmation') return 'confirm cq1-wrong\n';
    if (mode === 'not-ready-after-confirm') return `confirm ${id}\n`;
    return mode === 'eof' ? '' : 'cancel\n';
  });
  const result: any = await runCli(args(f.root), { ...io, host: f.host });
  assert.notEqual(result.outcome, 'awaiting_user_experience'); assert.deepEqual(f.calls, before);
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')); assert.equal(state.formatVersion, 1); assert.equal(state.continuation, undefined);
  if (mode !== 'stale') assert.equal(await readFile(join(f.root, 'snapshot.json'), 'utf8'), stateBefore);
  assert.equal((await readdir(f.root)).includes('continuations'), false);
});

test('activation without a plan resumes through the stored window without another confirmation or clock', async t => {
  const f = await continuationSessionFixture(t), before = [...f.calls], io = streams(id => `confirm ${id}\n`);
  await runCli(args(f.root), { ...io, host: { ...f.host, execute: async () => ({ outcome: 'offline_interrupt_after_activation' }) } });
  assert.deepEqual(f.calls, before);
  const first = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), window = first.continuation.windows[0];
  await assert.rejects(readFile(join(f.root, `continuations/${window.decisionId}/plan.json`)), { code: 'ENOENT' });
  const result: any = await runCli(['resume', f.root, '--window', window.windowId], { ...streams(), host: f.host });
  assert.equal(result.outcome, 'awaiting_user_experience');
  const current = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(current.continuation.windows.length, 1); assert.equal(current.continuation.windows[0].startedAt, window.startedAt); assert.equal(current.continuation.windows[0].deadlineAt, window.deadlineAt);
  assert.deepEqual(current.run.humanDecisions, first.run.humanDecisions);
  const snapshot = await readFile(join(f.root, 'snapshot.json'), 'utf8'), calls = [...f.calls];
  await assert.rejects(runCli(['resume', f.root, '--window', 'wrong-window'], { ...streams(), host: f.host }), /窗口/);
  await assert.rejects(runCli(['resume', f.root], { ...streams(), host: f.host }), /--window/);
  await assert.rejects(runCli(args(f.root), { ...streams(), host: f.host }), /首个/);
  assert.equal(await readFile(join(f.root, 'snapshot.json'), 'utf8'), snapshot); assert.deepEqual(f.calls, calls);
});

test('missing response receipts retain unknown exposure and same-window resume cannot repeat a provider call', async t => {
  const f = await continuationSessionFixture(t, { unknownAuthor: true }), first: any = await runCli(args(f.root), { ...streams(id => `confirm ${id}\n`), host: f.host });
  assert.equal(first.outcome, 'incomplete'); assert.equal(first.status.unknownRequestIds.length, 1);
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), window = state.continuation.windows[0], calls = [...f.calls];
  const resumed: any = await runCli(['resume', f.root, '--window', window.windowId], { ...streams(), host: f.host });
  assert.equal(resumed.outcome, 'incomplete'); assert.deepEqual(f.calls, calls); assert.deepEqual(resumed.status.unknownRequestIds, first.status.unknownRequestIds);
  assert.equal(JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')).continuation.windows[0].deadlineAt, window.deadlineAt);
});

test('active public stop waits for owned author cleanup and ACK before closing the pipe and publishing idle proof', { timeout: 10_000 }, async t => {
  let entered!: () => void, drained = false;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const f = await continuationSessionFixture(t, { onContinuedAuthor: async signal => {
    entered(); await new Promise<void>(resolve => signal.addEventListener('abort', () => { setImmediate(() => { drained = true; resolve(); }); }, { once: true }));
  } });
  const running = runCli(args(f.root), { ...streams(id => `confirm ${id}\n`), host: f.host });
  await started;
  const active = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), window = active.continuation.windows[0];
  const ack: any = await runCli(['stop', f.root, '--window', window.windowId], streams());
  assert.equal(drained, true); assert.equal(ack.windowId, window.windowId); assert.equal(ack.stopped, true);
  const result: any = await running, final = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.equal(result.outcome, 'incomplete'); assert.equal(final.continuation.windows[0].stopReason.code, 'manual');
  assert.deepEqual(final.stopReason, f.original.stopReason); assert.equal(final.continuation.windows[0].deadlineAt, window.deadlineAt);
  assert.equal(final.tasks.at(-1).attempts.length, 1); assert.equal(final.tasks.at(-1).attempts[0].outcome, 'cancelled');
  assert.equal(final.events.at(-1).type, 'window_owner_drained');
  assert.ok(await readFile(join(f.root, `idle-receipts/${window.windowId}/revision-${final.revision}.json`)));
  await assert.rejects(readFile(join(f.root, '.controller.lock')), { code: 'ENOENT' });
  await assert.rejects(readFile(join(f.root, 'cli-control.json')), { code: 'ENOENT' });
});

for (const role of ['design', 'art'] as const) test(`public continuation rebuilds the complete downstream DAG after original ${role} cancellation`, async t => {
  const f = await continuationSessionFixture(t, { interruptRole: role }), before = [...f.calls];
  const result: any = await runCli(args(f.root), { ...streams(id => `confirm ${id}\n`), host: f.host });
  assert.equal(result.outcome, 'awaiting_user_experience');
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), window = state.continuation.windows[0];
  const tasks = state.tasks.filter((task: any) => window.grants.some((grant: any) => grant.taskId === task.taskId));
  assert.equal(tasks.length, role === 'design' ? 3 : 2); assert.ok(tasks.every((task: any) => task.state === 'passed' && task.attempts.length === 1));
  for (const task of tasks) for (const dep of task.dependsOn) {
    const parent = state.tasks.find((item: any) => item.taskId === dep.taskId);
    assert.ok(parent.artifacts.every((ref: any) => task.inputs.some((input: any) => JSON.stringify(input) === JSON.stringify(ref))));
  }
  if (role === 'art') assert.equal(f.calls.slice(before.length).some(call => call.startsWith('design:')), false);
  assert.deepEqual(state.tasks.slice(0, f.original.tasks.length), f.original.tasks); assert.equal(result.originalResult.outcome, 'not_met');
});

test('a new window task failure retains its one attempt and cannot start automatic repair on resume', async t => {
  const f = await continuationSessionFixture(t, { failContinuationPlay: true });
  const first: any = await runCli(args(f.root), { ...streams(id => `confirm ${id}\n`), host: f.host });
  assert.equal(first.outcome, 'incomplete'); const calls = [...f.calls];
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), window = state.continuation.windows[0];
  assert.equal(state.tasks.at(-1).state, 'failed'); assert.equal(state.tasks.at(-1).attempts.length, 1);
  assert.equal(window.quote.proposed.attemptPolicy.automaticRepairs, 0);
  const resumed: any = await runCli(['resume', f.root, '--window', window.windowId], { ...streams(), host: f.host });
  assert.equal(resumed.outcome, 'incomplete'); assert.deepEqual(f.calls, calls);
  const final = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8'));
  assert.deepEqual(final.tasks, state.tasks); assert.deepEqual(final.ledger, state.ledger); assert.deepEqual(final.continuation, state.continuation);
  await assert.rejects(readFile(join(f.root, 'repair-plan.json')), { code: 'ENOENT' });
});
