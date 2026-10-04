# COS53 Preparation Draft Implementation Plan

> **For agentic workers:** Execute with TDD and verification-before-completion. The dedicated implementer owns this branch; a separate reviewer inspects the actual commit before the batch merger integrates it.

**Goal:** Preserve genuine requirement interviews before runtime design supplies an executable browser scenario.

**Architecture:** Keep the existing six-field browser draft and default intake wire format. A trusted internal caller can select the finite `cos16-input/1` preparation mode before storage or provider calls. Its source-owned `cos16-transfer-v1` contract fixes all six T16 criteria and the two existing host stages; preparation drafts contain the original brief, questions, answers and unsupported requirements, with no scenario, map, solution or paths. Durable mode metadata and immutable origin receipts bind save, native interview, stdin confirmation and cold resume. Activation continues through the existing ledger and one formal clock.

**Tech Stack:** TypeScript, Node 22 native test runner, existing pi session and intake accounting interfaces.

**Baseline:** independently approved COS52 `2ca0f244c52d9280729986ac4b5583829395cbde`. No changes to operator validation inputs, C1–C5 declarations/profiles, private evidence, paid ledgers or generated games. All new provider/stdin/clock evidence is SYNTHETIC; actual human acceptance remains NONE.

## Files

- Create `src/roles/preparation-mode.ts`: finite source-owned mode/version/scope and complete six T16 acceptance; existing `HOST_STAGE_ACCEPTANCE` is appended by requirements validation.
- Modify `src/roles/requirements.ts`: browser/preparation draft union, strict expected-mode validation and browser narrowing.
- Modify `src/runtime/intake.ts`: selected-mode metadata, immutable mode origin, bound save/reopen, existing confirmation and activation reuse.
- Modify `src/roles/interview.ts`: persisted-mode prompt/schema, scope and receipt identity; strict model payload validation.
- Modify `src/cli/session.ts`: internal-only mode option, persisted source binding in answers/origin, preparation display and exact confirmation/resume.
- Modify `src/runtime/entrypoint-host.ts` and `src/runtime/entrypoint-validation.ts`: necessary browser narrowing/type references only; retain operator preparation behavior.
- Create `tests/roles/preparation-draft.test.ts`, `tests/runtime/preparation-intake.test.ts`, `tests/cli/preparation-session.test.ts`: strict schema, synthetic native/provider/stdin, immutable mode/source, accounting and activation evidence.

## Steps

- [x] Write strict schema tests: all eight fixed criteria; reject mixed browser/preparation fields, unknown modes, source versions, maps/solutions/paths, fake confirmation, and modified/dropped criteria. Keep the old browser six-field serialized draft.
- [x] Run the new tests and record expected RED failures before implementation.
- [x] Add the union and finite source contract with the minimum validation changes; run schema tests to GREEN.
- [x] Write intake tests for free rejection before directories/ledger/provider, explicit preparation selection before a draft, immutable origin, legacy default compatibility, saved source bytes, mode-bound cold resume, unsupported/refused confirmation, unknown reservations and one ledger/activation clock.
- [x] Run intake tests to RED; implement bound mode persistence and reuse existing confirmation/activation; run to GREEN.
- [x] Write injected native/session tests for selected scope/schema, model mode switching refusal, exact real brief/answers, modification/refusal/confirmation and cold resume without generic fallback or duplicate calls. Test the default browser host rejecting disconnected preparation before dispatch.
- [x] Run native/session tests to RED; implement prompt/receipt/session changes and only required callsite guards; run to GREEN.
- [x] Run focused new and affected browser/interview/intake/stage/operator tests and strict production typecheck. Reuse unchanged full Edge, 80-call, deadline and failure-suite evidence; this task makes no paid calls.
- [x] Reopen all edited UTF-8 files, check Chinese and LF, inspect diff and unchanged operator/source52 inputs, update this plan with exact verification results, and commit the implementation candidate for independent review.

## Completion boundary

This card exposes an internal intake API only. It adds no public CLI selector, production human preparation host, `bindPreparedTasks` hook, continuation or replanning feature. It does not prove Cosmos generated a game or that a human accepted one. Only the batch merger may integrate approved commits after the source freeze is explicitly lifted.

## Verification evidence

- Initial new-schema/intake/native/stdin run: 14 expected failures, 0 passes, exit 1 (4376.7408 ms), before implementation. The final nested `preparation` descriptor follows the reviewed source shape.
- Additional source-origin mutation test: RED missing rejection, then GREEN 1/1 (4221.8793 ms). Save/read/cold reopen refuse changed mode origin or saved draft bytes.
- Product browser interviewer guard: injected dispatch sentinel RED, then GREEN 1/1 (3447.0985 ms). Both questions and draft reject before native intent creation. An earlier local RED attempt reached missing-key validation and made no network or paid request; the final test disables native dispatch with an injected sentinel.
- New tests: `node --experimental-strip-types --test tests/roles/preparation-draft.test.ts tests/runtime/preparation-intake.test.ts tests/cli/preparation-session.test.ts` — 18/18, 0 skips, exit 0 (3967.5644 ms). All stdin/provider/clock evidence is SYNTHETIC. Test confirmations use the existing mock stdin actor; actual user acceptance remains NONE.
- Existing affected intake/interview/CLI/stage/fixed input tests: 34/34, 0 skips, exit 0 (7068.3232 ms).
- Generic browser host and generation entrypoint regression tests: 13/13, 0 skips, exit 0 (8303.884 ms).
- Focused existing operator preparation and COS52 compiled production closure: 2/2, 0 skips, exit 0 (13891.13 ms). Compilation uses a synthetic temporary output directory and the existing locked dependencies.
- `npm run typecheck`: exit 0 after the product interview guard (9.5416495 s). No dependency, fixed input/hash, operator profile or source52 helper changes.
- After removing a duplicate preparation confirmation source read, the affected source/accounting tests pass 3/3, 0 skips, exit 0 (3453.033 ms); earlier unaffected evidence is reused.
- All 11 changed/new files were reopened with fatal UTF-8 decoding; all use LF and contain no replacement character. Every existing Chinese-bearing source line remains present verbatim after trimming indentation. `git diff --check` passes. The diff against COS52 contains no `probes/transfer`, source52 helper, browser diagnostic or public CLI parser changes.

## Independent review correction

- P2 on candidate `9b3f4cd6da5e7a470573b59f19dc89bc2fa388c4`: the exported preparation draft validator accepted extra question fields, including executable paths and fake confirmation authority, even though native question parsing rejected them. The common preparation validator now permits only string `id` and `prompt` fields before clarification, saving or confirmation. The browser branch retains its existing behavior.
- Reproduction tests were written before the source correction: 2/2 expected RED failures (3476.342 ms), then 2/2 GREEN, 0 skips, exit 0 (3253.3133 ms). Rejected saves preserve the snapshot bytes and create no requirements directory; confirmation is refused without a saved draft. Ordinary preparation questions still save and confirm through the existing SYNTHETIC actor.
- Focused verification: `node --experimental-strip-types --test --test-name-pattern='preparation strictly|preparation refuses|native preparation receives|preparation questions reject|hidden preparation question fields' tests/roles/preparation-draft.test.ts tests/runtime/preparation-intake.test.ts` — 5/5, 0 skips, exit 0 (3441.147 ms). This covers both regressions, strict preparation schema and the injected native interviewer. Earlier unaffected 18-test, 47-test, operator/compiled closure and strict typecheck evidence is reused; no additional paid validation is performed.
