# Batch 02 review and integration record

Date: 2026-10-01. Merger: `batch02_merger`. Status: approved COS-03, COS-06 and COS-08 commits are integrated on local `main`. COS-03/06 integration passed; combined COS-08 integration has one deadline failure requiring author repair and independent review. The live pi probe and remote synchronization remain pending. COS-04 media validation is in progress. No paid calls were made during integration.

## Approved commits and merges

| Task | Implementer | Independent reviewer | Reviewed commit | Merge commit | Result |
| --- | --- | --- | --- | --- | --- |
| COS-06 / #7 | `cos06_implementer` | `cos06_reviewer` | `1bed42304a1050b111d8231529e8e57e64e19c3e` | `f724d5ff91ac590f62d2939bd034ba9fca3bfb00` | Spec and quality review approved; local integration passed; push pending |
| COS-03 / #4 | `cos03_implementer` | `cos03_reviewer` | `79969d3c1e849e79b8c3e666327163a1d80d0f85` | `7a05b11395628f910bee8ac10dea26a154b463ff` | Code approved after cancellation/timeout repair; local SDK/runtime checks passed; live probe pending |
| COS-08 / #9 | `cos08_implementer` | `cos08_reviewer` | `2631e8c397d08f3426d5eb8e8ae8f75ebff83bb8` | `0b0d45528a162c3177bdb397b70c475b6e5ff528` | Code approved after renderer-hang repair; combined suite exposed one deadline failure |

The COS-06 merge used `--no-ff`, retains the exact reviewed commit as its second parent, and had no conflicts. Its eight runtime, budget, test and development-document files match the reviewed commit. The merger made no source or configuration changes. Coordinator progress and reference-observation updates were preserved separately as `7777bd537ad1e175d9a018c9c6042fa9b210a1a4`.

The independent reviewer inspected all eight changed files and their contract dependencies. Author evidence covered 22 runtime/budget tests, build and typecheck. Additional reviewer checks confirmed that unknown charges block admission of previously reserved requests; an in-flight charge of 110 against a 100 cap persists and stays blocked after reopening; and the overrun exception still rejects changed identities, invalid allocations and missing evidence. No blockers remain for COS-06. Abnormal-process lock takeover and deeper crash supervision remain explicitly scoped to COS-12.

COS-03 and COS-08 also used `--no-ff`, preserve their exact reviewed heads as second parents and merged without conflicts. Their owned paths match the approved commits. The coordinator's addition of the independent COS-04 media task was preserved as `14adf4b1cc81bc2e2b5357d71089c69661ec7f1c`. No merger source/configuration patch was needed.

COS-03 review first found immediate cancellation could still dispatch and the timeout did not cover the full SSE response. The original implementer fixed both in `79969d3`; the independent reviewer checked the two-file delta and passed three focused scenarios: immediate cancel performs no admission/HTTP/settlement, cancellation during admission settles as `not_sent`, and an SSE stall becomes one `unknown` result with no writes or follow-up request. The author's full provider/probe suite contained 17 passing tests.

COS-08 review first found a stalled renderer could prevent return and cleanup. The original implementer's `2631e8c` added total lifecycle deadlines, bounded protocol calls and owned-process cleanup. The reviewer inspected the delta and two hung-page reports, which returned around 3 seconds within 3500 ms, preserved failed reports/logs, skipped later steps and confirmed forced process exit. The reviewer reused the author's 12 focused input/hang tests and passing build/typecheck. The later combined-tree failure below remains open despite that focused evidence.

## Integration evidence

Environment: Windows, Node.js `22.22.2`, npm `10.9.7`.

| Command / check | Result | Scope |
| --- | --- | --- |
| `npm test` | 85/85 passed; no failures, cancellations or skips | Seven CLI, forty contract, sixteen reference and twenty-two runtime/budget tests on combined `main` |
| `npm run build` | Passed, exit 0 | Combined CLI, contracts and runtime source |
| `npm run typecheck` | Passed, exit 0 | Combined root TypeScript source |
| `git diff` against the reviewed commit for the eight COS-06 paths | Empty | Integration preserves the approved implementation |
| `npm ci --no-audit --no-fund` after COS-03 | Passed; 211 packages installed | Approved pi SDK lockfile |
| `npm test` after COS-03 | 102/102 passed | Existing 85 tests plus 17 provider/probe tests |
| `npm run build` and `npm run typecheck` after COS-03 | Passed, exit 0 | SDK and runtime combined tree |
| `npm test` after COS-08 | 119/120 passed; one failure | New browser/plan/equivalence tests plus the existing combined suite |
| `npm run build` and `npm run typecheck` after COS-08 | Passed, exit 0 | All three approved implementations together |
| `git diff` against approved COS-03 and COS-08 owned paths | Empty | Exact reviewed code and dependency lockfile preserved |

COS-06 adds no dependencies; its first-wave installation reused batch 01 evidence. COS-03's changed lockfile was installed once. COS-08 adds no further dependencies. The known SDK transitive dependency warning remains documented in `docs/development/pi.md`; integration did not broaden into dependency upgrades. Generic template source and its dependencies are unchanged, so the accepted COS-05 browser and COS-08 fresh-project build evidence are reused. New COS-08 normal input and defect scenarios ran on combined main. This batch does not demonstrate a Cosmos-generated target game.

### Combined browser deadline failure

The final native suite ran while build and typecheck also ran. `tests/acceptance/hang.test.ts:31` failed its report-duration assertion for the click case: `4453 ms` exceeded `3500 ms + 500 ms` tolerance. The retained report is `.cosmos/acceptance/hang-fixture/fixture/hang-v1/hang-1790835175262/frozen-click/report.json`, from `2026-10-01T06:12:55.289Z` to `06:12:59.742Z`. Startup passed, input failed after an 820 ms protocol timeout, later steps were skipped, and cleanup reported `forced: true`, `processExited: true`, PID `29168`. The observation case report at `hang-1790835181792/frozen-observation/report.json` lasted 3709 ms and passed the test's 4000 ms bound. All other 119 tests passed; no source fix or repeat run was made by the merger. The original implementer must determine the cause, repair the affected behavior if required, and obtain independent review before completion.

## Pending tasks and synchronization

- COS-03 / #4: code integration is approved and local SDK/runtime checks passed. The coordinator can now run the bounded live pi probe against the shared persisted validation ledger. Issue #4 remains open until that probe passes.
- COS-08 / #9: the approved repair is integrated, but the combined deadline failure above blocks completion. Issue #9 remains open pending author repair, independent review and affected integration checks.
- COS-04 / #5: the independent media implementer is validating generic vector/key-pose assets and synthesized audio; no unapproved media code has been merged.
- COS-01 / #2 remains provisional. Its current UI-capture limitation is preserved in `PROGRESS.md`; the reference has not been frozen. Parent #1 remains open.
- Ordinary `git push origin main` failed with `Recv failure: Connection was reset`. One bounded HTTP/1.1 retry failed to connect to `github.com:443` after 21 seconds. A GitHub API read confirmed remote main is still `5a7217f7f4de032181aff0ba006b20c0ec6fd3fe`. Local COS-06 integration is retained; issue #7 remains open until the merge is pushed and remote state is confirmed. No further retry was made in this partial wave.
- The subsequent SDK/browser integration wave did not retry the push while the combined check failure remained open. No issue was closed, and no paid probe was run by the merger.
