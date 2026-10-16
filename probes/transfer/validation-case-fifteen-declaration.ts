import { freeze } from '../../src/roles/requirements.ts';
import type { ValidationDeclaration } from '../../src/runtime/validation-types.ts';
import { VALIDATION_CASE } from '../e2e/validation-declaration.ts';
import { parseTransferValidationEntry } from './validation-declaration.ts';

export const TRANSFER_VALIDATION_CASE_FIFTEEN_ID = 'cos20-transfer-validation-15';
const caseId = TRANSFER_VALIDATION_CASE_FIFTEEN_ID;
/** Fixed shared-unallocated admission; importing this data grants no execution authority. */
export const TRANSFER_VALIDATION_CASE_FIFTEEN = freeze<ValidationDeclaration>({
  formatVersion: 'validation-declaration-2', profile: 'operator_validation', caseId, sourceModel: 'deepseek-flash',
  limits: { lifetimeMicroCny: 150_000_000, cumulativeMicroCny: 30_000_000, incrementalMicroCny: 5_000_000,
    durationMs: 5_400_000, maxRequests: 80, maxRepairTasks: 1, maxTaskAttempts: 2, reviewProtocolCorrections: 1 },
  grants: {
    planning: { taskId: `${caseId}-planning`, amountMicroCny: 2_000_000 },
    design: { taskId: `${caseId}-design`, amountMicroCny: 1_900_000 },
    art: { taskId: `${caseId}-art`, amountMicroCny: 5_700_000 },
    coding: { taskId: `${caseId}-coding`, amountMicroCny: 7_600_000 },
    repair: { taskId: `${caseId}-repair`, amountMicroCny: 3_800_000 },
  },
  outputTokens: { ...VALIDATION_CASE.outputTokens },
  inputs: {
    requirements: { version: 'cos16-transfer-v1', path: 'probes/transfer/requirements-case-fifteen.json', sha256: 'fa55cc277747ece5e76cdcffb7112ad6ed0c3f79ecdcb0f95afa407a6dcee6ed' },
    template: structuredClone(VALIDATION_CASE.inputs.template),
  },
});
export function parseTransferValidationCaseFifteenEntry(args: string[]) {
  try { return { ...parseTransferValidationEntry(args), caseId }; }
  catch { throw new Error('Usage: probes/transfer/validation-case-fifteen-run.ts --validation-preflight <reviewed-main-sha> | --validation-case <reviewed-main-sha> <operator-validation-source>'); }
}
