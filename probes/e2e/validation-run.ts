import { randomUUID } from 'node:crypto';
import { lstat, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { regularFile, safePath } from '../../src/artifacts/paths.ts';
import { ArtifactRegistry } from '../../src/artifacts/index.ts';
import { sameValue } from '../../src/contracts/validation.ts';
import type { ArtifactReference, TaskContract } from '../../src/contracts/index.ts';
import { RunController } from '../../src/runtime/run.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { prepareValidationCase, verifyOperatorDecision } from '../../src/runtime/validation-window.ts';
import { VALIDATION_ROLES, validationHash, validationInputHash } from '../../src/runtime/validation-validation.ts';
import { validationCaseView } from '../../src/runtime/execution-window.ts';
import type { ValidationCaseQuote, ValidationCaseWindow } from '../../src/runtime/validation-types.ts';
import { OwnedWork, cancelAndDrain } from '../../src/runtime/recovery/owned-work.ts';
import { publishReceipt } from '../../src/runtime/recovery/receipt-file.ts';
import { VALIDATION_CASE, parseValidationEntry } from './validation-declaration.ts';
import { createValidationIdentityReader } from './validation-identity.ts';
import { runChild } from './host.ts';

const SOURCE_PREREQUISITES = ['COS-06', 'COS-07', 'COS-08', 'COS-09', 'COS-11', 'COS-12', 'COS-13', 'COS-18', 'COS-19', 'COS-20', 'COS-21', 'COS-22', 'COS-23', 'COS-24', 'COS-25', 'COS-26', 'COS-27', 'COS-28', 'COS-29', 'COS-30'];
const SOURCE_MARKERS: Record<string, string> = { 'COS-20': 'CASE_TWO_SOURCE_READY', 'COS-21': 'WINDOWS_PUBLICATION_SOURCE_READY',
  'COS-22': 'VERSIONED_CASE_THREE_SOURCE_READY', 'COS-23': 'AUTHOR_PROTOCOL_SOURCE_READY', 'COS-24': 'VALIDATION_ALLOCATION_CLOSURE_SOURCE_READY',
  'COS-25': 'CASE_FOUR_SOURCE_READY', 'COS-26': 'PLANNING_EFFECTIVE_CAPACITY_SOURCE_READY', 'COS-27': 'CASE_FIVE_SOURCE_READY',
  'COS-28': 'HANDOFF_SCOPE_CLARIFICATION_SOURCE_READY', 'COS-29': 'CASE_SIX_SOURCE_READY',
  'COS-30': 'HOST_EVIDENCED_HANDOFF_SOURCE_READY' };
const SOURCE_READY = ['READY', 'SOURCE_READY', 'COMBINED_SOURCE_READY', 'PHASE_B_READY', 'READY_FOR_ROLE_IO_INTEGRATION'];
async function absent(repository: string, path: string, label: string): Promise<void> {
  try { await lstat(await safePath(repository, path)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  throw new Error(`${label} already exists or is unresolved; no restart or implicit recovery is allowed.`);
}
async function prepare(options: { repository: string; args: string[]; signal?: AbortSignal }) {
  const repository = resolve(options.repository), intent = parseValidationEntry(options.args), signal = options.signal ?? new AbortController().signal;
  signal.throwIfAborted(); await safePath(repository);
  const ledgerRoot = join(repository, '.cosmos/validation-shared'), caseRoot = join(repository, '.cosmos/e2e', VALIDATION_CASE.caseId);
  await absent(repository, `.cosmos/e2e/${VALIDATION_CASE.caseId}`, 'Validation case root');
  await absent(repository, `.cosmos/validation-shared/${VALIDATION_CASE.caseId}.json`, 'Validation case marker');
  for (const lock of ['.controller.lock', 'registry/.commit.lock']) await absent(repository, `.cosmos/validation-shared/${lock}`, 'Original writer ownership');
  const state = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(ledgerRoot, 'snapshot.json'))); validateSnapshot(state);
  if (state.run.runId !== 'validation-2026-10-01' || state.ledger.ledgerId !== 'cosmos-validation' || state.run.specVersion !== '1.0'
    || state.run.originalDeadlineAt !== '2026-10-01T18:16:16.857Z' || !state.ledger.entries.some(entry => entry.requestId === 'prior-deepseek-direct-probes' && entry.status === 'settled' && entry.settledMicroCny >= 721_771)) throw new Error('The fixed original validation ledger and historical charges are required.');
  const caseOne = state.validation?.cases.find(item => item.caseId === 'cos20-native-validation-1');
  const caseTwo = state.validation?.cases.find(item => item.caseId === 'cos20-native-validation-2');
  const caseThree = state.validation?.cases.find(item => item.caseId === 'cos20-native-validation-3');
  const caseFour = state.validation?.cases.find(item => item.caseId === 'cos20-native-validation-4');
  const caseFive = state.validation?.cases.find(item => item.caseId === 'cos20-native-validation-5');
  const caseSix = state.validation?.cases.find(item => item.caseId === 'cos20-native-validation-6');
  if (state.formatVersion !== 3 || !caseOne?.stopReason || !caseTwo?.stopReason || !caseThree?.stopReason || !caseFour?.stopReason || !caseFive?.stopReason || !caseSix?.stopReason || state.validation?.cases.length !== 6
    || state.validation.currentCaseId !== caseSix.caseId) throw new Error('Case 7 requires original case 1, case 2, case 3, case 4, case 5 and current case 6 to be explicitly stopped in its existing validation profile.');
  if (state.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny || !['settled', 'cancelled'].includes(entry.status))) throw new Error('Unknown or reserved historical charges require reconciliation.');
  const previousCases = [caseOne, caseTwo, caseThree, caseFour, caseFive, caseSix], taskIds = previousCases.flatMap(window => VALIDATION_ROLES.map(role => window.quote.declaration.grants[role].taskId));
  if (state.ledger.contractVersion !== '3.0.0' || state.ledger.allocationClosures?.length !== 30
    || taskIds.some(taskId => !state.ledger.allocationClosures!.some(closure => closure.taskId === taskId))) throw new Error('Case 7 requires audited allocation closure of all thirty previous case grants.');
  const caseRoots = new Map<string, string>();
  for (const window of previousCases) {
    const path = `.cosmos/e2e/${window.caseId}`, root = await safePath(repository, path);
    if (!(await lstat(root)).isDirectory()) throw new Error('Historical validation case root must be an existing directory.');
    for (const lock of ['.controller.lock', 'registry/.commit.lock']) await absent(repository, `${path}/${lock}`, 'Historical case writer ownership');
    caseRoots.set(window.caseId, root);
    const { sourceSha256, ...decision } = window.operatorDecision;
    if ((await verifyOperatorDecision(ledgerRoot, window.quote, decision, Date.now())).sourceSha256 !== sourceSha256) throw new Error('Historical operator validation source changed.');
  }
  const closureSources: string[] = [];
  for (const receipt of state.allocationClosureDecisions!) {
    const { sourceSha256, ...decision } = receipt.operatorDecision, bytes = await regularFile(ledgerRoot, decision.source.location);
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (validationHash(bytes) !== sourceSha256 || !sameValue(value, { formatVersion: 'operator-validation-allocation-closure-decision-1', kind: decision.kind,
      decisionId: decision.decisionId, actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote: receipt.quote })
      || receipt.quote.identity.frozenCaseInputHash !== validationInputHash(VALIDATION_CASE)
      || receipt.quote.cases.some(item => item.artifactRoot !== caseRoots.get(item.caseId))) throw new Error('Historical allocation closure source, receipt or fixed case root changed.');
    closureSources.push(receipt.quote.identity.reviewedPlatformSha);
  }
  const identityReader = createValidationIdentityReader({ repository, reviewedPlatformSha: intent.reviewedPlatformSha });
  await identityReader(signal);
  const mapping = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(repository, 'docs/specs/github-issues.json')));
  const approvals: { taskId: string; reviewedCommit: string; mergeCommit: string }[] = [];
  for (const taskId of SOURCE_PREREQUISITES) {
    const matches = (mapping.tasks ?? []).filter((item: any) => item.taskId === taskId), item = matches[0];
    if (matches.length !== 1 || !/^[a-f0-9]{40}$/.test(item.reviewedCommit ?? '') || !/^[a-f0-9]{40}$/.test(item.mergeCommit ?? '')
      || !(Object.hasOwn(SOURCE_MARKERS, taskId)
        ? item.reviewStatus === SOURCE_MARKERS[taskId] && (['integrated', 'offline-verified-awaiting-live', 'source-integrated', 'complete'].includes(item.integrationStatus)
          || taskId === 'COS-22' && item.integrationStatus === 'actual-validation-failed-author-handoff')
        : item.state === 'closed' || SOURCE_READY.includes(item.reviewStatus) && ['integrated', 'partial-offline-verified', 'offline-verified-awaiting-live', 'complete'].includes(item.integrationStatus))) throw new Error(`${taskId} requires independently reviewed and integrated source.`);
    approvals.push({ taskId, reviewedCommit: item.reviewedCommit, mergeCommit: item.mergeCommit });
  }
  for (const sha of new Set([...approvals.flatMap(item => [item.reviewedCommit, item.mergeCommit]), ...closureSources, ...previousCases.map(window => window.quote.identity.reviewedPlatformSha)])) {
    const result = await runChild('git', ['--no-optional-locks', 'merge-base', '--is-ancestor', sha, intent.reviewedPlatformSha], { cwd: repository, signal, timeoutMs: 5000 });
    if (result.code !== 0) throw new Error('Required reviewed source is not integrated in this exact platform SHA.');
  }
  const quote = await prepareValidationCase({ root: ledgerRoot, repositoryRoot: repository, declaration: VALIDATION_CASE, identityReader, signal });
  return { repository, ledgerRoot, caseRoot, intent, identityReader, quote, approvals, signal };
}

/** Reads actual Git, fixed inputs and the original snapshot. No owner, host preparation, expiry or write. */
export async function preflightValidationRun(options: { repository: string; args: string[]; signal?: AbortSignal }) {
  const value = await prepare(options);
  return { outcome: 'ready' as const, caseRoot: value.caseRoot, ledgerRoot: value.ledgerRoot, quote: value.quote, sourceApprovals: value.approvals, paidRequests: 0 };
}

export interface ValidationHostResult { outcome: 'passed' | 'failed'; gaps: string[]; tasks?: TaskContract[]; plan?: ArtifactReference; accepted?: ArtifactReference }
export interface ValidationHostInput { repository: string; ledgerRoot: string; root: string; controller: RunController; window: ValidationCaseWindow; work: OwnedWork; signal: AbortSignal }
export interface ValidationRunHost {
  /** Free and read-only: check installed dependencies/credentials; create no case output before claim. */
  prepare(input: { repository: string; quote: ValidationCaseQuote; signal: AbortSignal }): Promise<void>;
  execute(input: ValidationHostInput): Promise<ValidationHostResult>;
}

/** Trusted host assembly API only. The public CLI will bind its native host, never accept a replacement. */
export async function runValidationWithHost(options: { repository: string; args: string[]; host: ValidationRunHost; signal?: AbortSignal }) {
  const intent = parseValidationEntry(options.args);
  if (intent.preflightOnly) return preflightValidationRun(options);
  if (!options.host || typeof options.host.prepare !== 'function' || typeof options.host.execute !== 'function') throw new Error('A fixed native validation host is required before claiming a case.');
  const prepared = await prepare(options), { repository, ledgerRoot, caseRoot, quote, signal, identityReader } = prepared;
  await options.host.prepare({ repository, quote, signal }); signal.throwIfAborted();
  // Recheck the read-only baseline after potentially slow environment inspection.
  const current = await prepare(options);
  if (current.quote.quoteId !== quote.quoteId) throw new Error('Validation baseline changed during host preparation.');
  const decisionId = `operator-${randomUUID()}`, decision = { kind: 'operator_validation' as const, decisionId, actorId: 'coordinator', decidedAt: new Date().toISOString(),
    source: { artifactId: 'operator-validation-decision', version: decisionId, location: `${decisionId}.json` },
    sourceRefs: [{ artifactId: 'standing-validation-authorization', version: intent.reviewedPlatformSha, location: intent.operatorSource! }] };
  await publishReceipt(join(ledgerRoot, decision.source.location), { formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId,
    actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote });
  const window = await RunController.claimValidationCase({ root: ledgerRoot, repositoryRoot: repository, identityReader, quote, decision, signal });
  const controller = await RunController.openValidationCase({ root: ledgerRoot, repositoryRoot: repository, identityReader, caseId: window.caseId, windowId: window.windowId, signal });
  const work = new OwnedWork(controller.signal), stop = () => cancelAndDrain(controller, work, 'Validation case stopped by its coordinator.');
  const interrupt = () => { void stop().catch(() => {}); };
  const cutoff = setTimeout(interrupt, Math.max(1, Date.parse(window.deadlineAt) - Date.now() - 5000)); cutoff.unref();
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  try {
    let result: ValidationHostResult;
    try {
      result = await work.run(async ownedSignal => {
        await mkdir(dirname(caseRoot), { recursive: true }); await mkdir(caseRoot); await publishReceipt(join(caseRoot, 'origin.json'), { caseId: window.caseId, windowId: window.windowId, quote, decision,
          platformHead: intent.reviewedPlatformSha, sourceApprovals: prepared.approvals, purpose: 'Bounded development validation; not formal CLI or game benchmark acceptance.' });
        await publishReceipt(join(ledgerRoot, `${window.caseId}.json`), { caseId: window.caseId, windowId: window.windowId, root: caseRoot, quoteId: quote.quoteId });
        return options.host.execute({ repository, ledgerRoot, root: caseRoot, controller, window, work, signal: ownedSignal });
      });
    } catch { result = { outcome: 'failed', gaps: ['Validation startup or execution did not complete; preserve case evidence and reconcile any unknown charges.'] }; }
    const beforeFinish = await controller.read(), finishing = validationCaseView(beforeFinish).validationCase;
    const finishGaps: string[] = [];
    if (finishing.stopReason) finishGaps.push('The validation case was already stopped before completion.');
    if (Date.now() + 5000 >= Date.parse(window.deadlineAt)) finishGaps.push('The case deadline cannot cover completion and cleanup.');
    if (beforeFinish.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny > 0)) finishGaps.push('Unresolved or reserved fees prevent a successful validation result.');
    if (finishing.caseCommittedMicroCny > VALIDATION_CASE.limits.incrementalMicroCny || finishing.committedMicroCny > VALIDATION_CASE.limits.cumulativeMicroCny
      || finishing.committedMicroCny > VALIDATION_CASE.limits.lifetimeMicroCny) finishGaps.push('Validation fees exceeded an applicable case or shared limit.');
    if (result.outcome === 'passed') {
      const accepted = await new ArtifactRegistry(caseRoot, 'registry').current().catch(() => null);
      if (!result.accepted || !accepted || !sameValue(accepted.candidateRef, result.accepted)) finishGaps.push('No matching accepted candidate promotion is available.');
    }
    const beforeOwnStop = await controller.read(), closingCase = validationCaseView(beforeOwnStop).validationCase;
    if (Date.now() + 5000 >= Date.parse(window.deadlineAt)) finishGaps.push('The case lost its cleanup margin while reading promotion.');
    if (beforeOwnStop.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny > 0)) finishGaps.push('Fees became unresolved while reading promotion.');
    if (closingCase.caseCommittedMicroCny > VALIDATION_CASE.limits.incrementalMicroCny || closingCase.committedMicroCny > VALIDATION_CASE.limits.cumulativeMicroCny
      || closingCase.committedMicroCny > VALIDATION_CASE.limits.lifetimeMicroCny) finishGaps.push('Fees exceeded a validation limit while reading promotion.');
    // v3 stop aborts synchronously before queuing persistence. No await may separate this observation from our own call.
    const ownsFinishStop = !controller.signal.aborted && closingCase.stopReason === null;
    await cancelAndDrain(controller, work, 'This one-shot validation case finished; its identity remains consumed.');
    if (result.outcome === 'passed') {
      const accepted = await new ArtifactRegistry(caseRoot, 'registry').current().catch(() => null);
      if (!result.accepted || !accepted || !sameValue(accepted.candidateRef, result.accepted)) finishGaps.push('Accepted candidate promotion changed during completion.');
    }
    const state = await controller.read(), view = validationCaseView(state);
    const finishEvents = state.events.slice(beforeOwnStop.events.length).filter(event => event.type === 'validation_case_stopped');
    if (!ownsFinishStop || finishEvents.length !== 1 || view.validationCase.stopReason?.code !== 'manual'
      || Date.parse(view.validationCase.stopReason.at) > Date.parse(finishEvents[0].at) || view.validationCase.stopReason.reason !== finishEvents[0].reason) finishGaps.push('A separate case stop occurred before normal completion.');
    if (Date.now() >= Date.parse(window.deadlineAt)) finishGaps.push('Validation cleanup reached the case deadline.');
    if (state.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny > 0)) finishGaps.push('Validation cleanup left fees requiring reconciliation.');
    if (view.validationCase.caseCommittedMicroCny > VALIDATION_CASE.limits.incrementalMicroCny || view.validationCase.committedMicroCny > VALIDATION_CASE.limits.cumulativeMicroCny
      || view.validationCase.committedMicroCny > VALIDATION_CASE.limits.lifetimeMicroCny) finishGaps.push('Validation cleanup exceeded an applicable fee limit.');
    const report = { outcome: result.outcome === 'passed' && !result.gaps.length && !finishGaps.length ? 'passed' : 'failed', ...view.validationCase, platformHead: intent.reviewedPlatformSha,
      endedAt: new Date().toISOString(), original: view.original,
      gaps: [...result.gaps, ...finishGaps], ...(result.tasks ? { tasks: result.tasks } : {}), ...(result.plan ? { plan: result.plan } : {}), ...(result.accepted ? { accepted: result.accepted } : {}),
      claims: 'Bounded capability validation only. Historical failures and formal generation limits remain unchanged; user experience is not confirmed.' };
    if (!(await lstat(caseRoot).catch(() => null))) { await mkdir(dirname(caseRoot), { recursive: true }); await mkdir(caseRoot); }
    await publishReceipt(join(caseRoot, 'result.json'), report); return report;
  } finally {
    clearTimeout(cutoff); process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
    await work.cancelAndDrain('Validation host closing.'); await controller.close();
  }
}
