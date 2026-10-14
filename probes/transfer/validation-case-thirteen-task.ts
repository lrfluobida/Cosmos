import { createFixedSettledCodingTasks } from './validation-case-seven-task.ts';
import { deriveTransferValidationCaseThirteenDeclaration } from './validation-case-thirteen-declaration.ts';
const tasks = createFixedSettledCodingTasks(deriveTransferValidationCaseThirteenDeclaration, 'cos20-transfer-validation-13-reuse.json');
export const deriveTransferValidationCaseThirteenCodingTask = tasks.deriveTransferValidationCaseSevenCodingTask;
export const prepareTransferValidationCaseThirteenExecution = tasks.prepareTransferValidationCaseSevenExecution;
