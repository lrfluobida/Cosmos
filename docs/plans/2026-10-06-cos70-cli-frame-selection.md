# COS70 public CLI frame selection plan

> Author: cos65_implementer; independent reviewer: cos67_implementer; BATCH12 sole merger: cos66_implementer. Execute with superpowers:executing-plans after PLAN_APPROVED.

**Goal:** Expose `--render-frames true|false` and preserve the original selection across recovery.

**Base:** `c999d53dfa60900e600bd0b0f4151da2210f4fcb`; [COS70/#71](https://github.com/lrfluobida/Cosmos/issues/71), spec 4B. TypeScript/Node; existing product host, intake and receipts.

**Design:** Use the existing pair parser for new/resume/continue. Reject invalid/duplicate values and preparation selection before preparation, confirmation, activation or billing. Omission means legacy default on new; resume/continuation restores the original selection, while explicit conflict rejects.

Persist trusted selection before interview/display in intake origin/state; bind it and the original observer source identity/bytes into the existing confirmation source and fixed input closure. Keep model GameDraft unchanged. A small shared reader validates original run/spec and source/selection provenance before host execution or window activation. Pass the resolved bool to actual createProductHost; reuse Source69 capture/current-byte checks and existing execution/continuation availableArtifacts signatures. Lost selection, changed source/capture or mismatched inputs reject without recapture or fallback.

Completed ordinary/direct/window resume and status use existing read-only branches, checking original binding without host/SDK activity or new completion time. Preserve legacy unselected bytes and original ledger/window/start/deadline.

**Files:** CLI index/session/continuation-session/control; intake; a shared runtime selection helper; minimal product-host/entrypoint binding only if required; focused CLI/runtime fixtures, quickstart, this plan.

- [ ] RED→GREEN public parsing, confirmation display/cancel/EOF, real factory selection and legacy/preparation guards.
- [ ] RED→GREEN incomplete recovery, first coding continuation, source/selection/capture drift and completed read-only bytes/mtime/call counts; one existing host seam representative.
- [ ] Run affected tests/typecheck/build; UTF-8/LF/中文 readback/diffcheck; commit exact source SHA for independent review.

Source/free fixtures only. Reuse Source68/69 browser/lifecycle evidence. PERFORMANCE stays not_executed; 230/221/7/two-policy partial and all original budgets remain. No paid/model/human validation, private state or main writes.
