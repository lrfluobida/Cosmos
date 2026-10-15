import { sameValue } from '../../src/contracts/validation.ts';
import { regularFile } from '../../src/artifacts/paths.ts';
import { lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validationHash } from '../../src/runtime/validation-validation.ts';
import type { ValidationHostInput } from '../e2e/validation-run.ts';
import { createFixedTransferCodingOnlyDriver } from './validation-case-six-driver.ts';
import { deriveTransferValidationCaseSevenDeclaration } from './validation-case-seven-declaration.ts';
import { createTransferCaseSevenAdmissionQuote, transferCaseSevenHistoricalAccountingHash, requireTransferCaseSevenAccountingSources } from './validation-case-seven-entry.ts';
import { requireTransferCaseSevenSource, requireTransferCaseSevenTemplate, requireTransferCaseSevenToolchain } from './validation-case-seven-source.ts';
import { prepareTransferValidationCaseSevenExecution } from './validation-case-seven-task.ts';
interface FixedSettledCodingDriverConfiguration {
  deriveDeclaration: typeof deriveTransferValidationCaseSevenDeclaration; manifestLocation: string;
  admissionQuote: typeof createTransferCaseSevenAdmissionQuote; accountingHash: typeof transferCaseSevenHistoricalAccountingHash;
  requireAccounting: typeof requireTransferCaseSevenAccountingSources; requireSource: typeof requireTransferCaseSevenSource;
  prepareExecution: typeof prepareTransferValidationCaseSevenExecution;
}
export function createFixedSettledCodingDriver(configuration: FixedSettledCodingDriverConfiguration) {
async function requireOwnSource(current: ValidationHostInput, signal: AbortSignal, requireTools = false) {
    const declaration = current.window.quote.declaration;
    signal.throwIfAborted();
    const refs = current.window.operatorDecision.sourceRefs.filter(ref => ref.artifactId === `${declaration.caseId}-admission`), ref = refs[0];
    if (refs.length !== 1 || !ref.location.startsWith(`${declaration.caseId}-admission-`) || !ref.location.endsWith('.json')) throw new Error('Current C7 needs its exact operator-covered admission envelope.');
    const bytes = await regularFile(current.ledgerRoot, ref.location, signal); signal.throwIfAborted();
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (validationHash(bytes) !== ref.version || !sameValue(value.quote, current.window.quote) || !sameValue(value.roleGrants, declaration.grants)
      || !sameValue(configuration.admissionQuote(current.window.quote, value.manifestRef, value.sourceApprovals, value.execution, value.accountingSha256), value)
      || ref.location !== `${declaration.caseId}-admission-${value.admissionId}.json`
      || !current.window.operatorDecision.sourceRefs.some(item => sameValue(item, value.manifestRef))) throw new Error('Current C7 admission envelope, source or historical digest changed.');
    if (!value.execution) throw new Error('Current C7 actual execution source is missing.');
    await configuration.requireSource(value.execution, signal); signal.throwIfAborted();
    await requireTransferCaseSevenTemplate(value.execution, current.repository, signal); signal.throwIfAborted();
    const installed = await lstat(join(current.root, 'toolchain')).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
    signal.throwIfAborted();
    if (requireTools || installed) await requireTransferCaseSevenToolchain(value.execution, current.root, signal);
    signal.throwIfAborted();
    const state = await current.controller.read(signal); signal.throwIfAborted();
    if (!value.accountingSha256 || configuration.accountingHash(state, current.window.quote) !== value.accountingSha256
      || !sameValue(configuration.deriveDeclaration(state), declaration)) throw new Error('Historical settled-cost prefix changed before C7 dispatch.');
    await configuration.requireAccounting(current.ledgerRoot, state, signal); signal.throwIfAborted();
}
async function driver(input: ValidationHostInput) {
  input.signal.throwIfAborted();
  const state = await input.controller.read(input.signal); input.signal.throwIfAborted();
  const declaration = configuration.deriveDeclaration(state);
  if (!sameValue(input.window.quote.declaration, declaration) || input.window.caseId !== declaration.caseId
    || resolve(input.root) !== join(resolve(input.repository), '.cosmos/e2e', declaration.caseId)
    || resolve(input.ledgerRoot) !== join(resolve(input.repository), '.cosmos/validation-shared')) throw new Error('Current C7 driver requires its fixed declaration and roots.');
  return createFixedTransferCodingOnlyDriver(declaration, configuration.manifestLocation, requireOwnSource,
    configuration.prepareExecution, new URL(`../e2e/validation-worker${import.meta.url.endsWith('.js') ? '.js' : '.ts'}`, import.meta.url));
}
async function bootstrapTransferValidationCaseSevenToolchain(input: ValidationHostInput, ...args: Parameters<ReturnType<typeof createFixedTransferCodingOnlyDriver>['bootstrapTransferValidationCaseSixToolchain']> extends [unknown, ...infer Rest] ? Rest : never) {
  const current = await driver(input); input.signal.throwIfAborted(); await requireOwnSource(input, input.signal); input.signal.throwIfAborted();
  const result = await current.bootstrapTransferValidationCaseSixToolchain(input, ...args); input.signal.throwIfAborted();
  await requireOwnSource(input, input.signal, true); input.signal.throwIfAborted(); return result;
}
async function stageTransferValidationCaseSevenInput(...args: Parameters<ReturnType<typeof createFixedTransferCodingOnlyDriver>['stageTransferValidationCaseSixInput']>) {
  const current = await driver(args[0]); args[0].signal.throwIfAborted();
  await requireOwnSource(args[0], args[0].signal, true); args[0].signal.throwIfAborted(); return current.stageTransferValidationCaseSixInput(...args);
}
async function executeTransferValidationCaseSevenDag(...args: Parameters<ReturnType<typeof createFixedTransferCodingOnlyDriver>['executeTransferValidationCaseSixDag']>) {
  const current = await driver(args[0]); args[0].signal.throwIfAborted();
  await requireOwnSource(args[0], args[0].signal, true); args[0].signal.throwIfAborted(); return current.executeTransferValidationCaseSixDag(...args);
}
async function generateTransferValidationCaseSeven(...args: Parameters<ReturnType<typeof createFixedTransferCodingOnlyDriver>['generateTransferValidationCaseSix']>) {
  const current = await driver(args[0]); args[0].signal.throwIfAborted(); return current.generateTransferValidationCaseSix(...args);
}
return { bootstrapTransferValidationCaseSevenToolchain, stageTransferValidationCaseSevenInput, executeTransferValidationCaseSevenDag, generateTransferValidationCaseSeven };
}
export const { bootstrapTransferValidationCaseSevenToolchain, stageTransferValidationCaseSevenInput, executeTransferValidationCaseSevenDag, generateTransferValidationCaseSeven }
  = createFixedSettledCodingDriver({ deriveDeclaration: deriveTransferValidationCaseSevenDeclaration, manifestLocation: 'cos20-transfer-validation-7-reuse.json',
    admissionQuote: createTransferCaseSevenAdmissionQuote, accountingHash: transferCaseSevenHistoricalAccountingHash, requireAccounting: requireTransferCaseSevenAccountingSources,
    requireSource: requireTransferCaseSevenSource, prepareExecution: prepareTransferValidationCaseSevenExecution });
