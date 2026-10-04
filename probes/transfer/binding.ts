import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { ArtifactReference, RequirementContract } from '../../src/contracts/types.ts';
import { validateRequirement } from '../../src/contracts/validation.ts';
import type { ArtifactRegistry, Provenance } from '../../src/artifacts/index.ts';
import { directory, regularFile, removeOwned, snapshot } from '../../src/artifacts/paths.ts';
import { validatePlan, isLocalUrl } from '../../src/acceptance/plan.ts';
import type { AcceptancePlan, Observation, Scalar, Step } from '../../src/acceptance/plan.ts';
import { fixedReference, requireThat, sameReference, TRANSFER_ACCEPTANCE_IDS } from './design.ts';
import { snapshotJSON, validateTransferDesign } from './oracle.ts';
import type { TransferState, Transition, ValidatedTransferDesign } from './oracle.ts';

const DESIGN_FILE = '_cosmos/transfer-design.json', BINDING_FILE = '_cosmos/transfer-binding.json';
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
function json(bytes: Buffer): unknown {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('Transfer design: input must use valid UTF-8 encoding'); }
  return JSON.parse(text);
}
function digest(files: Map<string, Buffer>): string {
  return hash(JSON.stringify([...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, bytes]) => [name, hash(bytes)])));
}
async function capturedFiles(root: string, registry: ArtifactRegistry, ref: ArtifactReference) {
  fixedReference(ref);
  const capture = await registry.getCapture(ref), files = await snapshot(join(root, ref.location));
  requireThat(isDeepStrictEqual([...files.keys()].sort(), capture.files.map(file => file.destination).sort()), 'capture file inventory changed');
  return { capture, files };
}
async function readRequirement(root: string, registry: ArtifactRegistry, ref: ArtifactReference, file: string) {
  const { capture, files } = await capturedFiles(root, registry, ref);
  requireThat(capture.metadata.kind === 'data' && files.has(file), 'captured requirement data is missing');
  const value = json(files.get(file)!);
  requireThat(!validateRequirement(value).length, 'invalid confirmed requirement contract');
  const requirement = value as RequirementContract;
  requireThat(isDeepStrictEqual(requirement.acceptance.map(item => item.acceptanceId).sort(), [...TRANSFER_ACCEPTANCE_IDS].sort()),
    'requirement must retain all six exact transfer acceptance IDs');
  return { requirement, sha256: digest(files) };
}
export interface FrozenTransferDesign {
  formatVersion: 'cos16-binding/1'; artifact: ArtifactReference;
  requirement: ArtifactReference; requirementFile: string; requirementSha256: string;
  designSha256: string; mapVersion: string; specVersion: string; acceptanceIds: string[];
}
interface HostInput { root: string; registry: ArtifactRegistry }
export interface FreezeInput extends HostInput {
  requirement: ArtifactReference; requirementFile: string; designSource: string;
  artifact: ArtifactReference; taskId: string; provenance: Provenance;
}
/** Trusted host only. Persist the returned binding in a host-owned plan before role handoff. */
export async function freezeTransferDesign(input: FreezeInput): Promise<FrozenTransferDesign> {
  fixedReference(input.artifact);
  const required = await readRequirement(input.root, input.registry, input.requirement, input.requirementFile);
  const bytes = await regularFile(input.root, input.designSource);
  const validated = validateTransferDesign(json(bytes), input.requirement);
  const frozen: FrozenTransferDesign = { formatVersion: 'cos16-binding/1', artifact: structuredClone(input.artifact),
    requirement: structuredClone(input.requirement), requirementFile: input.requirementFile, requirementSha256: required.sha256,
    designSha256: hash(bytes), mapVersion: validated.design.mapVersion, specVersion: required.requirement.specVersion,
    acceptanceIds: [...TRANSFER_ACCEPTANCE_IDS] };
  // Copy the already-validated bytes, rather than re-reading a writable author file during capture.
  const sourceRoot = 'host-transfer-preparation/' + randomUUID(), folder = await directory(input.root, sourceRoot);
  try {
    await writeFile(join(folder, 'design.json'), bytes, { flag: 'wx' });
    await writeFile(join(folder, 'binding.json'), JSON.stringify(frozen, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    requireThat((await readRequirement(input.root, input.registry, input.requirement, input.requirementFile)).sha256 === required.sha256,
      'requirement changed during freeze');
    await input.registry.registerCapture({ taskId: input.taskId, artifactRef: input.artifact, sourceRoot,
      files: [{ source: 'design.json', destination: DESIGN_FILE }, { source: 'binding.json', destination: BINDING_FILE }],
      ownership: { writePaths: ['_cosmos'], readOnlyPaths: [] }, dependencies: [input.requirement],
      metadata: { kind: 'data', provenance: input.provenance } });
    return structuredClone(frozen);
  } finally { await removeOwned(input.root, folder); }
}
export interface PrepareInput extends HostInput {
  frozen: FrozenTransferDesign; currentRequirement: { artifact: ArtifactReference; specVersion: string };
  candidate: ArtifactReference; planArtifact: ArtifactReference; url: string; runId: string; reportId: string;
}
export interface BindInput extends PrepareInput { prepared: FrozenTransferAcceptanceDraft }
async function validateFrozenDesign(input: PrepareInput): Promise<ValidatedTransferDesign> {
  const frozen = input.frozen;
  fixedReference(frozen.artifact); fixedReference(input.candidate); fixedReference(input.currentRequirement.artifact);
  requireThat(sameReference(input.candidate, input.registry.candidateRef(input.candidate.artifactId, input.candidate.version)),
    'planned candidate reference must use the fixed registry location');
  requireThat(sameReference(input.currentRequirement.artifact, frozen.requirement)
    && input.currentRequirement.specVersion === frozen.specVersion, 'current requirement binding mismatch');
  const { capture, files } = await capturedFiles(input.root, input.registry, frozen.artifact);
  requireThat(capture.metadata.kind === 'data' && isDeepStrictEqual(capture.dependencies, [frozen.requirement])
    && isDeepStrictEqual([...files.keys()].sort(), [DESIGN_FILE, BINDING_FILE].sort()), 'design capture binding changed');
  requireThat(isDeepStrictEqual(json(files.get(BINDING_FILE)!), frozen), 'host frozen binding changed');
  requireThat(hash(files.get(DESIGN_FILE)!) === frozen.designSha256, 'design hash changed');
  const requirement = await readRequirement(input.root, input.registry, frozen.requirement, frozen.requirementFile);
  requireThat(requirement.sha256 === frozen.requirementSha256 && requirement.requirement.specVersion === frozen.specVersion,
    'requirement hash or spec version changed');
  const validated = validateTransferDesign(json(files.get(DESIGN_FILE)!), frozen.requirement);
  requireThat(validated.design.mapVersion === frozen.mapVersion
    && isDeepStrictEqual(frozen.acceptanceIds, [...TRANSFER_ACCEPTANCE_IDS]), 'map or acceptance binding changed');
  return validated;
}
async function requireCandidateInputs(input: BindInput): Promise<void> {
  const candidate = await input.registry.getCandidate(input.candidate);
  for (const ref of [input.frozen.requirement, input.frozen.artifact, input.prepared.artifact]) {
    requireThat(candidate.inputs.some(item => sameReference(item, ref)) && candidate.expectedDeps.some(item => sameReference(item, ref)),
      'candidate missing exact frozen input binding');
    const source = await capturedFiles(input.root, input.registry, ref);
    for (const [name, bytes] of source.files) {
      requireThat(candidate.files.some(file => file.destination === name && sameReference(file.artifactRef, ref)), 'candidate input file binding changed');
      requireThat((await regularFile(input.root, candidate.targetRoot + '/' + name)).equals(bytes), 'candidate input bytes changed');
    }
  }
}
export interface TransferSegment {
  id: string; executable: false; prerequisite: 'fresh-profile' | 'same-profile-reopened'; plan: AcceptancePlan;
}
export interface TransferAcceptanceDraft {
  formatVersion: 'cos16-plan/1'; phase: 'preparation-only'; executable: false; acceptanceIds: string[];
  artifact: ArtifactReference;
  binding: { candidate: ArtifactReference; design: FrozenTransferDesign; runId: string };
  segments: TransferSegment[];
  checkpoint: { kind: 'close-process-reopen'; executable: false; afterSegment: 'restore'; beforeSegment: 'victory';
    sameProfile: true; sameOrigin: true; origin: string; expected: string; requiredCapability: string };
}
export interface FrozenTransferAcceptanceDraft extends TransferAcceptanceDraft { planSha256: string }
function segment(input: PrepareInput, name: string, acceptanceId: string, validated: ValidatedTransferDesign,
  path: Transition[], mode: 'start' | 'probe' | 'restart' | 'restore' | 'victory'): TransferSegment {
  const steps: Step[] = [];
  const next = () => name + '-' + String(steps.length + 1).padStart(3, '0');
  const click = (button: string) => steps.push({ id: next(), kind: 'locator-click', selector: '[data-testid="' + button + '"]', timeoutMs: 5000 });
  const check = (observation: Observation, expected: Scalar) => steps.push({ id: next(), kind: 'wait-for', acceptanceId, observation, expected, timeoutMs: 3000 });
  const visible = (selector: string) => check({ kind: 'visible', selector }, true);
  const state = (value: TransferState, saved: boolean) => {
    check({ kind: 'debug', path: ['transfer', 'snapshot'] }, snapshotJSON(value));
    if (saved) check({ kind: 'debug', path: ['transfer', 'saveSnapshot'] }, snapshotJSON(value));
  };
  const rendered = (value: TransferState) => {
    visible('[data-testid="board"]');
    visible('[data-testid="cell-' + value.player.join('-') + '"][data-player="true"]');
    value.boxes.forEach(box => visible('[data-testid="cell-' + box.join('-') + '"][data-box="true"]'));
    value.targets.forEach(target => visible('[data-testid="cell-' + target.position.join('-') + '"][data-target="true"][data-occupied="' + target.occupied + '"]'));
    check({ kind: 'text', selector: '[data-testid="status"]' }, value.won ? '胜利' : '进行中');
  };
  const button = mode === 'victory' ? 'continue' : 'start';
  visible('[data-testid="' + button + '"]');
  check({ kind: 'text', selector: '[data-testid="' + button + '"]' }, mode === 'victory' ? '继续游戏' : '开始');
  click(button);
  state(mode === 'victory' ? validated.restore : validated.initial, mode === 'victory');
  if (mode === 'start') {
    for (const [button, label] of [['up', '上'], ['down', '下'], ['left', '左'], ['right', '右'], ['restart', '重新开始']]) {
      visible('[data-testid="' + button + '"]'); check({ kind: 'text', selector: '[data-testid="' + button + '"]' }, label);
    }
  }
  if (mode === 'probe' || mode === 'restore') { click('restart'); state(validated.initial, true); }
  let singleTargetObserved = false;
  for (const transition of path) {
    click(transition.direction); state(transition.after, true);
    if (mode === 'victory' && !singleTargetObserved && transition.after.targets.filter(target => target.occupied).length === 1) {
      rendered(transition.after); singleTargetObserved = true;
    }
  }
  let final = path.at(-1)?.after ?? validated.initial;
  if (mode === 'restart') { click('restart'); state(validated.initial, true); final = validated.initial; }
  rendered(final);
  const plan: AcceptancePlan = { formatVersion: '1.0.0', projectId: 'cos16-transfer', taskId: 'COS-16', runId: input.runId,
    reportId: input.reportId + '-' + name, specVersion: input.frozen.specVersion, artifact: structuredClone(input.candidate),
    url: input.url, viewport: { width: 1280, height: 720 }, acceptanceIds: [acceptanceId], steps };
  requireThat(!validatePlan(plan).length, 'mouse plan violates the bounded COS-08 contract');
  return { id: name, executable: false, prerequisite: mode === 'victory' ? 'same-profile-reopened' : 'fresh-profile', plan };
}
function draft(input: PrepareInput, validated: ValidatedTransferDesign): TransferAcceptanceDraft {
  const segments = [
    segment(input, 'start', 'T16-01', validated, [], 'start'),
    segment(input, 'walk-wall', 'T16-02', validated, validated.scenes.wall, 'probe'),
    segment(input, 'push', 'T16-03', validated, validated.scenes.push, 'probe'),
    segment(input, 'box-wall', 'T16-03', validated, validated.scenes.boxWall, 'probe'),
    segment(input, 'double-box', 'T16-03', validated, validated.scenes.doubleBox, 'probe'),
    segment(input, 'restart', 'T16-04', validated, validated.scenes.restart, 'restart'),
    segment(input, 'restore', 'T16-05', validated, validated.scenes.restore, 'restore'),
    segment(input, 'victory', 'T16-06', validated, validated.continuation, 'victory'),
  ];
  return { formatVersion: 'cos16-plan/1', phase: 'preparation-only', executable: false, acceptanceIds: [...TRANSFER_ACCEPTANCE_IDS],
    artifact: structuredClone(input.planArtifact),
    binding: { candidate: structuredClone(input.candidate), design: structuredClone(input.frozen), runId: input.runId }, segments,
    checkpoint: { kind: 'close-process-reopen', executable: false, afterSegment: 'restore', beforeSegment: 'victory',
      sameProfile: true, sameOrigin: true, origin: new URL(input.url).origin, expected: snapshotJSON(validated.restore),
      requiredCapability: 'persistent-profile-real-process-reopen-with-evidence' } };
}
/** Freeze expectations before coding/art, reserving the exact future candidate identity. */
export async function prepareTransferAcceptance(input: PrepareInput): Promise<FrozenTransferAcceptanceDraft> {
  requireThat(isLocalUrl(input.url), 'plan URL must be a loopback origin');
  fixedReference(input.planArtifact);
  const prepared = draft(input, await validateFrozenDesign(input));
  const sourceRoot = 'host-transfer-preparation/' + randomUUID(), folder = await directory(input.root, sourceRoot);
  const bytes = JSON.stringify(prepared, null, 2) + '\n';
  try {
    await writeFile(join(folder, 'plan.json'), bytes, { encoding: 'utf8', flag: 'wx' });
    await input.registry.registerCapture({ taskId: 'host-transfer-plan', artifactRef: input.planArtifact, sourceRoot,
      files: [{ source: 'plan.json', destination: '_cosmos/transfer-plan.json' }],
      ownership: { writePaths: ['_cosmos'], readOnlyPaths: [] }, dependencies: [input.frozen.requirement, input.frozen.artifact],
      metadata: { kind: 'data', provenance: { kind: 'original-procedural', generator: 'COS36 trusted rules and plan converter',
        sourceRefs: [input.frozen.requirement.artifactId + '@' + input.frozen.requirement.version,
          input.frozen.artifact.artifactId + '@' + input.frozen.artifact.version, input.candidate.artifactId + '@' + input.candidate.version] } } });
    return { ...prepared, planSha256: hash(bytes) };
  } finally { await removeOwned(input.root, folder); }
}
/** Reuse exact pre-coding expectations after the actual candidate has been staged. No new plan writes. */
export async function bindTransferAcceptance(input: BindInput): Promise<FrozenTransferAcceptanceDraft> {
  requireThat(isLocalUrl(input.url), 'plan URL must be a loopback origin');
  fixedReference(input.planArtifact);
  requireThat(sameReference(input.prepared.artifact, input.planArtifact), 'prepared plan reference mismatch');
  const { capture, files } = await capturedFiles(input.root, input.registry, input.planArtifact);
  requireThat(capture.metadata.kind === 'data' && isDeepStrictEqual(capture.dependencies, [input.frozen.requirement, input.frozen.artifact])
    && isDeepStrictEqual([...files.keys()], ['_cosmos/transfer-plan.json']), 'plan capture binding changed');
  const bytes = files.get('_cosmos/transfer-plan.json')!;
  requireThat(hash(bytes) === input.prepared.planSha256, 'plan hash changed');
  const { planSha256: _hash, ...prepared } = input.prepared;
  requireThat(isDeepStrictEqual(json(bytes), prepared), 'prepared plan data changed');
  const validated = await validateFrozenDesign(input);
  requireThat(isDeepStrictEqual(draft(input, validated), prepared), 'candidate, run or frozen design plan binding changed');
  await requireCandidateInputs(input);
  return structuredClone(input.prepared);
}
