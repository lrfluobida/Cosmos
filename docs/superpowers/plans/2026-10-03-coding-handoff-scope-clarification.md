# Coding handoff scope clarification implementation plan

> Execute the approved COS28 scope in its dedicated implementer worktree. Root arranges independent review; the batch merger alone integrates approved commits.

**Goal:** Let the original coding author distinguish its own unresolved work from future host observations in one explicit validation-only read-only turn.

**Architecture:** Keep the fixed proposal parser and every capture, verification, review and promotion gate. `codingHandoffClarifications?: 0 | 1` is omitted by default and requires validation, durable receipts and serial scheduling. Only a valid original coding proposal with no remaining work and nonempty uncertainty is eligible. Format correction and scope clarification share the same write-once started/response slot; a formatted reply cannot receive another turn. The author preserves every original concern verbatim in its revised summary or arrays. The host checks retention without deciding responsibility itself.

**Tech Stack:** TypeScript, existing pi read-only session capability, node:test, real controller/registry with fake SDK and host fixtures. No API, real browser, game compiler or historical request loops.

- [x] Add the approved final-proposal-only fixture and failing scoped tests for eligibility, the shared slot, true gaps, signatures and durable interruption recovery.
- [x] Add a discriminated scope receipt to `src/runtime/repair/author-protocol.ts`; retain legacy format receipts and all admission, identity, cancellation and byte checks.
- [x] Forward the new option through `src/runtime/orchestrator.ts`, recovery origins, `probes/e2e/driver.ts` and `probes/e2e/validation-driver.ts`, including repair-origin reconstruction.
- [x] Verify focused role and driver tests, affected strict TypeScript inputs, UTF-8/LF, Chinese readback and diff checks. Reuse the unchanged provider read-only evidence.
- [x] Prepare the implementation for commit and fresh independent source review. Actual case6 execution remains a separate root action.

Verification: the original proposal failed before implementation and passed after the change. `tests/roles/coding-handoff-clarification.test.ts` passed 35/35; the `coding-scope` representative in `tests/e2e/author-correction-driver.test.ts` passed 1/1 and authenticated initial coding plus repair origins, 12 synthetic requests and author-purpose charges. Four affected legacy format representatives passed: original native prose, omitted policy, durable response recovery and changed identity rejection. Every selected run had zero skips. Explicit strict noEmit covered all five changed source/probe modules and both changed/new test modules. All nine files remained UTF-8 without BOM and LF; Chinese strings were read back correctly and diff checks passed.

These are source and harness tests with fake SDK/host observations. No real API, browser, game compiler, actual case state, private session, reference game asset or generated game file was read or changed. Actual gameplay and case6 acceptance remain unverified.
