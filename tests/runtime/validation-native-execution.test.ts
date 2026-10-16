import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { groupFixture } from './validation-group.fixture.ts';
import { RunController } from '../../src/runtime/run.ts';

async function fixture(t: test.TestContext) {
  const f = await groupFixture(t), value = await f.claim(await f.declaration('cos20-native-execution'));
  const task = await f.register(value, 'coding');
  const binding = { caseId: value.window.caseId, windowId: value.window.windowId, taskId: task.taskId, deadlineAt: Date.parse(value.window.deadlineAt) };
  assert.equal(typeof (value.controller as any).requireNativeValidationExecution, 'function', 'The controller must expose the fixed-candidate live execution check');
  return { ...f, ...value, task, binding, check: (input = binding, signal = new AbortController().signal) => value.controller.requireNativeValidationExecution(input, signal) };
}

test('COS98 live execution uses current authority without identity or source reads and accepts legal concurrent reserved exposure', async t => {
  const f = await fixture(t); await f.check(); await f.register(f, 'art');
  await f.controller.reserve(f.request(f, 'art', 'parallel', 100));
  const source = join(f.repositoryRoot, 'group.json'), original = await readFile(source);
  await writeFile(source, 'changed source bytes', 'utf8');
  let reads = 0;
  const identity = t.mock.method((f.controller as any).validationContext, 'identityReader', async () => { reads++; throw new Error('No live identity read'); });
  await f.check(); assert.equal(reads, 0); identity.mock.restore();
  await assert.rejects(f.controller.requireValidationHost(f.window.caseId, f.window.windowId, join(f.repositoryRoot, '.cosmos/e2e', f.window.caseId)), /reconciliation/i);
  await writeFile(source, original);
});

test('COS98 live execution rejects mismatched binding and unknown tasks', async t => {
  const f = await fixture(t);
  for (const change of [{ caseId: 'other' }, { windowId: 'other' }, { taskId: 'other' }, { deadlineAt: f.binding.deadlineAt + 1 }])
    await assert.rejects(f.check({ ...f.binding, ...change }), /case|window|task|deadline|grant/i);
});

for (const mode of ['reserved', 'case-budget', 'unknown', 'requests', 'stop', 'finished', 'closed'] as const) test(`COS98 live execution rejects ${mode} using controller state`, async t => {
  const f = await fixture(t);
  if (mode === 'reserved') await f.controller.reserve(f.request(f, 'coding', 'full-task', f.declaration.grants.coding.amountMicroCny));
  if (mode === 'case-budget') {
    await f.register(f, 'art'); await f.controller.reserve(f.request(f, 'art', 'full-case-art', 2500000));
    await f.controller.reserve(f.request(f, 'coding', 'full-case-coding', 2500000));
  }
  if (mode === 'unknown') {
    await f.controller.reserve(f.request(f, 'planning', 'uncertain', 100)); await f.controller.admit('uncertain'); await f.controller.markUnknown('uncertain', f.evidence);
  }
  if (mode === 'requests') {
    // Exercise the exact request ceiling with real controller persistence, no provider dispatch.
    for (let index = 0; index < f.declaration.limits.maxRequests; index++) await f.controller.reserve(f.request(f, 'planning', `limit-${index}`, 8));
  }
  if (mode === 'stop') await f.controller.stop('Explicit native fixture stop');
  if (mode === 'closed') await f.controller.close();
  if (mode === 'finished') {
    f.task.state = 'cancelled'; f.task.stateReason = 'Synthetic completed execution';
    await f.controller.saveTask(f.task, { role: 'system', actorId: 'fixture' });
  }
  if (mode === 'stop') await assert.rejects(f.check(), error => error === f.controller.signal.reason);
  else await assert.rejects(f.check(), /authority|admission|closed|stop|cancel|active/i);
});

test('COS98 live execution expires through the original durable controller queue', async t => {
  const f = await fixture(t); t.mock.method(f.controller as any, 'now', () => f.binding.deadlineAt);
  await assert.rejects(f.check(), error => error === f.controller.signal.reason);
  const state = await f.controller.read(); assert.equal(state.validation!.cases.at(-1)!.stopReason!.code, 'deadline');
  assert.equal(state.run.state, 'waiting_user');
});

test('COS98 accounting-only validation owners cannot execute fixed candidates', async t => {
  const f = await fixture(t); await f.controller.close();
  const accounting = await RunController.openValidationCase({ ...f, caseId: f.window.caseId, windowId: f.window.windowId, accountingOnly: true });
  try { await assert.rejects(accounting.requireNativeValidationExecution(f.binding, new AbortController().signal), /Accounting-only/i); }
  finally { await accounting.close(); }
});

test('COS98 live execution preserves exact caller cancellation before and inside the serial queue', async t => {
  const f = await fixture(t), caller = new AbortController(), reason = new Error('Exact caller stop'); caller.abort(reason);
  await assert.rejects(f.check(f.binding, caller.signal), error => error === reason);
  const queued = new AbortController(), active = f.check(f.binding, queued.signal); queued.abort(reason);
  await assert.rejects(active, error => error === reason);
});

test('COS98 source changes remain detectable by the original full boundary guard', async t => {
  const f = await fixture(t), source = join(f.repositoryRoot, 'group.json');
  await writeFile(source, 'changed boundary source', 'utf8'); await f.check();
  await assert.rejects(f.controller.requireValidationHost(f.window.caseId, f.window.windowId, join(f.repositoryRoot, '.cosmos/e2e', f.window.caseId)), /source|requirements|input|hash/i);
});
