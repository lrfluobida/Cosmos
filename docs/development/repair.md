# Bounded repair (COS-11)

## Implementation plan

- [x] Reproduce the two COS-10 failures offline: an author handoff with remaining work stays blocked; an approved review with nonempty findings requires a new valid reviewer response.
- [x] Add opt-in, at-most-one protocol correction inside the same live independent reviewer session. Keep strict parsing, host evidence, budget admission and cancellation.
- [x] Add host-owned failure feedback with fixed acceptance, artifacts, evidence and source attempt references; never persist raw provider exceptions.
- [x] Add repair decisions and explicitly linked new tasks. Check complete host history, no progress, original deadline, estimates and unreconciled charges before suggesting work.
- [x] Run affected offline role/runtime/contract checks, typecheck and build; prepare the implementation commit for independent review.

Files: `src/runtime/repair/{feedback,protocol,policy}.ts`, the required integration in `src/runtime/orchestrator.ts`, and `tests/roles/repair*.test.ts`.

The original COS-10 pilot and its continuation remain failed. These changes apply to new executions; they do not reopen terminal tasks, resume that pilot, redistribute budget, or implement a recovery scheduler. Live generated-game repair remains unverified.

## Review protocol correction

`executeTaskDag` accepts `reviewProtocolCorrections?: 0 | 1`. The default is **0**. A trusted caller can opt into **1** for new executions. Values outside that range are rejected before registration or dispatch.

The first answer is parsed without changing its content. Only an invalid review JSON/protocol proposal can trigger the additional prompt. The same live independent reviewer receives an explanation: `findings` contains unresolved actionable defects; approval requires an empty list; real defects require `changes_requested`. The second answer goes through the same strict parser and current host-evidence checks. Both answers remain in the native session. A second invalid answer stops the attempt.

This does not change author `remaining` or `uncertainty`, convert `changes_requested` to approval, clear findings on the host, or retry provider failures. The correction uses the existing role's request timeout, budget hooks and signal. Cancellation, original deadline, exhausted allocation, outstanding reservations or unknown charges block correction. The provider still checks the full next-request reservation before dispatch.

Protocol correction remains inside one reviewer session and one task attempt; it does not grant another game-repair task. A caller's tighter request/pilot limits remain in force. Nothing here changes the already consumed repair slot in the old COS-10 pilot.

Before the corrective prompt, the host creates `<attempt.sessionRef>/review-correction.json` with exclusive creation and `fsync`. `ReviewCorrectionRecord` contains format version 1, task/attempt/reviewer/context IDs, `used: 1` and a UTC timestamp. Any existing record, including an incomplete file left after a crash, consumes the slot. A rejected later admission also keeps it consumed. COS-12 can read this fixed record together with the native session and request ledger; it must not delete the record, change its path or assign another allowance to the same attempt. This module does not resume interrupted sessions or claim crash recovery is already verified.

## Failure feedback and trusted diagnostics

Each newly failed active attempt and each valid `changes_requested` review saves `<attempt.sessionRef>/failure.json`. A valid review keeps its `changes_requested` verdict, `needs_changes` task state and completed `passed` attempt with `failure: null`; the separate feedback supplies the trusted diagnosis for subsequent work. Format 1 contains the source task/attempt/session, run/spec/original deadline, unchanged acceptance entries, exact input/output references, stable host failures and the task's recorded request charges. Provider exceptions are reduced to known category/code values; arbitrary exception messages and raw model answers are not copied into feedback.

`HostFailure(issues, passedChecks?)` is for trusted host adapters. Each issue contains the original `acceptanceId`, a stable host `checkId`, classification, reproduction, actual/expected results and public evidence references. A host check can throw it, or `DagOptions.diagnoseFailure(task, stage)` can derive it from the report that `verify` just produced. The callback receives a frozen task snapshot and a stable stage, never the raw exception. Invalid diagnostics fall back to an `insufficient_evidence` record without corrupting the task.

Do not construct HostFailure from an agent's suggested classification or raw provider text. The host must establish code defects from actual checks, service faults from request evidence, requirement conflicts from the frozen requirements, and missing facts/evidence as `insufficient_evidence`.

`passedChecks` contains `{ acceptanceId, checkId, evidenceId }` witnesses extracted by the trusted adapter from actual passed report steps. Their report evidence must cover the current exact input/output versions and acceptance ID. **The report may have outcome `failed`** because another step failed. These witnesses are used only to compare repair progress; they are never added as per-step passing `TaskContract.evidence` and cannot satisfy task completion. The host must keep the overall report failed while any required check fails.

Feedback has a stable workspace-relative `reference.location` for staging. Before dispatching a linked task, the host copies the exact saved feedback bytes from `<sessionRef>/failure.json` to that location in the author workspace, and includes it in the separate frozen reviewer snapshot with the other `context.interfaces`. Keep the original feedback and native sessions intact. The relative location avoids granting reviewer access to the author's absolute session directory.

## Decisions and linked tasks

`assessRepair({ snapshot, requirement, history, policy, now, estimate, cancelled? })` is a pure host decision. Use the latest `RunController.read()` and complete ordered feedback history. The policy checks each feedback against its persisted source task, last attempt, fixed acceptance and exact artifacts. Linked tasks retain all prior feedback references in `context.interfaces`; omitting earlier history or resetting task IDs cannot reset the logical attempt count. A previously registered successor prevents duplicate work.

The initial policy is explicit and conservative:

| Setting | Default |
| --- | --- |
| `maxRepairTasks` | 1 |
| `maxTaskAttempts` | 2 across linked task IDs |
| `maxNoProgressRounds` | 1 |

These limits support the offline bounded behavior; a successful live game-repair threshold has not been established. `estimate` includes `costMicroCny`, `durationMs` and `cleanupMs`. Cancellation, unknown/in-flight charges, counts, original deadline and insufficient shared or unallocated budget stop new work. Existing task allocations are never reclaimed.

Progress requires current host proof that at least one previously failing `(acceptanceId, checkId)` now passed. New failures may be exposed by a later check or another execution path. Merely removing or renaming failures, changing an artifact version, or writing a success summary is not progress. Consecutive rounds without such proof return `replan`. Stable check IDs belong to the host's fixed checks; model-suggested names are not accepted as observations.

| Classification | Decision |
| --- | --- |
| `code_defect` | `repair` through the source artifact's role |
| `external_service` | `retry_service` only after charges are reconciled |
| `requirement_conflict` | `wait_user` for a requirements decision |
| `insufficient_evidence` | `collect_evidence`, without dispatching code repair |

Every decision includes unresolved gaps, current artifact references and passed task IDs to preserve. The caller saves and delivers that gap report. `replan` does not automatically launch a planner or widen the requirements.

`createLinkedRepairTask` accepts the same checked inputs plus the exact source `PreparedTask`, a new task ID, explicit available allocation, and new fixed output versions/locations. It preserves role, ownership, requirements, passed dependencies and original run/ledger/deadline. It creates fresh pending evidence/review fields, adds source feedback and old artifact interfaces, and records the logical attempt in the role rules. It does not mutate the source task or register/dispatch work itself.

Each artifact ID has only its current source version in the new task's interfaces; earlier versions remain recorded in the complete feedback chain. Output locations are checked against all historical input/output, interface, feedback and evidence references using normalized workspace paths, including Windows case and absolute/relative aliases. Renaming an artifact ID cannot permit overwriting an old snapshot, its parent or its subtree.

Stage the fixed interfaces, then pass the returned task to `executeTaskDag` with the existing capture/verify/independent-review callbacks. A new output version always needs new host evidence and review. Existing passed tasks and their unchanged artifacts remain usable; they are not regenerated. Inputs or scope requiring changes need a separately planned contract, not a mutation of the old task.

## Validation and remaining live work

The offline fixtures retain the two real failure shapes from `pilot-20261001081828147`: the original author listed host/downstream work in its handoff, and continuation `c1` returned `approved` with positive findings. The positive-findings fixture includes a literal public review sentence; its corrected answer is a scripted offline response, not evidence that a native live reviewer corrected itself.

Focused checks cover same-session correction and billing, two-answer termination, genuine changes, author handoff blocking, cancellation/unknown charges/time/budget, durable failure data, linked code repair with a fresh independent review, stale evidence rejection, logical retry counts and report-step progress. No game was regenerated and no paid service was called for these tests.

Remaining live work: run a newly authorized generation with this reviewed integration, verify that native protocol correction works when needed, and demonstrate a real game defect repaired and independently accepted within that run's original limits. COS-10 remains unpassed and G3 remains closed until its required evidence exists.
