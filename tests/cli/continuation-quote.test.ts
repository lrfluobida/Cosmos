import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
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
    f.snapshot.run.originalStartedAt = new Date().toISOString();
    f.snapshot.run.originalDeadlineAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    f.snapshot.tasks[0].budget.originalDeadlineAt = f.snapshot.run.originalDeadlineAt;
  }
  if (mode === 'validation') { f.snapshot.ledger.scope = 'validation'; f.snapshot.ledger.limitMicroCny = 150_000_000; f.snapshot.ledger.allocations[0].amountMicroCny = 150_000_000; f.snapshot.tasks[0].budget.allocationMicroCny = 150_000_000; }
  if (mode === 'intake') f.snapshot.formatVersion = 'intake-1';
  if (mode === 'future-format') f.snapshot.formatVersion = 2;
  if (mode === 'reserved' || mode === 'unknown') {
    Object.assign(f.snapshot.ledger.entries[0], { settledMicroCny: 0, reservedMicroCny: 10, status: mode, unknown: mode === 'unknown', evidence: [] });
    f.snapshot.run.fees = { settledMicroCny: 0, reservedMicroCny: 10, unknownRequestIds: mode === 'unknown' ? ['request-1'] : [] };
  }
  await f.save(); const before = await readFile(join(f.root, 'snapshot.json')); await assert.rejects(command(args(f.root)));
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
