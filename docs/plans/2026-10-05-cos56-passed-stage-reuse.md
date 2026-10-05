# COS56 Passed Stage Reuse Implementation Plan

**Goal:** Verify and import the unchanged, independently approved design/art stages from a closed source validation case for a new coding-only case.

**Architecture:** A source-owned historical binding pins the original Root, case/window/input/source identities, task contracts, full capture closure and raw receipt hashes. Its read-only verifier opens journals only at the original Root, checks all signatures and genuine independent approval, and copies unchanged capture bytes into the new Root with an import receipt. The current scope independently hashes the operator-covered manifest; current coding/repair authority remains in the ordinary controller.

**Tech stack:** TypeScript, Node test runner, existing TaskJournal, artifact registry, transfer oracle and production host.

## 1. Historical proof and import

- [x] Add synthetic fixture that produces real design/art host evidence and independent reviews using the current source, then closes its old case.
- [x] Verify RED for missing historical API; implement strict manifest/receipt/capture closure validation and immutable import.
- [x] Pin original requirement/profile and map audit chain; do not query old grants or mutable author workspace.
- [x] Check altered manifest bytes, task/case/window/root/source/input, raw verdict/evidence/audit/capture data before import effects.

Files: `src/runtime/historical-passed-stages.ts`, `tests/transfer/passed-stage-reuse.fixture.ts`, `tests/transfer/passed-stage-reuse.test.ts`.

## 2. Current scope and DAG

- [x] Hash actual manifest bytes at the existing current scope boundary; require its SHA-256 in the exact operator source reference version.
- [x] Verify inherited stages before current task/journal writes and seed only their exact old PASS IDs into dependency validation.
- [x] Keep old tasks outside register/save/dispatch/charge; preserve default complete-DAG checks.
- [x] Exercise cold resume, stopped/unknown scope refusal and unchanged old ledger/journal/capture bytes.

Files: `src/runtime/validation-scope.ts`, `src/runtime/orchestrator.ts` and focused synthetic tests.

## 3. Production transfer host

- [x] Add private source opt-in factory and async `bindPreparedTasks` before current author/repair/recovery.
- [x] Reuse one original template, original requirement and full old design/art capture closure. Preserve `_cosmos/execution-requirement.json`; capture current requirement under `_cosmos/current-execution-requirement.json`.
- [x] Create current v1/v2 plans from unchanged map before author context/signature, with current task/candidate/origin identities. Keep old plans unchanged and outside candidate staging to avoid duplicate destinations.
- [x] Make inherited stage lookup cover compilation guard, topology, fixed artifact selection and finish. Require two verified old approvals plus current coding BUILD/persistent eight/media/independent approval before exact promotion.
- [x] Preserve live design feedback flow and ordinary three-role default.

Files: `src/runtime/entrypoint-host.ts`, `src/runtime/entrypoint-preparation.ts`, `src/runtime/adapters/transfer/runtime-host.ts` and the focused tests above.

## 4. Verification and handoff

- [x] Run focused source tests, meaningful affected regressions, `npm run typecheck` and `npm run build`; run one compiled production representative.
- [x] Re-open changed UTF-8 files, check Chinese text and LF, run `git diff --check`.
- [x] Commit on `codex/cos56-passed-stage-reuse`; send exact SHA/RED-GREEN evidence/gaps to independent reviewer and sole merger.

Commands: `node --experimental-strip-types --test tests/transfer/passed-stage-reuse.test.ts`; `npm run typecheck`; `npm run build`.

Scope is source/TEMP only. COS57 owns the fixed successor declaration, trusted actual manifest and native driver. No real case, ledger, credential, provider, game, GitHub mutation or public CLI option is used here.

## Verification record

- Source historical API RED: absent verifier/importer, 3 expected assertion failures.
- Actual manifest gate RED: temporarily omitted the gate and observed `Missing expected rejection`; restored it. Real manifest files live in the TEMP ledger, outside the old source Root.
- Source tests passed across focused runs: closed source verification/import, raw manifest/receipt/audit/capture tamper refusal, eleven resigned contract/identity/closure changes before effects, current scope hashing, coding-only dispatch and same-window cold recovery, reserved/unknown/stop refusal, exact one current CodeDefect repair and v2 promotion. Original role requests/evidence and closed grant prefixes remain unchanged.
- Repair/promotion plus missing-binding negative case: 2/2, 0 skipped, 173.894 seconds. The repair transport helper is explicitly synthetic and exercises the existing eight-segment/media/checkpoint checks; this is not a browser/game verdict.
- Compiled production representative: 1/1, 0 skipped, 90.631 seconds. Current file inventory contains unchanged old stages and four distinct plan roots. Real owned tsc failure, same-author edit, then tsc/Vite success used distinct TEMP projects with zero new model requests or repair claim. Tampered imported bytes and stopped authority were refused. Later factory missing-argument guard affects only the rejected-input branch; this passed execution evidence is reused.
- Affected default/recovery/artifact/scope/compiler representatives: 11/11, 0 skipped, 64.517 seconds. No unchanged full Edge or 80-call matrix was repeated.
- Fresh strict typecheck/build and diff/UTF-8/LF/Chinese checks are required before the implementation commit.
- Full old proof verification reads each fixed location once within a guard and re-reads it on the next guard; no proof cache spans guards. Synthetic initial coding plus cold recovery measured 60.697 seconds; inherited repair/promotion measured 170.813 seconds.

Additional test files: `tests/transfer/passed-stage-reuse.integration.ts`, `tests/transfer/passed-stage-reuse-reports.fixture.ts`. Test-only `buildPassedStageManifest` is exported so COS57 can reuse the genuine TEMP receipt builder without relabeling origins or repeating verifier tests.

## Independent review correction

- P2: inherited current coding checks omitted the ordinary branch's exact source kind/provenance check. Registry lookup and candidate byte signatures do not cover `game-source/capture.json` metadata.
- Added the same current `kind: code` and exact procedural generator/current attempt session/current requirement source locations check. Ordinary, historical and authority APIs remain unchanged.
- Focused RED reproduced accepted `metadata.kind: data` with `Missing expected rejection` (1 failed, 50.029 seconds). GREEN: 1/1, 0 skipped, 72.569 seconds, covering wrong kind, foreign generator and foreign session, successful restored bindings, unchanged snapshot and unchanged SDK calls.
- Removed the reports fixture's extra final blank line; the complete base-to-working diff passes whitespace checks. Prior repair/promotion, compiled and default regression evidence is reused.
