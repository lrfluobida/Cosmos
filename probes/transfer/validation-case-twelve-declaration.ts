import { freeze } from '../../src/roles/requirements.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import { deriveFixedThreeYuanTransferSuccessor } from './validation-case-ten-declaration.ts';
import { deriveTransferValidationCaseElevenDeclaration, parseTransferValidationCaseElevenEntry, transferCaseElevenHistory } from './validation-case-eleven-declaration.ts';
export const TRANSFER_VALIDATION_CASE_TWELVE_ID = 'cos20-transfer-validation-12';
export function transferCaseTwelveHistory(state: RunSnapshot) { return freeze([...transferCaseElevenHistory(state), deriveTransferValidationCaseElevenDeclaration(state)]); }
export function deriveTransferValidationCaseTwelveDeclaration(state: RunSnapshot) {
  return deriveFixedThreeYuanTransferSuccessor(state, transferCaseTwelveHistory(state), 'twelve');
}
export function parseTransferValidationCaseTwelveEntry(args: string[]) {
  try { return { ...parseTransferValidationCaseElevenEntry(args), caseId: TRANSFER_VALIDATION_CASE_TWELVE_ID }; }
  catch { throw new Error('Usage: probes/transfer/validation-case-twelve-run.ts --validation-preflight <reviewed-main-sha> | --validation-case <reviewed-main-sha> <operator-validation-source>'); }
}
