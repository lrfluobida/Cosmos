import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import type { ValidationCaseQuote } from '../../src/runtime/validation-types.ts';
import type { HistoricalCaseSixSourcePins } from './validation-case-six-entry.ts';
import { createFixedSettledCodingEntry, createFixedTransferAdmissionQuote, fixedTransferHistoricalAccountingHash, requireFixedTransferAccountingSources, createTransferCaseSevenAdmissionQuote } from './validation-case-seven-entry.ts';
import { deriveTransferValidationCaseTenDeclaration, parseTransferValidationCaseTenEntry, transferCaseTenHistory } from './validation-case-ten-declaration.ts';
import { captureTransferCaseTenSource, requireTransferCaseTenSource } from './validation-case-ten-source.ts';
export function transferCaseTenHistoricalAccountingHash(state: RunSnapshot, quote: ValidationCaseQuote) { return fixedTransferHistoricalAccountingHash(state, quote, 17, 15); }
export function requireTransferCaseTenAccountingSources(root: string, state: RunSnapshot, signal: AbortSignal) { return requireFixedTransferAccountingSources(root, state, signal, 15); }
export function createTransferCaseTenAdmissionQuote(...args: Parameters<typeof createTransferCaseSevenAdmissionQuote>) { return createFixedTransferAdmissionQuote('transfer-case-ten-admission/1', ...args); }
export function createFixedTransferValidationCaseTenEntry(sourcePins: HistoricalCaseSixSourcePins) {
  const entry = createFixedSettledCodingEntry(sourcePins, {
    parseEntry: parseTransferValidationCaseTenEntry, deriveDeclaration: deriveTransferValidationCaseTenDeclaration,
    history: transferCaseTenHistory, manifestLocation: 'cos20-transfer-validation-10-reuse.json', closureAuditCount: 15, partialGroupAllocation: true,
    sourceMarkers: { 'COS-60': 'TRANSFER_CASE_SEVEN_SOURCE_READY', 'COS-74': 'FROZEN_TEMPLATE_OBSERVER_ISOLATION_SOURCE_READY', 'COS-75': 'VALIDATION_SCOPE_TIMEOUT_ORIGIN_SOURCE_READY',
      'COS-76': 'TRANSFER_CASE_EIGHT_SOURCE_READY', 'COS-77': 'VALIDATION_CODING_OUTPUT_CAP_SOURCE_READY', 'COS-78': 'TRANSFER_CASE_NINE_SOURCE_READY',
      'COS-79': 'VALIDATION_CODING_COMPACTION_SOURCE_READY', 'COS-80': 'TRANSFER_CURRENT_PLAN_READING_SOURCE_READY', 'COS-81': 'ADMISSION_FAILURE_FEEDBACK_SOURCE_READY' },
    captureSource: captureTransferCaseTenSource, requireSource: requireTransferCaseTenSource, requireAccounting: requireTransferCaseTenAccountingSources,
    admissionQuote: createTransferCaseTenAdmissionQuote, accountingHash: transferCaseTenHistoricalAccountingHash,
    generate: async (...args) => (await import('./validation-case-ten-driver.ts')).generateTransferValidationCaseTen(...args),
  });
  return { preflightTransferValidationCaseTenRun: entry.preflightTransferValidationCaseSevenRun, startTransferValidationCaseTen: entry.startTransferValidationCaseSeven,
    runTransferValidationCaseTenWithHost: entry.runTransferValidationCaseSevenWithHost, createNativeTransferValidationCaseTenHost: entry.createNativeTransferValidationCaseSevenHost,
    runTransferValidationCaseTenEntry: entry.runTransferValidationCaseSevenEntry };
}
