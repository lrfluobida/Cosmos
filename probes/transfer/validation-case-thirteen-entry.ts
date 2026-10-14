import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import type { ValidationCaseQuote } from '../../src/runtime/validation-types.ts';
import type { HistoricalCaseSixSourcePins } from './validation-case-six-entry.ts';
import { createFixedSettledCodingEntry, createFixedTransferAdmissionQuote, fixedTransferHistoricalAccountingHash, requireFixedTransferAccountingSources, createTransferCaseSevenAdmissionQuote } from './validation-case-seven-entry.ts';
import { deriveTransferValidationCaseThirteenDeclaration, parseTransferValidationCaseThirteenEntry, transferCaseThirteenHistory } from './validation-case-thirteen-declaration.ts';
import { captureTransferCaseThirteenSource, requireTransferCaseThirteenSource } from './validation-case-thirteen-source.ts';
export function transferCaseThirteenHistoricalAccountingHash(state: RunSnapshot, quote: ValidationCaseQuote) { return fixedTransferHistoricalAccountingHash(state, quote, 20, 18); }
export function requireTransferCaseThirteenAccountingSources(root: string, state: RunSnapshot, signal: AbortSignal) { return requireFixedTransferAccountingSources(root, state, signal, 18); }
export function createTransferCaseThirteenAdmissionQuote(...args: Parameters<typeof createTransferCaseSevenAdmissionQuote>) { return createFixedTransferAdmissionQuote('transfer-case-thirteen-admission/1', ...args); }
export function createFixedTransferValidationCaseThirteenEntry(sourcePins: HistoricalCaseSixSourcePins) {
  const entry = createFixedSettledCodingEntry(sourcePins, {
    parseEntry: parseTransferValidationCaseThirteenEntry, deriveDeclaration: deriveTransferValidationCaseThirteenDeclaration,
    history: transferCaseThirteenHistory, manifestLocation: 'cos20-transfer-validation-13-reuse.json', closureAuditCount: 18, partialGroupAllocation: true,
    sourceMarkers: { 'COS-60': 'TRANSFER_CASE_SEVEN_SOURCE_READY', 'COS-74': 'FROZEN_TEMPLATE_OBSERVER_ISOLATION_SOURCE_READY', 'COS-75': 'VALIDATION_SCOPE_TIMEOUT_ORIGIN_SOURCE_READY',
      'COS-76': 'TRANSFER_CASE_EIGHT_SOURCE_READY', 'COS-77': 'VALIDATION_CODING_OUTPUT_CAP_SOURCE_READY', 'COS-78': 'TRANSFER_CASE_NINE_SOURCE_READY',
      'COS-79': 'VALIDATION_CODING_COMPACTION_SOURCE_READY', 'COS-80': 'TRANSFER_CURRENT_PLAN_READING_SOURCE_READY', 'COS-81': 'ADMISSION_FAILURE_FEEDBACK_SOURCE_READY',
      'COS-82': 'TRANSFER_CASE_TEN_SOURCE_READY', 'COS-83': 'AUTHOR_TOOL_SCOPE_SOURCE_READY', 'COS-84': 'TRANSFER_CASE_ELEVEN_SOURCE_READY',
      'COS-85': 'OPTIONAL_COMPACTION_TRUNCATION_SOURCE_READY', 'COS-86': 'TRANSFER_CASE_TWELVE_SOURCE_READY',
      'COS-87': 'PARALLEL_GIT_IDENTITY_SOURCE_READY' },
    captureSource: captureTransferCaseThirteenSource, requireSource: requireTransferCaseThirteenSource, requireAccounting: requireTransferCaseThirteenAccountingSources,
    admissionQuote: createTransferCaseThirteenAdmissionQuote, accountingHash: transferCaseThirteenHistoricalAccountingHash,
    generate: async (...args) => (await import('./validation-case-thirteen-driver.ts')).generateTransferValidationCaseThirteen(...args),
  });
  return { preflightTransferValidationCaseThirteenRun: entry.preflightTransferValidationCaseSevenRun, startTransferValidationCaseThirteen: entry.startTransferValidationCaseSeven,
    runTransferValidationCaseThirteenWithHost: entry.runTransferValidationCaseSevenWithHost, createNativeTransferValidationCaseThirteenHost: entry.createNativeTransferValidationCaseSevenHost,
    runTransferValidationCaseThirteenEntry: entry.runTransferValidationCaseSevenEntry };
}
