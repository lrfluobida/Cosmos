import { lstat, mkdir, open } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import type { RunController } from '../../src/runtime/run.ts';
import { safePath } from '../../src/artifacts/paths.ts';
import { PILOT_LIMITS } from './admission.ts';
import { jsonFile } from './host.ts';
import { checkTrialAdmission, readPreviousTrial, TRIAL } from './trial.ts';
import { STARTUP_DEADLINE } from './startup.ts';

/** Declaration only. It grants no paid permission and cannot be renamed at the command line. */
export const EXPERIMENT = Object.freeze({
  id: 'cos10-reviewed-validation-1', durationMs: 45 * 60 * 1000, maxRequests: 40, maxRepairTasks: 1, maxTaskAttempts: 2,
  incrementalMicroCny: 5_000_000, reviewProtocolCorrections: 1 as const, childAllocationMicroCny: 19_000_000,
  allocations: Object.freeze({ design: 1_900_000, art: 5_700_000, coding: 7_600_000, repair: 3_800_000 }),
  repairEstimate: Object.freeze({ costMicroCny: 3_000_000, durationMs: 10 * 60 * 1000, cleanupMs: 5000, requests: 8 }),
  reviewedSources: Object.freeze({ 'COS-11': '005f51bbe48fb2ec356d77f365e538394e37c740',
    'COS-12': '128f4d1604e5644cd89f00d915441a0ef178f255', 'COS-13': 'cf7d5f63a7df5de45a0fa187b5ed727304bf5344' }),
});
export const STARTUP_REJECTION_SOURCE = Object.freeze({ kind: 'coordinator_record' as const,
  commit: '0a10f4230c312cc9874be0e6499fd784b3ceba9c', path: 'docs/reviews/batch-06.md', section: 'Fixed trial outcome and startup recovery',
  summary: 'Coordinator recorded the 12:45:38Z invocation being refused after the original 12:43:38.426Z deadline; no recovery marker or request was created.' });
export interface ExperimentDecision { approvedPlatformHead: string; source: string }
function need(value: unknown, message: string): asserts value { if (!value) throw new Error(`Reviewed experiment: ${message}`); }

export async function checkExperimentAdmission(input: Parameters<typeof checkTrialAdmission>[0] & { decision: ExperimentDecision }) {
  need(input.decision?.approvedPlatformHead === input.platformHead && /^[a-f0-9]{40}$/.test(input.platformHead)
    && typeof input.decision.source === 'string' && input.decision.source.trim().length > 0 && input.decision.source.length <= 2000,
  'an explicit coordinator execution decision must name this exact main SHA and its source');
  // Reuse only the pure G2/COS-11/shared-ledger checks; never claim or reopen the historical trial.
  const shared = await checkTrialAdmission(input);
  for (const [id, sha] of Object.entries(EXPERIMENT.reviewedSources)) {
    const matches = input.dependencies.filter(item => item.taskId === id), item = matches[0];
    need(matches.length === 1 && item.reviewedCommit === sha && /^[a-f0-9]{40}$/.test(item.mergeCommit ?? ''), `${id} requires its reviewed/merged source`);
    need(item.state === 'closed' || item.reviewStatus === 'READY' && item.integrationStatus === 'offline-verified-awaiting-live', `${id} source approval is missing`);
    need(await input.isAncestor(sha) && await input.isAncestor(item.mergeCommit!), `${id} reviewed source must be an ancestor of main`);
  }
  need(await input.isAncestor(STARTUP_REJECTION_SOURCE.commit), 'the historical coordinator record must be an ancestor of main');
  need(!input.snapshot.ledger.allocations.some(item => item.taskId.startsWith(`${EXPERIMENT.id}-`))
    && !input.snapshot.ledger.entries.some(item => item.taskId.startsWith(`${EXPERIMENT.id}-`)), 'this experiment already has ledger work');
  return {
    experimentId: EXPERIMENT.id, runId: shared.runId, ledgerId: shared.ledgerId, platformHead: input.platformHead,
    decision: structuredClone(input.decision), startedAt: shared.startedAt,
    deadlineAt: new Date(Math.min(input.now + EXPERIMENT.durationMs, Date.parse(shared.sharedDeadlineAt))).toISOString(),
    sharedDeadlineAt: shared.sharedDeadlineAt, baselineCommittedMicroCny: shared.baselineCommittedMicroCny,
    baselineRequestIds: [...shared.baselineRequestIds], baselineLedger: structuredClone(input.snapshot.ledger),
    committedCapMicroCny: Math.min(PILOT_LIMITS.cumulativeMicroCny, shared.baselineCommittedMicroCny + EXPERIMENT.incrementalMicroCny),
    planningAllocationMicroCny: shared.planningAllocationMicroCny, planningUsedMicroCny: shared.planningUsedMicroCny,
    limits: EXPERIMENT, approvals: structuredClone(input.dependencies.filter(item => [...shared.approvals.map(item => item.taskId), 'COS-12', 'COS-13'].includes(item.taskId))),
  };
}
export type ExperimentAdmission = Awaited<ReturnType<typeof checkExperimentAdmission>>;

export async function readExperimentHistory(repository: string, ledgerRoot: string, now: number) {
  const pilot = await readPreviousTrial(repository, ledgerRoot);
  const root = await safePath(repository, `.cosmos/e2e/${TRIAL.id}`);
  const [marker, origin, result, journal] = await Promise.all([
    jsonFile(ledgerRoot, `${TRIAL.id}.json`), jsonFile(root, 'origin.json'), jsonFile(root, 'result.json'), jsonFile(root, 'pilot-budget.json'),
  ]);
  need(same(marker, origin) && origin.trialId === TRIAL.id && resolve(origin.root) === resolve(root) && same(origin.limits, TRIAL)
    && resolve(origin.budgets.sharedLedger) === resolve(ledgerRoot), 'historical fixed trial identity changed');
  need(origin.deadlineAt === STARTUP_DEADLINE && journal.deadlineAt === STARTUP_DEADLINE && journal.maxRequests === 40
    && journal.requestIds.length === 0 && same(journal, result.trialJournal) && now >= Date.parse(STARTUP_DEADLINE), 'historical fixed trial clock/counter changed or is not expired');
  need(result.outcome === 'failed' && result.root === root && result.platformHead === origin.platformHead && result.startedAt === origin.startedAt
    && result.deadlineAt === STARTUP_DEADLINE && result.trialCommittedMicroCny === 0, 'historical zero-request failed result changed');
  return { pilot, fixedTrial: { root, outcome: 'startup-failed-and-expired' as const, requestCount: 0, deadlineAt: STARTUP_DEADLINE,
    references: ['origin.json', 'result.json', 'pilot-budget.json'].map(name => join(root, name)), recoveryRejection: STARTUP_REJECTION_SOURCE } };
}

/** The shared controller is already locked. A partial root or marker consumes this declaration, even with zero calls. */
export async function claimExperiment(input: { repository: string; ledgerRoot: string; controller: RunController; admission: ExperimentAdmission;
  history: Awaited<ReturnType<typeof readExperimentHistory>> }) {
  const { admission } = input;
  need(resolve(input.ledgerRoot) === resolve(input.repository, '.cosmos/validation-shared'), 'only the original shared ledger path is allowed');
  need(admission.experimentId === EXPERIMENT.id && same(admission.limits, EXPERIMENT)
    && admission.decision.approvedPlatformHead === admission.platformHead && admission.decision.source.trim().length > 0,
  'only the fixed declaration with an explicit decision can be claimed');
  need(Date.parse(admission.deadlineAt) > Date.now() + 5000, 'experiment deadline expired');
  const snapshot = await input.controller.read();
  need(same(snapshot.ledger, admission.baselineLedger) && snapshot.run.runId === admission.runId && snapshot.run.ledgerId === admission.ledgerId
    && snapshot.run.originalDeadlineAt === admission.sharedDeadlineAt && snapshot.run.state === 'running' && !snapshot.stopReason, 'shared baseline changed after admission');
  const root = await safePath(input.repository, `.cosmos/e2e/${EXPERIMENT.id}`), marker = await safePath(input.ledgerRoot, `${EXPERIMENT.id}.json`);
  for (const path of [root, marker]) {
    const exists = await lstat(path).then(() => true, (error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return false; throw error; });
    need(!exists, 'this experiment already has a root or marker; no restart or recovery is allowed');
  }
  await mkdir(dirname(root), { recursive: true }); await mkdir(root);
  const origin = { ...admission, root, history: input.history, requirements: { version: 'cos10-pilot-v2', path: 'probes/e2e/requirements.json' }, reusedOutputs: [],
    purpose: 'One explicitly authorized development validation of the existing COS-10/COS-11 driver after reviewed platform changes. This is not COS-18 CLI acceptance.',
    budgets: { sharedLedger: input.ledgerRoot, sharedLimitMicroCny: 150_000_000, cumulativeAllValidationMicroCny: PILOT_LIMITS.cumulativeMicroCny,
      incrementalMicroCny: EXPERIMENT.incrementalMicroCny, oldAllocationsRetained: true }, confirmation: 'Coordinator execution decision source; no run.humanDecisions entry is fabricated.' };
  for (const path of [marker, join(root, 'origin.json')]) {
    const file = await open(path, 'wx');
    try { await file.writeFile(JSON.stringify(origin, null, 2) + '\n', 'utf8'); await file.sync(); }
    finally { await file.close(); }
  }
  return origin;
}
