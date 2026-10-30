import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { conservedFixture } from './ordinary-design-revision-budget.fixture.ts';
import { budgetCapacity } from '../../src/contracts/index.ts';
import { allocateRepairGrants, prepareRepairContinuation } from '../../src/runtime/entrypoint-successors.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { authenticatedOrdinaryFunding, budgetDigest } from '../../src/runtime/ordinary-design-revision-budget.ts';
import { settlePublicValidationFunding } from '../../src/runtime/public-validation-funding.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';

test('an unfunded run or raw funding flag cannot select the conserved policy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cos160-unfunded-'));
  const controller = await RunController.create({ root, runId: 'unfunded', ledgerId: 'unfunded-ledger', kind: 'runtime_generation', scope: 'generation', specVersion: '1', allocations: [{ taskId: 'planning', amountMicroCny: 1 }] });
  try {
    const state = await controller.read(), before = await readFile(join(root, 'snapshot.json'));
    assert.equal(await authenticatedOrdinaryFunding(root, state), false);
    await assert.rejects(authenticatedOrdinaryFunding(root, { ...state, validationFunding: {} } as any), /funding binding/i);
    await assert.rejects(controller.bindOrdinaryDesignBudgetLifecycle(), /funded host/);
    assert.ok((await readFile(join(root, 'snapshot.json'))).equals(before));
  } finally { await controller.close(); }
});

test('funded ordinary negative design atomically conserves unused allocation into one revision', async t => {
  const f = await conservedFixture(t); await f.execute();
  const state = await f.state(), execution = JSON.parse(await readFile(join(f.root, 'execution.json'), 'utf8'));
  assert.equal(state.ledger.contractVersion, '6.0.0');
  assert.equal(execution.ordinaryDesignRevisionBudgetPolicy, 'conserved-initial-unused/1');
  const initial = state.ledger.allocations.find((row: any) => row.taskId === 'design-task');
  const target = state.ledger.allocations.find((row: any) => row.taskId === 'design-task-revision');
  const closure = state.ledger.allocationClosures[0];
  assert.equal(initial.amountMicroCny, 1125000); assert.equal(closure.releasedMicroCny, 1125000);
  assert.equal(target.amountMicroCny, 2025000);
  assert.equal(budgetCapacity(state.ledger).allocatedMicroCny, 2525000);
  assert.equal(state.tasks.find((row: any) => row.taskId === initial.taskId).state, 'needs_changes');
  assert.equal(state.events.filter((row: any) => row.type === 'ordinary_design_revision_budget_activated').length, 1);
  assert.equal(state.ledger.limitMicroCny, 5000000);
  assert.equal(Date.parse(state.run.originalDeadlineAt) - Date.parse(state.run.originalStartedAt), 1800000);
  for (const corrupt of [
    (next: any) => { delete next.ordinaryDesignRevisionBudgetActivation; },
    (next: any) => { next.ledger.allocationClosures = []; },
    (next: any) => { next.tasks = next.tasks.filter((row: any) => row.taskId !== 'design-task-revision'); },
    (next: any) => { next.ordinaryDesignRevisionBudgetActivation.budget.targetMicroCny++; },
    (next: any) => { next.events.find((row: any) => row.type === 'ordinary_design_revision_budget_activated').reason = 'conflicting-activation'; },
  ]) { const next = structuredClone(state); corrupt(next); assert.throws(() => validateSnapshot(next)); }
  const plan = JSON.parse(await readFile(join(f.root, 'ordinary-design-revision-plan.json'), 'utf8'));
  assert.deepEqual(allocateRepairGrants(state, [plan.downstream.find((row: any) => row.role === 'coding')]), { 'coding-task': 2475000 });
});

test('closed initial design cannot obtain an owned-child launch ticket', async t => {
  const f = await conservedFixture(t); await f.execute();
  const controller = await RunController.open({ root: f.root });
  let ticket: string | undefined;
  try {
    const before = await readFile(join(f.root, 'snapshot.json'));
    await assert.rejects(async () => { ticket = await controller.prepareOwnedChild({ taskId: 'design-task' } as any); }, /closed|authority/i);
    await assert.rejects(controller.reserve({ requestId: 'closed-source', taskId: 'design-task', provider: 'fake', pricingVersion: 'fake', estimatedMaxCostMicroCny: 1 }), /closed|authority/i);
    const source = (await controller.read()).tasks.find(row => row.taskId === 'design-task')!;
    source.handoff.remaining.push('Attempted source rewrite');
    await assert.rejects(controller.saveTask(source, { role: 'system', actorId: 'fixture' }), /immutable/);
    await assert.rejects(controller.importSettled({ requestId: 'late-source', taskId: 'design-task', provider: 'fake', pricingVersion: 'fake', actualCostMicroCny: 0,
      evidence: [{ artifactId: 'fake', version: 'v1', location: 'fake.json' }] }), /closed/i);
    assert.ok((await readFile(join(f.root, 'snapshot.json'))).equals(before), 'Rejected launch must not write a run event');
  }
  finally { if (ticket) await controller.releaseUnspawnedChild(ticket); await controller.close(); }
});

test('exact activation retry is read-only after deadline and stop, without live work', async t => {
  const f = await conservedFixture(t); await f.execute();
  const state = await f.state(); let now = Date.now();
  const controller = await RunController.open({ root: f.root, now: () => now });
  try {
    now = Date.parse(state.run.originalDeadlineAt) + 1;
    const before = await readFile(join(f.root, 'snapshot.json'));
    await controller.activateOrdinaryDesignRevision();
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
    await controller.stop('Synthetic stopped state');
    const stopped = await readFile(join(f.root, 'snapshot.json'));
    await controller.activateOrdinaryDesignRevision({});
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), stopped);
  } finally { await controller.close(); }
});

test('intent-only recovery authenticates live operation and rejects source/epoch changes before one atomic commit', async t => {
  let owners = 0;
  const f = await conservedFixture(t, undefined, { intercept: controller => { if (++owners === 1) controller.activateOrdinaryDesignRevision = async () => { throw new Error('Synthetic interruption after intent'); }; } });
  await f.execute();
  const sourceState = await f.state(); assert.equal(sourceState.ledger.contractVersion, '1.0.0');
  assert.equal(sourceState.tasks.length, 1);
  let clock = Date.now();
  const controller = await RunController.open({ root: f.root, now: () => clock++ }), work = new OwnedWork(controller.signal);
  const scope = await controller.bindOrdinaryDesignBudgetLifecycle();
  const factory = scope.wrapFactory(async () => ({ actorId: 'fake', contextId: 'fake', prompt: async () => ({ text: '' }), close: async () => {} }));
  const planBytes = await readFile(join(f.root, 'ordinary-design-revision-plan.json')), plan = JSON.parse(planBytes.toString('utf8')), planHash = budgetDigest(planBytes);
  try {
    await work.run(async (_signal, operation) => {
      scope.bindOperation(work, operation); await scope.stage(async () => {});
      const before = await readFile(join(f.root, 'snapshot.json'));
      await assert.rejects(controller.activateOrdinaryDesignRevision({}), /capability/);
      assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
      const activate = controller.activateOrdinaryDesignRevision.bind(controller);
      controller.activateOrdinaryDesignRevision = async capability => {
        const session = await factory({ controller } as any); await session.close();
        return activate(capability);
      };
      await assert.rejects(scope.activate(plan.sourceTaskId, plan.sourceAttemptId, planHash), /changed sessions/);
      controller.activateOrdinaryDesignRevision = activate;
      assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
      const feedbackPath = join(f.root, plan.feedback.location), feedback = await readFile(feedbackPath);
      await writeFile(feedbackPath, '{}', 'utf8');
      await assert.rejects(scope.activate(plan.sourceTaskId, plan.sourceAttemptId, planHash));
      await writeFile(feedbackPath, feedback);
      assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
      const write = SnapshotStore.prototype.write; let unexpectedSession: any, writeBoundary = 0;
      SnapshotStore.prototype.write = async function (next: any) {
        if (next.ledger?.contractVersion === '6.0.0') {
          writeBoundary++;
          await assert.rejects(async () => { unexpectedSession = await factory({ controller } as any); }, /activation commit/);
        }
        return write.call(this, next);
      };
      try { await scope.activate(plan.sourceTaskId, plan.sourceAttemptId, planHash); }
      finally { SnapshotStore.prototype.write = write; await unexpectedSession?.close(); }
      assert.equal(writeBoundary, 1);
      const activated = await controller.read(); validateSnapshot(activated);
      assert.equal(activated.ledger.contractVersion, '6.0.0');
      assert.equal(activated.tasks.find(row => row.taskId === plan.task.task.taskId)!.attempts.length, 0);
      assert.deepEqual(activated.tasks[0], sourceState.tasks[0]);
      assert.deepEqual(activated.ledger.entries, sourceState.ledger.entries);
    });
    await assert.rejects(scope.activate(plan.sourceTaskId, plan.sourceAttemptId, planHash), /not live/);
    await controller.activateOrdinaryDesignRevision();
  } finally { await controller.close(); }
  await assert.rejects(readFile(join(f.root, 'journal/task-design-task-revision/origin.json')), { code: 'ENOENT' });
  await f.resume();
  const resumed = await f.state();
  assert.equal(resumed.events.filter((row: any) => row.type === 'ordinary_design_revision_budget_activated').length, 1);
  assert.equal(resumed.tasks.find((row: any) => row.taskId === 'design-task-revision').attempts.length, 1);
  await readFile(join(f.root, 'journal/task-design-task-revision/origin.json'));
});

test('source and activation provenance are checked by open and first funding settlement', async t => {
  const f = await conservedFixture(t); await f.execute();
  const path = join(f.root, 'ordinary-design-revision-plan.json'), bytes = await readFile(path);
  await writeFile(path, '{}', 'utf8');
  await assert.rejects(RunController.open({ root: f.root }));
  await assert.rejects(settlePublicValidationFunding({ sharedRoot: f.shared.root, runRoot: f.root, fundingId: f.binding.fundingId }));
  await writeFile(path, bytes);
  const result = await settlePublicValidationFunding({ sharedRoot: f.shared.root, runRoot: f.root, fundingId: f.binding.fundingId });
  assert.equal(result.settledMicroCny, 0); assert.equal(result.releasedMicroCny, 5000000);
});

test('atomic publication faults leave only complete old or complete new allocation state', async t => {
  const f = await conservedFixture(t, undefined, { intercept: controller => { controller.activateOrdinaryDesignRevision = async () => { throw new Error('Synthetic intent checkpoint'); }; } });
  await f.execute();
  const planBytes = await readFile(join(f.root, 'ordinary-design-revision-plan.json')), plan = JSON.parse(planBytes.toString('utf8'));
  for (const boundary of ['before', 'after']) {
    const controller = await RunController.open({ root: f.root }), work = new OwnedWork(controller.signal), scope = await controller.bindOrdinaryDesignBudgetLifecycle();
    scope.wrapFactory(async () => { throw new Error('No session expected'); });
    try {
      await work.run(async (_signal, operation) => {
        scope.bindOperation(work, operation); await scope.stage(async () => {});
        const before = await readFile(join(f.root, 'snapshot.json')), write = SnapshotStore.prototype.write;
        SnapshotStore.prototype.write = async function (next: any) {
          if (next.ledger?.contractVersion !== '6.0.0') return write.call(this, next);
          if (boundary === 'after') await write.call(this, next);
          throw new Error(`Synthetic ${boundary} atomic publish failure`);
        };
        try { await assert.rejects(scope.activate(plan.sourceTaskId, plan.sourceAttemptId, budgetDigest(planBytes)), /publish failure/); }
        finally { SnapshotStore.prototype.write = write; }
        const actual = await f.state(); validateSnapshot(actual);
        if (boundary === 'before') assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
        else { assert.equal(actual.ledger.contractVersion, '6.0.0'); assert.equal(actual.tasks.length, 2); }
      });
    } finally { await controller.close(); }
  }
  const restored = await RunController.open({ root: f.root });
  try {
    const before = await readFile(join(f.root, 'snapshot.json')); await restored.activateOrdinaryDesignRevision();
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  } finally { await restored.close(); }
});

test('first activation still expires normally and never releases a stopped source', async t => {
  const f = await conservedFixture(t, undefined, { intercept: controller => { controller.activateOrdinaryDesignRevision = async () => { throw new Error('Synthetic intent checkpoint'); }; } });
  await f.execute();
  const initial = await f.state(), planBytes = await readFile(join(f.root, 'ordinary-design-revision-plan.json')), plan = JSON.parse(planBytes.toString('utf8'));
  let now = Date.now(); const controller = await RunController.open({ root: f.root, now: () => now }), work = new OwnedWork(controller.signal), scope = await controller.bindOrdinaryDesignBudgetLifecycle();
  scope.wrapFactory(async () => { throw new Error('No session expected'); });
  try {
    await work.run(async (_signal, operation) => {
      scope.bindOperation(work, operation); await scope.stage(async () => {});
      now = Date.parse(initial.run.originalDeadlineAt) + 1;
      await assert.rejects(scope.activate(plan.sourceTaskId, plan.sourceAttemptId, budgetDigest(planBytes)), /stopped/i);
    });
    const stopped = await f.state(); assert.equal(stopped.stopReason.code, 'deadline'); assert.equal(stopped.ledger.contractVersion, '1.0.0');
    assert.equal(stopped.ledger.allocationClosures, undefined); assert.deepEqual(stopped.tasks, initial.tasks);
  } finally { await controller.close(); }
});

test('approved conserved revision preserves original art/coding grants and the one net coding repair across cold restore', async t => {
  const f = await conservedFixture(t, async (config, fallback) => {
    const packet = JSON.parse(config.context!);
    if (packet.role === 'reviewer' && packet.taskId === 'design-task') return { ...fallback, prompt: async (...args) => {
      const reply = JSON.parse((await fallback.prompt(...args)).text);
      return { text: JSON.stringify({ ...reply, verdict: 'changes_requested', findings: ['Clarify original completion requirement.'] }) };
    } };
    if (packet.role === 'design' && packet.taskId === 'design-task-revision') return { ...fallback, prompt: async () => {
      await config.tools!.find(tool => tool.name === 'edit')!.execute('repair-trace', { path: 'authors/design/design.json', edits: [{ oldText: '原创鼠标游戏', newText: '原创鼠标游戏，明确完成状态' }] }, undefined, undefined, undefined as any);
      return { text: JSON.stringify({ summary: 'Synthetic clarified design', remaining: [], uncertainty: [] }) };
    } };
    return fallback;
  }, { fault: 'code-repair' });
  const result: any = await f.execute(); assert.equal(result.outcome, 'awaiting_user_experience', JSON.stringify(result.gaps));
  const state = await f.state(), planPath = join(f.root, 'repair-plan.json'), bytes = await readFile(planPath), plan = JSON.parse(bytes.toString('utf8'));
  assert.equal(state.ledger.allocations.find((row: any) => row.taskId === 'art-task').amountMicroCny, 900000);
  assert.equal(state.ledger.allocations.find((row: any) => row.taskId === 'coding-task').amountMicroCny, 1125000);
  assert.equal(state.ledger.allocations.find((row: any) => row.taskId === plan.newTaskIds[0]).amountMicroCny, 450000);
  assert.equal(budgetCapacity(state.ledger).allocatedMicroCny, 5000000);
  assert.deepEqual(plan.ordinaryDesignRevisionBudget.allocationClosuresBefore, state.ledger.allocationClosures);
  const execution = JSON.parse(await readFile(join(f.root, 'execution.json'), 'utf8'));
  const selection = JSON.parse(await readFile(join(f.root, 'ordinary-design-selection.json'), 'utf8'));
  const controller = await RunController.open({ root: f.root });
  const args = { root: f.root, controller, plan, originals: selection.tasks, requirement: execution.requirement, originalPlan: execution.plan, now: Date.now() };
  try {
    await prepareRepairContinuation(args);
    const corrupt = structuredClone(plan); corrupt.ordinaryDesignRevisionBudget.allocationClosuresBefore[0].releasedMicroCny++;
    await writeFile(planPath, JSON.stringify(corrupt), 'utf8');
    await assert.rejects(prepareRepairContinuation({ ...args, plan: corrupt }), /closure provenance/);
  } finally { await writeFile(planPath, bytes); await controller.close(); }
});
