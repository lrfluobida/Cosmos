import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createFixedTransferValidationCaseElevenEntry } from './validation-case-eleven-entry.ts';
import { TRANSFER_CASE_TEN_HISTORICAL_SOURCE } from './validation-case-ten-run.ts';
export { deriveTransferValidationCaseElevenDeclaration, parseTransferValidationCaseElevenEntry, TRANSFER_VALIDATION_CASE_ELEVEN_ID } from './validation-case-eleven-declaration.ts';
export const TRANSFER_CASE_ELEVEN_HISTORICAL_SOURCE = TRANSFER_CASE_TEN_HISTORICAL_SOURCE;
export const { preflightTransferValidationCaseElevenRun, runTransferValidationCaseElevenWithHost, createNativeTransferValidationCaseElevenHost, runTransferValidationCaseElevenEntry }
  = createFixedTransferValidationCaseElevenEntry(TRANSFER_CASE_ELEVEN_HISTORICAL_SOURCE);
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runTransferValidationCaseElevenEntry(process.argv.slice(2), fileURLToPath(new URL('../../', import.meta.url))).then(result => {
    console.log(JSON.stringify(result)); if (result.outcome === 'failed') process.exitCode = 1;
  }).catch(error => { console.error(`COS16 case11 validation stopped: ${error instanceof Error ? error.message : 'Admission failed'}`); process.exitCode = 1; });
}
