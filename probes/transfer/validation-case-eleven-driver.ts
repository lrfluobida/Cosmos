import { createFixedSettledCodingDriver } from './validation-case-seven-driver.ts';
import { deriveTransferValidationCaseElevenDeclaration } from './validation-case-eleven-declaration.ts';
import { createTransferCaseElevenAdmissionQuote, transferCaseElevenHistoricalAccountingHash, requireTransferCaseElevenAccountingSources } from './validation-case-eleven-entry.ts';
import { requireTransferCaseElevenSource } from './validation-case-eleven-source.ts';
import { prepareTransferValidationCaseElevenExecution } from './validation-case-eleven-task.ts';
const driver = createFixedSettledCodingDriver({ deriveDeclaration: deriveTransferValidationCaseElevenDeclaration, manifestLocation: 'cos20-transfer-validation-11-reuse.json',
  admissionQuote: createTransferCaseElevenAdmissionQuote, accountingHash: transferCaseElevenHistoricalAccountingHash, requireAccounting: requireTransferCaseElevenAccountingSources,
  requireSource: requireTransferCaseElevenSource, prepareExecution: prepareTransferValidationCaseElevenExecution });
export const bootstrapTransferValidationCaseElevenToolchain = driver.bootstrapTransferValidationCaseSevenToolchain;
export const stageTransferValidationCaseElevenInput = driver.stageTransferValidationCaseSevenInput;
export const executeTransferValidationCaseElevenDag = driver.executeTransferValidationCaseSevenDag;
export const generateTransferValidationCaseEleven = driver.generateTransferValidationCaseSeven;
