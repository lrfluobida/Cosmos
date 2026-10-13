import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createFixedTransferValidationCaseNineEntry } from './validation-case-nine-entry.ts';
import { TRANSFER_CASE_EIGHT_HISTORICAL_SOURCE } from './validation-case-eight-run.ts';
export { deriveTransferValidationCaseNineDeclaration, parseTransferValidationCaseNineEntry, TRANSFER_VALIDATION_CASE_NINE_ID } from './validation-case-nine-declaration.ts';
export const TRANSFER_CASE_NINE_HISTORICAL_SOURCE = TRANSFER_CASE_EIGHT_HISTORICAL_SOURCE;
export const { preflightTransferValidationCaseNineRun, runTransferValidationCaseNineWithHost, createNativeTransferValidationCaseNineHost, runTransferValidationCaseNineEntry }
  = createFixedTransferValidationCaseNineEntry(TRANSFER_CASE_NINE_HISTORICAL_SOURCE);
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runTransferValidationCaseNineEntry(process.argv.slice(2), fileURLToPath(new URL('../../', import.meta.url))).then(result => {
    console.log(JSON.stringify(result)); if (result.outcome === 'failed') process.exitCode = 1;
  }).catch(error => { console.error(`COS16 case9 validation stopped: ${error instanceof Error ? error.message : 'Admission failed'}`); process.exitCode = 1; });
}
