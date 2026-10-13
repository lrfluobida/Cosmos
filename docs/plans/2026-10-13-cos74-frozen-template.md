# COS-74 Frozen Template Repair Implementation Plan

**Goal:** Restore fixed native and C6 input reads while retaining trusted frame sampling and strict template checks.

**Architecture:** Move the unchanged observer from `templates/2d/render-frame-observer.ts` to `templates/rendering/render-frame-observer.ts`. Only installed-source lookup paths change; captures retain `_cosmos/render-frame-observer.ts`, and all frozen declarations, hashes and historical records stay intact.

**Tech stack:** Node 22, TypeScript, node:test. Dedicated implementer `cos74_implementer`, independent reviewer `cos74_reviewer`, sole merger `cos74_merger`. Issue [COS-74 / #75](https://github.com/lrfluobida/Cosmos/issues/75).

- [x] Add a real repository read to `tests/e2e/validation-declaration.test.ts` and C6 extra-file/byte-drift guards to `tests/transfer/validation-input.test.ts`. Run native and existing C6 fixed-input tests before moving the source; expect the actual fixed-template file-set error.
- [x] Move observer bytes unchanged; update `src/runtime/entrypoint-frames.ts`, `src/runtime/render-frame-selection.ts`, `tests/cli/render-frame-selection.test.ts`, `tests/cli/render-frame-upgrade.test.ts` and `tests/acceptance/render-observer.test.ts`.
- [x] Run `node --experimental-strip-types --test tests/e2e/validation-declaration.test.ts tests/transfer/validation-input.test.ts`; run the fixed-input cases in `tests/transfer/validation-case-six.test.ts` plus `validation-case-six-task.test.ts`. Run affected CLI selection/recovery/compiled-upgrade and observer/host tests; `npm run typecheck` and `npm run build` precede compiled upgrade checks.
- [x] Verify exact observer bytes, unchanged frozen eight files/declarations, UTF-8/LF and Chinese readback. Update `PROGRESS.md`, `docs/specs/cosmos-spec.md`, `docs/specs/cosmos-issues.md` and `docs/specs/github-issues.json` minimally; commit and send exact SHA/evidence for independent review.

**Limits:** Source/free fixtures only; reuse prior native rendering and long integration evidence. No private ledger reads, paid calls, reference-game access, closure12 completion or C7 success claim. Root owns accounting and real closure/C7 execution; `cos74_merger` owns this source integration.

## Results

Independent reviewer `cos74_reviewer` read the full plan and approved it before implementation. All commands use Node 22.22.2; TAP files below are in `C:/Users/26557/AppData/Local/Temp/`.

| Verification | Result | Raw evidence |
| --- | --- | --- |
| Before move: native current-repository and C6 original fixed-input tests | 2 expected failures, both exact template file-set errors | `cos74-baseline-red.tap` |
| `--test tests/e2e/validation-declaration.test.ts tests/transfer/validation-input.test.ts tests/transfer/validation-case-six-task.test.ts` | 15/15 passed; byte/extra/missing/encoding guards retained | `cos74-fixed-input-green.tap` |
| `--test --test-name-pattern='case6 fixes\|case6 fixed input uses' tests/transfer/validation-case-six.test.ts` | 2/2 passed, original declaration hash retained | `cos74-case-six-green.tap` |
| CLI selection/recovery, observer, host capture and advisory build tests (serial) | 30 passed / 2 failed, no skip | `cos74-render-focused.tap` |
| `--test --test-concurrency=1 tests/cli/render-frame-upgrade.test.ts` | 3/3 passed, includes compiled installation source lookup and historical reads | `cos74-compiled-upgrade.tap` |
| `npm run typecheck`, `npm run build` | Both exit 0 | Tool output; no duplicate compile run |

The two selection failures expect versions without the COS72 `module-repair` suffix. The independent reviewer reproduced both on untouched base `ac8874b` using `--test-name-pattern='public selection is displayed\|omitted and explicit false'` (2 failures/0 skipped, 5197.7616 ms, tool chunk `b44be8`). The actual observer signature remains identical. Root directed keeping these baseline failures without broadening COS74.

Observer bytes remain exactly 11611 bytes; native rendering/long pipeline evidence from COS69 is reused. Root reports snapshot1943/settled8873950 micro-CNY/unknown-reserved0 after conservative settlement207689; closure12 and C7 remain unexecuted at source integration. No claim of full-suite, paid generation or performance acceptance.

## Reviewed integration

`cos74_reviewer` approved exact commit `9a423b316f0b0e1acf12565d9761146b2021a50b`: all 13 changed paths reviewed for spec compliance then code quality, no findings, FROZEN_TEMPLATE_OBSERVER_ISOLATION_SOURCE_READY. Sole merger `cos74_merger` merged it as `ad1d7f217bb0df0df9661aa673343356db316d76`; the merge tree exactly matches the approved candidate. Main `npm run typecheck` and `npm run build` exited 0. The focused command `node --experimental-strip-types --test --test-name-pattern='current repository satisfies|case6 fixed input uses' tests/e2e/validation-declaration.test.ts tests/transfer/validation-case-six.test.ts` passed 2/2, no skips, TAP 7067.421 ms; raw `C:/Users/26557/AppData/Local/Temp/cos74-merge-integration.tap`. UTF-8/LF, Chinese readback and diff checks passed. Scope complete for source/free fixtures; Root records external issue state and performs real closure12/C7 separately.
