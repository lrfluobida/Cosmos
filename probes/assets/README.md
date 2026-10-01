# COS-04 original media probe

This is an authored **platform capability fixture**, outside the generic game template. It is not a Cosmos-generated game or a prebuilt benchmark unit library.

## Source and reuse conditions

`specs.ts` is the complete authored source: 18 numeric vector layers, 14 poses for the Copper Scout robot, an original eight-second note motif and four short action sounds. The character is a generic mechanical scout; no image, music, audio sample or reference-game content was imported. No provider account, paid API, GPU, image model or downloaded music was used.

The implementer authored these probe geometries, pose offsets and note sequences for this repository. The generated probe assets may be used, modified and redistributed with Cosmos outputs. There are no third-party asset attribution or asset-license conditions introduced by this source. This is a source/provenance statement, not a claim that a similarity search or legal review was performed.

The renderer accepts fresh structured specs from future runtime art-agent tasks. The real target game's character definitions and compositions must be created during that timed, billed generation run. Do not copy this probe into the production template as evidence of generation.

## Reproduce

From the repository root on the existing Node 22 environment:

```powershell
npm ci --no-audit --no-fund
node --experimental-strip-types --test tests/media/*.test.ts
npm run build
node --experimental-strip-types probes/assets/generate.ts
node tests/media/browser.mjs
```

The final command uses the installed Playwright Chromium. If that browser has not been prepared, run the repository's normal browser setup (`npx playwright install chromium`) once. No dependency changes are needed.

Generated material is in ignored `.cosmos/media/`:

- `assets/`: all 14 transparent SVG frames, five playable WAV files, `manifest.json`, and serialized `input-specs.json`.
- `generation.json`: measured render/write time and the zero-fee record, grouped by procedural layers, paid images and audio synthesis.
- `evidence/browser.json`: decoded image/PCM measurements, exact browser version, state traversal and video location.
- `evidence/idle.png`, `attack.png`, `death.png`: imported browser views on light and dark backgrounds.
- `evidence/*.webm`: actual browser import and button-driven state transitions.

`preview.html` supplies the browser preview and native audio controls. The test serves it with an allowlisted local HTTP server, imports the compiled production renderer's frame-selection function and records normal button clicks. Audio playback is tested muted so the probe does not unexpectedly play sound on the user's computer. Audio listening quality still needs human judgment.

## Observed result, 2026-10-01

- Windows, Node 22.22.2, Chromium 153.0.8010.12; real browser import passed for 14 SVG frames, three states and five WAV files.
- 192 × 192 frames, pixel anchor `(96, 175)`, normalized origin `(0.5, 175/192)`, transparent canvas. All frames have visible nonempty geometry, antialiased edges, no occupied border pixels and no RGB matte in fully transparent pixels.
- Idle: four frames at 6 fps, loops. Attack: six at 10 fps, holds its last frame. Death: four at 6 fps, holds its last frame. Reset elapsed time to zero on every state change. No frame trimming or anchor movement.
- PCM16 mono at 22050 Hz: music 8 s, confirm 0.24 s, attack 0.20 s, impact 0.22 s, power-down 0.60 s. All decode, have nonzero RMS, bounded peaks and zero endpoint samples. Native browser playback reaches ready state 4 with no media error.
- The author inspected imported attack/death screenshots and the complete frame contact sheet. States are readable; shapes and palette stay consistent; no visible matte edge on either background.
- Generation plus file writes took **66.32 ms** in this run. External calls: **0**. External fees: **¥0**. GPU memory: not used. This is one local measurement, not a throughput guarantee.
- One asset candidate, 14 accepted frames and five accepted sounds; zero asset generation retries and zero discarded frames. Browser harness development had two failed attempts due to a RAF timestamp preceding an input/module-continuation timestamp. Clamping the preview's elapsed time at zero fixed it; the successful import has no page errors. Harness failures are not hidden as asset discard counts.

The tracked `evidence/contact-sheet.png` and `evidence/verification.json` preserve a compact snapshot. Larger video/WAV artifacts remain reproducible under `.cosmos/media/` in the implementer worktree.

## Budget interpretation and remaining limits

The local route adds no external media-service charge to the shared ¥150 capability ledger. The previously reserved ¥0.721771 direct API amount remains unchanged by this probe; other parallel probes have their own entries. Spec authoring/model fees and full integration time are not measured by the 66.32 ms renderer figure.

Local procedural generation is feasible for this small sample within the media portion of the ¥200 / 12h hard cap and ¥100 / 6h target. This does **not** prove the complete game, all character mappings, UI work, agent calls, reviews and retries can finish within either budget. The initial implementation route is local SVG + PCM synthesis. Image-service capability is still untested; add a paid provider only if later visual requirements need it, with ledger admission before calls.

The probe uses browser Canvas import, not Phaser's loader, atlas packing or a full game. The output contains individual SVG frames, so no raster conversion is required for this test. Audio is intentionally a simple synthetic palette; musical appeal, long-term listening comfort and final game volume controls are not established here. Future COS-07/COS-09 integration must register runtime provenance, install the state/trigger mapping, keep each character in its own asset directory and perform the relevant in-game checks.
