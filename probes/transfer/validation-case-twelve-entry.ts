import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import type { ValidationCaseQuote } from '../../src/runtime/validation-types.ts';
import type { HistoricalCaseSixSourcePins } from './validation-case-six-entry.ts';
import { createFixedSettledCodingEntry, createFixedTransferAdmissionQuote, fixedTransferHistoricalAccountingHash, requireFixedTransferAccountingSources, createTransferCaseSevenAdmissionQuote } from './validation-case-seven-entry.ts';
import { deriveTransferValidationCaseTwelveDeclaration, parseTransferValidationCaseTwelveEntry, transferCaseTwelveHistory } from './validation-case-twelve-declaration.ts';
import { captureTransferCaseTwelveSource, requireTransferCaseTwelveSource } from './validation-case-twelve-source.ts';
export function transferCaseTwelveHistoricalAccountingHash(state: RunSnapshot, quote: ValidationCaseQuote) { return fixedTransferHistoricalAccountingHash(state, quote, 19, 17); }
export function requireTransferCaseTwelveAccountingSources(root: string, state: RunSnapshot, signal: AbortSignal) { return requireFixedTransferAccountingSources(root, state, signal, 17); }
export function createTransferCaseTwelveAdmissionQuote(...args: Parameters<typeof createTransferCaseSevenAdmissionQuote>) { return createFixedTransferAdmissionQuote('transfer-case-twelve-admission/1', ...args); }
export function createFixedTransferValidationCaseTwelveEntry(sourcePins: HistoricalCaseSixSourcePins) {
  const entry = createFixedSettledCodingEntry(sourcePins, {
    parseEntry: parseTransferValidationCaseTwelveEntry, deriveDeclaration: deriveTransferValidationCaseTwelveDeclaration,
    history: transferCaseTwelveHistory, manifestLocation: 'cos20-transfer-validation-12-reuse.json', closureAuditCount: 17, partialGroupAllocation: true,
    sourceMarkers: { 'COS-60': 'TRANSFER_CASE_SEVEN_SOURCE_READY', 'COS-74': 'FROZEN_TEMPLATE_OBSERVER_ISOLATION_SOURCE_READY', 'COS-75': 'VALIDATION_SCOPE_TIMEOUT_ORIGIN_SOURCE_READY',
      'COS-76': 'TRANSFER_CASE_EIGHT_SOURCE_READY', 'COS-77': 'VALIDATION_CODING_OUTPUT_CAP_SOURCE_READY', 'COS-78': 'TRANSFER_CASE_NINE_SOURCE_READY',
      'COS-79': 'VALIDATION_CODING_COMPACTION_SOURCE_READY', 'COS-80': 'TRANSFER_CURRENT_PLAN_READING_SOURCE_READY', 'COS-81': 'ADMISSION_FAILURE_FEEDBACK_SOURCE_READY',
      'COS-82': 'TRANSFER_CASE_TEN_SOURCE_READY', 'COS-83': 'AUTHOR_TOOL_SCOPE_SOURCE_READY', 'COS-84': 'TRANSFER_CASE_ELEVEN_SOURCE_READY',
      'COS-85': 'OPTIONAL_COMPACTION_TRUNCATION_SOURCE_READY' },
    captureSource: captureTransferCaseTwelveSource, requireSource: requireTransferCaseTwelveSource, requireAccounting: requireTransferCaseTwelveAccountingSources,
    admissionQuote: createTransferCaseTwelveAdmissionQuote, accountingHash: transferCaseTwelveHistoricalAccountingHash,
    generate: async (...args) => (await import('./validation-case-twelve-driver.ts')).generateTransferValidationCaseTwelve(...args),
  });
  return { preflightTransferValidationCaseTwelveRun: entry.preflightTransferValidationCaseSevenRun, startTransferValidationCaseTwelve: entry.startTransferValidationCaseSeven,
    runTransferValidationCaseTwelveWithHost: entry.runTransferValidationCaseSevenWithHost, createNativeTransferValidationCaseTwelveHost: entry.createNativeTransferValidationCaseSevenHost,
    runTransferValidationCaseTwelveEntry: entry.runTransferValidationCaseSevenEntry };
}
