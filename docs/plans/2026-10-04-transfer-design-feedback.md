# COS41 Transfer design feedback implementation plan

> **For agentic workers:** Execute the approved source task with its dedicated implementer and a fresh independent reviewer. Only batch08_merger integrates reviewed commits.

**Goal:** Give the original runtime design author one bounded semantic rewrite through a trusted oracle tool, then capture only the exact successful bytes.

**Architecture:** The optional preparation.designHostTools seam uses the existing role factory. A transfer-only helper publishes write-once started/raw/result records for at most two distinct submissions. The capture/recovery gates verify complete records, fixed input/source/attempt identities and the sealed map; freeze reads the host-owned bytes.

**Tech stack:** Existing TypeScript, native pi tools, TypeBox, TaskJournal signatures, ArtifactRegistry and RunController. Base ea0971b2c1605000e86d7f7fd552aac715880339, issue #42. No new executor, ledger, case schema, paid request or actual entry.

## Changes and checks

- [x] Add tests/transfer/design-feedback.test.ts and a small design-action seam in tests/transfer/runtime-host.fixture.ts. Run RED before production edits. Cover first pass, invalid/valid, exhausted rewrite, skipped tool, changed sealed map, exact-byte reuse, incomplete recovery, tool scope and existing billing.
- [x] Add optional designHostTools names/create in src/runtime/entrypoint-preparation.ts and connect it in src/runtime/entrypoint-host.ts before planning. Mutable audit tools are offered only to the design author.
- [x] Add probes/transfer/design-validation.ts. Publish durable starts before results; keep each submitted byte sequence intact. First invalid opens one rewrite process, second invalid exhausts it permanently, first pass seals immediately. Same bytes read the existing complete result. Unknown/incomplete records block further dispatch.
- [x] Connect probes/transfer/runtime-host.ts. Require the successful original receipt and current map before capture, freeze the host raw bytes, match the frozen digest, and verify receipts on recovery/current-input reuse. Ordinary roles and pilot retain their existing behavior. Generic design prose may be accurately updated.
- [x] Run GREEN with `node --experimental-strip-types --test tests/transfer/design-feedback.test.ts`. Run only affected default/consumer representatives and strict source/test compilation; reuse prior COS40 browser/observer evidence.
- [x] Append the bounded source behavior to probes/transfer/README.md. Re-open all changed files with fatal UTF-8 decoding, check BOM/LF and original Chinese text, then `git diff --check`.
- [ ] Commit the implementation and report exact SHA, commands/results and remaining actual-entry gap to the fresh reviewer. Fix actionable findings on this branch and obtain affected-diff review before batch08_merger integration.

All test roots are synthetic temporary directories. Real .cosmos data, keys, old cases, reference game and preview21628 are outside this task.

## Author evidence

Node v22.22.2. The initial eight-scenario RED command failed 6/8 in 15409.5115 ms: the skipped validator wrongly passed the old capture, and the tool was absent. Two negative tests initially hid their tool assertion in the existing orchestrator catch; propagating the synthetic action error made both explicitly RED (2/2 failures, 4178.2128 ms) before production edits.

- `node --experimental-strip-types --test tests/transfer/design-feedback.test.ts`: the completed 15-scenario run passed 13 and failed two test assertions, 47042.8113 ms. Production correctly rejected unknown charges with its existing reconciliation error, and deadline cancellation used the original structured signal reason. Only those assertions were corrected; `--test-name-pattern='unknown authority|deadline authority'` then passed 2/2, 0 skipped, 5419.4459 ms. The other 13 passing results are reused. All 15 scenarios now have passing evidence, with no production change between these runs.
- `node --experimental-strip-types --test --test-name-pattern='runtime design prepares|invalid semantic design|missing runtime map' tests/transfer/runtime-host.test.ts`: 3/3 passed, 0 skipped, 20302.3608 ms. The four design outputs/review/journal and original default failed-preparation result remain; invalid/missing design starts no downstream role or coding repair.
- `node --experimental-strip-types --test --test-name-pattern='trusted consumer freezes actual task IDs' tests/transfer/runtime-acceptance.test.ts`: 1/1 passed, 0 skipped, 34488.6913 ms. The existing full synthetic consumer/review/promotion chain accepts the same frozen design provenance. No real browser or provider call.
- `node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck --allowImportingTsExtensions --verbatimModuleSyntax --types node src/runtime/entrypoint-preparation.ts src/runtime/entrypoint-host.ts probes/transfer/design-validation.ts probes/transfer/runtime-host.ts tests/transfer/design-feedback.test.ts tests/transfer/runtime-host.fixture.ts`: exit 0, 7.1863479 seconds, after the final test assertion changes.

The tests use the actual scoped write/tool wrappers and original request-level budget callbacks with synthetic settled/unknown requests. Request-cap exhaustion retains the original 80-request limit; fees, reservations and author purpose stay on the design grant. Audit tampering and missing-result recovery create no additional session or attempt. Actual paid entry, game generation, browser migration and user experience remain unverified. Independent review and batch08_merger integration are still required.

## Independent review correction on 45a4db0

The reviewer found two P2 issues: audit reads reran the oracle before identical-byte reuse, and started/result records had no validation time. A focused RED on the unchanged source reproduced three extra oracle calls for three concurrent identical submissions (expected zero), plus an absent startedAt field. The corrected synthetic setup then failed both tests in 8419.0327 ms.

The helper now verifies complete result shape, its existing SHA bindings and a result digest, then reuses that host result. The live instance remembers the original published receipt digests and rejects even a rehashed cached result. Capture provenance includes the complete result-byte digest, so a reopened host cannot accept changed result bytes through the existing provenance comparison. No semantic oracle runs while reading old audits. This uses the existing SHA function and protected receipts; it adds no generic hash framework or new ledger/executor.

Started and completed times come from the host wall clock. The record binds the original case/window/source, input hash, attempt start and deadline. Reuse/recovery checks canonical ISO strings, original window/attempt bounds, start-to-completion order, completion before the original deadline, absence of future completion, and first completion before a rewrite starts. File mtimes are not evidence.

- `node --experimental-strip-types --experimental-test-module-mocks --test tests/transfer/design-feedback-review.test.ts`: 9/9 passed, 0 skipped, 41185.7457 ms. Node's experimental module mock only counts calls and forwards the actual oracle; its standard ExperimentalWarning is expected. The cases cover concurrent reuse with zero extra calls, one oracle call for the distinct rewrite, canonical real times, rehashed cached tampering and six invalid timestamp/recovery cases.
- `node --experimental-strip-types --test --test-name-pattern='exhausted|started without result|changed-after-pass|unknown authority|changed raw audit|changed result audit|changed binding audit' tests/transfer/design-feedback.test.ts`: affected 7/7 passed, 0 skipped, 22854.0585 ms.
- After explicitly matching the original quote's source/input identity to the time authority, the `--test-name-pattern='real canonical'` increment passed 1/1, 0 skipped, 8169.3044 ms. Other passing checks are reused.
- `node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck --allowImportingTsExtensions --verbatimModuleSyntax --types node probes/transfer/design-validation.ts probes/transfer/runtime-host.ts tests/transfer/design-feedback-review.test.ts tests/transfer/design-feedback.test.ts`: exit 0, 7.3164474 seconds on the final helper.

The prior default preparation, complete consumer, permission, manual-stop and incremental-edit positives remain applicable. They were not repeated. This correction is synthetic-only and zero paid; the same independent reviewer must approve the affected diff before sole-merger integration.

## Cold history correction on 2a59304

The same reviewer found a remaining P2: a cold host could recover an invalid-to-valid capture after only the first failed diagnosis and its self-digest were changed. The final capture anchored only the second complete result. A narrow RED on unchanged 2a59304 first recovered the exact baseline, then forged the first diagnosis and reproduced the unexpected four-artifact recovery (expected null), 8793.5398 ms.

The second started record now names the first complete result-byte digest. records() requires that predecessor to match the actual first receipt; the second result already binds the complete started record. The existing final capture provenance therefore anchors both rounds. Changing the first result breaks the predecessor; rebuilding both rounds changes the final result digest and fails the existing capture-provenance comparison. No oracle, new hashing framework, role permission, default host, session or ledger change is involved. Original failed bytes and diagnostics remain immutable in normal execution.

- `node --experimental-strip-types --experimental-test-module-mocks --test --test-name-pattern='cold history correction|same-byte concurrent|real canonical' tests/transfer/design-feedback-review.test.ts`: 4/4 passed, 0 skipped, 24170.2654 ms. Both cold-history variants first prove ordinary cold recovery, then reject either first-only corruption or a rebuilt second-round chain; additional role calls remain zero. Same-byte oracle calls remain zero and canonical source-owned times still pass.
- `node --experimental-strip-types --test --test-name-pattern='exhausted|started without result|unknown authority' tests/transfer/design-feedback.test.ts`: affected 3/3 passed, 0 skipped, 8383.6234 ms.
- The stopped-author cached-pass control passed 1/1, 0 skipped, 4507.9873 ms with `--test-name-pattern='cold history correction a stopped'` and the module-counter flag. A cached pass never bypasses original stop authority and adds no oracle call.
- The review test file now enables its counter only with the explicit Node experimental mock flag, so ordinary test discovery still loads correctly. The plain strip-types command with `--test-name-pattern='cold history correction.*first-only'` passed 1/1, 0 skipped, 8243.058 ms. Only the dedicated counter test requires that flag.
- The same narrow strict source/test command recorded above exited 0 on the final helper/tests in 7.1717311 seconds. Prior 9/7, full consumer and browser evidence is reused.

Only helper, review test and this plan changed. The same reviewer must inspect the incremental chain diff before sole-merger integration; this remains synthetic-only and zero paid.
