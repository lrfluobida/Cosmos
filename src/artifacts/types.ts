import type { ArtifactReference, TaskContract } from '../contracts/types.ts';
import type { CharacterManifest } from '../media/vector.ts';
import type { AudioManifest } from '../media/audio.ts';

export type Ownership = TaskContract['ownership'];
/** Host-checked source facts. A model's assertion is not a license decision. */
export type Provenance = { kind: 'original-procedural'; generator: string; sourceRefs: string[] }
  | { kind: 'licensed' | 'generated'; sourceRefs: string[]; license: string; redistributionEvidence: string; provider?: string };
export interface MediaMetadata {
  characters: { directory: string; manifest: CharacterManifest }[];
  audio: { directory: string; manifest: AudioManifest }[];
}
export interface CaptureRequest {
  taskId: string;
  artifactRef: ArtifactReference;
  sourceRoot: string;
  files: { source: string; destination: string }[];
  ownership: Ownership;
  metadata: { kind: 'code' | 'media' | 'data'; provenance: Provenance; media?: MediaMetadata };
  dependencies: ArtifactReference[];
}
export interface Capture extends CaptureRequest { capturedAt: string }
export interface CandidateRequest {
  taskId: string; authorId: string; contextId: string;
  candidateRef: ArtifactReference;
  /** Workspace-relative host-owned project location returned by candidateRef(). */
  targetRoot: string;
  inputs: ArtifactReference[];
  expectedDeps: ArtifactReference[];
  ownership: Ownership;
  /** Exact media interface consumed by code. Required for every media input. */
  mediaRequirements?: { artifactRef: ArtifactReference; media: MediaMetadata }[];
}
export interface Candidate extends CandidateRequest {
  stagedAt: string;
  files: { destination: string; taskId: string; artifactRef: ArtifactReference }[];
}
export interface CheckResult { passed: boolean; evidenceIds: string[] }
export interface PassedEvidence {
  candidateRef: ArtifactReference;
  attemptId: string;
  build: CheckResult;
  acceptance?: CheckResult;
  verifiedAt: string;
}
export interface HostReview {
  candidateRef: ArtifactReference;
  /** The exact host verification attempt inspected by this reviewer. */
  attemptId: string;
  reviewerId: string; contextId: string;
  verdict: 'approved' | 'changes_requested';
  evidenceIds: string[];
}
export interface AcceptedCandidate { candidateRef: ArtifactReference; targetRoot: string; evidence: PassedEvidence; review: HostReview; acceptedAt: string }
export interface HostChecks {
  build: (candidate: Candidate, absoluteProjectRoot: string) => Promise<CheckResult>;
  acceptance?: (candidate: Candidate, absoluteProjectRoot: string) => Promise<CheckResult>;
}
