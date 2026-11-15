# COS-231 · Ordinary coding review evidence navigation

Status: design candidate with measured navigation improvement; the complete rehearsal still exceeds R72's small allocation. Production implementation requires independent design/plan approval. Owner: `review_evidence_author`; independent reviewer: `review_evidence_reviewer`; sole merger: `r52_merger`. [Task #232](https://github.com/lrfluobida/Cosmos/issues/232), parent #203, dependencies #203/#228; public registration belongs to the root/merger.

## Problem and evidence

Cosmos is a reusable 2D game-development agent. This change improves its independent reviewer’s access to existing fixed host evidence; it does not implement or repair a generated game.

R72 (`.cosmos/public-validation/room-20261115-native-review-72/run`) produced a candidate that passed native build, 200 save steps, 198 reopen steps and 31 media checks. The reviewer sent 12 paid requests, then the original budget guard refused request 13 before dispatch. No independent verdict exists; this remains a failed/incomplete run, not an approved game. R71’s external checks do not replace R72’s independent verdict.

The independent offline replay is `.cosmos/planning/r72-independent-observation/replay-review.mjs`, with numeric results in `review-final-quote.json`. It uses the installed native SDK serialization, blocks network and exactly reproduces all 12 historical request quotes. The unsent request contains eight original PNGs (521,680 base64 bytes), 238,728 non-image wire bytes, 8,192 image tokens and 3,552 framing tokens. Input alone costs 500,944 micro-CNY, above the remaining 491,744; the unchanged 4,096 output floor brings the quote to 533,712, a deficit of 41,968. Lowering output floor cannot solve input alone. The last paid request correctly used its affordable cap of 4,733. No exact duplicate tool-read response was found.

The resume raw report has 11,018 lines and 371,388 bytes. Its plan precedes results; the parent persistent report repeats declared plans and embeds both full reports (1,071,583 bytes). The media report repeats the series and requests (222,914 bytes). Current `read` offers raw line offsets; compact whole-JSON display is enabled for design roles only and requires the entire compact value to fit existing SDK bounds. Numeric offsets always read raw lines. R72 read five noncontiguous resume pages, source files once, and the beginnings of delivery/media reports. This navigation did not reach all useful results before the guard stopped review.

## Options and decision

1. Whitespace-only JSON display: smallest textual change and no semantic projection. However, repeated plan/result material remains, complete JSON exceeds the single-read bound, and line offsets still do not identify actual outcomes. Measure it as the baseline, not the chosen solution.
2. **Selected: deterministic host-evidence navigation index and exact bounded detail through existing `read`.** Enumerate every declared and observed step/check with exact identity and outcome, and expose full original plan/result detail. Reuse already selected evidence paths and the existing read guards. The index locates evidence; it is explicitly not a complete observation report. This addresses navigation and repeated structure while preserving access to every raw file.
3. Separate search tool or generated evidence copies: unnecessary tool, storage and authority surface. Do not add it, an arbitrary JSON-pointer query language, a generic document framework, a new hash/trust receipt or a dependency.

This selection requires the complete offline capacity evidence below. A projection that only makes request 13 fit is insufficient. Source acceptance requires correct complete navigation, unchanged authority and an actual caller/SDK path that quantitatively improves reading capacity. It does not require a new guarantee that any possible model trajectory fits the small R72 allocation, and it does not authorize another paid run.

### Current capacity finding: incomplete

Independent `.cosmos/planning/r72-independent-observation/simulate-review-capacity.mjs` and `review-capacity-comparison.json` measured the following with zero network. Amounts are micro-CNY and include the indicated final output cap:

| Prospective representation | Quote | Comparison |
| --- | ---: | --- |
| Whitespace-only replacement of already complete JSON reads, floor 4,096 | 526,756 | Exceeds R72 remaining 491,744 by 35,012. |
| Every already-requested JSON read as a complete compact value | 1,300,442 | Exceeds the remaining allocation. |
| Existing history with complete index plus material completion | 696,238 | Exceeds remaining allocation by 204,494. |
| Fresh single packet with complete indexed material, cap 4,096 | 628,168 | Leaves 51,106 of review-start 679,274, before earlier read costs. |
| Same fresh single packet, cap 8,192 | 660,936 | Leaves only 18,338, before earlier read costs. |

The fresh material includes all 398 scalar result tuples, 31 media checks, nine source files, design/manifest/host/delivery, eight PNGs and 33 precisely listed representative exact details (each acceptance's first/last assertion per segment plus the original selected s033/s125 checks). It is not every possible detail, does not contain the proposed production tool schema yet, and does not establish a multi-request reading trajectory. These numbers do **not** pass the complete capacity gate. They reject the earlier oversized variant which duplicated expected/actual/screenshot facts in both index and detail. The selected revision below uses a navigation-only index; its full-trajectory measurement remains a gate. No source implementation or future paid validation is authorized merely by these preliminary measurements.

### Selected navigation rehearsal

The owned stage `navigation-capacity.mjs` / `navigation-capacity.json` under `.cosmos/planning/review-evidence-index-author/` now measures the exact proposed bounded-batch schema through the installed SDK, with zero network. Native journals contain `system.toolsAdded`; the prospective fresh session replaces those in-memory declarations too, and asserts the final wire has `evidenceOffset`/`evidenceDetails` and the new 944-byte description. Historical journals are unchanged. This is a design prototype, not the future production caller test.

A reads complete draft/confirmation, approved design, media manifest, host/delivery, all nine sources, all 398 navigation rows, 38 exact step details and all 31 coverage details, retaining all eight original images. It extends the old 33 with five more exact image-linked steps so every supplied screenshot has its plan/result; each detail's selection reason is in the report. The original 33 are first/last assertions per acceptance/stage plus prior layout concerns, not proof that every dynamic mute/re-enable transition was inspected. Full source and complete original user requirements still require independent semantic review. The other **360 plan/result details remain unread and explicitly listed**, with raw/detail access; approved plan identity is retained. B additionally reads the entire approved acceptance-plan through native raw pagination.

| Native SDK request/scenario | 8,192 cap quote | 4,096 cap quote |
| --- | ---: | ---: |
| A initial batched-read request | 242,466 | not needed for this scenario |
| A request after complete documents/sources/navigation | 582,340 | not needed for this scenario |
| A final after 38 step + 31 coverage details | 716,536 | 683,768 |
| B final after additional complete plan | 1,039,444 | 1,006,676 |
| Equivalent scalar-index A, same complete materials/details | 991,096 | not needed for comparison |

Navigation removes 274,560 micro-CNY of conservative final quotation versus the equivalent scalar index; index text is 38,882 bytes. It still does **not** fit the original review-start 679,274 even at the unchanged final floor (short 4,494 before earlier settlements). A clearly synthetic settlement scenario uses `(inputTokens, outputTokens)=(8000,512)` then `(20000,1536)`, settling 20,096 and 52,288 after the quoted reservations. Remaining 606,890 cannot admit A final 683,768 (short 76,878), nor B. These tokens are explicit scenario parameters, not tokenizer estimates, historical usage or predictions. The all-max-consumed A upper bound is 1,541,342 and is disclosure only. Arithmetic refusal is recorded; production budget guard tests are reused and must be exercised at the actual caller during implementation. No numeric failed scenario is represented as a successful ledger or verdict.

The design evaluation is complete enough for source review: it proves meaningful navigation reduction without hiding the residual small-budget problem. Implementation must repeat the same A/B comparison with actual generated tool outputs and selection, plus failure fixtures. Any future paid allocation requires its own complete current quote and authorization; this task does not reopen R72.

## Scope and authority

Enable only for the existing ordinary coding reviewer predicate (`codingReviewImageQuote`: reviewer, no validation scope or continuation window, trusted coding selection). Authors, planning, design/art reviewers, validation/continuation roles and ordinary reads without the option keep their existing behavior. Do not invent a new task option, policy or execution authority.

In `factory.ts`, derive eligible file paths from **task evidence references and their existing `inputFiles` entries**, never from candidate/artifact contents, filenames outside that inventory, or paths found inside report JSON. File references are exact; directory references expand only to actual inventoried JSON files. Each file remains within current `ownership.readPaths`. Content recognition selects supported host formats, not path suffix alone. Existing workspace/realpath/symlink, signal and `beforeTool` checks execute before reading. Report-linked paths are metadata and grant no additional reads.

The review packet adds only the exact eligible evidence paths and concise navigation instructions. No evidence content is preloaded into every request. Existing input identities, raw evidence IDs, eight PNGs, source files, requirement/experience rules and verdict schema remain unchanged. The view is not an additional evidence ID or proof, and cannot mark a task passed.

## Read contract

Keep the single native `read` tool. Add optional fields only when eligible evidence paths are nonempty:

```ts
evidenceOffset?: number; // positive 1-based display line, distinct from raw offset
evidenceDetails?: string[]; // 1..8 exact keys advertised by this file's index
```

For an eligible recognized file, path alone (optional numbers omitted/null) returns the index. `evidenceOffset` selects its continuation. `evidenceDetails` selects 1..8 exact advertised keys from that same file in caller order; `evidenceOffset` pages that fixed ordered selection. Duplicate, empty, oversized or unknown-key selections fail before returning a partial batch. A batch never crosses file scope. `limit`, if present with evidence fields, is a positive display-line bound under the unchanged SDK byte/line ceilings. A numeric raw `offset`, or numeric `limit` alone, retains original raw file behavior. Evidence fields cannot combine with raw `offset`, `planOffset` or `artFrames`; invalid, zero, fractional or unknown selectors fail explicitly. Native optional null normalization remains supported.

The index is deterministic JSON-lines with a header, a declared column table and rows, using short tuples to avoid repeated property names. No text is cut inside a row without an explicit incomplete indication. Use existing `createReadTool` custom operations and SDK truncation limits (50 KiB / 2,000 lines), preserving continuation metadata and replacing its instruction with `evidenceOffset`. The first header and each continuation response identify source path, selected view/ordered keys, total display lines, returned range, and whether more remains. Never describe a partial page as complete. Offset past end reports no rows and total lines, not success. Full detail values use one compact JSON line per selected object when each line fits; large values use formatted JSON pagination, with every selected key retained. Common source and request bindings may appear once in the header, never repeated for every record or omitted entirely.

Detail keys have only fixed local grammar, resolved against an in-memory table from the same file: `step:<segmentOrdinal>:<stepOrdinal>`, `coverage:<ordinal>` and `section:<name>[:<ordinal>]`. Ordinals are 1-based; a standalone browser report uses segment 1. Every step key is displayed alongside its original step ID and exact stage/report identity, so the reviewer can select a desired step ID without guessing raw offsets and repeated IDs stay distinct. Section names come from the finite report adapter below. There is no arbitrary traversal, filesystem read through a detail key, model-generated selector evaluation or cross-file lookup.

Details contain the exact decoded original object/value, with provenance and presence markers; `step` detail pairs the original declared plan step with its original result(s), including expected/actual, full error/failure, observation count and screenshot. It never substitutes a rewritten expectation or derived pass judgment. Large details use ordinary formatted JSON display and honest continuation. Unsupported formats, invalid UTF-8/BOM/JSON or structurally unprojectable data retain raw reading with an explicit “index unavailable” notice; an explicit evidence selector then errors. An oversized single index row must expose the identity, original outcome if present, the omitted-field names and detail key, with `complete:false`; never silently truncate a value. If a detail itself exceeds the unchanged SDK single-line limit, report it and preserve raw access; do not claim complete semantic coverage.

Source bytes and formatting are never written. “Exact detail” means original parsed host JSON values, not regenerated evidence or lexical identity; raw reads remain the way to inspect original bytes. Unknown/invalid fields do not become empty arrays or successful values.

## Supported reports and complete representation

### Browser and persistent reports

Recognize `formatVersion:'1.0.0'` plus `kind:'normal_browser_input'` or `kind:'persistent_profile_process_reopen'`. Parent persistent reports are the primary navigation entry: show all segments once from their embedded reports and the fixed series; independent segment files remain separately readable. Do not reread or duplicate every child report merely because it is also inventoried.

Header identifies source path, project/task/run/spec, candidate, report ID, expected and observed segment IDs/report paths, prerequisite, timestamps and viewport. Preserve actual segment spelling (`save`/`resume` are observations, never hardcoded stages). Display parent and per-segment outcome, errors, failureFacts/termination, cleanup, session, savedAtClose and checkpoint, including before/after process/profile/origin and expected/actual/savedActual facts. Explicitly distinguish absent, null and empty. A duplicate, missing, extra or mismatched segment/plan/result ID is a visible diagnostic, never silently deduplicated.

For each declared plan step in original order, display a row with:

```text
[segmentOrdinal, stepOrdinal, id, kind, acceptanceId, outcome, detailKey]
```

Use exact IDs, kinds, acceptance IDs and outcomes, including Chinese strings where present. Header dictionaries may factor repeated acceptance IDs and stage identities only if reconstruction is exact and unambiguous. Header stage entries give exact report source location and original nested section/ordinal; the step detail key plus these fields uniquely locates every row. The index declares `observationDetailsIncluded:false`, names the omitted fields and says that complete enumeration is not complete observation review. Join declared/observed steps only when position and identity agree; mismatches expose both identities and all actual rows. Append every unmatched result in its original order as extra/unmatched. Missing planned rows show `missing`, not `skipped` or `passed`; explicit skipped stays skipped; unknown outcome stays unknown. Counts separately report planned, observed, passed, failed, skipped, missing, extra and malformed/unknown. No count is independent approval.

Each detail includes exact plan observation (including full pixel masks, coordinates, tolerances, selector/path and timeout), input action and result with screenshot reference. Mismatched plan/result expected values for assert/wait-for, any non-null error/failure, absent required fields and malformed observation counts create a visible anomaly entry with the row key, even when the reported outcome says passed. Inputs legitimately have host expected `input delivered` and no plan expected or observation count; do not flag those as missing checks. Required/optional fields follow the original report kind and step kind. The reviewer must read exact details for every failed/skipped/missing/unknown/extra or anomalous row; known negative facts cannot disappear behind a favorable aggregate. Detail preserves false/0/null and absent values distinctly. Passing rows are navigation to actual evidence, not a claim that unread actual values have been inspected.

Enumerate the existence and exact cardinality of `files`, `evidence`, `mediaObservations`, `renderFrames` and `nativeWaits`; expose fixed section details for their complete values and per-item details for large arrays. Media observation requests/values are not replaced by an overall coverage boolean. Preserve complete `plan` and `series` as named detail sections as well as raw source. New unknown report fields appear as unsupported field names with raw access and an incomplete-view warning, not a claim that all metadata was understood.

Known nested negative metadata is mandatory navigation, even if top-level outcome says passed: list each `nativeWaits.cleanup.steps` failed/pending/skipped outcome, each step's boolean `rawPending === true`, the cleanup aggregate's numeric `rawPending > 0` retaining its exact number, and each `renderFrames.error` or `before/after.issues` item with its exact value and section/detail identity. Mark absent expected metadata explicitly. Require reading these details before a verdict. This is a fixed traversal of the existing native-cleanup/render-frame fields, not a generic recursive failure classifier or a new performance/cleanup verdict. Add a fixture whose top-level report is passed but nested cleanup is pending/failed, aggregate rawPending is 1, a step rawPending is true, and a render-frame issue is present; the index must expose all of them without altering the source outcome.

### Media usage

Recognize only the host shapes actually emitted at `entrypoint-host.ts` (normal `checks`/optional request/coverage; persistent `series`/`requests`/coverage), bound to the selected candidate/media refs. Header exposes candidate/media/series bindings, scope, coverage.valid and coverage.complete exactly as present. Show all declared request checks and all observed coverage/check rows, including absent results, missing checks, duplicates, extra observations, false/mismatched values, missing witnesses and unknown structures. Presence is distinct from a favorable boolean.

For each check, retain ordinal, exact id/path, kind, mediaId/state and detail key. Preserve any original outcome field; if absent, state `outcome:not_recorded`, not passed. Emit anomaly markers for missing/duplicate/extra checks, expected/actual inequality, errors, missing observation/witness collections or referenced segments, without inventing a media verdict. `coverage:<ordinal>` exposes the original full check, expected/actual, exact observation/witness segment IDs/report paths, its request field(s) from `request.fields` and any normal-browser result. Do not read a nonexistent `request.checks` and silently substitute an empty array. Shared segment/report dictionaries may remove repeated prefixes without losing references. Section details retain complete requests, series, coverage and non-check metadata. The index declares observations omitted and requires exact detail for every anomalous or unresolved row. Account for every request/check; never filter to passed checks or drop a collection because it is absent in R72.

### Small host and delivery reports

Do not invent another compact schema for these. Reuse existing `compactFullJsonReads:true` for this same selected ordinary coding reviewer: whole JSON uses the existing lossless whitespace display only when complete output fits unchanged bounds; explicit raw offsets and all fallbacks stay unchanged. This also avoids needless whitespace in its complete requirements/design/manifest reads. Include host/delivery paths in guidance and require complete reading. Their build/proof, bytesMatched, acceptancePassed, helperExited/helperResult and raw browser/media report links remain evidence to inspect, not inherited reviewer approval.

## Budget and acceptance invariants

Do not change provider/model/reasoning, image transport, 8-image selection, token estimator/tariffs, request count, 4,096 reviewer output floor, 8,192 ceiling, authority/grant/deadline rules, ledger entries or admission/settlement. Existing budget quotation sees the exact final SDK wire with the modified tool schema and actual tool outputs. No replacement/synthetic successful verdict is recorded for R72; no new paid run or R73 is authorized by this task.

## Verification and capacity gate

Tests must exercise production `createWorkspaceTools` and `createRoleFactory`, not an independent formatter that bypasses selection or guards. Cover positive/negative/missing/unknown data, multi-segment repeated IDs, all 398-step and 31-check structure shapes, UTF-8 Chinese, paging and oversized records, exact plan/result details, raw compatibility, native null schema, symlink/scope and cancellation.

Offline capacity uses the installed `ModelRuntime` / `convertToLlm` / `normalizeContext` and the actual resulting tools; capture `onPayload` and reject all network. First retain the existing 12 exact historical quote checks as baseline. Compare whitespace-only, structured navigation and the unmodified history, without confusing a fresh prospective review with rewriting R72’s existing journal.

Scenario A reads all index pages (398 steps and 31 media checks), complete host/delivery, all nine source files, complete confirmed requirements and approved design, media manifest, the same eight PNGs, all 31 exact coverage details and named relevant plan/result details. Selection is fixed and reported: every failed/skipped/missing/unknown, anomalous or mismatched row, every supplied screenshot's exact plan/result, plus the named audio/save/reopen/layout details. The passing rehearsal has 38 selected keys with documented reasons. The other 360 plan/result details are explicitly unread; plan identity and all raw paths remain available. A does not repeat the full prior design-review plan inspection and cannot be described as complete plan reading. Scenario B additionally reads the complete approved plan and preserves its larger quote/refusal result. No sampling may disguise absent failures, and a count of selected details is not proof that every dynamic behavior was semantically verified.

Report both the final request input quote and a complete ledger trajectory. Use real historical usage only for unchanged historical rounds; changed prospective requests have no measured actual cost. For each synthetic request use the actual SDK quote for reservation, then an explicitly labeled synthetic usage settlement consistent with that request; show remaining allocation before the next admission. Report the maximum earlier settlement that still allows the final request. Historical first-round actual usage may be a named scenario input, never relabeled as new measured usage. Reserve a final native JSON verdict request with the unchanged 4,096 floor and also report 8,192 headroom. Include actual schema/framing and the largest necessary detail page; model reasoning/text bytes cannot be assumed zero without a separately labeled best-case bound. A mathematically affordable final request alone is not sufficient.

Also disclose the pessimistic sum if every request consumed its entire maximum quote, but do not make that sum a new admission rule: production reserves per request and settles actual usage. The source gate is a reproducible no-network complete navigation/reading trajectory using the production caller, exact final SDK quotation, explicit synthetic ledger assumptions, and negative tests that still refuse genuinely unaffordable input. It must demonstrate material navigation improvement and report whether the named full-material scenario fits the original review allocation with final space. If a scenario fails, preserve that result and explain the limiting input/earlier settlement; no floor, evidence or pricing relaxation is allowed. Do not claim an R72 recovery or a future paid outcome from a passing synthetic ledger. Model navigation, usage and semantic approval remain unproven until separately authorized live validation.

## Files and delivery

- New `src/providers/review-evidence-display.ts`: deterministic adapters, rows/detail table and display accounting; no I/O, provider or authorization logic.
- Modify `src/providers/workspace-tools.ts`: optional eligible paths, evidence arguments and display routing under original read guards.
- Modify `src/roles/factory.ts`: existing coding-review selection, inventory-derived exact paths and minimal navigation instructions.
- New `tests/providers/review-evidence-display.test.ts`, `tests/roles/review-evidence-navigation.test.ts`, and `tests/providers/review-evidence-capacity.test.mjs` with a bounded fixture companion if necessary: production tool, selection and installed SDK transport coverage.
- A retained stage-only replay script and numeric report under `.cosmos/planning/review-evidence-index-author/` may reference immutable R72 artifacts; never commit raw journals, image/base64 contents, private reasoning or credentials.

Do not modify acceptance runners, generated games, official R72 artifacts, global progress/task registry or requirements. Implementer commits source only after independent plan approval; reviewer examines actual diff and affected checks; sole merger integrates approved SHA and records evidence/cleanup. Retain design, plan and verification records; remove only owned unused temporary outputs after child exit. No dependency junction is needed for this docs-only stage.
