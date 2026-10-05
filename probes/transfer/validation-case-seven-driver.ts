import { sameValue } from '../../src/contracts/validation.ts';
import { regularFile } from '../../src/artifacts/paths.ts';
import { validationHash } from '../../src/runtime/validation-validation.ts';
import type { ValidationHostInput } from '../e2e/validation-run.ts';
import { createFixedTransferCodingOnlyDriver } from './validation-case-six-driver.ts';
import { deriveTransferValidationCaseSevenDeclaration } from './validation-case-seven-declaration.ts';
import { createTransferCaseSevenAdmissionQuote, transferCaseSevenHistoricalAccountingHash, requireTransferCaseSevenAccountingSources } from './validation-case-seven-entry.ts';
import { requireTransferCaseSevenSource } from './validation-case-seven-source.ts';
import { prepareTransferValidationCaseSevenExecution } from './validation-case-seven-task.ts';
async function driver(input: ValidationHostInput) {
  const declaration = deriveTransferValidationCaseSevenDeclaration(await input.controller.read());
  if (!sameValue(input.window.quote.declaration, declaration)) throw new Error('Current C7 driver differs from its actual settled-cost declaration.');
  return createFixedTransferCodingOnlyDriver(declaration, 'cos20-transfer-validation-7-reuse.json', async (current, signal) => {
    signal.throwIfAborted();
    const refs = current.window.operatorDecision.sourceRefs.filter(ref => ref.artifactId === `${declaration.caseId}-admission`), ref = refs[0];
    if (refs.length !== 1 || !ref.location.startsWith(`${declaration.caseId}-admission-`) || !ref.location.endsWith('.json')) throw new Error('Current C7 needs its exact operator-covered admission envelope.');
    const bytes = await regularFile(current.ledgerRoot, ref.location), value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (validationHash(bytes) !== ref.version || !sameValue(value.quote, current.window.quote) || !sameValue(value.roleGrants, declaration.grants)
      || !sameValue(createTransferCaseSevenAdmissionQuote(current.window.quote, value.manifestRef, value.sourceApprovals, value.execution, value.accountingSha256), value)
      || ref.location !== `${declaration.caseId}-admission-${value.admissionId}.json`
      || !current.window.operatorDecision.sourceRefs.some(item => sameValue(item, value.manifestRef))) throw new Error('Current C7 admission envelope, source or historical digest changed.');
    if (!value.execution) throw new Error('Current C7 actual execution source is missing.');
    await requireTransferCaseSevenSource(value.execution, signal);
    const state = await current.controller.read();
    if (!value.accountingSha256 || transferCaseSevenHistoricalAccountingHash(state, current.window.quote) !== value.accountingSha256
      || !sameValue(deriveTransferValidationCaseSevenDeclaration(state), declaration)) throw new Error('Historical settled-cost prefix changed before C7 dispatch.');
    await requireTransferCaseSevenAccountingSources(current.ledgerRoot, state, signal);
  }, prepareTransferValidationCaseSevenExecution, new URL(`../e2e/validation-worker${import.meta.url.endsWith('.js') ? '.js' : '.ts'}`, import.meta.url));
}
export async function bootstrapTransferValidationCaseSevenToolchain(input: ValidationHostInput, ...args: Parameters<ReturnType<typeof createFixedTransferCodingOnlyDriver>['bootstrapTransferValidationCaseSixToolchain']> extends [unknown, ...infer Rest] ? Rest : never) {
  return (await driver(input)).bootstrapTransferValidationCaseSixToolchain(input, ...args);
}
export async function stageTransferValidationCaseSevenInput(...args: Parameters<ReturnType<typeof createFixedTransferCodingOnlyDriver>['stageTransferValidationCaseSixInput']>) {
  return (await driver(args[0])).stageTransferValidationCaseSixInput(...args);
}
export async function executeTransferValidationCaseSevenDag(...args: Parameters<ReturnType<typeof createFixedTransferCodingOnlyDriver>['executeTransferValidationCaseSixDag']>) {
  return (await driver(args[0])).executeTransferValidationCaseSixDag(...args);
}
export async function generateTransferValidationCaseSeven(...args: Parameters<ReturnType<typeof createFixedTransferCodingOnlyDriver>['generateTransferValidationCaseSix']>) {
  return (await driver(args[0])).generateTransferValidationCaseSix(...args);
}
