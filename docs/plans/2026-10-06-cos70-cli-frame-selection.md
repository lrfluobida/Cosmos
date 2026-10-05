# COS70 public CLI frame selection plan

> Author: cos65_implementer; independent reviewer: cos67_implementer; BATCH12 sole merger: cos66_implementer. Execute with superpowers:executing-plans after PLAN_APPROVED.

**Goal:** Expose `--render-frames true|false` and preserve the original selection across recovery.

**Base:** `c999d53dfa60900e600bd0b0f4151da2210f4fcb`; [COS70/#71](https://github.com/lrfluobida/Cosmos/issues/71), spec 4B. TypeScript/Node; existing product host, intake and receipts.

**Design:** Use the existing pair parser for new/resume/continue. Reject invalid/duplicate values and preparation selection before preparation, confirmation, activation or billing. Omission means legacy default on new; resume/continuation restores the original selection, while explicit conflict rejects.

Persist trusted selection before interview/display in intake origin/state; bind it and the original observer source identity/bytes into the existing confirmation source and fixed input closure. Keep model GameDraft unchanged. A small shared reader validates original run/spec and source/selection provenance before host execution or window activation. Pass the resolved bool to actual createProductHost; reuse Source69 capture/current-byte checks and existing execution/continuation availableArtifacts signatures. Lost selection, changed source/capture or mismatched inputs reject without recapture or fallback.

Completed ordinary/direct/window resume and status use existing read-only branches, checking original binding without host/SDK activity or new completion time. Preserve legacy unselected bytes and original ledger/window/start/deadline.

**Files:** CLI index/session/continuation-session/control; intake; a shared runtime selection helper; minimal product-host/entrypoint binding only if required; focused CLI/runtime fixtures, quickstart, this plan.

- [x] RED→GREEN public parsing, confirmation display/cancel/EOF, real factory selection and legacy/preparation guards.
- [x] RED→GREEN incomplete recovery, first coding continuation, source/selection/capture drift and completed read-only bytes/mtime/call counts; one existing host seam representative.
- [x] Run affected tests/typecheck/build; UTF-8/LF/中文 readback/diffcheck; commit exact source SHA for independent review.

Source/free fixtures only. Reuse Source68/69 browser/lifecycle evidence. PERFORMANCE stays not_executed; 230/221/7/two-policy partial and all original budgets remain. No paid/model/human validation, private state or main writes.

## Source verification record

Actual independent reviewer `cos67_implementer` approved plan `4754935888365e5f0810d387cd5a406fe7022f01` before implementation. The original plan is 275 words. Source checkpoint `6425a30da83997c986799b0f14c5fb848992d94d` changes thirteen paths: eight production paths, three tests/fixtures, README and quickstart. Candidate77e7 included fourteen total paths against `c999d53dfa60900e600bd0b0f4151da2210f4fcb`; the review correction below makes fifteen. Root tracking, Source69 observer/runner, game draft schema, ownership, fees and clock limits are unchanged.

The selected observer hash is saved with trusted origin/intake data before interview and shown before confirmation. The existing created event retains a selected hash marker before confirmation; its legacy reason bytes stay the same. Selected confirmation references use `vN-frames-<original observer SHA>` and their original source contains the same selection. That anchored source version prevents deleting both receipt/origin selection fields from silently falling back. Original observer identity/current source/capture bytes and availableArtifacts are checked before dispatch/activation, using existing Source69 protection and original execution/continuation signatures. Incomplete recovery and the first coding window restore the original bool; explicit conflicts refuse. The actual product factory also refuses a conflicting call before assembly. Completed ordinary/direct/window resume and status preserve original report/sample/decision/completion files and their modification times without host or SDK work.

Safe stdout is under `C:/Users/26557/AppData/Local/Temp`:

- `cos70-public-selection-red.tap`: public parser RED, four failures/one existing refusal passed, 222.1524ms. The first attempted GREEN exposed a fixture missing required player input (`cos70-public-selection-green.tap`, FAILED); the legal fixture passed 5/5, zero skips, 3198.7912ms in `cos70-public-selection-green-valid-fixture.tap`.
- `cos70-runtime-recovery-red.tap`: three meaningful failures, 12232.9658ms: missing runtime selection forwarding, absent selected status, and source drift admitted before window activation. The intermediate combined run kept one failure for missing separately confirmed host stages in its seam fixture (`cos70-runtime-recovery-green.tap`); the fixture was corrected without relaxing those guards.
- `cos70-lost-intake-red.tap`: deleting intake/origin selection before confirmation was accepted, one failure, 3382.2131ms. Existing created-event binding closes it; lost-choice plus legacy-false checks passed 2/2, 3473.9657ms in `cos70-lost-intake-green.tap`.
- `cos70-product-conflict-red.tap`: actual factory silently replaced an explicit call selection and reached assembly, one failure, 3593.4027ms. Its correction is included in `cos70-public-recovery-complete.tap`: 13/13 passed, zero skips, 16701.6099ms. This includes normal recovery, first coding continuation, original run/ledger/start/deadline, completed ordinary/direct/window/status and five source/capture/available-input drift cases.
- The existing source host seam was refined to use actual `createProductHost.execute` and its original role factory/observer capture. Injected session transport stops before any provider request; exact observer bytes reach the planner packet and ledger entries remain empty. `cos70-real-product-seam-green.tap`: 1/1 passed, test452.1962ms/process4137.6138ms. No browser/compiler/native rendering claim comes from this seam.
- Fresh build and typecheck exit0: `cos70-final-build.txt`, `cos70-final-typecheck.txt`. `cos70-cold-compiled-readonly.tap`: fresh dist CLI resume/status without credentials preserves signed endpoint/report/sample/synthetic stdin decision and all bytes/mtime, 1/1 passed, test10095.9865ms/process13455.551ms. `cos70-legacy-affected.tap`: seven affected original stdin/intake/preparation/confirmation/unknown-charge representatives passed, zero skips, 15793.5477ms.

Existing Source69 native rendered-frame and Source68 signed completion evidence is reused; no Edge/32/24/110-second/30-minute matrix was rerun. All role/provider/game data and stdin approvals/windows in these fixtures are synthetic; actual Node/source/compiled CLI/filesystem facts are separate. Real model generation, paid validation, human acceptance and full classic performance/12h scores remain unverified. UTF-8/LF/中文 readback and diffcheck passed. Exact source candidate awaits independent actual67 review and sole actual66 integration; no Source70 approval is claimed here.

## Independent review correction

Actual67 rejected77e7 with P2: a completed historical read compared the original observer against the current installed template, so an installation upgrade refused otherwise unchanged capture/report/signed endpoint. Its isolated fresh compiled CLI evidence is `cos70-independent-completed-source-upgrade.txt`; its three independent focused checks passed, zero skips, 7998.418ms in `cos70-independent-focused.tap`. These facts do not approve77e7.

Correction `a4b476be0973c3e9a6c297fd7ac3e64c84831ea1` separates original selection/source/capture reading from `requireCurrentFrameSource`. Completed ordinary/direct/window/status use original fixed proofs and do not depend on installed template bytes. Intake preparation/confirmation/activation, unfinished runtime/resume and first continuation still require the current source before host/fee/window activity. Original capture/ref/available-input/selection drift and explicit conflicts still refuse. Five production paths and one new test change; no sampler/owner/fees/deadline/private/main changes.

`cos70-upgrade-readonly-red.tap` retains two actual compiled installation-upgrade failures and one existing unfinished-execution refusal (22020.3254ms). After fresh build/typecheck exit0 (`cos70-upgrade-fix-build.txt`, `cos70-upgrade-fix-typecheck.txt`), `cos70-upgrade-readonly-green.tap` passes3/3, zero skips, 38495.5617ms: upgraded ordinary/direct/status retains synthetic approval, upgraded completed window/direct retains the original report, all original bytes/mtime/calls remain fixed, original capture drift still refuses, and unfinished resume/first continuation refuse before host/window activity. Only the temporary installation copy's observer was changed; original Source69/70 production observer bytes were untouched. Existing13 public/recovery, seven legacy checks and unaffected Source68/69 evidence are reused. New exact candidate awaits independent actual67 affected review.
