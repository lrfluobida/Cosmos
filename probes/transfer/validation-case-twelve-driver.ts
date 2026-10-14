import { createFixedSettledCodingDriver } from './validation-case-seven-driver.ts';
import { deriveTransferValidationCaseTwelveDeclaration } from './validation-case-twelve-declaration.ts';
import { createTransferCaseTwelveAdmissionQuote, transferCaseTwelveHistoricalAccountingHash, requireTransferCaseTwelveAccountingSources } from './validation-case-twelve-entry.ts';
import { requireTransferCaseTwelveSource } from './validation-case-twelve-source.ts';
import { prepareTransferValidationCaseTwelveExecution } from './validation-case-twelve-task.ts';
const driver = createFixedSettledCodingDriver({ deriveDeclaration: deriveTransferValidationCaseTwelveDeclaration, manifestLocation: 'cos20-transfer-validation-12-reuse.json',
  admissionQuote: createTransferCaseTwelveAdmissionQuote, accountingHash: transferCaseTwelveHistoricalAccountingHash, requireAccounting: requireTransferCaseTwelveAccountingSources,
  requireSource: requireTransferCaseTwelveSource, prepareExecution: prepareTransferValidationCaseTwelveExecution });
export const bootstrapTransferValidationCaseTwelveToolchain = driver.bootstrapTransferValidationCaseSevenToolchain;
export const stageTransferValidationCaseTwelveInput = driver.stageTransferValidationCaseSevenInput;
export const executeTransferValidationCaseTwelveDag = driver.executeTransferValidationCaseSevenDag;
export const generateTransferValidationCaseTwelve = driver.generateTransferValidationCaseSeven;
