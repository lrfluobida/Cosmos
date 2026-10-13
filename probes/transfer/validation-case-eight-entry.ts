import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import type { ValidationCaseQuote } from '../../src/runtime/validation-types.ts';
import type { HistoricalCaseSixSourcePins } from './validation-case-six-entry.ts';
import { createFixedSettledCodingEntry, createFixedTransferAdmissionQuote, fixedTransferHistoricalAccountingHash, requireFixedTransferAccountingSources, createTransferCaseSevenAdmissionQuote } from './validation-case-seven-entry.ts';
import { deriveTransferValidationCaseEightDeclaration, parseTransferValidationCaseEightEntry, transferCaseEightHistory } from './validation-case-eight-declaration.ts';
import { captureTransferCaseEightSource, requireTransferCaseEightSource } from './validation-case-eight-source.ts';
export function transferCaseEightHistoricalAccountingHash(state: RunSnapshot, quote: ValidationCaseQuote) { return fixedTransferHistoricalAccountingHash(state, quote, 15, 13); }
export function requireTransferCaseEightAccountingSources(root: string, state: RunSnapshot, signal: AbortSignal) { return requireFixedTransferAccountingSources(root, state, signal, 13); }
export function createTransferCaseEightAdmissionQuote(...args: Parameters<typeof createTransferCaseSevenAdmissionQuote>) { return createFixedTransferAdmissionQuote('transfer-case-eight-admission/1', ...args); }
export function createFixedTransferValidationCaseEightEntry(sourcePins: HistoricalCaseSixSourcePins) {
  const entry = createFixedSettledCodingEntry(sourcePins, {
    parseEntry: parseTransferValidationCaseEightEntry, deriveDeclaration: deriveTransferValidationCaseEightDeclaration,
    history: transferCaseEightHistory, manifestLocation: 'cos20-transfer-validation-8-reuse.json', closureAuditCount: 13,
    sourceMarkers: { 'COS-60': 'TRANSFER_CASE_SEVEN_SOURCE_READY', 'COS-74': 'FROZEN_TEMPLATE_OBSERVER_ISOLATION_SOURCE_READY', 'COS-75': 'VALIDATION_SCOPE_TIMEOUT_ORIGIN_SOURCE_READY' },
    captureSource: captureTransferCaseEightSource, requireSource: requireTransferCaseEightSource, requireAccounting: requireTransferCaseEightAccountingSources,
    admissionQuote: createTransferCaseEightAdmissionQuote, accountingHash: transferCaseEightHistoricalAccountingHash,
    generate: async (...args) => (await import('./validation-case-eight-driver.ts')).generateTransferValidationCaseEight(...args),
  });
  return { preflightTransferValidationCaseEightRun: entry.preflightTransferValidationCaseSevenRun, startTransferValidationCaseEight: entry.startTransferValidationCaseSeven,
    runTransferValidationCaseEightWithHost: entry.runTransferValidationCaseSevenWithHost, createNativeTransferValidationCaseEightHost: entry.createNativeTransferValidationCaseSevenHost,
    runTransferValidationCaseEightEntry: entry.runTransferValidationCaseSevenEntry };
}
