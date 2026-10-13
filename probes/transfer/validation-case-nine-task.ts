import { createFixedSettledCodingTasks } from './validation-case-seven-task.ts';
import { deriveTransferValidationCaseNineDeclaration } from './validation-case-nine-declaration.ts';
const tasks = createFixedSettledCodingTasks(deriveTransferValidationCaseNineDeclaration, 'cos20-transfer-validation-9-reuse.json');
export const deriveTransferValidationCaseNineCodingTask = tasks.deriveTransferValidationCaseSevenCodingTask;
export const prepareTransferValidationCaseNineExecution = tasks.prepareTransferValidationCaseSevenExecution;
