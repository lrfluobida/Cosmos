import { join, resolve } from 'node:path';
import { regularFile, within } from '../artifacts/paths.ts';
import { sameValue } from '../contracts/validation.ts';
import type { ArtifactReference } from '../contracts/types.ts';
import { gameplayAcceptance } from '../roles/requirements.ts';
import { readConfirmedRequirementsSource, type ConfirmedRequirementsSource } from './confirmed-requirements-source.ts';
import { validateOrdinaryAcceptancePlan } from './entrypoint-acceptance-plan.ts';
import { validateDesign } from './entrypoint-media.ts';
import { ordinaryDraftSha256 } from './ordinary-profile-source.ts';

export const SUPPLIED_DESIGN = 'ordinary-supplied-design';
const filenames = ['design.json', 'acceptance-plan.json'] as const;

export function suppliedDesignProvenance(ref: ArtifactReference, sourceRefs: string[]) {
  return { kind: 'original-procedural' as const, generator: 'Operator-supplied design, native design role handoff',
    sourceRefs: [...sourceRefs, `${ref.artifactId}@${ref.version}`, ref.location] };
}

export async function suppliedDesignBytes(directory: string, source: ConfirmedRequirementsSource) {
  const contents = new Map(await Promise.all(filenames.map(async name => [name, await regularFile(directory, name)] as const)));
  const files = filenames.map(name => {
    const bytes = contents.get(name)!;
    return { path: `authors/design/${name}`, bytes: bytes.length, sha256: ordinaryDraftSha256(bytes) };
  });
  const version = ordinaryDraftSha256(Buffer.from(JSON.stringify([SUPPLIED_DESIGN, source.formatVersion, source.root, source.runId,
    source.revision, source.draftSha256, source.confirmationSha256, ...files.map(file => file.sha256)]), 'utf8'));
  return { version, contents, files };
}

/** Select an operator's files as inputs. Only the new run's reviewer can approve its capture. */
export async function selectSuppliedDesign(directory: string, source: ConfirmedRequirementsSource, target: string, expected?: ArtifactReference) {
  const location = resolve(directory);
  if (within(location, target) || within(target, location)) throw new Error('Supplied design and new run require separate directories.');
  const { version, contents, files } = await suppliedDesignBytes(location, source);
  const reference = { artifactId: SUPPLIED_DESIGN, location, version };
  if (expected && !sameValue(expected, reference)) throw new Error('Pinned supplied design or its confirmed requirements changed.');
  const { draft, requirement } = await readConfirmedRequirementsSource({ root: source.root, revision: source.revision, specVersion: '1.0', expected: source });
  if (!('ordinaryProfile' in draft) || draft.ordinaryProfile !== 'ordinary-design/1' || draft.codeProfile || draft.preparation || draft.classicEntry?.measurement) {
    throw new Error('Supplied design requires an ordinary confirmed design task with two outputs.');
  }
  const parse = (name: typeof filenames[number]) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(contents.get(name)!));
  const design = parse('design.json');
  validateDesign(design, gameplayAcceptance(draft).map(item => item.acceptanceId), false, draft.experienceCriteria);
  const plan = parse('acceptance-plan.json');
  validateOrdinaryAcceptancePlan(plan, draft);
  const revision = requirement.sources[0].version;
  if (!sameValue(plan.requirement, { artifactId: 'requirement-bundle', version: revision, location: `registry/captures/requirement-bundle/${revision}/files` })) {
    throw new Error('Supplied design plan requires the exact original requirement capture.');
  }
  const structure = { gameplayMappings: Object.keys(design.acceptanceMapping).length, experienceMappings: draft.experienceCriteria.length,
    mainSteps: plan.scenario.steps.length, reopenSteps: plan.scenario.reopen?.steps.length ?? 0 };
  return { reference, contents, handoff: { suppliedDesign: reference, confirmation: source, requirement: plan.requirement, files, structure } };
}

/** Recheck the operator's source and original confirmation, then bind those structural facts to the actual author files. */
export async function checkSuppliedDesignHandoff(workspace: string, reference: ArtifactReference, source: ConfirmedRequirementsSource) {
  const [selected, staged] = await Promise.all([selectSuppliedDesign(reference.location, source, workspace, reference),
    suppliedDesignBytes(join(workspace, 'authors/design'), source)]);
  if (staged.version !== reference.version) throw new Error('Staged design files differ from the fixed supplied design.');
  return selected.handoff;
}
export type SuppliedDesignHandoff = Awaited<ReturnType<typeof checkSuppliedDesignHandoff>>;
