import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { RunController } from '../../src/runtime/run.ts';
import { loadContinuationPlan } from '../../src/runtime/continuation-plan.ts';
import { requireContinuationInputs } from '../../src/runtime/continuation-inputs.ts';
import { reserveTransferOrigin } from '../../src/runtime/adapters/transfer/loopback-origin.ts';
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

test('fresh public preparation quote loads the actual source dependencies without a running host', async t => {
  const f = await humanContinuationFixture(t), before = await readFile(join(f.root, 'snapshot.json'));
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const result = spawnSync(process.execPath, ['--experimental-strip-types', join(repository, 'src/cli/index.ts'), ...args(f.root, true)], { cwd: repository, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).proposed.targets.length, 1);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before); await f.requirePreserved();
});

test('current human origin refuses the original receipt path before creating a listener', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos61-origin-')); let created: Awaited<ReturnType<typeof reserveTransferOrigin>> | undefined;
  t.after(async () => { await created?.close(); await rm(root, { recursive: true, force: true }); });
  await assert.rejects(reserveTransferOrigin({ root, resume: false, signal: new AbortController().signal, requireScope: async () => {},
    binding: { profile: 'human', runId: 'synthetic', ledgerId: 'synthetic-budget', windowId: 'synthetic-window', decisionId: 'synthetic-decision', taskId: 'synthetic-code',
      sourceVersion: 'a'.repeat(40), sourceSha256: 'b'.repeat(64), requirementSha256: 'c'.repeat(64), specVersion: '1.0' } }).then(value => { created = value; return value; }), /window|path|origin/i);
  await assert.rejects(readFile(join(root, 'host-transfer-origin.json')), { code: 'ENOENT' });
});

test('human preparation quote refuses a missing or browser mode without falling back to generic generation', async t => {
  const f = await humanContinuationFixture(t), modePath = join(f.root, 'intake-mode.json'), originalMode = await readFile(modePath), before = await readFile(join(f.root, 'snapshot.json'));
  const parsed = JSON.parse(originalMode.toString('utf8'));
  for (const mode of ['missing', 'browser'] as const) {
    if (mode === 'missing') await rm(modePath); else await writeFile(modePath, JSON.stringify({ runId: parsed.runId, createdAt: parsed.createdAt }), 'utf8');
    await assert.rejects(runCli(args(f.root, true), { host: f.host, ...continuationStreams() }), /mode|preparation|准备/i);
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before); await f.requirePreserved();
    await writeFile(modePath, originalMode);
  }
});
