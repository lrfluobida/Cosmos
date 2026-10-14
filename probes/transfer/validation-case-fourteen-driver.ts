import { createFixedSettledCodingDriver } from './validation-case-seven-driver.ts';
import { deriveTransferValidationCaseFourteenDeclaration } from './validation-case-fourteen-declaration.ts';
import { createTransferCaseFourteenAdmissionQuote, transferCaseFourteenHistoricalAccountingHash, requireTransferCaseFourteenAccountingSources } from './validation-case-fourteen-entry.ts';
import { requireTransferCaseFourteenSource } from './validation-case-fourteen-source.ts';
import { prepareTransferValidationCaseFourteenExecution } from './validation-case-fourteen-task.ts';
const driver = createFixedSettledCodingDriver({ deriveDeclaration: deriveTransferValidationCaseFourteenDeclaration, manifestLocation: 'cos20-transfer-validation-14-reuse.json',
  admissionQuote: createTransferCaseFourteenAdmissionQuote, accountingHash: transferCaseFourteenHistoricalAccountingHash, requireAccounting: requireTransferCaseFourteenAccountingSources,
  requireSource: requireTransferCaseFourteenSource, prepareExecution: prepareTransferValidationCaseFourteenExecution });
export const bootstrapTransferValidationCaseFourteenToolchain = driver.bootstrapTransferValidationCaseSevenToolchain;
export const stageTransferValidationCaseFourteenInput = driver.stageTransferValidationCaseSevenInput;
export const executeTransferValidationCaseFourteenDag = driver.executeTransferValidationCaseSevenDag;
export const generateTransferValidationCaseFourteen = driver.generateTransferValidationCaseSeven;
