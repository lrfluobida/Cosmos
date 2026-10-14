import { verifyValidationBudgetSources } from '../../src/runtime/validation-budget.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import type { ValidationCaseQuote } from '../../src/runtime/validation-types.ts';
import type { HistoricalCaseSixSourcePins } from './validation-case-six-entry.ts';
import { createFixedSettledCodingEntry, createFixedTransferAdmissionQuote, fixedTransferHistoricalAccountingHash, requireFixedTransferAccountingSources, createTransferCaseSevenAdmissionQuote } from './validation-case-seven-entry.ts';
import { deriveTransferValidationCaseFourteenDeclaration, parseTransferValidationCaseFourteenEntry, transferCaseFourteenHistory } from './validation-case-fourteen-declaration.ts';
import { captureTransferCaseFourteenSource, requireTransferCaseFourteenSource } from './validation-case-fourteen-source.ts';
export function transferCaseFourteenHistoricalAccountingHash(state: RunSnapshot, quote: ValidationCaseQuote) { return fixedTransferHistoricalAccountingHash(state, quote, 21, 19); }
export async function requireTransferCaseFourteenAccountingSources(root: string, state: RunSnapshot, signal: AbortSignal) { await requireFixedTransferAccountingSources(root, state, signal, 19); if (state.ledger.contractVersion === '5.0.0') await verifyValidationBudgetSources(root, state); }
export function createTransferCaseFourteenAdmissionQuote(...args: Parameters<typeof createTransferCaseSevenAdmissionQuote>) { return createFixedTransferAdmissionQuote('transfer-case-fourteen-admission/1', ...args); }
export function createFixedTransferValidationCaseFourteenEntry(sourcePins: HistoricalCaseSixSourcePins) {
  const entry = createFixedSettledCodingEntry(sourcePins, {
    parseEntry: parseTransferValidationCaseFourteenEntry, deriveDeclaration: deriveTransferValidationCaseFourteenDeclaration,
    history: transferCaseFourteenHistory, manifestLocation: 'cos20-transfer-validation-14-reuse.json', closureAuditCount: 19, partialGroupAllocation: true, ledgerVersion: '5.0.0',
    sourceMarkers: { 'COS-60': 'TRANSFER_CASE_SEVEN_SOURCE_READY', 'COS-74': 'FROZEN_TEMPLATE_OBSERVER_ISOLATION_SOURCE_READY', 'COS-75': 'VALIDATION_SCOPE_TIMEOUT_ORIGIN_SOURCE_READY',
      'COS-76': 'TRANSFER_CASE_EIGHT_SOURCE_READY', 'COS-77': 'VALIDATION_CODING_OUTPUT_CAP_SOURCE_READY', 'COS-78': 'TRANSFER_CASE_NINE_SOURCE_READY',
      'COS-79': 'VALIDATION_CODING_COMPACTION_SOURCE_READY', 'COS-80': 'TRANSFER_CURRENT_PLAN_READING_SOURCE_READY', 'COS-81': 'ADMISSION_FAILURE_FEEDBACK_SOURCE_READY',
      'COS-82': 'TRANSFER_CASE_TEN_SOURCE_READY', 'COS-83': 'AUTHOR_TOOL_SCOPE_SOURCE_READY', 'COS-84': 'TRANSFER_CASE_ELEVEN_SOURCE_READY',
      'COS-85': 'OPTIONAL_COMPACTION_TRUNCATION_SOURCE_READY', 'COS-86': 'TRANSFER_CASE_TWELVE_SOURCE_READY',
      'COS-87': 'PARALLEL_GIT_IDENTITY_SOURCE_READY', 'COS-88': 'TRANSFER_CASE_THIRTEEN_SOURCE_READY',
      'COS-89': 'AFFORDABLE_CODING_COMPACTION_SOURCE_READY', 'COS-90': 'VALIDATION_GROUP_SUPPLEMENT_SOURCE_READY' },
    captureSource: captureTransferCaseFourteenSource, requireSource: requireTransferCaseFourteenSource, requireAccounting: requireTransferCaseFourteenAccountingSources,
    admissionQuote: createTransferCaseFourteenAdmissionQuote, accountingHash: transferCaseFourteenHistoricalAccountingHash,
    generate: async (...args) => (await import('./validation-case-fourteen-driver.ts')).generateTransferValidationCaseFourteen(...args),
  });
  return { preflightTransferValidationCaseFourteenRun: entry.preflightTransferValidationCaseSevenRun, startTransferValidationCaseFourteen: entry.startTransferValidationCaseSeven,
    runTransferValidationCaseFourteenWithHost: entry.runTransferValidationCaseSevenWithHost, createNativeTransferValidationCaseFourteenHost: entry.createNativeTransferValidationCaseSevenHost,
    runTransferValidationCaseFourteenEntry: entry.runTransferValidationCaseSevenEntry };
}
