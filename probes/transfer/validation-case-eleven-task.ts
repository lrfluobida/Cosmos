import { createFixedSettledCodingTasks } from './validation-case-seven-task.ts';
import { deriveTransferValidationCaseElevenDeclaration } from './validation-case-eleven-declaration.ts';
const tasks = createFixedSettledCodingTasks(deriveTransferValidationCaseElevenDeclaration, 'cos20-transfer-validation-11-reuse.json');
export const deriveTransferValidationCaseElevenCodingTask = tasks.deriveTransferValidationCaseSevenCodingTask;
export const prepareTransferValidationCaseElevenExecution = tasks.prepareTransferValidationCaseSevenExecution;
