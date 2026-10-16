import { randomUUID } from 'node:crypto';
import { lstat, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { join, resolve } from 'node:path';
import { regularFile, safePath } from '../../src/artifacts/paths.ts';
import { sameValue } from '../../src/contracts/validation.ts';
import { validationBudgetGroup } from '../../src/contracts/budget.ts';
import { validateSnapshot } from '../../src/runtime/run-validation.ts';
import { prepareValidationCase, verifyOperatorDecision } from '../../src/runtime/validation-window.ts';
import { VALIDATION_ROLES, validationHash, validationInputHash } from '../../src/runtime/validation-validation.ts';
import { VALIDATION_CASE } from '../e2e/validation-declaration.ts';
import { runChild } from '../e2e/host.ts';
import { TRANSFER_VALIDATION_CASE_FIVE as D5 } from './validation-case-five-declaration.ts';
import { TRANSFER_VALIDATION_CASE_FIFTEEN as D, parseTransferValidationCaseFifteenEntry as parseEntry } from './validation-case-fifteen-declaration.ts';
import { transferCaseFourteenHistory, deriveTransferValidationCaseFourteenDeclaration } from './validation-case-fourteen-declaration.ts';
import { fixedTransferValidationInput } from './validation-input.ts';
import { captureTransferCaseFifteenSource, requireTransferCaseFifteenSource } from './validation-case-fifteen-source.ts';
import { requireTransferCaseSevenTemplate } from './validation-case-seven-source.ts';
import { verifyValidationBudgetSources } from '../../src/runtime/validation-budget.ts';
import { freeze } from '../../src/roles/requirements.ts';
import type { ArtifactReference } from '../../src/contracts/types.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import type { ValidationDeclaration, ValidationCaseQuote } from '../../src/runtime/validation-types.ts';
import type { ValidationBudgetGroupBinding } from '../../src/runtime/validation-types.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork, cancelAndDrain } from '../../src/runtime/recovery/owned-work.ts';
import { publishReceipt } from '../../src/runtime/recovery/receipt-file.ts';
import { validationCaseView } from '../../src/runtime/execution-window.ts';
import { ArtifactRegistry } from '../../src/artifacts/index.ts';
import type { HistoricalPassedStages } from '../../src/runtime/historical-passed-stages.ts';
import type { ValidationHostInput, ValidationHostResult } from '../e2e/validation-run.ts';

import type { HistoricalCaseSixSourcePins, TransferCaseSixRunHost } from './validation-case-six-entry.ts';
const SOURCE_MARKERS: Record<string, string> = {
  'COS-20': 'CASE_TWO_SOURCE_READY', 'COS-21': 'WINDOWS_PUBLICATION_SOURCE_READY', 'COS-22': 'VERSIONED_CASE_THREE_SOURCE_READY',
  'COS-23': 'AUTHOR_PROTOCOL_SOURCE_READY', 'COS-24': 'VALIDATION_ALLOCATION_CLOSURE_SOURCE_READY', 'COS-25': 'CASE_FOUR_SOURCE_READY',
  'COS-26': 'PLANNING_EFFECTIVE_CAPACITY_SOURCE_READY', 'COS-27': 'CASE_FIVE_SOURCE_READY', 'COS-28': 'HANDOFF_SCOPE_CLARIFICATION_SOURCE_READY',
  'COS-29': 'CASE_SIX_SOURCE_READY', 'COS-30': 'HOST_EVIDENCED_HANDOFF_SOURCE_READY', 'COS-31': 'CASE_SEVEN_SOURCE_READY',
  'COS-32': 'BROWSER_DEFECT_CLASSIFICATION_SOURCE_READY', 'COS-33': 'CASE_EIGHT_SOURCE_READY', 'COS-34': 'USER_EXPERIENCE_DECISION_SOURCE_READY',
  'COS-35': 'SHARED_VALIDATION_BROWSER_HOST_SOURCE_READY', 'COS-36': 'TRANSFER_DESIGN_BINDING_SOURCE_READY', 'COS-37': 'PERSISTENT_PROFILE_PROCESS_REOPEN_SOURCE_READY',
  'COS-38': 'TRANSFER_RUNTIME_INPUT_ADAPTER_SOURCE_READY', 'COS-39': 'PERSISTENT_FAILURE_FACTS_SOURCE_READY', 'COS-40': 'TRANSFER_PERSISTENT_MEDIA_CONSUMER_SOURCE_READY',
  'COS-41': 'TRANSFER_DESIGN_FEEDBACK_SOURCE_READY', 'COS-42': 'VALIDATION_COS16_GROUP_SOURCE_READY', 'COS-43': 'TRANSFER_NATIVE_ENTRY_SOURCE_READY',
  'COS-44': 'PLANNING_POLICY_SCHEMA_SOURCE_READY', 'COS-45': 'TRANSFER_CASE_TWO_SOURCE_READY', 'COS-46': 'DESIGN_OUTPUT_SELF_CHECK_SOURCE_READY',
  'COS-47': 'TRANSFER_CASE_THREE_SOURCE_READY', 'COS-48': 'PLANNING_HOST_IDENTITY_BINDING_SOURCE_READY', 'COS-49': 'TRANSFER_CASE_FOUR_SOURCE_READY',
  'COS-50': 'CAPTURE_LAYOUT_CONTRACT_SOURCE_READY', 'COS-51': 'TRANSFER_CASE_FIVE_SOURCE_READY', 'COS-52': 'PRODUCTION_TRANSFER_RUNTIME_SOURCE_READY',
  'COS-53': 'HUMAN_PREPARATION_DRAFT_SOURCE_READY', 'COS-54': 'ROLE_FILE_INVENTORY_SOURCE_READY', 'COS-55': 'CODING_BUILD_FEEDBACK_SOURCE_READY',
  'COS-56': 'HISTORICAL_PASSED_STAGES_SOURCE_READY',
  'COS-57': 'TRANSFER_CASE_SIX_SOURCE_READY',
  'COS-59': 'CODING_REQUEST_TIMEOUT_SOURCE_READY',
  'COS-60': 'TRANSFER_CASE_SEVEN_SOURCE_READY',
  'COS-64': 'BATCHED_MEDIA_SOURCE_READY',
  'COS-65': 'STANDALONE_DELIVERY_SOURCE_READY',
  'COS-66': 'GENERIC_PERSISTENT_SAVE_SOURCE_READY',
  'COS-68': 'COMPLETION_TIMING_SOURCE_READY',
  'COS-74': 'FROZEN_TEMPLATE_OBSERVER_ISOLATION_SOURCE_READY',
  'COS-75': 'VALIDATION_SCOPE_TIMEOUT_ORIGIN_SOURCE_READY',
  'COS-76': 'TRANSFER_CASE_EIGHT_SOURCE_READY',
  'COS-77': 'VALIDATION_CODING_OUTPUT_CAP_SOURCE_READY',
  'COS-78': 'TRANSFER_CASE_NINE_SOURCE_READY',
  'COS-79': 'VALIDATION_CODING_COMPACTION_SOURCE_READY',
  'COS-80': 'TRANSFER_CURRENT_PLAN_READING_SOURCE_READY',
  'COS-81': 'ADMISSION_FAILURE_FEEDBACK_SOURCE_READY',
  'COS-82': 'TRANSFER_CASE_TEN_SOURCE_READY',
  'COS-83': 'AUTHOR_TOOL_SCOPE_SOURCE_READY',
  'COS-84': 'TRANSFER_CASE_ELEVEN_SOURCE_READY',
  'COS-85': 'OPTIONAL_COMPACTION_TRUNCATION_SOURCE_READY',
  'COS-86': 'TRANSFER_CASE_TWELVE_SOURCE_READY',
  'COS-87': 'PARALLEL_GIT_IDENTITY_SOURCE_READY',
  'COS-88': 'TRANSFER_CASE_THIRTEEN_SOURCE_READY',
  'COS-89': 'AFFORDABLE_CODING_COMPACTION_SOURCE_READY',
  'COS-90': 'VALIDATION_GROUP_SUPPLEMENT_SOURCE_READY',
  'COS-91': 'TRANSFER_CASE_FOURTEEN_SOURCE_READY',
  'COS-92': 'PERSISTENT_BROWSER_LAUNCH_SOURCE_READY',
  'COS-94': 'GENERIC_BROWSER_SERVER_CLEANUP_SOURCE_READY',
  'COS-95': 'VALIDATION_SCOPE_AUTHORITY_READ_SOURCE_READY',
  'COS-96': 'KNOWN_SOURCE_FILE_CONCURRENCY_SOURCE_READY',
  'COS-97': 'NATIVE_VALIDATION_WAITS_SOURCE_READY',
  'COS-98': 'NATIVE_FIXED_CANDIDATE_READINESS_SOURCE_READY',
  'COS-99': 'NATIVE_FIXED_CANDIDATE_READINESS_SOURCE_READY',
  'COS-100': 'NATIVE_FIXED_CANDIDATE_READINESS_SOURCE_READY',
};
const SOURCE_READY = ['READY', 'SOURCE_READY', 'COMBINED_SOURCE_READY', 'PHASE_B_READY', 'READY_FOR_ROLE_IO_INTEGRATION'];
const PREREQUISITES = ['COS-02', 'COS-03', 'COS-06', 'COS-07', 'COS-08', 'COS-09', 'COS-11', 'COS-12', 'COS-13', 'COS-18', 'COS-19', ...Object.keys(SOURCE_MARKERS)];
const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));

/** Fixed C15 history only; the original group remains historical authority. */
export function transferCaseFifteenHistory(state: RunSnapshot) {
  return [...transferCaseFourteenHistory(state), deriveTransferValidationCaseFourteenDeclaration(state)];
}
export function transferCaseFifteenHistoricalAccountingHash(state: RunSnapshot, quote: ValidationCaseQuote) {
  const ids = new Set(quote.basis.requestIds);
  return validationHash(JSON.stringify({ cases: state.validation!.cases.slice(0, 22), delegations: state.ledger.allocationDelegations,
    supplements: state.ledger.allocationSupplements, supplementDecisions: state.allocationSupplementDecisions,
    closures: state.ledger.allocationClosures!.slice(0, 110), audits: state.allocationClosureDecisions!.slice(0, 20),
    entries: state.ledger.entries.filter(row => ids.has(row.requestId)), requests: state.requests.filter(row => ids.has(row.requestId)) }));
}
export async function requireTransferCaseFifteenAccountingSources(root: string, state: RunSnapshot, signal: AbortSignal) {
  await verifyValidationBudgetSources(root, state); signal.throwIfAborted();
  for (const receipt of state.allocationClosureDecisions!.slice(0, 20)) {
    const { sourceSha256, ...decision } = receipt.operatorDecision, bytes = await regularFile(root, decision.source.location, signal);
    signal.throwIfAborted();
    if (validationHash(bytes) !== sourceSha256 || !sameValue(decode(bytes), { formatVersion: 'operator-validation-allocation-closure-decision-1',
      kind: decision.kind, decisionId: decision.decisionId, actorId: decision.actorId, decidedAt: decision.decidedAt,
      sourceRefs: decision.sourceRefs, quote: receipt.quote })) throw new Error('C15 historical closure source bytes changed.');
  }
}
export function createTransferCaseFifteenAdmissionQuote(quote: ValidationCaseQuote, manifestRef: ArtifactReference,
  sourceApprovals: { taskId: string; reviewedCommit: string; mergeCommit: string }[], execution?: Awaited<ReturnType<typeof captureTransferCaseFifteenSource>>, accountingSha256?: string) {
  const value = { formatVersion: 'transfer-case-fifteen-admission/1', allocationSource: 'shared-unallocated', quote,
    snapshotRevision: quote.basis.revision, snapshotSha256: quote.basis.snapshotSha256, roleGrants: quote.declaration.grants,
    manifestRef, sourceApprovals, ...(execution ? { execution } : {}), ...(accountingSha256 ? { accountingSha256 } : {}) };
  return freeze({ ...structuredClone(value), admissionId: validationHash(JSON.stringify(value)) });
}
/** Independent fixed nongrouped lifecycle; no declaration, budget or historical selector is public. */
export function createFixedTransferValidationCaseFifteenEntry(sourcePins: HistoricalCaseSixSourcePins) {
const pins = freeze(structuredClone(sourcePins)), historyCount = 22, manifestLocation = 'cos20-transfer-validation-15-reuse.json';
const markers = SOURCE_MARKERS, prerequisites = PREREQUISITES;

async function absent(repository: string, path: string, label: string) {
  try { await lstat(await safePath(repository, path)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  throw new Error(`${label} exists or remains unresolved; a consumed identity cannot restart.`);
}
/** Fixed caller reads only the manifest path it owns; the actual digest is covered by the new operator receipt. */
async function historicalSource(repository: string, targetRoot: string, source: any, signal: AbortSignal) {
  signal.throwIfAborted();
  const ledgerRoot = join(repository, '.cosmos/validation-shared'), bytes = await regularFile(ledgerRoot, manifestLocation, signal); signal.throwIfAborted();
  const manifestRef = {
    artifactId: `${D.caseId}-historical-stages`, version: validationHash(bytes), location: manifestLocation };
  const { createHistoricalPassedStages } = await import('../../src/runtime/historical-passed-stages.ts');
  signal.throwIfAborted();
  const historical = createHistoricalPassedStages({ originalRoot: join(repository, '.cosmos/e2e', D5.caseId), targetRoot,
    expected: { caseId: D5.caseId, windowId: source.windowId, ...source.quote.identity, designTaskId: D5.grants.design.taskId, artTaskId: D5.grants.art.taskId }, manifestRef,
    readManifest: async readSignal => { readSignal.throwIfAborted(); const bytes = await regularFile(ledgerRoot, manifestLocation, readSignal); readSignal.throwIfAborted(); return bytes; } });
  await historical.verify(signal); signal.throwIfAborted(); return historical;
}
async function prepare(options: { repository: string; args: string[]; signal?: AbortSignal }, resume = false) {
  const repository = resolve(options.repository), intent = parseEntry(options.args), signal = options.signal ?? new AbortController().signal;
  signal.throwIfAborted(); await safePath(repository);
  const ledgerRoot = join(repository, '.cosmos/validation-shared'), caseRoot = join(repository, '.cosmos/e2e', D.caseId);
  if (!resume) { await absent(repository, `.cosmos/e2e/${D.caseId}`, 'Case15 root'); await absent(repository, `.cosmos/validation-shared/${D.caseId}.json`, 'Case15 marker'); }
  for (const path of ['.controller.lock', '.controller.lock.recovery', 'registry/.commit.lock', 'registry/.commit.lock.recovery']) await absent(repository, `.cosmos/validation-shared/${path}`, 'Original writer ownership');
  const bytes = await regularFile(ledgerRoot, 'snapshot.json'), state = decode(bytes); validateSnapshot(state);
  const declarations = transferCaseFifteenHistory(state);
  const execution = await captureTransferCaseFifteenSource(signal);
  if (state.formatVersion !== 3 || state.ledger.contractVersion !== '5.0.0' || state.run.runId !== 'validation-2026-10-01'
    || state.ledger.ledgerId !== 'cosmos-validation' || state.run.specVersion !== '1.0' || state.run.originalStartedAt !== '2026-10-01T06:16:16.857Z'
    || state.run.originalDeadlineAt !== '2026-10-01T18:16:16.857Z' || !state.stopReason
    || !state.ledger.entries.some(entry => entry.requestId === 'prior-deepseek-direct-probes' && entry.status === 'settled' && entry.settledMicroCny >= 721_771)) {
    throw new Error('The required audited ledger, snapshot3, run, clock and historical charges are required.');
  }
  const histories = [...Array.from({ length: 8 }, (_, i) => state.validation?.cases.find(window => window.caseId === `cos20-native-validation-${i + 1}`)),
    ...declarations.map(d => state.validation?.cases.find(window => window.caseId === d.caseId))];
  if (state.validation?.cases.length !== (historyCount + (resume ? 1 : 0)) || state.validation.currentCaseId !== (resume ? D.caseId : declarations.at(-1)!.caseId) || histories.some(window => !window?.stopReason)
    || histories[12]!.stopReason!.code !== 'manual') throw new Error('All thirteen original cases must be consumed and explicitly stopped, with current C5 stopped manually.');
  const first = histories[8]!, source = histories[12]!;
  if (source.quote.identity.reviewedPlatformSha !== pins.reviewedPlatformSha || source.windowId !== pins.windowId
    || source.quote.identity.frozenCaseInputHash !== validationInputHash(D5)
    || !sameValue(first.quote.budgetGroup?.parentAllocation, pins.parentAllocation)
    || first.operatorDecision.decisionId !== pins.authorizationDecisionId
    || state.ledger.allocationDelegations?.[0].authorizationDecisionId !== pins.authorizationDecisionId) {
    throw new Error('The fixed original C5 source/window and first COS16 parent source/authorization changed.');
  }
  const group = validationBudgetGroup(state.ledger), members = declarations.map(d => d.caseId);
  if (!group || state.ledger.allocationDelegations?.length !== 14 || state.ledger.allocationSupplements?.length !== 1
    || state.allocationSupplementDecisions?.length !== 1 || !sameValue(state.ledger.allocationDelegations.map(item => item.caseId), members))
    throw new Error('C15 requires fourteen original delegations and the one original supplement.');
  for (let i = 0; i < declarations.length; i++) {
    if (!sameValue(histories[8 + i]!.quote.declaration, declarations[i]) || histories[8 + i]!.quote.formatVersion !== (i === 13 ? 'validation-case-quote-3' : 'validation-case-quote-2'))
      throw new Error('C15 historical declarations and original quote formats changed.');
  }
  const oldRequests = state.requests.filter(item => item.validation?.caseId !== D.caseId);
  const oldRows = state.ledger.entries.filter(item => !VALIDATION_ROLES.some(role => D.grants[role].taskId === item.taskId));
  if (oldRequests.length !== 715 || oldRows.reduce((sum, row) => sum + row.settledMicroCny, 0) !== 16_901_000
    || group.committedMicroCny !== 9_892_377 || group.allocatedMicroCny !== 9_892_377 || group.limitMicroCny !== 11_600_314)
    throw new Error('C15 exact 715-request settled accounting baseline changed; a new quote review is required.');
  if (state.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny || !['settled', 'cancelled'].includes(entry.status))) throw new Error('Historical unknown or reserved charges require reconciliation.');
  const requests = state.requests.filter(item => item.validation?.caseId === D5.caseId), admitted = requests.filter(item => item.admittedAt !== null);
  const cancelled = requests.filter(item => item.admittedAt === null);
  if (requests.length !== 66 || admitted.length !== 65 || cancelled.length !== 1
    || admitted.some(item => state.ledger.entries.find(entry => entry.requestId === item.requestId)?.status !== 'settled')
    || cancelled.some(item => { const entry = state.ledger.entries.find(entry => entry.requestId === item.requestId); return entry?.status !== 'cancelled' || entry.settledMicroCny !== 0; })) {
    throw new Error('C5 requires 65 admitted settled requests and one zero-fee pre-admission cancellation.');
  }
  const oldIds = histories.flatMap(window => VALIDATION_ROLES.map(role => window!.quote.declaration.grants[role].taskId));
  if (state.ledger.allocationClosures?.length !== historyCount * 5 || state.allocationClosureDecisions?.length !== 20
    || oldIds.some(taskId => !state.ledger.allocationClosures!.some(item => item.taskId === taskId))) throw new Error('The original 65 closed grants and eleven allocation audits are required.');
  const roots = new Map<string, string>(), historicalSources: string[] = [];
  for (const window of histories) {
    if (!sameValue(window!.quote.declaration.inputs, members.includes(window!.caseId) ? D5.inputs : VALIDATION_CASE.inputs)) throw new Error('Historical fixed declaration inputs changed.');
    const path = `.cosmos/e2e/${window!.caseId}`, root = await safePath(repository, path);
    if (!(await lstat(root)).isDirectory()) throw new Error('Historical case root is missing.');
    for (const lock of ['.controller.lock', '.controller.lock.recovery', 'registry/.commit.lock', 'registry/.commit.lock.recovery']) await absent(repository, `${path}/${lock}`, 'Historical writer ownership');
    roots.set(window!.caseId, root);
    const { sourceSha256, ...decision } = window!.operatorDecision;
    if ((await verifyOperatorDecision(ledgerRoot, window!.quote, decision, Date.now())).sourceSha256 !== sourceSha256) throw new Error('Historical operator source bytes changed.');
    historicalSources.push(window!.quote.identity.reviewedPlatformSha);
  }
  for (const receipt of state.allocationClosureDecisions!) {
    const { sourceSha256, ...decision } = receipt.operatorDecision, source = await regularFile(ledgerRoot, decision.source.location);
    const window = histories.find(item => item!.caseId === receipt.quote.basis.currentCaseId);
    if (!window || receipt.quote.identity.frozenCaseInputHash !== validationInputHash(window.quote.declaration)
      || validationHash(source) !== sourceSha256 || !sameValue(decode(source), { formatVersion: 'operator-validation-allocation-closure-decision-1', kind: decision.kind,
        decisionId: decision.decisionId, actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote: receipt.quote })
      || receipt.quote.cases.some(item => item.artifactRoot !== roots.get(item.caseId))) throw new Error('Historical allocation closure source, input or fixed root changed.');
    historicalSources.push(receipt.quote.identity.reviewedPlatformSha);
  }
  const readIdentity = fixedTransferValidationInput(D).createTransferValidationIdentityReader({ repository, reviewedPlatformSha: intent.reviewedPlatformSha });
  const identityReader = async (readSignal: AbortSignal) => {
    await requireTransferCaseFifteenSource(execution, readSignal);
    await requireTransferCaseSevenTemplate(execution, repository, readSignal);
    await requireTransferCaseFifteenAccountingSources(ledgerRoot, state, readSignal);
    return readIdentity(readSignal);
  };
  await identityReader(signal);
  const pushed = await runChild('git', ['--no-optional-locks', 'rev-parse', 'refs/remotes/origin/main'], { cwd: repository, signal, timeoutMs: 5000 });
  if (pushed.code !== 0 || pushed.stdout.trim() !== intent.reviewedPlatformSha) throw new Error('Case15 requires the exact pushed main SHA.');
  const mapping = decode(await regularFile(repository, 'docs/specs/github-issues.json')), approvals: { taskId: string; reviewedCommit: string; mergeCommit: string }[] = [];
  for (const taskId of prerequisites) {
    const matches = (mapping.tasks ?? []).filter((item: any) => item.taskId === taskId), item = matches[0];
    if (matches.length !== 1 || !/^[a-f0-9]{40}$/.test(item.reviewedCommit ?? '') || !/^[a-f0-9]{40}$/.test(item.mergeCommit ?? '')
      || !(Object.hasOwn(markers, taskId) ? item.reviewStatus === markers[taskId]
        && (['integrated', 'offline-verified-awaiting-live', 'source-integrated', 'complete'].includes(item.integrationStatus)
          || taskId === 'COS-22' && item.integrationStatus === 'actual-validation-failed-author-handoff')
        : item.state === 'closed' || SOURCE_READY.includes(item.reviewStatus) && ['integrated', 'partial-offline-verified', 'offline-verified-awaiting-live', 'complete'].includes(item.integrationStatus))) {
      throw new Error(`${taskId} requires unique independently reviewed and integrated source.`);
    }
    approvals.push({ taskId, reviewedCommit: item.reviewedCommit, mergeCommit: item.mergeCommit });
  }
  for (const sha of new Set([...historicalSources, ...approvals.flatMap(item => [item.reviewedCommit, item.mergeCommit])])) {
    const result = await runChild('git', ['--no-optional-locks', 'merge-base', '--is-ancestor', sha, intent.reviewedPlatformSha], { cwd: repository, signal, timeoutMs: 5000 });
    if (result.code !== 0) throw new Error('Required historical or reviewed source is not an ancestor of this exact main SHA.');
  }
  const historical = await historicalSource(repository, caseRoot, histories[12]!, signal);
  const window = resume ? state.validation!.cases[historyCount] : undefined;
  if (window && (window.caseId !== D.caseId || window.stopReason || Date.now() >= Date.parse(window.deadlineAt) - 5000
    || !sameValue(window.quote.declaration, D) || window.quote.identity.reviewedPlatformSha !== intent.reviewedPlatformSha
    || window.quote.identity.frozenCaseInputHash !== validationInputHash(D) || window.quote.formatVersion !== 'validation-case-quote-1' || window.quote.budgetGroup !== undefined)) throw new Error('Cold resume requires the same active fixed C15 window and original source authority.');
  const quote = window?.quote ?? await prepareValidationCase({ root: ledgerRoot, repositoryRoot: repository, declaration: D, identityReader, signal });
  const admissionValue = createTransferCaseFifteenAdmissionQuote(quote, historical.manifestRef, approvals, execution, transferCaseFifteenHistoricalAccountingHash(state, quote));
  const admission = admissionValue ? { value: admissionValue, ref: { artifactId: `${D.caseId}-admission`, version: validationHash(JSON.stringify(admissionValue, null, 2) + '\n'), location: `${D.caseId}-admission-${admissionValue.admissionId}.json` } } : undefined;
  async function verifyAdmission(readSignal: AbortSignal) {
    if (!admission) return; readSignal.throwIfAborted();
    const actual = await regularFile(ledgerRoot, admission.ref.location, readSignal); readSignal.throwIfAborted();
    if (validationHash(actual) !== admission.ref.version || !sameValue(decode(actual), admission.value)) throw new Error('Current admission envelope bytes changed.');
  }
  if (window) {
    await verifyAdmission(signal);
    if (admission && !window.operatorDecision.sourceRefs.some(ref => sameValue(ref, admission.ref))) throw new Error('Cold resume admission quote is not operator-covered.');
    const { sourceSha256, ...decision } = window.operatorDecision;
    if ((await verifyOperatorDecision(ledgerRoot, quote, decision, Date.now())).sourceSha256 !== sourceSha256
      || !window.operatorDecision.sourceRefs.some(ref => sameValue(ref, historical.manifestRef))) throw new Error('Cold resume operator source or manifest changed.');
    const origin = decode(await regularFile(caseRoot, 'origin.json')), marker = decode(await regularFile(ledgerRoot, `${D.caseId}.json`));
    if (!sameValue(origin, { caseId: D.caseId, windowId: window.windowId, quote, decision, platformHead: intent.reviewedPlatformSha,
      sourceApprovals: approvals, inheritedSource: historical.manifestRef, ...(admission ? { inheritedAdmission: admission.ref } : {}), purpose: 'Internal COS16 coding-only operator experiment; human acceptance remains pending.' })
      || !sameValue(marker, { caseId: D.caseId, windowId: window.windowId, root: caseRoot, quoteId: quote.quoteId })) throw new Error('Cold resume original C15 origin/marker changed.');
    await regularFile(caseRoot, 'execution-reused.json');
    for (const lock of ['.controller.lock', '.controller.lock.recovery', 'registry/.commit.lock', 'registry/.commit.lock.recovery']) await absent(repository, `.cosmos/e2e/${D.caseId}/${lock}`, 'Current writer ownership');
  }
  if (!bytes.equals(await regularFile(ledgerRoot, 'snapshot.json'))) throw new Error('Case15 baseline changed while checking sources.');
  await historical.verify(signal);
  return { repository, ledgerRoot, caseRoot, intent, signal, identityReader, quote, approvals, historical, window, admission, verifyAdmission };
}
/** No owner, host preparation, clock activation, request or write. */
async function preflightTransferValidationCaseFifteenRun(options: { repository: string; args: string[]; signal?: AbortSignal }) {
  const value = await prepare(options);
  return { outcome: 'ready' as const, caseRoot: value.caseRoot, ledgerRoot: value.ledgerRoot, quote: value.quote, sourceApprovals: value.approvals,
    inheritedSource: value.historical.manifestRef, ...(value.admission ? { admissionQuote: value.admission.value, admissionRef: value.admission.ref } : {}), paidRequests: 0 };
}
/** Trusted source assembly seam; startup owns one current case but never dispatches an SDK role. */
async function startTransferValidationCaseFifteen(options: { repository: string; args: string[]; host: TransferCaseSixRunHost; signal?: AbortSignal }, resume = false) {
  if (parseEntry(options.args).preflightOnly) throw new Error('C15 startup requires an explicit case intent.');
  let value = await prepare(options, resume);
  if (!resume) {
    await options.host.prepare({ repository: value.repository, quote: value.quote, signal: value.signal });
    const current = await prepare(options);
    if (current.quote.quoteId !== value.quote.quoteId || !sameValue(current.historical.manifestRef, value.historical.manifestRef) || !sameValue(current.admission, value.admission)) throw new Error('C15 baseline or manifest changed during host preparation.');
    value = current;
  }
  const { repository, ledgerRoot, caseRoot, historical, identityReader, quote, signal, intent } = value;
  const scopeIdentity = async (readSignal: AbortSignal) => {
    readSignal.throwIfAborted(); const identity = await identityReader(readSignal); readSignal.throwIfAborted();
    await historical.verify(readSignal); readSignal.throwIfAborted();
    await value.verifyAdmission(readSignal); readSignal.throwIfAborted();
    if (window) {
      const { sourceSha256, ...decision } = window.operatorDecision;
      if ((await verifyOperatorDecision(ledgerRoot, quote, decision, Date.now())).sourceSha256 !== sourceSha256) throw new Error('Current C15 operator source bytes changed.');
    }
    readSignal.throwIfAborted(); return identity;
  };
  let window = value.window;
  if (!window) {
    if (value.admission) { await publishReceipt(join(ledgerRoot, value.admission.ref.location), value.admission.value, signal); await value.verifyAdmission(signal); }
    const decisionId = `operator-${randomUUID()}`, decision = { kind: 'operator_validation' as const, decisionId, actorId: 'coordinator', decidedAt: new Date().toISOString(),
      source: { artifactId: 'operator-validation-decision', version: decisionId, location: `${decisionId}.json` },
      sourceRefs: [{ artifactId: 'standing-validation-authorization', version: intent.reviewedPlatformSha, location: intent.operatorSource! }, historical.manifestRef, ...(value.admission ? [value.admission.ref] : [])] };
    await publishReceipt(join(ledgerRoot, decision.source.location), { formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId,
      actorId: decision.actorId, decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote }, signal);
    window = await RunController.claimValidationCase({ root: ledgerRoot, repositoryRoot: repository, identityReader: scopeIdentity, quote, decision, signal });
  }
  const controller = await RunController.openValidationCase({ root: ledgerRoot, repositoryRoot: repository, identityReader: scopeIdentity, caseId: D.caseId, windowId: window.windowId, signal });
  const work = new OwnedWork(controller.signal);
  try {
    await historical.verify(signal);
    if (!resume) {
      await mkdir(dirname(caseRoot), { recursive: true }); await mkdir(caseRoot);
      const { sourceSha256: _digest, ...decision } = window.operatorDecision;
      await publishReceipt(join(caseRoot, 'origin.json'), { caseId: D.caseId, windowId: window.windowId, quote, decision, platformHead: intent.reviewedPlatformSha,
        sourceApprovals: value.approvals, inheritedSource: historical.manifestRef, ...(value.admission ? { inheritedAdmission: value.admission.ref } : {}), purpose: 'Internal COS16 coding-only operator experiment; human acceptance remains pending.' }, signal);
      await publishReceipt(join(ledgerRoot, `${D.caseId}.json`), { caseId: D.caseId, windowId: window.windowId, root: caseRoot, quoteId: quote.quoteId }, signal);
    }
    return { input: { repository, ledgerRoot, root: caseRoot, controller, window, work, signal: work.signal } satisfies ValidationHostInput, value, historical, resume };
  } catch (error) { await cancelAndDrain(controller, work, 'C15 startup did not complete.').catch(() => {}); await controller.close(); throw error; }
}
/** One fixed current window, including cold recovery; historical stages stay source evidence. */
async function runTransferValidationCaseFifteenWithHost(options: { repository: string; args: string[]; host: TransferCaseSixRunHost; signal?: AbortSignal }) {
  const intent = parseEntry(options.args);
  if (intent.preflightOnly) return preflightTransferValidationCaseFifteenRun(options);
  if (!options.host || typeof options.host.prepare !== 'function' || typeof options.host.execute !== 'function') throw new Error('Fixed C15 native host is required.');
  const state = decode(await regularFile(join(resolve(options.repository), '.cosmos/validation-shared'), 'snapshot.json'));
  const resume = state.validation?.cases.some((window: any) => window.caseId === D.caseId) ?? false;
  const started = await startTransferValidationCaseFifteen(options, resume), { input, historical, value } = started;
  const { controller, work, window } = input, interrupt = () => { void cancelAndDrain(controller, work, 'C15 interrupted by its coordinator.').catch(() => {}); };
  const cutoff = setTimeout(interrupt, Math.max(1, Date.parse(window.deadlineAt) - Date.now() - 5000)); cutoff.unref();
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  try {
    let result: ValidationHostResult;
    try { result = await work.run(signal => options.host.execute({ ...input, signal }, historical, resume)); }
    catch { result = { outcome: 'failed', gaps: ['C15 execution did not complete; preserve evidence and reconcile charges.'] }; }
    const gaps = [...result.gaps], before = await controller.read();
    if (before.validation!.cases[historyCount].stopReason || Date.now() >= Date.parse(window.deadlineAt) - 5000) gaps.push('C15 stopped or cannot cover completion and cleanup.');
    if (before.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny)) gaps.push('Unresolved or reserved fees prevent completion.');
    const currentRequests = before.requests.filter(request => request.validation?.caseId === D.caseId);
    if (currentRequests.some(request => ![D.grants.coding.taskId, D.grants.repair.taskId].includes(before.ledger.entries.find(entry => entry.requestId === request.requestId)!.taskId))) gaps.push('A non-coding SDK request violated the current C15 scope.');
    try { await historical.verify(input.signal); } catch { gaps.push('Historical source changed before completion.'); }
    const accepted = result.outcome === 'passed' ? await new ArtifactRegistry(input.root, 'registry').current().catch(() => null) : null;
    if (result.outcome === 'passed' && (!accepted || !result.accepted || !sameValue(accepted.candidateRef, result.accepted))) gaps.push('Exact current accepted promotion is unavailable.');
    const ownsStop = !controller.signal.aborted && !before.validation!.cases[historyCount].stopReason;
    await cancelAndDrain(controller, work, 'This one-shot coding-only validation finished; its identity remains consumed.');
    const after = await controller.read(), view = validationCaseView(after), group = validationBudgetGroup(after.ledger);
    if (!ownsStop || after.events.slice(before.events.length).filter(event => event.type === 'validation_case_stopped').length !== 1 || view.validationCase.stopReason?.code !== 'manual') gaps.push('A separate stop preceded normal completion.');
    if (Date.now() >= Date.parse(window.deadlineAt) || after.ledger.entries.some(entry => entry.unknown || entry.reservedMicroCny)) gaps.push('Cleanup exceeded the deadline or left unresolved fees.');
    if (!group || group.committedMicroCny > group.limitMicroCny || view.validationCase.caseCommittedMicroCny > D.limits.incrementalMicroCny
      || view.validationCase.committedMicroCny > D.limits.cumulativeMicroCny || view.validationCase.committedMicroCny > D.limits.lifetimeMicroCny) gaps.push('Applicable fee limits were exceeded.');
    if (result.outcome === 'passed' && !sameValue((await new ArtifactRegistry(input.root, 'registry').current().catch(() => null))?.candidateRef, result.accepted)) gaps.push('Accepted promotion changed during cleanup.');
    const report = { outcome: result.outcome === 'passed' && !gaps.length ? 'passed' : 'failed', ...view.validationCase, platformHead: intent.reviewedPlatformSha,
      endedAt: new Date().toISOString(), elapsedMs: Date.now() - Date.parse(window.startedAt), original: view.original, sourceApprovals: value.approvals,
      inheritedSource: historical.manifestRef, inheritedTaskIds: [D5.grants.design.taskId, D5.grants.art.taskId], currentSdkRoles: ['coding'],
      allocationSource: 'shared-unallocated', budgetGroup: { historical: group }, cleanupEndedAt: new Date().toISOString(), gaps: [...new Set(gaps)],
      taskHistory: after.tasks.filter(task => [D.grants.coding.taskId, D.grants.repair.taskId].includes(task.taskId)), repair: after.validation!.cases[historyCount].repair,
      ...(result.tasks ? { tasks: result.tasks } : {}), ...(result.plan ? { plan: result.plan } : {}), ...(result.accepted ? { accepted: result.accepted } : {}), userExperience: 'not_confirmed' };
    await publishReceipt(join(input.root, 'result.json'), report); return report;
  } finally { clearTimeout(cutoff); process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); await work.cancelAndDrain('C15 host closing.'); await controller.close(); }
}
function createNativeTransferValidationCaseFifteenHost(): TransferCaseSixRunHost {
  return { prepare: async input => (await import('../e2e/validation-host.ts')).createNativeValidationHost().prepare(input),
    execute: async (input, historical, resume) => (await import('./validation-case-fifteen-driver.ts')).generateTransferValidationCaseFifteen(input, historical, resume) };
}
async function runTransferValidationCaseFifteenEntry(args: string[], repository: string) {
  const intent = parseEntry(args);
  return intent.preflightOnly ? preflightTransferValidationCaseFifteenRun({ repository, args }) : runTransferValidationCaseFifteenWithHost({ repository, args, host: createNativeTransferValidationCaseFifteenHost() });
}
return { preflightTransferValidationCaseFifteenRun, startTransferValidationCaseFifteen, runTransferValidationCaseFifteenWithHost, createNativeTransferValidationCaseFifteenHost, runTransferValidationCaseFifteenEntry };
}
