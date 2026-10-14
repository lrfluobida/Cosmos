import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createFixedTransferValidationCaseTwelveEntry } from './validation-case-twelve-entry.ts';
import { TRANSFER_CASE_ELEVEN_HISTORICAL_SOURCE } from './validation-case-eleven-run.ts';
export { deriveTransferValidationCaseTwelveDeclaration, parseTransferValidationCaseTwelveEntry, TRANSFER_VALIDATION_CASE_TWELVE_ID } from './validation-case-twelve-declaration.ts';
export const TRANSFER_CASE_TWELVE_HISTORICAL_SOURCE = TRANSFER_CASE_ELEVEN_HISTORICAL_SOURCE;
export const { preflightTransferValidationCaseTwelveRun, runTransferValidationCaseTwelveWithHost, createNativeTransferValidationCaseTwelveHost, runTransferValidationCaseTwelveEntry }
  = createFixedTransferValidationCaseTwelveEntry(TRANSFER_CASE_TWELVE_HISTORICAL_SOURCE);
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runTransferValidationCaseTwelveEntry(process.argv.slice(2), fileURLToPath(new URL('../../', import.meta.url))).then(result => {
    console.log(JSON.stringify(result)); if (result.outcome === 'failed') process.exitCode = 1;
  }).catch(error => { console.error(`COS16 case12 validation stopped: ${error instanceof Error ? error.message : 'Admission failed'}`); process.exitCode = 1; });
}
