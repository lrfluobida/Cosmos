# Batch 07 review and integration record

Dates: 2026-10-01 to 2026-10-02. Sole merger: `batch07_merger`. Starting main: `0a10f4230c312cc9874be0e6499fd784b3ceba9c`; [plan](../plans/2026-10-01-batch-07.md).

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

COS-18 Phase A and the COS-01 metadata supplement were pushed as clean checkpoint `562d77522aeb32afc0d710ebb0f75fc24eb6e9d4`; local HEAD, origin/main and `ls-remote` matched. Root synchronized and read back [#19 Phase A integration](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-5933952295) and [#2 resource supplement](https://github.com/lrfluobida/Cosmos/issues/2#issuecomment-5933953194), both open. Phase B was still pending at this checkpoint.

## COS-14 Phase A preparatory integration

Root handed off exact source `1c3e1899406b7f596ae27d1a5339110349763a45` on `feat/cos-14-acceptance-draft`. Independent `cos14_reviewer` inspected the actual diff in two rounds and gave final READY after the sole P2 floating-point timing-boundary issue was fixed. The approved fix compares inclusive interval endpoints without adding epsilon. Author evidence includes the original 8 draft plus 16 reference tests (24/24), syntax/type checks, UTF-8 review and four focused timing checks after the fix.

Merge `522ae51ca34716db7c62675277e71d293bd45fea` has first parent `562d77522aeb32afc0d710ebb0f75fc24eb6e9d4` and second parent the exact approved source. It merged without conflicts; all three new paths match the approved source byte for byte. Reference metadata/catalog/validator, core source and reference tests are unchanged from the prior checkpoint. The merger made no implementation edits.

Fresh `node --experimental-strip-types --test tests/benchmark/draft.test.mjs` passed 10/10 with zero failures, cancellations or skips. `node benchmarks/classic-pc/reference/validate.mjs` passed and reported 230 entries / 221 unresolved. Logs are `.cosmos/integration/batch07-cos14-draft.tap` and `batch07-cos14-reference.log`. Approved-path, strict UTF-8/LF, Chinese text and whitespace checks passed. The unaffected 16 reference tests and compiler evidence are reused; no build, typecheck, browser/media run or paid call was repeated.

The draft retains the complete supplied catalog and checks declared reference/target/run/spec bindings. Normal-input plans and mechanism references remain separate; comparisons are pure calculations. Results always remain `phase: draft`, `acceptance: blocked`. Evidence authentication, actual game execution, trusted step/equivalence records and mode runners remain missing. COS-14 / #15 remains open/preparatory, G4 stays closed, and the reference remains provisional at 230 entries / 221 unresolved. COS-18 Phase B was still pending at this checkpoint. This checkpoint does not change the shared ledger, old trials or any live gate.

This checkpoint was pushed as `47c985c201ffd7f6e01289ddc3cb827278d38468`, with clean main and matching remote SHA. Root synchronized [#15 preparatory integration](https://github.com/lrfluobida/Cosmos/issues/15#issuecomment-5934444118), keeping it open.

## COS-16 transfer case preparation

Root handed off exact source `bb00583ccdaed9dfffd8fe31206de71ff0468fee` on `feat/cos-16-transfer-case`, independently approved by `cos16_reviewer` as READY without P1/P2 findings. The reviewer inspected the actual one-file diff, working rules, spec and relevant interfaces. It adds only `probes/transfer/README.md`, fixing the small grid-pushing case and T16-01 through T16-06 before future runtime generation.

Merge `6cc42f67941b39ef26ca3b31c2d379a5bfeda411` has first parent `47c985c201ffd7f6e01289ddc3cb827278d38468` and second parent the exact approved source. It merged without conflicts, and the document matches the approved source byte for byte. Strict UTF-8/LF, Chinese re-read and whitespace checks passed. Source, benchmark and test paths are unchanged; no code tests, typecheck, build or browser checks were run for this documentation-only change.

Maps and solutions must come from runtime design within the original generation clock and budget. The host must independently validate and freeze the plan; normal mouse input and a real browser process close/reopen are required. Trusted plan binding and isolated-profile lifecycle adapters remain gaps. COS-16 / #17 stays preparation-only/open, awaiting COS-10/13/18 and original-run admission. No game generation, paid call, trial restart, ledger change or deadline extension was performed. COS-18 Phase B was still pending at this checkpoint.

The clean checkpoint was pushed as `5f7590b8096d70407352828b0752ac63fe333dbe`; HEAD, origin/main and `ls-remote` matched. Root synchronized [#17 case preparation](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-5934548679), keeping it open.

## COS-18 Phase B partial integration — 2026-10-02

Root handed off exact source `6111f6fa13b42acb4678fedd59a44847fd874d98` on `feat/cos-18-cli` with independent `PHASE_B_READY`. `cos18_reviewer` inspected the actual 20-file diff and related planner, registry, ownership and OwnedWork interfaces. The sole P2 finding was missing public resume delivery output; its two-file fix was independently re-reviewed, with no remaining P1/P2 findings. Author evidence includes 66 distinct offline checks, the affected session suite at 8/8 after the fix, typecheck and the latest build.

Merge `f79aa4d295950d1104c6776897f4032614688ea3` has first parent `5f7590b8096d70407352828b0752ac63fe333dbe` and second parent the exact approved source. It merged without conflicts; all 20 approved paths match byte for byte. The merger made no implementation edits or changes in the author's worktree.

Fresh integration checks on Windows / Node.js 22.22.2:

| Check | Result |
| --- | --- |
| `node --experimental-strip-types --test --test-concurrency=1 tests/cli/cli.test.ts tests/cli/control.test.ts tests/cli/session.test.ts tests/roles/interview.test.ts tests/roles/stage-requirements.test.ts tests/runtime/entrypoint.test.ts tests/runtime/entrypoint-host.test.ts tests/runtime/entrypoint-media.test.ts` | 46/46 passed; zero failures, cancellations or skips |
| `npm run typecheck`, then `npm run build` | Both passed sequentially after tests |
| Approved paths, strict UTF-8/LF, Chinese text and whitespace | Verified |

Logs are `.cosmos/integration/batch07-cos18-b.tap`, `batch07-cos18-b-typecheck.log` and `batch07-cos18-b-build.log`. Root first confirmed the concurrent COS-10 heavy checks had finished; all integration checks then ran serially, and the shared slot was released. Unchanged intake/budget, full scheduler, E2E browser and old media suites were reused.

The approved production-host smoke is reused, not rerun. It used compiled production host, actual controlled tsc/Vite processes, normal Edge clicks, reports and registry promotion with zero model/API requests (reported duration 19.59 seconds). The merger read the saved `smoke-report.json` under `E:/CodexData/.codex/worktrees/cos-04-media/Cosmos/.cosmos/cos18-host-smoke/3e6b6f21-2d93-4509-915b-03c4fbe31451`. It explicitly records `generatedByCosmos: false` and a generic template with test-only media observations. Root inspected the clicked screenshot. This proves host integration, not runtime generation or new media acceptance. The first failed smoke `2d55d21b-09d1-4656-bbd8-0b2f86f34e45` remains preserved: copying had excluded dependency `dist` directories; the approved fix excludes only the template's top-level `dist`.

Phase B connects public `new/status/stop/resume`, real stdin confirmation of the exact revision, same-ledger activation, independent Cosmos/design/art/coding stages, capture/build, normal-input and media observations, screenshots and independent review. It retains one durable review protocol correction, repair by failed task ID with passed upstream work/history preserved, the 80% warning, fixed fees/unknown charges/original times/stop state, source isolation and restricted child environments.

COS-18 / #19 remains open and only this phase is approved. Legal downstream successors after an upstream repair are not yet wired; a user-authorized time/budget continuation entry after hard stop is missing (R15); the full classic adapter remains COS-14 work. The generic host supports 1–16 characters and 0–16 PCM clips per batch. The shared validation estimate stays 892,282 micro-CNY with zero reserved/unknown charges. G3/G4, all prior failed or expired trials and remaining live gates are unchanged. The new COS-10 experiment is not included or started by this integration; no paid, live-ledger or reference operation was performed.

The COS-18 Phase B checkpoint was pushed as `f09dcb0563a539cd031b4e6cf5ddaf285eac00fb`, with clean main and matching HEAD, origin/main and remote SHA.

## Reviewed experiment preparation and text-observation fix — 2026-10-02

Root handed off COS-10 exact source `ecfc150ec2ffe56e6f9b84dd7adfebb937738d72` on `feat/cos-10-reviewed-experiment` as `READY_FOR_REVIEWED_EXPERIMENT_PREP / PREP_ONLY`. Independent `cos10_reviewer` inspected the actual diff with no P1/P2 findings; final documentation correctly records headless Edge contact-sheet rendering in the two driver fixtures. Merge `75cf4050191200f6bc0bcbf4e671343f53e88405` has first parent `f09dcb0563a539cd031b4e6cf5ddaf285eac00fb` and second parent that exact source. All six approved paths match byte for byte; no conflicts or implementation edits occurred.

The new fixed declaration preserves the original controller, driver, host, frozen eight gameplay checks and additional host checks. `--experiment` requires the approved full main SHA and a real coordinator decision source. The new origin includes the baseline ledger, retained request/allocation history and old failed/expired references; it does not fabricate a human decision. Incremental actual plus reserved charges are limited to CNY 5, cumulative validation to CNY 30, on the original CNY 150 ledger and `2026-10-01T18:16:16.857Z` deadline. Its additional limits are 45 minutes, 40 requests and one semantic repair. Planning retains its COS-10 allocation; the CNY 19 role-allocation ceiling uses previously unallocated funds without removing old allocations, and is not new spending. Any partial root or write-once claim consumes the opportunity; there is no recovery entry. Old default, continuation, trial and startup-recovery refusal behavior remains intact.

Before release, root handed off independent COS-08 final READY `cca4f10f50351b181d69d4915ddac2333abc62e9` on `fix/acceptance-visible-text`, with no P1/P2 findings. Root had reproduced that a hidden DOM victory marker could satisfy a text observation. The approved one-line change filters the text locator by Playwright visibility before `innerText`, under the same timeout; the runner's remaining-time limit and debug/visible observation paths remain unchanged. Merge `1704d37b349d7855a29aee393ffc5fda715ae744` has first parent `75cf4050191200f6bc0bcbf4e671343f53e88405` and second parent the approved fix. Both source paths match exactly. The author reproduced the failure, then passed 4/4 real Edge checks covering hidden timeout, visible Chinese text and normal-click reveal; independent review checked the actual diff, logs and type support. That evidence is reused because no other integrated change modifies the observer or runner. This is standard visibility enforcement; full visual acceptance remains a separate requirement. COS-08 / #9 remains the previously completed task with a follow-up fix.

Fresh integration checks:

| Check | Result |
| --- | --- |
| `node --experimental-strip-types --test --test-concurrency=1 --test-name-pattern='^(experiment guard\|fixed experiment admission\|new claim\|a partial experiment root\|the fixed CLI entry)' tests/e2e/experiment.test.ts` | 5/5 passed; no failures, cancellations or skips; no browser launched |
| Strict `tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --allowImportingTsExtensions` over all `probes/e2e/*.ts`, `tests/e2e/experiment.test.ts` and `tests/acceptance/visible-text.test.ts` | Passed |
| `npm run typecheck`, after the strict check | Passed |
| Both approved source comparisons, UTF-8/LF, Chinese text and whitespace | Verified |

Logs are `.cosmos/integration/batch07-experiment-admission.tap`, `batch07-experiment-visible-strict-ts.log` and `batch07-experiment-visible-typecheck.log`. Root released the shared heavy-check slot before these serial checks. The author's 37/37 experiment/driver/trial/continuation/startup/preparation checks and the visibility fix's Edge 4/4 evidence are reused, as is the prior visible-template host smoke. This merger checkpoint did not launch Edge; the reused driver evidence did use headless Edge for contact sheets. No old full suite, browser acceptance or build was repeated.

The experiment is prepared and has not executed. The shared estimate remains 892,282 micro-CNY with zero reserved/unknown charges; old failures, deadlines and consumed attempts are unchanged. No generated game, G3/G4, COS-11/13 live validation or COS-18 overall acceptance is declared passed. After pushing this clean checkpoint, the merger freezes main until root releases it. Root separately owns the exact-version operator decision and at most one bounded real validation; this integration did not access keys, live ledgers, old trial artifacts or the reference game.
