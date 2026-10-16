import { createFixedTransferCodingOnlyTasks } from './validation-case-six-task.ts';
import { TRANSFER_VALIDATION_CASE_SIXTEEN } from './validation-case-sixteen-declaration.ts';
const tasks = createFixedTransferCodingOnlyTasks(TRANSFER_VALIDATION_CASE_SIXTEEN, 'cos20-transfer-validation-16-reuse.json');
export const deriveTransferValidationCaseSixteenCodingTask = tasks.deriveTransferValidationCaseSixCodingTask;
export const prepareTransferValidationCaseSixteenExecution = tasks.prepareTransferValidationCaseSixExecution;
