import { createFixedSettledCodingDriver } from './validation-case-seven-driver.ts';
import { deriveTransferValidationCaseNineDeclaration } from './validation-case-nine-declaration.ts';
import { createTransferCaseNineAdmissionQuote, transferCaseNineHistoricalAccountingHash, requireTransferCaseNineAccountingSources } from './validation-case-nine-entry.ts';
import { requireTransferCaseNineSource } from './validation-case-nine-source.ts';
import { prepareTransferValidationCaseNineExecution } from './validation-case-nine-task.ts';
const driver = createFixedSettledCodingDriver({ deriveDeclaration: deriveTransferValidationCaseNineDeclaration, manifestLocation: 'cos20-transfer-validation-9-reuse.json',
  admissionQuote: createTransferCaseNineAdmissionQuote, accountingHash: transferCaseNineHistoricalAccountingHash, requireAccounting: requireTransferCaseNineAccountingSources,
  requireSource: requireTransferCaseNineSource, prepareExecution: prepareTransferValidationCaseNineExecution });
export const bootstrapTransferValidationCaseNineToolchain = driver.bootstrapTransferValidationCaseSevenToolchain;
export const stageTransferValidationCaseNineInput = driver.stageTransferValidationCaseSevenInput;
export const executeTransferValidationCaseNineDag = driver.executeTransferValidationCaseSevenDag;
export const generateTransferValidationCaseNine = driver.generateTransferValidationCaseSeven;
