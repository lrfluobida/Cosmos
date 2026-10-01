import { access, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RunController } from '../../src/runtime/run.ts';
import { preparePilot, PILOT_LIMITS } from './admission.ts';
import { assertPilotNotStarted, claimPilotOrigin, createPilotGuard, openPilotGuard } from './budget.ts';
import { generatePilot } from './driver.ts';
import { jsonFile, prepareToolchain, runChild, writeJson } from './host.ts';
import { cancelReplacedTasks, readContinuation } from './continuation.ts';
import type { Continuation } from './continuation.ts';

/** Explicit production entry: existing shared ledger only; secrets remain in process environment. */
export async function runPilot(options: { repository: string; preflightOnly?: boolean; continuation?: boolean }) {
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
    if (!options.continuation) await assertPilotNotStarted(ledgerRoot);
    if (snapshot.run.runId !== 'validation-2026-10-01' || snapshot.ledger.ledgerId !== 'cosmos-validation' || snapshot.run.specVersion !== '1.0') throw new Error('Expected the original shared validation run and spec');
    if (await git(['branch', '--show-current']) !== 'main') throw new Error('Run the independently reviewed integration from main');
    const head = await git(['rev-parse', 'HEAD']);
    if (await git(['status', '--porcelain', '--untracked-files=no'])) throw new Error('Commit reviewed platform changes before running the pilot');
    const mapping = await jsonFile(repository, 'docs/specs/github-issues.json');
    const input = { snapshot, dependencies: mapping.tasks, now: Date.now(), isAncestor: async (commit: string) => {
      const result = await runChild('git', ['merge-base', '--is-ancestor', commit, head], { cwd: repository, signal: controller.signal, timeoutMs: 15_000 }); return result.code === 0;
    } };
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

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.length === 1 && !['--preflight', '--continue'].includes(args[0])) throw new Error('Usage: node --experimental-strip-types probes/e2e/run.ts [--preflight|--continue]');
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  runPilot({ repository, preflightOnly: args[0] === '--preflight', continuation: args[0] === '--continue' }).then(result => {
    console.log(JSON.stringify(result)); if (result.outcome === 'failed') process.exitCode = 1;
  }).catch(error => { console.error(`COS-10 stopped: ${error instanceof Error ? error.message : 'Host admission failed'}`); process.exitCode = 1; });
}
