import { createFixedSettledCodingDriver } from './validation-case-seven-driver.ts';
import { deriveTransferValidationCaseThirteenDeclaration } from './validation-case-thirteen-declaration.ts';
import { createTransferCaseThirteenAdmissionQuote, transferCaseThirteenHistoricalAccountingHash, requireTransferCaseThirteenAccountingSources } from './validation-case-thirteen-entry.ts';
import { requireTransferCaseThirteenSource } from './validation-case-thirteen-source.ts';
import { prepareTransferValidationCaseThirteenExecution } from './validation-case-thirteen-task.ts';
const driver = createFixedSettledCodingDriver({ deriveDeclaration: deriveTransferValidationCaseThirteenDeclaration, manifestLocation: 'cos20-transfer-validation-13-reuse.json',
  admissionQuote: createTransferCaseThirteenAdmissionQuote, accountingHash: transferCaseThirteenHistoricalAccountingHash, requireAccounting: requireTransferCaseThirteenAccountingSources,
  requireSource: requireTransferCaseThirteenSource, prepareExecution: prepareTransferValidationCaseThirteenExecution });
export const bootstrapTransferValidationCaseThirteenToolchain = driver.bootstrapTransferValidationCaseSevenToolchain;
export const stageTransferValidationCaseThirteenInput = driver.stageTransferValidationCaseSevenInput;
export const executeTransferValidationCaseThirteenDag = driver.executeTransferValidationCaseSevenDag;
export const generateTransferValidationCaseThirteen = driver.generateTransferValidationCaseSeven;
