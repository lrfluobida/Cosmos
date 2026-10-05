# COS64 Batched Media Implementation Plan

> **For agentic workers:** Implementer executes the reviewed plan with superpowers:test-driven-development; a separate context reviews the actual diff. Only batch08_merger integrates approved commits.

**Goal:** Connect bounded batches of runtime-authored media to one complete capture, coding input and normal-input media acceptance (COS09/COS15/COS18 source scope).

**Architecture:** Keep one art task, author session and independent review. Accept the legacy single-batch object or `{formatVersion:"batched-media/1",batches:[{characters:CharacterSpec[],audio:AudioSpec[]}]}`. Validate all batches before rendering, flatten into one manifest, and preserve the original envelope in `_cosmos/mediaSpec.json`. For media that cannot fit the existing 200-step plan, retain the normal plan unchanged and use a distinct generic read-only collection binding; transfer's existing `readonly-media/1` remains unchanged.

**Tech Stack:** TypeScript, Node test runner, existing SVG/PCM renderers and registry, Playwright Chromium/Edge; no new packages or model calls.

## Contract and limits

- Design allows 1..128 characters, 0..64 clips and the existing 1..16 states per character. These are platform limits, not a classic benchmark roster.
- Envelope contains 1..8 nonempty batches. Each batch has only `characters` and `audio`, at most 16 of each; total bounds still apply. The old object is one batch and retains 16/16 bounds. Validate exact unique union of IDs, states and loops against design before any output allocation. Preserve declared batch order in the flattened manifest.
- The art author is instructed to use successive normal file edits to append batches to the same `authors/art/media.json`, then finish only when its complete envelope matches design. Existing write grants and task/session/DAG remain sufficient; no extra model request or budget authority is added.
- Add `readonly-media/generic-1` alongside the transfer packet: exact media and candidate references, manifest SHA256, SHA256 of the actual full normal plan, and manifest-derived `{id,path,expected}` fields. It has no transfer sourceVersion or persistent scope. The host reads the actual captured manifest, verifies metadata and bytes before/after replay, sends the trusted collection through IO and its actual worker, then validates the raw sample and coverage before accepting.
- Legacy small media still uses appended wait-for checks. Switch only when original steps plus complete definitions exceed 200. Do not raise that limit or remove gameplay inputs/assertions.
- Scalar reader keeps its default 592 fields. An explicit generic transport capacity permits at most 4544; retain one snapshot getter, non-configurable read-only root, data-only nested properties, safe paths and finite scalars. Runner validates generic candidate and plan hash, polls read-only snapshots up to 1500ms within its existing execution/cleanup deadline, and retains the last incomplete sample. Missing state, unloaded frames and unstarted/undecoded sound never create complete coverage.

## Task 1: Batched capture

Files: `src/runtime/entrypoint-media.ts`, `src/runtime/entrypoint-host.ts`, `tests/runtime/entrypoint-media.test.ts`, `tests/runtime/entrypoint-host.test.ts`.

- [ ] Add failing tests for 17 characters/17 clips in two batches, exact flattening and original envelope retention. Cover duplicate/missing/extra IDs, wrong state/loop, 9 batches, per-batch overflow and total overflow; retain old single-batch behavior.
- [ ] Run `node --experimental-strip-types --test tests/runtime/entrypoint-media.test.ts` and record expected RED.
- [ ] Implement bounded validation and rendering; update capability/design/art rules with complete capacity and append workflow.
- [ ] Extend the real production host fixture to capture all batches, expose complete coding inputs and stage the candidate. Verify final manifest and last batch files, plus review/recovery bytes.
- [ ] Run the two affected Node suites and commit.

## Task 2: Complete generic observations

Files: `src/acceptance/browser.ts`, `src/acceptance/runner.ts`, `src/runtime/entrypoint-media.ts`, `src/runtime/entrypoint-host.ts`, `tests/acceptance/media-observations.test.ts`, `tests/runtime/entrypoint-host.test.ts`.

- [ ] Add failing tests for >200 appended fields / >592 collected fields; assert original normal plan is retained and trusted IO receives actual manifest/candidate/plan binding.
- [ ] Add wrong-binding, missing-state, unloaded-frame and unstarted/undecoded audio rejection tests. Test 4544 field capacity and 4545 rejection while retaining default 592 and nested getter rejection.
- [ ] Run the affected tests for RED, then implement the generic packet, actual native IO forwarding, bounded read-only readiness and strict sample assessment.
- [ ] Run targeted unit/host suites, `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`, and commit.

## Task 3: Necessary browser and compatibility evidence

Files: new `tests/acceptance/generic-media.integration.ts` and optional HTML fixture; `docs/development/quickstart.md`; this plan's evidence section.

- [ ] Before runner implementation, add a non-model browser fixture exercising the maximum 4544 fields, delayed real readiness, normal click/visible assertion and immutable properties. Record its expected RED. It must also reject a changed plan/candidate and nested getters; incomplete samples must stay incomplete. Use temporary evidence only.
- [ ] Run `node --experimental-strip-types --test tests/acceptance/generic-media.integration.ts` after GREEN. Run narrow legacy media/transfer consumer tests affected by the shared packet type, not the old full Edge matrix or generated-game run.
- [ ] Update the quickstart's capacity/batch description with a minimal Chinese patch after strict UTF-8 detection. Re-open all modified files, verify Chinese content and LF, run `git diff --check` and typecheck.
- [ ] Commit exact implementation SHA and request independent spec then quality review. Fix findings in this branch and re-review affected changes. Report tests/raw outputs, approved SHA and known gaps to the merger.

## Evidence and boundaries

Pending RED/GREEN output. No actual model requests, paid admission, ledger mutation, reference assets, human acceptance or generated target game. C6 unknown974882 remains a prerequisite for new paid validation. Shared validation ¥150 and formal ¥200/12h (target ¥100/6h) remain unchanged. Complete classic trusted acceptance, frozen reference roster and user visual/listening judgment remain outside this source task.
