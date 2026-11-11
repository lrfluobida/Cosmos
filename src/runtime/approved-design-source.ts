import { realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ArtifactRegistry } from '../artifacts/index.ts';
import { directory, regularFile, snapshot, within } from '../artifacts/paths.ts';
import { sameValue } from '../contracts/validation.ts';
import type { ArtifactReference } from '../contracts/types.ts';
import { readRunSnapshot } from '../cli/control.ts';
import type { PlanningTaskPolicy } from '../roles/planner.ts';
import type { ConfirmedRequirementsSource } from './confirmed-requirements-source.ts';
import { readDesignSelection } from './entrypoint-design-revision.ts';
import type { OrdinaryExecution } from './entrypoint-design-revision.ts';
import { ordinaryDraftSha256 } from './ordinary-profile-source.ts';
import { selectSuppliedDesign, SUPPLIED_DESIGN } from './supplied-design.ts';
import { fundingDesignDraftReview } from './reviewed-design-draft.ts';
import { publishMatchingBytes } from './fixed-host-input.ts';
import type { RunSnapshot } from './run-types.ts';

export const APPROVED_DESIGN = 'ordinary-approved-design';
type Target = { root: string; runId?: string; ledgerId?: string };

/** The source is evidence only. Never open its controller or require active spending authority. */
export async function selectApprovedDesign(location: string, requirements: ConfirmedRequirementsSource, target: Target, expected?: ArtifactReference) {
  const root = resolve(location);
  if (within(root, target.root) || within(target.root, root) || await realpath(root) !== root) throw new Error('Historical design requires separate canonical run roots.');
  const state = await readRunSnapshot(root);
  if (state.formatVersion !== 1 || state.run.runId === target.runId || state.ledger.ledgerId === target.ledgerId
    || !sameValue(state.requirementsSource, requirements) || state.designDraftReview?.artifactId !== SUPPLIED_DESIGN) {
    throw new Error('Historical design requires the same original confirmation and an independent supplied-design run.');
  }
  const { readPublicFundingIntent } = await import('./public-validation-funding.ts');
  const funding = await readPublicFundingIntent(root);
  if (!sameValue(state.validationFunding, funding?.binding) || funding && (!sameValue(funding.payload.requirementsSource, requirements)
    || !sameValue(fundingDesignDraftReview(funding.payload), state.designDraftReview))) throw new Error('Historical design funding source changed.');
  const supplied = await selectSuppliedDesign(state.designDraftReview.location, requirements, target.root, state.designDraftReview);
  const execution: OrdinaryExecution = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, 'execution.json')));
  const selection = await readDesignSelection(root, { read: async () => state }, execution);
  const design = new ArtifactRegistry(root, 'registry').artifactRef('design', 'v1');
  if (selection.revisionPlanSha256 || !sameValue(selection.design, design)) throw new Error('Select the original independently approved supplied design.');
  const task = state.tasks.find(item => item.taskId === selection.approvedTaskId)!;
  const manifestPath = 'registry/captures/design/v1/capture.json', manifest = await regularFile(root, manifestPath);
  const files = await snapshot(join(root, design.location));
  if (files.size !== supplied.contents.size || [...supplied.contents].some(([name, bytes]) => !files.get('_cosmos/' + name)?.equals(bytes))) throw new Error('Approved capture differs from the supplied files.');
  const capture = await new ArtifactRegistry(root, 'registry').getCapture(design);
  if (!sameValue(capture.files, [...supplied.contents.keys()].map(name => ({ source: name, destination: '_cosmos/' + name })))) throw new Error('Approved capture file manifest changed.');
  const dependencies = await Promise.all(capture.dependencies.map(async ref => ({ ref, files: await snapshot(join(root, ref.location)) })));
  const selectionBytes = await regularFile(root, 'ordinary-design-selection.json');
  if (!sameValue(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(selectionBytes)), selection)) throw new Error('Historical selection changed during authentication.');
  const proof = { sourceLedgerId: state.ledger.ledgerId, sourceRunId: state.run.runId, sourceTaskId: task.taskId, sourceAttemptId: selection.approvedAttemptId,
    approval: task.review, design, suppliedDesign: supplied.reference, selectionSha256: ordinaryDraftSha256(selectionBytes),
    captureSha256: ordinaryDraftSha256(manifest), files: supplied.handoff.files };
  const reference = { artifactId: APPROVED_DESIGN, location: root, version: ordinaryDraftSha256(Buffer.from(JSON.stringify(proof))) };
  if (expected && !sameValue(reference, expected)) throw new Error('Pinned historical design approval changed.');
  return { proof: { ...proof, source: reference }, reference, selection, acceptanceIds: task.acceptanceIds, dependencies, manifestPath, manifest, files };
}
export type ApprovedDesign = Awaited<ReturnType<typeof selectApprovedDesign>>;

/** Import only the original immutable design capture and retain its original manifest. */
export async function checkApprovedDesignImport(root: string, source: ApprovedDesign, create = false) {
  for (const dependency of source.dependencies) {
    const local = await snapshot(join(root, dependency.ref.location));
    if (local.size !== dependency.files.size || [...dependency.files].some(([name, bytes]) => !local.get(name)?.equals(bytes))) throw new Error('Historical design input dependency bytes changed.');
  }
  if (create) {
    await directory(root, source.proof.design.location + '/_cosmos');
    await publishMatchingBytes(root, source.manifestPath, source.manifest);
    for (const [name, bytes] of source.files) await publishMatchingBytes(root, source.proof.design.location + '/' + name, bytes);
  }
  const local = await snapshot(join(root, source.proof.design.location));
  if (!(await regularFile(root, source.manifestPath)).equals(source.manifest) || local.size !== source.files.size
    || [...source.files].some(([name, bytes]) => !local.get(name)?.equals(bytes))) throw new Error('Imported design capture changed.');
}

export function approvedDownstreamPlan(source: ApprovedDesign, state: RunSnapshot, policies: PlanningTaskPolicy[], available: ArtifactReference[]) {
  const tasks = source.selection.tasks.filter(item => item.role !== 'design').map(original => {
    const policy = policies.find(item => item.role === original.role)!;
    const expectedArtifacts = policy.outputs.map(({ artifactId, version, destination }) => ({ artifactId, version, location: destination }));
    const task = structuredClone(original.task);
    if (task.state !== 'not_started' || task.attempts.length || task.artifacts.length || task.evidence.length || task.review.verdict !== 'pending'
      || !sameValue(task.acceptanceIds, policy.acceptanceIds)) throw new Error('Invalid historical downstream planning slot.');
    const identity = ordinaryDraftSha256(Buffer.from(JSON.stringify([state.run.runId, task.taskId]))).slice(0, 32);
    task.runId = state.run.runId;
    task.authorId = original.role + '-' + identity;
    task.context = { contextId: 'author-' + identity, rules: policy.rules ?? [], tools: policy.tools, interfaces: policy.interfaces ?? [], knownFailures: [] };
    task.budget = { ledgerId: state.ledger.ledgerId, originalDeadlineAt: state.run.originalDeadlineAt, allocationMicroCny: policy.allocationMicroCny };
    task.ownership = { writePaths: policy.writePaths, readOnlyPaths: policy.readOnlyPaths };
    task.outputs = policy.outputs.map(({ type, schema, destination }) => ({ type, schema, destination }));
    task.dependsOn = task.dependsOn.filter(dep => dep.taskId !== source.proof.sourceTaskId);
    task.inputs = [...available, ...task.dependsOn.flatMap(dep => source.selection.tasks.find(item => item.task.taskId === dep.taskId)!.expectedArtifacts!)];
    return { role: original.role, workspace: policy.workspace, task, expectedArtifacts };
  });
  const art = tasks.find(item => item.role === 'art'), coding = tasks.find(item => item.role === 'coding');
  if (tasks.length !== 2 || !art || !coding || art.task.dependsOn.length || !sameValue(coding.task.dependsOn, [{ taskId: art.task.taskId, state: 'not_started', requiredState: 'passed' }])) throw new Error('Historical design requires the original art and coding dependency graph.');
  return tasks;
}
