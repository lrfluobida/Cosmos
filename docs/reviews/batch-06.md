# Batch 06 review and integration record

Date: 2026-10-01. Sole merger: `batch06_merger`. Starting main: `3bf5ea589b4d22786b410b201131b8c09620db07`; [plan](../plans/2026-10-01-batch-06.md).

## Fixed COS-10/11 trial checkpoint

Root handed off independent review `READY_FOR_FIXED_TRIAL_INTEGRATION`, with no P1/P2 findings, for exact source `4fb66fa1379149fba5c27d81ffa37736580ce8c5` on `feat/cos-10-e2e`. Merge `17b41e46d03fb1cd0f1949e6c3c23d862d304d0d` has first parent plan commit `b958275` and second parent that approved SHA. It merged without conflicts over the newer COS-12 Phase B code; all eight owned files match the approved source. The merger made no implementation edits.

Fresh integration evidence on Windows / Node.js 22.22.2:

| Check | Result |
| --- | --- |
| `node --experimental-strip-types --test --test-concurrency=1 "tests/e2e/*.test.ts" "tests/roles/repair-*.test.ts" "tests/runtime/recovery/dependencies.test.ts" "tests/runtime/recovery/dag.test.ts"` | 103/103 passed; zero failures, cancellations or skips |
| `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --allowImportingTsExtensions probes/e2e/run.ts` | Passed |
| `npm run build`, then `npm run typecheck` | Both passed |
| Approved-path comparison, UTF-8/LF and whitespace | Verified |

Local TAP log: `.cosmos/integration/batch06-trial.tap`. Test files ran sequentially, followed by all compiler commands. The real Edge fixture observed an injected ordinary-input defect; scripted native-session fixtures exercised a real compiler failure, bounded repair and protocol correction. These are platform checks, not generated-game acceptance. Unchanged browser/media probes were not repeated.

Release the clean pushed checkpoint to root for the one fixed `cos10-cos11-validation-1` paid trial. Freeze main code until root releases that platform HEAD. The merger has not run the trial, accessed credentials or touched the live ledger and old pilot artifacts. Recorded shared cost remains 892,282 micro-CNY; root will record any new trial cost and result separately. The original shared deadline, cumulative CNY 30 probe cap, CNY 150 ledger, failed pilot history and consumed continuation stay intact.

COS-10 / #11 remains open without a passing game, COS-11 / #12 remains `offline-verified-awaiting-live`, and G3 stays closed. COS-12 / #13 remains closed. COS-13 / #14 is awaiting fixes and final independent approval; candidate `b2d5cfc` is not merged. No issue completion is claimed by this checkpoint.

## Fixed trial outcome and startup recovery

Root recorded the fixed trial starting at `2026-10-01T11:43:38.426Z` and failing at `11:43:46.630Z` (8.204 seconds), during the requirements capture publication window before any model session or request. The original cause remains unknown; three successful isolated reproductions do not establish a cause. Original results and markers were preserved.

Independently approved startup recovery `841b86c3f64e18d0eb9b8adad67fd84590de0112` merged and pushed as `7c130e76023186bd64ec0e36be30b59574ca0d7e`. All six paths matched the approved source; the production bootstrap fixture passed 1/1 on main, with approved strict TypeScript evidence reused. It permits one recovery only while the same trial has zero requests and the original inputs, journal and deadline remain intact. Root's command at `12:45:38Z` was rejected by the original `12:43:38.426Z` deadline before any recovery marker or model request. No further trial or recovery attempt is permitted, and no clock is extended. New cost is zero; shared cost remains 892,282 micro-CNY with zero reserved/unknown charges, as reported by root. No generated game passed, #11 stays open and G3 remains closed.

## COS-13 integration and release

Independent final READY approved `cf7d5f63a7df5de45a0fa187b5ed727304bf5344`, including the full A/B/C implementation and the sole P2 cancellation fix. The fix stops cancelled recovery before calling the host capture adapter. Merge `d3aab995c8b29a384c389192323c6dfa47cc4f98` has first parent `c123099` and second parent the approved source. All 13 owned paths match that source byte for byte; no conflicts or merger implementation edits occurred.

The combined command `node --experimental-strip-types --test --test-concurrency=1 "tests/runtime/scheduler/*.test.ts" "tests/roles/*.test.ts" "tests/runtime/*.test.ts" "tests/runtime/recovery/*.test.ts" "tests/e2e/*.test.ts"` covered 219 tests: 218 passed, and the existing real Edge diagnosis fixture failed at an observation with 3 ms remaining. Its isolated rerun with `--test-name-pattern='actual normal-input browser failure' tests/e2e/diagnostics.test.ts` passed 1/1. The acceptance runner and diagnosis paths are unchanged by this merge; no timing thresholds or assertions were changed. This records an observed timing failure and successful focused rerun, not a single all-green suite. Logs are `.cosmos/integration/batch06-scheduler.tap` and `batch06-scheduler-browser-rerun.tap`.

The strict probe TypeScript command from the earlier checkpoint, `npm run build` and `npm run typecheck` then passed sequentially. UTF-8/LF, existing Chinese text and whitespace checks passed. Browser fixtures and compiler commands ran sequentially. Unchanged media probes and the earlier A/B author checks were reused.

The approved scope includes bounded host task slots, shared-controller accounting, dependency/resource exclusion, ordinary concurrency of two, effective concurrency of one for recovery or review correction, backoff, deadline/drain handling and idle native compaction. Compaction tests use the native SDK with mocked HTTP; the 12-hour boundary uses a simulated clock. Real long-chain measurement remains with root, and #14 is `offline-verified-awaiting-live`. #11/#12/#14 remain open; COS-12 / #13 stays closed and G3 stays closed. Integration made no paid calls and did not change the live ledger or any trial artifacts.

Command-scoped proxy push and `ls-remote` confirmed code SHA `d3aab995c8b29a384c389192323c6dfa47cc4f98`. The API then confirmed both [#11 trial outcome](https://github.com/lrfluobida/Cosmos/issues/11#issuecomment-5931925580) and [#14 offline integration](https://github.com/lrfluobida/Cosmos/issues/14#issuecomment-5931926489) remain open. This completion record supersedes the earlier pending-review and trial-release checkpoints. Documentation synchronization releases a clean main for subsequent separately implemented and reviewed work.
