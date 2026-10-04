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
