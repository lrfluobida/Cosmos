# COS69 rendered frame sampling plan

> Author: cos67_implementer; independent reviewer: cos65_implementer; BATCH11 sole merger: cos66_implementer. PLAN_APPROVED before implementation. COS68 independent review has priority.

**Goal:** Collect actual rendered-frame samples; PERFORMANCE remains not executed.

**Base/contract:** `2c780bc80cbab1d4d9e58d16e62995f19238f2f9`, [COS69/#70](https://github.com/lrfluobida/Cosmos/issues/70), spec 4B and unchanged provisional catalog.

**Design:** A source-owned observed-Game factory attaches before Phaser boot/loop binding. Private counters accept completed native Game.step → nonnull renderer → active scene/native context drawing → postRender chains. Preserve original calls and game state; validate fixed Game/renderer/canvas/method identities. Expose only immutable snapshots. Manual events, headlessStep, RAF and target/EMA counters cannot produce frames.

Trusted host options select a bounded 2000ms observation, persisted with its input binding. Capture the factory at project `_cosmos/render-frame-observer.ts`, outside author-only src/index writes. Advisory worker assembles and rechecks the same optional capture/ref/bytes/signature; four legacy configuration files remain unchanged. Existing normal/persistent runner reads snapshots after normal visible input, within the original deadline; no model script, extra execution or state/storage injection.

**Files:** New `templates/2d/render-frame-observer.ts`, `src/acceptance/render-frames.ts`, `src/runtime/entrypoint-frames.ts`; minimal host, normal runner, browser/persistent options, coding-check module staging and template example edits. Focused unit/host tests, one real Phaser/browser integration; this plan. Exclude COS68 entrypoint/experience/controller-close files and Root tracking.

- [ ] RED/GREEN: reject fake/null/empty/inactive renderers, manual emits, hidden/paused/changed objects, tampered observer, lost/decreasing frames/time, wrong identities/windows and deadline exhaustion.
- [ ] Record raw frame sequence/monotonic endpoints, average frames/elapsed, exact candidate/run/task/attempt/spec/requirement/design/media/observer/plan, buffer/CSS/DPR/browser mode/recording and known/unknown machine facts. Invalid samples stay insufficient; low valid measurements never trigger repair under unfrozen conditions.
- [ ] Verify original raw/review/TaskJournal closure, real native rendering and 800×500 FIT versus 1280×720 viewport. Reuse Source64–67 evidence; preserve 230/221/7/two-policy partial reports and 55/30 future thresholds.
- [ ] Run affected checks/typecheck/build, UTF-8/Chinese readback/diffcheck; commit exact SHA for independent review.

Source/free fixtures only; paid/model/human/new-window NONE. Shared ¥150, formal ¥200/12h and target ¥100/6h unchanged; unknown fees/reference/G4/full-game prerequisites remain.

## Source verification record

Independent reviewer actual `cos65_implementer` approved plan `509a7e31e308be94f02d61ad37b9572e6cef38be` after the one optional module-staging clarification. The original plan above is 295 words. Source/tests checkpoint `2ac5858e01f363c9ee097545505152620350f56f` changes fourteen paths: eight production paths (including the template module) and six tests. Root tracking, classic catalog, defaults, and COS68 entrypoint/experience/controller-close files are unchanged by this task.

The trusted host API selects `renderFrames: true`; its captured observer is `_cosmos/render-frame-observer.ts`, outside author src/index writes. Candidate dependency closure, coding rules and real advisory worker use the same ref/bytes/signature. The unchanged four configuration files remain the legacy contract. Both builders add only the selected observer as a Vite entry, preserving its exported read function. The runner imports that exact compiled entry namespace, reads private immutable snapshots after normal inputs, and stores the request/sample in its original raw directory. The host rechecks capture/candidate/source, exact plan/browser/window and actual raw request/sample/report bytes; review and journal signatures include them. No author FPS/debug/global counters are used.

Each counted row represents one native Game.step completion with native context draws, one renderer postRender boundary, at least one active scene render and a private step sequence. Raw rows also record loop.frame as an independent cross-check. Multiple draws/cameras/scenes cannot add rows. Real test data has two active scenes and twenty hand-emitted null POST_RENDER events per step, while each loop frame still yields exactly one counted row. Paused/hidden/empty/null/wrong canvas, changed Game/renderer/observer and missing/backward frames/time remain insufficient; valid low values have no code-defect or repair verdict. Machine/workload/duration freeze is absent, so PERFORMANCE remains not_executed and the classic 230/221/7/two-policy partial report is preserved.

TDD evidence:

- Missing sampling module RED: 1 failure/0 skips, 152.8748ms; shape/count/clock/binding GREEN 3/3, 173.0047ms.
- Production selected observer capture RED: 1 failure/0 skips, 3945.8269ms; caller/per-plan partial report GREEN 1/1, 8253.013ms.
- Native build exposed template-module typing and Vite reader-export tree-shaking; exact compiler/compiled-entry evidence drove the local corrections. Failed own raw roots `cos66-host-5w6XeZ` and `cos66-host-ejiwqu` remain. The later native GYlRXt record passed 1/1, 26457.7513ms; it is pre-final trace evidence.
- Native boundary RED: manual/double-post row was accepted, 1 failure among 4 tests, 185.2792ms; trace/validator GREEN 4/4, 197.5365ms. Synthetic transport executes the actual factory: multiscene/draw/manual emits/EMA/null/wrong-canvas/inactive/empty/hidden/paused/changed-renderer/new-Game passed 6/6, 835.4371ms. These VM cases are not native rendering evidence.
- Advisory module staging RED missing seam: 1 failure, 2140.8941ms; optional ref/path/bytes/signature and unchanged four-file legacy staging GREEN 1/1, 2672.4757ms. Changed capture host proof stays insufficient and cannot dispatch a code-defect repair.
- Snapshot-read identity RED: swapping renderer after the last frame still claimed a native pipeline (1 failure, 611.0501ms); adding the read-boundary check gave final focused 15/15, 0 skips, 10957.8858ms. Low valid 2 FPS remains measured and unclassified; no 55/30 comparison occurs.
- Final unit/changed-runner/media representatives: 32/32, 0 skips, 12866.4664ms. The existing runner representative includes its small normal/fault cases; no full Edge/110-second/30-minute matrix was run or repeated.

Final native/advisory representative ran through the actual source production caller, pinned tsc/Vite, original clean Node launcher and actual Edge save/reopen. Latest sequential run is 1/1, 0 skips, test33482.2013ms/process36483.9785ms; raw `C:/Users/26557/AppData/Local/Temp/cos66-host-X3c9rn`. Advisory codes `[0,0]`, identical observer bytes. Edge154.0.4258.48 headless/screencast, PIDs34512→9164; each segment331 renderer completions over2002.0999999940395ms/2004.4000000059605ms (165.32640727285622/165.13669926113337 FPS). Actual800×500 versus1280×720 viewport, device/ordinary/endless workload/duration unfrozen and GPUunknown are explicit. Draw/post/step/loop trace, request/sample/report, fixed captures and review copies refer to the same candidate. Fixture author/data/approval inputs are synthetic; native rendering, compilation and process facts are actual. This is not model game generation, a frozen performance benchmark or human acceptance.

An earlier parallel final attempt `cos66-host-blGGpc` passed its assertions but failed after-hook owner close with `Owned child PID is alive`; the entire test is FAILED (40350.6008ms), retained in `native-pipeline.stdout.txt`. Its seven recorded PIDs were absent on a later read-only check; PID reuse/exit timing is only a hypothesis. No process was killed, no owner file was removed, and no ownership guard was relaxed. The final sequential new read-boundary/trace/advisory case above passed; `cos66-host-Okr66b` earlier healthy evidence is also retained, without replacing the failed run.

Safe final stdout: `C:/Users/26557/AppData/Local/Temp/cos69-final-source-evidence/{native-pipeline.stdout.txt,native-sequential.stdout.txt,unit-affected.stdout.txt}`. Final typecheck and build exit0; all fourteen source/test paths were re-opened with fatal UTF-8 decoding, LF and unchanged existing Chinese source lines; diffcheck passed. No source69 approval is claimed; exact combined candidate is submitted to actual65 for independent review and sole66 integration. Existing Source64–68 evidence is reused.
