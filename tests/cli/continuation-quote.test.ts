import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { mock, test } from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import { SnapshotStore } from '../../src/runtime/store.ts';
import { RunController } from '../../src/runtime/run.ts';
import { buildContinuationQuote } from '../../src/runtime/continuation-quote.ts';
import { task, ledger, run } from '../contracts/fixtures.ts';

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cosmos-quote-中文-')); t.after(() => rm(root, { recursive: true, force: true }));
  const originalTask = task(), originalLedger = ledger(), originalRun = run();
  originalTask.state = 'failed'; originalTask.stateReason = 'Host build failed'; originalTask.attempts[0].outcome = 'failed';
  originalTask.attempts[0].failure = { classification: 'code_defect', summary: '启动失败', reproduction: ['启动'], actual: '报错', expected: '启动成功', evidenceRefs: ['evidence/report.json'] } as any;
  originalTask.handoff.remaining = ['修复启动错误']; originalTask.handoff.uncertainty = ['尚未最终试玩'];
  originalLedger.entries[0] = { ...originalLedger.entries[0], settledMicroCny: 1_000_000, reservedMicroCny: 0, status: 'settled', evidence: [{ artifactId: 'billing', version: 'v1', location: 'billing.json' }] };
  originalLedger.allocations[0].amountMicroCny = 200_000_000; originalTask.budget.allocationMicroCny = 200_000_000;
  originalRun.state = 'waiting_user'; originalRun.fees = { reservedMicroCny: 0, settledMicroCny: 1_000_000, unknownRequestIds: [] };
  const snapshot: any = { formatVersion: 1, revision: 7, run: originalRun, ledger: originalLedger, tasks: [originalTask],
    requests: [{ requestId: 'request-1', admittedAt: '2026-10-01T00:00:01.000Z' }], stopReason: { code: 'deadline', at: originalRun.originalDeadlineAt, reason: 'Original hard deadline reached.' },
    events: [{ sequence: 1, at: originalRun.originalStartedAt, type: 'created', requestId: null, reason: 'Original run' },
      { sequence: 2, at: originalRun.originalDeadlineAt, type: 'stopped', requestId: null, reason: 'Original hard deadline reached.' }] };
  const save = () => writeFile(join(root, 'snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n', 'utf8'); await save();
  return { root, snapshot, save };
}
const args = (root: string, amount = '20.125001', minutes = '60') => ['continue', root, '--quote', '--add-cny', amount, '--add-minutes', minutes];
async function command(argv: string[]) {
  const output = new PassThrough(); let text = ''; output.on('data', data => { text += data; });
  const host = new Proxy({}, { get() { throw new Error('Read-only quote touched the product host'); } });
  const result = await runCli(argv, { output, host: host as any }); return { result: result as any, text };
}

test('public continue quote shows exact original facts, candidate grants and gaps without any write, lock or provider call', async t => {
  const f = await fixture(t), path = join(f.root, 'snapshot.json'), before = await readFile(path), meta = await stat(path), files = await readdir(f.root);
  const acquire = mock.method(SnapshotStore, 'acquire', () => { throw new Error('Quote took an owner lock'); });
  const open = mock.method(RunController, 'open', () => { throw new Error('Quote opened a runtime writer'); });
  const fetch = mock.method(globalThis, 'fetch', () => { throw new Error('Quote made a network request'); });
  t.after(() => { acquire.mock.restore(); open.mock.restore(); fetch.mock.restore(); });
  const { result, text } = await command(args(f.root));
  assert.equal(result.kind, 'proposal'); assert.equal(result.activationAllowed, false); assert.match(result.quoteId, /^cq1-[a-f0-9]{64}$/);
  assert.deepEqual(result.basis, { runId: 'run-1', ledgerId: 'ledger-1', specVersion: 'spec-v1', revision: 7, snapshotSha256: result.basis.snapshotSha256,
    originalStartedAt: f.snapshot.run.originalStartedAt, originalDeadlineAt: f.snapshot.run.originalDeadlineAt, originalLimitMicroCny: 200_000_000, stopReason: f.snapshot.stopReason });
  assert.equal(result.original.settledMicroCny, 1_000_000); assert.equal(result.original.unallocatedMicroCny, 0);
  assert.deepEqual(result.requested, { additionalMicroCny: 20_125_001, additionalDurationMs: 3_600_000 });
  assert.equal(result.proposed.totalLimitMicroCny, 220_125_001); assert.equal(result.proposed.deadlineAt, null);
  assert.equal(result.proposed.grants[0].sourceTaskId, 'COS-example'); assert.equal(result.proposed.grants[0].amountMicroCny, 219_125_001);
  assert.notEqual(result.proposed.grants[0].taskId, 'COS-example'); assert.match(result.proposed.grants[0].taskId, /^cont-7-[a-f0-9]{20}$/);
  assert.equal(result.proposed.allocationClosures[0].proposedReleaseMicroCny, 199_000_000); assert.equal(result.proposed.allocationClosures[0].verification, 'required');
  assert.deepEqual(result.proposed.targets[0].remaining, ['修复启动错误']); assert.equal(result.proposed.targets[0].attemptsUsed, 1);
  assert.deepEqual(result.proposed.attemptPolicy, { newAttemptsPerTarget: 1, automaticRepairs: 0 });
  assert.ok(result.blockers.some((item: any) => item.code === 'owner_quiescence_unverified')); assert.ok(result.blockers.some((item: any) => item.code === 'fixed_evidence_unverified'));
  assert.match(text, /提案/); assert.match(text, /不会.*激活|不构成.*激活/);
  assert.deepEqual(await readFile(path), before); assert.equal((await stat(path)).mtimeMs, meta.mtimeMs); assert.deepEqual(await readdir(f.root), files);
  assert.equal(acquire.mock.callCount(), 0); assert.equal(open.mock.callCount(), 0); assert.equal(fetch.mock.callCount(), 0);
});

test('quote identity is stable for normalized inputs and changes with exact revision or requested resources', async t => {
  const f = await fixture(t), first = (await command(args(f.root, '20', '60'))).result;
  assert.equal((await command(args(f.root, '20.000000', '60'))).result.quoteId, first.quoteId);
  assert.notEqual((await command(args(f.root, '21', '60'))).result.quoteId, first.quoteId);
  assert.notEqual((await command(args(f.root, '20', '61'))).result.quoteId, first.quoteId);
  f.snapshot.revision++; await f.save(); assert.notEqual((await command(args(f.root, '20', '60'))).result.quoteId, first.quoteId);
});

test('zero added money is a time-only proposal and cannot activate or implicitly reclaim grants', async t => {
  const f = await fixture(t), result = (await command(args(f.root, '0', '1'))).result;
  assert.equal(result.requested.additionalMicroCny, 0); assert.equal(result.proposed.totalLimitMicroCny, 200_000_000);
  assert.equal(result.activationAllowed, false); assert.equal(result.original.unallocatedMicroCny, 0);
});

for (const [amount, minutes] of [['-1', '1'], ['NaN', '1'], ['Infinity', '1'], ['1e2', '1'], ['1.0000001', '1'], ['200.000001', '1'], ['9007199254740992', '1'], ['1', '0'], ['1', '-1'], ['1', 'NaN'], ['1', '1.5'], ['1', '721'], ['1', '9007199254740992']]) {
  test(`public quote rejects out-of-range or imprecise amount=${amount} minutes=${minutes}`, async t => {
    const f = await fixture(t), before = await readFile(join(f.root, 'snapshot.json')); await assert.rejects(command(args(f.root, amount, minutes)));
    assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
  });
}

test('continue cannot become resume, confirmation or activation through missing or extra arguments', async t => {
  const f = await fixture(t);
  for (const argv of [['continue', f.root], ['continue', f.root, '--quote'], [...args(f.root), '--confirm'], [...args(f.root), '--resume'], [...args(f.root), '--extra'], [...args(f.root), '--add-cny', '1']]) {
    await assert.rejects(command(argv), /Usage|quote|参数|用法/);
  }
});

for (const mode of ['running', 'validation', 'intake', 'future-format', 'reserved', 'unknown']) test(`public quote rejects ${mode} without changing its source`, async t => {
  const f = await fixture(t);
  if (mode === 'running') {
    f.snapshot.run.state = 'running'; f.snapshot.stopReason = null;
    const started = Date.now(); f.snapshot.run.originalStartedAt = new Date(started).toISOString();
    f.snapshot.run.originalDeadlineAt = new Date(started + 12 * 60 * 60 * 1000).toISOString();
    f.snapshot.tasks[0].budget.originalDeadlineAt = f.snapshot.run.originalDeadlineAt;
  }
  if (mode === 'validation') { f.snapshot.ledger.scope = 'validation'; f.snapshot.ledger.limitMicroCny = 150_000_000; f.snapshot.ledger.allocations[0].amountMicroCny = 150_000_000; f.snapshot.tasks[0].budget.allocationMicroCny = 150_000_000; }
  if (mode === 'intake') f.snapshot.formatVersion = 'intake-1';
  if (mode === 'future-format') f.snapshot.formatVersion = 2;
  if (mode === 'reserved' || mode === 'unknown') {
    Object.assign(f.snapshot.ledger.entries[0], { settledMicroCny: 0, reservedMicroCny: 10, status: mode, unknown: mode === 'unknown', evidence: [] });
    f.snapshot.run.fees = { settledMicroCny: 0, reservedMicroCny: 10, unknownRequestIds: mode === 'unknown' ? ['request-1'] : [] };
  }
  await f.save(); const before = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(command(args(f.root)), mode === 'running' ? /尚未硬停止或到期/ : mode === 'reserved' || mode === 'unknown' ? /未知或预留费用/ : /generation|validation|intake|格式/);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
});

test('expired but unrecorded stop remains a stable read-only proposal without backdating an event', async t => {
  const f = await fixture(t); f.snapshot.run.state = 'running'; f.snapshot.stopReason = null; await f.save();
  const before = await readFile(join(f.root, 'snapshot.json')), at = Date.parse(f.snapshot.run.originalDeadlineAt);
  const first = await buildContinuationQuote({ root: f.root, additionalMicroCny: 0, additionalDurationMs: 60_000, now: at });
  const later = await buildContinuationQuote({ root: f.root, additionalMicroCny: 0, additionalDurationMs: 60_000, now: at + 5000 });
  assert.equal(first.effectiveStop, 'deadline_expired_unrecorded'); assert.equal(first.basis.stopReason, null);
  assert.ok(first.blockers.some(item => item.code === 'original_stop_not_recorded')); assert.equal(first.quoteId, later.quoteId);
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
});

test('an existing owner marker stays untouched and the real public node command only prints a proposal', async t => {
  const f = await fixture(t), marker = join(f.root, '.controller.lock'); await writeFile(marker, 'Do not recover this owner marker', 'utf8');
  const before = await readFile(join(f.root, 'snapshot.json')), snapshotMeta = await stat(join(f.root, 'snapshot.json')), markerMeta = await stat(marker), files = await readdir(f.root);
  const result = spawnSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('../../src/cli/index.ts', import.meta.url)), ...args(f.root)], {
    cwd: f.root, encoding: 'utf8', windowsHide: true, timeout: 10_000,
    env: { ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}), ...(process.env.TEMP ? { TEMP: process.env.TEMP } : {}), ...(process.env.TMP ? { TMP: process.env.TMP } : {}) },
  });
  assert.equal(result.status, 0, result.stderr); const quote = JSON.parse(result.stdout); assert.equal(quote.kind, 'proposal'); assert.equal(quote.activationAllowed, false);
  assert.ok(quote.blockers.some((item: any) => item.code === 'owner_quiescence_unverified'));
  assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before); assert.equal((await stat(join(f.root, 'snapshot.json'))).mtimeMs, snapshotMeta.mtimeMs);
  assert.equal(await readFile(marker, 'utf8'), 'Do not recover this owner marker'); assert.equal((await stat(marker)).mtimeMs, markerMeta.mtimeMs); assert.deepEqual(await readdir(f.root), files);
});

test('existing C3 replacements select the effective target and retain the entire attempt lineage', async t => {
  const f = await fixture(t), old = f.snapshot.tasks[0], replacement = structuredClone(old);
  old.budget.allocationMicroCny = 100_000_000; replacement.budget.allocationMicroCny = 100_000_000; replacement.taskId = 'COS-example-repair';
  replacement.attempts[0].attemptId = 'repair-attempt'; replacement.authorId = 'repair-author'; replacement.context.contextId = 'repair-context';
  replacement.evidence.forEach((item: any) => { item.taskId = replacement.taskId; });
  f.snapshot.tasks.push(replacement); f.snapshot.run.taskIds.push(replacement.taskId);
  f.snapshot.ledger.allocations = [{ taskId: old.taskId, amountMicroCny: 100_000_000 }, { taskId: replacement.taskId, amountMicroCny: 100_000_000 }]; await f.save();
  const plan = { formatVersion: 2, runId: f.snapshot.run.runId, ledgerId: f.snapshot.ledger.ledgerId, originalStartedAt: f.snapshot.run.originalStartedAt,
    originalDeadlineAt: f.snapshot.run.originalDeadlineAt, limitMicroCny: f.snapshot.ledger.limitMicroCny,
    replacements: [{ sourceTaskId: old.taskId, replacementTaskId: replacement.taskId }], tasks: [{ task: replacement }] };
  await writeFile(join(f.root, 'repair-plan.json'), JSON.stringify(plan), 'utf8');
  const quote = (await command(args(f.root))).result; assert.equal(quote.proposed.targets.length, 1); assert.equal(quote.proposed.targets[0].sourceTaskId, replacement.taskId);
  assert.deepEqual(quote.proposed.targets[0].historyTaskIds, [old.taskId, replacement.taskId]); assert.equal(quote.proposed.targets[0].attemptsUsed, 2);
  assert.equal(quote.proposed.grants[0].sourceTaskId, replacement.taskId); assert.equal(quote.auxiliarySources[0].path, 'repair-plan.json');
  await writeFile(join(f.root, 'repair-plan.json'), JSON.stringify(plan, null, 2), 'utf8');
  assert.notEqual((await command(args(f.root))).result.quoteId, quote.quoteId, 'Exact mapping source bytes participate in the quote identity');
});

test('new grant proposals use remaining settled-inclusive capacity and original weights, without asking the user to allocate tasks', async t => {
  const f = await fixture(t), first = f.snapshot.tasks[0], second = structuredClone(first);
  first.budget.allocationMicroCny = 50_000_000; second.taskId = 'second-task'; second.budget.allocationMicroCny = 150_000_000;
  second.evidence.forEach((item: any) => { item.taskId = second.taskId; });
  f.snapshot.tasks.push(second); f.snapshot.run.taskIds.push(second.taskId);
  f.snapshot.ledger.allocations = [{ taskId: first.taskId, amountMicroCny: 50_000_000 }, { taskId: second.taskId, amountMicroCny: 150_000_000 }]; await f.save();
  const quote = (await command(args(f.root, '0', '1'))).result;
  assert.deepEqual(quote.proposed.grants.map((grant: any) => grant.amountMicroCny), [49_750_000, 149_250_000]);
  assert.equal(new Set(quote.proposed.grants.map((grant: any) => grant.taskId)).size, 2);
  assert.equal(quote.proposed.grants.reduce((sum: number, grant: any) => sum + grant.amountMicroCny, 0) + quote.original.settledMicroCny, quote.proposed.totalLimitMicroCny);
});

test('missing source evidence is a blocker and an allocation overrun is never described as released funds', async t => {
  const f = await fixture(t), task = f.snapshot.tasks[0]; task.artifacts = []; task.evidence = []; task.attempts[0].failure.evidenceRefs = [];
  await f.save(); const missing = (await command(args(f.root))).result; assert.ok(missing.blockers.some((item: any) => item.code === 'source_evidence_missing'));
  f.snapshot.stopReason.code = 'charge_overrun'; f.snapshot.ledger.entries[0].settledMicroCny = 201_000_000; f.snapshot.run.fees.settledMicroCny = 201_000_000; await f.save();
  const overrun = (await command(args(f.root))).result; assert.equal(overrun.proposed.allocationClosures[0].proposedReleaseMicroCny, 0);
  assert.ok(overrun.blockers.some((item: any) => item.code === 'allocation_overrun')); assert.deepEqual(overrun.proposed.grants, []);
});

for (const invalid of ['cycle', 'cross', 'objective', 'acceptance', 'budget', 'ownership', 'input']) test(`quote refuses ${invalid} replacement mapping before filtering effective targets`, async t => {
  const f = await fixture(t), first = f.snapshot.tasks[0], second = structuredClone(first);
  first.budget.allocationMicroCny = 50_000_000; second.taskId = 'second-task'; second.budget.allocationMicroCny = 150_000_000;
  second.evidence.forEach((item: any) => { item.taskId = second.taskId; });
  f.snapshot.tasks.push(second); f.snapshot.run.taskIds.push(second.taskId);
  f.snapshot.ledger.allocations = [{ taskId: first.taskId, amountMicroCny: 50_000_000 }, { taskId: second.taskId, amountMicroCny: 150_000_000 }];
  const replacements = [{ sourceTaskId: first.taskId, replacementTaskId: second.taskId }];
  if (invalid === 'cycle') replacements.push({ sourceTaskId: second.taskId, replacementTaskId: first.taskId });
  if (invalid === 'cross') {
    const third = structuredClone(second); third.taskId = 'third-task'; third.budget.allocationMicroCny = 100_000_000; third.evidence.forEach((item: any) => { item.taskId = third.taskId; });
    second.budget.allocationMicroCny = 50_000_000; f.snapshot.ledger.allocations[1].amountMicroCny = 50_000_000;
    f.snapshot.tasks.push(third); f.snapshot.run.taskIds.push(third.taskId); f.snapshot.ledger.allocations.push({ taskId: third.taskId, amountMicroCny: 100_000_000 });
    replacements.push({ sourceTaskId: second.taskId, replacementTaskId: third.taskId });
  }
  await f.save(); const tasks = f.snapshot.tasks.map((task: any) => ({ task: structuredClone(task) }));
  if (invalid === 'objective') tasks[1].task.objective = '另一个目标';
  if (invalid === 'acceptance') tasks[1].task.acceptance[0].expected = '无需检查';
  if (invalid === 'budget') tasks[1].task.budget.allocationMicroCny--;
  if (invalid === 'ownership') tasks[1].task.ownership.writePaths.push('requirements');
  if (invalid === 'input') tasks[1].task.inputs[0].version = 'v2';
  const plan = { formatVersion: 2, runId: f.snapshot.run.runId, ledgerId: f.snapshot.ledger.ledgerId, originalStartedAt: f.snapshot.run.originalStartedAt,
    originalDeadlineAt: f.snapshot.run.originalDeadlineAt, limitMicroCny: f.snapshot.ledger.limitMicroCny, replacements, tasks };
  await writeFile(join(f.root, 'repair-plan.json'), JSON.stringify(plan), 'utf8'); const before = await readFile(join(f.root, 'snapshot.json'));
  await assert.rejects(command(args(f.root))); assert.deepEqual(await readFile(join(f.root, 'snapshot.json')), before);
});
