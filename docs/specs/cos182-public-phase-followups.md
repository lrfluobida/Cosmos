# COS182: explicit public phase followups

Status: design independently approved at `ef137fac7ec45adc01d59990402e011c597620e9`; implementation candidate awaiting independent source review. SOURCE work only; this document, registration, preparation and tests authorize no actual limit increase, funding reservation or provider call. The existing phase remains 45,000,000 micro-CNY; lifetime authority remains 150,000,000, with a maximum new run of 5,000,000 / 1,800,000 ms. A proposed 50,000,000 phase requires a new exact user decision after the source is published and the current quote is prepared.

## Scope and representation

Add optional `RunSnapshot.publicValidationPhaseFollowups`, a nonempty append-only array of followup receipts after the existing single successor. Preserve the original extension and successor properties, their formats, receipts, source bytes, events and funding associations. No default is raised and no old snapshot is migrated.

The alternatives are replacing the successor slot (loses historical identity), generalizing its format in place (changes the established single-use contract), or adding the optional history. Choose the last because both old APIs retain their exact behavior and callers can explicitly opt into the new transition.

Add `PublicValidationPhaseFollowupQuote/Decision/Receipt` alongside existing phase types, and `preparePublicValidationPhaseFollowup` / `applyPublicValidationPhaseFollowup` alongside existing entry points. The quote uses `public-validation-phase-followup-quote/1`, a content-derived `pvpfq1-` quote ID, the existing basis fields, numeric from/to amounts and the existing predecessor tuple (quote ID, decision ID, receipt hash, source hash). The decision uses `operator_public_validation_phase_followup` and the existing independent source-file protocol (`operator-public-validation-phase-followup-decision/1`), including exact quote contents, source references, actor and decision time. These are version tags within the current protocol, not a new identity or signing system.

## Preparation and application

Preparation is read only: validate the actual shared snapshot, original ledger/run/roots, all historical sources and accounting reviews, idle ownership and registry; bind the current last followup or original successor. The requested safe-integer target must be strictly greater than its predecessor and at most the original 150,000,000 authority. No target default is supplied. Bind C, H, allocations, snapshot revision/hash and a frozen history hash, then repeat idle/stability checks. `activationAllowed` stays false.

For followups only, history eligibility accepts funding that is either closed or permanently suspended with verified existing suspension evidence. Ordinary open funding, shared unknown/reserved charges, overrun, unresolved accounting reviews, live owners and registry writers reject. C + H must fit the predecessor phase. H comes from the existing `publicFundingExposure`; the child's unknown charge, retained bound and original allocation are unchanged. Old extension/successor eligibility remains closed-only.

Application acquires the existing shared lock, validates the complete current state and exact new source decision, and checks decision identity collisions against all phase, funding and other existing owner decisions. A historical receipt matching the supplied quote and decision returns that receipt exactly without snapshot writes, including after later funding, settlement or another followup. Conflicting retries reject. A new receipt requires the quoted current predecessor and exact current revision/snapshot, rederived quote, unchanged sources/accounting checks and idle state immediately before commit. Commit changes only the optional history (append one receipt), revision (+1), and one `public_validation_phase_followup_applied` event. It never changes limits/deadlines of existing runs.

## Frozen history and readers

Legacy history reconstruction explicitly omits the new optional history, just as it already omits the successor, so old receipt hashes remain valid. Followup reconstruction preserves the extension, successor and only prior followups, using the existing basis counts to truncate append-only ledger/request/event/funding history. Predecessor matching determines the exact prior followup count; no independent sequence authority is added.

A suspended historical funding may later acquire an accounting claim and settlement through existing APIs. For followup history reconstruction only, remove a `chargeClaimSha256` or `settlement` added after the quote, identified by its unique existing claim/settlement event sequence beyond `basis.eventCount`. Never remove an earlier field, binding, suspension, source association or charge. Existing full-state funding validation still requires the matching unique events, imported charges and closures. This allows legitimate later accounting without relaxing the quote's frozen prefix. Unknown snapshot fields continue to participate in the prefix hash.

Validate the followup chain in order: exact predecessor/source binding, strictly increasing bounded limits, monotonic basis counts/revisions/times, unique decision identities and a one-to-one append event for each receipt. Validate funding against the latest phase whose original funding-count boundary precedes the funding index. New authorization and reservation use the latest phase source; historical authorization uses its stored phase decision ID. Old receipt retry and funding accounting remain available without reviving dispatch. Historical closed/suspended cases remain permanently unavailable.

## Files and verification

Expected production edits: `src/runtime/public-validation-phase-types.ts`, `public-validation-phase-extension.ts`, `public-validation-phase-validation.ts`, `public-validation-funding.ts`, `run-types.ts`, and `run-validation.ts`. Keep changes within this phase protocol; no new dependencies, model tools, signatures or ledger refactor. Tests go in `tests/runtime/public-validation-phase-followups.test.ts`, reusing the current funding and signed suspension fixtures. Any shared fixture adjustment is minimal and test-only.

Focused TEMP checks cover: 45 to 50 to 55 with no defaults; no-lock/no-write preparation; unchanged original 30/40/45 history/source bytes and funding associations; exact old/new retries after later funding/settlement/followups; malformed, missing, conflicting, forged, stale, lower, unsafe and over-lifetime inputs; source and predecessor tampering; latest-source new funding and historical accounting; R30-like permanent suspension with unchanged child unknown/H/limits/deadlines; preserved accounting claim/settlement after followup; rejection of ordinary open/overrun/unverified suspension. Tests use synthetic approvals under absolute TEMP roots only.

Run affected phase/funding/suspension tests, typecheck and build. Report exact commands/results without combining duplicate counts. Implementer commits the reviewed source; a fresh reviewer inspects the actual diff. Only the designated merger `cos175_resume_merger` integrates/pushes. Root then prepares a real read-only quote and asks the user about a new phase decision; source acceptance and elapsed time cannot approve it.

## Candidate verification

- New followup tests plus the existing external charge-resolution file: 7/7, zero skips, TAP 13390.0644 ms. This includes four followup scenarios and three charge-resolution checks; the existing signed TEMP resolution scenario now suspends two synthetic runs, applies a followup and completes its real claim/settlement path, then verifies exact receipt retry without writes.
- Additional followup chain/idle-owner test: 1/1, zero skips, TAP 4282.2978 ms. Together these cover five distinct new followup tests; earlier overlapping runs are not additional passes.
- Existing extension, successor, funding and suspension files: 81/81, zero skips, TAP 68944.44 ms, including their imported fixture regressions.
- Typecheck and build exit 0; `git diff --check` passes. Modified existing text remains UTF-8 with LF, and existing Chinese lines are unchanged.
- Initial RED observed the missing API. A test-only shared evidence-array mutation and missing synthetic registry directory were corrected before final passing checks. No actual financial files or paid services were changed or invoked.
