# Runtime roles and bounded planning

COS-07 connects the pinned native pi adapter, COS-02 contracts and the existing shared RunController. It exposes programmatic APIs; CLI integration and real game generation belong to COS-10.

## Requirement confirmation

`prepareClarification` takes a one-sentence brief, 1–12 host-supplied concentrated questions, answers, versioned sources and an acceptance draft. It reports every missing answer. `confirmRequirements` requires all answers and an explicit `{ confirmed: true, actorId, at }` from the user. The host presents the exact draft and answers before calling it and saves that record at the declared source reference. The resulting RequirementContract is frozen.

This deterministic phase has no model calls. Create a formal generation controller only after confirmation and environment preparation. A capability probe reuses its existing validation controller and its remaining original deadline. Paid planning always uses a predeclared allocation on that controller; this module never creates a new ledger.

```ts
import { prepareClarification, confirmRequirements } from '../src/roles/requirements.ts';

const draft = prepareClarification({
  brief, specVersion, sources, acceptance, questions, answers,
});
// Show draft to the user and persist their explicit confirmation with its source.
const requirement = confirmRequirements(draft, userConfirmation);
```

The host supplies the questions and acceptance draft. Missing decisions are not filled with defaults or recorded as confirmed by a model. This is an API boundary, not user authentication; callers must not fabricate confirmation.

## Native role factory

`createRoleFactory` creates Cosmos, design, coding, art and temporary reviewer sessions using `createPiSession`. The production path stays on native `deepseek-flash`; thinking defaults to `low`, with an explicit host option for escalation. Session request count, output size, timeout and maximum request cost are mandatory. Tests inject a session factory and make no paid calls.

Each role receives a newly serialized packet containing only its acceptance subset, fixed input versions, relevant interfaces/rules/failures, tool names, ownership and shared budget reference. Author summaries, handoff prose and session history are excluded from reviewer packets. Reviewer actor/context IDs and session directories differ from the author's.

File tools use `createWorkspaceTools`. Author writes must stay under declared write paths; read-only paths and fixed input/interface paths cannot overlap those writes. Every path comparison resolves against the role's canonical workspace, including mixed absolute/relative paths and cross-task write conflicts. Reviewer file tools have no writes. Host tools are additionally filtered by the task's declared names and the host's `readOnly` capability. Unknown tool names are never auto-loaded. No model tool receives RunController.

Host tools for builds, media or browser acceptance are trusted integrations: they must enforce their own fixed arguments, file ownership, timeouts and cancellation. Every child process must receive the supplied `childEnv` (or `roleToolEnvironment()`), which allowlists ordinary OS variables and excludes model credentials. Do not use `process.env` for a child environment. Read-only declarations are host capabilities; they are not an OS sandbox guarantee. Keep run/session directories outside author write scopes and keep credentials out of tool arguments, output, prompts and artifacts.

## Production entrypoints

`planTaskDag` asks Cosmos for a bounded plan derived from the confirmed requirements. The model chooses only task IDs, roles, objectives, acceptance IDs and dependencies. Host role policies supply workspaces, paths, tools, interfaces, output IDs/versions and allocations. The host rejects added authority fields, missing acceptance coverage, cycles, unknown roles, duplicate tasks and excessive allocations. The legacy `roles` option permits at most one task for each configured role. Alternatively, `taskPolicies: PlanningTaskPolicy[]` declares 1–100 unique host slots, each with `policyId`, `role` and the same fixed policy fields. A draft must select an existing `policyId` at most once and match its role. Multiple slots may use coding or art without copying an allocation or output scope. Supply exactly one of `roles` and `taskPolicies`.

Every confirmed `RequirementContract.sources` reference must be present at the exact artifact ID, version and location in `availableArtifacts` before planning dispatches a model call. These sources enter the planning packet and read-only scopes. The host must stage the actual brief, clarification answers and confirmation source inside the planning workspace at those paths so the scoped read tool can read them. Merely listing a path does not supply its contents; integrations using a separate artifact reader must provide an equivalently safe, version-bound read capability rather than omitting the sources.

Dependency output references come from the host policy, with explicit artifact ID, version and location. The host binds these into downstream TaskContract inputs. They remain unavailable until the dependency passes with those exact captured versions. There is no `latest` lookup and no model-supplied dependency state.

The planning session produces a `validated_proposal` artifact and a session directory. It does not mark a gameplay task passed. On failure it keeps a planning handoff. Planning usage is recorded against `planningTaskId` in the existing ledger. `executeTaskDag` atomically registers validated execution tasks and adds their allocations from the remaining unallocated amount. Existing allocations, entries, run identity and original deadline cannot change.

```ts
import { createRoleFactory } from '../src/roles/factory.ts';
import { planTaskDag } from '../src/roles/planner.ts';
import { executeTaskDag } from '../src/runtime/orchestrator.ts';

// controller already owns the one shared ledger, including a planning allocation.
const roleFactory = createRoleFactory({
  maxOutputTokens: 2048,
  maxRequests: 8,
  requestTimeoutMs: 120_000,
  // Conservative example: full 1M native context at the pinned peak CNY rate.
  estimatedMaxCostMicroCny: 1_000_000 * 2 + 2048 * 8,
  hostTools: async ({ role, workspace, signal, childEnv }) =>
    makeHostTools({ role, workspace, signal, childEnv }),
});
const plan = await planTaskDag({
  controller, requirement, planningTaskId: 'planning',
  workspace: planningWorkspace, sessionRoot, availableArtifacts,
  roleFactory,
  // Generic host policies; they contain no target-game code or task objectives.
  roles: {
    design: designPolicy,
    art: artPolicy,
    coding: codingPolicy,
  },
});
const tasks = await executeTaskDag({
  controller, requirement, tasks: plan.tasks, sessionRoot, availableArtifacts,
  roleFactory, signal,
  capture: captureVersionedOutputs,
  verify: runHostAcceptance,
  reviewImages: loadFixedReviewImages,
});
```

Policy shape is exported as `PlanningRolePolicy`. Example generic coding policy:

```ts
const codingPolicy = {
  workspace: codingWorkspace,
  allocationMicroCny: 5_000_000,
  writePaths: ['game/src'], readOnlyPaths: ['requirements', 'artifacts'],
  tools: ['read', 'write', 'edit', 'build'],
  outputs: [{ artifactId: 'code', version: 'v1', destination: 'artifacts/code/v1',
    type: 'game-source', schema: 'game-source/1' }],
};
```

All acceptance steps and expected values are copied from the confirmed requirement. The host must use meaningful acceptance items for design/media/code outputs; it cannot reinterpret a gameplay pass as a planning or static-document pass. Unsupported intermediate acceptance is a requirement/planning gap, not permission to manufacture evidence. The module also accepts an already prepared DAG for trusted callers and targeted repairs; the standard initial generation path uses the planner.

## Host callback contracts

- `capture(task, proposal, signal)` creates an immutable versioned snapshot, returns `{ artifacts, reviewWorkspace }`, and preserves the declared relative paths there. Its workspace must differ from the author's. `proposal` contains only summary, remaining work and uncertainty; it cannot supply evidence, review IDs or passed state. For planner tasks, captured references must match the exact planned outputs.
- `verify(task, signal)` executes the real checks on those frozen artifacts and returns EvidenceContract records. Passing evidence must belong to the task and acceptance IDs, use the required evidence kind, and include every current input and output reference. Store reports at the declared source versions. A model-written test summary is not host evidence.
- `reviewImages(task, signal)` optionally returns `{ source, image: ImageContent }[]`. The host reads actual image bytes from the frozen snapshot/evidence. Sources must exactly match pinned inputs, outputs or evidence sources. Up to eight PNG/JPEG/WebP images, each at most eight million base64 characters, reach the native pi prompt. Images are attached only to review. The host guarantees the bytes match the cited source version; a path or text report alone is not a visual review.

Artifact and evidence locations used by file tools must resolve within each role's workspace. The host stages the corresponding snapshots at those paths. The artifact registry/integration module can implement capture; COS-07 does not copy or replace its implementation.

The order is author proposal → host capture → host checks → independent review proposal → contract validation → passed. Reviewers cannot rewrite evidence, artifact versions or acceptance. Approval requires the selected evidence IDs themselves to cover every acceptance item with the required evidence kind and every current input/output version. Historical evidence remains recorded but cannot substitute for current selected evidence. A changed version, failed dependency, missing evidence, unresolved handoff, author self-approval or cancelled signal cannot pass.

## Budget, stop and recovery boundary

Every native request uses `reserve` then `admit`, including SDK compaction. The pricing version is `deepseek-flash-peak-cny-2026-10-01`, matching the reviewed provider probe: per million tokens CNY 2 uncached, 0.04 cached and 8 output. Actual native usage is normalized to integer micro-CNY. The caller's maximum reservation must cover the whole request context and images.

Responses first enter durable unknown state, then their usage receipt is written, then they settle/cancel. `RunController.coordinateAccounting` keeps each role's reserve/admit or complete response-accounting operation from interleaving with another; network calls remain concurrent. Other paid host integrations must use the same coordination API when running alongside roles. Receipt persistence failure retains unknown exposure and blocks new paid work. Responses without confirmed usage or model identity remain unknown. A proven native `not_sent` outcome can release its reservation. No API key is serialized.

Execution is bounded to one attempt per task and at most 100 prepared tasks. The default API remains serial; `scheduling: {}` enables up to two ready tasks with declared host resource limits. Recovery and calls with review protocol correction use one task at a time so their existing quiet-ledger checks remain valid. Each attempt has separate author/reviewer directories; TaskContract stores attempts, artifacts, evidence, review and handoff through RunController. Stops are checked before every new session and tool invocation. Host callbacks must also obey their signal. Failed dependencies stay waiting and cancellation preserves handoff and captured artifacts. No new task is dispatched after cancellation. See [scheduler boundaries and evidence](scheduler.md).

Native roles expose `compact(signal)` for a host-controlled idle session. `compactionKeepRecentTokens` forwards the existing pi setting; compaction uses the same request limits, shared allocation and original deadline. The fixed system packet continues to supply acceptance, interfaces, input versions, ownership, budget and known failures after compaction. SDK split-turn summaries do not necessarily repeat the custom preservation instructions, so summary text is never the authority source. The host must not compact concurrently with a prompt. Single-prompt tool chains do not gain automatic compaction or overflow retries; use bounded tasks and the existing request/output limits.

This layer returns task results, not a claim that the overall game/run is complete. COS-11 supplies constrained linked repairs, COS-12 supplies explicit journal recovery, and COS-13 supplies optional bounded scheduling. No model can reallocate funds or silently reopen recorded task IDs. Reuse completed task evidence.

## Verification

Offline tests cover explicit confirmation, host-controlled planning and acceptance coverage, role write/read permissions, host tool filtering, secret-free child environments, dependency ordering, fixed outputs and review images, missing/stale evidence, independent review, handoff preservation, cancellation and shared budget settlement/unknown states. No target game is hand-written by these tests and no paid service is called.
