import { sameValue } from '../../src/contracts/validation.ts';
import { regularFile } from '../../src/artifacts/paths.ts';
import { lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validationHash } from '../../src/runtime/validation-validation.ts';
import type { ValidationHostInput } from '../e2e/validation-run.ts';
import { createFixedTransferCodingOnlyDriver } from './validation-case-six-driver.ts';
import { TRANSFER_VALIDATION_CASE_FIFTEEN as D } from './validation-case-fifteen-declaration.ts';
import { createTransferCaseFifteenAdmissionQuote, transferCaseFifteenHistoricalAccountingHash, requireTransferCaseFifteenAccountingSources } from './validation-case-fifteen-entry.ts';
import { requireTransferCaseFifteenSource } from './validation-case-fifteen-source.ts';
import { requireTransferCaseSevenTemplate, requireTransferCaseSevenToolchain } from './validation-case-seven-source.ts';
import { prepareTransferValidationCaseFifteenExecution } from './validation-case-fifteen-task.ts';

async function requireOwnSource(current: ValidationHostInput, signal: AbortSignal, requireTools = false) {
    const declaration = current.window.quote.declaration;
    signal.throwIfAborted();
    const refs = current.window.operatorDecision.sourceRefs.filter(ref => ref.artifactId === `${declaration.caseId}-admission`), ref = refs[0];
    if (refs.length !== 1 || !ref.location.startsWith(`${declaration.caseId}-admission-`) || !ref.location.endsWith('.json')) throw new Error('Current C15 needs its exact operator-covered admission envelope.');
    const bytes = await regularFile(current.ledgerRoot, ref.location, signal); signal.throwIfAborted();
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (validationHash(bytes) !== ref.version || !sameValue(value.quote, current.window.quote) || !sameValue(value.roleGrants, declaration.grants)
      || !sameValue(createTransferCaseFifteenAdmissionQuote(current.window.quote, value.manifestRef, value.sourceApprovals, value.execution, value.accountingSha256), value)
      || ref.location !== `${declaration.caseId}-admission-${value.admissionId}.json`
      || !current.window.operatorDecision.sourceRefs.some(item => sameValue(item, value.manifestRef))) throw new Error('Current C15 admission envelope, source or historical digest changed.');
    if (!value.execution) throw new Error('Current C15 actual execution source is missing.');
    await requireTransferCaseFifteenSource(value.execution, signal); signal.throwIfAborted();
    await requireTransferCaseSevenTemplate(value.execution, current.repository, signal); signal.throwIfAborted();
    const installed = await lstat(join(current.root, 'toolchain')).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
    signal.throwIfAborted();
    if (requireTools || installed) await requireTransferCaseSevenToolchain(value.execution, current.root, signal);
    signal.throwIfAborted();
    const state = await current.controller.read(signal); signal.throwIfAborted();
    if (!value.accountingSha256 || transferCaseFifteenHistoricalAccountingHash(state, current.window.quote) !== value.accountingSha256
      || !sameValue(D, declaration)) throw new Error('Historical settled-cost prefix changed before C15 dispatch.');
    await requireTransferCaseFifteenAccountingSources(current.ledgerRoot, state, signal); signal.throwIfAborted();
}
async function driver(input: ValidationHostInput) {
  input.signal.throwIfAborted();
  const state = await input.controller.read(input.signal); input.signal.throwIfAborted();
  const declaration = D;
  if (!sameValue(input.window.quote.declaration, declaration) || input.window.caseId !== declaration.caseId
    || resolve(input.root) !== join(resolve(input.repository), '.cosmos/e2e', declaration.caseId)
    || resolve(input.ledgerRoot) !== join(resolve(input.repository), '.cosmos/validation-shared')) throw new Error('Current C15 driver requires its fixed declaration and roots.');
  return createFixedTransferCodingOnlyDriver(declaration, 'cos20-transfer-validation-15-reuse.json', requireOwnSource,
    prepareTransferValidationCaseFifteenExecution, new URL(`../e2e/validation-worker${import.meta.url.endsWith('.js') ? '.js' : '.ts'}`, import.meta.url));
}
export async function bootstrapTransferValidationCaseFifteenToolchain(input: ValidationHostInput, ...args: Parameters<ReturnType<typeof createFixedTransferCodingOnlyDriver>['bootstrapTransferValidationCaseSixToolchain']> extends [unknown, ...infer Rest] ? Rest : never) {
  const current = await driver(input); input.signal.throwIfAborted(); await requireOwnSource(input, input.signal); input.signal.throwIfAborted();
  const result = await current.bootstrapTransferValidationCaseSixToolchain(input, ...args); input.signal.throwIfAborted();
  await requireOwnSource(input, input.signal, true); input.signal.throwIfAborted(); return result;
}
export async function stageTransferValidationCaseFifteenInput(...args: Parameters<ReturnType<typeof createFixedTransferCodingOnlyDriver>['stageTransferValidationCaseSixInput']>) {
  const current = await driver(args[0]); args[0].signal.throwIfAborted();
  await requireOwnSource(args[0], args[0].signal, true); args[0].signal.throwIfAborted(); return current.stageTransferValidationCaseSixInput(...args);
}
export async function executeTransferValidationCaseFifteenDag(...args: Parameters<ReturnType<typeof createFixedTransferCodingOnlyDriver>['executeTransferValidationCaseSixDag']>) {
  const current = await driver(args[0]); args[0].signal.throwIfAborted();
  await requireOwnSource(args[0], args[0].signal, true); args[0].signal.throwIfAborted(); return current.executeTransferValidationCaseSixDag(...args);
}
export async function generateTransferValidationCaseFifteen(...args: Parameters<ReturnType<typeof createFixedTransferCodingOnlyDriver>['generateTransferValidationCaseSix']>) {
  const current = await driver(args[0]); args[0].signal.throwIfAborted(); return current.generateTransferValidationCaseSix(...args);
}
