# COS55 original coding session build feedback

> Execute in the dedicated implementer worktree with `superpowers:executing-plans`; an independent reviewer checks the plan and actual diff before the batch merger integrates the approved SHA.

**Goal:** Let the original coding author check its current files with the trusted TypeScript and Vite toolchain, correct compiler errors within the existing write scope, and check again in the same SDK session, task, attempt, grant and deadline.

**Architecture:** Add `check-game-build` with strict empty arguments to the coding policy and its host callback before SDK initialization. A fixed source/dist worker runs through `runOwnedNode` inside `OwnedWork`, after launch ticket and PID registration. Each call assembles a fresh task/attempt/check TEMP project from current author index/src, the exact four template capture configs and the selected media capture. TypeScript and Vite have separate owned launches in that same isolated project, with an authority/input guard between them. Complete ordered file signatures use fixed-size SHA256 digests so the supported frame inventory fits Windows process arguments. Diagnostics are advisory and never publish captures, proofs, reviews, promotions or a repair claim.

**Scope:** Generic, validation and prepared transfer coding hosts share this integration. Planning, design, art, review and format correction do not receive this tool. Before and after checking, require the original running attempt, source workspace, unchanged fixed input references and bytes, passed upstream design/art, active authority, no unknown charges, enough cleanup time and live cancellation signals. Prepared transfer additionally uses its existing current frozen-input guard. Preparation-only capability remains unchanged.

**Files:**

- Modify `src/runtime/entrypoint-host.ts`: coding policy, callback composition and scoped guards only.
- Create `src/runtime/entrypoint-coding-check.ts`: strict tool, input signatures and owned fixed-worker invocation.
- Create `src/runtime/coding-check-worker.ts`: snapshot validation, isolated assembly and bounded fixed compiler output.
- Create `tests/runtime/entrypoint-coding-check.test.ts`: actual host/factory policy and tools, no provider calls.
- Create `tests/runtime/coding-check-worker.integration.ts`: real TEMP pinned toolchain and source/dist worker coverage, using `COSMOS_CODING_CHECK_TOOLCHAIN` for its explicit independent installation.
- Modify `tests/runtime/entrypoint-host-validation.fixture.ts`: optional test-only templateRoot captures the exact four chosen configs before host initialization; existing default bytes are preserved.
- Modify `tests/runtime/entrypoint-host-validation.test.ts`: a baseline-confirmed existing error-vocabulary assertion accepts the preparation draft rejection and verifies zero authority/provider side effects.

**Boundaries:** Source and synthetic TEMP data only; no actual cases, ledgers, credentials, paid models, reference assets or generated games. No public CLI or human-generation adapter. No factory edits owned by COS54. Budgets and the one linked coding repair remain unchanged.

## Execution

- [x] Write a production host policy/callback test, run it and record the expected missing-tool RED.
- [x] Write a real owned-worker failure -> original-author edit -> success test. Verify separate TEMP dirs, exact configs/media, unchanged fixed inputs, exited PIDs, filtered environment and zero new model requests.
- [x] Implement the minimal helper, fixed worker and host integration.
- [x] Add guard tests for non-empty arguments, other roles, stale attempt/workspace, input drift, stop, cancellation, unknown cost and cleanup deadline; reject invalid feedback after drift.
- [x] Build the production TypeScript closure and exercise the compiled fixed worker. Run only affected host/design/ownership compatibility checks; reuse unchanged Edge, 80-call and lifecycle evidence.
- [x] Reopen edited UTF-8 files, verify Chinese text and LF, and run diff checks. Commit the implementer branch and report the exact SHA for independent review; the batch merger alone integrates and pushes main.

## Verification evidence

- Production policy RED: missing `check-game-build`, 0/1; callback RED after successful synthetic design/art: missing tool, 0/1.
- Phase guard RED: changed fixed input during TypeScript still started Vite, 0/1; fixed parent guard GREEN, 1/1.
- Supported media signature RED: 4096 fixture frames expanded the argument inventory to 375723 characters; fixed digest and stable ordering GREEN.
- `node --experimental-strip-types --test tests/runtime/entrypoint-coding-check.test.ts`: original 13 targeted cases passed, 0 failed/skipped, 64731.90 ms. After the fixed-size signature change, its signature/owned PID/environment/phase guard affected targets passed 3/3, 0 failed/skipped, 17536.55 ms; other passing checks were reused.
- `npm run build`: strict production source/dist closure passed. The source and compiled real TypeScript failure -> original-session edit -> TypeScript/Vite success checks passed 2/2 after the two-stage worker change, 38766.13 ms. They used exact pinned configs captured before initialization, full media snapshots, separate TEMP projects and physical exited worker/compiler PIDs. After the fixed-size signature change, the compiled representative passed 1/1, 0 failed/skipped, 19934.57 ms.
- Affected generic host, validation host and design feedback compatibility: 18 passed. The remaining error-vocabulary assertion failed identically on exact baseline `5fd3aaeb96905229d9365494b3cfc3ce258c21f0` in a TEMP source archive (3339.07 ms); the minimal test-only vocabulary correction plus unchanged controller/configs0/calls0 assertion passed its target (3697.86 ms).
- Existing file text was reopened as strict UTF-8/no BOM/LF, with all baseline non-English runs byte-equivalent; diff check passed. New Chinese fixture text remains readable.

Upstream fixture setup uses its existing synthetic provider/ledger records; every check preserves that snapshot and adds zero model requests. No actual case, budget ledger or session was read or changed. No live game generation, normal-input gameplay, accepted candidate, linked repair or user experience result is claimed. Independent source review and batch integration remain with the assigned reviewer and merger.

No live generation or user experience acceptance is claimed by this work.
