import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createFixedTransferValidationCaseEightEntry } from './validation-case-eight-entry.ts';
import { TRANSFER_CASE_SEVEN_HISTORICAL_SOURCE } from './validation-case-seven-run.ts';
export { deriveTransferValidationCaseEightDeclaration, parseTransferValidationCaseEightEntry, TRANSFER_VALIDATION_CASE_EIGHT_ID } from './validation-case-eight-declaration.ts';
export const TRANSFER_CASE_EIGHT_HISTORICAL_SOURCE = TRANSFER_CASE_SEVEN_HISTORICAL_SOURCE;
export const { preflightTransferValidationCaseEightRun, runTransferValidationCaseEightWithHost, createNativeTransferValidationCaseEightHost, runTransferValidationCaseEightEntry }
  = createFixedTransferValidationCaseEightEntry(TRANSFER_CASE_EIGHT_HISTORICAL_SOURCE);
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runTransferValidationCaseEightEntry(process.argv.slice(2), fileURLToPath(new URL('../../', import.meta.url))).then(result => {
    console.log(JSON.stringify(result)); if (result.outcome === 'failed') process.exitCode = 1;
  }).catch(error => { console.error(`COS16 case8 validation stopped: ${error instanceof Error ? error.message : 'Admission failed'}`); process.exitCode = 1; });
}
