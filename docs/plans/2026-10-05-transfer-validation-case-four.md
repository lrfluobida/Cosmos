# COS49 fourth transfer validation case implementation plan

> The dedicated COS49 implementer follows approved issue #50. The independent reviewer inspects the actual commit; the batch08 merger alone integrates main.

**Goal:** Prepare one fixed fourth native migration case using host binding of planning aliases, within the remaining original COS16 allocation.

**Architecture:** Extend the existing private fixed input, entry and driver profiles to case4. Only its driver supplies the source literal `proposalIdentity: 'validation-policy-aliases/1'`; case1–3 continue to omit that option. The new profile authenticates eleven stopped histories, nine original closure sources, original parent authority and exact role fees before any host preparation or claim.

**Tech stack:** TypeScript, Node test runner, temporary synthetic repositories and the existing controller, native host and owned worker.

Base: `935a3fae6fae796940bd3c492d33d32d49f166b5`.

## Files

- Create `probes/transfer/validation-case-four-declaration.ts` and `validation-case-four-run.ts`.
- Modify private fixed factories in `probes/transfer/validation-input.ts`, `validation-driver.ts` and `validation-run.ts`.
- Create `tests/transfer/validation-case-four.test.ts` and `validation-case-four.fixture.ts`.
- Append `probes/transfer/README.md`. Preserve previous README prefix, case1–3 declarations/wrappers, requirements and template bytes.

## Steps

- [x] RED then GREEN: fixed vector 354912/1054678/2800000/2800000/2800000, total 9809590, identical input hash and strict CLI.
- [x] RED then GREEN: eleven consumed/stopped histories, current C3, three delegations, 55 closed grants and nine audits authenticated against each audit's own input and source bytes; old entries refuse.
- [x] RED then GREEN: exact group net/committed 190410 and historical role fees 45088/145322/0/0/0; equal-total wrong-role fees reject before host preparation.
- [x] RED then GREEN: precise Source20..48 markers/ancestors; pending48 rejects without receipt, owner, claim or host preparation.
- [x] RED then GREEN: atomic C4 append retains old histories, first parent authorization and shared capacity; bootstrap and initial scope use the new planning grant.
- [x] RED then GREEN: the real C4 driver calls the real planner with six-field local aliases; the real host validates bound C4 IDs/dependencies, plan.json records identityBinding, and testing stops before author DAG.
- [x] Check the original C3 driver wire and input/parser representative, strict actual import closure, encoding/Chinese/LF and exact scope; commit candidate for independent review.

## Execution boundary

Only free source and synthetic temporary records are authorized in this task. No actual Root ledger, case, session, transcript, credential, provider, browser, preview or installed reference game is accessed. No new executor, allocation, repair permission, public protocol selector or arbitrary declaration is introduced. Root alone later owns source freeze, fresh actual preflight, balance/model route, operator decision and bounded C4 execution. Human/public gates remain pending.

## Evidence

- RED: `node --experimental-strip-types --test tests/transfer/validation-case-four.test.ts` failed all six new feature tests on the missing fixed C4 entry, 3086.9807 ms, exit 1.
- Fixed declaration/parser/input GREEN: `node --experimental-strip-types --test --test-name-pattern 'case4 fixes' tests/transfer/validation-case-four.test.ts` passed 1/1, no failed/skip, 3255.501 ms, exit 0.
- History and actual wire GREEN: `node --experimental-strip-types --test --test-name-pattern 'case4 preflight authenticates eleven|case4 real driver' tests/transfer/validation-case-four.test.ts` passed 2/2, no failed/skip, 94720.741 ms, exit 0. The actual planner used the original role factory with a local synthetic session; the actual consumer host validated all bound C4 task identities/dependencies, and `plan.json` contained the precise policy/alias/actual-ID mapping. Testing stopped at host validation before author DAG, build or browser; fees remained unchanged.
- Admission and atomic append GREEN: `node --experimental-strip-types --test --test-name-pattern 'pending host identity|equal-total|atomic case4' tests/transfer/validation-case-four.test.ts` passed 3/3, no failed/skip, 108271.6582 ms, exit 0. The temporary fee records are explicit synthetic data, not provider charges or generated-game evidence.
- Original C3 driver compatibility: `node --experimental-strip-types --test --test-name-pattern 'original case3 driver' tests/transfer/validation-case-four.test.ts` passed 1/1, no failed/skip, 48672.2007 ms, exit 0. Its unmodified fixed driver invocation omitted the new option; the original exact-ID prompt and alias rejection remained, with no plan.json or fees.
- Original C3 input/parser representative: `node --experimental-strip-types --test --test-name-pattern 'case3 fixes' tests/transfer/validation-case-three.test.ts` passed 1/1, no failed/skip, 395.2483 ms, exit 0. The Source48 core protocol tests and existing consumer/feedback/group/80-call/Edge evidence are reused because their source and contracts did not change.
- Strict actual import closure: `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions probes/transfer/validation-case-four-run.ts tests/transfer/validation-case-four.test.ts tests/transfer/validation-case-three.test.ts tests/transfer/validation-input.test.ts tests/transfer/validation-run.test.ts tests/transfer/validation-driver.test.ts` passed, exit 0, 7727.5899 ms, after adding the original-driver regression.
- All nine task files re-open as strict UTF-8 without BOM or CRLF. Chinese renders correctly, the previous README remains an exact byte prefix, and all ten fixed case1–3 declaration/wrapper/requirements/template files remain byte-identical to the base. `git diff --check` passed.
- No actual Root ledger/case/session/transcript/key/provider/browser/preview/reference game was accessed. Actual C4 generation and human acceptance remain unverified. `TRANSFER_CASE_FOUR_SOURCE_READY` may be registered only after independent review and merger integration.
