import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { resumeTaskDag } from '../../src/runtime/orchestrator.ts';
import { RecoveryBlocked } from '../../src/runtime/recovery/task-journal.ts';
import { runtimeFixture } from './continuation-runtime.fixture.ts';

test('preAuthor runs after fixed ancestors are checked but before any new attempt, session or provider', async t => {
  const f = await runtimeFixture(t), before = await f.state(), sessions = await readdir(join(f.root, 'sessions')), seen: string[] = [];
  const preAuthor = async (task: any, signal: AbortSignal) => {
    seen.push(task.taskId); assert.equal(task.taskId, f.next.task.taskId); assert.equal(signal.aborted, false);
    assert.ok(Object.isFrozen(task)); assert.ok(Object.isFrozen(task.inputs)); assert.ok(f.recoveryChecks.includes('design-task'));
    assert.equal(task.dependsOn[0].state, 'passed'); assert.equal(task.attempts.length, 0);
    assert.deepEqual((await f.state()).ledger.entries, before.ledger.entries);
    assert.equal((await f.state()).tasks.find(item => item.taskId === task.taskId)!.state, 'not_started');
    assert.deepEqual(await readdir(join(f.root, 'sessions')), sessions);
  };
  const result = await resumeTaskDag({ ...f.options(), preAuthor });
  assert.deepEqual(seen, [f.next.task.taskId]); assert.deepEqual(result.blocked, []);
  await f.reopen(); await resumeTaskDag({ ...f.options(), preAuthor }); assert.deepEqual(seen, [f.next.task.taskId]);
});

for (const mode of ['failure', 'cancel'] as const) test(`preAuthor ${mode} is reported without consuming the new attempt or requests`, async t => {
  const f = await runtimeFixture(t), before = await f.state(), sessions = await readdir(join(f.root, 'sessions')), calls = [...f.calls], abort = new AbortController();
  const result = await resumeTaskDag({ ...f.options(), signal: abort.signal, preAuthor: async (_task, signal) => {
    if (mode === 'cancel') { abort.abort(); assert.equal(signal.aborted, true); return; }
    throw new Error('Raw preparation error must not be copied to the handoff.');
  } });
  assert.ok(result.blocked.some(item => item.taskId === f.next.task.taskId && /preparation/i.test(item.reason)));
  assert.deepEqual(await f.state(), before); assert.deepEqual(f.calls, calls); assert.deepEqual(await readdir(join(f.root, 'sessions')), sessions);
  assert.equal((await f.state()).tasks.find(item => item.taskId === f.next.task.taskId)!.attempts.length, 0);
});

test('preAuthor is skipped when a durable author handoff resumes through its published capture', async t => {
  const f = await runtimeFixture(t); let preparations = 0;
  const preAuthor = async () => { preparations++; };
  const first = await resumeTaskDag({ ...f.options(), preAuthor, capture: async (...args) => {
    await f.common.capture(...args); throw new RecoveryBlocked('Offline interruption after the fixed capture.');
  } });
  assert.ok(first.blocked.length); assert.equal(preparations, 1);
  const authorCalls = f.calls.filter(call => call.startsWith(`coding:${f.next.task.taskId}`)).length;
  await f.reopen(); const resumed = await resumeTaskDag({ ...f.options(), preAuthor });
  assert.deepEqual(resumed.blocked, []); assert.equal(preparations, 1);
  assert.equal(f.calls.filter(call => call.startsWith(`coding:${f.next.task.taskId}`)).length, authorCalls);
});

test('changed ancestor evidence prevents preAuthor from touching the author workspace', async t => {
  const f = await runtimeFixture(t), ancestor = f.original.tasks.find(task => task.taskId === 'design-task')!; let preparations = 0;
  const path = join(f.root, ancestor.evidence[0].source.location); await writeFile(path, '{"changed":true}', 'utf8');
  const before = await readFile(join(f.root, 'snapshot.json'), 'utf8');
  await assert.rejects(resumeTaskDag({ ...f.options(), preAuthor: async () => { preparations++; } }), /content|signature/i);
  assert.equal(preparations, 0); assert.equal(await readFile(join(f.root, 'snapshot.json'), 'utf8'), before);
});
