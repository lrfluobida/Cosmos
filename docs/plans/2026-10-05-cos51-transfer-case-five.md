# COS51 fifth transfer validation case implementation plan

> The dedicated COS51 implementer follows approved issue #52. The independent reviewer inspects the actual commit; the batch08 merger alone integrates main.

**Goal:** Prepare one fixed fifth native migration case with the reviewed capture layout contract, using the remaining original COS16 allocation.

**Architecture:** Extend the existing private fixed input, entry and driver profiles to case5. C5 explicitly uses `validation-policy-aliases/1`, as C4 does; C1–3 keep their original default. Before host preparation or claim, authenticate twelve stopped histories, ten original closure sources, original parent authority and exact role fees, plus Source49/50 markers and both reviewed/merge main ancestors.

**Tech stack:** TypeScript, Node test runner, temporary synthetic repositories, existing controller, native host and owned worker.

Base: `3f655630a230aa5fb9fc2711eb3a5399e8429d93`.

## Files

- Create `probes/transfer/validation-case-five-declaration.ts` and `validation-case-five-run.ts`.
- Modify private fixed factories in `probes/transfer/validation-input.ts`, `validation-driver.ts` and `validation-run.ts`.
- Create `tests/transfer/validation-case-five.test.ts` and `validation-case-five.fixture.ts`.
- Append `probes/transfer/README.md`. Preserve the old README byte prefix, C1–4 declarations, case2–4 wrapper bytes, requirements and template bytes, and the existing default wire behavior.

## Steps

- [x] RED then GREEN: fixed vector 340618/854278/2800000/2800000/2800000, total 9594896, original limits/input hash and strict fixed CLI.
- [x] RED then GREEN: twelve consumed/stopped histories, current C4, four delegations, 60 closed grants and ten own-input audits. Preflight preserves all temporary records' bytes/mtime and creates no owner, case root, marker or requests.
- [x] RED then GREEN: exact group net/committed 405104 and historical role fees 59382/345722/0/0/0. Equal-total wrong-role fees reject before host preparation.
- [x] RED then GREEN: Source20..50 exact markers and reviewed/merge ancestry, including `TRANSFER_CASE_FOUR_SOURCE_READY` and `CAPTURE_LAYOUT_CONTRACT_SOURCE_READY`; pending/wrong markers/status, either nonancestor SHA, dirty source or wrong HEAD reject without host preparation or claim.
- [x] RED then GREEN: atomic C5 append and owned bootstrap preserve historical rows, audits, original parent authorization, shared capacity and clock. Real driver → real planner → original host task validation binds current C5 identities/dependencies and records `identityBinding`; stop before the author DAG.
- [x] Reuse existing C4 real-driver and C3 original-default tests for compatibility. Check strict actual import closure, UTF-8/Chinese/LF, byte-preserved source scope and commit for independent review.

## Commands and expected results

- RED: `node --experimental-strip-types --test tests/transfer/validation-case-five.test.ts` must fail on the missing fixed C5 entry.
- GREEN: the same command must pass all five focused source tests, using only temporary synthetic records and fake model responses.
- Compatibility: `node --experimental-strip-types --test --test-name-pattern 'case4 real driver|original case3 driver' tests/transfer/validation-case-four.test.ts` must pass both actual wire tests.
- Types: `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions probes/transfer/validation-case-five-run.ts tests/transfer/validation-case-five.test.ts tests/transfer/validation-case-four.test.ts tests/transfer/validation-case-three.test.ts tests/transfer/validation-input.test.ts tests/transfer/validation-run.test.ts tests/transfer/validation-driver.test.ts` must exit 0.
- `git diff --check` must pass. Re-open every changed file using strict UTF-8 and inspect the appended Chinese README text.

## Execution boundary

Only free source work and temporary synthetic records are authorized. Do not access real Root ledger/case/session/transcript/credentials, paid providers, game files or the installed reference game. Source50's current NOT_READY metadata remains unchanged in production; READY approvals are explicit synthetic fixtures only. Existing consumer/Edge/80-call evidence is reused. Source readiness and real migration completion remain distinct. Actual C5 may run only after independent source approval, merger integration, truthful approval records and Root's fresh final-main admission. No additional budget, code repair, design semantic rewrite or public declaration/protocol/path selector is introduced.

## Evidence

- RED: `node --experimental-strip-types --test tests/transfer/validation-case-five.test.ts` failed all 5 tests on the expected missing fixed C5 entry, exit 1, 3663.5739 ms.
- Fixed declaration/parser/input GREEN: `node --experimental-strip-types --test --test-name-pattern 'case5 fixes' tests/transfer/validation-case-five.test.ts` passed 1/1, no failed/skip, exit 0, 3313.3916 ms.
- Initial full run passed the four declaration/history/source-gate/role-fee tests; the wire test correctly rejected the synthetic reply's missing `COSMOS-DESIGN`/`COSMOS-MEDIA` coverage. The author corrected only those test reply arrays after comparing the tracked C4 fixture. Production validators and limits were unchanged, and the four unaffected passing results were reused.
- Amended history/input GREEN: `node --experimental-strip-types --test --test-name-pattern 'case5 preflight authenticates twelve' tests/transfer/validation-case-five.test.ts` passed 1/1, no failed/skip, exit 0, 54742.5148 ms. Checks include all record bytes/mtime, own-input closure10, C4 not stopped, C4 operator source bytes changed, and a committed clean-main change to frozen requirements. All four old fixed entries reject the C5 baseline.
- Source-gate and role-fee GREEN from the full run: the source-gate test passed in 57139.062 ms and the equal-total wrong-role test passed in 44177.4884 ms. Both Source49/50 reject pending and generic READY markers, invalid integration status, and each independently nonancestor reviewed/merge SHA. Dirty source and wrong HEAD reject. Host preparation stays 0 and all temporary record bytes/mtime stay unchanged.
- Atomic/bootstrap/wire GREEN: `node --experimental-strip-types --test --test-name-pattern 'atomic case5 claim' tests/transfer/validation-case-five.test.ts` passed 1/1, no failed/skip, exit 0, 72960.3841 ms. Fake model replies pass through the production C5 driver, planner, role factory and transfer host task validation; current grant IDs/dependencies and `identityBinding` are verified. The test stops before the author DAG. Old histories, requests, fees, audits, delegations, first authorization/parent source, shared capacity and original clock are preserved.
- C4/C3 compatibility: `node --experimental-strip-types --test --test-name-pattern 'case4 real driver|original case3 driver' tests/transfer/validation-case-four.test.ts` passed 2/2, no failed/skip, exit 0, 111910.8777 ms. These are existing free tests injecting synthetic replies through the production driver/planner/host; no real model session or provider response is inspected. C4 remains opted in; the original C3 default wire rejects local aliases and publishes no identity binding.
- Strict import-closure command above passed after the test-only edits, exit 0, 8354.0397 ms. `git diff --check` passed. All nine task files reopen as strict UTF-8/no BOM/LF, Chinese renders correctly, the old README is an exact byte prefix, and sixteen original declaration/wrapper/requirement/template paths match the base byte-for-byte.
- All provider/SDK network calls are zero. Synthetic fee entries are explicit fixture data, not charges. Existing consumer/Edge/80-call evidence is reused. Real C5 generation and human acceptance remain unverified; only independent review and merger integration may authorize registering `TRANSFER_CASE_FIVE_SOURCE_READY`.
