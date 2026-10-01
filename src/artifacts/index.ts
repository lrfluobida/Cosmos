import { lstat, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { ArtifactReference } from '../contracts/types.ts';
import { directory, fail, id, noConflicts, owns, pathName, regularFile, removeOwned, safePath, snapshot, text, within } from './paths.ts';
import { validateMedia, validateMetadata } from './media.ts';
import { OwnerLock } from '../runtime/recovery/ownership.ts';
import { OwnedWork } from '../runtime/recovery/owned-work.ts';
import type { AcceptedCandidate, Candidate, CandidateRequest, Capture, CaptureRequest, HostChecks, HostReview, PassedEvidence } from './types.ts';
export type * from './types.ts';

const copy = <T>(value: T): T => structuredClone(value);
const sameRef = (a: ArtifactReference, b: ArtifactReference) => a.artifactId === b.artifactId && a.version === b.version && a.location === b.location;
function fixedRef(ref: ArtifactReference): void { if (!ref) fail('Missing fixed artifact reference'); id(ref.artifactId); id(ref.version, true); pathName(ref.location); }
function refs(values: ArtifactReference[]): void {
  if (!Array.isArray(values)) fail('Expected fixed references');
  const seen = new Set<string>();
  for (const value of values) { fixedRef(value); const key = value.artifactId.toLowerCase(); if (seen.has(key)) fail('Duplicate artifact ID'); seen.add(key); }
}
const exists = async (path: string) => lstat(path).then(() => true, (error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return false; throw error; });
async function json<T>(root: string, name: string): Promise<T> { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regularFile(root, name))) as T; }
async function writeJson(path: string, value: unknown): Promise<void> { await writeFile(path, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' }); }

/** Trusted host API. Never expose this object or registry writes as model tools. */
export class ArtifactRegistry {
  #workspace: string;
  #root: string;
  #name: string;
  #work: OwnedWork;
  #signal: AbortSignal;
  #proofs = new WeakMap<PassedEvidence, { candidate: Candidate; files: Map<string, Buffer>; evidence: PassedEvidence; attemptId: string }>();
  constructor(workspace: string, name: string, signal?: AbortSignal, work?: OwnedWork) {
    this.#workspace = resolve(workspace); this.#name = pathName(name); this.#root = resolve(this.#workspace, name);
    this.#work = work ?? new OwnedWork(signal); this.#signal = signal ? AbortSignal.any([signal, this.#work.signal]) : this.#work.signal;
  }

  artifactRef(artifactId: string, version: string): ArtifactReference {
    return { artifactId: id(artifactId), version: id(version, true), location: `${this.#name}/captures/${artifactId}/${version}/files` };
  }
  candidateRef(artifactId: string, version: string): ArtifactReference {
    return { artifactId: id(artifactId), version: id(version, true), location: `${this.#name}/candidates/${artifactId}/${version}/project` };
  }
  #refPath(ref: ArtifactReference, kind: 'captures' | 'candidates'): string {
    fixedRef(ref);
    const expected = kind === 'captures' ? this.artifactRef(ref.artifactId, ref.version) : this.candidateRef(ref.artifactId, ref.version);
    if (!sameRef(ref, expected)) fail('Fixed reference location does not match registry');
    return `${kind}/${ref.artifactId}/${ref.version}`;
  }
  async #exclusive<T>(action: () => Promise<T>, untrackedWriters = false): Promise<T> {
    return this.#work.run(async () => {
      this.#signal.throwIfAborted();
      await safePath(this.#root, '.commit.lock');
      const lock = await OwnerLock.acquire(this.#root, '.commit.lock', untrackedWriters).catch(() => fail('Registry commit is busy or ownership is unresolved'));
      try { this.#signal.throwIfAborted(); return await action(); }
      finally { await lock.close(); }
    });
  }
  async recoverOwnership() { await safePath(this.#root, '.commit.lock'); return OwnerLock.recover(this.#root, '.commit.lock'); }
  cancelAndDrain(reason: string, timeoutMs?: number): Promise<void> { return this.#work.cancelAndDrain(reason, timeoutMs); }
  async #commit<T>(path: string, create: (temporary: string) => Promise<T>): Promise<T> {
    const destination = await safePath(this.#root, path);
    if (await exists(destination)) fail('Immutable version already exists');
    const temporary = await directory(this.#root, `tmp/${randomUUID()}`);
    try {
      const result = await create(temporary);
      await directory(this.#root, path.slice(0, path.lastIndexOf('/')));
      await safePath(this.#root, path);
      this.#signal.throwIfAborted();
      await rename(temporary, destination);
      return result;
    } finally { await removeOwned(this.#root, temporary); }
  }
  async getCapture(ref: ArtifactReference): Promise<Capture> {
    const capture = await json<Capture>(this.#root, `${this.#refPath(ref, 'captures')}/capture.json`);
    if (!sameRef(ref, capture.artifactRef)) fail('Capture reference mismatch');
    return capture;
  }
  async getCandidate(ref: ArtifactReference): Promise<Candidate> {
    const candidate = await json<Candidate>(this.#root, `${this.#refPath(ref, 'candidates')}/candidate.json`);
    if (!sameRef(ref, candidate.candidateRef) || candidate.targetRoot !== ref.location) fail('Candidate reference mismatch');
    return candidate;
  }
  async registerCapture(input: CaptureRequest): Promise<Capture> {
    const request = copy(input);
    return this.#exclusive(async () => {
      const location = this.#refPath(request.artifactRef, 'captures'); text(request.taskId, 'task ID');
      const source = await safePath(this.#workspace, request.sourceRoot);
      if (within(this.#root, source)) fail('Author source cannot be inside host registry');
      if (!Array.isArray(request.files) || !request.files.length) fail('Capture requires files');
      noConflicts(request.files.map(file => file.destination));
      for (const file of request.files) { pathName(file.source); owns(request.ownership, file.destination); }
      validateMetadata(request.metadata); refs(request.dependencies);
      for (const dependency of request.dependencies) await this.getCapture(dependency);
      return this.#commit(location, async temporary => {
        const files = await directory(temporary, 'files');
        for (const file of request.files) {
          const original = await safePath(source, file.source);
          if (within(this.#root, original)) fail('Source file is inside host registry');
          const bytes = await regularFile(source, file.source);
          const destination = await safePath(files, file.destination);
          await directory(files, file.destination.includes('/') ? file.destination.slice(0, file.destination.lastIndexOf('/')) : '.');
          await writeFile(destination, bytes, { flag: 'wx' });
        }
        if (request.metadata.media) await validateMedia(request.metadata.media, files, request.files.map(file => file.destination));
        const capture: Capture = { ...request, capturedAt: new Date().toISOString() };
        await writeJson(join(temporary, 'capture.json'), capture); return capture;
      });
    });
  }
  async stageCandidate(input: CandidateRequest): Promise<Candidate> {
    const request = copy(input);
    return this.#exclusive(async () => {
      const location = this.#refPath(request.candidateRef, 'candidates');
      if (request.targetRoot !== request.candidateRef.location) fail('Candidate targetRoot must be its host-owned fixed location');
      for (const key of ['taskId', 'authorId', 'contextId'] as const) text(request[key], key);
      refs(request.inputs); refs(request.expectedDeps);
      if (!request.inputs.length) fail('Candidate requires fixed inputs');
      for (const required of request.expectedDeps) if (!request.inputs.some(ref => sameRef(ref, required))) fail(`Missing required version ${required.artifactId}@${required.version}`);
      const captures: Capture[] = [];
      for (const ref of request.inputs) captures.push(await this.getCapture(ref));
      const requirements = request.mediaRequirements ?? [];
      refs(requirements.map(item => item.artifactRef));
      for (const requirement of requirements) if (!captures.some(capture => sameRef(capture.artifactRef, requirement.artifactRef) && capture.metadata.media)) fail('Media requirement has no selected media input');
      for (const capture of captures) {
        for (const dependency of capture.dependencies) if (!request.inputs.some(ref => sameRef(ref, dependency))) fail(`Missing dependency version ${dependency.artifactId}@${dependency.version}`);
        if (capture.metadata.media && !requirements.some(item => sameRef(item.artifactRef, capture.artifactRef) && isDeepStrictEqual(item.media, capture.metadata.media))) fail('Consumer media interface/state contract mismatch');
      }
      const files = captures.flatMap(capture => capture.files.map(file => ({ destination: file.destination, taskId: capture.taskId, artifactRef: capture.artifactRef })));
      noConflicts(files.map(file => file.destination));
      for (const file of files) owns(request.ownership, file.destination);
      return this.#commit(location, async temporary => {
        const project = await directory(temporary, 'project');
        for (const capture of captures) {
          const source = await safePath(this.#workspace, capture.artifactRef.location);
          if (capture.metadata.media) await validateMedia(capture.metadata.media, source, capture.files.map(file => file.destination));
          for (const file of capture.files) {
            const bytes = await regularFile(source, file.destination);
            const destination = await safePath(project, file.destination);
            await directory(project, file.destination.includes('/') ? file.destination.slice(0, file.destination.lastIndexOf('/')) : '.');
            await writeFile(destination, bytes, { flag: 'wx' });
          }
        }
        const candidate: Candidate = { ...request, stagedAt: new Date().toISOString(), files };
        await writeJson(join(temporary, 'candidate.json'), candidate); return candidate;
      });
    });
  }
  async #unchangedSources(candidate: Candidate): Promise<string> {
    const project = await safePath(this.#workspace, candidate.targetRoot);
    for (const file of candidate.files) {
      const source = await safePath(this.#workspace, file.artifactRef.location);
      if (!(await regularFile(project, file.destination)).equals(await regularFile(source, file.destination))) fail(`Candidate source snapshot changed: ${file.destination}`);
    }
    return project;
  }
  async verifyCandidate(ref: ArtifactReference, checks: HostChecks): Promise<PassedEvidence> {
    return this.#exclusive(async () => {
      const location = this.#refPath(ref, 'candidates');
      if (await exists(await safePath(this.#root, `${location}/sealed.json`))) fail('Accepted/sealed candidates cannot re-enter a writable build');
      const attemptId = randomUUID();
      await writeFile(await safePath(this.#root, `${location}/attempt.json`), JSON.stringify({ attemptId }) + '\n', 'utf8');
      const candidate = await this.getCandidate(ref), project = await this.#unchangedSources(candidate);
      if (typeof checks.build !== 'function') fail('Host build callback is required');
      const build = copy(await checks.build(copy(candidate), project));
      this.#signal.throwIfAborted();
      const passed = (result: { passed: boolean; evidenceIds: string[] }, name: string) => {
        if (!result || result.passed !== true || !Array.isArray(result.evidenceIds) || !result.evidenceIds.length || result.evidenceIds.some(id => typeof id !== 'string' || !id.trim())) fail(`${name} did not pass with host evidence`);
      };
      passed(build, 'Build');
      const acceptance = checks.acceptance ? copy(await checks.acceptance(copy(candidate), project)) : undefined;
      this.#signal.throwIfAborted();
      if (checks.acceptance) passed(acceptance!, 'Acceptance');
      await this.#unchangedSources(candidate);
      const evidence: PassedEvidence = { candidateRef: copy(ref), attemptId, build, ...(acceptance ? { acceptance } : {}), verifiedAt: new Date().toISOString() };
      const files = await snapshot(project);
      this.#signal.throwIfAborted();
      this.#proofs.set(evidence, { candidate, files, evidence: copy(evidence), attemptId });
      return evidence;
    }, true);
  }
  async promoteCandidate(ref: ArtifactReference, input: { evidence: PassedEvidence; review: HostReview }): Promise<AcceptedCandidate> {
    return this.#exclusive(async () => {
      const proof = this.#proofs.get(input.evidence);
      if (!proof || !isDeepStrictEqual(proof.evidence, input.evidence) || !sameRef(proof.evidence.candidateRef, ref)) fail('Host-issued evidence for this exact candidate is required');
      const location = this.#refPath(ref, 'candidates');
      const attempt = await json<{ attemptId: string }>(this.#root, `${location}/attempt.json`);
      if (attempt.attemptId !== proof.attemptId || input.evidence.attemptId !== proof.attemptId) fail('Host evidence was superseded by another verification attempt');
      const candidate = await this.getCandidate(ref), review = copy(input.review);
      if (!isDeepStrictEqual(candidate, proof.candidate)) fail('Candidate manifest changed after verification');
      if (!review || review.verdict !== 'approved' || !review.candidateRef || !sameRef(ref, review.candidateRef) || review.attemptId !== proof.attemptId
        || !review.reviewerId || review.reviewerId === candidate.authorId || !review.contextId || review.contextId === candidate.contextId
        || !Array.isArray(review.evidenceIds) || !review.evidenceIds.length || review.evidenceIds.some(id => typeof id !== 'string' || !id.trim())) fail('Independent host review for this exact candidate version and verification attempt is required');
      const files = await snapshot(await this.#unchangedSources(candidate));
      if (files.size !== proof.files.size || [...files].some(([name, bytes]) => !proof.files.get(name)?.equals(bytes))) fail('Candidate snapshot changed after verification');
      const seal = await safePath(this.#root, `${location}/sealed.json`);
      this.#signal.throwIfAborted();
      if (!await exists(seal)) await writeJson(seal, { candidateRef: ref });
      const accepted: AcceptedCandidate = { candidateRef: copy(ref), targetRoot: candidate.targetRoot, evidence: copy(input.evidence), review, acceptedAt: new Date().toISOString() };
      const temporary = await safePath(this.#root, `tmp/current-${randomUUID()}.json`);
      try {
        await writeJson(temporary, accepted);
        const current = await safePath(this.#root, 'current.json');
        this.#signal.throwIfAborted();
        await rename(temporary, current);
      } finally { await removeOwned(this.#root, temporary); }
      this.#proofs.delete(input.evidence); return accepted;
    });
  }
  async current(): Promise<AcceptedCandidate | null> {
    const path = await safePath(this.#root, 'current.json');
    if (!await exists(path)) return null;
    const accepted = await json<AcceptedCandidate>(this.#root, 'current.json');
    await this.getCandidate(accepted.candidateRef); return accepted;
  }
}

export async function createArtifactRegistry(options: { workspaceRoot: string; registryRoot: string; signal?: AbortSignal; work?: OwnedWork }): Promise<ArtifactRegistry> {
  const workspace = resolve(options.workspaceRoot); pathName(options.registryRoot);
  await safePath(workspace); await directory(workspace, options.registryRoot);
  const root = resolve(workspace, options.registryRoot);
  for (const name of ['captures', 'candidates', 'tmp']) await directory(root, name);
  return new ArtifactRegistry(workspace, options.registryRoot, options.signal, options.work);
}
