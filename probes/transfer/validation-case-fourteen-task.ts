import { createFixedSettledCodingTasks } from './validation-case-seven-task.ts';
import { deriveTransferValidationCaseFourteenDeclaration } from './validation-case-fourteen-declaration.ts';
const tasks = createFixedSettledCodingTasks(deriveTransferValidationCaseFourteenDeclaration, 'cos20-transfer-validation-14-reuse.json');
export const deriveTransferValidationCaseFourteenCodingTask = tasks.deriveTransferValidationCaseSevenCodingTask;
export const prepareTransferValidationCaseFourteenExecution = tasks.prepareTransferValidationCaseSevenExecution;
