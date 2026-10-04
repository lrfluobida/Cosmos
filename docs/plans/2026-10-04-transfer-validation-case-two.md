# COS45 second transfer validation case implementation plan

> The dedicated COS45 implementer follows the approved design and issue #46. An independent reviewer checks the actual commit; the batch merger alone integrates main.

**Goal:** Prepare a second fixed internal native migration case against the remaining original COS16 allocation.

**Architecture:** Private factories share the original fixed input, driver and execution pipeline between two source-owned declarations. The old case1 wrappers retain their ledger3/eight-case history boundary; case2 authenticates ledger4, nine stopped cases and seven closure receipts before the existing atomic grouped claim. No runtime budget, planner, consumer or design-feedback implementation changes.

**Tech stack:** TypeScript, Node test runner, temporary synthetic repositories and the existing controller/owned worker.

Base: `aa740b7d7b80d72c2bdad0d9bf6c93215c1e7c2b`.

## Files

- Modify `probes/transfer/validation-input.ts`, `validation-driver.ts`, `validation-run.ts` through private fixed-profile factories.
- Create `probes/transfer/validation-case-two-declaration.ts` and `validation-case-two-run.ts`.
- Create focused `tests/transfer/validation-case-two.test.ts` and a fixture that extends the existing synthetic history.
- Append `probes/transfer/README.md`; preserve its previous bytes and the complete original `validation-declaration.ts`, `requirements.json` and template files.

## Steps

- [x] RED then GREEN: fixed case2 vector 385898/1200000/2800000/2800000/2800000, unchanged input hash and bounded parser.
- [x] RED then GREEN: nine consumed histories and seven original authorizations, Source20..44 unique markers/ancestor checks, no preflight side effects and case1 refusal of this baseline.
- [x] RED then GREEN: atomic append of case2 preserves old cases, fees, audits, parent allocation reference and group capacity.
- [x] RED then GREEN: case2 bootstrap and initial scope use its actual planning grant and case prefix, with original shared DAG/repair/finish pipeline.
- [x] Run focused pure tests, one affected case1 representative and strict import closure. Re-open UTF-8/LF/Chinese, inspect exact diff and commit.

## Execution boundary

Only zero-fee implementation and synthetic fixtures are authorized here. Root owns the actual ledger, source freeze, funding/model checks, operator decision and later paid case2. Case1 failure remains preserved; public human requirement and experience acceptance remain pending.

## Evidence

- RED: `node --experimental-strip-types --test tests/transfer/validation-case-two.test.ts` failed all 4 tests on the expected missing fixed case2 entry, 282.726 ms, exit 1.
- GREEN: same command, 4/4 passed, 0 failed/skip, 48.5767787 s, exit 0. The only charged request is synthetic temporary fixture bookkeeping; no provider is called.
- The final parser diagnostic names the correct fixed entry. Its affected input/parser test passed 1/1, 338.5788 ms, exit 0.
- Affected case1 representative: `node --experimental-strip-types --test --test-name-pattern 'new transfer preflight authenticates eight' tests/transfer/validation-run.test.ts` passed 1/1, 0 failed/skip, 4.5528997 s, exit 0. Source40/41/42/43/44 full matrices, 80-request boundaries and real Edge evidence are reused.
- Strict import closure: `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions probes/transfer/validation-case-two-run.ts tests/transfer/validation-case-two.test.ts tests/transfer/validation-input.test.ts tests/transfer/validation-run.test.ts tests/transfer/validation-driver.test.ts` passed with exit 0 in 7.4993924 s.
- All nine task files were strictly re-opened as UTF-8 without BOM/CRLF/replacement characters; existing README bytes remain an exact prefix. Original case1 declaration, requirements and template files remain byte-identical. `git diff --check` passed.
- No actual case, snapshot, authorization, session, API credential, provider, browser, preview or reference game was accessed. Native paid case2 and public human acceptance remain unverified.
