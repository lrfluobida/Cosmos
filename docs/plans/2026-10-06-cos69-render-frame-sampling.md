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
