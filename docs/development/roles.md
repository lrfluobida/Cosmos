# Runtime roles and bounded planning

COS-07 connects the pinned native pi adapter, COS-02 contracts and the existing shared RunController. Its programmatic APIs are used by the fixed COS-10 probe and the COS-18 product CLI; their completion evidence remains separate.

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

### COS-18 native intake and product host

`requestDesignQuestions` and `requestDesignDraft` use native design sessions without game-generation tools. The host capability description is part of each durable input identity. Completed replies can be reused only for the exact original input; an intent without a reply blocks blind retry. The public CLI records actual stdin answers, displays the current revision in ordinary language and accepts only an explicit confirmation of that revision.

`IntakeController` holds the one generation ledger before a formal deadline exists. `activateGeneration` atomically replaces that intake snapshot with a v1 run under the same exclusive owner, retaining run ID, ledger ID, allocations, charges, admissions and history. Only this transition fixes the original generation window. Existing v1 runs cannot be returned to intake. Every native intake request uses the same receipt and accounting interface as subsequent generation.

The product host declares separate design, art and coding policy slots. `COSMOS-DESIGN` and `COSMOS-MEDIA` are explicit host stage criteria included in the displayed, confirmed draft; gameplay criteria are preserved separately. Design maps gameplay to rules and a dynamic character/state/audio roster. Art writes new `CharacterSpec` / `AudioSpec` data; the trusted adapter renders and validates the actual SVG/WAV files. Coding consumes those exact registered design/media versions. The planner must preserve the dependencies and role scopes.

The final candidate replays the original normal-input plan with additional manifest-bound media observations. The required read-only `cosmosDebug.media` shape is:

```text
characters: [{ id, loadedFrames, states: [{ name, seen }] }]
audio: [{ id, decoded, started }]
```

Array order follows the fixed media manifest. The values must come from actual Phaser texture/audio readiness, displayed animation transitions and successful sound starts, not declared constants. The host binds its checks to the candidate and media versions and retains each actual/expected result. Normal-input screenshots and the media report enter the independent review alongside fixed source. Read-only counters do not establish their own truth, perceptual visibility or listening quality. Missing observations prevent candidate promotion; visual recognizability and real listening remain user experience checks.

`executeGeneration` assembles the existing planner, scheduler, registry, independent review and recovery journal. It explicitly allows one durable review-protocol correction, charged to the same task and original window; a valid `changes_requested` verdict is not rewritten. Recovery/protocol correction use the existing effective serial scheduling. A bounded repair finds the failed task by ID, preserves passed upstream references and keeps the original failure in `taskHistory`; final delivery evaluates the original DAG with its declared successor. A changed upstream version does not silently rebind downstream requirements or dependencies.

The public `stop` persists a hard stop and waits for owned work to drain. `resume` can recover only verifiable interruptions without a stop reason inside the original window. There is no CLI continuation that adds money/time or clears manual, budget or deadline stops. This does not complete all R15 continuation experiences. At stop or failure, delivery reports preserve the current project, any accepted candidate, costs and handoff instead of declaring success.

## Native role factory

`createRoleFactory` creates Cosmos, design, coding, art and temporary reviewer sessions using `createPiSession`. The production path stays on native `deepseek-flash`; thinking defaults to `low`, with an explicit host option for escalation. Session request count, output size, timeout and maximum request cost are mandatory. Tests inject a session factory and make no paid calls.

`maxOutputTokens` remains the default for existing callers. Optional `authorMaxOutputTokens` overrides it only for the named author roles; planning and review always use the default. The product host explicitly gives art and coding authors 65,536 output tokens while design, planning and review keep 8,192. Existing frozen probes retain their original limits. The native adapter uses the selected cap both for `max_tokens` and for the request passed to the cost estimator before reservation/admission. Hosts using role overrides should estimate from `request.maxOutputTokens`, or supply a fixed estimate covering every configured cap. Requests, shared money and deadlines are unchanged. Authors are prompted to write small complete chunks while preserving the required actions, audio and acceptance criteria.

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

Author, reviewer, planner and interview model messages accept a raw JSON object or one complete, explicitly labelled `json` code fence, with optional explanatory prose around it. A second code block, standalone JSON value or object/array delimiters in the surrounding prose, incomplete JSON or a non-JSON fence is rejected as ambiguous or invalid. Native session text stays intact; only the message boundary is decoded. Durable files still require strict JSON. Decoding never changes fields: schema, ownership and acceptance checks still apply, nonempty author `remaining`/`uncertainty` still block progress, and `approved` with nonempty `findings` still fails review validation.

## Budget, stop and recovery boundary

Every native request uses `reserve` then `admit`, including SDK compaction. The pricing version is `deepseek-flash-peak-cny-2026-10-01`, matching the reviewed provider probe: per million tokens CNY 2 uncached, 0.04 cached and 8 output. Actual native usage is normalized to integer micro-CNY. The caller's maximum reservation must cover the whole request context and images.

Responses first enter durable unknown state, then their usage receipt is written, then they settle/cancel. `RunController.coordinateAccounting` keeps each role's reserve/admit or complete response-accounting operation from interleaving with another; network calls remain concurrent. Other paid host integrations must use the same coordination API when running alongside roles. Receipt persistence failure retains unknown exposure and blocks new paid work. Responses without confirmed usage or model identity remain unknown. A proven native `not_sent` outcome can release its reservation. No API key is serialized.

A native `PiSessionError('incomplete')` records `provider_output_truncated` with a fixed token-limit diagnosis and the original charges. It remains `insufficient_evidence`, so it is not treated as a code defect or an automatic service retry. The provider still rejects truncated output before executing partial tool calls. No raw exception text enters the feedback, and this diagnosis does not reopen an earlier failed task or change repair limits.

Execution is bounded to one attempt per task and at most 100 prepared tasks. The default API remains serial; `scheduling: {}` enables up to two ready tasks with declared host resource limits. Recovery and calls with review protocol correction use one task at a time so their existing quiet-ledger checks remain valid. Each attempt has separate author/reviewer directories; TaskContract stores attempts, artifacts, evidence, review and handoff through RunController. Stops are checked before every new session and tool invocation. Host callbacks must also obey their signal. Failed dependencies stay waiting and cancellation preserves handoff and captured artifacts. No new task is dispatched after cancellation. See [scheduler boundaries and evidence](scheduler.md).

Native roles expose `compact(signal)` for a host-controlled idle session. `compactionKeepRecentTokens` forwards the existing pi setting; compaction uses the same request limits, shared allocation and original deadline. The fixed system packet continues to supply acceptance, interfaces, input versions, ownership, budget and known failures after compaction. SDK split-turn summaries do not necessarily repeat the custom preservation instructions, so summary text is never the authority source. The host must not compact concurrently with a prompt. Single-prompt tool chains do not gain automatic compaction or overflow retries; use bounded tasks and the existing request/output limits.

This layer returns task results, not a claim that the overall game/run is complete. COS-11 supplies constrained linked repairs, COS-12 supplies explicit journal recovery, and COS-13 supplies optional bounded scheduling. No model can reallocate funds or silently reopen recorded task IDs. Reuse completed task evidence.

## Verification

Offline tests cover explicit confirmation, host-controlled planning and acceptance coverage, role write/read permissions, host tool filtering, secret-free child environments, dependency ordering, fixed outputs and review images, missing/stale evidence, independent review, handoff preservation, cancellation and shared budget settlement/unknown states. No target game is hand-written by these tests and no paid service is called.
