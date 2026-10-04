import { freeze } from '../../src/roles/requirements.ts';
import type { ValidationDeclaration } from '../../src/runtime/validation-types.ts';
import { TRANSFER_VALIDATION_CASE, parseTransferValidationEntry } from './validation-declaration.ts';

const caseId = 'cos20-transfer-validation-2';
/** Fixed remaining original COS16 capacity after case1's 14102 microCNY charge. */
export const TRANSFER_VALIDATION_CASE_TWO = freeze<ValidationDeclaration>({
  ...structuredClone(TRANSFER_VALIDATION_CASE), caseId,
  grants: {
    planning: { taskId: `${caseId}-planning`, amountMicroCny: 385_898 },
    design: { taskId: `${caseId}-design`, amountMicroCny: 1_200_000 },
    art: { taskId: `${caseId}-art`, amountMicroCny: 2_800_000 },
    coding: { taskId: `${caseId}-coding`, amountMicroCny: 2_800_000 },
    repair: { taskId: `${caseId}-repair`, amountMicroCny: 2_800_000 },
  },
});
export function parseTransferValidationCaseTwoEntry(args: string[]) {
  try { return { ...parseTransferValidationEntry(args), caseId }; }
  catch { throw new Error('Usage: probes/transfer/validation-case-two-run.ts --validation-preflight <reviewed-main-sha> | --validation-case <reviewed-main-sha> <operator-validation-source>'); }
}
