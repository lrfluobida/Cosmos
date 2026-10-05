import { freeze } from '../../src/roles/requirements.ts';
import type { ValidationDeclaration } from '../../src/runtime/validation-types.ts';
import { TRANSFER_VALIDATION_CASE, parseTransferValidationEntry } from './validation-declaration.ts';

const caseId = 'cos20-transfer-validation-6';
/** Fixed positive remaining original COS16 capacity; historical stages consume no new SDK calls. */
export const TRANSFER_VALIDATION_CASE_SIX = freeze<ValidationDeclaration>({
  ...structuredClone(TRANSFER_VALIDATION_CASE), caseId,
  grants: {
    planning: { taskId: `${caseId}-planning`, amountMicroCny: 323_680 },
    design: { taskId: `${caseId}-design`, amountMicroCny: 598_538 },
    art: { taskId: `${caseId}-art`, amountMicroCny: 2_633_322 },
    coding: { taskId: `${caseId}-coding`, amountMicroCny: 2_122_353 },
    repair: { taskId: `${caseId}-repair`, amountMicroCny: 2_800_000 },
  },
});
export function parseTransferValidationCaseSixEntry(args: string[]) {
  try { return { ...parseTransferValidationEntry(args), caseId }; }
  catch { throw new Error('Usage: probes/transfer/validation-case-six-run.ts --validation-preflight <reviewed-main-sha> | --validation-case <reviewed-main-sha> <operator-validation-source>'); }
}
