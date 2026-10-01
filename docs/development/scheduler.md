# COS-13 scheduler implementation plan

**Goal:** execute ready, bounded game-generation work concurrently without changing the original run, ledger, deadline, fixed acceptance or recovery history.

**Architecture:** retain the COS-12 task-stage executor and journals. A small host scheduler selects ready tasks with complete fixed inputs, limits concurrency to two by default, and holds declared exclusive resources. Tasks using review protocol correction run exclusively for their whole attempt, because correction is requested inside a live reviewer and requires a quiet ledger. Recovery eligibility is established before any new paid work; ambiguous historical results never become usable dependencies.

**Stack:** existing TypeScript, native pi sessions, RunController, atomic receipts and Node offline tests. No new service or dependency.

## Implementation and independent review batches

- [x] Add failing tests for repeated-role host task slots and for a second role's admission during a normal response receipt window. Implement bounded `taskPolicies` with the legacy `roles` adapter, and one controller-owned accounting coordination queue. Commit and send the exact SHA for independent review.
- [x] Add failing scheduler tests for diamond dependencies, failed/blocked dependency propagation, resource conflicts, cancellation and simulated deadline. Implement `src/runtime/scheduler/` and thin `DagOptions.scheduling` integration while retaining the existing stage/recovery contracts.
- [x] Add bounded service backoff at a quiet, reconciled boundary and native pi compaction access. Test retained fixed context and shared accounting. No blind service replay or renewal of COS-11 repair limits.
- [x] Run affected scheduler, roles and recovery suites, TypeScript checking and build. Reuse prior unrelated browser/artifact evidence. Re-open changed UTF-8 files and record actual results and limitations here; send exact commits for independent review and merger integration.

## Host boundaries

`taskPolicies` supplies unique policy IDs and each policy's role, workspace, paths, tools, fixed outputs and allocation. A model draft may select each policy once; it may not clone its authority. Legacy `roles` preserves its one-task-per-role behavior.

The accounting queue covers reserve/admit and unknown/receipt/settle separately, never the provider network call. All paid integrations use the same controller coordination API. Unknown results or failed receipt publication retain exposure and block later admission.

Scheduling rejects overlapping physical write scopes and serializes named host resources. Each writing task keeps its own workspace. A global exclusive lane is used when review correction is enabled; reported parallelism must reflect this. The scheduler drains in-flight task promises before returning after cancellation and retains the existing host requirement to drain owned child processes.

Status derives from durable tasks and the complete shared ledger: original time window, settled/reserved/unknown charges, provider totals, unfinished task reasons and resumable evidence. Twelve-hour boundary checks use a simulated clock and must be labeled simulated. Real long-chain measurements will be authorized and run separately by the merger; this implementation does not touch the old pilot, live validation ledger or reference game.

## Batch A evidence

The eight new tests first failed on the missing task-slot API and observable transient-unknown rejection. All 51 tests in `planning-slots.test.ts`, `accounting-concurrency.test.ts`, `roles.test.ts` and `budget.test.ts` now pass; `npm run typecheck` passes. The accounting test holds one response after its durable unknown commit, proves another admission waits, then checks settlement, genuinely unknown results and receipt publication failure. Two admitted reservations coexist before that response, so this does not serialize provider execution. Tests use synthetic usage only.

`RunController.coordinateAccounting` is a trusted, non-reentrant host API. All concurrent paid integrations must use it around admission or response accounting, never a network call. Raw `reserve`/`admit` remain individually safe against overspending but do not automatically wait through a different integration's receipt window.

## Batch B API and evidence

Pass `scheduling: { maxParallel: 2, cleanupMs: 5000, resources: { taskId: ['browser'] } }` to `executeTaskDag`. Omit `scheduling` to retain the original serial behavior. Resources are exclusive for the complete task, including capture, host checks and independent review. Actual overlapping filesystem scopes are resolved through existing ancestors and rejected before task registration. Callers remain responsible for isolated workspaces and correctly declaring shared host callback resources.

`resumeTaskDag` and calls with `reviewProtocolCorrections: 1` use an effective concurrency of **one** even if configured for two. This deliberate first-version limit keeps recovery preflight and the live review correction inside a quiet billing interval without weakening their unresolved-reservation checks. The correction test actually rejects the first reviewer response, accounts a second response in the same session, and proves the other task has not started. Ordinary execution without correction reaches an observed peak of two concurrent provider operations.

`schedulerStatus(controller)` returns original run/ledger/time identities, all shared settled/reserved/unknown costs, per-provider totals and each durable task's state, gap, resume location and evidence IDs. It does not call a run complete merely because workers stopped.

The 11 scheduler checks plus affected role, protocol-correction and recovery-DAG suites passed **90 tests**; TypeScript checking passed. The diamond test proves both branches overlap and join once after fixed-version review. Other cases cover physical path conflicts, shared resources, failed dependencies, invalid parallel limits, cancellation/drain, simulated near-12h cleanup and exact passed-task reuse with current blocked-ancestor propagation. No real 12h or network run was performed.

## Long-run host APIs and limits

- `waitForServiceRetry({controller, requirement, history, policy, estimate, backoffMs, signal, now})` is called between completed task batches. It uses COS-11 `assessRepair` before and after a 1–60000 ms abortable wait. The first estimate includes the wait and cleanup time. Its accounting coordination interval starts only after reservations are closed; unknown or in-flight charges stop the decision without waiting. It sends no provider request, creates no task and grants no additional attempt. On `retry_service`, the host still calls `createLinkedRepairTask` with the complete original history, fresh fixed output versions and an available shared allocation.
- Native `CreatedRole.compact(signal)` is available at an idle role-session boundary. It forwards to the existing pi implementation and request hooks. The real SDK plus mocked HTTP test accounts all three original/compaction/follow-up requests, and checks that fixed acceptance, references, ownership, budget/deadline and known failures remain in the subsequent system packet. Missing compaction usage retains the original reservation and blocks further prompts. No automatic compaction, overflow retry, extra summarization service or live call was added. Single-prompt internal tool chains retain the existing bounded limits; this change does not forcibly interrupt them to compact.
- `schedulerStatus` includes `scheduling: {configuredParallel,effectiveParallel,exclusiveReason,peakActiveTasks,state}`. Ordinary scheduling allows two task executors; recovery and protocol-correction execution report one explicitly. Shared resource keys may further reduce the observed peak. These measurements belong to the live controller and become `null` after reopening; durable tasks, charges and original timestamps remain available. The host can save this status with its run report. A single snapshot supplies all money and task fields so a concurrent settlement cannot mix revisions.
- One DAG owner is permitted per controller. A second concurrent execute/resume call is rejected before registration; it cannot bypass the parallel or resource limits by starting another scheduler.
- `drainTimeoutMs` defaults to 5000 ms. Cancellation uses COS-12 `OwnedWork` and returns normally only after tracked callbacks settle. A callback ignoring cancellation causes an explicit drain error and `drain_unconfirmed`; the controller keeps its execution lease until that callback actually exits. A callback remains responsible for its registered child processes and must not start detached work. This is not an arbitrary process supervisor.

No failed/cancelled task is reopened, and no historical passed flag overrides a failed current recovery check. Changed dependencies require explicit fresh work with the new fixed inputs. The published COS-13 requirement for a small real long-chain measurement remains a separate bounded run by the merger; these implementation tests do not close that validation gate.

## Final implementation verification

```text
node --experimental-strip-types --test tests/runtime/scheduler/dag.test.ts tests/roles/compaction.test.ts tests/runtime/run.test.ts tests/roles/accounting-concurrency.test.ts
npm run typecheck
npm run build
```

All **44** affected tests passed, including 20 scheduler/backoff checks, two native SDK compaction/billing checks, existing controller concurrency and deadline checks, and the three response-accounting interleavings. New API/behavior tests were observed failing before their implementation. The earlier 90 role/protocol/recovery checks are reused because the final recovery stage rules were not changed. UTF-8 and diff checks passed; Chinese fixture text remains intact. All charges and provider responses in these tests are synthetic. Independent review and merger integration remain pending.

## Independent review cancellation fix

The reviewer reproduced a cancelled passed-task recovery starting `recoverCapture` before the original signal check. Recovery now checks cancellation at phase entry and immediately before/after that host callback. Cancellation returns `blocked`, preserves the passed task and its fees, and does not claim the task was reused. The same narrow check covers scheduled and serial recovery.

The scheduler/recovery suites covered 42 cases: 41 passed initially, with one existing test requiring the original pre-registration cancellation reason. That text was retained; a focused rerun of the affected cancellation, drain and controller-ownership cases passed all five tests. Both new pre-cancelled passed-task cases prove zero host callback calls, bounded return, unchanged snapshot revision/tasks/fees and no reused-task claim. Existing ignoring-cancellation drain and single-controller ownership checks still pass. Typecheck and build passed. Other passing fault-injection evidence was reused; no paid or browser work was run. This fix awaits the same reviewer's recheck.
