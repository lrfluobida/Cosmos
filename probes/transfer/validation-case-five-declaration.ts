import { freeze } from '../../src/roles/requirements.ts';
import type { ValidationDeclaration } from '../../src/runtime/validation-types.ts';
import { TRANSFER_VALIDATION_CASE, parseTransferValidationEntry } from './validation-declaration.ts';

const caseId = 'cos20-transfer-validation-5';
/** Fixed original COS16 role capacity after the four stopped migration cases. */
export const TRANSFER_VALIDATION_CASE_FIVE = freeze<ValidationDeclaration>({
  ...structuredClone(TRANSFER_VALIDATION_CASE), caseId,
  grants: {
    planning: { taskId: `${caseId}-planning`, amountMicroCny: 340_618 },
    design: { taskId: `${caseId}-design`, amountMicroCny: 854_278 },
    art: { taskId: `${caseId}-art`, amountMicroCny: 2_800_000 },
    coding: { taskId: `${caseId}-coding`, amountMicroCny: 2_800_000 },
    repair: { taskId: `${caseId}-repair`, amountMicroCny: 2_800_000 },
  },
});
export function parseTransferValidationCaseFiveEntry(args: string[]) {
  try { return { ...parseTransferValidationEntry(args), caseId }; }
  catch { throw new Error('Usage: probes/transfer/validation-case-five-run.ts --validation-preflight <reviewed-main-sha> | --validation-case <reviewed-main-sha> <operator-validation-source>'); }
}
