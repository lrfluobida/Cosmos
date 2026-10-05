import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createFixedTransferValidationCaseSevenEntry } from './validation-case-seven-entry.ts';
import { TRANSFER_CASE_SIX_HISTORICAL_SOURCE } from './validation-case-six-run.ts';
export { deriveTransferValidationCaseSevenDeclaration, parseTransferValidationCaseSevenEntry, TRANSFER_VALIDATION_CASE_SEVEN_ID } from './validation-case-seven-declaration.ts';
/** Original C5/parent/first authorization pins stay identical; C7 owns all new receipts. */
export const TRANSFER_CASE_SEVEN_HISTORICAL_SOURCE = TRANSFER_CASE_SIX_HISTORICAL_SOURCE;
export const { preflightTransferValidationCaseSevenRun, runTransferValidationCaseSevenWithHost, createNativeTransferValidationCaseSevenHost, runTransferValidationCaseSevenEntry }
  = createFixedTransferValidationCaseSevenEntry(TRANSFER_CASE_SEVEN_HISTORICAL_SOURCE);
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runTransferValidationCaseSevenEntry(process.argv.slice(2), fileURLToPath(new URL('../../', import.meta.url))).then(result => {
    console.log(JSON.stringify(result)); if (result.outcome === 'failed') process.exitCode = 1;
  }).catch(error => { console.error(`COS16 case7 validation stopped: ${error instanceof Error ? error.message : 'Admission failed'}`); process.exitCode = 1; });
}
