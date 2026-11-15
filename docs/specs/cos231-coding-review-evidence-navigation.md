# COS-231 · Ordinary coding review evidence navigation

Status: design candidate, capacity not yet closed; production implementation requires independent design/plan approval. Owner: `review_evidence_author`; independent reviewer: `review_evidence_reviewer`; sole merger: `r52_merger`. [Task #232](https://github.com/lrfluobida/Cosmos/issues/232), parent #203, dependencies #203/#228; public registration belongs to the root/merger.

## Problem and evidence

Cosmos is a reusable 2D game-development agent. This change improves its independent reviewer’s access to existing fixed host evidence; it does not implement or repair a generated game.

R72 (`.cosmos/public-validation/room-20261115-native-review-72/run`) produced a candidate that passed native build, 200 save steps, 198 reopen steps and 31 media checks. The reviewer sent 12 paid requests, then the original budget guard refused request 13 before dispatch. No independent verdict exists; this remains a failed/incomplete run, not an approved game. R71’s external checks do not replace R72’s independent verdict.

The independent offline replay is `.cosmos/planning/r72-independent-observation/replay-review.mjs`, with numeric results in `review-final-quote.json`. It uses the installed native SDK serialization, blocks network and exactly reproduces all 12 historical request quotes. The unsent request contains eight original PNGs (521,680 base64 bytes), 238,728 non-image wire bytes, 8,192 image tokens and 3,552 framing tokens. Input alone costs 500,944 micro-CNY, above the remaining 491,744; the unchanged 4,096 output floor brings the quote to 533,712, a deficit of 41,968. Lowering output floor cannot solve input alone. The last paid request correctly used its affordable cap of 4,733. No exact duplicate tool-read response was found.

The resume raw report has 11,018 lines and 371,388 bytes. Its plan precedes results; the parent persistent report repeats declared plans and embeds both full reports (1,071,583 bytes). The media report repeats the series and requests (222,914 bytes). Current `read` offers raw line offsets; compact whole-JSON display is enabled for design roles only and requires the entire compact value to fit existing SDK bounds. Numeric offsets always read raw lines. R72 read five noncontiguous resume pages, source files once, and the beginnings of delivery/media reports. This navigation did not reach all useful results before the guard stopped review.

## Options and decision

1. Whitespace-only JSON display: smallest textual change and no semantic projection. However, repeated plan/result material remains, complete JSON exceeds the single-read bound, and line offsets still do not identify actual outcomes. Measure it as the baseline, not the chosen solution.
2. **Selected: deterministic host-evidence navigation index and exact bounded detail through existing `read`.** Enumerate every declared and observed step/check with exact identity and outcome, and expose full original plan/result detail. Reuse already selected evidence paths and the existing read guards. The index locates evidence; it is explicitly not a complete observation report. This addresses navigation and repeated structure while preserving access to every raw file.
3. Separate search tool or generated evidence copies: unnecessary tool, storage and authority surface. Do not add it, an arbitrary JSON-pointer query language, a generic document framework, a new hash/trust receipt or a dependency.

This selection is conditional on the complete offline capacity gate below. A projection that only makes request 13 fit is insufficient. A failed gate requires revision and independent re-review before source acceptance, not budget or acceptance relaxation.

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

## Scope and authority

Enable only for the existing ordinary coding reviewer predicate (`codingReviewImageQuote`: reviewer, no validation scope or continuation window, trusted coding selection). Authors, planning, design/art reviewers, validation/continuation roles and ordinary reads without the option keep their existing behavior. Do not invent a new task option, policy or execution authority.

In `factory.ts`, derive eligible file paths from **task evidence references and their existing `inputFiles` entries**, never from candidate/artifact contents, filenames outside that inventory, or paths found inside report JSON. File references are exact; directory references expand only to actual inventoried JSON files. Each file remains within current `ownership.readPaths`. Content recognition selects supported host formats, not path suffix alone. Existing workspace/realpath/symlink, signal and `beforeTool` checks execute before reading. Report-linked paths are metadata and grant no additional reads.

The review packet adds only the exact eligible evidence paths and concise navigation instructions. No evidence content is preloaded into every request. Existing input identities, raw evidence IDs, eight PNGs, source files, requirement/experience rules and verdict schema remain unchanged. The view is not an additional evidence ID or proof, and cannot mark a task passed.

## Read contract

Keep the single native `read` tool. Add optional fields only when eligible evidence paths are nonempty:

```ts
evidenceOffset?: number; // positive 1-based display line, distinct from raw offset
evidenceDetail?: string; // one exact key advertised by this file's index
```

For an eligible recognized file, path alone (optional numbers omitted/null) returns the index. `evidenceOffset` selects its continuation. `evidenceDetail` selects an exact advertised detail and `evidenceOffset` pages that detail. `limit`, if present with evidence fields, is a positive display-line bound under the unchanged SDK byte/line ceilings. A numeric raw `offset`, or numeric `limit` alone, retains original raw file behavior. Evidence fields cannot combine with raw `offset`, `planOffset` or `artFrames`; invalid, zero, fractional or unknown selectors fail explicitly. Native optional null normalization remains supported.

The index is deterministic JSON-lines with a header, a declared column table and rows, using short tuples to avoid repeated property names. No text is cut inside a row without an explicit incomplete indication. Use existing `createReadTool` custom operations and SDK truncation limits (50 KiB / 2,000 lines), preserving continuation metadata and replacing its instruction with `evidenceOffset`. The first header and each continuation response identify source path, selected view, total display lines, returned range, and whether more remains. Never describe a partial page as complete. Offset past end reports no rows and total lines, not success.

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

Each detail includes exact plan observation (including full pixel masks, coordinates, tolerances, selector/path and timeout), input action and result with screenshot reference. Mismatched plan/result expected values, any non-null error/failure, absent required fields and malformed observation counts create a visible anomaly entry with the row key, even when the reported outcome says passed. The reviewer must read exact details for every failed/skipped/missing/unknown/extra or anomalous row; known negative facts cannot disappear behind a favorable aggregate. Detail preserves false/0/null and absent values distinctly. Passing rows are navigation to actual evidence, not a claim that unread actual values have been inspected.

Enumerate the existence and exact cardinality of `files`, `evidence`, `mediaObservations`, `renderFrames` and `nativeWaits`; expose fixed section details for their complete values and per-item details for large arrays. Media observation requests/values are not replaced by an overall coverage boolean. Preserve complete `plan` and `series` as named detail sections as well as raw source. New unknown report fields appear as unsupported field names with raw access and an incomplete-view warning, not a claim that all metadata was understood.

### Media usage

Recognize only the host shapes actually emitted at `entrypoint-host.ts` (normal `checks`/optional request/coverage; persistent `series`/`requests`/coverage), bound to the selected candidate/media refs. Header exposes candidate/media/series bindings, scope, coverage.valid and coverage.complete exactly as present. Show all declared request checks and all observed coverage/check rows, including absent results, missing checks, duplicates, extra observations, false/mismatched values, missing witnesses and unknown structures. Presence is distinct from a favorable boolean.

For each check, retain ordinal, exact id/path, kind, mediaId/state and detail key. Preserve any original outcome field; if absent, state `outcome:not_recorded`, not passed. Emit anomaly markers for missing/duplicate/extra checks, expected/actual inequality, errors, missing observation/witness collections or referenced segments, without inventing a media verdict. `coverage:<ordinal>` exposes the original full check, expected/actual, exact observation/witness segment IDs/report paths, its request check(s) and any normal-browser result. Shared segment/report dictionaries may remove repeated prefixes without losing references. Section details retain complete requests, series, coverage and non-check metadata. The index declares observations omitted and requires exact detail for every anomalous or unresolved row. Account for every request/check; never filter to passed checks or drop a collection because it is absent in R72.

### Small host and delivery reports

Do not invent another compact schema for these. Keep existing raw read behavior for host-report and delivery-check, whose current complete contents fit existing bounds. Include their existing paths in navigation guidance and require complete reading. Their build/proof, bytesMatched, acceptancePassed, helperExited/helperResult and raw browser/media report links remain evidence to inspect, not inherited reviewer approval.

## Budget and acceptance invariants

Do not change provider/model/reasoning, image transport, 8-image selection, token estimator/tariffs, request count, 4,096 reviewer output floor, 8,192 ceiling, authority/grant/deadline rules, ledger entries or admission/settlement. Existing budget quotation sees the exact final SDK wire with the modified tool schema and actual tool outputs. No replacement/synthetic successful verdict is recorded for R72; no new paid run or R73 is authorized by this task.

## Verification and capacity gate

Tests must exercise production `createWorkspaceTools` and `createRoleFactory`, not an independent formatter that bypasses selection or guards. Cover positive/negative/missing/unknown data, multi-segment repeated IDs, all 398-step and 31-check structure shapes, UTF-8 Chinese, paging and oversized records, exact plan/result details, raw compatibility, native null schema, symlink/scope and cancellation.

Offline capacity uses the installed `ModelRuntime` / `convertToLlm` / `normalizeContext` and the actual resulting tools; capture `onPayload` and reject all network. First retain the existing 12 exact historical quote checks as baseline. Compare whitespace-only, structured navigation and the unmodified history, without confusing a fresh prospective review with rewriting R72’s existing journal.

The structured trajectory must read all index pages (398 steps and 31 media checks), all required host/delivery data, all nine original source files, confirmed requirements, design/acceptance plan and media manifest, the same eight PNGs, and named relevant details. Detail selection is fixed and reported: every failed/skipped/missing/unknown, anomalous or mismatched row, every distinct visual constraint needed to assess the eight supplied screenshot expectations, plus relevant audio/save/reopen checks. The current passing-case rehearsal uses the exact 33 detail keys listed by the independent replay and must explain their coverage against complete approved plan/source review. List every other detail as not inspected, rather than treating index enumeration as inspection. Add all 31 coverage details if their actual observations are needed for media assessment; measure this explicitly instead of relying on a favorable aggregate. No sampling may disguise absent failures.

Report both the final request input quote and cumulative trajectory consumption. Use real historical usage only for unchanged historical rounds; changed prospective requests have no measured actual cost. Supply a conservative upper-bound ledger using the existing estimator for each actual synthetic request/cap, and state if that bound does not fit. Reserve a final native JSON verdict request with the unchanged 4,096 floor and also report 8,192 headroom. Include actual schema/framing and the largest necessary detail page; model reasoning/text bytes cannot be assumed zero without a separately labeled best-case bound. A mathematically affordable final request alone is not sufficient.

The acceptance gate is a deterministic reproducible, no-network complete trajectory with nonnegative final headroom under the original allocation, no lost required evidence and no relaxed floor. If conservative complete-trajectory proof fails, record failure and revise the bounded design; do not publish a source-ready conclusion based on a lower-bound material estimate. Even a passing offline trajectory proves capacity/transport only, not that a future model will navigate efficiently or approve the game.

## Files and delivery

- New `src/providers/review-evidence-display.ts`: deterministic adapters, rows/detail table and display accounting; no I/O, provider or authorization logic.
- Modify `src/providers/workspace-tools.ts`: optional eligible paths, evidence arguments and display routing under original read guards.
- Modify `src/roles/factory.ts`: existing coding-review selection, inventory-derived exact paths and minimal navigation instructions.
- New `tests/providers/review-evidence-display.test.ts`, `tests/roles/review-evidence-navigation.test.ts`, and `tests/providers/review-evidence-capacity.test.mjs` with a bounded fixture companion if necessary: production tool, selection and installed SDK transport coverage.
- A retained stage-only replay script and numeric report under `.cosmos/planning/review-evidence-index-author/` may reference immutable R72 artifacts; never commit raw journals, image/base64 contents, private reasoning or credentials.

Do not modify acceptance runners, generated games, official R72 artifacts, global progress/task registry or requirements. Implementer commits source only after independent plan approval; reviewer examines actual diff and affected checks; sole merger integrates approved SHA and records evidence/cleanup. Retain design, plan and verification records; remove only owned unused temporary outputs after child exit. No dependency junction is needed for this docs-only stage.
