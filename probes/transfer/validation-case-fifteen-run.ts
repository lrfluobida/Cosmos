import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createFixedTransferValidationCaseFifteenEntry } from './validation-case-fifteen-entry.ts';
import { TRANSFER_CASE_THIRTEEN_HISTORICAL_SOURCE } from './validation-case-thirteen-run.ts';
export { TRANSFER_VALIDATION_CASE_FIFTEEN, parseTransferValidationCaseFifteenEntry, TRANSFER_VALIDATION_CASE_FIFTEEN_ID } from './validation-case-fifteen-declaration.ts';
export const TRANSFER_CASE_FIFTEEN_HISTORICAL_SOURCE = TRANSFER_CASE_THIRTEEN_HISTORICAL_SOURCE;
export const { preflightTransferValidationCaseFifteenRun, runTransferValidationCaseFifteenWithHost, createNativeTransferValidationCaseFifteenHost, runTransferValidationCaseFifteenEntry }
  = createFixedTransferValidationCaseFifteenEntry(TRANSFER_CASE_FIFTEEN_HISTORICAL_SOURCE);
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runTransferValidationCaseFifteenEntry(process.argv.slice(2), fileURLToPath(new URL('../../', import.meta.url))).then(result => {
    console.log(JSON.stringify(result)); if (result.outcome === 'failed') process.exitCode = 1;
  }).catch(error => { console.error(`COS16 case15 validation stopped: ${error instanceof Error ? error.message : 'Admission failed'}`); process.exitCode = 1; });
}
