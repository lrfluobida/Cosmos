# COS64 Batched Media Implementation Plan

> **For agentic workers:** Implementer executes the reviewed plan with superpowers:test-driven-development; a separate context reviews the actual diff. Only batch08_merger integrates approved commits.

**Goal:** Connect bounded batches of runtime-authored media to one complete capture, coding input and normal-input media acceptance (COS09/COS15/COS18 source scope).

**Architecture:** Keep one art task, author session and independent review. Accept the legacy single-batch object or `{formatVersion:"batched-media/1",batches:[{characters:CharacterSpec[],audio:AudioSpec[]}]}`. Validate all batches before rendering, flatten into one manifest, and preserve the original envelope in `_cosmos/mediaSpec.json`. For media that cannot fit the existing 200-step plan, retain the normal plan unchanged and use a distinct generic read-only collection binding; transfer's existing `readonly-media/1` remains unchanged.

**Tech Stack:** TypeScript, Node test runner, existing SVG/PCM renderers and registry, Playwright Chromium/Edge; no new packages or model calls.

## Contract and limits

- Design allows 1..128 characters, 0..64 clips and the existing 1..16 states per character. These are platform limits, not a classic benchmark roster.
- Envelope contains 1..8 nonempty batches. Each batch has only `characters` and `audio`, at most 16 of each; total bounds still apply. The old object is one batch and retains 16/16 bounds. Validate exact unique union of IDs, states and loops against design before any output allocation. Preserve declared batch order in the flattened manifest.
- The art author is instructed to use successive normal file edits to append batches to the same `authors/art/media.json`, then finish only when its complete envelope matches design. Existing write grants and task/session/DAG remain sufficient; no extra model request or budget authority is added.
- Add `readonly-media/generic-1` alongside the transfer packet: exact media and candidate references, manifest SHA256, SHA256 of the actual full normal plan, and manifest-derived `{id,path,expected}` fields. It has no transfer sourceVersion or persistent scope. The host reads the actual captured manifest, verifies metadata and bytes before/after replay, sends the trusted collection through IO and its actual worker, then validates the raw sample and coverage before accepting.
- Legacy small media still uses appended wait-for checks. Switch only when original steps plus complete definitions exceed 200. Do not raise that limit or remove gameplay inputs/assertions.
- Scalar reader keeps its default 592 fields. An explicit generic transport capacity permits at most 4544; retain one snapshot getter, non-configurable read-only root, data-only nested properties, safe paths and finite scalars. Runner validates generic candidate and plan hash, polls read-only snapshots up to 1500ms within its existing execution/cleanup deadline, and retains the last incomplete sample. Missing state, unloaded frames and unstarted/undecoded sound never create complete coverage.

## Task 1: Batched capture

Files: `src/runtime/entrypoint-media.ts`, `src/runtime/entrypoint-host.ts`, `tests/runtime/entrypoint-media.test.ts`, `tests/runtime/entrypoint-host.test.ts`.

- [ ] Add failing tests for 17 characters/17 clips in two batches, exact flattening and original envelope retention. Cover duplicate/missing/extra IDs, wrong state/loop, 9 batches, per-batch overflow and total overflow; retain old single-batch behavior.
- [ ] Run `node --experimental-strip-types --test tests/runtime/entrypoint-media.test.ts` and record expected RED.
- [ ] Implement bounded validation and rendering; update capability/design/art rules with complete capacity and append workflow.
- [ ] Extend the real production host fixture to capture all batches, expose complete coding inputs and stage the candidate. Verify final manifest and last batch files, plus review/recovery bytes.
- [ ] Run the two affected Node suites and commit.

## Task 2: Complete generic observations

Files: `src/acceptance/browser.ts`, `src/acceptance/runner.ts`, `src/runtime/entrypoint-media.ts`, `src/runtime/entrypoint-host.ts`, `tests/acceptance/media-observations.test.ts`, `tests/runtime/entrypoint-host.test.ts`.

- [ ] Add failing tests for >200 appended fields / >592 collected fields; assert original normal plan is retained and trusted IO receives actual manifest/candidate/plan binding.
- [ ] Add wrong-binding, missing-state, unloaded-frame and unstarted/undecoded audio rejection tests. Test 4544 field capacity and 4545 rejection while retaining default 592 and nested getter rejection.
- [ ] Run the affected tests for RED, then implement the generic packet, actual native IO forwarding, bounded read-only readiness and strict sample assessment.
- [ ] Run targeted unit/host suites, `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`, and commit.

## Task 3: Necessary browser and compatibility evidence

Files: new `tests/acceptance/generic-media.integration.ts` and shared `tests/acceptance/generic-media.fixture.ts`; `docs/development/quickstart.md`; this plan's evidence section.

- [ ] Before runner implementation, add a non-model browser fixture exercising the maximum 4544 fields, delayed real readiness, normal click/visible assertion and immutable properties. Record its expected RED. It must also reject a changed plan/candidate and nested getters; incomplete samples must stay incomplete. Use temporary evidence only.
- [ ] Run `node --experimental-strip-types --test tests/acceptance/generic-media.integration.ts` after GREEN. Run narrow legacy media/transfer consumer tests affected by the shared packet type, not the old full Edge matrix or generated-game run.
- [ ] Update the quickstart's capacity/batch description with a minimal Chinese patch after strict UTF-8 detection. Re-open all modified files, verify Chinese content and LF, run `git diff --check` and typecheck.
- [ ] Commit exact implementation SHA and request independent spec then quality review. Fix findings in this branch and re-review affected changes. Report tests/raw outputs, approved SHA and known gaps to the merger.

## Evidence and boundaries

Independent plan review approved `ea9e4234e7097be93bc05c69b6ac0222ba790b39`. Scoped implementation checks passed; independent actual-diff review is pending. The existing transfer suite is not wholly passing; its separate baseline failure is recorded below.

| Check | Result | Raw output |
| --- | --- | --- |
| Initial media/collection RED | 8 pass / 4 expected failures: design16/16, legacy single-batch overflow, plan200 and reader592 | Tool chunk `117192` (309.8342ms) |
| Production host RED | 5 pass / 3 expected failures at expanded design capture | `C:/Users/26557/AppData/Local/Temp/cos64-host-red.log` (8845.4707ms) |
| Real browser RED | New format rejected; normal/incomplete collection lacked a sample | `C:/Users/26557/AppData/Local/Temp/cos64-browser-red.log` (5992.8587ms) |
| Media / scalar / production host GREEN | 20/20 pass, 0 skip; 17 characters x16 states +17 clips =629 fields; all batches in capture, coding inputs, stage and recovery | `C:/Users/26557/AppData/Local/Temp/cos64-unit-host-green.log` (36650.9796ms) |
| Production host → actual IO.play → real Edge runner | 1/1 pass, 0 skip; captured/staged SVG/WAV files load, actual complete 629-field sample matches the host packet and original two-step normal plan | `C:/Users/26557/AppData/Local/Temp/cos64-host-real-final.log` (19422.2759ms) |
| Maximum real Edge fixture | 6/6 pass, 0 skip; normal, actual incomplete state/frame/decode/start, wrong plan/candidate, nested getter rejected without invocation | `C:/Users/26557/AppData/Local/Temp/cos64-browser-shared-final.log` (8388.8572ms) |
| Cross-category duplicate ID RED then affected media/scalar GREEN | RED accepted a shared ID; after exact-union validation 13/13 pass, 0 skip | `C:/Users/26557/AppData/Local/Temp/cos64-cross-id-red.log`; `cos64-media-final.log` (594.7119ms) |
| Final production typecheck | exit0 | `C:/Users/26557/AppData/Local/Temp/cos64-typecheck-final.log` |
| Existing transfer consumer/design check | 11 pass / 3 fail, 0 skip; normal promotion, linked repair, current media failure classifications and origin mount pass | `C:/Users/26557/AppData/Local/Temp/cos64-compatibility.log` (231893.9372ms) |

The three existing art/candidate/dependency tamper tests fail at `withPreparation`'s post-operation `requireCurrent`, after an earlier guard closes the origin listener. A pure tracked-source TEMP copy of baseline `70e2db38f5d4c61c8c12e5e4b20560260d600b59` reproduced the exact same art-tamper failure (`Owned transfer origin listener or fixed receipt changed`, same stack) with `node --experimental-strip-types --test --test-name-pattern='same-version art bytes' tests/transfer/runtime-acceptance.test.ts`: 1 fail, 0 skip, 11757.467ms; raw `C:/Users/26557/AppData/Local/Temp/cos64-baseline-art-tamper.log`, baseline directory `cos64-baseline-c4ee6731dbcc463690df7be1d21da3ae`. The other two have the same failure boundary but were not independently repeated on baseline. This task does not change that unrelated guard or count those three as passing.

The final maximum browser's raw reports/screenshots/video/logs are under `C:/Users/26557/AppData/Local/Temp/cos64-browser-lIcDFW`. The complete host/real-runner evidence (including registry captures/candidate, unchanged plan, real sample, host media-usage report and SVG/WAV files) is retained at `C:/Users/26557/AppData/Local/Temp/cosmos-browser-host-tSBi6Y`. The shared fixture counts actual per-frame image readiness, canvas display and WebAudio decode/start after a normal click; its synthetic 128/64 roster is a sampling capacity fixture, not generated content or a classic denominator. The host fixture injects a synthetic build and real runner through IO.play; it does not claim compiler or model evidence. Native production IO's owned-worker forwarding is inspected in source, separately from the in-process runner evidence.

During fixture reuse, serial fetching of 64 clips exceeded the existing 1500ms collection window. The failed raw report retained all 4544 actual values, including only 27 decoded/started clips and missing displayed states; it did not substitute expected values (`cos64-browser-shared-fixture.log`, raw `cos64-browser-CXRcEl`). The synthetic loader was changed to parallel loading; production capacity, readiness timeout and cleanup deadlines were unchanged. Both the maximum fixture and full host/runner path then passed above.

No actual model requests, paid admission, ledger mutation, reference assets, human acceptance or generated target game. C6 unknown974882 remains a prerequisite for new paid validation. Shared validation ¥150 and formal ¥200/12h (target ¥100/6h) remain unchanged. Complete classic trusted acceptance, frozen reference roster and user visual/listening judgment remain outside this source task.
