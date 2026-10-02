import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { ArtifactRegistry } from '../../src/artifacts/index.ts';
import { regularFile } from '../../src/artifacts/paths.ts';
import { sameValue } from '../../src/contracts/validation.ts';
import { createValidationRequirement } from '../../src/roles/execution-input.ts';
import type { ValidationCaseWindow } from '../../src/runtime/validation-types.ts';
import type { ValidationExecutionBinding } from '../../src/runtime/validation-scope.ts';
import { VALIDATION_CASE } from './validation-declaration.ts';
import { createValidationIdentityReader } from './validation-identity.ts';
import { readValidationInput } from './validation-input.ts';
import { stageAcceptance } from './policy.ts';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** The fixed production reader: callers cannot replace requirements, policy or accepted source data. */
export function createValidationScopeReader(input: { repository: string; ledgerRoot: string; root: string; window: ValidationCaseWindow }): ValidationExecutionBinding {
  const repository = resolve(input.repository), ledgerRoot = resolve(input.ledgerRoot), root = resolve(input.root), window = structuredClone(input.window);
  if (!sameValue(window.quote.declaration, VALIDATION_CASE) || window.caseId !== VALIDATION_CASE.caseId
    || root !== join(repository, '.cosmos/e2e', VALIDATION_CASE.caseId) || ledgerRoot !== join(repository, '.cosmos/validation-shared')) throw new Error('Validation scope reader requires its fixed declaration and roots.');
  const identityReader = createValidationIdentityReader({ repository, reviewedPlatformSha: window.quote.identity.reviewedPlatformSha });
  const registry = new ArtifactRegistry(root, 'registry');
  const sources = [registry.artifactRef(`${window.caseId}-requirements`, VALIDATION_CASE.inputs.requirements.version)];
  const template = registry.artifactRef(`${window.caseId}-template`, 'v1');
  return { caseId: window.caseId, windowId: window.windowId, async readScope(signal) {
    signal.throwIfAborted();
    const identity = await identityReader(signal), frozen = await readValidationInput(repository);
    if (!sameValue(identity, window.quote.identity) || frozen.requirements.specVersion !== window.quote.requirements.specVersion
      || !sameValue(frozen.requirements.acceptanceIds, window.quote.requirements.acceptanceIds) || !sameValue(frozen.requirements.stageAcceptanceIds, window.quote.requirements.stageAcceptanceIds)) throw new Error('Frozen validation scope identity changed.');
    const expected = [
      { ref: sources[0], paths: ['requirements.json', 'character-format.ts', 'audio-format.ts'].map((name, index) => ({ capture: `_cosmos/${name}`,
        repository: index === 0 ? VALIDATION_CASE.inputs.requirements.path : index === 1 ? 'src/media/vector.ts' : 'src/media/audio.ts' })),
        generator: 'Frozen validation input and generic media format', sourceRefs: [VALIDATION_CASE.inputs.requirements.path, 'src/media/vector.ts', 'src/media/audio.ts'] },
      { ref: template, paths: ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts'].map(name => ({ capture: name, repository: `templates/2d/${name}` })),
        generator: 'Unchanged generic Phaser toolchain baseline', sourceRefs: ['templates/2d'] },
    ];
    for (const fixed of expected) {
      signal.throwIfAborted(); const capture = await registry.getCapture(fixed.ref);
      if (capture.taskId !== VALIDATION_CASE.grants.planning.taskId || capture.dependencies.length || capture.metadata.kind !== (fixed.ref === template ? 'code' : 'data')
        || !sameValue(capture.files.map(file => file.destination).sort(), fixed.paths.map(file => file.capture).sort())
        || !sameValue(capture.metadata.provenance, { kind: 'original-procedural', generator: fixed.generator, sourceRefs: fixed.sourceRefs })) throw new Error('Validation input capture provenance changed.');
      for (const file of fixed.paths) if (!(await regularFile(root, `${fixed.ref.location}/${file.capture}`)).equals(await regularFile(repository, file.repository))) throw new Error('Registered validation input bytes differ from the fixed repository.');
    }
    const { sourceSha256, ...decision } = window.operatorDecision, operatorReceipt = await regularFile(ledgerRoot, decision.source.location);
    if (hash(operatorReceipt) !== sourceSha256 || !sameValue(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(operatorReceipt)), {
      formatVersion: 'operator-validation-decision-1', kind: decision.kind, decisionId: decision.decisionId, actorId: decision.actorId,
      decidedAt: decision.decidedAt, sourceRefs: decision.sourceRefs, quote: window.quote })) throw new Error('Actual operator validation source changed.');
    signal.throwIfAborted();
    return { requirement: createValidationRequirement({ specVersion: frozen.requirements.specVersion, sources, acceptance: stageAcceptance(frozen.requirements.acceptanceIds),
      validation: { runId: window.quote.basis.runId, ledgerId: window.quote.basis.ledgerId, caseId: window.caseId, windowId: window.windowId, ...identity, decision } }), operatorReceipt };
  } };
}
