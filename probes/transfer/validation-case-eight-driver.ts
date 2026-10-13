import { createFixedSettledCodingDriver } from './validation-case-seven-driver.ts';
import { deriveTransferValidationCaseEightDeclaration } from './validation-case-eight-declaration.ts';
import { createTransferCaseEightAdmissionQuote, transferCaseEightHistoricalAccountingHash, requireTransferCaseEightAccountingSources } from './validation-case-eight-entry.ts';
import { requireTransferCaseEightSource } from './validation-case-eight-source.ts';
import { prepareTransferValidationCaseEightExecution } from './validation-case-eight-task.ts';
const driver = createFixedSettledCodingDriver({ deriveDeclaration: deriveTransferValidationCaseEightDeclaration, manifestLocation: 'cos20-transfer-validation-8-reuse.json',
  admissionQuote: createTransferCaseEightAdmissionQuote, accountingHash: transferCaseEightHistoricalAccountingHash, requireAccounting: requireTransferCaseEightAccountingSources,
  requireSource: requireTransferCaseEightSource, prepareExecution: prepareTransferValidationCaseEightExecution });
export const bootstrapTransferValidationCaseEightToolchain = driver.bootstrapTransferValidationCaseSevenToolchain;
export const stageTransferValidationCaseEightInput = driver.stageTransferValidationCaseSevenInput;
export const executeTransferValidationCaseEightDag = driver.executeTransferValidationCaseSevenDag;
export const generateTransferValidationCaseEight = driver.generateTransferValidationCaseSeven;
