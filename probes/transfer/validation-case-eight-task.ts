import { createFixedSettledCodingTasks } from './validation-case-seven-task.ts';
import { deriveTransferValidationCaseEightDeclaration } from './validation-case-eight-declaration.ts';
const tasks = createFixedSettledCodingTasks(deriveTransferValidationCaseEightDeclaration, 'cos20-transfer-validation-8-reuse.json');
export const deriveTransferValidationCaseEightCodingTask = tasks.deriveTransferValidationCaseSevenCodingTask;
export const prepareTransferValidationCaseEightExecution = tasks.prepareTransferValidationCaseSevenExecution;
