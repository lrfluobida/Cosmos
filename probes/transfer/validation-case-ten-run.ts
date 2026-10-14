import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createFixedTransferValidationCaseTenEntry } from './validation-case-ten-entry.ts';
import { TRANSFER_CASE_NINE_HISTORICAL_SOURCE } from './validation-case-nine-run.ts';
export { deriveTransferValidationCaseTenDeclaration, parseTransferValidationCaseTenEntry, TRANSFER_VALIDATION_CASE_TEN_ID } from './validation-case-ten-declaration.ts';
export const TRANSFER_CASE_TEN_HISTORICAL_SOURCE = TRANSFER_CASE_NINE_HISTORICAL_SOURCE;
export const { preflightTransferValidationCaseTenRun, runTransferValidationCaseTenWithHost, createNativeTransferValidationCaseTenHost, runTransferValidationCaseTenEntry }
  = createFixedTransferValidationCaseTenEntry(TRANSFER_CASE_TEN_HISTORICAL_SOURCE);
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runTransferValidationCaseTenEntry(process.argv.slice(2), fileURLToPath(new URL('../../', import.meta.url))).then(result => {
    console.log(JSON.stringify(result)); if (result.outcome === 'failed') process.exitCode = 1;
  }).catch(error => { console.error(`COS16 case10 validation stopped: ${error instanceof Error ? error.message : 'Admission failed'}`); process.exitCode = 1; });
}
