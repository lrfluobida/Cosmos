import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { RunController } from '../../src/runtime/run.ts';
import { loadContinuationPlan } from '../../src/runtime/continuation-plan.ts';
import { requireContinuationInputs } from '../../src/runtime/continuation-inputs.ts';
import { humanContinuationFixture, continuationStreams } from './human-continuation.fixture.ts';

const args = (root: string, quote = false) => ['continue', root, ...(quote ? ['--quote'] : []), '--add-cny', '1', '--add-minutes', '10'];

test('preparation coding quote authenticates two passed stages without activation or billing', async t => {
  const f = await humanContinuationFixture(t), calls = [...f.calls], before = await readFile(join(f.root, 'snapshot.json'));
  const quote: any = await runCli(args(f.root, true), { host: f.host, ...continuationStreams() });
  assert.equal(quote.proposed.targets.length, 1); assert.equal(quote.proposed.targets[0].sourceTaskId, 'actual-code-58');
  assert.ok(quote.auxiliarySources.some((source: any) => source.path === 'host-human-preparation-source.json'));
  assert.deepEqual(f.calls, calls); assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before); await f.requirePreserved();
});

test('first human coding window seals two audit plans and cold resume reuses passed stages', async t => {
  const f = await humanContinuationFixture(t), calls = [...f.calls]; f.continue();
  const result: any = await runCli(args(f.root), { host: f.host, ...continuationStreams(id => `confirm ${id}\n`) });
  assert.equal(result.outcome, 'awaiting_user_experience', JSON.stringify(result.gaps));
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), window = state.continuation.windows[0];
  const plan = JSON.parse(await readFile(join(f.root, `continuations/${window.decisionId}/plan.json`), 'utf8'));
  const current = plan.preparation;
  assert.equal(current.candidate.version, window.windowId); assert.equal(current.taskId, window.grants[0].taskId);
  assert.equal(current.plans.length, 2); assert.deepEqual(current.primaryPlan, current.plans[0]);
  const coding = plan.tasks.find((item: any) => item.role === 'coding');
  assert.ok(current.plans.every((ref: any) => coding.task.context.interfaces.some((actual: any) => JSON.stringify(actual) === JSON.stringify(ref))));
  for (const ref of current.plans) {
    const value = JSON.parse(await readFile(join(f.root, ref.location, '_cosmos/transfer-plan.json'), 'utf8'));
    assert.deepEqual(value.binding.candidate, current.candidate); assert.ok(value.segments.every((segment: any) => segment.plan.taskId === current.taskId));
  }
  assert.equal(f.calls.slice(calls.length).filter(call => call.startsWith('coding:')).length, 1);
  assert.equal(f.calls.slice(calls.length).filter(call => /^(cosmos|design|art):/.test(call)).length, 0);
  assert.deepEqual(state.stopReason, f.original.stopReason); assert.equal(state.run.originalDeadlineAt, f.original.run.originalDeadlineAt);
  assert.equal(result.originalResult.outcome, 'not_met'); await f.requirePreserved();
  const completedCalls = [...f.calls], fees = state.run.fees;
  const resumed: any = await runCli(['resume', f.root, '--window', window.windowId], { host: f.host, ...continuationStreams() });
  assert.equal(resumed.outcome, 'awaiting_user_experience', JSON.stringify(resumed.gaps)); assert.deepEqual(f.calls, completedCalls);
  assert.deepEqual(JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')).run.fees, fees); await f.requirePreserved();
});

test('human preparation plan fixes current interfaces and refuses a wrong plan version mapping', async t => {
  const f = await humanContinuationFixture(t);
  await runCli(args(f.root), { host: { ...f.host, execute: async () => ({ outcome: 'synthetic_interruption_after_activation' }) }, ...continuationStreams(id => `confirm ${id}\n`) });
  const state = JSON.parse(await readFile(join(f.root, 'snapshot.json'), 'utf8')), window = state.continuation.windows[0];
  const controller = await RunController.open({ root: f.root, windowId: window.windowId });
  try {
    const plan = await loadContinuationPlan({ root: f.root, controller, requirement: f.requirement, windowId: window.windowId });
    assert.ok((plan as any).preparation, 'preparation descriptor must be sealed before author context');
    const coding = plan.tasks.find(item => item.role === 'coding')!;
    assert.deepEqual(coding.task.context.interfaces.slice(-2), (plan as any).preparation.plans);
    await requireContinuationInputs(await controller.read(), plan.tasks, f.root);
    const changed = structuredClone(plan.tasks), current = changed.find(item => item.role === 'coding')!;
    current.task.context.interfaces.at(-1)!.version = 'wrong-version';
    await assert.rejects(requireContinuationInputs(await controller.read(), changed, f.root), /interface|plan|preparation/i);
  } finally { await controller.close(); }
});
