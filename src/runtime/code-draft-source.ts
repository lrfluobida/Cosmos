import { isUtf8 } from 'node:buffer';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, join, posix, resolve } from 'node:path';
import { ArtifactRegistry } from '../artifacts/index.ts';
import { directory, noConflicts, owns, regularFile, safePath, snapshot, within } from '../artifacts/paths.ts';
import { readRunSnapshot } from '../cli/control.ts';
import type { ArtifactReference, RequirementContract, TaskContract } from '../contracts/types.ts';
import { sameValue } from '../contracts/validation.ts';
import { checkApprovedArtImport, type ApprovedArt } from './approved-art-source.ts';
import { checkApprovedDesignImport, type ApprovedDesign } from './approved-design-source.ts';
import { APPROVED_ART, fundingArtDraftSource } from './art-draft-source.ts';
import { readReferencedRequirements, type ConfirmedRequirementsSource } from './confirmed-requirements-source.ts';
import { publishMatchingBytes } from './fixed-host-input.ts';
import { ordinaryDraftSha256 } from './ordinary-profile-source.ts';
import type { PublicValidationAuthorization } from './public-validation-funding-types.ts';
import { requireOriginalTask, TaskJournal, type CapturedTask, type ContentSignature, type RecoveryOrigin } from './recovery/task-journal.ts';
import type { RunSnapshot } from './run-types.ts';

export const CODE_DRAFT = 'ordinary-code-draft';
const entry = 'authors/coding/index.html';
const sourceDirectory = 'authors/coding/src';

/** Only the authenticated draft's compact editable text can accompany author feedback. */
export function compactCodeDraftFiles(files: ReadonlyMap<string, Buffer>) {
  const limit = 64 * 1024;
  const result: { path: string; content: string }[] = [];
  let size = 2; // JSON array brackets.
  for (const path of [...files.keys()].sort()) {
    if (path !== entry && (!path.startsWith(sourceDirectory + '/') || !/\.(?:[cm]?[jt]sx?|css|html)$/i.test(path)
      || path.split('/').some(part => !part || part.startsWith('.') || part.toLowerCase() === 'node_modules'))) return undefined;
    const bytes = files.get(path)!;
    if (bytes.length > limit - size || !isUtf8(bytes)) return undefined;
    const content = bytes.toString('utf8');
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(content)
      || /-----BEGIN (?:[A-Z0-9 ]* )?PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{20,}/u.test(content)) return undefined;
    const file = { path, content };
    size += Buffer.byteLength(JSON.stringify(file)) + (result.length ? 1 : 0);
    if (size > limit) return undefined;
    result.push(file);
  }
  return result.length ? result : undefined;
}

export function validateCodeDraftSource(ref: ArtifactReference, art?: ArtifactReference) {
  if (art?.artifactId !== APPROVED_ART || ref?.artifactId !== CODE_DRAFT || typeof ref.version !== 'string' || !/^[a-f0-9]{64}$/.test(ref.version)
    || typeof ref.location !== 'string' || !isAbsolute(ref.location) || resolve(ref.location) !== ref.location
    || !sameValue(Object.keys(ref).sort(), ['artifactId', 'location', 'version'])) throw new Error('A code draft requires a pinned source and approved art.');
}

export function fundingCodeDraftSource(payload: PublicValidationAuthorization) {
  const refs = payload.sourceRefs.filter(ref => ref.artifactId === CODE_DRAFT);
  if (!refs.length) return undefined;
  if (refs.length !== 1) throw new Error('Select one code draft.');
  validateCodeDraftSource(refs[0], fundingArtDraftSource(payload));
  return refs[0];
}

async function workingFiles(root: string) {
  const files = new Map<string, Buffer>();
  const html = await regularFile(root, entry).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return undefined; throw error; });
  if (html) files.set(entry, html);
  const sources = await snapshot(resolve(root, sourceDirectory));
  for (const name of [...sources.keys()].sort()) files.set(sourceDirectory + '/' + name, sources.get(name)!);
  return files;
}

async function exists(root: string, path: string) {
  return lstat(await safePath(root, path)).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return false;
    throw error;
  });
}

async function capturedFiles(root: string, state: RunSnapshot, task: TaskContract, requirement: RequirementContract,
  candidateRef: ArtifactReference, source: ArtifactReference, dependencies: ArtifactReference[]) {
  const attempt = task.attempts.at(-1)!;
  if (task.state !== 'failed' || attempt.outcome !== 'failed' || attempt.sessionRef !== join(root, 'sessions', attempt.attemptId)
    || !sameValue(task.artifacts, [candidateRef])) throw new Error('Select the failed task with its original captured candidate.');
  const origin: RecoveryOrigin = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, `journal/task-${encodeURIComponent(task.taskId)}/origin.json`)));
  if (origin.formatVersion !== 1 || origin.runId !== state.run.runId || origin.ledgerId !== state.ledger.ledgerId
    || origin.artifactRoot !== root || origin.sessionRoot !== join(root, 'sessions') || origin.originalStartedAt !== state.run.originalStartedAt
    || origin.originalDeadlineAt !== state.run.originalDeadlineAt || origin.limitMicroCny !== state.ledger.limitMicroCny
    || origin.prepared.role !== 'coding' || origin.prepared.workspace !== root || !sameValue(origin.prepared.expectedArtifacts, [candidateRef])
    || !sameValue(origin.requirement, requirement)) throw new Error('Original coding task capture inputs changed.');
  requireOriginalTask(origin.prepared.task, task);
  const journal = await TaskJournal.open({ artifactRoot: root, journalRoot: join(root, 'journal') }, origin, true);
  const author = await journal.read<{ signature: ContentSignature }>('author', attempt.attemptId);
  const receipt = await journal.read<{ captured: CapturedTask; signature: ContentSignature }>('capture', attempt.attemptId);
  if (!author || !receipt || !sameValue(receipt.captured, { artifacts: [candidateRef], reviewWorkspace: join(root, 'reviews', task.taskId) })
    || await journal.read('review', attempt.attemptId) || await exists(root, posix.dirname(candidateRef.location) + '/sealed.json')) {
    throw new Error('Select an unreviewed candidate with its original capture receipt.');
  }
  await journal.requireSignature(author.signature, task.inputs);
  const registry = new ArtifactRegistry(root, 'registry'), candidate = await registry.getCandidate(candidateRef), capture = await registry.getCapture(source);
  const inputs = [...dependencies, source], sourceRoot = 'authors/coding';
  const provenance = [attempt.sessionRef, ...requirement.sources.map(ref => ref.location)];
  if (state.codeDraftSource) provenance.push(state.codeDraftSource.artifactId + '@' + state.codeDraftSource.version);
  if (candidate.taskId !== task.taskId || candidate.authorId !== task.authorId || candidate.contextId !== task.context.contextId
    || !sameValue(candidate.inputs, inputs) || !sameValue(candidate.expectedDeps, inputs) || capture.taskId !== task.taskId
    || !sameValue(capture.ownership, { writePaths: ['src', 'index.html'], readOnlyPaths: ['_cosmos'] })
    || capture.sourceRoot !== sourceRoot || capture.metadata.kind !== 'code' || capture.metadata.provenance.kind !== 'original-procedural'
    || !sameValue(capture.metadata.provenance.sourceRefs, provenance) || !sameValue(capture.dependencies, dependencies)) {
    throw new Error('Candidate or code capture provenance changed.');
  }
  // The host builds and packages into project after capture. Only the originally mapped files belong to this receipt.
  const [original] = receipt.signature;
  const destinations = candidate.files.map(row => row.destination);
  noConflicts(destinations);
  if (receipt.signature.length !== 1 || original.location !== candidateRef.location
    || !sameValue(original.files.map(row => row.path).sort(), destinations.sort())) throw new Error('Original candidate file mapping changed.');
  for (const { path, sha256 } of original.files) {
    if (ordinaryDraftSha256(await regularFile(root, candidateRef.location + '/' + path)) !== sha256) throw new Error('Original candidate file changed.');
  }
  const fixed = await snapshot(join(root, source.location)), paths = [...fixed.keys()].sort();
  const signed = new Map(original.files.map(row => [row.path, row.sha256]));
  const codePath = (path: string) => path === 'index.html' || path.startsWith('src/');
  const mapped = candidate.files.filter(row => row.taskId === task.taskId || row.artifactRef.artifactId === source.artifactId || codePath(row.destination));
  if (!fixed.has('index.html') || !fixed.has('src/main.ts') || !sameValue(paths, [...signed.keys()].filter(codePath).sort())
    || !sameValue(paths, capture.files.map(row => row.destination).sort())
    || capture.files.some(row => row.source !== row.destination) || !sameValue(paths, mapped.map(row => row.destination).sort())
    || mapped.some(row => row.taskId !== task.taskId || !sameValue(row.artifactRef, source))) throw new Error('Captured code file mapping changed.');
  const files = new Map<string, Buffer>();
  for (const path of paths) {
    const bytes = fixed.get(path)!;
    if (ordinaryDraftSha256(bytes) !== signed.get(path)) throw new Error('Captured code differs from the signed candidate.');
    files.set(sourceRoot + '/' + path, bytes);
  }
  return files;
}

/** Selected bytes seed an editable draft. The new author still owns its complete output. */
export async function selectCodeDraft(location: string, design: ApprovedDesign, art: ApprovedArt, requirements: ConfirmedRequirementsSource,
  target: { root: string; runId?: string; ledgerId?: string }, expected?: ArtifactReference) {
  const root = resolve(location);
  if (within(root, target.root) || within(target.root, root) || await realpath(root) !== root) throw new Error('Code draft requires separate canonical roots.');
  const state = await readRunSnapshot(root);
  if (state.formatVersion !== 1 || state.run.runId === target.runId || state.ledger.ledgerId === target.ledgerId
    || !sameValue(state.requirementsSource, requirements) || !sameValue(state.designDraftReview, design.reference)
    || !sameValue(state.artDraftSource, art.reference)) throw new Error('Code draft requires the same confirmed requirements, approved design and approved art in an independent run.');
  const confirmed = await readReferencedRequirements(root, state);
  const { readPublicFundingBinding } = await import('./public-validation-funding.ts');
  await readPublicFundingBinding(root, state, false);
  await checkApprovedDesignImport(root, design);
  await checkApprovedArtImport(root, art);

  const planned = design.selection.tasks.find(item => item.role === 'coding')!, id = planned.task.taskId;
  const task = state.tasks.find(task => task.taskId === id);
  const dependencies = [...design.dependencies.map(item => item.ref), design.proof.design, art.proof.media];
  const inputs = [...confirmed.requirement.sources, ...dependencies];
  if (!task || !task.attempts.length || task.attempts.some(attempt => attempt.outcome === 'running')
    || task.review.verdict !== 'pending' || !sameValue(task.inputs, inputs) || !sameValue(task.ownership.writePaths, [sourceDirectory, entry])) {
    throw new Error('Select an unfinished ordinary coding task with the original inputs and pending review.');
  }
  const registry = new ArtifactRegistry(root, 'registry'), candidate = planned.expectedArtifacts![0];
  const source = registry.artifactRef('game-source', candidate.version);
  if (!sameValue(planned.expectedArtifacts, [registry.candidateRef('game', candidate.version)])
    || !sameValue(task.acceptance, planned.task.acceptance) || !sameValue(task.outputs, planned.task.outputs)) throw new Error('Original coding scope or candidate version changed.');
  const captured = task.artifacts.length > 0;
  if (!captured && (await exists(root, posix.dirname(source.location)) || await exists(root, posix.dirname(candidate.location))
    || await exists(root, `journal/task-${encodeURIComponent(id)}/capture.json`))) throw new Error('Coding capture differs from the task artifacts.');
  const files = captured ? await capturedFiles(root, state, task, confirmed.requirement, candidate, source, dependencies) : await workingFiles(root);
  if (!files.size) throw new Error('No editable code draft files.');
  for (const path of files.keys()) owns(task.ownership, path);
  const proof = { runId: state.run.runId, ledgerId: state.ledger.ledgerId, taskId: id, attemptId: task.attempts.at(-1)!.attemptId,
    requirements, design: design.reference, art: art.reference, ...(captured ? { candidate, source } : {}),
    files: [...files].map(([path, bytes]) => ({ path, sha256: ordinaryDraftSha256(bytes) })) };
  const reference = { artifactId: CODE_DRAFT, version: ordinaryDraftSha256(Buffer.from(JSON.stringify(proof))), location: root };
  if (expected && !sameValue(reference, expected)) throw new Error('Pinned code draft changed.');
  return { reference, files, proof };
}

export async function stageCodeDraft(root: string, files: Map<string, Buffer>, create: boolean) {
  if (create) {
    await directory(root, sourceDirectory);
    for (const [path, bytes] of files) {
      await directory(root, posix.dirname(path));
      await publishMatchingBytes(root, path, bytes);
    }
  }
  const staged = await workingFiles(root);
  if (staged.size !== files.size || [...files].some(([path, bytes]) => !staged.get(path)?.equals(bytes))) throw new Error('Staged code draft changed before the first coding attempt.');
}
