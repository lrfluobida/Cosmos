# Coding review evidence navigation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Let the existing ordinary coding reviewer locate every fixed host result and exact relevant detail without guessing raw JSON line offsets or losing negative evidence.

**Architecture:** A pure, format-specific display adapter feeds the existing scoped read tool. The role factory selects exact evidence files using the existing ordinary coding-review predicate and input inventory. Raw files, native screenshots, verdict rules and all funding guards remain unchanged.

**Tech Stack:** Existing TypeScript, Node 22.22.2, TypeBox and installed Pi SDK 0.99.2; no new dependencies.

**Design:** [COS-231 design](../specs/cos231-coding-review-evidence-navigation.md), [task #232](https://github.com/lrfluobida/Cosmos/issues/232). Source baseline `c57cdc954f8daf067f7d7c856f6daf20598de16e`; docs base `94bed90b28201fa75bdab1a024ba91ed983a8b55`. Worktree `E:/CodexData/.codex/worktrees/review-evidence-index/Cosmos`, branch `codex/review-evidence-index`. Dedicated implementer `review_evidence_author`, independent reviewer `review_evidence_reviewer`, sole merger `r52_merger`.

**Gate:** This file is a design/plan candidate. No production or test implementation before root reports independent design/plan approval. No paid requests, API-key access, acceptance changes or branch integration by the implementer.

**Current capacity state:** The selected navigation-only/batch-8 prototype is measured with the actual new SDK schema. A (complete requirements/design/source/index, 38 selected step details, all 31 coverage details, eight images) final quotes 716,536/683,768 at caps 8,192/4,096, against 679,274 before any earlier settlement. It improves the equivalent scalar-index quote by 274,560 but remains unaffordable in R72. B with the entire acceptance-plan quotes 1,039,444/1,006,676. These failures are retained. The independent design review must approve the complete semantics and measured limits before production work; source acceptance does not promise a future paid result.

## File map

| File | Responsibility |
| --- | --- |
| `src/providers/review-evidence-display.ts` (new) | Pure recognition, complete result index/detail table and display lines for existing browser/persistent/media report formats. |
| `src/providers/workspace-tools.ts` | Evidence path option and fixed-selector routing inside current read guards; native raw read behavior otherwise. |
| `src/roles/factory.ts` | Select evidence inventory paths for existing ordinary coding reviewer; advertise exact paths and bounded navigation. |
| `tests/providers/review-evidence-display.test.ts` (new) | Production tool tests: all outcomes, missing data, identity, raw compatibility, exact detail and pagination. |
| `tests/roles/review-evidence-navigation.test.ts` (new) | Actual factory scope, packet, tool schema and role isolation. |
| `tests/providers/review-evidence-capacity.test.mjs` (new) | Offline native SDK serialization, final quota behavior and full-read capacity assertions. |
| `.cosmos/planning/review-evidence-index-author/` (untracked evidence) | R72-specific replay and numeric results; owned temporary subdirectories. |

## Task 0: Close the design capacity condition before production

- [x] Extend only the owned stage diagnostic replay to navigation-only tuples and exact batch-8 `read` schema/description. `navigation-capacity.mjs` / `navigation-capacity.json` are retained under the owned stage. Historical system tool declarations are replaced in memory for the fresh hypothetical session, and actual wire schema keys/description are asserted. Zero network; no production/test implementation.
- [x] Measure A with 38 named related details (old 33 plus five missing exact screenshot rows), complete requirements/design and nine sources, all 31 media details and eight images. List 360 remaining plan/result details as unread. Measure B with the additional complete approved acceptance-plan. Both preserve negative affordability results; source failure-case fixtures remain Task 2/5 work after approval.
- [x] Model two batched-read requests then a final request. Initial quotes are 242,466 and 582,340; synthetic settlements 20,096 and 52,288 leave 606,890, so A final floor is refused by arithmetic (short 76,878). The all-max upper bound 1,541,342 is disclosure only. This simulation is not production guard execution or future measured usage.
- [ ] Obtain independent review of the full design/plan and numeric evidence, then root's approval notice before Task 1. No further same-scope speculative stage simulation is needed; production integration will provide the next distinct evidence.

Exact TypeBox additions for the design replay (optional properties are normalized by the installed native serializer):

```ts
evidenceOffset: Type.Optional(Type.Integer({ minimum: 1,
  description: '1-based evidence display line. Do not combine with raw offset.' })),
evidenceDetails: Type.Optional(Type.Array(Type.String(), { minItems: 1, maxItems: 8,
  description: '1..8 exact detail keys advertised by this evidence index, in display order.' })),
```

Append this tool description verbatim in replay and implementation:

> On selected host evidence, path alone returns a navigation index, not complete observations. Follow every evidenceOffset continuation. Use evidenceDetails with 1..8 advertised keys from this file for exact plan and result values; evidenceOffset pages that ordered selection. Read every failed, skipped, missing, unknown or anomalous row in detail. Numeric offset/limit without evidence fields reads raw source. Evidence fields cannot combine with raw offset, planOffset or artFrames.

## Task 1: Freeze the failure and executable contract

- [ ] Reuse independent `review-final-quote.json` and `replay-review.mjs`; confirm the historical source/environment/artifact identity still matches before any rerun. No repeated native browser or paid validation.
- [ ] Set child `TEMP` and `TMP` to the owned E: stage. Inspect target UTF-8 and line endings before edits; announce files. Reuse main dependencies only through an explicitly inspected junction if needed, recording target and ownership.
- [ ] Add minimal synthetic browser/persistent/media fixtures in the provider test file. Include one passed scalar (false/0/Chinese), failed mismatch, skipped step, missing result, unexpected extra result, unknown outcome, same step ID in different segments, duplicated ID in one segment and a missing declared segment. Include checkpoint/cleanup/error/failureFacts, savedAtClose, request/observation/witness and nullable/absent fields.
- [ ] Add failing tests invoking `createWorkspaceTools` with eligible evidence paths, then path-alone index, raw offset and advertised detail calls. Assert exact identity/value preservation and no omitted row masquerading as passed.
- [ ] Run `node --experimental-strip-types --test tests/providers/review-evidence-display.test.ts`. Expected red: evidence display option/contract unavailable. Save short output and exit code; do not treat an import/environment failure as the intended red.

## Task 2: Implement the minimal display adapter

- [ ] Create the pure module with a small interface equivalent to:

```ts
interface EvidenceDisplay {
  lines: string[];
  details: Map<string, unknown>;
}
function reviewEvidenceDisplay(bytes: Buffer, sourcePath: string): EvidenceDisplay | undefined;
```

The implementation may use focused local helpers, not a generic JSON query engine. Recognition uses the exact report kinds/shapes described in the design; unsupported/malformed input cannot yield a successful-looking empty index.

- [ ] Emit navigation header and explicit tuple columns, then all planned rows in order and all unmatched actual rows. Factor only repeated prefixes/dictionaries with exact reconstruction. Keep exact ordinal/id/kind/acceptanceId/outcome and detail identity. Add anomaly markers for errors/failures, missing fields and identity/expected mismatch; complete original expected/actual/error/observation/screenshot stay in exact detail. Explicitly label the index as navigation, with observations omitted.
- [ ] For persistent reports enumerate declared and observed segments, their original identities and binding, all steps, parent/per-segment outcomes and the full checkpoint/cleanup/session/failure facts. Do not drop missing reopen segments or convert them to empty passing stages.
- [ ] Add and pass a top-level-passed fixture with nested `nativeWaits.cleanup.steps` failed/pending/skipped, `rawPending:true`, and `renderFrames.error`/`before/after.issues`. Surface exact negative facts with mandatory detail keys via known-field traversal only; do not infer a new performance or cleanup verdict.
- [ ] For media usage enumerate declared `request.fields` and observed checks with id/path/kind/media/state/detail identity and all anomaly markers. Do not introduce a new inferred pass value. Preserve complete expected/actual and observation/witness references in exact detail, plus fixed details for original requests, series, coverage and normal-mode results. Do not silently substitute missing `request.checks` with an empty array.
- [ ] Populate only advertised exact detail keys. Step detail contains original plan and original result(s); coverage detail contains original request and coverage/result values. Named metadata sections retain collections that are large or repeated. Unknown fields are visible with incomplete-view status and raw access.
- [ ] Run provider tests to green, with direct assertions that original file bytes remain unchanged and raw numeric offsets match an unconfigured native read tool exactly.

## Task 3: Route bounded reads under existing authority

- [ ] Add `reviewEvidencePaths?: string[]` to `WorkspaceToolOptions`. Resolve these using the existing scope routine, but also require exact file membership in existing read scope. Do not grant new readable paths.
- [ ] Extend `read.parameters` only for nonempty eligible paths. Reuse the single object schema; optional `evidenceOffset`/`evidenceDetails` work when the native strict serializer supplies nulls. Existing plan/art schemas remain intact.
- [ ] Route after `check` and `access`; reject evidence/raw/plan/art argument conflicts. Whole path selects index; evidence offset pages it; 1..8 unique advertised keys select ordered exact details from the same file. Empty, duplicate, too-many or unknown-key batches fail atomically. Numeric raw offset/limit retains source text. Unsupported whole reads preserve raw with an unavailable notice; explicit unsupported detail/offset fails.
- [ ] Use native `createReadTool` custom operations, byte/line limits and truncation reporting. Label total/range/remaining on every evidence page and rewrite continuation with the same ordered detail keys/view plus `evidenceOffset`. Compact each full detail object to one line where bounded; use formatted pagination otherwise. Shared source/request-binding headers retain exact identity. No call may look complete when data remains.
- [ ] Add tests for batch size 1/8/0/9, duplicate and partly unknown keys, order, cross-file rejection, multi-page batch/detail, offset past end, 50 KiB boundary, oversized single row, foreign path, symlink, aborted signal, non-UTF-8/BOM/JSON, Chinese preservation and image/raw unaffected behavior. No screenshot contents are converted to text.
- [ ] Run `node --experimental-strip-types --test tests/providers/review-evidence-display.test.ts tests/providers/json-read-display.test.ts`. Expected green; existing lexical JSON/raw/image compatibility stays unchanged.

## Task 4: Wire only the intended reviewer

- [ ] Add factory tests using existing fixture patterns (`author-output-budget.fixture.ts`, review JSON guidance and input inventory tests). Confirm no index schema/packet change for authors, planning, design/art reviews, validation or continuation contexts.
- [ ] In `factory.ts`, use existing `codingReviewImageQuote` selection. Derive exact evidence JSON paths from `task.evidence` matched to `inputFiles`; never scan arbitrary candidate directories or follow report-linked paths. No new host policy callback.
- [ ] Pass the exact paths to `createWorkspaceTools`; reuse existing `compactFullJsonReads:true` only for this same selected reviewer. Packet/rules advertise primary persistent/browser and media reports, with complete requirements/design/manifest/host/delivery reading. Guide index-first, follow every continuation, inspect full source and related exact plan/result details, and retain independent judgment. Other plan details remain explicitly unread/raw-accessible. Do not instruct a favorable verdict or suppress raw reads.
- [ ] Test packet identity, original evidence IDs, eight screenshot delivery, unchanged ownership and verdict schema. Verify task evidence directory vs unrelated artifact paths, missing inventory file and copied foreign report shape cannot expand authority.
- [ ] Run `node --experimental-strip-types --test tests/roles/review-evidence-navigation.test.ts tests/roles/coding-review-budget.test.ts tests/roles/review-json-guidance.test.ts` and `npm run typecheck`. Expected green with unchanged 4,096 rejection boundary and original role rules.

## Task 5: Prove complete offline capacity, including failure cases

- [ ] Add installed native SDK test using `ModelRuntime`, `normalizeContext`, `convertToLlm`, actual factory tools and `onPayload`. Install a rejecting network function before SDK creation; only synthetic offline credentials in memory. Assert network request count zero. Never load environment credentials or persist wire/reasoning/base64 text.
- [ ] Build three clearly labeled trajectories: unmodified R72 history, whitespace-only display baseline, and prospective full structured navigation. Do not modify the historical journal. Reuse 12 exact quote matches; any changed wire/usage must be labeled prospective, not reusing old actual fees.
- [ ] Reproduce A with production tools: complete confirmed requirements, approved design, media manifest, nine sources, host/delivery, all index pages (398 steps/31 checks), eight screenshots, all 31 coverage details and the 38 named related plan/result details (with original selection reasons). Include every additional negative/anomalous row in failure fixtures. Explicitly list the remaining 360 passing plan/result details as unread, raw/detail-accessible. Reproduce B with extra entire approved plan reading. Do not describe A as full plan inspection or the selected detail count as proof of every dynamic audio transition.
- [ ] Include all non-pass/missing/unknown/mismatched rows in a negative fixture, a missing reopen segment, a long error and a multi-page metadata/detail collection. Ensure detail reading stays exact and the guard still rejects genuinely unaffordable input.
- [ ] Measure each real serialized synthetic request with original image/framing/tariff logic and actual proposed schema/guidance. Produce both material-only lower bound and complete trajectory ledger. Include cumulative request reservations then explicitly synthetic usage settlements; altered rounds have no historical actual usage. Compute all-max-consumed upper bound for disclosure only.
- [ ] Reserve a final verdict request at 4,096 and report 8,192 headroom, including largest required detail page and nonzero explicit model/tool-call text allowance. Report exactly which full-material scenario fits and the maximum preceding settlement it tolerates. Preserve failed scenario results and verify refusal at the true floor. Source acceptance depends on complete semantics, unchanged permissions, actual caller/SDK integration and measured capacity improvement, not a new guarantee that every model trajectory fits this small run.
- [ ] Run `node --test tests/providers/review-evidence-capacity.test.mjs` and the stage R72 replay script using exact paths documented in its report. Save numerical assertions, tool read identities, image count, byte/token/cost values and zero-network proof. Expected: exact historical baseline, complete-page coverage, explicit synthetic ledger remaining values, measured navigation improvement and correct insufficient-budget rejection. A passing synthetic trace is not future model-usage evidence.

## Task 6: Review, integrate and retain evidence

- [ ] Run `npm run typecheck`, `npm run build` and the combined focused tests above after the final semantic edit. Reuse still-valid results; do not rerun the whole browser/native game suite for a display-only change.
- [ ] Reopen all modified files with strict UTF-8; verify Chinese fixture text and existing surrounding text. Run `git diff --check` and inspect exact changed files. Confirm no game, R72 evidence, global task/progress file or budget implementation changed.
- [ ] Commit the focused implementation and report exact SHA, commands/results, full capacity report path, known limits and stage cleanup. Send to the independent reviewer for spec compliance then quality review; only the implementer fixes actionable findings and affected checks rerun.
- [ ] The sole merger integrates only the approved SHA, performs affected integration checks, registers public task/state and pushes. Source-ready means readable evidence and offline capacity demonstrated; it does not mean R72 approved, future model success, human experience completion or a new paid run.
- [ ] Wait for stage processes and handles to close; delete only owned unused temporary test outputs. Retain plans, numeric replay results and evidence needed for verification. Inspect every dependency junction before any future worktree removal; unlink junctions only and verify main dependency entry points afterwards.
