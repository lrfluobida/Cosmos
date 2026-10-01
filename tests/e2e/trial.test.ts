import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { checkTrialAdmission, claimTrial, readPreviousTrial, TRIAL } from '../../probes/e2e/trial.ts';
import { writeJson } from '../../probes/e2e/host.ts';

const now = Date.parse('2026-10-01T10:00:00.000Z'), sha = 'a'.repeat(40);
function admission() {
  return { now, platformHead: sha, isAncestor: async () => true,
    dependencies: [...Array.from({ length: 7 }, (_, index) => ({ taskId: `COS-0${index + 3}`, state: 'closed', reviewedCommit: sha, mergeCommit: sha })),
      { taskId: 'COS-11', state: 'open', integrationStatus: 'offline-verified-awaiting-live', reviewStatus: 'READY', reviewedCommit: TRIAL.cos11ReviewedCommit, mergeCommit: sha }],
    snapshot: { run: { state: 'running', runId: 'validation-2026-10-01', ledgerId: 'cosmos-validation', specVersion: '1.0', originalDeadlineAt: '2026-10-01T18:16:16.857Z' }, stopReason: null,
      ledger: { scope: 'validation', ledgerId: 'cosmos-validation', limitMicroCny: 150_000_000, allocations: [{ taskId: 'COS-10', amountMicroCny: 10_000_000 }, { taskId: 'retained-old', amountMicroCny: 59_396_040 }],
        entries: [{ requestId: 'prior-deepseek-direct-probes', taskId: 'prior', status: 'settled', settledMicroCny: 721_771, reservedMicroCny: 0, unknown: false },
          { requestId: 'old-pilot', taskId: 'COS-10', status: 'settled', settledMicroCny: 170_511, reservedMicroCny: 0, unknown: false }] } },
  };
}

test('the fixed new trial retains old fees and shared deadline without claiming COS-11 closed', async () => {
  const input = admission(), before = structuredClone(input.snapshot);
  const result = await checkTrialAdmission(input);
  assert.equal(result.deadlineAt, '2026-10-01T11:00:00.000Z');
  assert.equal(result.sharedDeadlineAt, '2026-10-01T18:16:16.857Z');
  assert.equal(result.baselineCommittedMicroCny, 892_282); assert.equal(result.phaseRemainingMicroCny, 29_107_718);
  assert.equal(result.childAllocationCapMicroCny, 19_000_000); assert.equal(result.approvals.at(-1)?.state, 'open');
  assert.deepEqual(input.snapshot, before);
});

test('trial admission rejects missing source approval, live exposure, exhausted caps and allocation shortages', async () => {
  for (const [pattern, change] of [
    [/COS-11/, (v: ReturnType<typeof admission>) => { v.dependencies.at(-1)!.reviewedCommit = sha; }],
    [/in.flight|unknown/, (v: ReturnType<typeof admission>) => { v.snapshot.ledger.entries[0].unknown = true; }],
    [/cumulative/, (v: ReturnType<typeof admission>) => { v.snapshot.ledger.entries[1].settledMicroCny = 30_000_000; }],
    [/unallocated/, (v: ReturnType<typeof admission>) => { v.snapshot.ledger.allocations[1].amountMicroCny = 135_000_000; }],
    [/deadline/, (v: ReturnType<typeof admission>) => { v.now = Date.parse(v.snapshot.run.originalDeadlineAt); }],
  ] as const) { const value = admission(); change(value); await assert.rejects(checkTrialAdmission(value), pattern); }
  await assert.rejects(checkTrialAdmission({ ...admission(), isAncestor: async () => false }), /ancestor/);
});

test('the only trial marker/root are write-once, including a partial root left by exit', async t => {
  const repository = await mkdtemp(join(tmpdir(), 'cosmos-fixed-trial-')); t.after(() => rm(repository, { recursive: true, force: true }));
  const ledgerRoot = join(repository, '.cosmos/validation-shared'); await mkdir(ledgerRoot, { recursive: true });
  const data = await checkTrialAdmission(admission());
  const previous = { root: join(repository, '.cosmos/e2e/old'), results: ['result.json', 'continuation-result.json'], outcome: 'failed' as const, requestCount: 13, deadlineAt: '2026-10-01T09:48:34.671Z' };
  const first = await claimTrial({ repository, ledgerRoot, admission: data, previous });
  assert.equal(first.root, join(repository, '.cosmos/e2e', TRIAL.id));
  const saved = await readFile(join(ledgerRoot, `${TRIAL.id}.json`), 'utf8');
  await assert.rejects(claimTrial({ repository, ledgerRoot, admission: data, previous }), /already|exist/);
  assert.equal(await readFile(join(ledgerRoot, `${TRIAL.id}.json`), 'utf8'), saved);
  const another = await mkdtemp(join(tmpdir(), 'cosmos-partial-trial-')); t.after(() => rm(another, { recursive: true, force: true }));
  const otherLedger = join(another, '.cosmos/validation-shared'); await mkdir(otherLedger, { recursive: true });
  await mkdir(join(another, '.cosmos/e2e', TRIAL.id), { recursive: true });
  await assert.rejects(claimTrial({ repository: another, ledgerRoot: otherLedger, admission: data, previous }), /already|exist/);
});

test('previous failed records stay intact and a changed v2 acceptance is rejected', async t => {
  const repository = await mkdtemp(join(tmpdir(), 'cosmos-trial-history-')); t.after(() => rm(repository, { recursive: true, force: true }));
  const ledgerRoot = join(repository, '.cosmos/validation-shared'), oldRoot = join(repository, '.cosmos/e2e/pilot-20261001081828147');
  await mkdir(ledgerRoot, { recursive: true }); await mkdir(oldRoot, { recursive: true });
  const deadlineAt = '2026-10-01T09:48:34.671Z', journal = { requestIds: Array.from({ length: 13 }, (_, i) => `old-${i}`), deadlineAt };
  const requirements = JSON.parse(await readFile(new URL('../../probes/e2e/requirements.json', import.meta.url), 'utf8'));
  await writeJson(ledgerRoot, 'cos10-pilot.json', { root: oldRoot, deadlineAt });
  await writeJson(oldRoot, 'result.json', { outcome: 'failed' }); await writeJson(oldRoot, 'continuation-result.json', { outcome: 'failed', pilotBudget: journal });
  await writeJson(oldRoot, 'pilot-budget.json', journal); await writeJson(oldRoot, 'confirmed-requirement.json', { requirement: { sources: [{ location: 'frozen' }] } });
  await writeJson(oldRoot, 'frozen/_cosmos/requirements.json', requirements); await writeJson(repository, 'probes/e2e/requirements.json', requirements);
  const before = await readFile(join(oldRoot, 'pilot-budget.json'));
  assert.equal((await readPreviousTrial(repository, ledgerRoot)).requestCount, 13);
  assert.ok((await readFile(join(oldRoot, 'pilot-budget.json'))).equals(before));
  requirements.acceptanceIds.pop(); await writeFile(join(repository, 'probes/e2e/requirements.json'), JSON.stringify(requirements), 'utf8');
  await assert.rejects(readPreviousTrial(repository, ledgerRoot), /frozen v2/);
});
