import { freeze } from '../../src/roles/requirements.ts';
import type { ValidationDeclaration } from '../../src/runtime/validation-types.ts';
import { TRANSFER_VALIDATION_CASE_FIFTEEN } from './validation-case-fifteen-declaration.ts';
import { parseTransferValidationEntry } from './validation-declaration.ts';

export const TRANSFER_VALIDATION_CASE_SIXTEEN_ID = 'cos20-transfer-validation-16';
const caseId = TRANSFER_VALIDATION_CASE_SIXTEEN_ID;
/** Fixed successor identity; the frozen requirements and all budget limits stay unchanged. */
export const TRANSFER_VALIDATION_CASE_SIXTEEN = freeze<ValidationDeclaration>({
  ...structuredClone(TRANSFER_VALIDATION_CASE_FIFTEEN), caseId,
  grants: {
    planning: { taskId: `${caseId}-planning`, amountMicroCny: 2_000_000 },
    design: { taskId: `${caseId}-design`, amountMicroCny: 1_900_000 },
    art: { taskId: `${caseId}-art`, amountMicroCny: 5_700_000 },
    coding: { taskId: `${caseId}-coding`, amountMicroCny: 7_600_000 },
    repair: { taskId: `${caseId}-repair`, amountMicroCny: 3_800_000 },
  },
});
export function parseTransferValidationCaseSixteenEntry(args: string[]) {
  try { return { ...parseTransferValidationEntry(args), caseId }; }
  catch { throw new Error('Usage: probes/transfer/validation-case-sixteen-run.ts --validation-preflight <reviewed-main-sha> | --validation-case <reviewed-main-sha> <operator-validation-source>'); }
}
