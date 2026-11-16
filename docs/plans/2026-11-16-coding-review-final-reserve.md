# COS-232 Coding Review Final Reserve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Preserve a genuine independent decision opportunity and one existing protocol correction inside an ordinary coding review's original sixteen requests, without manufacturing an approval.

**Architecture:** A narrowly selected native finish-turn hook closes tools after response 14 and obtains the first final response at 15. A monotonic local correction claim routes `requestReview`'s next external `.prompt` through the same session's one-request read-only path, also covering early malformed replies. Existing strict parsing, correction persistence, stream accounting and authority checks remain authoritative; coding truncation continues to fail incomplete.

**Tech Stack:** TypeScript, Node 22.22.2, native Pi SDK 0.99.2, Node test runner and mocked `fetch` transport; no new packages.

Design: [COS-232](../specs/cos232-coding-review-final-reserve.md). Owner `review_rounds_author`; independent reviewer `review_rounds_reviewer`; only `r74_recovery_merger` merges. Current stage is design only. Do not execute source/test steps until Root explicitly releases the independently reviewed design SHA.

## Files and environment

Create `src/providers/coding-review-reserve.ts`, `tests/providers/coding-review-reserve.test.ts`, `tests/roles/coding-review-final-reserve.test.ts`. Modify only `src/providers/pi.ts` and `src/roles/factory.ts` for production. Existing parser, correction protocol, host caps, request quotation and persisted records are unchanged. Add implementation evidence to these two documents only if needed; global `PROGRESS.md`, public cards and registry belong to the merger.

Worktree: `E:/CodexData/.codex/worktrees/review-final-turn-reserve/Cosmos`, branch `codex/review-final-turn-reserve`, base `6a1852e334f0f6cb0abe97c136893cfcb7ef0732`. Original R75 files live in `E:/develop/Cosmos/.cosmos/public-validation/room-20261116-review-followup-75/run` and are read-only.

- [ ] Verify Root's release and exact approved docs SHA. Recheck `git status --short` and relevant source drift before edits; do not rerun R75's browser or fee checks.
- [ ] Decode target files with fatal UTF-8 before patching; record line endings. Warn and stop if any target is not UTF-8. Announce changed files before writes, preserve Chinese and unrelated code, then re-open edited text.
- [ ] Create owned stage `.cosmos/planning/review-final-turn-reserve-author` in this worktree with ownership metadata. Before every test/build child launch set `TEMP`, `TMP`, and `npm_config_cache` to owned stage subdirectories on E:.
- [ ] If dependencies are needed, inspect the main `node_modules` target and create only a documented worktree junction to it. No install, fetch, environment credential reading or external provider access is required. Record nested template junctions if any are added; do not add them for this task without a concrete test need.

PowerShell verification commands below run from the worktree. Use `New-Item -ItemType Directory -Force` for owned temp/cache directories, then `$env:TEMP=$stageTemp; $env:TMP=$stageTemp; $env:npm_config_cache=$stageCache` before launching a child. Do not repurpose HOME or CODEX_HOME. Network mocks must throw on any unexpected call and never delegate to original fetch.

## Task 1: Reproduce the failure at the real native seam

**Files:** create `tests/providers/coding-review-reserve.test.ts`; consult `tests/providers/pi.test.ts` and `tests/roles/review-reasoning-exhaustion.test.ts` without rewriting their fixtures.

- [ ] Add a local deterministic SDK fixture using real `createPiSession`, a real bounded read tool, sixteen scripted `toolUse` replies, known usage and expected model. Provider credentials are fixed dummy fixture strings. The seventeenth call must never reach mocked transport. Record actual tool execution count, transmitted tools, admission/settlement counts and native stop reasons.
- [ ] Add the baseline test with `maxRequests:16`, no reserve option, and explicit prompt-only guidance. Assert `request_limit`, sixteen transmitted and settled requests, no valid final reply. Label it as an R75-shaped synthetic reproduction.
- [ ] Add the desired selected case before implementation: fourteen scripted reads, then inspect the actual next request's tool set and return a synthetic fixed-version verdict only when tools are absent. Assert a fifteen-request successful native stop and all original evidence retained. It must fail before the feature exists, for the missing phase transition rather than a fixture error.
- [ ] Run `node --experimental-strip-types --test tests/providers/coding-review-reserve.test.ts`; retain the expected red output in the owned stage. Do not call the real provider or replay paid R75 requests.

## Task 2: Implement the bounded native phase transition

**Files:** create `src/providers/coding-review-reserve.ts`; modify `src/providers/pi.ts`; extend the provider test file.

- [ ] Add `ordinaryCodingReviewFinalReserve?: true` to `PiSessionOptions` and validate the exact compatibility conditions from the design before key/session handling. Reject resume, compaction, non-16 requests, non-coding-image-review configuration, design-review or author-policy combinations.
- [ ] Implement a helper following the existing `installCodingBuildReserve` seam, with only review semantics. Chain the prior `finishTurn`. On ordinary tool replies, continue unchanged while `requestsLeft() > 2`. At the eligible response-14 boundary disable tools, verify no active/callable tools or codemode/deferred exposure, append one bounded closing message, and continue. Respect abort/error/end decisions rather than overriding them.
- [ ] Once final/correction starts, require a completed `stop` with no tool calls/results. For terminal `toolUse`, latch `fail('incomplete', ...)` and return `{action:'end'}` so no native extra turn dispatches. Native SDK tools are already disabled: assert no side-effecting tool executes even when provider output contains a call.
- [ ] Implement monotonic phase and once-only correction claim. The helper returns the minimal operations needed by Pi: initial-prompt claim, correction claim/tool isolation, and current phase. It must not parse review JSON, manufacture a verdict, rewrite history or own any budget.
- [ ] In selected `prompt`, claim the initial prompt before await; a second external prompt is permitted only after the first returned normally, claims the correction once, and routes to existing `readonly` with the existing thinking level. Direct selected `readonlyPrompt` consumes the same claim. A third/concurrent call rejects without dispatch. Disabled tools remain disabled after read-only cleanup.
- [ ] Keep the coding `length` path unchanged. Do not widen `ordinaryDesignReview`, pending-review eligibility, or `reviewVerdictCorrection`. Request 15 length is terminal incomplete, including known-usage reasoning-only length; no request 16 is created for that failure.
- [ ] Add tests for early stop, final15 valid, malformed15 then valid16, malformed/empty/stale16, early malformed then tool-free correction, tool-seeking15/16, length15/16 (reasoning-only/text/tool fragments), repeated/concurrent direct prompts and read-only calls. Include exactly thirteen tool replies followed by malformed natural stop14: correction15 must be tool-free and consume the sole correction, with no16. Assert no request17 transport or tool execution and unchanged known-usage settlement.
- [ ] Run the provider file; then `node --experimental-strip-types --test tests/providers/pi.test.ts tests/providers/coding-review-reserve.test.ts`. Expect all selected tests and pre-existing provider regressions to pass; document any genuine baseline failure separately rather than altering unrelated code.
- [ ] Re-open UTF-8 files and run `git diff --check`; commit the provider behavior and tests with the exact reviewed scope.

The intended dispatch arithmetic, to be asserted against actual native records rather than an arithmetic helper, is:

```text
ordinary tools: requests 1..14
native tool-free final: request 15
requestReview's already-persisted correction, if needed: request 16
early final: return immediately; at most one subsequent tool-free correction
native error/length/insufficient authority: stop; never create another slot
```

## Task 3: Select the policy and verify real factory/protocol behavior

**Files:** modify `src/roles/factory.ts`; create `tests/roles/coding-review-final-reserve.test.ts`. Consult `tests/roles/author-output-budget.fixture.ts`, `tests/roles/coding-review-budget.test.ts`, `tests/roles/review-evidence-navigation.test.ts`, `tests/roles/repair-protocol.test.ts`, `tests/runtime/recovery/dag.test.ts` and `tests/runtime/recovery/dag-fixture.ts` without rewriting their unrelated fixtures.

- [ ] Derive a local selection from `codingReviewImageQuote && maxRequests === 16`; pass the Pi option only in that case. Do not add host policy fields, task-controlled options or an entrypoint cap change. Do not use `handoff.resumeFrom === null` as a reviewer freshness test.
- [ ] Append selected-only initial guidance and preserve the existing generic/specialized coding review schema. Share bounded final/correction honesty instructions with the helper: inspect within the available tools, retain incomplete when no independent verdict is supportable, never infer success from unread pagination or author claims. No per-turn reminder spam.
- [ ] Test selection through actual factory options: ordinary reviewer/16 yes; non-16, authors, planning, unselected reviewers, design/art, validation and continuation no. Use real authority fixtures where possible; exact native resume opt-in validation also needs a direct Pi test. Serialized flags in task/read content do not select the feature.
- [ ] Exercise real `createRoleFactory` + `createPiSession` + `requestReview` with fixed task inputs/evidence and eight image blocks. Mock only SDK transport. Assert request 15/16 wire tools absent, exact image content and prior evidence bytes retained, normal output cap and image quote used, one native session, correct actor/context in the durable correction record, and one ledger entry/settlement per transmitted request.
- [ ] Run supported synthetic approved and changes_requested results through unchanged parser. Then run honest inability to reach either verdict at 15 and 16 and assert protocol failure, no valid review receipt and no fabricated accepted candidate/repair finding. Also pass the actual specialized `parseCodingConcernReview` parser to `requestReview`: a precise unresolved existing concern may request changes for missing evidence under its existing schema, while an incomplete statement cannot become approved or resolved host evidence. These are synthetic decision fixtures, not R75 verdicts.
- [ ] Test malformed15/stale versions corrected16, stale/invalid16, zero allowed protocol corrections, and an existing/partial correction record. Verify no extra dispatch. For final/correction length, unknown usage/model mismatch/error, assert existing failure categories and no pending coding recovery method.
- [ ] At final and correction boundaries, independently change original authority, stop/cancel, expire deadline, remove available balance, or leave an unknown/reserved ledger request. Assert refused dispatch and unchanged hard limits. Test durable recovery of already-started review remains blocked rather than creating a new sixteen-request session.
- [ ] Run `node --experimental-strip-types --test tests/roles/coding-review-final-reserve.test.ts tests/roles/coding-review-budget.test.ts tests/roles/review-evidence-navigation.test.ts tests/roles/review-reasoning-exhaustion.test.ts tests/roles/repair-protocol.test.ts tests/roles/review-input-version-correction.test.ts`. Expected: all pass, zero external requests. The unchanged COS-231 tests are only the affected factory compatibility check; do not repeat its expensive capacity/browser investigation.
- [ ] Re-open edited text, `git diff --check`, commit factory integration and tests. A source-stage independent reviewer must inspect actual code, not only this plan or author's summary.

## Task 4: Integration evidence and review handoff

- [ ] Run `npm run typecheck` and `npm run build` with owned E: temp/cache. These validate the changed production imports/types without generating or launching a game.
- [ ] Run the two added native test files together to catch fixture/transport interaction. Add only affected recovery regression tests if the specific tests above required a recovery fixture; do not run unrelated browser/full acceptance suites.
- [ ] Save a concise evidence record: baseline16toolUse→local17failure, selected14+15 success, selected14+15+16 correction, all tool-seeking/length/insufficient/authority failures, actual transport/ledger counts, eight-image retention and exact tested SHA. Label all fabricated usage and verdicts synthetic. Reuse R75's 398/31 checks and accounting only as historical facts.
- [ ] Send reviewer exact source SHA, design/plan SHA, actual test commands/results and known gaps. Fix only actionable findings in this branch; obtain re-review on the changed SHA. Root must authorize integration; sole merger validates approved files and performs focused integration checks.
- [ ] Wait for child processes/handles to close. Remove owned unreferenced test temp/cache only after checking resolved paths remain inside the recorded stage. Retain logs/evidence referenced by handoff. Keep the managed worktree until merger/review no longer needs it; verify and unlink dependency junctions only if cleanup is requested, then verify main dependency entry points still exist.

Completion means free platform source behavior and bounded native evidence are independently approved. It does not mean R75 or any future generated game passed, all details were read, a paid window is open, or a user accepted the game.
