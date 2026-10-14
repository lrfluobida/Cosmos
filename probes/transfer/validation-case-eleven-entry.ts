import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import type { ValidationCaseQuote } from '../../src/runtime/validation-types.ts';
import type { HistoricalCaseSixSourcePins } from './validation-case-six-entry.ts';
import { createFixedSettledCodingEntry, createFixedTransferAdmissionQuote, fixedTransferHistoricalAccountingHash, requireFixedTransferAccountingSources, createTransferCaseSevenAdmissionQuote } from './validation-case-seven-entry.ts';
import { deriveTransferValidationCaseElevenDeclaration, parseTransferValidationCaseElevenEntry, transferCaseElevenHistory } from './validation-case-eleven-declaration.ts';
import { captureTransferCaseElevenSource, requireTransferCaseElevenSource } from './validation-case-eleven-source.ts';
export function transferCaseElevenHistoricalAccountingHash(state: RunSnapshot, quote: ValidationCaseQuote) { return fixedTransferHistoricalAccountingHash(state, quote, 18, 16); }
export function requireTransferCaseElevenAccountingSources(root: string, state: RunSnapshot, signal: AbortSignal) { return requireFixedTransferAccountingSources(root, state, signal, 16); }
export function createTransferCaseElevenAdmissionQuote(...args: Parameters<typeof createTransferCaseSevenAdmissionQuote>) { return createFixedTransferAdmissionQuote('transfer-case-eleven-admission/1', ...args); }
export function createFixedTransferValidationCaseElevenEntry(sourcePins: HistoricalCaseSixSourcePins) {
  const entry = createFixedSettledCodingEntry(sourcePins, {
    parseEntry: parseTransferValidationCaseElevenEntry, deriveDeclaration: deriveTransferValidationCaseElevenDeclaration,
    history: transferCaseElevenHistory, manifestLocation: 'cos20-transfer-validation-11-reuse.json', closureAuditCount: 16, partialGroupAllocation: true,
    sourceMarkers: { 'COS-60': 'TRANSFER_CASE_SEVEN_SOURCE_READY', 'COS-74': 'FROZEN_TEMPLATE_OBSERVER_ISOLATION_SOURCE_READY', 'COS-75': 'VALIDATION_SCOPE_TIMEOUT_ORIGIN_SOURCE_READY',
      'COS-76': 'TRANSFER_CASE_EIGHT_SOURCE_READY', 'COS-77': 'VALIDATION_CODING_OUTPUT_CAP_SOURCE_READY', 'COS-78': 'TRANSFER_CASE_NINE_SOURCE_READY',
      'COS-79': 'VALIDATION_CODING_COMPACTION_SOURCE_READY', 'COS-80': 'TRANSFER_CURRENT_PLAN_READING_SOURCE_READY', 'COS-81': 'ADMISSION_FAILURE_FEEDBACK_SOURCE_READY',
      'COS-82': 'TRANSFER_CASE_TEN_SOURCE_READY', 'COS-83': 'AUTHOR_TOOL_SCOPE_SOURCE_READY' },
    captureSource: captureTransferCaseElevenSource, requireSource: requireTransferCaseElevenSource, requireAccounting: requireTransferCaseElevenAccountingSources,
    admissionQuote: createTransferCaseElevenAdmissionQuote, accountingHash: transferCaseElevenHistoricalAccountingHash,
    generate: async (...args) => (await import('./validation-case-eleven-driver.ts')).generateTransferValidationCaseEleven(...args),
  });
  return { preflightTransferValidationCaseElevenRun: entry.preflightTransferValidationCaseSevenRun, startTransferValidationCaseEleven: entry.startTransferValidationCaseSeven,
    runTransferValidationCaseElevenWithHost: entry.runTransferValidationCaseSevenWithHost, createNativeTransferValidationCaseElevenHost: entry.createNativeTransferValidationCaseSevenHost,
    runTransferValidationCaseElevenEntry: entry.runTransferValidationCaseSevenEntry };
}
