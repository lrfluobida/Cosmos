import { randomUUID } from 'node:crypto';
import { lstat, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { regularFile, safePath } from '../../src/artifacts/paths.ts';
import { ArtifactRegistry } from '../../src/artifacts/index.ts';
import { sameValue } from '../../src/contracts/validation.ts';
import { validationBudgetGroup } from '../../src/contracts/budget.ts';
import { RunController } from '../../src/runtime/run.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { prepareValidationCase, verifyOperatorDecision } from '../../src/runtime/validation-window.ts';
import { VALIDATION_ROLES, validationHash, validationInputHash } from '../../src/runtime/validation-validation.ts';
import { validationCaseView } from '../../src/runtime/execution-window.ts';
import { OwnedWork, cancelAndDrain } from '../../src/runtime/recovery/owned-work.ts';
import { publishReceipt } from '../../src/runtime/recovery/receipt-file.ts';
import type { ValidationRunHost, ValidationHostResult } from '../e2e/validation-run.ts';
import { VALIDATION_CASE } from '../e2e/validation-declaration.ts';
import { runChild } from '../e2e/host.ts';
import { TRANSFER_VALIDATION_CASE, parseTransferValidationEntry } from './validation-declaration.ts';
import { TRANSFER_VALIDATION_CASE_TWO, parseTransferValidationCaseTwoEntry } from './validation-case-two-declaration.ts';
import { TRANSFER_VALIDATION_CASE_THREE, parseTransferValidationCaseThreeEntry } from './validation-case-three-declaration.ts';
import { TRANSFER_VALIDATION_CASE_FOUR, parseTransferValidationCaseFourEntry } from './validation-case-four-declaration.ts';
import { createTransferValidationIdentityReader, createTransferValidationCaseTwoIdentityReader, createTransferValidationCaseThreeIdentityReader, createTransferValidationCaseFourIdentityReader } from './validation-input.ts';

const SOURCE_MARKERS: Record<string, string> = {
  'COS-20': 'CASE_TWO_SOURCE_READY', 'COS-21': 'WINDOWS_PUBLICATION_SOURCE_READY', 'COS-22': 'VERSIONED_CASE_THREE_SOURCE_READY',
  'COS-23': 'AUTHOR_PROTOCOL_SOURCE_READY', 'COS-24': 'VALIDATION_ALLOCATION_CLOSURE_SOURCE_READY', 'COS-25': 'CASE_FOUR_SOURCE_READY',
  'COS-26': 'PLANNING_EFFECTIVE_CAPACITY_SOURCE_READY', 'COS-27': 'CASE_FIVE_SOURCE_READY', 'COS-28': 'HANDOFF_SCOPE_CLARIFICATION_SOURCE_READY',
  'COS-29': 'CASE_SIX_SOURCE_READY', 'COS-30': 'HOST_EVIDENCED_HANDOFF_SOURCE_READY', 'COS-31': 'CASE_SEVEN_SOURCE_READY',
  'COS-32': 'BROWSER_DEFECT_CLASSIFICATION_SOURCE_READY', 'COS-33': 'CASE_EIGHT_SOURCE_READY', 'COS-34': 'USER_EXPERIENCE_DECISION_SOURCE_READY',
  'COS-35': 'SHARED_VALIDATION_BROWSER_HOST_SOURCE_READY', 'COS-36': 'TRANSFER_DESIGN_BINDING_SOURCE_READY', 'COS-37': 'PERSISTENT_PROFILE_PROCESS_REOPEN_SOURCE_READY',
  'COS-38': 'TRANSFER_RUNTIME_INPUT_ADAPTER_SOURCE_READY', 'COS-39': 'PERSISTENT_FAILURE_FACTS_SOURCE_READY',
  'COS-40': 'TRANSFER_PERSISTENT_MEDIA_CONSUMER_SOURCE_READY', 'COS-41': 'TRANSFER_DESIGN_FEEDBACK_SOURCE_READY', 'COS-42': 'VALIDATION_COS16_GROUP_SOURCE_READY',
};
const SOURCE_READY = ['READY', 'SOURCE_READY', 'COMBINED_SOURCE_READY', 'PHASE_B_READY', 'READY_FOR_ROLE_IO_INTEGRATION'];
/** Only these four frozen source-owned profiles are constructed; callers cannot select declarations. */
function fixedEntry(D: typeof TRANSFER_VALIDATION_CASE, parseEntry: typeof parseTransferValidationEntry,
  identity: typeof createTransferValidationIdentityReader, profile: 1 | 2 | 3 | 4) {
const markers: Record<string, string> = { ...SOURCE_MARKERS,
  ...(profile >= 2 ? { 'COS-43': 'TRANSFER_NATIVE_ENTRY_SOURCE_READY', 'COS-44': 'PLANNING_POLICY_SCHEMA_SOURCE_READY' } : {}),
  ...(profile >= 3 ? { 'COS-45': 'TRANSFER_CASE_TWO_SOURCE_READY', 'COS-46': 'DESIGN_OUTPUT_SELF_CHECK_SOURCE_READY' } : {}),
  ...(profile === 4 ? { 'COS-47': 'TRANSFER_CASE_THREE_SOURCE_READY', 'COS-48': 'PLANNING_HOST_IDENTITY_BINDING_SOURCE_READY' } : {}) };
const PREREQUISITES = ['COS-02', 'COS-03', 'COS-06', 'COS-07', 'COS-08', 'COS-09', 'COS-11', 'COS-12', 'COS-13', 'COS-18', 'COS-19', ...Object.keys(markers)];
async function absent(repository: string, path: string, label: string) {
  try { await lstat(await safePath(repository, path)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  throw new Error(`${label} exists or remains unresolved; a consumed identity cannot restart.`);
}
async function prepare(options: { repository: string; args: string[]; signal?: AbortSignal }) {
  const repository = resolve(options.repository), intent = parseEntry(options.args), signal = options.signal ?? new AbortController().signal;
  signal.throwIfAborted(); await safePath(repository);
  const ledgerRoot = join(repository, '.cosmos/validation-shared'), caseRoot = join(repository, '.cosmos/e2e', intent.caseId);
  await absent(repository, `.cosmos/e2e/${intent.caseId}`, 'Transfer case root');
  await absent(repository, `.cosmos/validation-shared/${intent.caseId}.json`, 'Transfer case marker');
  for (const lock of ['.controller.lock', 'registry/.commit.lock']) await absent(repository, `.cosmos/validation-shared/${lock}`, 'Original writer ownership');
  const bytes = await regularFile(ledgerRoot, 'snapshot.json'), state = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); validateSnapshot(state);
  if (state.formatVersion !== 3 || state.ledger.contractVersion !== (profile >= 2 ? '4.0.0' : '3.0.0') || state.run.runId !== 'validation-2026-10-01'
    || state.ledger.ledgerId !== 'cosmos-validation' || state.run.specVersion !== '1.0' || state.run.originalStartedAt !== '2026-10-01T06:16:16.857Z'
    || state.run.originalDeadlineAt !== '2026-10-01T18:16:16.857Z' || !state.stopReason
    || !state.ledger.entries.some(entry => entry.requestId === 'prior-deepseek-direct-probes' && entry.status === 'settled' && entry.settledMicroCny >= 721_771)) throw new Error(`The original audited ledger${profile >= 2 ? '4' : '3'}, run, clock and historical charges are required.`);
  const previous = Array.from({ length: 8 }, (_, index) => state.validation?.cases.find(window => window.caseId === `cos20-native-validation-${index + 1}`));
  if (profile >= 2) previous.push(state.validation?.cases.find(window => window.caseId === TRANSFER_VALIDATION_CASE.caseId));
  if (profile >= 3) previous.push(state.validation?.cases.find(window => window.caseId === TRANSFER_VALIDATION_CASE_TWO.caseId));
  if (profile === 4) previous.push(state.validation?.cases.find(window => window.caseId === TRANSFER_VALIDATION_CASE_THREE.caseId));
  const currentCaseId = profile === 4 ? TRANSFER_VALIDATION_CASE_THREE.caseId : profile === 3 ? TRANSFER_VALIDATION_CASE_TWO.caseId : profile === 2 ? TRANSFER_VALIDATION_CASE.caseId : 'cos20-native-validation-8';
  if (state.validation?.cases.length !== 7 + profile || state.validation.currentCaseId !== currentCaseId
    || previous.some(window => !window?.stopReason)) throw new Error(profile === 4 ? 'All eleven original validation cases must be consumed and explicitly stopped, with current transfer case3.'
      : profile === 3 ? 'All ten original validation cases must be consumed and explicitly stopped, with current transfer case2.'
      : profile === 2 ? 'All nine original validation cases must be consumed and explicitly stopped, with current transfer case1.'
      : 'All eight original validation cases must be consumed and explicitly stopped, with current case8.');
  if (profile >= 2) {
    const first = previous[8]!, group = validationBudgetGroup(state.ledger);
    if (!sameValue(first.quote.declaration, TRANSFER_VALIDATION_CASE) || first.quote.formatVersion !== 'validation-case-quote-2'
      || state.ledger.allocationDelegations?.length !== profile - 1 || state.ledger.allocationDelegations[0].caseId !== first.caseId
      || group?.committedMicroCny !== (profile === 4 ? 190_410 : profile === 3 ? 175_630 : 14_102)
      || group.allocatedMicroCny !== (profile === 4 ? 190_410 : profile === 3 ? 175_630 : 14_102)) throw new Error('The original stopped case1 delegation and its exact remaining COS16 capacity are required.');
    if (profile >= 3) {
      const second = previous[9]!, expectedFees = [profile === 4 ? 45_088 : 30_308, 145_322, 0, 0, 0];
      const declarations = [TRANSFER_VALIDATION_CASE, TRANSFER_VALIDATION_CASE_TWO, ...(profile === 4 ? [TRANSFER_VALIDATION_CASE_THREE] : [])];
      const roleFees = VALIDATION_ROLES.map(role => state.ledger.entries.filter(entry => declarations.some(declaration => declaration.grants[role].taskId === entry.taskId))
        .reduce((sum, entry) => sum + entry.settledMicroCny + entry.reservedMicroCny, 0));
      if (!sameValue(second.quote.declaration, TRANSFER_VALIDATION_CASE_TWO) || second.quote.formatVersion !== 'validation-case-quote-2'
        || state.ledger.allocationDelegations[1].caseId !== second.caseId || !sameValue(roleFees, expectedFees)) throw new Error('The original stopped case2 delegation and exact role fee distribution are required for the fixed remaining capacity.');
    }
    if (profile === 4) {
      const third = previous[10]!;
      if (!sameValue(third.quote.declaration, TRANSFER_VALIDATION_CASE_THREE) || third.quote.formatVersion !== 'validation-case-quote-2'
        || state.ledger.allocationDelegations[2].caseId !== third.caseId) throw new Error('The original stopped case3 declaration and delegation are required.');
    }
  }
  const histories = previous.map(window => window!), taskIds = histories.flatMap(window => VALIDATION_ROLES.map(role => window.quote.declaration.grants[role].taskId));
  if (state.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny || !['settled', 'cancelled'].includes(entry.status))) throw new Error('Historical requests require reconciliation.');
  if (state.ledger.allocationClosures?.length !== 40 + 5 * (profile - 1) || state.allocationClosureDecisions?.length !== 5 + profile
    || taskIds.some(taskId => !state.ledger.allocationClosures!.some(closure => closure.taskId === taskId))) throw new Error(profile === 4 ? 'The original fifty-five closed grants and nine allocation audits are required.'
      : profile === 3 ? 'The original fifty closed grants and eight allocation audits are required.' : 'The original forty closed grants and six allocation audits are required.');
  const roots = new Map<string, string>(), historicalSources: string[] = [];
  for (const window of histories) {
    if (!sameValue(window.quote.declaration.inputs, [TRANSFER_VALIDATION_CASE.caseId, TRANSFER_VALIDATION_CASE_TWO.caseId, TRANSFER_VALIDATION_CASE_THREE.caseId].includes(window.caseId) ? TRANSFER_VALIDATION_CASE.inputs : VALIDATION_CASE.inputs)) throw new Error('Historical fixed declaration inputs changed.');
    const path = `.cosmos/e2e/${window.caseId}`, root = await safePath(repository, path);
    if (!(await lstat(root)).isDirectory()) throw new Error('Historical case root is missing.');
    for (const lock of ['.controller.lock', 'registry/.commit.lock']) await absent(repository, `${path}/${lock}`, 'Historical writer ownership');
    roots.set(window.caseId, root);
    const { sourceSha256, ...decision } = window.operatorDecision;
    if ((await verifyOperatorDecision(ledgerRoot, window.quote, decision, Date.now())).sourceSha256 !== sourceSha256) throw new Error('Historical operator source bytes changed.');
    historicalSources.push(window.quote.identity.reviewedPlatformSha);
  }
  for (const receipt of state.allocationClosureDecisions!) {
    const { sourceSha256, ...decision } = receipt.operatorDecision, source = await regularFile(ledgerRoot, decision.source.location);
    const historical = histories.find(window => window.caseId === receipt.quote.basis.currentCaseId);
    if (!historical || receipt.quote.identity.frozenCaseInputHash !== validationInputHash(historical.quote.declaration)
      || validationHash(source) !== sourceSha256 || !sameValue(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(source)), {
        formatVersion: 'operator-validation-allocation-closure-decision-1', kind: decision.kind, decisionId: decision.decisionId, actorId: decision.actorId,
        decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote: receipt.quote })
      || receipt.quote.cases.some(item => item.artifactRoot !== roots.get(item.caseId))) throw new Error('Historical allocation closure source, original declaration or fixed root changed.');
    historicalSources.push(receipt.quote.identity.reviewedPlatformSha);
  }
  const identityReader = identity({ repository, reviewedPlatformSha: intent.reviewedPlatformSha });
  await identityReader(signal);
  const mapping = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(repository, 'docs/specs/github-issues.json')));
  const approvals: { taskId: string; reviewedCommit: string; mergeCommit: string }[] = [];
  for (const taskId of PREREQUISITES) {
    const matches = (mapping.tasks ?? []).filter((item: any) => item.taskId === taskId), item = matches[0];
    if (matches.length !== 1 || !/^[a-f0-9]{40}$/.test(item.reviewedCommit ?? '') || !/^[a-f0-9]{40}$/.test(item.mergeCommit ?? '')
      || !(Object.hasOwn(markers, taskId) ? item.reviewStatus === markers[taskId]
        && (['integrated', 'offline-verified-awaiting-live', 'source-integrated', 'complete'].includes(item.integrationStatus)
          || taskId === 'COS-22' && item.integrationStatus === 'actual-validation-failed-author-handoff')
        : item.state === 'closed' || SOURCE_READY.includes(item.reviewStatus) && ['integrated', 'partial-offline-verified', 'offline-verified-awaiting-live', 'complete'].includes(item.integrationStatus))) throw new Error(`${taskId} requires unique independently reviewed and integrated source.`);
    approvals.push({ taskId, reviewedCommit: item.reviewedCommit, mergeCommit: item.mergeCommit });
  }
  for (const sha of new Set([...historicalSources, ...approvals.flatMap(item => [item.reviewedCommit, item.mergeCommit])])) {
    const result = await runChild('git', ['--no-optional-locks', 'merge-base', '--is-ancestor', sha, intent.reviewedPlatformSha], { cwd: repository, signal, timeoutMs: 5000 });
    if (result.code !== 0) throw new Error('Required historical or reviewed source is not an ancestor of this exact main SHA.');
  }
  const quote = await prepareValidationCase({ root: ledgerRoot, repositoryRoot: repository, declaration: D, identityReader, signal });
  if (!bytes.equals(await regularFile(ledgerRoot, 'snapshot.json'))) throw new Error('Transfer baseline changed while checking sources.');
  return { repository, ledgerRoot, caseRoot, intent, signal, identityReader, quote, approvals };
}
/** Read-only source/ledger/input inspection; no owner, host preparation, expiry or write. */
async function preflightTransferValidationRun(options: { repository: string; args: string[]; signal?: AbortSignal }) {
  const value = await prepare(options);
  return { outcome: 'ready' as const, caseRoot: value.caseRoot, ledgerRoot: value.ledgerRoot, quote: value.quote, sourceApprovals: value.approvals, paidRequests: 0 };
}
/** Trusted assembly seam for pure tests. The executable always binds the fixed native host below. */
async function runTransferValidationWithHost(options: { repository: string; args: string[]; host: ValidationRunHost; signal?: AbortSignal }) {
  const intent = parseEntry(options.args);
  if (intent.preflightOnly) return preflightTransferValidationRun(options);
  if (!options.host || typeof options.host.prepare !== 'function' || typeof options.host.execute !== 'function') throw new Error('The fixed native transfer host is required.');
  const prepared = await prepare(options), { repository, ledgerRoot, caseRoot, quote, signal, identityReader } = prepared;
  await options.host.prepare({ repository, quote, signal }); signal.throwIfAborted();
  const current = await prepare(options);
  if (current.quote.quoteId !== quote.quoteId) throw new Error('Transfer baseline changed during environment preparation.');
  const decisionId = `operator-${randomUUID()}`, decision = { kind: 'operator_validation' as const, decisionId, actorId: 'coordinator', decidedAt: new Date().toISOString(),
    source: { artifactId: 'operator-validation-decision', version: decisionId, location: `${decisionId}.json` },
    sourceRefs: [{ artifactId: 'standing-validation-authorization', version: intent.reviewedPlatformSha, location: intent.operatorSource! }] };
  await publishReceipt(join(ledgerRoot, decision.source.location), { formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId,
    actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote });
  const window = await RunController.claimValidationCase({ root: ledgerRoot, repositoryRoot: repository, identityReader, quote, decision, signal });
  const controller = await RunController.openValidationCase({ root: ledgerRoot, repositoryRoot: repository, identityReader, caseId: window.caseId, windowId: window.windowId, signal });
  const work = new OwnedWork(controller.signal), stop = () => cancelAndDrain(controller, work, 'Transfer validation stopped by its coordinator.');
  const interrupt = () => { void stop().catch(() => {}); };
  const cutoff = setTimeout(interrupt, Math.max(1, Date.parse(window.deadlineAt) - Date.now() - 5000)); cutoff.unref();
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  try {
    let result: ValidationHostResult;
    try {
      result = await work.run(async ownedSignal => {
        await mkdir(dirname(caseRoot), { recursive: true }); await mkdir(caseRoot);
        await publishReceipt(join(caseRoot, 'origin.json'), { caseId: window.caseId, windowId: window.windowId, quote, decision,
          platformHead: intent.reviewedPlatformSha, sourceApprovals: prepared.approvals, purpose: 'Internal COS16 operator experiment; public CLI and human acceptance remain pending.' });
        await publishReceipt(join(ledgerRoot, `${window.caseId}.json`), { caseId: window.caseId, windowId: window.windowId, root: caseRoot, quoteId: quote.quoteId });
        return options.host.execute({ repository, ledgerRoot, root: caseRoot, controller, window, work, signal: ownedSignal });
      });
    } catch { result = { outcome: 'failed', gaps: ['Transfer startup or execution did not complete; preserve source evidence and reconcile charges.'] }; }
    const finishGaps: string[] = [];
    const check = async () => {
      const state = await controller.read(), view = validationCaseView(state), scope = view.validationCase;
      if (scope.stopReason) finishGaps.push('The case stopped before completion.');
      if (Date.now() + 5000 >= Date.parse(window.deadlineAt)) finishGaps.push('The original case deadline cannot cover completion and cleanup.');
      if (state.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny > 0)) finishGaps.push('Unresolved or reserved fees prevent completion.');
      const group = await controller.validationAuthority(D.grants.planning.taskId, 'planning');
      if (scope.caseCommittedMicroCny > D.limits.incrementalMicroCny || scope.committedMicroCny > D.limits.cumulativeMicroCny
        || scope.committedMicroCny > D.limits.lifetimeMicroCny || !group.budgetGroup || group.budgetGroup.committedMicroCny > group.budgetGroup.limitMicroCny) finishGaps.push('An applicable case, original group or shared fee limit was exceeded.');
      if (result.outcome === 'passed') {
        const accepted = await new ArtifactRegistry(caseRoot, 'registry').current().catch(() => null);
        if (!result.accepted || !accepted || !sameValue(accepted.candidateRef, result.accepted)) finishGaps.push('The accepted candidate promotion is unavailable or changed.');
      }
      return state;
    };
    await check(); const beforeStop = await check(), closing = validationCaseView(beforeStop).validationCase;
    const ownsStop = !controller.signal.aborted && closing.stopReason === null;
    await cancelAndDrain(controller, work, 'This one-shot transfer validation finished; its identity remains consumed.');
    const state = await controller.read(), view = validationCaseView(state), events = state.events.slice(beforeStop.events.length).filter(event => event.type === 'validation_case_stopped');
    if (!ownsStop || events.length !== 1 || view.validationCase.stopReason?.code !== 'manual' || Date.parse(view.validationCase.stopReason.at) > Date.parse(events[0].at)
      || view.validationCase.stopReason.reason !== events[0].reason) finishGaps.push('A separate stop occurred before normal completion.');
    if (Date.now() >= Date.parse(window.deadlineAt) || state.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny)) finishGaps.push('Cleanup exceeded the original deadline or left unresolved fees.');
    const group = validationBudgetGroup(state.ledger), scope = view.validationCase;
    if (!group || group.committedMicroCny > group.limitMicroCny || scope.caseCommittedMicroCny > D.limits.incrementalMicroCny
      || scope.committedMicroCny > D.limits.cumulativeMicroCny || scope.committedMicroCny > D.limits.lifetimeMicroCny) finishGaps.push('Cleanup exceeded an applicable case, group or shared fee limit.');
    if (result.outcome === 'passed') {
      const accepted = await new ArtifactRegistry(caseRoot, 'registry').current().catch(() => null);
      if (!result.accepted || !accepted || !sameValue(accepted.candidateRef, result.accepted)) finishGaps.push('Accepted promotion changed during cleanup.');
    }
    const report = { outcome: result.outcome === 'passed' && !result.gaps.length && !finishGaps.length ? 'passed' : 'failed', ...view.validationCase,
      platformHead: intent.reviewedPlatformSha, endedAt: new Date().toISOString(), elapsedMs: Date.now() - Date.parse(window.startedAt), original: view.original,
      sourceApprovals: prepared.approvals, budgetGroup: { authorization: quote.budgetGroup, current: group }, gaps: [...new Set([...result.gaps, ...finishGaps])],
      taskHistory: state.tasks.filter(task => Object.values(D.grants).some(grant => grant.taskId === task.taskId)),
      repair: state.validation!.cases.find(item => item.caseId === window.caseId)!.repair,
      ...(result.tasks ? { tasks: result.tasks } : {}), ...(result.plan ? { plan: result.plan } : {}), ...(result.accepted ? { accepted: result.accepted } : {}),
      userExperience: 'not_confirmed', claims: 'Bounded internal operator experiment only; COS16/COS18 public human gates remain pending.' };
    if (!(await lstat(caseRoot).catch(() => null))) { await mkdir(dirname(caseRoot), { recursive: true }); await mkdir(caseRoot); }
    await publishReceipt(join(caseRoot, 'result.json'), report); return report;
  } finally {
    clearTimeout(cutoff); process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
    await work.cancelAndDrain('Transfer host closing.'); await controller.close();
  }
}
function createNativeTransferValidationHost(): ValidationRunHost {
  return {
    prepare: async input => (await import('../e2e/validation-host.ts')).createNativeValidationHost().prepare(input),
    execute: async input => {
      const driver = await import('./validation-driver.ts');
      return profile === 4 ? driver.generateTransferValidationCaseFour(input) : profile === 3 ? driver.generateTransferValidationCaseThree(input) : profile === 2 ? driver.generateTransferValidationCaseTwo(input) : driver.generateTransferValidationCase(input);
    },
  };
}
async function runTransferValidationEntry(args: string[], repository: string) {
  const intent = parseEntry(args);
  return intent.preflightOnly ? preflightTransferValidationRun({ repository, args }) : runTransferValidationWithHost({ repository, args, host: createNativeTransferValidationHost() });
}
return { preflightTransferValidationRun, runTransferValidationWithHost, createNativeTransferValidationHost, runTransferValidationEntry };
}
export const { preflightTransferValidationRun, runTransferValidationWithHost, createNativeTransferValidationHost, runTransferValidationEntry }
  = fixedEntry(TRANSFER_VALIDATION_CASE, parseTransferValidationEntry, createTransferValidationIdentityReader, 1);
export const { preflightTransferValidationRun: preflightTransferValidationCaseTwoRun, runTransferValidationWithHost: runTransferValidationCaseTwoWithHost,
  createNativeTransferValidationHost: createNativeTransferValidationCaseTwoHost, runTransferValidationEntry: runTransferValidationCaseTwoEntry }
  = fixedEntry(TRANSFER_VALIDATION_CASE_TWO, parseTransferValidationCaseTwoEntry, createTransferValidationCaseTwoIdentityReader, 2);
export const { preflightTransferValidationRun: preflightTransferValidationCaseThreeRun, runTransferValidationWithHost: runTransferValidationCaseThreeWithHost,
  createNativeTransferValidationHost: createNativeTransferValidationCaseThreeHost, runTransferValidationEntry: runTransferValidationCaseThreeEntry }
  = fixedEntry(TRANSFER_VALIDATION_CASE_THREE, parseTransferValidationCaseThreeEntry, createTransferValidationCaseThreeIdentityReader, 3);
export const { preflightTransferValidationRun: preflightTransferValidationCaseFourRun, runTransferValidationWithHost: runTransferValidationCaseFourWithHost,
  createNativeTransferValidationHost: createNativeTransferValidationCaseFourHost, runTransferValidationEntry: runTransferValidationCaseFourEntry }
  = fixedEntry(TRANSFER_VALIDATION_CASE_FOUR, parseTransferValidationCaseFourEntry, createTransferValidationCaseFourIdentityReader, 4);
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runTransferValidationEntry(process.argv.slice(2), fileURLToPath(new URL('../../', import.meta.url))).then(result => {
    console.log(JSON.stringify(result)); if (result.outcome === 'failed') process.exitCode = 1;
  }).catch(error => { console.error(`COS16 operator validation stopped: ${error instanceof Error ? error.message : 'Admission failed'}`); process.exitCode = 1; });
}
