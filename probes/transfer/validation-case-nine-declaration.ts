import { freeze } from '../../src/roles/requirements.ts';
import type { RunSnapshot } from '../../src/runtime/run-types.ts';
import { deriveFixedSettledCodingSuccessor, deriveTransferValidationCaseEightDeclaration, parseTransferValidationCaseEightEntry, transferCaseEightHistory } from './validation-case-eight-declaration.ts';
export const TRANSFER_VALIDATION_CASE_NINE_ID = 'cos20-transfer-validation-9';
export function transferCaseNineHistory(state: RunSnapshot) { return freeze([...transferCaseEightHistory(state), deriveTransferValidationCaseEightDeclaration(state)]); }
export function deriveTransferValidationCaseNineDeclaration(state: RunSnapshot) {
  const history = transferCaseNineHistory(state), declaration = deriveFixedSettledCodingSuccessor(state, history, TRANSFER_VALIDATION_CASE_NINE_ID, 14);
  if (state.validation!.cases.find(window => window.caseId === history.at(-1)!.caseId)!.repair !== null) throw new Error('Case9 requires original C8 with no repair claim.');
  return declaration;
}
export function parseTransferValidationCaseNineEntry(args: string[]) {
  try { return { ...parseTransferValidationCaseEightEntry(args), caseId: TRANSFER_VALIDATION_CASE_NINE_ID }; }
  catch { throw new Error('Usage: probes/transfer/validation-case-nine-run.ts --validation-preflight <reviewed-main-sha> | --validation-case <reviewed-main-sha> <operator-validation-source>'); }
}
