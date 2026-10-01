# COS-13 scheduler implementation plan

**Goal:** execute ready, bounded game-generation work concurrently without changing the original run, ledger, deadline, fixed acceptance or recovery history.

**Architecture:** retain the COS-12 task-stage executor and journals. A small host scheduler selects ready tasks with complete fixed inputs, limits concurrency to two by default, and holds declared exclusive resources. Tasks using review protocol correction run exclusively for their whole attempt, because correction is requested inside a live reviewer and requires a quiet ledger. Recovery eligibility is established before any new paid work; ambiguous historical results never become usable dependencies.

**Stack:** existing TypeScript, native pi sessions, RunController, atomic receipts and Node offline tests. No new service or dependency.

## Implementation and independent review batches

- [x] Add failing tests for repeated-role host task slots and for a second role's admission during a normal response receipt window. Implement bounded `taskPolicies` with the legacy `roles` adapter, and one controller-owned accounting coordination queue. Commit and send the exact SHA for independent review.
- [ ] Add failing scheduler tests for diamond dependencies, failed/blocked dependency propagation, resource conflicts, cancellation and simulated deadline. Implement `src/runtime/scheduler/` and thin `DagOptions.scheduling` integration while retaining the existing stage/recovery contracts.
- [ ] Add bounded service backoff at a quiet, reconciled boundary and native pi compaction access. Test retained fixed context and shared accounting. No blind service replay or renewal of COS-11 repair limits.
- [ ] Run affected scheduler, roles and recovery suites, TypeScript checking and build. Reuse prior unrelated browser/artifact evidence. Re-open changed UTF-8 files and record actual results and limitations here; send exact commits for independent review and merger integration.

## Host boundaries

`taskPolicies` supplies unique policy IDs and each policy's role, workspace, paths, tools, fixed outputs and allocation. A model draft may select each policy once; it may not clone its authority. Legacy `roles` preserves its one-task-per-role behavior.

The accounting queue covers reserve/admit and unknown/receipt/settle separately, never the provider network call. All paid integrations use the same controller coordination API. Unknown results or failed receipt publication retain exposure and block later admission.

Scheduling rejects overlapping physical write scopes and serializes named host resources. Each writing task keeps its own workspace. A global exclusive lane is used when review correction is enabled; reported parallelism must reflect this. The scheduler drains in-flight task promises before returning after cancellation and retains the existing host requirement to drain owned child processes.

Status derives from durable tasks and the complete shared ledger: original time window, settled/reserved/unknown charges, provider totals, unfinished task reasons and resumable evidence. Twelve-hour boundary checks use a simulated clock and must be labeled simulated. Real long-chain measurements will be authorized and run separately by the merger; this implementation does not touch the old pilot, live validation ledger or reference game.

## Batch A evidence

The eight new tests first failed on the missing task-slot API and observable transient-unknown rejection. All 51 tests in `planning-slots.test.ts`, `accounting-concurrency.test.ts`, `roles.test.ts` and `budget.test.ts` now pass; `npm run typecheck` passes. The accounting test holds one response after its durable unknown commit, proves another admission waits, then checks settlement, genuinely unknown results and receipt publication failure. Two admitted reservations coexist before that response, so this does not serialize provider execution. Tests use synthetic usage only.

`RunController.coordinateAccounting` is a trusted, non-reentrant host API. All concurrent paid integrations must use it around admission or response accounting, never a network call. Raw `reserve`/`admit` remain individually safe against overspending but do not automatically wait through a different integration's receipt window.
