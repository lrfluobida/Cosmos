import { createFixedSettledCodingTasks } from './validation-case-seven-task.ts';
import { deriveTransferValidationCaseTwelveDeclaration } from './validation-case-twelve-declaration.ts';
const tasks = createFixedSettledCodingTasks(deriveTransferValidationCaseTwelveDeclaration, 'cos20-transfer-validation-12-reuse.json');
export const deriveTransferValidationCaseTwelveCodingTask = tasks.deriveTransferValidationCaseSevenCodingTask;
export const prepareTransferValidationCaseTwelveExecution = tasks.prepareTransferValidationCaseSevenExecution;
