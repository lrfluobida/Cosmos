# Batch 04 review and integration record

Date: 2026-10-01. Sole merger: `batch04_merger`. Initial driver integration status: `driver-merged-awaiting-live`. The independently approved driver was integrated, verified and pushed before real generation started. That integration made no paid calls; its shared validation estimate was ¥0.735971. COS-10 / #11 and parent #1 remain open. The first live failure is recorded below.

## Approved commit and merge

| Task | Implementer | Independent reviewer | Reviewed commit | Merge commit | Result |
| --- | --- | --- | --- | --- | --- |
| COS-10 / #11 | `cos10_implementer` | `cos10_reviewer` | `e28df14a77e8e93944515b7b6e62bd59b25001de` | `29a9c69a78ae6270775668e4b585d68486f2248e` | READY_FOR_DRIVER_INTEGRATION; driver merged, live acceptance pending |

Coordinator changes in `PROGRESS.md` and the batch 04 plan were preserved separately in `fca57be0e327cc83fef714eb8021d4d4eee5a8f9`. The `--no-ff` merge was conflict-free, with that coordinator commit as first parent and the exact reviewed SHA as second parent. All sixteen implementation, test, dependency and development-document files match the approved head. The merger made no source or dependency changes.

Preparation commit `e89a323e85f91d52454fbff72db55bde3fd5fc9d` had preparation-only approval. Full driver commit `12c250d178c0f52bb51ea300b0682cfa05278d7d` received one P2 finding: the acceptance browser inherited the host environment, which could contain the model credential. Approved repair `e28df14a` adds explicit `AcceptanceOptions.env` passthrough to `chromium.launchServer`, supplies the existing filtered environment from the pilot driver, and tests the actual launch arguments plus absence of environment values in evidence files. The independent reviewer approved the exact repaired commit with no remaining P1/P2 findings.

## Driver scope

The host connects confirmed frozen requirements, Cosmos-proposed task planning, native design/art/coding roles, original declarative media rendering, immutable artifact captures, fixed-input independent review, normal-input browser acceptance and accepted-candidate promotion. Budget admission uses the existing shared ledger, a persisted pilot origin/deadline/request count and at most one explicit coding repair task. The host supplies the generic template and validation tools; game-specific output must be produced by the runtime roles during the measured run.

The only dependency change declares the already locked `typebox@1.3.27` as a direct dependency for fixed host tools. Its existing resolved version and integrity entry are unchanged. The minimal production acceptance-runner change allows the caller to pass a filtered browser environment.

These are platform implementation and offline integration results. No generated level, runtime media, successful gameplay report, listening judgment, standalone generated-game startup or actual generation cost/time is claimed here. The approved development document describes the driver handoff; this record supplies its later integration status.

## Integration evidence

Environment: Windows, Node.js `22.22.2`. The merger ran the native suite once on the combined tree, then build and typecheck sequentially after the test process exited.

| Command / check | Result | Scope |
| --- | --- | --- |
| `npm ls typebox --depth=0` | `typebox@1.3.27` present | Existing install matches the newly explicit dependency |
| `npm test` | 194/194 passed; no failures, cancellations or skips | Previous 177 tests plus 17 E2E tests, including the browser environment regression and existing real browser acceptance checks |
| `npm run build` | Passed, exit 0 | Root production TypeScript, including the acceptance runner change |
| `npm run typecheck` | Passed, exit 0 | Root production TypeScript |
| Dedicated strict probe TypeScript check | Reused author evidence accepted by the independent reviewer | Root `tsconfig.json` includes only `src/**/*.ts`; it does not cover `probes/e2e`. The reviewed probe sources remain byte-identical after integration |
| Diff against all approved owned paths | Empty | Exact reviewed source, tests, dependencies and development document retained |
| `git diff --cached --check` | Passed before merge commit | No introduced whitespace errors |

The native TAP log is retained locally at `.cosmos/integration/batch04-native.tap`. Browser hang checks produced the expected failed-acceptance reports while their test assertions passed, under `.cosmos/acceptance/hang-fixture/fixture/hang-v1/hang-1790842310838/frozen-click/report.json` and `hang-1790842315971/frozen-observation/report.json` under the same fixture root. No compiler process ran concurrently with the suite. Unchanged generic media and real pi probe evidence is reused; no duplicate media probe or paid model request ran during integration.

## Live run and remaining gates

The coordinator will inject an ephemeral credential and run the approved main checkout. Live admission must reread the original shared ¥150 ledger and enforce the initial cumulative ¥30 probe cap, the earlier of the original deadline and the 90-minute pilot deadline, forty model requests, and the frozen attempt/repair limits. The merger did not read model credentials, start the pilot or alter the shared ledger.

Before closing #11, retain the genuine generated source and media provenance, all eight frozen gameplay acceptance IDs and additional host checks, an independent review of the exact verification attempt, standalone build/startup evidence, complete costs and elapsed time, and all failures or human interventions. Any game correction must go back through the authorized runtime roles within the original limits. Stage-only design/media checks and driver tests cannot satisfy this completion gate.

COS-01 reference freezing, complete classic benchmark coverage, audio listening quality and final user experience acceptance remain open under their own tasks. COS-11 has read-only interface preparation: reuse the existing task machinery, create an explicit repair task, preserve failed history and the original budget, and determine policy from the real COS-10 result. COS-16 has a proposed single-level box-pushing case for a different mechanism; a configurable generic driver and persistence after browser restart still depend on COS-10/13. Neither follow-up was implemented or incurred fees in this batch.

## Remote synchronization

Command-scoped `git -c http.proxy=http://127.0.0.1:7897 push origin main` advanced remote main from `41f0c4e` to code merge `29a9c69a78ae6270775668e4b585d68486f2248e`. `ls-remote` and the GitHub API confirmed that exact SHA before publishing the [COS-10 integration status](https://github.com/lrfluobida/Cosmos/issues/11#issuecomment-5927502879) and [parent progress](https://github.com/lrfluobida/Cosmos/issues/1#issuecomment-5927503153). Both issues were then confirmed open. The local task mapping records `driver-merged-awaiting-live`, the reviewed SHA, the merge SHA and the status comment.

This documentation update follows the verified code push. No global/system Git configuration changed, no worktree was archived and no PR was created.

## First live result and bounded continuation

The coordinator ran `pilot-20261001081828147` on platform `2087c39e7364fe8f345d85a53e427499afdb696e`, from `2026-10-01T08:18:34.671Z` to `08:19:05.866Z` (31.195 seconds). Six settled requests (two planning, four design) cost an estimated ¥0.080447, bringing shared validation to ¥0.816418 with zero reserved or unknown fees. Design v1 was captured, but author handoff blockers included host/downstream work, so the gate stopped before host verification. Art, coding and gameplay acceptance did not run. See the [public failure report and decision](../research/2026-10-01-first-runtime-failure.md); private results and sessions remain outside Git.

One continuation is being implemented and independently reviewed; no continuation code is approved or integrated here. It must reuse the original plan/design, `09:48:34.671Z` deadline and six existing requests within the forty-request limit and cumulative actual-cost-plus-reserves cap of ¥30. The sole repair is a read-only design handoff clarification (design attempt 2/2, repair 1/1). Existing allocations remain; explicitly authorized successor allocations use shared unallocated funds and keep total allocation within ¥150. No additional coding repair is available. These are recorded continuation constraints, not evidence of a successful resumed run. #11 remains open.
