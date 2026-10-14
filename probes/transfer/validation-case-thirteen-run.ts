import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createFixedTransferValidationCaseThirteenEntry } from './validation-case-thirteen-entry.ts';
import { TRANSFER_CASE_TWELVE_HISTORICAL_SOURCE } from './validation-case-twelve-run.ts';
export { deriveTransferValidationCaseThirteenDeclaration, parseTransferValidationCaseThirteenEntry, TRANSFER_VALIDATION_CASE_THIRTEEN_ID } from './validation-case-thirteen-declaration.ts';
export const TRANSFER_CASE_THIRTEEN_HISTORICAL_SOURCE = TRANSFER_CASE_TWELVE_HISTORICAL_SOURCE;
export const { preflightTransferValidationCaseThirteenRun, runTransferValidationCaseThirteenWithHost, createNativeTransferValidationCaseThirteenHost, runTransferValidationCaseThirteenEntry }
  = createFixedTransferValidationCaseThirteenEntry(TRANSFER_CASE_THIRTEEN_HISTORICAL_SOURCE);
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runTransferValidationCaseThirteenEntry(process.argv.slice(2), fileURLToPath(new URL('../../', import.meta.url))).then(result => {
    console.log(JSON.stringify(result)); if (result.outcome === 'failed') process.exitCode = 1;
  }).catch(error => { console.error(`COS16 case13 validation stopped: ${error instanceof Error ? error.message : 'Admission failed'}`); process.exitCode = 1; });
}
