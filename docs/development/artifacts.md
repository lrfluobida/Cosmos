# COS-09 artifact registry and integration

`src/artifacts/index.ts` is a trusted host API for capturing code and generated media, combining exact versions, verifying a complete candidate and promoting it after independent review. It reuses `ArtifactReference` and task ownership from `src/contracts/types.ts`. It makes no model/provider calls and adds no dependencies.

## Host boundary and fixed versions

Create a registry with `createArtifactRegistry({ workspaceRoot, registryRoot })`. `workspaceRoot` is an absolute workspace directory; `registryRoot` is a relative host-owned directory, for example `.cosmos/registry`.

The host must give model file tools only their author workspace paths. **Do not expose the registry API, registry directories, candidate directories or build/review callbacks as model-writable tools.** The host checks provenance facts before registration. These API checks are not an OS sandbox or an ACL boundary against other processes running as the same user. Build/acceptance callbacks are trusted host code; an arbitrary model-produced shell command is not a trusted callback.

`artifactRef(id, version)` returns the canonical `ArtifactReference` location under `captures/id/version/files`. `candidateRef(id, version)` returns the location under `candidates/id/version/project`. Moving names such as `latest`, `main` and `HEAD` are rejected. Consumers pass the complete reference, including its location. Registration cannot replace an existing ID/version, even with nominally identical content. Use a new version for changes.

Source files are copied, never linked, into the registry before a capture becomes visible. Changing the author workspace does not change registered inputs. Sources, destination paths, IDs and ownership are validated; directory traversal, Windows device names, path aliases, links/junctions and hard-linked files are rejected. Target roots are derived from the registry. File destinations must be inside both capture and integration ownership and outside read-only paths. Case-insensitive duplicates and file/directory prefix conflicts are rejected, including conflicts between tasks.

## API sequence

```typescript
const registry = await createArtifactRegistry({ workspaceRoot, registryRoot: '.cosmos/registry' });
const captured = await registry.registerCapture({
  taskId: 'art-task',
  artifactRef: registry.artifactRef('robot-media', 'v1'),
  sourceRoot: 'authors/art',
  files: [/* { source: 'idle-000.svg', destination: 'public/robot/idle-000.svg' }, ... */],
  ownership: { writePaths: ['public/robot'], readOnlyPaths: [] },
  metadata: { kind: 'media', provenance: hostCheckedProvenance, media },
  dependencies: [],
});
const candidateRef = registry.candidateRef('project', 'v1');
const candidate = await registry.stageCandidate({
  taskId: 'integration', authorId: 'producer', contextId: 'producer-context',
  candidateRef, targetRoot: candidateRef.location,
  inputs: [captured.artifactRef, code.artifactRef],
  expectedDeps: [captured.artifactRef, code.artifactRef],
  ownership: { writePaths: ['src', 'public', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html'], readOnlyPaths: [] },
  mediaRequirements: [{ artifactRef: captured.artifactRef, media }],
});
const evidence = await registry.verifyCandidate(candidate.candidateRef, {
  build: async (fixedCandidate, absoluteProjectRoot) => hostBuild(fixedCandidate, absoluteProjectRoot),
  acceptance: async (fixedCandidate, absoluteProjectRoot) => hostAcceptance(fixedCandidate, absoluteProjectRoot),
});
// The independent reviewer inspects this evidence attempt and returns
// hostReview with candidateRef and attemptId: evidence.attemptId.
await registry.promoteCandidate(candidate.candidateRef, { evidence, review: hostReview });
const accepted = await registry.current();
```

All source/destination and ownership paths use relative `/` notation. `.` is allowed for a root ownership grant. `files` maps producer paths to their final project destinations. Capture metadata stores task, source, files, dependencies, ownership and provenance. The candidate manifest records the fixed input combination and the task responsible for each output file. `getCapture(ref)` and `getCandidate(ref)` read these manifests without resolving a moving version.

`expectedDeps` lists the host's required versions. Each must be selected in `inputs`, and each selected capture's own dependencies must also appear at their exact versions. `mediaRequirements` is the code consumer's exact media interface for every selected media capture. Wrong state names, frame sequences/counts, dimensions, anchors, frame rates or audio settings fail integration before a candidate is published.

## Media and provenance

`MediaMetadata` contains `characters: [{ directory, manifest }]` and `audio: [{ directory, manifest }]`. Directories are final project destinations. Manifests use the approved `CharacterManifest` and `AudioManifest` interfaces from `src/media/`.

- Character files must match `cosmos-vector-v1`: transparent 16–512 pixel canvases, consistent pixel anchor and normalized origin, unique state names, explicit ordered frame filenames, 1–60 fps and bounded frame counts. Actual UTF-8 SVG files must have matching dimensions/viewBox and contain only the local renderer's group/rectangle/ellipse vocabulary. Scripts, external references, CSS, XML entities and other markup are rejected.
- Audio files must match `pcm-s16le`: mono PCM16 RIFF/WAVE, a supported sample rate, exact header/data lengths and sample count/duration. Actual sample peaks are checked against metadata, allowing quantization tolerance. This implementation intentionally accepts the local renderer's canonical WAV header rather than arbitrary WAV extensions.
- Missing and unreferenced SVG/WAV files in a media capture fail validation. Registration validates the copied files, and staging revalidates the fixed registered files.
- `original-procedural` provenance records generator and source references. `licensed` and `generated` provenance require an explicit license and redistribution evidence; generated media also requires the provider. Unknown/unverified/free-without-evidence claims are rejected. Strings are provenance records, not a license verifier: the host must check the referenced source/terms, and the review must not treat model text as permission.

Other formats, texture atlases, fonts and external asset services are not implemented here. Code is built by the host callback; this layer does not statically prove every dynamic string in a game refers to a valid asset. The exact media interface and actual engine acceptance cover that boundary.

## Verification and promotion

The build callback is mandatory. Acceptance is optional for library callers and required by the host when a task's acceptance contract needs it. Each callback returns `{ passed: true, evidenceIds: [...] }` only after observing its real checks. The probe builds a byte-identical source copy in a separate directory, then copies only `dist` back into the candidate. Dependencies remain outside the accepted payload.

`verifyCandidate` checks source bytes against fixed captures before and after callbacks, then records the complete candidate file set and bytes in host memory. The returned `PassedEvidence` object is an instance-local capability; deserialized or model-authored copies cannot promote. A subsequent verification attempt invalidates old evidence, including attempts by another registry instance. Modifying any source, build output, adding/removing a file or changing the candidate manifest after verification invalidates promotion. No content hashes are needed for this byte comparison.

Review must identify the same candidate reference and `attemptId` as the returned `PassedEvidence`, approve that attempt, attach evidence and use reviewer/context IDs different from the producer's. A review from attempt A cannot approve a subsequent attempt B of the same candidate, even if the host has fresh passing evidence for B; B needs its own review. Only the trusted host may supply that review. The accepted project is sealed against further build callbacks before an atomic rename replaces `current.json`. The pointer is the promotion commit point. A failed validation, capture, stage, build, acceptance or review cannot replace the last accepted pointer or files. Old accepted versions remain readable and cannot re-enter a mutable build, including after restart.

Each mutating operation takes an exclusive `.commit.lock`; contention reports `Registry commit is busy` instead of racing. Temp directories are removed on ordinary failures. If the host process is killed, uncommitted temp files or a lock may remain. The host must establish that the old process has stopped before cleaning these up; there is no timeout-based lock stealing. A crash after sealing but before the pointer commit can leave a sealed, unpromoted candidate; preserve it and use a new candidate version if the in-memory verification capability was lost. Previously accepted state and capture snapshots survive restart. Durable recovery of unpromoted verification capabilities and parallel scheduling belong to later runtime work.

On Windows, an open file handle without `FileShare.Delete` can deny the atomic temporary-directory rename with `EPERM`, even when the immutable destination is absent. Capture and stage publication allow at most six attempts for this error, with 25/50/100/200/400 ms abortable delays and a one-second retry window. Before each attempt, the host rechecks the temporary and destination paths, absent immutable destination, unchanged commit owner and original cancellation signal. Other errors, an existing version, changed owner or unsafe path stop publication; persistent `EPERM` remains a failure. This retries only the local atomic rename and does not repeat model calls or extend a run/case deadline. If persistent sharing also blocks temporary-file cleanup, preserve the remaining host-owned temporary files for diagnosis after the owning process has stopped.

The focused `registry-publication.test.ts` uses a real Windows file handle to produce `EPERM / syscall=rename` at `ArtifactRegistry.#commit`, then releases that handle and checks publication. It also covers bounded persistent denial, cancellation during the delay, an appearing immutable version, ownership change, junction change and immediate failure for other errors. This establishes a reproducible sharing failure pattern; it does not identify the process responsible for the earlier native template-capture failure. A separate zero-model diagnostic successfully published requirements and template captures under the real E: workspace at that time. Consumed validation cases retain their original failure and cannot be reopened by this fix.

## Evidence and scope

Run the focused suite with:

```powershell
node --experimental-strip-types --test tests/artifacts/registry.test.ts
node --experimental-strip-types --test tests/artifacts/registry-publication.test.ts
npm run typecheck
npm run build
```

The test-first suite uses actual temporary files and generated SVG/WAV bytes. It covers immutable capture, partial failure cleanup, missing assets, stale dependencies, duplicate/prefix/case path conflicts, ownership, junction rejection, media contract mismatch, SVG dimensions and script rejection, WAV mismatch, anchors, unknown rights, host evidence/review gates, failed-build preservation, sealing across restart and exclusive commits. The sealing and stale-evidence regression tests first failed for missing rejection, then passed after the guards were implemented.

`node --experimental-strip-types probes/artifacts/phaser.ts` initializes a new generic project through the existing CLI, registers the approved COS-04 sample's 14 SVG frames and five WAVs, stages exact code/media versions, builds via the existing CLI and tests the resulting candidate in installed Microsoft Edge. It uses ordinary canvas mouse clicks for idle/attack/death and all sound triggers. Read-only observations check complete frame order, actual loaded textures/audio, decoded audio durations/channels and stable dimensions/origins. The author visually inspects the dark/light screenshots for anchors and clipping.

The [verification record](../../probes/artifacts/evidence/verification.json) records Microsoft Edge 153.0.4234.48, zero external calls/fees, candidate references and observations. [Idle](../../probes/artifacts/evidence/01-idle-dark-light.png), [attack](../../probes/artifacts/evidence/02-attack-dark-light.png) and [death](../../probes/artifacts/evidence/03-death-dark-light.png) show the engine-rendered character on both backgrounds. Author inspection found the shared ground anchor stable, attack/death readable and no visible canvas clipping. All 14 textures and five sounds loaded, normal mouse inputs traversed all frames and triggered all five sounds, and loader/page/console errors were empty. Phaser decoded the 22050 Hz sources into its 48000 Hz audio context with matching durations and mono channels. Generated assets, source project, fixed snapshots, build dependencies and full build log are under ignored `.cosmos/artifacts-probe/`.

This is an authored generic integration probe, not a runtime-generated game, a Plants vs. Zombies implementation, or proof of full-generation cost/time. The probe exercises the host review API with deterministic checks; independent implementation review remains a separate workflow. All five sounds are triggered while muted, so human listening quality remains unverified.
