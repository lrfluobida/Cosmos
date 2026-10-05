import { freeze } from '../../src/roles/requirements.ts';
import { createFixedTransferValidationCaseSixEntry } from './validation-case-six-entry.ts';
import type { HistoricalCaseSixSourcePins } from './validation-case-six-entry.ts';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export { TRANSFER_VALIDATION_CASE_SIX, parseTransferValidationCaseSixEntry } from './validation-case-six-declaration.ts';
/** Exact original Root history; declaration metadata supplements actual source-byte authentication. */
export const TRANSFER_CASE_SIX_HISTORICAL_SOURCE = freeze<HistoricalCaseSixSourcePins>({
  reviewedPlatformSha: '9e7f7718db048fc44301564396bd4d4457465550',
  windowId: 'validation-vq2-feb154cfb057113bbf4df26224e1616c6b13f7e94ec51438f7eb543f4fe5f971',
  parentAllocation: { index: 4, taskId: 'COS-16', amountMicroCny: 10_000_000,
    sha256: '48501ec1263c612a844d9069ad86c4d3f6098de66e79443e91b830368514253d',
    source: { artifactId: 'original-COS-16-allocation', version: 'revision-1414', location: 'snapshot.json#ledger/allocations/4' } },
  authorizationDecisionId: 'operator-933e62b3-489e-4189-bbe3-4f691f1fee22',
});
export const { preflightTransferValidationCaseSixRun, runTransferValidationCaseSixWithHost, createNativeTransferValidationCaseSixHost, runTransferValidationCaseSixEntry }
  = createFixedTransferValidationCaseSixEntry(TRANSFER_CASE_SIX_HISTORICAL_SOURCE);
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runTransferValidationCaseSixEntry(process.argv.slice(2), fileURLToPath(new URL('../../', import.meta.url))).then(result => {
    console.log(JSON.stringify(result)); if (result.outcome === 'failed') process.exitCode = 1;
  }).catch(error => { console.error(`COS16 coding-only validation stopped: ${error instanceof Error ? error.message : 'Admission failed'}`); process.exitCode = 1; });
}
