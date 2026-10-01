# Batch 07 review and integration record

Date: 2026-10-01. Sole merger: `batch07_merger`. Starting main: `0a10f4230c312cc9874be0e6499fd784b3ceba9c`; [plan](../plans/2026-10-01-batch-07.md).

## COS-18 Phase A approval checkpoint

Root handed off exact source `d80842961800da78cb4ddfcf29315f0e8ef776ef` on `feat/cos-18-cli`, independently approved by `cos18_reviewer` as `PHASE_A_READY` without P1/P2 findings. The reviewer inspected the actual nine-file diff and UTF-8 safety. The author's evidence includes 49 focused checks, 21 new-module checks including two actual process-exit scenarios, typecheck and build. These are offline platform checks; no paid generation passed.

Merge `e1679dc221f4307f91d82ef7adad8af6e8eaa3c4` has first parent plan commit `7cb408d39e762c57f46847322cbe67408f909c8f` and second parent the exact approved source. It merged without conflicts, and all nine approved paths match that source byte for byte. The merger made no implementation edits or changes to the active author worktree.

Fresh integration evidence on Windows / Node.js 22.22.2:

| Check | Result |
| --- | --- |
| `node --experimental-strip-types --test --test-concurrency=1 tests/runtime/intake.test.ts tests/roles/interview.test.ts tests/roles/budget.test.ts tests/runtime/run.test.ts tests/runtime/recovery/receipts.test.ts tests/runtime/recovery/snapshot-crash.test.ts` | 51/51 passed; zero failures, cancellations or skips |
| `npm run typecheck`, then `npm run build` | Both passed sequentially after tests |
| Approved-path comparison, UTF-8/LF and whitespace | Verified |

The tests include actual process exits before and after intake activation and before and after snapshot commits. Logs are `.cosmos/integration/batch07-cos18-a.tap`, `batch07-cos18-a-typecheck.log` and `batch07-cos18-a-build.log`. Test files and compiler commands ran sequentially. Unchanged full scheduler, browser and media checks were not repeated. All provider fixtures are offline; the merger made no paid calls or changes to runtime ledgers and trial artifacts.

Phase A covers intake accounting, current-draft confirmation and same-lock one-time activation. Public CLI/stdin, complete host assembly, run control and delivery remain Phase B work. COS-18 / #19 remains open.

## COS-01 resource metadata approval checkpoint

Root handed off exact source `b8790a8f4ee71303c600db717b1dbd6210630cdf` on `feat/cos-01-resource-evidence`, independently approved by `cos01_reviewer` as `READY` without P1/P2 findings. Its actual two-file diff only updates reference inspection/sources and adds the resource research note. The author passed 16/16 reference tests and the validation CLI; the reviewer reused those tests and checked strict UTF-8/LF, JSON, the actual diff and primary format-source implementation.

Merge `2aa62fa87e06058f1ea1473cdeaa1be44cc19c40` has first parent `2558c6402fb39cb5e3e3170a0ffee79254b08373` and second parent the exact approved source. It merged without conflicts, and both paths match that source byte for byte. The reference catalog, validator and tests are unchanged from the batch baseline, so the reviewed 16/16 test evidence is reused. Fresh `node benchmarks/classic-pc/reference/validate.mjs` passed on main and reported 230 entries and 221 unresolved entries; log: `.cosmos/integration/batch07-cos01-reference.log`. Strict UTF-8/LF, Chinese text, JSON status and whitespace checks passed. No further compiler or unrelated tests were needed for this documentation-only merge.

Resource entry counts are not unit counts, the configured locale does not establish the visible language, and UTF-16 entries were not decoded. Both rounds of UI capture failed without gameplay evidence. The version identity, catalog, `frozen: false`, `runtimeObserved: false` and `uiLanguage: null` remain unchanged. COS-01 / #2 stays open and the baseline stays provisional.

The batch does not change paid runtime status: shared cost is 892,282 micro-CNY with zero reserved/unknown charges; both failed pilot attempts and the expired fixed trial remain final under their original limits. COS-10 / #11, COS-11 / #12 and COS-13 / #14 remain open awaiting live evidence; COS-12 / #13 remains closed and G3 stays closed. The reference baseline remains provisional with 230 entries and 221 unknown entries.

## Partial batch checkpoint

COS-18 Phase A and the COS-01 metadata supplement were pushed as clean checkpoint `562d77522aeb32afc0d710ebb0f75fc24eb6e9d4`; local HEAD, origin/main and `ls-remote` matched. Root synchronized and read back [#19 Phase A integration](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-5933952295) and [#2 resource supplement](https://github.com/lrfluobida/Cosmos/issues/2#issuecomment-5933953194), both open. Phase B still requires its own final exact-SHA review and root handoff.

## COS-14 Phase A preparatory integration

Root handed off exact source `1c3e1899406b7f596ae27d1a5339110349763a45` on `feat/cos-14-acceptance-draft`. Independent `cos14_reviewer` inspected the actual diff in two rounds and gave final READY after the sole P2 floating-point timing-boundary issue was fixed. The approved fix compares inclusive interval endpoints without adding epsilon. Author evidence includes the original 8 draft plus 16 reference tests (24/24), syntax/type checks, UTF-8 review and four focused timing checks after the fix.

Merge `522ae51ca34716db7c62675277e71d293bd45fea` has first parent `562d77522aeb32afc0d710ebb0f75fc24eb6e9d4` and second parent the exact approved source. It merged without conflicts; all three new paths match the approved source byte for byte. Reference metadata/catalog/validator, core source and reference tests are unchanged from the prior checkpoint. The merger made no implementation edits.

Fresh `node --experimental-strip-types --test tests/benchmark/draft.test.mjs` passed 10/10 with zero failures, cancellations or skips. `node benchmarks/classic-pc/reference/validate.mjs` passed and reported 230 entries / 221 unresolved. Logs are `.cosmos/integration/batch07-cos14-draft.tap` and `batch07-cos14-reference.log`. Approved-path, strict UTF-8/LF, Chinese text and whitespace checks passed. The unaffected 16 reference tests and compiler evidence are reused; no build, typecheck, browser/media run or paid call was repeated.

The draft retains the complete supplied catalog and checks declared reference/target/run/spec bindings. Normal-input plans and mechanism references remain separate; comparisons are pure calculations. Results always remain `phase: draft`, `acceptance: blocked`. Evidence authentication, actual game execution, trusted step/equivalence records and mode runners remain missing. COS-14 / #15 remains open/preparatory, G4 stays closed, and the reference remains provisional at 230 entries / 221 unresolved. COS-18 Phase B and COS-16 case documentation still await their exact approved SHAs. This checkpoint does not change the shared ledger, old trials or any live gate.
