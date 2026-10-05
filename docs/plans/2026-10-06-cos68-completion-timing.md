# COS68 完成交付计时计划

> Implementer: cos65_implementer; reviewer: cos67_implementer; BATCH10 sole merger: cos66_implementer. After PLAN_APPROVED only. COS67 review first.

**Goal:** Record completion after cleanup, separately from reporting and human waiting.

**Architecture:** Preserve immutable reports/decisions. Trusted entrypoints mark new reports `requiresCompletionTiming`; final completion/experience approval requires the subsequent valid sidecar. Legacy unflagged reports retain conclusions with timing unverified.

**Base/contract:** `bce7b58321a1ca6f655b48a7ab16caee54d5dff0`, [COS68/#69](https://github.com/lrfluobida/Cosmos/issues/69). Node/TypeScript, existing OwnedWork/owner/window-idle/publication mechanisms.

**Files:** `src/runtime/entrypoint.ts`, `src/runtime/run.ts`, `src/runtime/window-idle.ts` (+event validation); new `src/runtime/completion-timing.ts`; `src/runtime/experience.ts`, `src/cli/control.ts`, CLI display. New `tests/runtime/completion-timing.test.ts`, `tests/cli/completion-timing.test.ts`; existing fixture edits; this plan and quickstart. Exclude host, benchmark and Root tracking.

- [ ] RED: Delay cleanup in initial/continuation entrypoint fixtures; require no premature sidecar, elapsed time and attempted cleanup of every started resource despite one failure.
- [ ] GREEN: Drain initial owned work/accounting before owner release. Narrowly extend existing nonce/snapshot anchoring for initial scope; continuation retains closeAfterDrain/window-idle. Capture report/hash, candidate/task proofs and original/current run/ledger/window/start/deadline before close; publish once after all cleanup with exact closed snapshot and lifecycle. Recheck binding/ownership around publication. Never acquire execution authority for publication.
- [ ] Classify actual end `in_time`, `late` or `unconfirmed`; backwards/invalid clock, missing report, unresolved children/work/owner or drift cannot produce a passing endpoint. Keep unknown fees and partial classic gaps independent. Original formal elapsed remains tied to its initial start/deadline; additional-window elapsed is separate.
- [ ] Read-only resume/status/experience reuse the fixed sidecar; reject missing/tampered/mismatched/new-window proof for flagged reports. No new host, fee or end timestamp. Preserve reportedAt/elapsedSinceAutomaticReportMs; expose human waiting separately from cleanup completion.
- [ ] Verify focused failure/race/legacy/binding fixtures, real Node exit, typecheck, UTF-8/Chinese readback and diffcheck. Label simulated clocks separately; reuse Source63–67 browser evidence. Submit exact SHA for review.

Source/free fixtures only; shared ¥150, formal ¥200/12h, target ¥100/6h unchanged. Actual C6 unknown/closure12/C7/human prerequisites remain; no private material, paid calls or reference access.
