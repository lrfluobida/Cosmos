# COS50 capture layout implementation plan

> Dedicated implementer for approved issue #51; independent reviewer checks the actual diff, and batch08 merger alone integrates main.

**Goal:** Give reviewer and downstream roles accurate read paths for existing immutable captures while preserving author write scopes.

**Architecture:** Add source-owned layout guidance to the existing role rule strings. Rules identify artifacts by ID and fixed relative file paths; each consumer selects the exact current version/location in its packet rather than guessing an author suffix or retaining a stale version. Keep registry layouts, scoped tools, factory packets, validation and retry policies unchanged.

**Tech stack:** TypeScript, Node test runner, existing host/registry/factory tools, temporary synthetic fixtures.

Base: `e609a16d948d566268b81078bc205f2f0517f3dd`.

## Files

- Modify `src/runtime/entrypoint-host.ts`: generic design/media/game capture rules and clear author-only write instructions.
- Modify `probes/transfer/runtime-host.ts`: transfer design/binding and two separately referenced plan layouts in existing design/art/coding rules.
- Create `tests/runtime/entrypoint-capture-layout.test.ts`: actual captures, host verification, reviewer/downstream packets and scoped reads, plus changed-version consumption.
- Create this implementation plan.

## Steps

- [x] Reproduce missing layout guidance using actual host capture/verify and reviewer reads; first prove correct paths read and author suffixes fail under existing tools.
- [x] Add minimal rule guidance; consume declared files using current packet references and actual read tools.
- [x] Cover all four transfer outputs and the two distinct plan roots, generic media spec/manifest and game source, reviewer isolation and downstream permissions.
- [x] Verify changed-version references with retained rules consume the newly selected version and refuse the old scope.
- [x] Run focused existing default/factory regression and strict import closure; inspect UTF-8/Chinese/LF and exact source diff; commit for independent review.

## Boundaries

Free source and temporary synthetic records only. No actual ledger/session/transcript/key/provider/browser/preview/reference game access; no C1–4 restart or paid calls. The regression creates roles with a local session factory but never prompts a model. Capture and validation use the existing implementation. Human/public/complete migration acceptance remains pending.

## Evidence

- RED: `node --experimental-strip-types --test tests/runtime/entrypoint-capture-layout.test.ts` failed 3/3, no skip, exit 1, 12590.0696 ms. Each test first used the actual scoped tool to read the correct immutable files and reject the author-directory suffix with ENOENT; only then did it fail on the missing source-owned layout rule. The transfer fixture used actual host capture/verify, original sealed-map checks and TaskJournal signatures, without any model prompt.
- The initial GREEN run exposed a fixture approval mistake: a reviewer attempted to update author-owned attempt fields. The unchanged controller rejected it. The fixture now uses the original system completion followed by independent reviewer verdict sequence; production permissions remain unchanged.
- Final GREEN: the same complete new test command passed 3/3, no failed/skip, exit 0, 31060.9929 ms. It covers actual reviewer/art/coding packets and scoped tools; all four transfer references, both separate plan roots, mediaSpec/manifest, game index/src; reviewer has only read; author writes to immutable captures and unselected reads reject; selected-v2 reads succeed with retained rules and the old version scope rejects. Reads preserve exact snapshots; fixture ledger/request/validation history remains unchanged and all provider/model prompts are zero.
- Existing default wire and independent delivery representative: `node --experimental-strip-types --test --test-name-pattern 'delivery requires the independent|exact-grant default policy mode' tests/runtime/entrypoint-host.test.ts tests/roles/planning-identity.test.ts` passed 2/2, no failed/skip, exit 0, 4081.4365 ms. No consumer/Edge matrix was repeated.
- Strict actual import closure: `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions tests/runtime/entrypoint-capture-layout.test.ts tests/runtime/entrypoint-host-validation.test.ts tests/runtime/entrypoint-design-check-host.test.ts tests/transfer/runtime-host.test.ts tests/roles/planning-identity.test.ts` passed exit 0, 7627.2736 ms. An earlier broader command also included the unmodified legacy `entrypoint-host.test.ts`; its pre-existing fixture lacks report time fields and uses untyped author-proposal placeholders, so that unrelated test source is kept as a runtime representative rather than rewritten here.
- Four task files are strict UTF-8 without BOM or CRLF; Chinese is re-opened correctly. The factory, scoped tools, capture renderer, binding, validation, orchestrator, registry and frozen input files remain byte-identical to the base. `git diff --check` passed.
- This fixes source guidance only. No actual C4 result/review, ledger/session, credential, provider, browser, preview or reference game was read or changed. Native migration and human/public acceptance still require their separate subsequent validation.
