import { freeze } from '../../src/roles/requirements.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import { deriveFixedThreeYuanTransferSuccessor, deriveTransferValidationCaseTenDeclaration, parseTransferValidationCaseTenEntry, transferCaseTenHistory } from './validation-case-ten-declaration.ts';
export const TRANSFER_VALIDATION_CASE_ELEVEN_ID = 'cos20-transfer-validation-11';
export function transferCaseElevenHistory(state: RunSnapshot) { return freeze([...transferCaseTenHistory(state), deriveTransferValidationCaseTenDeclaration(state)]); }
export function deriveTransferValidationCaseElevenDeclaration(state: RunSnapshot) {
  return deriveFixedThreeYuanTransferSuccessor(state, transferCaseElevenHistory(state), 'eleven');
}
export function parseTransferValidationCaseElevenEntry(args: string[]) {
  try { return { ...parseTransferValidationCaseTenEntry(args), caseId: TRANSFER_VALIDATION_CASE_ELEVEN_ID }; }
  catch { throw new Error('Usage: probes/transfer/validation-case-eleven-run.ts --validation-preflight <reviewed-main-sha> | --validation-case <reviewed-main-sha> <operator-validation-source>'); }
}
