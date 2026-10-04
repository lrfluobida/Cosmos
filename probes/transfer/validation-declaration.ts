import { freeze } from '../../src/roles/requirements.ts';
import type { ValidationDeclaration } from '../../src/runtime/validation-types.ts';
import { VALIDATION_CASE } from '../e2e/validation-declaration.ts';

const caseId = 'cos20-transfer-validation-1';
/** Source-reviewed data only; neither import nor argument parsing activates a case. */
export const TRANSFER_VALIDATION_CASE = freeze<ValidationDeclaration>({
  formatVersion: 'validation-declaration-3', profile: 'operator_validation', caseId, sourceModel: 'deepseek-flash',
  budgetGroup: { parentTaskId: 'COS-16', allocationMicroCny: 10_000_000 },
  limits: { lifetimeMicroCny: 150_000_000, cumulativeMicroCny: 30_000_000, incrementalMicroCny: 5_000_000,
    durationMs: 45 * 60 * 1000, maxRequests: 80, maxRepairTasks: 1, maxTaskAttempts: 2, reviewProtocolCorrections: 1 },
  grants: {
    planning: { taskId: `${caseId}-planning`, amountMicroCny: 400_000 },
    design: { taskId: `${caseId}-design`, amountMicroCny: 1_200_000 },
    art: { taskId: `${caseId}-art`, amountMicroCny: 2_800_000 },
    coding: { taskId: `${caseId}-coding`, amountMicroCny: 2_800_000 },
    repair: { taskId: `${caseId}-repair`, amountMicroCny: 2_800_000 },
  },
  outputTokens: { ...VALIDATION_CASE.outputTokens },
  inputs: {
    requirements: { version: 'cos16-transfer-v1', path: 'probes/transfer/requirements.json', sha256: '65a2a760a918fe6d8c3046b64eaf5bd5d5d8c3dc4c48f00d481a25e943015acd' },
    template: structuredClone(VALIDATION_CASE.inputs.template),
  },
});
export function parseTransferValidationEntry(args: string[]) {
  const [command, reviewedPlatformSha, operatorSource] = args, preflightOnly = command === '--validation-preflight';
  if (!['--validation-preflight', '--validation-case'].includes(command) || !/^[a-f0-9]{40}$/.test(reviewedPlatformSha ?? '')
    || (preflightOnly ? args.length !== 2 : args.length !== 3 || !operatorSource?.trim() || operatorSource.length > 2000 || /[\x00-\x1f\x7f]/.test(operatorSource))) {
    throw new Error('Usage: probes/transfer/validation-run.ts --validation-preflight <reviewed-main-sha> | --validation-case <reviewed-main-sha> <operator-validation-source>');
  }
  return { caseId, reviewedPlatformSha, preflightOnly, operatorSource: preflightOnly ? null : operatorSource, intentOnly: true as const };
}
