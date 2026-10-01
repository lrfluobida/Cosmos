# COS-04 media pipeline

Local tools turn structured art-agent output into deterministic SVG frames and PCM WAV. They do not make provider requests or write files. The caller owns run admission, task/artifact registration and file destinations. The authored fixture and measurements are in [the COS-04 probe](../../probes/assets/README.md).

## Vector interface

`src/media/vector.ts` exports:

- `validateCharacter(input: unknown): CharacterSpec`: validates and copies a JSON-shaped input into allowlisted fields. Invalid input throws `Invalid media spec: ...` before rendering.
- `renderCharacter(input: unknown)`: returns `{ manifest, files }`; each file is `{ name, svg }`. Store each character in its own directory because frame names are local to that manifest.
- `animationFrame(state, elapsedMs)`: chooses a filename from a **generated** manifest state. Looping states wrap; other states hold the final frame. The caller resets elapsed time when switching states and decides what event selects each state.

```typescript
import { renderCharacter, animationFrame } from './src/media/vector.ts';

const result = renderCharacter(parsedArtAgentJson);
const state = result.manifest.states[0];
const currentFile = animationFrame(state, elapsedSinceStateChangeMs);
// Draw at worldX - manifest.anchor.x, worldY - manifest.anchor.y.
```

Layers are drawn in array order. Each is a rectangle or ellipse described by `x`, `y`, `width`, `height`, `fill`, `stroke`, `strokeWidth` and optional rectangle `radius`. A frame maps layer IDs to optional `dx`, `dy`, `rotation`, `scaleX`, `scaleY` and `opacity`. Unspecified values use the base pose. Rotation and scale act around each layer's center, then translation is applied. There are no groups, arbitrary paths, markup, scripts, fonts, filters or external URLs.

All frames retain the same transparent canvas and pixel anchor; no trimming occurs. The manifest also includes normalized `origin` for engine integrations. Frame order is explicit in each state, and filenames use a zero-based three-digit index. `transparent: true` means no canvas background is drawn, not that every input shape must be translucent.

| Input | Bounds |
| --- | --- |
| Canvas | Integer width/height 16–512 |
| Anchor | Inside inclusive canvas dimensions, in pixels |
| IDs | 1–48 lowercase ASCII letters/digits/hyphens, starting with a letter; Windows device names excluded; layer/state IDs unique |
| Layers | 1–64 rectangles/ellipses; dimensions 0.1–512; coordinates −512–1024 |
| Colors/stroke | Six-digit hex only; stroke 0–16; corner radius at most half the smaller dimension |
| Animation | 1–16 states; 1–64 frames/state; at most 256 total frames; 1–60 fps |
| Pose | Translation ±512; rotation ±180°; scale 0.01–4; opacity 0–1 |

Bounds limit work and allocation; they do not guarantee all authored poses remain on-canvas or aesthetically acceptable. Import checks must still inspect clipping, anchors, recognizability and light/dark background edges. NaN, infinity, sparse arrays, unknown fields and references to missing layers are rejected.

## Audio interface

`src/media/audio.ts` exports `validateAudio(input: unknown): AudioSpec` and `synthesizeWav(input: unknown)`. The latter returns `{ bytes: Uint8Array, manifest }`. WAV data is RIFF/WAVE little-endian mono PCM16, with the exact rounded sample duration recorded in the manifest. `loop` is playback metadata; the browser/engine must set its own loop flag.

An `AudioSpec` provides an ID, sample rate, duration, loop flag and notes. Each note has MIDI pitch, start/duration in seconds, gain, `sine` or `triangle` wave and linear attack/release durations. Frequencies use A4 = 440 Hz. Each note begins/ends at zero; overlapping notes are mixed then uniformly scaled only if the peak exceeds 0.9, avoiding hard clipping. This small synth has no imported samples, random noise or third-party compositions.

| Input | Bounds |
| --- | --- |
| Sample rate | 22050, 44100 or 48000 Hz |
| Clip length | 0.02–30 seconds |
| Notes | 1–512; total rendered voice samples at most 12 million |
| Pitch | Integer MIDI 24–96 |
| Gain | 0–0.5 per note |
| Timing | Note at least 0.01 s, within clip; attack/release at least 0.002 s and combined no longer than note |

A 30 s/48 kHz clip uses at most 1.44 million mix samples. Note-work bounds are checked before allocation. Output is deterministic for the same spec and runtime. This is a compact synthetic sound palette; it does not guarantee seamless musical phrasing, loudness matching or perceptual quality for arbitrary accepted specs. The probe explicitly checks its loop seam, decoded signal and playback.

## Evidence and future runtime use

Seven focused Node tests cover safe input rejection, state timing and WAV headers/signal. The initial test run failed for the unimplemented renderer/synth; the current suite passes. A later sparse-array regression first reproduced a missing rejection/TypeError, then passed after dense-array validation. `npm run build` passes without changing dependencies.

The browser probe imports all 14 frames, traverses each state through button clicks, checks complete frame order, loops/terminal holds and anchor consistency, decodes five WAV files, and checks muted native playback. Author visual inspection found the original robot consistent and the attack/death states readable on light/dark backgrounds. Compact evidence is tracked under `probes/assets/evidence/`; generated audio and import video remain under `.cosmos/media/` and can be reproduced using the probe README.

COS-07 should request fresh `CharacterSpec`/`AudioSpec` JSON and call these tools. COS-09 should register generated files with runtime task/run IDs and source references, then connect engine loading, state changes and audio triggers. The sample character, poses and melody must not be baked into production templates or counted as runtime-generated game content.

The probe incurred ¥0 external media fees and measured 66.32 ms for generation plus writing. Spec authoring, model calls, review, game integration and final acceptance are outside that timing. This verifies the small local media route; complete-game feasibility within the shared ¥200 / 12h hard cap or ¥100 / 6h target remains unproven. Phaser-specific loading, full-game character mappings and listening quality still require later evidence.
