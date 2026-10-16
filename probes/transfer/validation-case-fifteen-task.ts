import { createFixedTransferCodingOnlyTasks } from './validation-case-six-task.ts';
import { TRANSFER_VALIDATION_CASE_FIFTEEN } from './validation-case-fifteen-declaration.ts';
const tasks = createFixedTransferCodingOnlyTasks(TRANSFER_VALIDATION_CASE_FIFTEEN, 'cos20-transfer-validation-15-reuse.json');
export const deriveTransferValidationCaseFifteenCodingTask = tasks.deriveTransferValidationCaseSixCodingTask;
export const prepareTransferValidationCaseFifteenExecution = tasks.prepareTransferValidationCaseSixExecution;
