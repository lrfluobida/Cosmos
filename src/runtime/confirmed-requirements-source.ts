import { isAbsolute, resolve } from 'node:path';
import { realpath } from 'node:fs/promises';
import { regularFile, safePath, within } from '../artifacts/paths.ts';
import { sameValue } from '../contracts/validation.ts';
import { confirmRequirements, validateGameDraft } from '../roles/requirements.ts';
import { modeFromSelection } from '../roles/preparation-mode.ts';
import { requirePublicRunLimits } from '../cli/run-limits.ts';
import type { IntakeSnapshot } from './intake.ts';
import type { RunSnapshot } from './run-types.ts';
import { ordinaryDraftSha256, readOrdinaryProfile, requireOrdinaryDraftSource } from './ordinary-profile-source.ts';
import { frameConfirmationVersion, frameIntakeReason, readFrameSelection } from './render-frame-selection.ts';
import { readModularRepairPolicy } from './modular-repair-policy.ts';

export interface ConfirmedRequirementsSource {
  formatVersion: 'confirmed-requirements-source/1';
  root: string; runId: string; revision: number; draftSha256: string; confirmationSha256: string;
}
const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
async function json(root: string, name: string): Promise<any> { return decode(await regularFile(root, name)); }
async function optionalJson(root: string, name: string): Promise<any | null> {
  try { return await json(root, name); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export function validateConfirmedRequirementsSource(value: unknown): asserts value is ConfirmedRequirementsSource {
  const source = value as ConfirmedRequirementsSource;
  if (!source || source.formatVersion !== 'confirmed-requirements-source/1'
    || !sameValue(Object.keys(source).sort(), ['formatVersion', 'root', 'runId', 'revision', 'draftSha256', 'confirmationSha256'].sort())
    || typeof source.root !== 'string' || !isAbsolute(source.root) || resolve(source.root) !== source.root
    || typeof source.runId !== 'string' || !source.runId.trim() || !Number.isSafeInteger(source.revision) || source.revision < 1
    || !/^[a-f0-9]{64}$/.test(source.draftSha256) || !/^[a-f0-9]{64}$/.test(source.confirmationSha256)) throw new Error('Invalid confirmed requirements source.');
}
export function requireSeparateRequirementsRoot(root: string, source: ConfirmedRequirementsSource): void {
  validateConfirmedRequirementsSource(source);
  if (within(resolve(root), source.root) || within(source.root, resolve(root))) throw new Error('Requirements source and new run roots must be separate.');
}

/** Read the original human decision without acquiring its controller or funding authority. */
export async function readConfirmedRequirementsSource(input: { root: string; revision: number; specVersion: string; expected?: ConfirmedRequirementsSource }) {
  await safePath(resolve(input.root));
  const root = await realpath(resolve(input.root));
  const { readRunSnapshot } = await import('../cli/control.ts');
  const snapshot = await readRunSnapshot(root), origin = await json(root, 'intake-origin.json');
  if (snapshot.requirementsSource || origin.requirementsSource) throw new Error('Requirements source must hold the original human confirmation; reference chains are unsupported.');
  if (snapshot.run.specVersion !== input.specVersion || snapshot.run.kind !== 'runtime_generation') throw new Error('Requirements source spec version or run kind differs.');
  const original = await readOriginalConfirmed(root, snapshot);
  if (original.draft.ordinaryProfile !== 'ordinary-design/1' || original.confirmed.actorId !== 'local-user'
    || original.confirmed.revision !== input.revision || original.draft.unsupported.length) throw new Error('An exact complete ordinary revision confirmed by local-user is required.');
  const source: ConfirmedRequirementsSource = { formatVersion: 'confirmed-requirements-source/1', root, runId: snapshot.run.runId, revision: input.revision,
    draftSha256: ordinaryDraftSha256(original.draftBytes), confirmationSha256: ordinaryDraftSha256(original.confirmationBytes) };
  validateConfirmedRequirementsSource(source);
  if (input.expected && !sameValue(source, input.expected)) throw new Error('Original confirmed requirements source revision, identity or bytes changed.');
  return { ...original, source, ledgerId: snapshot.ledger.ledgerId };
}

/** The new execution keeps its identity while every requirement is authenticated at its original source. */
export async function readReferencedRequirements(root: string, snapshot: IntakeSnapshot | RunSnapshot, copies = true) {
  const source = snapshot.requirementsSource; validateConfirmedRequirementsSource(source);
  requireSeparateRequirementsRoot(root, source);
  const original = await readConfirmedRequirementsSource({ root: source.root, revision: source.revision, specVersion: snapshot.run.specVersion, expected: source });
  const origin = await json(root, 'intake-origin.json');
  requirePublicRunLimits(snapshot, origin, true);
  if (snapshot.run.runId === source.runId || snapshot.ledger.ledgerId === original.ledgerId
    || !sameValue(origin.requirementsSource, source) || origin.brief !== original.draft.brief || origin.draftMode !== undefined
    || origin.ordinaryProfile !== original.draft.ordinaryProfile
    || !sameValue(origin.renderFrames, original.renderFrameSelection) || !sameValue(origin.modularRepairPolicy, original.modularRepairPolicy)
    || snapshot.events[0].reason !== frameIntakeReason(original.renderFrameSelection, original.modularRepairPolicy)) throw new Error('New attempt requirements origin or identity changed.');
  await readOrdinaryProfile(root, { runId: snapshot.run.runId, createdAt: snapshot.events[0].at }, snapshot.formatVersion === 'intake-1' ? snapshot : undefined);
  if (snapshot.formatVersion === 'intake-1') {
    if (snapshot.confirmation !== null || !sameValue(snapshot.renderFrames, original.renderFrameSelection) || !sameValue(snapshot.modularRepairPolicy, original.modularRepairPolicy)
      || snapshot.draft && !sameValue(snapshot.draft, { ...original.draft, revision: source.revision, source: original.requirement.sources[0] })) throw new Error('Referenced intake cannot replace the original confirmation or draft.');
    if (copies && !snapshot.draft) throw new Error('Referenced intake requirements have not been bound.');
  } else if (snapshot.run.humanDecisions.some(decision => decision.decisionId.startsWith('requirements-v'))) throw new Error('Referenced attempt cannot create a new requirements human decision.');
  if (copies) for (const [index, bytes] of [original.draftBytes, original.confirmationBytes].entries()) {
    if (!(await regularFile(root, original.requirement.sources[index].location)).equals(bytes)) throw new Error('Local confirmed requirements copy bytes changed.');
  }
  return original;
}

/** Existing callers keep the same reader and the old confirmation path. */
export async function readConfirmedGeneration(root: string, snapshot: RunSnapshot) {
  const original = snapshot.requirementsSource ? await readReferencedRequirements(root, snapshot) : await readOriginalConfirmed(root, snapshot);
  return { draft: original.draft, requirement: original.requirement, ...(original.renderFrames ? { renderFrames: true } : {}) };
}

async function readOriginalConfirmed(root: string, snapshot: RunSnapshot | IntakeSnapshot) {
  const intakeOrigin = await optionalJson(root, 'intake-origin.json');
  requirePublicRunLimits(snapshot, intakeOrigin);
  const ordinaryProfile = await readOrdinaryProfile(root, { runId: snapshot.run.runId, createdAt: snapshot.events[0].at });
  const source = snapshot.formatVersion === 'intake-1' ? snapshot.confirmation && { decisionId: `requirements-v${snapshot.confirmation.revision}`, actorId: snapshot.confirmation.requirement.confirmedBy, decidedAt: snapshot.confirmation.requirement.confirmedAt, evidence: snapshot.confirmation.requirement.sources } : snapshot.run.humanDecisions.find(decision => decision.decisionId.startsWith('requirements-v'));
  if (!source || source.evidence.length !== 2 || source.evidence[0].artifactId !== 'requirement-draft' || source.evidence[1].artifactId !== 'user-confirmation') throw new Error('No original CLI requirement confirmation to resume.');
  const draftBytes = await regularFile(root, source.evidence[0].location);
  const confirmationBytes = await regularFile(root, source.evidence[1].location);
  const draft = decode(draftBytes), confirmed = decode(confirmationBytes);
  const origin = await optionalJson(root, 'intake-mode.json');
  if (origin && (origin.runId !== snapshot.run.runId || origin.createdAt !== snapshot.events[0].at
    || !sameValue(origin, { runId: origin.runId, createdAt: origin.createdAt, draftMode: origin.draftMode }))) throw new Error('Original intake mode origin changed.');
  validateGameDraft(draft, modeFromSelection(origin?.draftMode), ordinaryProfile);
  if (confirmed.runId !== snapshot.run.runId || confirmed.actorId !== source.actorId || confirmed.at !== source.decidedAt) throw new Error('Original confirmation identity changed.');
  const frames = await readFrameSelection(root, snapshot), policy = await readModularRepairPolicy(root, snapshot);
  if (ordinaryProfile) {
    const revision = confirmed.revision;
    const draftRef = { artifactId: 'requirement-draft', version: `v${revision}`, location: `requirements/v${revision}/draft.json` };
    const confirmationRef = { artifactId: 'user-confirmation', version: frameConfirmationVersion(revision, frames, policy), location: `requirements/v${revision}/confirmation.json` };
    if (!Number.isSafeInteger(revision) || revision < 1 || source.decisionId !== `requirements-v${revision}` || !sameValue(source.evidence, [draftRef, confirmationRef])
      || !sameValue(confirmed, { revision, confirmed: true, actorId: source.actorId, at: source.decidedAt, runId: snapshot.run.runId, draft: draftRef,
        ordinaryProfile, ordinaryDraftSha256: ordinaryDraftSha256(draftBytes), ...(frames ? { renderFrames: frames } : {}), ...(policy ? { modularRepairPolicy: policy } : {}) })) {
      throw new Error('Original ordinary confirmation or complete draft source changed.');
    }
    await requireOrdinaryDraftSource(root, draft, revision);
  }
  const requirement = confirmRequirements({ ...draft, specVersion: snapshot.run.specVersion, sources: source.evidence }, confirmed);
  if (snapshot.formatVersion === 'intake-1' && (!snapshot.draft || !sameValue(snapshot.draft, { ...draft, revision: confirmed.revision, source: source.evidence[0] }) || !sameValue(snapshot.confirmation, { revision: confirmed.revision, requirement, source: source.evidence[1] }))) throw new Error('Original intake confirmation or complete draft changed.');
  return { draft, requirement, confirmed, draftBytes, confirmationBytes, renderFrameSelection: frames, modularRepairPolicy: policy, ...(frames ? { renderFrames: true as const } : {}) };
}
