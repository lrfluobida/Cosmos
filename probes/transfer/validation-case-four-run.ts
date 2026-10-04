import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runTransferValidationCaseFourEntry } from './validation-run.ts';

export { TRANSFER_VALIDATION_CASE_FOUR, parseTransferValidationCaseFourEntry } from './validation-case-four-declaration.ts';
export { preflightTransferValidationCaseFourRun, runTransferValidationCaseFourWithHost, createNativeTransferValidationCaseFourHost, runTransferValidationCaseFourEntry } from './validation-run.ts';

/** Hard-bound fourth entry; no declaration, host, clock, protocol or input selection through arguments. */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runTransferValidationCaseFourEntry(process.argv.slice(2), fileURLToPath(new URL('../../', import.meta.url))).then(result => {
    console.log(JSON.stringify(result)); if (result.outcome === 'failed') process.exitCode = 1;
  }).catch(error => { console.error(`COS16 case4 operator validation stopped: ${error instanceof Error ? error.message : 'Admission failed'}`); process.exitCode = 1; });
}
