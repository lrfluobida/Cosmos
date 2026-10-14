import { createFixedSettledCodingDriver } from './validation-case-seven-driver.ts';
import { deriveTransferValidationCaseTenDeclaration } from './validation-case-ten-declaration.ts';
import { createTransferCaseTenAdmissionQuote, transferCaseTenHistoricalAccountingHash, requireTransferCaseTenAccountingSources } from './validation-case-ten-entry.ts';
import { requireTransferCaseTenSource } from './validation-case-ten-source.ts';
import { prepareTransferValidationCaseTenExecution } from './validation-case-ten-task.ts';
const driver = createFixedSettledCodingDriver({ deriveDeclaration: deriveTransferValidationCaseTenDeclaration, manifestLocation: 'cos20-transfer-validation-10-reuse.json',
  admissionQuote: createTransferCaseTenAdmissionQuote, accountingHash: transferCaseTenHistoricalAccountingHash, requireAccounting: requireTransferCaseTenAccountingSources,
  requireSource: requireTransferCaseTenSource, prepareExecution: prepareTransferValidationCaseTenExecution });
export const bootstrapTransferValidationCaseTenToolchain = driver.bootstrapTransferValidationCaseSevenToolchain;
export const stageTransferValidationCaseTenInput = driver.stageTransferValidationCaseSevenInput;
export const executeTransferValidationCaseTenDag = driver.executeTransferValidationCaseSevenDag;
export const generateTransferValidationCaseTen = driver.generateTransferValidationCaseSeven;
