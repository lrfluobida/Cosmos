import { access, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RunController } from '../../src/runtime/run.ts';
import { preparePilot, PILOT_LIMITS } from './admission.ts';
import { assertPilotNotStarted, claimPilotOrigin, createPilotGuard, openPilotGuard, openZeroRequestTrialGuard } from './budget.ts';
import { generatePilot } from './driver.ts';
import { jsonFile, prepareToolchain, runChild, writeJson } from './host.ts';
import { cancelReplacedTasks, readContinuation } from './continuation.ts';
import type { Continuation } from './continuation.ts';
import { assertTrialUnused, checkTrialAdmission, claimTrial, readPreviousTrial, TRIAL } from './trial.ts';
import { claimStartupRecovery, readStartupRecovery } from './startup.ts';
import { checkExperimentAdmission, claimExperiment, readExperimentHistory, EXPERIMENT, STARTUP_REJECTION_SOURCE } from './experiment.ts';
import type { ExperimentDecision } from './experiment.ts';

/** Explicit production entry: existing shared ledger only; secrets remain in process environment. */
export async function runPilot(options: { repository: string; preflightOnly?: boolean; continuation?: boolean; trial?: boolean; trialRecoverStartup?: boolean; experimentDecision?: ExperimentDecision }) {
  if (options.trial && options.continuation) throw new Error('The new fixed trial cannot use the historical continuation entry');
  if (options.trialRecoverStartup && (options.trial || options.continuation || options.preflightOnly)) throw new Error('Startup recovery is a single explicit fixed-trial action');
  if (options.experimentDecision && (options.trial || options.continuation || options.preflightOnly || options.trialRecoverStartup)) throw new Error('Experiment execution cannot use a historical entry');
  const repository = resolve(options.repository), ledgerRoot = join(repository, '.cosmos/validation-shared');
  await access(join(ledgerRoot, 'snapshot.json')); // Do not create a second ledger, even on a typo.
  const controller = await RunController.open({ root: ledgerRoot });
  let guard: Awaited<ReturnType<typeof createPilotGuard>> | undefined;
  let root: string | undefined;
  const git = async (args: string[]) => {
    const result = await runChild('git', args, { cwd: repository, signal: controller.signal, timeoutMs: 15_000 });
    if (result.code !== 0) throw new Error(`Git check failed: ${args[0]}`);
    return result.stdout.trim();
  };
  try {
    const snapshot = await controller.read();
    if (!options.continuation && !options.trial && !options.trialRecoverStartup && !options.experimentDecision) await assertPilotNotStarted(ledgerRoot);
    if (snapshot.run.runId !== 'validation-2026-10-01' || snapshot.ledger.ledgerId !== 'cosmos-validation' || snapshot.run.specVersion !== '1.0') throw new Error('Expected the original shared validation run and spec');
    if (await git(['branch', '--show-current']) !== 'main') throw new Error('Run the independently reviewed integration from main');
    const head = await git(['rev-parse', 'HEAD']);
    if (await git(['status', '--porcelain', '--untracked-files=no'])) throw new Error('Commit reviewed platform changes before running the pilot');
    const mapping = await jsonFile(repository, 'docs/specs/github-issues.json');
    const input = { snapshot, dependencies: mapping.tasks, now: Date.now(), isAncestor: async (commit: string) => {
      const result = await runChild('git', ['merge-base', '--is-ancestor', commit, head], { cwd: repository, signal: controller.signal, timeoutMs: 15_000 }); return result.code === 0;
    } };
    if (options.experimentDecision) {
      const admission = await checkExperimentAdmission({ ...input, platformHead: head, decision: options.experimentDecision });
      const history = await readExperimentHistory(repository, ledgerRoot, input.now);
      await git(['cat-file', '-e', `${STARTUP_REJECTION_SOURCE.commit}:${STARTUP_REJECTION_SOURCE.path}`]);
      if (!process.env.DEEPSEEK_API_KEY?.trim()) throw new Error('DEEPSEEK_API_KEY is required in the host environment');
      const origin = await claimExperiment({ repository, ledgerRoot, controller, admission, history }); root = origin.root;
      let outcome: { outcome: string; [key: string]: unknown };
      try {
        guard = await createPilotGuard({ root, controller, deadlineAt: admission.deadlineAt, maxRequests: EXPERIMENT.maxRequests, committedCapMicroCny: admission.committedCapMicroCny });
        const toolchain = await prepareToolchain(repository, root, guard.signal);
        outcome = await generatePilot({ repository, root, prefix: EXPERIMENT.id, controller, guard, toolchain,
          childAllocationCapMicroCny: EXPERIMENT.childAllocationMicroCny, confirmedAt: admission.startedAt, experiment: admission });
      } catch (error) {
        outcome = { outcome: 'failed', reason: guard?.signal.aborted || Date.now() >= Date.parse(admission.deadlineAt)
          ? 'Experiment deadline/cancellation reached' : 'Experiment stopped; preserve its native sessions and bounded host evidence',
        errorCategory: error instanceof Error ? error.name : 'Error' };
      }
      const budget = await controller.summary();
      const report = { ...outcome, experimentId: EXPERIMENT.id, root, origin: 'origin.json', platformHead: head,
        startedAt: admission.startedAt, endedAt: new Date().toISOString(), deadlineAt: admission.deadlineAt, sharedDeadlineAt: admission.sharedDeadlineAt,
        elapsedMs: Date.now() - Date.parse(admission.startedAt), baselineCommittedMicroCny: admission.baselineCommittedMicroCny,
        experimentCommittedMicroCny: budget.committedMicroCny - admission.baselineCommittedMicroCny, committedCapMicroCny: admission.committedCapMicroCny,
        budget, experimentJournal: guard ? await jsonFile(root, 'pilot-budget.json') : null,
        claims: 'One explicitly authorized COS-10/COS-11 development experiment. Historical failures remain unchanged; this is not COS-18 CLI acceptance.' };
      await writeJson(root, 'result.json', report); return report;
    }
    if (options.trialRecoverStartup) {
      const recovery = await readStartupRecovery(repository, ledgerRoot, controller); root = recovery.root;
      if (!await input.isAncestor(recovery.origin.platformHead)) throw new Error('Original platform is not an ancestor of the approved startup recovery');
      if (!process.env.DEEPSEEK_API_KEY?.trim()) throw new Error('DEEPSEEK_API_KEY is required in the host environment');
      await claimStartupRecovery(recovery, head);
      let outcome: { outcome: string; [key: string]: unknown };
      try {
        guard = await openZeroRequestTrialGuard({ root, ledgerRoot, controller, origin: recovery.origin, journal: recovery.journal });
        outcome = await generatePilot({ repository, root, prefix: TRIAL.id, controller, guard, toolchain: join(root, 'toolchain'),
          childAllocationCapMicroCny: TRIAL.childAllocationMicroCny, confirmedAt: recovery.origin.startedAt, trial: true, startupRecovery: true });
      } catch (error) {
        outcome = { outcome: 'failed', reason: guard?.signal.aborted || Date.now() >= Date.parse(recovery.origin.deadlineAt) ? 'Original trial deadline/cancellation reached' : 'Startup recovery stopped; preserve its bounded host diagnostic and native evidence',
          errorCategory: error instanceof Error ? error.name : 'Error' };
      }
      const budget = await controller.summary();
      const report = { ...outcome, trialId: TRIAL.id, root, originalResult: 'result.json', originalPlatformHead: recovery.origin.platformHead, platformHead: head,
        startedAt: recovery.origin.startedAt, endedAt: new Date().toISOString(), deadlineAt: recovery.origin.deadlineAt, sharedDeadlineAt: recovery.origin.sharedDeadlineAt,
        elapsedMs: Date.now() - Date.parse(recovery.origin.startedAt), baselineCommittedMicroCny: recovery.origin.baselineCommittedMicroCny,
        trialCommittedMicroCny: budget.committedMicroCny - recovery.origin.baselineCommittedMicroCny, budget, trialJournal: await jsonFile(root, 'pilot-budget.json'),
        claims: 'One authorized zero-request bootstrap recovery within the original trial clock; the original failed result remains unchanged.' };
      await writeJson(root, 'startup-recovery-result.json', report); return report;
    }
    if (options.trial) {
      const admission = await checkTrialAdmission({ ...input, platformHead: head });
      const previous = await readPreviousTrial(repository, ledgerRoot); await assertTrialUnused(repository, ledgerRoot);
      if (options.preflightOnly) return { outcome: 'ready', trialId: TRIAL.id, admission, previous, paidRequests: 0 };
      if (!process.env.DEEPSEEK_API_KEY?.trim()) throw new Error('DEEPSEEK_API_KEY is required in the host environment');
      const origin = await claimTrial({ repository, ledgerRoot, admission, previous }); root = origin.root;
      guard = await createPilotGuard({ root, controller, deadlineAt: admission.deadlineAt, maxRequests: TRIAL.maxRequests });
      let outcome: { outcome: string; [key: string]: unknown };
      try {
        const toolchain = await prepareToolchain(repository, root, guard.signal);
        outcome = await generatePilot({ repository, root, prefix: TRIAL.id, controller, guard, toolchain,
          childAllocationCapMicroCny: TRIAL.childAllocationMicroCny, confirmedAt: admission.startedAt, trial: true });
      } catch (error) {
        outcome = { outcome: 'failed', reason: guard.signal.aborted ? 'The fixed trial limit or cancellation reached' : 'Trial stopped; preserve native sessions and host feedback for diagnosis',
          errorCategory: error instanceof Error ? error.name : 'Error' };
      }
      const budget = await controller.summary();
      const report = { ...outcome, trialId: TRIAL.id, root, platformHead: head, previousFailedTrial: previous,
        startedAt: admission.startedAt, endedAt: new Date().toISOString(), deadlineAt: admission.deadlineAt, sharedDeadlineAt: admission.sharedDeadlineAt,
        elapsedMs: Date.now() - Date.parse(admission.startedAt), baselineCommittedMicroCny: admission.baselineCommittedMicroCny,
        trialCommittedMicroCny: budget.committedMicroCny - admission.baselineCommittedMicroCny, budget, trialJournal: await jsonFile(root, 'pilot-budget.json'),
        claims: 'This independent trial does not change the two prior failed results or establish the complete classic-game benchmark.' };
      await writeJson(root, 'result.json', report); return report;
    }
    if (options.preflightOnly && options.continuation) throw new Error('Continuation is a single explicit action');
    const admitted = options.continuation ? undefined : await preparePilot(input);
    if (options.preflightOnly) return { outcome: 'ready', platformHead: head, admission: admitted, paidRequests: 0 };
    if (!process.env.DEEPSEEK_API_KEY?.trim()) throw new Error('DEEPSEEK_API_KEY is required in the host environment');
    let continuation: Continuation | undefined, prefix: string, toolchain: string, actual: NonNullable<typeof admitted>;
    if (options.continuation) {
      continuation = await readContinuation(repository, ledgerRoot, controller);
      if (!await input.isAncestor(continuation.origin.platformHead)) throw new Error('Original reviewed platform is not an ancestor of this continuation');
      root = continuation.root; prefix = continuation.prefix; actual = continuation.origin; toolchain = join(root, 'toolchain');
      await access(join(toolchain, 'node_modules/typescript/bin/tsc')); await access(join(toolchain, 'node_modules/vite/bin/vite.js'));
      guard = await openPilotGuard({ root, ledgerRoot, controller, journal: continuation.journal });
      await writeJson(root, 'continuation-origin.json', {
        reason: 'One read-only design handoff clarification after host/downstream notes prevented verification; no game content is changed by the host.',
        continuedAt: new Date().toISOString(), platformHead: head, originalPlatformHead: continuation.origin.platformHead, originalStartedAt: actual.startedAt, originalDeadlineAt: actual.deadlineAt,
        originalResult: 'result.json', originalPlan: continuation.plan, originalJournal: continuation.journal,
        designCapture: continuation.designRef, logicalDesignAttempt: 2, maxDesignAttempts: 2, repairTasksUsed: 1, furtherRepairAllowed: false,
        mapping: continuation.mapping, successors: continuation.tasks,
        allocationAdjustment: { originalChildEnvelopeMicroCny: actual.childAllocationCapMicroCny, originalAllocationsRetained: true,
          replacedTasksNoLongerDispatch: continuation.replaced.map(task => task.taskId), additionalAllocationMicroCny: continuation.allocated,
          note: 'Coordinator-authorized successor allocations use shared unallocated funds. Old allocation records are retained, not charged reservations. Shared CNY 150 and every-request cumulative CNY 30 caps are unchanged.' },
      });
    } else {
    prefix = `pilot-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 17)}`;
    root = join(repository, '.cosmos/e2e', prefix);
    await mkdir(join(repository, '.cosmos/e2e'), { recursive: true }); await mkdir(root);
    toolchain = await prepareToolchain(repository, root, controller.signal);
    // Generic dependencies are prepared before timed generation; recheck the live ledger immediately before the paid phase.
    actual = await preparePilot({ ...input, snapshot: await controller.read(), now: Date.now() });
    await claimPilotOrigin(ledgerRoot, { root, startedAt: actual.startedAt, deadlineAt: actual.deadlineAt, platformHead: head });
    await writeJson(root, 'origin.json', { platformHead: head, templateHead: head, ...actual, requirements: 'probes/e2e/requirements.json',
      humanIntervention: ['Platform code and frozen requirements prepared by implementation agents; all game-specific outputs are requested from native Cosmos runtime roles.'],
      budgets: { sharedLedger: ledgerRoot, cumulativePilotMicroCny: PILOT_LIMITS.cumulativeMicroCny } });
    guard = await createPilotGuard({ root, controller, deadlineAt: actual.deadlineAt, maxRequests: PILOT_LIMITS.maxRequests });
    }
    let outcome: { outcome: string; [key: string]: unknown };
    try {
      if (continuation) await cancelReplacedTasks(controller, continuation);
      outcome = await generatePilot({ repository, root, prefix, controller, guard, toolchain, childAllocationCapMicroCny: actual.childAllocationCapMicroCny, confirmedAt: actual.startedAt, continuation });
    } catch (error) {
      // Never dump a provider exception or environment. Native sessions and billing contain bounded evidence.
      outcome = { outcome: 'failed', reason: guard.signal.aborted ? 'Original pilot deadline/cancellation reached' : 'Generation stopped; inspect preserved task/session/host evidence',
        errorCategory: error instanceof Error ? error.name : 'Error' };
    }
    const summary = await controller.summary();
    const report = { ...outcome, root, platformHead: head, startedAt: actual.startedAt, endedAt: new Date().toISOString(),
      elapsedMs: Date.now() - Date.parse(actual.startedAt), budget: summary, pilotBudget: await jsonFile(root, 'pilot-budget.json'),
      costKind: 'Conservative peak-rate CNY calculation from provider usage; not an account receipt',
      claims: 'Only this bounded pilot; complete classic benchmark and final user experience approval remain outside this result.' };
    await writeJson(root, continuation ? 'continuation-result.json' : 'result.json', report); return report;
  } finally { guard?.close(); await controller.close(); }
}

export function parsePilotArguments(args: string[]): Omit<Parameters<typeof runPilot>[0], 'repository'> {
  if (args[0] === '--experiment') {
    if (args.length !== 3 || !/^[a-f0-9]{40}$/.test(args[1]) || !args[2].trim() || args[2].length > 2000) throw new Error('Usage: --experiment <approved-main-sha> <coordinator-decision-source>');
    return { experimentDecision: { approvedPlatformHead: args[1], source: args[2] } };
  }
  if (args.length > 1 || args.length === 1 && !['--preflight', '--continue', '--trial', '--trial-preflight', '--trial-recover-startup'].includes(args[0])) throw new Error('Usage: node --experimental-strip-types probes/e2e/run.ts [--preflight|--continue|--trial|--trial-preflight|--trial-recover-startup|--experiment <approved-main-sha> <coordinator-decision-source>]');
  return { preflightOnly: ['--preflight', '--trial-preflight'].includes(args[0]), continuation: args[0] === '--continue', trial: ['--trial', '--trial-preflight'].includes(args[0]), trialRecoverStartup: args[0] === '--trial-recover-startup' };
}

/** Two strict opt-in validation flags bind the fixed native host; legacy flags retain their original gates. */
export async function runPilotEntry(args: string[], repository: string) {
  if (['--validation-preflight', '--validation-case'].includes(args[0])) {
    const { parseValidationEntry } = await import('./validation-declaration.ts');
    const intent = parseValidationEntry(args);
    const { preflightValidationRun, runValidationWithHost } = await import('./validation-run.ts');
    if (intent.preflightOnly) return preflightValidationRun({ repository, args });
    const { createNativeValidationHost } = await import('./validation-host.ts');
    return runValidationWithHost({ repository, args, host: createNativeValidationHost() });
  }
  return runPilot({ repository, ...parsePilotArguments(args) });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  runPilotEntry(args, repository).then(result => {
    console.log(JSON.stringify(result)); if (result.outcome === 'failed') process.exitCode = 1;
  }).catch(error => { console.error(`COS-10 stopped: ${error instanceof Error ? error.message : 'Host admission failed'}`); process.exitCode = 1; });
}
