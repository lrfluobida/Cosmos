import { sameValue } from '../../src/contracts/validation.ts';
import { createFixedTransferCodingOnlyTasks } from './validation-case-six-task.ts';
import { deriveTransferValidationCaseSevenDeclaration } from './validation-case-seven-declaration.ts';
type CodingInput = Parameters<ReturnType<typeof createFixedTransferCodingOnlyTasks>['deriveTransferValidationCaseSixCodingTask']>[0];
export function createFixedSettledCodingTasks(deriveDeclaration: typeof deriveTransferValidationCaseSevenDeclaration, manifestLocation: string) {
function tasks(input: CodingInput) {
  const declaration = deriveDeclaration(input.state);
  if (!sameValue(input.window.quote.declaration, declaration)) throw new Error('Current C7 task differs from its actual settled-cost declaration.');
  return createFixedTransferCodingOnlyTasks(declaration, manifestLocation);
}
function deriveTransferValidationCaseSevenCodingTask(input: CodingInput) {
  return tasks(input).deriveTransferValidationCaseSixCodingTask(input);
}
async function prepareTransferValidationCaseSevenExecution(input: Parameters<ReturnType<typeof createFixedTransferCodingOnlyTasks>['prepareTransferValidationCaseSixExecution']>[0], resume: boolean) {
  return tasks(input).prepareTransferValidationCaseSixExecution(input, resume);
}
return { deriveTransferValidationCaseSevenCodingTask, prepareTransferValidationCaseSevenExecution };
}
export const { deriveTransferValidationCaseSevenCodingTask, prepareTransferValidationCaseSevenExecution }
  = createFixedSettledCodingTasks(deriveTransferValidationCaseSevenDeclaration, 'cos20-transfer-validation-7-reuse.json');
