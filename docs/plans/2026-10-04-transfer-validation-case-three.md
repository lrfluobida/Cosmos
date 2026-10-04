# COS47 third transfer validation case implementation plan

> The dedicated COS47 implementer follows the approved design and issue #48. An independent reviewer checks the actual commit; the batch merger alone integrates main.

**Goal:** Prepare a fixed third native migration case after the design output self-check source is integrated, within the remaining original COS16 allocation.

**Architecture:** Extend the private source-owned entry profile from two cases to three, reusing the original fixed input, native bootstrap, planner/DAG, consumer, design tools, repair and finish. The third profile authenticates ten stopped histories and eight original closure receipts, including each receipt's own input hash. Case1 and case2 retain their original boundaries and bytes.

**Tech stack:** TypeScript, Node test runner, temporary synthetic repositories and the existing controller/owned worker.

Base: `2227b348f0b54ab12085f08d051acdd930462a42`.

## Files

- Create `probes/transfer/validation-case-three-declaration.ts` and `validation-case-three-run.ts`.
- Modify only private fixed factories in `validation-input.ts`, `validation-driver.ts` and `validation-run.ts`.
- Create `tests/transfer/validation-case-three.test.ts` and a temporary history fixture extending the existing case2 fixture through controller requests and closure APIs.
- Append `probes/transfer/README.md`; preserve the complete original case1/case2 declarations, requirements and template bytes.

## Steps

- [x] RED then GREEN: fixed vector 369692/1054678/2800000/2800000/2800000 and original input hash; bounded parser has no override flags.
- [x] RED then GREEN: ten consumed histories, current case2, two original delegations and eight byte-authenticated audit sources; old entries refuse this baseline.
- [x] RED then GREEN: original group net/committed 175630 and exact role fees 30308/145322/0/0/0, rejecting equal-total wrong-role history before preparation.
- [x] RED then GREEN: Source20..46 unique exact markers and ancestors, pending Source46 rejects with zero side effects.
- [x] RED then GREEN: atomic append preserves all old records, first group authorization, parent reference and shared capacity; owned bootstrap uses new planning ID and scope.
- [x] Run affected old entry representatives and strict import closure. Re-open UTF-8/LF/Chinese, inspect exact diff and commit.

## Execution boundary

Only zero-fee source and synthetic fixtures are authorized here. Root owns the actual ledger, source freeze, funding/model checks, operator decision and later paid case3. Historical case1/case2 failures remain preserved. The existing generic output self-check and bounded transfer-map tool stay in the original design session/grant/calls/window; no new executor, feedback permission or budget is added. Public requirements and human experience remain pending.

## Evidence

- RED: `node --experimental-strip-types --test tests/transfer/validation-case-three.test.ts` failed all 5 tests on the missing fixed case3 entry, 288.1379 ms, exit 1.
- The first GREEN attempt passed the fixed declaration/parser/input test (53.7164 ms) but exposed a synthetic fixture error: design request purpose was `design`, which the unchanged controller correctly rejects. Strict compilation also rejected that purpose. The fixture now registers its declared design task and uses the original `author` purpose; no production contract was changed.
- GREEN history/authority: `node --experimental-strip-types --test --test-name-pattern 'case3 preflight authenticates ten' tests/transfer/validation-case-three.test.ts` passed 1/1, 0 failed/skip, 25.2506328 s, exit 0.
- GREEN remaining checks: `node --experimental-strip-types --test --test-name-pattern 'pending self-check|equal-total|atomic case3' tests/transfer/validation-case-three.test.ts` passed 3/3, 0 failed/skip, 78.0578293 s, exit 0. Together all 5 new scenarios pass. Temporary fixture fee records do not represent provider calls or generated-game evidence.
- Final fixed declaration/parser/input check: `node --experimental-strip-types --test --test-name-pattern 'case3 fixes' tests/transfer/validation-case-three.test.ts` passed 1/1, 0 failed/skip, 315.815 ms, exit 0.
- Affected case1 representative: `node --experimental-strip-types --test --test-name-pattern 'new transfer preflight authenticates eight' tests/transfer/validation-run.test.ts` passed 1/1, 0 failed/skip, 4.637577 s, exit 0.
- Affected case2 input/parser and history representative: `node --experimental-strip-types --test --test-name-pattern 'case2 fixes|case2 preflight authenticates nine' tests/transfer/validation-case-two.test.ts` passed 2/2, 0 failed/skip, 13.930379 s, exit 0. Full prior consumer/DAG/feedback/group matrices, 80-call boundaries and real Edge evidence are reused.
- Strict import closure: `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions probes/transfer/validation-case-three-run.ts tests/transfer/validation-case-three.test.ts tests/transfer/validation-input.test.ts tests/transfer/validation-run.test.ts tests/transfer/validation-driver.test.ts tests/transfer/validation-case-two.test.ts` passed, exit 0, 7.7488916 s.
- All task files are UTF-8 without BOM or CRLF, Chinese renders correctly, previous README bytes remain an exact prefix, and original case1/case2 declarations, requirements and template files remain byte-identical. `git diff --check` passed.
- No actual `.cosmos`, case, ledger, session, transcript, API credential, provider, browser, preview or reference game was accessed. Actual C3 and human acceptance remain unverified; source marker can be registered only after independent review and merger integration.
