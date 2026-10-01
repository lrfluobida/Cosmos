import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validatePlan } from '../../src/acceptance/plan.ts';
import { preparePilot, PILOT_LIMITS, filteredChildEnvironment, requestReservation } from '../../probes/e2e/admission.ts';
import { createPilotAcceptance } from '../../probes/e2e/acceptance.ts';

const now = Date.parse('2026-10-01T00:00:00Z');
const sha = 'a'.repeat(40);
const dependencies = Array.from({ length: 7 }, (_, index) => ({ taskId: `COS-0${index + 3}`, state: 'closed', reviewedCommit: sha, mergeCommit: sha }));
function ledger() {
  return {
    run: { runId: 'validation-shared', originalDeadlineAt: new Date(now + 43_200_000).toISOString(), state: 'running' },
    stopReason: null,
    ledger: {
      ledgerId: 'validation-shared', scope: 'validation', limitMicroCny: 150_000_000,
      allocations: [
        { taskId: 'prior-probes', amountMicroCny: 721_771 }, { taskId: 'COS-03', amountMicroCny: 9_278_229 },
        { taskId: 'COS-04', amountMicroCny: 10_000_000 }, { taskId: 'COS-10', amountMicroCny: 10_000_000 },
        { taskId: 'COS-16', amountMicroCny: 10_000_000 },
      ],
      entries: [
        { requestId: 'prior-deepseek-direct-probes', taskId: 'prior-probes', status: 'settled', settledMicroCny: 721_771, reservedMicroCny: 0, unknown: false },
        { requestId: 'sdk-live', taskId: 'COS-03', status: 'settled', settledMicroCny: 14_200, reservedMicroCny: 0, unknown: false },
      ],
    },
  };
}
function input() { return { snapshot: ledger(), dependencies, now, isAncestor: async (_commit: string) => true }; }

test('preparation keeps prior charges and reserves the full planning allocation in the pilot cap', async () => {
  const value = input();
  const before = structuredClone(value.snapshot);
  const result = await preparePilot(value);
  assert.equal(result.priorCommittedMicroCny, 735_971);
  assert.equal(result.planningAllocationMicroCny, 10_000_000);
  assert.equal(result.childAllocationCapMicroCny, 19_264_029);
  assert.equal(result.deadlineAt, '2026-10-01T01:30:00.000Z');
  assert.deepEqual(value.snapshot, before, 'preparation must not create or reset a ledger');
});

test('dependency approval and Git ancestry are both required before planning or generation', async () => {
  for (const missing of ['COS-07', 'COS-09']) {
    await assert.rejects(preparePilot({ ...input(), dependencies: dependencies.filter(d => d.taskId !== missing) }), new RegExp(missing));
    await assert.rejects(preparePilot({ ...input(), dependencies: dependencies.map(d => d.taskId === missing ? { ...d, state: 'open' } : d) }), /reviewed and merged/);
  }
  await assert.rejects(preparePilot({ ...input(), isAncestor: async () => false }), /ancestor/);
});

test('fresh, busy, unknown, stopped, exhausted and expired ledgers fail before any model request', async () => {
  const variants: [string, (value: ReturnType<typeof input>) => void][] = [
    ['prior', v => { v.snapshot.ledger.entries = []; }],
    ['in.flight', v => { v.snapshot.ledger.entries[1].status = 'reserved'; v.snapshot.ledger.entries[1].reservedMicroCny = 200; }],
    ['reconcil', v => { v.snapshot.ledger.entries[1].unknown = true; }],
    ['active', v => { v.snapshot.run.state = 'waiting_user'; }],
    ['pilot', v => { v.snapshot.ledger.entries[1].settledMicroCny = 29_000_000; }],
    ['deadline', v => { v.snapshot.run.originalDeadlineAt = new Date(now).toISOString(); }],
  ];
  for (const [message, alter] of variants) {
    const value = input(); alter(value);
    await assert.rejects(preparePilot(value), new RegExp(message, 'i'));
  }
});

test('a shorter original deadline and existing shared allocations constrain the new pilot', async () => {
  const value = input();
  value.snapshot.run.originalDeadlineAt = new Date(now + 60_000).toISOString();
  value.snapshot.ledger.allocations.push({ taskId: 'other', amountMicroCny: 109_000_000 });
  const result = await preparePilot(value);
  assert.equal(result.deadlineAt, '2026-10-01T00:01:00.000Z');
  assert.equal(result.childAllocationCapMicroCny, 1_000_000);
});

test('child commands receive an allowlist with no model credentials, npm hooks or Node preload', () => {
  const child = filteredChildEnvironment({ PATH: 'tools', SystemRoot: 'Windows', TEMP: 'tmp', DEEPSEEK_API_KEY: 'secret', OTHER_TOKEN: 'secret', NODE_OPTIONS: '--require secret.js', npm_config_script_shell: 'secret' });
  assert.deepEqual(child, { PATH: 'tools', SystemRoot: 'Windows', TEMP: 'tmp' });
});

test('host pricing covers text bytes and output; image requests reserve the full context', () => {
  assert.equal(requestReservation({ inputBytes: 1200, maxOutputTokens: 4096, hasImages: false }), 35_168);
  assert.equal(requestReservation({ inputBytes: 1200, maxOutputTokens: 4096, hasImages: true }), 2_032_768);
  assert.throws(() => requestReservation({ inputBytes: -1, maxOutputTokens: 4096, hasImages: false }), /inputBytes/);
});

test('the frozen plan covers every required normal-input scenario and never writes debug state', async () => {
  const requirements = JSON.parse(await readFile(new URL('../../probes/e2e/requirements.json', import.meta.url), 'utf8'));
  const plan = createPilotAcceptance({ artifactId: 'pilot-game', version: 'v1', location: 'registry/candidates/pilot-game/v1/project' }, 'http://127.0.0.1:4173', 'pilot-1', 'qa-1');
  assert.deepEqual(validatePlan(plan), []);
  assert.deepEqual(new Set(plan.acceptanceIds), new Set(requirements.acceptanceIds));
  assert.equal(plan.specVersion, requirements.specVersion);
  assert.ok(plan.steps.some(s => s.kind === 'locator-click' && s.selector === '[data-testid="return-title"]'));
  for (const id of ['PILOT-VICTORY', 'PILOT-DEFEAT', 'PILOT-RESOURCE', 'PILOT-COOLDOWN', 'PILOT-RESTART', 'PILOT-SAVE']) {
    assert.ok(plan.steps.some(s => (s.kind === 'assert' || s.kind === 'wait-for') && s.acceptanceId === id), id);
  }
  assert.ok(plan.steps.every(s => ['mouse-click', 'locator-click', 'assert', 'wait-for'].includes(s.kind)));
  assert.equal(PILOT_LIMITS.maxRequests, requirements.limits.maxRequests);
  assert.equal(PILOT_LIMITS.maxRepairTasks, requirements.limits.maxRepairTasks);
});
