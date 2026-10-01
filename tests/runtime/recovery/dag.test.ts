import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as runtime from '../../../src/runtime/orchestrator.ts';
import { SnapshotStore } from '../../../src/runtime/store.ts';
import { dagFixture, time } from './dag-fixture.ts';

async function interrupted(t: test.TestContext, point: string, clock?: () => number) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-recovery-dag-'));
  let fixture: Awaited<ReturnType<typeof dagFixture>> | undefined;
  t.after(async () => { await fixture?.controller.close(); await rm(root, { recursive: true, force: true }); });
  const child = spawn(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./dag-worker.ts', import.meta.url)), root, point], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, env: { SYSTEMROOT: process.env.SYSTEMROOT } });
  let errors = ''; child.stderr.on('data', bytes => { errors += bytes.toString(); });
  const [code] = await once(child, 'close'); assert.equal(code, 23, errors);
  await SnapshotStore.recover(join(root, 'state'));
  fixture = await dagFixture(root, false, '', clock); return fixture;
}

test('recover published capture without reauthoring, then repeated recovery reuses the passed task', async t => {
  const f = await interrupted(t, 'after-capture');
  assert.equal(typeof runtime.resumeTaskDag, 'function');
  const before = await f.controller.read();
  const result = await runtime.resumeTaskDag(f.options);
  assert.equal(result.tasks[0].state, 'passed'); assert.deepEqual(result.blocked, []);
  assert.deepEqual(await f.calls(), ['author', 'capture', 'verify', 'review']);
  assert.equal(result.tasks[0].attempts.length, 1);
  assert.equal(result.tasks[0].attempts[0].attemptId, before.tasks[0].attempts[0].attemptId);
  const after = await f.controller.read();
  const repeated = await runtime.resumeTaskDag(f.options);
  assert.deepEqual(repeated.reusedTaskIds, ['code']); assert.deepEqual(await f.controller.read(), after);
  assert.equal(after.run.originalDeadlineAt, before.run.originalDeadlineAt); assert.equal(after.run.fees.settledMicroCny, 20);
  const denied = await runtime.resumeTaskDag({ ...f.options, recovery: { ...f.options.recovery!, recoverCapture: async () => null } });
  assert.equal(denied.blocked.length, 1); assert.equal(denied.tasks[0].state, 'passed');
  assert.deepEqual(await f.controller.read(), after); assert.deepEqual(await f.calls(), ['author', 'capture', 'verify', 'review']);
});

test('recover recorded host evidence and only perform the missing independent review', async t => {
  const f = await interrupted(t, 'before-review');
  assert.equal(typeof runtime.resumeTaskDag, 'function');
  const result = await runtime.resumeTaskDag(f.options);
  assert.equal(result.tasks[0].state, 'passed'); assert.deepEqual(await f.calls(), ['author', 'capture', 'verify', 'review']);
});

test('a durable legitimate verdict completes its original actor commit without another paid review', async t => {
  const f = await interrupted(t, 'review-commit');
  assert.equal(typeof runtime.resumeTaskDag, 'function');
  const before = await f.controller.read(), calls = await f.calls();
  const result = await runtime.resumeTaskDag(f.options);
  assert.equal(result.tasks[0].state, 'passed'); assert.equal(result.tasks[0].review.reviewerId, 'reviewer-1');
  assert.deepEqual(await f.calls(), calls); assert.deepEqual((await f.controller.read()).ledger, before.ledger);
});

for (const point of ['author-lost', 'before-capture', 'after-verify', 'review-lost', 'correction-lost', 'unknown-lost']) test(`unprovable ${point} stays blocked without a replacement attempt or request`, async t => {
  const f = await interrupted(t, point);
  assert.equal(typeof runtime.resumeTaskDag, 'function');
  const before = await f.controller.read(), calls = await f.calls();
  const result = await runtime.resumeTaskDag(f.options);
  assert.equal(result.blocked.length, 1); assert.deepEqual(await f.calls(), calls); assert.deepEqual(await f.controller.read(), before);
  if (point === 'unknown-lost') { assert.equal(before.run.fees.reservedMicroCny, 100); assert.equal(before.ledger.entries[0].status, 'unknown'); }
  if (point === 'correction-lost') {
    const correction = JSON.parse(await readFile(join(before.tasks[0].attempts[0].sessionRef, 'review-correction.json'), 'utf8'));
    assert.equal(correction.used, 1); assert.equal(correction.reviewerId, 'reviewer-1');
  }
});

test('registered but unstarted work executes once under the original task identity', async t => {
  const f = await interrupted(t, 'registered');
  const result = await runtime.resumeTaskDag(f.options);
  assert.equal(result.tasks[0].state, 'passed'); assert.equal(result.tasks[0].taskId, 'code');
  assert.deepEqual(await f.calls(), ['author', 'capture', 'verify', 'review']);
});

test('a completed attempt awaiting the final reviewer commit keeps its original endedAt', async t => {
  const f = await interrupted(t, 'verdict-saved');
  const before = await f.controller.read(), calls = await f.calls();
  const result = await runtime.resumeTaskDag(f.options);
  assert.equal(result.tasks[0].state, 'passed'); assert.deepEqual(result.tasks[0].attempts, before.tasks[0].attempts); assert.deepEqual(await f.calls(), calls);
});

test('changed expected outputs, ownership and correction policy cannot authorize recovery', async t => {
  const f = await interrupted(t, 'before-review'), calls = await f.calls(), before = await f.controller.read();
  const changed = structuredClone(f.options.tasks); changed[0].task.ownership.writePaths = [];
  assert.equal((await runtime.resumeTaskDag({ ...f.options, tasks: changed })).blocked.length, 1);
  const output = structuredClone(f.options.tasks); output[0].expectedArtifacts![0].version = 'v2';
  assert.equal((await runtime.resumeTaskDag({ ...f.options, tasks: output })).blocked.length, 1);
  assert.equal((await runtime.resumeTaskDag({ ...f.options, reviewProtocolCorrections: 0 })).blocked.length, 1);
  assert.deepEqual(await f.calls(), calls); assert.deepEqual(await f.controller.read(), before);
});

test('a replayed verdict cannot change its original reviewer identity', async t => {
  const f = await interrupted(t, 'review-commit'), before = await f.controller.read(), calls = await f.calls();
  const path = join(f.root, 'recovery/task-code/review.json'), record = JSON.parse(await readFile(path, 'utf8'));
  record.value.reviewerId = 'different-reviewer'; await writeFile(path, JSON.stringify(record), 'utf8');
  assert.equal((await runtime.resumeTaskDag(f.options)).blocked.length, 1);
  assert.deepEqual(await f.controller.read(), before); assert.deepEqual(await f.calls(), calls);
});

test('default execution remains opt-out and never creates recovery receipts', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-recovery-default-')), f = await dagFixture(root, true);
  t.after(async () => { await f.controller.close(); await rm(root, { recursive: true, force: true }); });
  const { recovery: _recovery, ...options } = f.options;
  assert.equal((await runtime.executeTaskDag(options))[0].state, 'passed');
  await assert.rejects(readFile(join(root, 'recovery/task-code/origin.json')), /ENOENT/);
});

test('caller cancellation after origin persistence but before task registration returns blocked without mutation', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-recovery-unregistered-')), f = await dagFixture(root, true);
  t.after(async () => { await f.controller.close(); await rm(root, { recursive: true, force: true }); });
  const controller = new Proxy(f.controller, { get(target, key) {
    if (key === 'registerTasks') return async () => { throw new Error('Fixture stopped before registration'); };
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } });
  await assert.rejects(runtime.executeTaskDag({ ...f.options, controller }), /Fixture stopped before registration/);
  const before = await f.controller.read(); assert.equal(before.tasks.length, 0);
  const abort = new AbortController(); abort.abort(new Error('Caller cancelled'));
  const result = await runtime.resumeTaskDag({ ...f.options, signal: abort.signal });
  assert.equal(result.blocked.length, 1); assert.match(result.blocked[0].reason, /cancel.*before.*registration/i);
  assert.equal(result.tasks[0].attempts.length, 0); assert.deepEqual(await f.calls(), []);
  assert.deepEqual(await f.controller.read(), before);
});

for (const outcome of ['failed', 'cancelled'] as const) test(`recovery preserves a ${outcome} terminal task and its COS-11 history`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-recovery-terminal-')), f = await dagFixture(root, true);
  t.after(async () => { await f.controller.close(); await rm(root, { recursive: true, force: true }); });
  const factory = f.options.roleFactory, abort = new AbortController();
  if (outcome === 'failed') f.options.roleFactory = async input => {
    const role = await factory(input);
    return input.role === 'reviewer' ? role : { ...role, async prompt(...args) { const response = await role.prompt(...args); return { text: JSON.stringify({ ...JSON.parse(response.text), remaining: ['Real unfinished author work'] }) }; } };
  };
  else { const verify = f.options.verify; f.options.verify = async (...args) => { const result = await verify(...args); abort.abort(); return result; }; f.options.signal = abort.signal; }
  assert.equal((await runtime.executeTaskDag(f.options))[0].state, outcome);
  const before = await f.controller.read(), calls = await f.calls();
  const result = await runtime.resumeTaskDag({ ...f.options, signal: undefined });
  assert.equal(result.blocked.length, 1); assert.equal(result.tasks[0].state, outcome);
  assert.deepEqual(await f.controller.read(), before); assert.deepEqual(await f.calls(), calls);
});

test('a manual run stop stays durable during recovery without a new paid phase', async t => {
  const f = await interrupted(t, 'before-review'); await f.controller.stop('Original manual stop');
  const before = await f.controller.read(), calls = await f.calls();
  assert.equal((await runtime.resumeTaskDag(f.options)).blocked.length, 1);
  assert.deepEqual(await f.controller.read(), before); assert.deepEqual(await f.calls(), calls);
});

test('changed evidence content and a changed requirement remain blocked before any role dispatch', async t => {
  const f = await interrupted(t, 'before-review');
  assert.equal(typeof runtime.resumeTaskDag, 'function');
  const before = await f.controller.read(), calls = await f.calls();
  const changed = structuredClone(f.options.requirement); changed.acceptance[0].expected = 'weaker';
  assert.equal((await runtime.resumeTaskDag({ ...f.options, requirement: changed })).blocked.length, 1);
  await writeFile(join(f.workspace, 'evidence/report.json'), '{"passed":false}\n', 'utf8');
  assert.equal((await runtime.resumeTaskDag(f.options)).blocked.length, 1);
  assert.deepEqual(await f.controller.read(), before); assert.deepEqual(await f.calls(), calls);
});

test('reopening beyond the original deadline reports blocked without extending time or dispatching', async t => {
  const f = await interrupted(t, 'after-capture', () => time + 13 * 60 * 60 * 1000);
  assert.equal(typeof runtime.resumeTaskDag, 'function');
  const before = await f.controller.read(), calls = await f.calls();
  assert.equal(before.stopReason?.code, 'deadline');
  assert.equal((await runtime.resumeTaskDag(f.options)).blocked.length, 1);
  assert.deepEqual(await f.controller.read(), before); assert.deepEqual(await f.calls(), calls);
});
