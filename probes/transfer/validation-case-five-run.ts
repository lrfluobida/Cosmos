import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runTransferValidationCaseFiveEntry } from './validation-run.ts';

export { TRANSFER_VALIDATION_CASE_FIVE, parseTransferValidationCaseFiveEntry } from './validation-case-five-declaration.ts';
export { preflightTransferValidationCaseFiveRun, runTransferValidationCaseFiveWithHost, createNativeTransferValidationCaseFiveHost, runTransferValidationCaseFiveEntry } from './validation-run.ts';

/** Hard-bound fifth entry; no declaration, host, clock, protocol or input selection through arguments. */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runTransferValidationCaseFiveEntry(process.argv.slice(2), fileURLToPath(new URL('../../', import.meta.url))).then(result => {
    console.log(JSON.stringify(result)); if (result.outcome === 'failed') process.exitCode = 1;
  }).catch(error => { console.error(`COS16 case5 operator validation stopped: ${error instanceof Error ? error.message : 'Admission failed'}`); process.exitCode = 1; });
}
