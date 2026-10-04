import { sameValue } from '../contracts/validation.ts';
import { regularFile } from '../artifacts/paths.ts';
import { validateBrowserScenario } from '../roles/requirements.ts';
import type { GameDraft } from '../roles/requirements.ts';
import type { ValidationRequirement } from '../roles/execution-input.ts';
import type { RunController } from './run.ts';
import { requireValidationScope } from './validation-scope.ts';
import type { ValidationExecutionBinding } from './validation-scope.ts';
import { validationHash } from './validation-validation.ts';

export interface ValidationBrowserProposal extends Pick<GameDraft, 'brief' | 'acceptance' | 'scenario' | 'unsupported'> { profile: 'operator_validation' }
export interface ValidationPreparationProposal extends Pick<GameDraft, 'brief' | 'acceptance' | 'unsupported'> { profile: 'operator_validation'; adapterId: string }
export interface ValidationBrowserScope {
  root: string; controller: RunController; requirement: ValidationRequirement; proposal: ValidationBrowserProposal; validation: ValidationExecutionBinding;
}

/** Authentic operator data and current immutable input bytes; never a human draft confirmation. */
export async function requireValidationBrowserScope(input: ValidationBrowserScope) {
  const { root, controller, requirement, proposal, validation } = input;
  await controller.requireValidationHost(validation.caseId, validation.windowId, root);
  const scope = await requireValidationScope(controller, requirement, validation);
  if (!proposal || proposal.profile !== 'operator_validation' || Object.keys(proposal).some(key => !['profile', 'brief', 'acceptance', 'scenario', 'unsupported'].includes(key))
    || typeof proposal.brief !== 'string' || !proposal.brief.trim() || proposal.brief.length > 16000 || !Array.isArray(proposal.unsupported)
    || proposal.unsupported.some(item => typeof item !== 'string' || !item.trim()) || !sameValue(proposal.acceptance, requirement.acceptance)) throw new Error('Invalid explicit operator browser proposal.');
  validateBrowserScenario(proposal);
  const declaration = scope.window.quote.declaration, source = requirement.sources[0];
  if (requirement.sources.length !== 1 || !source.artifactId.startsWith(`${validation.caseId}-`) || source.version !== declaration.inputs.requirements.version
    || !sameValue(requirement.acceptance.map(item => item.acceptanceId).sort(), [...scope.window.quote.requirements.acceptanceIds, ...scope.window.quote.requirements.stageAcceptanceIds].sort())) throw new Error('Browser proposal requires the exact frozen case requirement input version and acceptance IDs.');
  const bytes = await regularFile(root, source.location);
  if (validationHash(bytes) !== declaration.inputs.requirements.sha256 || !sameValue(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).browser, proposal)) throw new Error('Frozen browser proposal input changed.');
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) {
    const files = declaration.inputs.template.files.filter(file => file.path.endsWith(`/${name}`));
    if (files.length !== 1 || validationHash(await regularFile(root, `toolchain/${name}`)) !== files[0].sha256) throw new Error('Frozen host template input changed.');
  }
  controller.signal.throwIfAborted(); return scope;
}

/** A separate fixed preparation input has no executable or placeholder scenario. */
export async function requireValidationPreparationScope(input: Omit<ValidationBrowserScope, 'proposal'> & { proposal: ValidationPreparationProposal; adapterId: string }) {
  const { root, controller, requirement, proposal, validation } = input;
  await controller.requireValidationHost(validation.caseId, validation.windowId, root);
  const scope = await requireValidationScope(controller, requirement, validation);
  if (!proposal || proposal.profile !== 'operator_validation' || proposal.adapterId !== input.adapterId
    || Object.keys(proposal).some(key => !['profile', 'adapterId', 'brief', 'acceptance', 'unsupported'].includes(key))
    || typeof proposal.brief !== 'string' || !proposal.brief.trim() || proposal.brief.length > 16000 || !Array.isArray(proposal.unsupported)
    || proposal.unsupported.some(item => typeof item !== 'string' || !item.trim()) || !sameValue(proposal.acceptance, requirement.acceptance)) throw new Error('Invalid explicit preparation proposal.');
  const declaration = scope.window.quote.declaration, source = requirement.sources[0];
  if (requirement.sources.length !== 1 || !source.artifactId.startsWith(`${validation.caseId}-`) || source.version !== declaration.inputs.requirements.version
    || !sameValue(requirement.acceptance.map(item => item.acceptanceId).sort(), [...scope.window.quote.requirements.acceptanceIds, ...scope.window.quote.requirements.stageAcceptanceIds].sort())) throw new Error('Preparation requires the complete fixed requirement and stage IDs.');
  const bytes = await regularFile(root, source.location);
  if (validationHash(bytes) !== declaration.inputs.requirements.sha256 || !sameValue(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).preparation, proposal)) throw new Error('Frozen preparation proposal input changed.');
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) {
    const files = declaration.inputs.template.files.filter(file => file.path.endsWith(`/${name}`));
    if (files.length !== 1 || validationHash(await regularFile(root, `toolchain/${name}`)) !== files[0].sha256) throw new Error('Frozen host template input changed.');
  }
  controller.signal.throwIfAborted(); return scope;
}
