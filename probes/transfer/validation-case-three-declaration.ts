import { freeze } from '../../src/roles/requirements.ts';
import type { ValidationDeclaration } from '../../src/runtime/validation-types.ts';
import { TRANSFER_VALIDATION_CASE, parseTransferValidationEntry } from './validation-declaration.ts';

const caseId = 'cos20-transfer-validation-3';
/** Fixed original COS16 role capacity after case1 planning and case2 planning/design charges. */
export const TRANSFER_VALIDATION_CASE_THREE = freeze<ValidationDeclaration>({
  ...structuredClone(TRANSFER_VALIDATION_CASE), caseId,
  grants: {
    planning: { taskId: `${caseId}-planning`, amountMicroCny: 369_692 },
    design: { taskId: `${caseId}-design`, amountMicroCny: 1_054_678 },
    art: { taskId: `${caseId}-art`, amountMicroCny: 2_800_000 },
    coding: { taskId: `${caseId}-coding`, amountMicroCny: 2_800_000 },
    repair: { taskId: `${caseId}-repair`, amountMicroCny: 2_800_000 },
  },
});
export function parseTransferValidationCaseThreeEntry(args: string[]) {
  try { return { ...parseTransferValidationEntry(args), caseId }; }
  catch { throw new Error('Usage: probes/transfer/validation-case-three-run.ts --validation-preflight <reviewed-main-sha> | --validation-case <reviewed-main-sha> <operator-validation-source>'); }
}
