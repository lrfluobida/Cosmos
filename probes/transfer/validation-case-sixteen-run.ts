import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createFixedTransferValidationCaseSixteenEntry } from './validation-case-sixteen-entry.ts';
import { TRANSFER_CASE_THIRTEEN_HISTORICAL_SOURCE } from './validation-case-thirteen-run.ts';
export { TRANSFER_VALIDATION_CASE_SIXTEEN, parseTransferValidationCaseSixteenEntry, TRANSFER_VALIDATION_CASE_SIXTEEN_ID } from './validation-case-sixteen-declaration.ts';
export const TRANSFER_CASE_SIXTEEN_HISTORICAL_SOURCE = TRANSFER_CASE_THIRTEEN_HISTORICAL_SOURCE;
export const { preflightTransferValidationCaseSixteenRun, runTransferValidationCaseSixteenWithHost, createNativeTransferValidationCaseSixteenHost, runTransferValidationCaseSixteenEntry }
  = createFixedTransferValidationCaseSixteenEntry(TRANSFER_CASE_SIXTEEN_HISTORICAL_SOURCE);
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runTransferValidationCaseSixteenEntry(process.argv.slice(2), fileURLToPath(new URL('../../', import.meta.url))).then(result => {
    console.log(JSON.stringify(result)); if (result.outcome === 'failed') process.exitCode = 1;
  }).catch(error => { console.error(`COS16 case16 validation stopped: ${error instanceof Error ? error.message : 'Admission failed'}`); process.exitCode = 1; });
}
