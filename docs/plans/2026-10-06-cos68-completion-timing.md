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

## Implementation evidence

The independent COS68 reviewer `cos67_implementer` approved plan-only `e9d4a34916385fb3f2fb84ab7cc3af207a204a00`. The initial design above remains 294 words. The following records implementation evidence separately.

Both actual entrypoints publish their immutable automatic report with `requiresCompletionTiming`, then attempt all started warning/control/preparation resources, drain owned work/accounting, confirm registry/child/owner closure, and publish a separate write-once timing receipt. Initial closure extends the existing nonce/snapshot event mechanism; window closure retains its idle receipt. Binding includes exact report SHA, whole package signature, effective task proofs, closed snapshot, initial/current clock and resource inventory. Only this completion receipt uses an ephemeral in-memory Node Ed25519 key: its public key is bound before close through the existing completion anchor; the private key never enters files/logs/roles/game. The signature authenticates the actual post-close body, beyond a replaceable public checksum. Root approved this necessary local anti-tamper correction; no new dependency or generic crypto framework.

New flagged late/missing/unconfirmed/fee-unreconciled/stopped deliveries retain original report bytes but cannot be approved as final completion. Legacy unflagged reports remain read-only with timing unverified. Read-only new stopped deliveries return their fixed incomplete evidence without reopening execution. Initial measured endpoints are reused across additional windows; an unmeasured legacy initial endpoint stays unverified. Waiting starts separately at a verified cleanup endpoint, preserving old reportedAt/elapsed semantics. Source67 host/catalog and Root tracking are unchanged.

Safe raw outputs are in `C:/Users/26557/AppData/Local/Temp/`:

- `cos68-initial-drain-red.tap`: 1 FAIL / 0 skip; actual initial entrypoint returned while its 80ms owned operation was still pending. Same test GREEN `cos68-initial-drain-green.tap`: 1/1, 273.6434ms. `cos68-runtime-boundaries.tap`: 7/7, 4430.1979ms.
- `cos68-final-runtime-boundaries.tap`: 13/13, 0 skip, 5478.3979ms; delayed drain, cleanup failure, simulated late/backward/invalid clocks, unknown fixture charges, durable stop, actual Node tree drain, no report, unresolved child intent, post-close owner race, actual still-live child, registry writer. These are free source fixtures, not native generation or a real 12h score.
- `cos68-public-completion-boundaries.tap`: 6/6, 0 skip, 19831.2311ms; actual public/direct/explicit-window entrypoints, legacy/new report decisions, fixed sidecar reuse and full tree bytes/mtime, report/snapshot/package/sidecar drift, preservation of measured initial endpoint. `cos68-package-initial-signature.tap`: affected 2/2, 9392.7844ms.
- `cos68-timing-downgrade-red.tap`: removing the new flag and rewriting the report checksum initially entered legacy mode (1 FAIL). Existing closing anchor detection fixed it; `cos68-timing-downgrade-green.tap` with legacy compatibility 2/2, 8689.5371ms.
- `cos68-endpoint-proof-red.tap`: rewriting end and public checksum initially yielded in_time (1 FAIL). Anchored ephemeral public key plus post-close signature fixed it; `cos68-endpoint-proof-green.tap`: endpoint/ordinary/initial-score 3/3, 16252.7578ms. `cos68-signed-late-failed-gates.tap`: replacement-key/late/cleanup-failed 3/3, 11953.3138ms.
- `cos68-final-affected-runtime.tap`: 6/6, 5473.0237ms; `cos68-final-affected-cli.tap`: 4/4, 17480.7157ms. Unaffected passing cases reused after signature/reader changes.
- `cos68-stop-cold-cli.tap`: first stopped direct/public check exposed public CLI stop gating before completed recognition (1 FAIL); cold compiled fixture passed. Reordering only completion recognition fixed the stopped case: `cos68-stopped-completed-green.tap` 1/1, 5936.1177ms. Final combined `cos68-final-cold-stop-cli.tap` preserves both raw results.
- `cos68-existing-affected-representatives.tap`: three meaningful existing entrypoint/reconciliation/confirmation tests passed (8983.5757ms); Node also reported one empty filtered experience-file load, which is not an additional behavioral proof. `cos68-idle-compat-representatives.tap`: 4/4, 4524.8804ms; original close/failed close/snapshot drift guards.
- `cos68-signed-endpoint-typecheck.txt` typecheck exit 0; `cos68-cold-build-current.txt` final tsc exit 0 / 8.3852419s. Final cold CLI uses no API credentials and retains the exact endpoint and tree.

UTF-8/LF/readback/diff checks cover all edited paths. Actual model/paid/human/new-window activity is NONE. Implementation approval is pending; final exact SHA is supplied to the independent reviewer, not self-approved.
