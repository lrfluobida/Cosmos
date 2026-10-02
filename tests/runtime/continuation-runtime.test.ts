import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { executeTaskDag, resumeTaskDag } from '../../src/runtime/orchestrator.ts';
import { readRunStatus } from '../../src/cli/control.ts';
import { runtimeFixture } from './continuation-runtime.fixture.ts';

test('explicit v2 pipeline uses the active clock, reuses fixed passed evidence and bills only its new task including one review correction', async t => {
  const f = await runtimeFixture(t), before = await f.state(), originalOrigin = await f.originalTaskBytes(), oldCalls = [...f.calls];
  const result = await resumeTaskDag(f.options());
  assert.deepEqual(result.blocked, []); assert.deepEqual(result.tasks.map(task => task.state), ['passed', 'passed']);
  assert.deepEqual(result.reusedTaskIds, ['design-task']); assert.deepEqual(f.calls.filter(call => call.endsWith(':design-task')), oldCalls.filter(call => call.endsWith(':design-task')));
  const state = await f.state(); assert.deepEqual(state.tasks.find(task => task.taskId === 'design-task'), before.tasks.find(task => task.taskId === 'design-task'));
  assert.deepEqual(state.stopReason, f.original.stopReason); assert.equal(state.run.originalDeadlineAt, f.original.run.originalDeadlineAt);
  assert.equal(state.continuation!.windows[0].stopReason, null); assert.equal(state.continuation!.windows[0].verification.artifactReuse, 'pending_task_validation');
  const entries = state.ledger.entries.slice(before.ledger.entries.length); assert.equal(entries.length, 3); assert.ok(entries.every(entry => entry.taskId === f.next.task.taskId));
  assert.ok(state.requests.slice(before.requests.length).every(request => request.windowId === f.window.windowId));
  const packet = f.packets.find(item => item.taskId === f.next.task.taskId && item.role === 'coding');
  assert.equal(packet.budget.originalDeadlineAt, f.original.run.originalDeadlineAt); assert.equal(packet.budget.executionWindow.deadlineAt, f.window.deadlineAt);
  assert.equal(packet.budget.executionWindow.windowId, f.window.windowId); assert.equal(packet.budget.executionWindow.taskGrantMicroCny, f.next.task.budget.allocationMicroCny);
  assert.equal(await f.originalTaskBytes(), originalOrigin); const origin = JSON.parse(await readFile(join(f.root, `journal/task-${f.next.task.taskId}/origin.json`), 'utf8'));
  assert.equal(origin.formatVersion, 2); assert.equal(origin.executionWindow.windowId, f.window.windowId);
  const calls = [...f.calls]; await f.reopen(); const resumed = await resumeTaskDag(f.options()); assert.deepEqual(resumed.blocked, []); assert.deepEqual(f.calls, calls);
});

test('v2 role construction cannot create another provider session for a historical passed task', async t => {
  const f = await runtimeFixture(t), before = await f.state(), count = f.packets.length;
  await assert.rejects(f.roleFactory({ controller: f.controller, role: 'design', task: before.tasks.find(task => task.taskId === 'design-task')!,
    requirement: f.requirement, workspace: f.root, stateDirectory: join(f.root, 'forbidden-session') }), /authority|window|closed/i);
  assert.equal(f.packets.length, count); assert.deepEqual(await f.state(), before);
});

for (const windowId of [undefined, 'wrong-window']) test(`v2 DAG requires the exact explicit window (${windowId}) before writing or dispatching`, async t => {
  const f = await runtimeFixture(t), before = await f.state(), calls = [...f.calls];
  await assert.rejects(resumeTaskDag({ ...f.options(), windowId } as any), /window|continuation/i);
  await assert.rejects(executeTaskDag({ ...f.options(), tasks: [f.next], windowId } as any), /window|continuation/i);
  assert.deepEqual(await f.state(), before); assert.deepEqual(f.calls, calls);
});

test('read-only status distinguishes the old hard stop from the current active window', async t => {
  const f = await runtimeFixture(t), before = await readFile(join(f.root, 'snapshot.json'), 'utf8'), status = await readRunStatus(f.root);
  assert.equal(status.stopped, false); assert.equal(status.original.stopReason.code, 'manual'); assert.equal(status.executionWindow.windowId, f.window.windowId);
  assert.equal(status.executionWindow.deadlineAt, f.window.deadlineAt); assert.equal(status.original.originalDeadlineAt, f.original.run.originalDeadlineAt);
  assert.equal(await readFile(join(f.root, 'snapshot.json'), 'utf8'), before);
});

test('a mismatched window guard cannot expire the real window as a side effect', async t => {
  const f = await runtimeFixture(t), before = await readFile(join(f.root, 'snapshot.json'), 'utf8'), calls = [...f.calls]; f.advance(60_001);
  await assert.rejects(resumeTaskDag({ ...f.options(), windowId: 'wrong-window' }), /window/i);
  assert.equal(await readFile(join(f.root, 'snapshot.json'), 'utf8'), before); assert.deepEqual(f.calls, calls);
  const result = await resumeTaskDag(f.options()); assert.ok(result.blocked.length); assert.deepEqual(f.calls, calls);
  const state = await f.state(); assert.equal(state.continuation!.windows[0].stopReason?.code, 'deadline'); assert.deepEqual(state.stopReason, f.original.stopReason);
});

test('new window origins bind their exact window and cannot substitute a matching old deadline', async t => {
  const f = await runtimeFixture(t), path = join(f.root, `journal/task-${f.next.task.taskId}/origin.json`), origin = JSON.parse(await readFile(path, 'utf8')), calls = [...f.calls];
  origin.executionWindow.windowId = 'different-window'; await writeFile(path, JSON.stringify(origin), 'utf8');
  const result = await resumeTaskDag(f.options()); assert.ok(result.blocked.some(item => item.taskId === f.next.task.taskId && /origin|policy|window/.test(item.reason)));
  assert.deepEqual(f.calls, calls); assert.equal((await f.state()).tasks.find(task => task.taskId === f.next.task.taskId)!.attempts.length, 0);
});

test('explicit window execution still requires a journal and quoted source contract', async t => {
  const f = await runtimeFixture(t), before = await f.state(), calls = [...f.calls];
  await assert.rejects(executeTaskDag({ ...f.options(), tasks: [f.next], recovery: undefined }), /journal/i);
  const changed = structuredClone(f.next); changed.task.objective = 'Unquoted work';
  await assert.rejects(resumeTaskDag({ ...f.options(), tasks: [f.originals[0], changed] }), /quoted|objective|source/i);
  assert.deepEqual(await f.state(), before); assert.deepEqual(f.calls, calls);
});

test('fresh execute cannot bypass a missing ancestor DAG and changed ancestor evidence by supplying its artifact refs', async t => {
  const f = await runtimeFixture(t, { prepareNew: false }), ancestor = f.original.tasks.find(task => task.taskId === 'design-task')!;
  await writeFile(join(f.root, ancestor.evidence[0].source.location), '{"changed":true}', 'utf8');
  const before = await f.state(), calls = [...f.calls], files = (await readdir(f.root, { recursive: true })).sort();
  const attempt = await executeTaskDag({ ...f.options(), tasks: [f.next], scheduling: undefined, availableArtifacts: [...f.requirement.sources, ...ancestor.artifacts] })
    .then(tasks => ({ tasks, error: undefined as unknown }), error => ({ tasks: [], error }));
  assert.ok(attempt.error, JSON.stringify({ states: attempt.tasks.map(task => task.state), ancestorRecoveryChecks: f.recoveryChecks.length,
    newRoleCalls: f.calls.slice(calls.length).filter(call => /^(design|coding|reviewer):/.test(call)).length }));
  assert.deepEqual(await f.state(), before); assert.deepEqual(f.calls, calls); assert.deepEqual((await readdir(f.root, { recursive: true })).sort(), files);
  assert.equal((await f.state()).tasks.some(task => task.taskId === f.next.task.taskId), false);
});

for (const mode of ['deleted-edge', 'deleted-input', 'changed-input-version']) test(`window resume rejects ${mode} in a quoted successor before a new request`, async t => {
  const f = await runtimeFixture(t, { alterNewTask: task => {
    if (mode === 'deleted-edge') { task.dependsOn = []; task.inputs = task.inputs.filter(ref => ref.artifactId !== 'design'); }
    if (mode === 'deleted-input') task.inputs = task.inputs.filter(ref => ref.artifactId !== 'design');
    if (mode === 'changed-input-version') task.inputs.find(ref => ref.artifactId === 'design')!.version = 'unquoted-v2';
  } });
  const before = await f.state(), calls = [...f.calls], files = (await readdir(f.root, { recursive: true })).sort();
  await assert.rejects(resumeTaskDag({ ...f.options(), tasks: mode === 'deleted-edge' ? [f.next] : f.options().tasks,
    availableArtifacts: f.next.task.inputs }), /depend|input|source|binding/i);
  assert.deepEqual(await f.state(), before); assert.deepEqual(f.calls, calls); assert.deepEqual((await readdir(f.root, { recursive: true })).sort(), files);
  assert.equal((await f.state()).tasks.find(task => task.taskId === f.next.task.taskId)!.attempts.length, 0);
});

test('a full window resume rejects changed passed-ancestor evidence before registering an unstarted successor', async t => {
  const f = await runtimeFixture(t, { prepareNew: false }), ancestor = f.original.tasks.find(task => task.taskId === 'design-task')!;
  await writeFile(join(f.root, ancestor.evidence[0].source.location), '{"changed":true}', 'utf8');
  const before = await f.state(), calls = [...f.calls], files = (await readdir(f.root, { recursive: true })).sort();
  await assert.rejects(resumeTaskDag(f.options()), /content|signature|evidence|ancestor/i);
  assert.deepEqual(await f.state(), before); assert.deepEqual(f.calls, calls); assert.deepEqual((await readdir(f.root, { recursive: true })).sort(), files);
});

test('resume also rejects omission of an unchanged passed ancestor before a fresh task or journal can be registered', async t => {
  const f = await runtimeFixture(t, { prepareNew: false }), ancestor = f.original.tasks.find(task => task.taskId === 'design-task')!;
  const before = await f.state(), files = (await readdir(f.root, { recursive: true })).sort(), calls = [...f.calls];
  await assert.rejects(resumeTaskDag({ ...f.options(), tasks: [f.next], availableArtifacts: [...f.requirement.sources, ...ancestor.artifacts] }), /complete.*DAG|include dependency/i);
  assert.deepEqual(await f.state(), before); assert.deepEqual(f.calls, calls); assert.deepEqual((await readdir(f.root, { recursive: true })).sort(), files);
});

test('quoted upstream successors bind a new fixed version and complete their dependent within the same window', async t => {
  const f = await runtimeFixture(t, { failDesign: true }), before = await f.state();
  const result = await resumeTaskDag(f.options()); assert.deepEqual(result.blocked, []); assert.deepEqual(result.tasks.map(task => task.state), ['passed', 'passed']);
  const parent = f.additions.find(item => item.role === 'design')!;
  assert.equal(f.next.task.dependsOn[0].taskId, parent.task.taskId); assert.deepEqual(f.next.task.inputs.find(ref => ref.artifactId === 'design'), parent.expectedArtifacts![0]);
  assert.equal(parent.expectedArtifacts![0].version, 'continued-v1'); assert.deepEqual((await f.state()).tasks.slice(0, before.tasks.length - 2), before.tasks.slice(0, before.tasks.length - 2));
  assert.ok((await f.state()).requests.slice(before.requests.length).every(request => request.windowId === f.window.windowId));
});

test('a window call cannot silently omit another quoted successor from its complete DAG', async t => {
  const f = await runtimeFixture(t, { failDesign: true }), before = await f.state(), calls = [...f.calls];
  await assert.rejects(resumeTaskDag({ ...f.options(), tasks: [f.additions.find(item => item.role === 'design')!] }), /complete|quoted/i);
  assert.deepEqual(await f.state(), before); assert.deepEqual(f.calls, calls);
});
