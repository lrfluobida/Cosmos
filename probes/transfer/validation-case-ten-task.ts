import { createFixedSettledCodingTasks } from './validation-case-seven-task.ts';
import { deriveTransferValidationCaseTenDeclaration } from './validation-case-ten-declaration.ts';
const tasks = createFixedSettledCodingTasks(deriveTransferValidationCaseTenDeclaration, 'cos20-transfer-validation-10-reuse.json');
export const deriveTransferValidationCaseTenCodingTask = tasks.deriveTransferValidationCaseSevenCodingTask;
export const prepareTransferValidationCaseTenExecution = tasks.prepareTransferValidationCaseSevenExecution;
