import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runTransferValidationCaseTwoEntry } from './validation-run.ts';

export { TRANSFER_VALIDATION_CASE_TWO, parseTransferValidationCaseTwoEntry } from './validation-case-two-declaration.ts';
export { preflightTransferValidationCaseTwoRun, runTransferValidationCaseTwoWithHost, createNativeTransferValidationCaseTwoHost, runTransferValidationCaseTwoEntry } from './validation-run.ts';

/** Hard-bound second entry; no declaration, host, clock or input selection through arguments. */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runTransferValidationCaseTwoEntry(process.argv.slice(2), fileURLToPath(new URL('../../', import.meta.url))).then(result => {
    console.log(JSON.stringify(result)); if (result.outcome === 'failed') process.exitCode = 1;
  }).catch(error => { console.error(`COS16 case2 operator validation stopped: ${error instanceof Error ? error.message : 'Admission failed'}`); process.exitCode = 1; });
}
