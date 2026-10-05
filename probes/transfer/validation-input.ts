import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { regularFile, safePath } from '../../src/artifacts/paths.ts';
import { sameValue } from '../../src/contracts/validation.ts';
import { HOST_STAGE_ACCEPTANCE, freeze } from '../../src/roles/requirements.ts';
import type { ValidationPreparationProposal } from '../../src/runtime/entrypoint-validation.ts';
import { createReviewedValidationIdentityReader } from '../e2e/validation-identity.ts';
import { TRANSFER_ACCEPTANCE_IDS } from './design.ts';
import { TRANSFER_VALIDATION_CASE } from './validation-declaration.ts';
import { TRANSFER_VALIDATION_CASE_TWO } from './validation-case-two-declaration.ts';
import { TRANSFER_VALIDATION_CASE_THREE } from './validation-case-three-declaration.ts';
import { TRANSFER_VALIDATION_CASE_FOUR } from './validation-case-four-declaration.ts';
import { TRANSFER_VALIDATION_CASE_FIVE } from './validation-case-five-declaration.ts';
import { TRANSFER_VALIDATION_CASE_SIX } from './validation-case-six-declaration.ts';

interface TransferRequirements {
  requirementVersion: string; specVersion: string; scope: string;
  budgetGroup: { parentTaskId: 'COS-16'; allocationMicroCny: 10_000_000 };
  acceptanceIds: string[]; stageAcceptanceIds: string[]; preparation: ValidationPreparationProposal;
}
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
function fixedInput(declaration: typeof TRANSFER_VALIDATION_CASE) {
/** Only fixed tracked repository inputs. No snapshots, sessions or credentials. */
async function readTransferValidationInput(repository: string) {
  const root = resolve(repository), expected = declaration.inputs, actual: string[] = [];
  async function visit(folder: string): Promise<void> {
    for (const entry of await readdir(await safePath(root, folder), { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const path = `${folder}/${entry.name}`; await safePath(root, path);
      if (entry.isDirectory()) await visit(path); else actual.push(path);
    }
  }
  await visit('templates/2d');
  if (!sameValue(actual.sort(), expected.template.files.map(file => file.path).sort())) throw new Error('Fixed transfer template file set changed.');
  let requirement: Buffer | undefined;
  for (const file of [expected.requirements, ...expected.template.files]) {
    const bytes = await regularFile(root, file.path); new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (hash(bytes) !== file.sha256) throw new Error(`Fixed transfer input changed: ${file.path}`);
    if (file.path === expected.requirements.path) requirement = bytes;
  }
  if (hash(JSON.stringify(expected.template.files)) !== expected.template.sha256) throw new Error('Fixed transfer template declaration changed.');
  const requirements = JSON.parse(requirement!.toString('utf8')) as TransferRequirements;
  if (requirements.requirementVersion !== expected.requirements.version || requirements.specVersion !== '1.0'
    || !sameValue(requirements.acceptanceIds, TRANSFER_ACCEPTANCE_IDS)
    || !sameValue(requirements.stageAcceptanceIds, HOST_STAGE_ACCEPTANCE.map(item => item.acceptanceId))
    || !sameValue(requirements.budgetGroup, declaration.budgetGroup)
    || requirements.preparation.profile !== 'operator_validation' || requirements.preparation.adapterId !== 'cos16-input/1'
    || !sameValue(requirements.preparation.acceptance.map(item => item.acceptanceId), [...TRANSFER_ACCEPTANCE_IDS, ...requirements.stageAcceptanceIds])
    || !sameValue(requirements.preparation.acceptance.slice(6), HOST_STAGE_ACCEPTANCE)) throw new Error('Fixed transfer requirement or complete acceptance changed.');
  return freeze({ kind: 'validation-case-input' as const, caseId: declaration.caseId, requirements, manifest: structuredClone(expected) });
}
/** The caller selects reviewed source only; this wrapper fixes the actual input reader. */
function createTransferValidationIdentityReader(options: { repository: string; reviewedPlatformSha: string }) {
  return createReviewedValidationIdentityReader(options, readTransferValidationInput);
}
return { readTransferValidationInput, createTransferValidationIdentityReader };
}
export const { readTransferValidationInput, createTransferValidationIdentityReader } = fixedInput(TRANSFER_VALIDATION_CASE);
export const { readTransferValidationInput: readTransferValidationCaseTwoInput,
  createTransferValidationIdentityReader: createTransferValidationCaseTwoIdentityReader } = fixedInput(TRANSFER_VALIDATION_CASE_TWO);
export const { readTransferValidationInput: readTransferValidationCaseThreeInput,
  createTransferValidationIdentityReader: createTransferValidationCaseThreeIdentityReader } = fixedInput(TRANSFER_VALIDATION_CASE_THREE);
export const { readTransferValidationInput: readTransferValidationCaseFourInput,
  createTransferValidationIdentityReader: createTransferValidationCaseFourIdentityReader } = fixedInput(TRANSFER_VALIDATION_CASE_FOUR);
export const { readTransferValidationInput: readTransferValidationCaseFiveInput,
  createTransferValidationIdentityReader: createTransferValidationCaseFiveIdentityReader } = fixedInput(TRANSFER_VALIDATION_CASE_FIVE);
export const { readTransferValidationInput: readTransferValidationCaseSixInput,
  createTransferValidationIdentityReader: createTransferValidationCaseSixIdentityReader } = fixedInput(TRANSFER_VALIDATION_CASE_SIX);
