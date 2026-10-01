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

Root handed off exact source `b8790a8f4ee71303c600db717b1dbd6210630cdf` on `feat/cos-01-resource-evidence`, independently approved by `cos01_reviewer` as `READY` without P1/P2 findings. Its actual two-file diff only updates reference inspection/sources and adds the resource research note. The author passed 16/16 reference tests and the validation CLI; the reviewer reused those tests and checked strict UTF-8/LF, JSON, the actual diff and primary format-source implementation. Integration is pending.

Resource entry counts are not unit counts, the configured locale does not establish the visible language, and UTF-16 entries were not decoded. Both rounds of UI capture failed without gameplay evidence. The version identity, catalog, `frozen: false`, `runtimeObserved: false` and `uiLanguage: null` remain unchanged. COS-01 / #2 stays open and the baseline stays provisional.

The batch does not change paid runtime status: shared cost is 892,282 micro-CNY with zero reserved/unknown charges; both failed pilot attempts and the expired fixed trial remain final under their original limits. COS-10 / #11, COS-11 / #12 and COS-13 / #14 remain open awaiting live evidence; COS-12 / #13 remains closed and G3 stays closed. The reference baseline remains provisional with 230 entries and 221 unknown entries.
