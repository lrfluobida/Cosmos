import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import type { ValidationCaseQuote } from '../../src/runtime/validation-types.ts';
import type { HistoricalCaseSixSourcePins } from './validation-case-six-entry.ts';
import { createFixedSettledCodingEntry, createFixedTransferAdmissionQuote, fixedTransferHistoricalAccountingHash, requireFixedTransferAccountingSources, createTransferCaseSevenAdmissionQuote } from './validation-case-seven-entry.ts';
import { deriveTransferValidationCaseNineDeclaration, parseTransferValidationCaseNineEntry, transferCaseNineHistory } from './validation-case-nine-declaration.ts';
import { captureTransferCaseNineSource, requireTransferCaseNineSource } from './validation-case-nine-source.ts';
export function transferCaseNineHistoricalAccountingHash(state: RunSnapshot, quote: ValidationCaseQuote) { return fixedTransferHistoricalAccountingHash(state, quote, 16, 14); }
export function requireTransferCaseNineAccountingSources(root: string, state: RunSnapshot, signal: AbortSignal) { return requireFixedTransferAccountingSources(root, state, signal, 14); }
export function createTransferCaseNineAdmissionQuote(...args: Parameters<typeof createTransferCaseSevenAdmissionQuote>) { return createFixedTransferAdmissionQuote('transfer-case-nine-admission/1', ...args); }
export function createFixedTransferValidationCaseNineEntry(sourcePins: HistoricalCaseSixSourcePins) {
  const entry = createFixedSettledCodingEntry(sourcePins, {
    parseEntry: parseTransferValidationCaseNineEntry, deriveDeclaration: deriveTransferValidationCaseNineDeclaration,
    history: transferCaseNineHistory, manifestLocation: 'cos20-transfer-validation-9-reuse.json', closureAuditCount: 14,
    sourceMarkers: { 'COS-60': 'TRANSFER_CASE_SEVEN_SOURCE_READY', 'COS-74': 'FROZEN_TEMPLATE_OBSERVER_ISOLATION_SOURCE_READY', 'COS-75': 'VALIDATION_SCOPE_TIMEOUT_ORIGIN_SOURCE_READY',
      'COS-76': 'TRANSFER_CASE_EIGHT_SOURCE_READY', 'COS-77': 'VALIDATION_CODING_OUTPUT_CAP_SOURCE_READY', 'COS-79': 'VALIDATION_CODING_COMPACTION_SOURCE_READY' },
    captureSource: captureTransferCaseNineSource, requireSource: requireTransferCaseNineSource, requireAccounting: requireTransferCaseNineAccountingSources,
    admissionQuote: createTransferCaseNineAdmissionQuote, accountingHash: transferCaseNineHistoricalAccountingHash,
    generate: async (...args) => (await import('./validation-case-nine-driver.ts')).generateTransferValidationCaseNine(...args),
  });
  return { preflightTransferValidationCaseNineRun: entry.preflightTransferValidationCaseSevenRun, startTransferValidationCaseNine: entry.startTransferValidationCaseSeven,
    runTransferValidationCaseNineWithHost: entry.runTransferValidationCaseSevenWithHost, createNativeTransferValidationCaseNineHost: entry.createNativeTransferValidationCaseSevenHost,
    runTransferValidationCaseNineEntry: entry.runTransferValidationCaseSevenEntry };
}
