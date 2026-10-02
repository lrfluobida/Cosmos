import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { runtimeFixture } from './continuation-runtime.fixture.ts';
import { TaskJournal } from '../../src/runtime/recovery/task-journal.ts';
import * as plans from '../../src/runtime/continuation-plan.ts';

async function fixture(t: test.TestContext, failDesign = false) {
  const f = await runtimeFixture(t, { prepareNew: false, failDesign });
  const plan = { artifactId: 'native-plan', version: 'v1', location: 'original-plan.json' };
  await writeFile(join(f.root, plan.location), JSON.stringify({ status: 'validated_proposal', specVersion: f.requirement.specVersion, tasks: f.originals }), 'utf8');
  await writeFile(join(f.root, 'execution.json'), JSON.stringify({ capability: 'offline-fixture', requirement: f.requirement, tasks: f.originals, availableArtifacts: f.requirement.sources, plan }), 'utf8');
  const input = { root: f.root, controller: f.controller, requirement: f.requirement, windowId: f.window.windowId };
  const prepared = await plans.loadContinuationPlan(input);
  const prepare = () => plans.prepareContinuationPlan({ ...input, plan: prepared, recoverCapture: f.common.recovery.recoverCapture });
  return { ...f, input, prepared, prepare, path: join(f.root, 'continuations/runtime-decision/plan.json') };
}

test('fixed window plan registers only quoted new tasks, retains original history, and reuses the same plan', async t => {
  const f = await fixture(t), before = await f.state(); await f.prepare(); const state = await f.state();
  assert.deepEqual(state.tasks.slice(0, before.tasks.length), before.tasks); assert.deepEqual(state.ledger, before.ledger); assert.deepEqual(state.continuation, before.continuation);
  const added = state.tasks.filter(task => f.window.grants.some(grant => grant.taskId === task.taskId)); assert.equal(added.length, 1); assert.equal(added[0].attempts.length, 0);
  const task = f.prepared.tasks.find((item: any) => item.task.taskId === added[0].taskId); assert.equal(task.workspace, join(f.root, 'continuations/runtime-decision/workspace'));
  assert.equal(task.expectedArtifacts[0].version, f.window.windowId); assert.notEqual(task.task.authorId, f.original.tasks[1].authorId);
  const bytes = await readFile(f.path, 'utf8'); await f.prepare(); assert.equal(await readFile(f.path, 'utf8'), bytes); assert.deepEqual(await f.state(), state);
  assert.deepEqual(await plans.loadContinuationPlan(f.input), f.prepared);
});

test('changed passed evidence blocks before a plan, new origin, or task registration', async t => {
  const f = await fixture(t), before = await f.state();
  await writeFile(join(f.root, f.original.tasks[0].evidence[0].source.location), '{"changed":true}', 'utf8');
  await assert.rejects(f.prepare(), /signature|content|evidence/i); assert.deepEqual(await f.state(), before);
  await assert.rejects(readFile(f.path), { code: 'ENOENT' });
});

test('a plan-only interruption completes the same immutable origin and registration without a new window', async t => {
  const f = await fixture(t); await mkdir(join(f.root, 'continuations/runtime-decision'), { recursive: true }); await writeFile(f.path, JSON.stringify(f.prepared), 'utf8');
  await f.prepare(); assert.equal((await f.state()).continuation!.windows[0].deadlineAt, f.window.deadlineAt);
  const origin = JSON.parse(await readFile(join(f.root, `journal/task-${f.window.grants[0].taskId}/origin.json`), 'utf8'));
  assert.equal(origin.executionWindow.windowId, f.window.windowId); assert.equal(origin.reviewProtocolCorrections, 1);
});

test('a registered task cannot manufacture a lost origin on resume', async t => {
  const f = await fixture(t); await f.prepare(); const before = await f.state();
  const path = join(f.root, `journal/task-${f.window.grants[0].taskId}/origin.json`); await rm(path);
  await assert.rejects(f.prepare(), /origin/i); assert.deepEqual(await f.state(), before); await assert.rejects(readFile(path), { code: 'ENOENT' });
});

test('unknown fresh author output blocks plan creation while old partial output remains unchanged', async t => {
  const f = await fixture(t), source = 'continuations/runtime-decision/workspace/authors/code';
  await mkdir(join(f.root, source), { recursive: true }); await writeFile(join(f.root, source, 'partial.txt'), '不可覆盖', 'utf8');
  await assert.rejects(f.prepare(), /prior|partial|output/i); assert.equal(await readFile(join(f.root, source, 'partial.txt'), 'utf8'), '不可覆盖');
  await assert.rejects(readFile(f.path), { code: 'ENOENT' });
});

test('interruption between fresh origins resumes the same group only before any registration or work', async t => {
  const f = await fixture(t, true), before = await f.state(), originalOpen = TaskJournal.open;
  let calls = 0;
  const mock = t.mock.method(TaskJournal, 'open', async (...args: Parameters<typeof TaskJournal.open>) => {
    if (args[1].formatVersion === 2 && !args[2] && ++calls === 2) throw new Error('Offline origin interruption');
    return originalOpen(...args);
  });
  await assert.rejects(f.prepare(), /origin interruption/); mock.mock.restore();
  assert.deepEqual(await f.state(), before);
  const firstOrigin = join(f.root, `journal/task-${f.window.grants[0].taskId}/origin.json`), fixed = await readFile(firstOrigin);
  await assert.rejects(readFile(join(f.root, `journal/task-${f.window.grants[1].taskId}/origin.json`)), { code: 'ENOENT' });
  await f.prepare(); assert.deepEqual(await readFile(firstOrigin), fixed);
  const current = await f.state(); assert.equal(current.tasks.length, before.tasks.length + 2); assert.deepEqual(current.ledger, before.ledger);
  assert.equal(current.continuation!.windows[0].deadlineAt, f.window.deadlineAt);
});

test('interruption after atomic registration reuses the recorded group without duplicate grants or origins', async t => {
  const f = await fixture(t), register = f.controller.registerTasks.bind(f.controller);
  const mock = t.mock.method(f.controller, 'registerTasks', async tasks => { await register(tasks); throw new Error('Offline registration interruption'); });
  await assert.rejects(f.prepare(), /registration interruption/); mock.mock.restore();
  const state = await f.state(), fixed = await readFile(f.path); await f.prepare();
  assert.deepEqual(await f.state(), state); assert.deepEqual(await readFile(f.path), fixed);
});

test('registered tasks cannot recreate a missing plan even with zero attempts', async t => {
  const f = await fixture(t); await f.prepare(); const before = await f.state(); await rm(f.path);
  await assert.rejects(f.prepare(), /missing plan/i); assert.deepEqual(await f.state(), before);
  await assert.rejects(readFile(f.path), { code: 'ENOENT' });
});

test('an unstarted task with a phase receipt is blocked before plan publication or registration', async t => {
  const f = await fixture(t), before = await f.state(), folder = join(f.root, `journal/task-${f.window.grants[0].taskId}`);
  await mkdir(folder, { recursive: true }); await writeFile(join(folder, 'author.json'), '{"unknown_prior_work":true}', 'utf8');
  await assert.rejects(f.prepare(), /prior phase/i); assert.deepEqual(await f.state(), before);
  await assert.rejects(readFile(f.path), { code: 'ENOENT' }); await assert.rejects(readFile(join(folder, 'origin.json')), { code: 'ENOENT' });
});

test('fixed execution source changes cannot be accepted by regenerating the same plan', async t => {
  const f = await fixture(t); await f.prepare(); const before = await f.state(), fixed = await readFile(f.path);
  const source = join(f.root, 'execution.json'); await writeFile(source, Buffer.concat([await readFile(source), Buffer.from('\n')]));
  await assert.rejects(plans.loadContinuationPlan(f.input), /plan|sources/i);
  assert.deepEqual(await f.state(), before); assert.deepEqual(await readFile(f.path), fixed);
});
