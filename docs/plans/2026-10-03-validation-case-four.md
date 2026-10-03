# Case four native validation implementation plan

> **For agentic workers:** Execute this bounded plan in the dedicated implementer worktree. The coordinator assigns a separate reviewer and the single batch merger.

**Goal:** Prepare the fixed fourth native validation case after all three historical cases stop and their fifteen grants receive audited allocation closures.

**Architecture:** Keep declaration version 2, fixed inputs, model, grants and limits. The existing read-only entry verifies precise integrated source approvals, historical operator/closure receipts and idle case roots before quoting. The native host opts into one author format correction through the reviewed driver.

**Tech stack:** TypeScript, Node test runner, existing validation controller and temporary filesystem/Git fixtures.

## Steps

- [x] Add failing declaration/entry tests for case4, three stopped cases, exact closures, precise markers and receipt/root failures. Use one synthetic accounting sample per prior case; never repeat the historical request exhaustion loops.
- [x] Change `probes/e2e/validation-declaration.ts`, `validation-run.ts` and `validation-host.ts` only for the fixed entry and native policy. Update `tests/e2e/validation-run.fixture.ts` and affected assertions; add narrow closure tests.
- [x] Run affected declaration/input and free entry tests. Reuse author protocol and core allocation evidence; do not run providers, browser workers or the complete fake generation pipeline.
- [x] After approved COS23/COS24 source integration, fast-forward the saved changes onto main, run explicit strict noEmit for probes/tests when the coordinator releases the compiler slot, inspect UTF-8/LF and the final diff, then commit for independent review.

## Boundaries

No changes to actual validation history or private receipts, no real closure operation, no paid request, no generated target game, no source approval mapping changes, and no merge/push to main. A historical closure source SHA must be an ancestor of the frozen main; the fresh case quote still binds the exact current clean main SHA.

## Evidence

The branch is based on integrated source `98aa9ccc18fa7192a693930d53550dce3a91ae18`. Declaration RED showed three case3/case4 mismatches; declaration/input GREEN passed 9/9. Missing current case3, partial closure, historical receipt drift and non-ancestor closure source each produced the expected missing-rejection RED before their entry checks.

The new case4 file has nine tests with passing focused evidence: six in the combined run, its receipt/root/audit test after replacing a fixture directory cleanup with `rmdir` (1/1), and the added unstopped-case3/root/marker/funds checks (2/2). The affected old entry selection passed 10/10, including a zero-provider startup failure that retains all three historical cases, requests, grants, closures, original clocks and receipts. The five precise markers each reject complete/closed with a wrong marker and either unmerged SHA; applied closure source ancestry is checked independently.

Explicit strict noEmit passed for the three probe files and all four affected test/fixture files. `git diff --check` passed. Existing author correction/provider/semantic repair and allocation core evidence is reused; real native execution and paid game generation remain coordinator operations after independent source review and integration.

The subsequent root free preflight exposed COS22's recorded `actual-validation-failed-author-handoff` status being rejected despite its precise approved source marker and both integrated SHAs. The focused fix based on main `15f337526aa960a26af4be2bcce5518b7d74eb7a` accepts only that known COS22 result alongside the original integrated statuses. Precise marker, unique task mapping, both valid source SHAs and ancestry remain mandatory; unknown COS22 results and other tasks using this failure status still refuse admission. Public failure metadata and historical ledger facts are preserved.

The new synthetic fixture reproduces the actual open/approved-source/failed-run shape. Its positive test first reproduced the exact COS22 source gate error while asserting no snapshot, mtime, receipt, root or host preparation change; after the fix the two focused tests passed 2/2, including missing marker/either SHA and the unchanged other-task gates. One explicit strict noEmit for the three probes and affected test/fixture passed. Prior matrices and native/provider/browser/paid pipelines were reused without reruns; real case4 remains unclaimed and awaits source review and integration.
