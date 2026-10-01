import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as successors from '../../src/runtime/entrypoint-successors.ts';
import { RunController } from '../../src/runtime/run.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import { TaskJournal } from '../../src/runtime/recovery/task-journal.ts';
import { publishReceipt } from '../../src/runtime/recovery/receipt-file.ts';
import { fixture, output } from './entrypoint-successors.fixture.ts';

async function setup(t: test.TestContext, failedId = 'design') {
  assert.equal(typeof successors.prepareRepairContinuation, 'function', 'Continuation needs a durable preparation boundary');
  const f = fixture(failedId), root = await mkdtemp(join(tmpdir(), 'cosmos-continuation-'));
  f.originals.forEach(item => { item.workspace = root; });
  const store = await SnapshotStore.acquire(root); await store.write(f.snapshot); await store.close();
  let controller = await RunController.open({ root, now: () => f.now });
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  for (const folder of ['requirements', 'sessions/planning', 'authors/design', 'authors/art', 'authors/coding', 'repair-feedback']) await mkdir(join(root, folder), { recursive: true });
  await writeFile(join(root, 'requirements/v1.json'), JSON.stringify(f.requirement), 'utf8');
  await writeFile(join(root, f.originalPlan.location), JSON.stringify({ status: 'validated_proposal', specVersion: f.requirement.specVersion, tasks: f.originals }), 'utf8');
  const recovery = { journalRoot: join(root, 'journal'), artifactRoot: root };
  const origin = (prepared: typeof f.originals[number]) => ({ formatVersion: 1 as const, runId: f.snapshot.run.runId, ledgerId: f.snapshot.ledger.ledgerId,
    originalStartedAt: f.snapshot.run.originalStartedAt, originalDeadlineAt: f.snapshot.run.originalDeadlineAt, limitMicroCny: f.snapshot.ledger.limitMicroCny,
    requirement: f.requirement, prepared, reviewProtocolCorrections: 1 as const, artifactRoot: root, sessionRoot: join(root, 'sessions') });
  for (const item of f.originals) await TaskJournal.open(recovery, origin(item), false);
  const failed = f.snapshot.tasks.find(task => task.taskId === failedId)!, attempt = failed.attempts[0];
  const diagnostic = { artifactId: `failure-source-${failedId}`, version: attempt.attemptId, location: `failure-sources/${failedId}/${attempt.attemptId}` };
  f.feedback.issues[0].evidenceRefs = [`${diagnostic.location}/manifest.json`];
  await writeFile(join(root, f.feedback.reference.location), JSON.stringify(f.feedback), 'utf8');
  await mkdir(join(root, diagnostic.location), { recursive: true });
  await writeFile(join(root, diagnostic.location, 'raw.json'), '{"原始错误":', 'utf8');
  await writeFile(join(root, diagnostic.location, 'manifest.json'), JSON.stringify({ formatVersion: 1, runId: failed.runId, taskId: failedId, attemptId: attempt.attemptId,
    sessionRef: attempt.sessionRef, inputs: failed.inputs, diagnosis: { kind: 'invalid_json', message: 'Original JSON is incomplete.' },
    files: [{ sourcePath: `authors/${failedId}/broken.json`, snapshotPath: 'raw.json', present: true }] }), 'utf8');
  await writeFile(join(root, `authors/${failedId}/broken.json`), '{"原始错误":', 'utf8');
  const candidates = [f.originals.find(item => item.task.taskId === failedId)!, ...successors.findUnstartedSuccessors(f.snapshot, f.originals, failedId)];
  const grants = successors.allocateRepairGrants(f.snapshot, candidates);
  const targets = candidates.map(item => ({ sourceTaskId: item.task.taskId, taskId: `${item.task.taskId}-${item.task.taskId === failedId ? 'repair' : 'successor'}`,
    allocationMicroCny: grants[item.task.taskId], outputs: item.task.outputs.map(value => ({ ...value, destination: output(item.role, 'v2').location })), expectedArtifacts: [output(item.role, 'v2')],
    ...(item.task.taskId === failedId ? { interfaces: [diagnostic] } : {}) }));
  const plan = successors.buildRepairContinuation({ ...f, targets });
  const options = () => ({ root, controller, plan, originals: f.originals, requirement: f.requirement, originalPlan: f.originalPlan, now: f.now });
  return { ...f, root, plan, recovery, origin, diagnostic, options, current: () => controller,
    reopen: async () => { await controller.close(); controller = await RunController.open({ root, now: () => f.now }); } };
}

test('group plan, all origins and allocations are durable before any first attempt, and registration is idempotent', async t => {
  const f = await setup(t), old = await f.current().read();
  await successors.prepareRepairContinuation(f.options());
  const state = await f.current().read();
  assert.deepEqual(state.tasks.slice(0, old.tasks.length), old.tasks); assert.deepEqual(state.ledger.allocations.slice(0, old.ledger.allocations.length), old.ledger.allocations);
  assert.equal(state.ledger.allocations.reduce((sum, item) => sum + item.amountMicroCny, 0), state.ledger.limitMicroCny);
  assert.deepEqual(JSON.parse(await readFile(join(f.root, 'repair-plan.json'), 'utf8')), f.plan);
  for (const id of f.plan.newTaskIds) {
    const task = state.tasks.find(task => task.taskId === id)!; assert.equal(task.state, 'not_started'); assert.equal(task.attempts.length, 0);
    assert.equal(JSON.parse(await readFile(join(f.root, `journal/task-${id}/origin.json`), 'utf8')).prepared.task.taskId, id);
  }
  await f.reopen(); await successors.prepareRepairContinuation(f.options()); assert.deepEqual(await f.current().read(), state);
});

for (const boundary of ['plan-only', 'partial-origins', 'registered']) test(`a committed ${boundary} boundary resumes the same map without new grants or timing`, async t => {
  const f = await setup(t, 'art'); await publishReceipt(join(f.root, 'repair-plan.json'), f.plan);
  const additions = f.plan.tasks.filter(item => f.plan.newTaskIds.includes(item.task.taskId));
  if (boundary === 'partial-origins') await TaskJournal.open(f.recovery, f.origin(additions[0]), false);
  if (boundary === 'registered') {
    for (const item of additions) await TaskJournal.open(f.recovery, f.origin(item), false);
    await f.current().registerTasks(additions.map(item => item.task));
  }
  await f.reopen(); await successors.prepareRepairContinuation(f.options()); const state = await f.current().read();
  assert.equal(state.tasks.length, 5); assert.equal(state.run.originalStartedAt, f.snapshot.run.originalStartedAt); assert.equal(state.run.originalDeadlineAt, f.snapshot.run.originalDeadlineAt);
  assert.equal(state.ledger.entries.length, 0); assert.equal(state.ledger.ledgerId, f.snapshot.ledger.ledgerId);
  assert.deepEqual(JSON.parse(await readFile(join(f.root, 'repair-plan.json'), 'utf8')).newTaskIds, f.plan.newTaskIds);
});

for (const unsafe of ['old-author-file', 'old-phase-receipt', 'new-output', 'missing-failure-source', 'changed-raw-source', 'unbound-diagnostic', 'new-phase-receipt']) test(`cannot prepare a fresh group with ${unsafe}`, async t => {
  const f = await setup(t), before = await f.current().read();
  if (unsafe === 'old-author-file') await writeFile(join(f.root, 'authors/art/leftover.json'), '{}', 'utf8');
  if (unsafe === 'old-phase-receipt') await writeFile(join(f.root, 'journal/task-art/author.json'), '{}', 'utf8');
  if (unsafe === 'new-output') await mkdir(join(f.root, output('art', 'v2').location), { recursive: true });
  if (unsafe === 'missing-failure-source') await rm(join(f.root, f.diagnostic.location, 'raw.json'));
  if (unsafe === 'changed-raw-source') await writeFile(join(f.root, f.diagnostic.location, 'raw.json'), '{"different":', 'utf8');
  if (unsafe === 'unbound-diagnostic') { f.feedback.issues[0].evidenceRefs = ['unrelated.json']; await writeFile(join(f.root, f.feedback.reference.location), JSON.stringify(f.feedback), 'utf8'); }
  if (unsafe === 'new-phase-receipt') { await mkdir(join(f.root, 'journal/task-art-successor'), { recursive: true }); await writeFile(join(f.root, 'journal/task-art-successor/author.json'), '{}', 'utf8'); }
  await assert.rejects(successors.prepareRepairContinuation(f.options()));
  assert.deepEqual(await f.current().read(), before); await assert.rejects(readFile(join(f.root, 'repair-plan.json')), { code: 'ENOENT' });
});

test('a partially registered group fails closed without reallocating old grants', async t => {
  const f = await setup(t); await publishReceipt(join(f.root, 'repair-plan.json'), f.plan);
  await f.current().registerTasks([f.plan.tasks.find(item => item.task.taskId === 'design-repair')!.task]); const before = await f.current().read();
  await assert.rejects(successors.prepareRepairContinuation(f.options()), /partial|registration/i); assert.deepEqual(await f.current().read(), before);
});

for (const changed of ['scope', 'acceptance', 'input', 'grant', 'plan-map']) test(`stored continuation ${changed} drift cannot become fresh authority`, async t => {
  const f = await setup(t), before = await f.current().read();
  if (changed === 'scope') f.plan.tasks[1].task.ownership.writePaths.push('requirements');
  if (changed === 'acceptance') f.plan.tasks[1].task.acceptance[0].expected = '无需验证';
  if (changed === 'input') f.plan.tasks[2].task.inputs[1] = output('design');
  if (changed === 'grant') f.plan.tasks[1].task.budget.allocationMicroCny += 1;
  if (changed === 'plan-map') f.plan.replacements.pop();
  await assert.rejects(successors.prepareRepairContinuation(f.options())); assert.deepEqual(await f.current().read(), before);
  await assert.rejects(readFile(join(f.root, 'repair-plan.json')), { code: 'ENOENT' });
});

test('a write-once plan cannot be replaced on recovery', async t => {
  const f = await setup(t); await publishReceipt(join(f.root, 'repair-plan.json'), f.plan); const before = await f.current().read();
  f.plan.tasks[1].task.objective = '另一个目标';
  await assert.rejects(successors.prepareRepairContinuation(f.options()), /write-once/i); assert.deepEqual(await f.current().read(), before);
});

test('missing origin for an already registered task is not manufactured', async t => {
  const f = await setup(t); await successors.prepareRepairContinuation(f.options()); const before = await f.current().read();
  await rm(join(f.root, 'journal/task-art-successor/origin.json'));
  await assert.rejects(successors.prepareRepairContinuation(f.options()), /origin/i); assert.deepEqual(await f.current().read(), before);
  await assert.rejects(readFile(join(f.root, 'journal/task-art-successor/origin.json')), { code: 'ENOENT' });
});
