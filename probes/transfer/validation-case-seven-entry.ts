import { join, resolve } from 'node:path';
import { regularFile } from '../../src/artifacts/paths.ts';
import { freeze } from '../../src/roles/requirements.ts';
import { validationHash } from '../../src/runtime/validation-validation.ts';
import type { ArtifactReference } from '../../src/contracts/types.ts';
import type { ValidationCaseQuote } from '../../src/runtime/validation-types.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import { sameValue } from '../../src/contracts/validation.ts';
import { createFixedTransferCodingOnlyEntry } from './validation-case-six-entry.ts';
import type { HistoricalCaseSixSourcePins, TransferCaseSixRunHost, FixedCodingOnlyEntryConfiguration } from './validation-case-six-entry.ts';
import { deriveTransferValidationCaseSevenDeclaration, parseTransferValidationCaseSevenEntry, TRANSFER_CASE_SEVEN_HISTORY } from './validation-case-seven-declaration.ts';
import { fixedTransferValidationInput } from './validation-input.ts';
import { captureTransferCaseSevenSource, requireTransferCaseSevenSource, requireTransferCaseSevenTemplate } from './validation-case-seven-source.ts';

/** The old accounting prefix is fixed while the new case adds its own requests and fees. */
export function transferCaseSevenHistoricalAccountingHash(state: RunSnapshot, quote: ValidationCaseQuote) {
  return fixedTransferHistoricalAccountingHash(state, quote, 14, 12);
}
export function fixedTransferHistoricalAccountingHash(state: RunSnapshot, quote: ValidationCaseQuote, cases: 14 | 15, audits: 12 | 13) {
  const ids = new Set(quote.basis.requestIds);
  return validationHash(JSON.stringify({ cases: state.validation!.cases.slice(0, cases), delegations: state.ledger.allocationDelegations!.slice(0, cases - 8),
    closures: state.ledger.allocationClosures!.slice(0, cases * 5), audits: state.allocationClosureDecisions?.slice(0, audits),
    entries: state.ledger.entries.filter(e => ids.has(e.requestId)), requests: state.requests.filter(r => ids.has(r.requestId)) }));
}
export async function requireTransferCaseSevenAccountingSources(root: string, state: RunSnapshot, signal: AbortSignal) {
  return requireFixedTransferAccountingSources(root, state, signal, 12);
}
export async function requireFixedTransferAccountingSources(root: string, state: RunSnapshot, signal: AbortSignal, audits: 12 | 13) {
  for (const receipt of state.allocationClosureDecisions!.slice(0, audits)) {
    signal.throwIfAborted(); const { sourceSha256, ...decision } = receipt.operatorDecision, bytes = await regularFile(root, decision.source.location);
    if (validationHash(bytes) !== sourceSha256 || !sameValue(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), {
      formatVersion: 'operator-validation-allocation-closure-decision-1', kind: decision.kind, decisionId: decision.decisionId, actorId: decision.actorId,
      decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote: receipt.quote })) throw new Error('C7 actual historical closure source bytes changed.');
  }
}

/** C7-owned combined quote; base quote2 and ledger schemas remain unchanged. */
export function createTransferCaseSevenAdmissionQuote(quote: ValidationCaseQuote, manifestRef: ArtifactReference,
  sourceApprovals: { taskId: string; reviewedCommit: string; mergeCommit: string }[], execution?: Awaited<ReturnType<typeof captureTransferCaseSevenSource>>, accountingSha256?: string) {
  return createFixedTransferAdmissionQuote('transfer-case-seven-admission/1', quote, manifestRef, sourceApprovals, execution, accountingSha256);
}
export function createFixedTransferAdmissionQuote(formatVersion: 'transfer-case-seven-admission/1' | 'transfer-case-eight-admission/1', quote: ValidationCaseQuote, manifestRef: ArtifactReference,
  sourceApprovals: { taskId: string; reviewedCommit: string; mergeCommit: string }[], execution?: Awaited<ReturnType<typeof captureTransferCaseSevenSource>>, accountingSha256?: string) {
  const value = { formatVersion, quote, snapshotRevision: quote.basis.revision,
    snapshotSha256: quote.basis.snapshotSha256, roleGrants: quote.declaration.grants, manifestRef, sourceApprovals, ...(execution ? { execution } : {}), ...(accountingSha256 ? { accountingSha256 } : {}) };
  return freeze({ ...structuredClone(value), admissionId: validationHash(JSON.stringify(value)) });
}
/** Each invocation binds its actual audited declaration; no CLI/model may supply one. */
export function createFixedTransferValidationCaseSevenEntry(sourcePins: HistoricalCaseSixSourcePins) {
  return createFixedSettledCodingEntry(sourcePins, {
    parseEntry: parseTransferValidationCaseSevenEntry, deriveDeclaration: deriveTransferValidationCaseSevenDeclaration,
    history: () => TRANSFER_CASE_SEVEN_HISTORY, manifestLocation: 'cos20-transfer-validation-7-reuse.json',
    captureSource: captureTransferCaseSevenSource, requireSource: requireTransferCaseSevenSource, requireAccounting: requireTransferCaseSevenAccountingSources,
    admissionQuote: createTransferCaseSevenAdmissionQuote, accountingHash: transferCaseSevenHistoricalAccountingHash,
    generate: async (...args) => (await import('./validation-case-seven-driver.ts')).generateTransferValidationCaseSeven(...args),
  });
}
interface FixedSettledCodingConfiguration {
  parseEntry: typeof parseTransferValidationCaseSevenEntry; deriveDeclaration: typeof deriveTransferValidationCaseSevenDeclaration;
  history(state: RunSnapshot): FixedCodingOnlyEntryConfiguration['declarations']; manifestLocation: FixedCodingOnlyEntryConfiguration['manifestLocation'];
  closureAuditCount?: 13; sourceMarkers?: Readonly<Record<string, string>>;
  captureSource: typeof captureTransferCaseSevenSource; requireSource: typeof requireTransferCaseSevenSource;
  requireAccounting: typeof requireTransferCaseSevenAccountingSources; admissionQuote: typeof createTransferCaseSevenAdmissionQuote;
  accountingHash: typeof transferCaseSevenHistoricalAccountingHash; generate: FixedCodingOnlyEntryConfiguration['generate'];
}
/** Trusted fixed wrapper bindings; defaults remain owned by the original C7 entry. */
export function createFixedSettledCodingEntry(sourcePins: HistoricalCaseSixSourcePins, configuration: FixedSettledCodingConfiguration) {
  async function entry(options: { repository: string; args: string[]; signal?: AbortSignal }) {
    configuration.parseEntry(options.args); options.signal?.throwIfAborted();
    const bytes = await regularFile(join(resolve(options.repository), '.cosmos/validation-shared'), 'snapshot.json');
    const state = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const declaration = configuration.deriveDeclaration(state), input = fixedTransferValidationInput(declaration), execution = await configuration.captureSource(options.signal);
    return createFixedTransferCodingOnlyEntry(sourcePins, { declaration, declarations: configuration.history(state),
      manifestLocation: configuration.manifestLocation, parseEntry: configuration.parseEntry, closureAuditCount: configuration.closureAuditCount, sourceMarkers: configuration.sourceMarkers,
      deriveDeclaration: configuration.deriveDeclaration, createIdentityReader: identityOptions => {
        const read = input.createTransferValidationIdentityReader(identityOptions);
        return async signal => { await configuration.requireSource(execution, signal); await requireTransferCaseSevenTemplate(execution, options.repository, signal); await configuration.requireAccounting(join(resolve(options.repository), '.cosmos/validation-shared'), state, signal); return read(signal); };
      },
      admissionQuote: (quote, manifest, approvals) => configuration.admissionQuote(quote, manifest, approvals, execution, configuration.accountingHash(state, quote)),
      generate: configuration.generate });
  }
  async function preflightTransferValidationCaseSevenRun(options: { repository: string; args: string[]; signal?: AbortSignal }) {
    return (await entry(options)).preflightTransferValidationCaseSixRun(options);
  }
  async function startTransferValidationCaseSeven(options: { repository: string; args: string[]; host: TransferCaseSixRunHost; signal?: AbortSignal }, resume = false) {
    return (await entry(options)).startTransferValidationCaseSix(options, resume);
  }
  async function runTransferValidationCaseSevenWithHost(options: { repository: string; args: string[]; host: TransferCaseSixRunHost; signal?: AbortSignal }) {
    return (await entry(options)).runTransferValidationCaseSixWithHost(options);
  }
  function createNativeTransferValidationCaseSevenHost(): TransferCaseSixRunHost {
    return { prepare: async input => (await import('../e2e/validation-host.ts')).createNativeValidationHost().prepare(input),
      execute: configuration.generate };
  }
  async function runTransferValidationCaseSevenEntry(args: string[], repository: string) {
    const intent = configuration.parseEntry(args);
    return intent.preflightOnly ? preflightTransferValidationCaseSevenRun({ repository, args })
      : runTransferValidationCaseSevenWithHost({ repository, args, host: createNativeTransferValidationCaseSevenHost() });
  }
  return { preflightTransferValidationCaseSevenRun, startTransferValidationCaseSeven, runTransferValidationCaseSevenWithHost,
    createNativeTransferValidationCaseSevenHost, runTransferValidationCaseSevenEntry };
}
