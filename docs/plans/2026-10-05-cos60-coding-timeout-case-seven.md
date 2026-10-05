# COS60 coding timeout case seven implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax. The COS60 dedicated implementer commits source changes; an independent reviewer inspects the actual diff; only the batch merger integrates approved commits into main. Implementation waits for explicit `PLAN_APPROVED` from that reviewer.

**Goal:** Prepare fixed `cos20-transfer-validation-7` with an authenticated, actually settled COS16 remainder, the approved long coding request timeout, and C5 passed design/art inputs.

**Architecture:** Add C7 admission and declaration derivation around a narrow trusted coding-only entry/driver/task seam shared with COS57. Preserve existing C1–6 public wrappers, declarations, frozen inputs and behavior. C7 uses the original quote2/ledger4/snapshot3 contracts plus its own immutable admission quote envelope to bind the exact fee basis, actual manifest digest and approved source before claim and dispatch.

**Tech Stack:** TypeScript, Node 22 test runner, temporary synthetic repositories, existing RunController, historical stage verifier, transfer production host, native pi/Flash factory and owned workers.

Base: `fd5bb5b4a8f51cfde3b0f3dfd1eacb46d6210d8b`. Worktree: `E:/CodexData/.codex/worktrees/cos-04-media/Cosmos`. Branch: `codex/cos60-coding-timeout-case-seven`.

Source specification: `docs/specs/cosmos-spec.md`, `CONTEXT.md`, and COS60 issue [#61](https://github.com/lrfluobida/Cosmos/issues/61). The new task card is currently on the Root-owned records branch at `E:/CodexData/.codex/worktrees/batch08-records/Cosmos/docs/specs/cosmos-issues.md`; pending documentation is not production approval. Source59 must be recorded as approved `b912f0e1751ea49e3749a487dd97759efbea43e4` / merged `4139a822d87c9ed8f819d22bd051148c45da45a0` on the actual admitted main.

## Fixed boundaries and current facts

- The current actual C6 is stopped and consumed. Its last 974882 micro-CNY reservation is unknown; no final C6 cost or C7 role vector is asserted here.
- Source/TEMP work can proceed. Actual ledger, manifests, keys, sessions, games, reference installation, billing reconciliation, closure12 and paid execution belong to Root. This implementer never reads or writes those real records, calls a paid provider, pushes or merges main.
- Actual admission requires all 14 old cases stopped, the exact six original transfer delegations, all historical exposure truly reconciled, 70 closed grants, 12 closure receipts with their actual source bytes, and idle shared/historical owners including recovery sentinels.
- A cleared unknown flag alone is insufficient: admitted requests must have matching settled entries and settlement evidence, and the closure quote/source must cover their actual settled amounts. The original unknown response cannot become a zero-cost settled response through SDK default usage. Actual provider evidence authenticity remains Root's financial reconciliation prerequisite; the source does not invent a new billing schema or a fee estimate.
- Limits remain case ¥5 / 45 minutes / 80 requests / one coding repair; shared ¥150 / first ¥30 / original COS16 ¥10; formal ¥200 / 12h and target ¥100 / 6h. No role borrowing, added allowance, retry, deadline extension or old C6 output/session reuse.
- Only current coding authors, their independent reviewers and one eligible current coding repair use SDK sessions. Planning authorizes the one host bootstrap only; planner/design/art SDK calls remain zero. COS59 supplies coding-author cap 600000ms, clipped for each request to the current authority deadline minus 5000ms; other roles and intake retain 120000ms and maxRetries remains zero.

## Design decisions

Three approaches were considered. Copying C6 orchestration into C7 would duplicate already approved recovery and repair behavior. Generalizing the product workflow and quote schema would expand this task. The chosen approach adds a fixed C7 admission layer and the smallest source-only seams needed to reuse current coding execution.

The seams accept source-owned declarations and fixed reader callbacks, never CLI/model configuration. C6 public names continue to bind D6 and its existing original five-case baseline. C7 names bind the fixed C7 identity and its six-case audited baseline. Common code must use the bound case ID and current window declaration rather than silently importing D6. No shared mutable declaration is used across calls.

The exact seam boundary is:

1. Entry: share lifecycle operations after read-only admission (host prepare, repeated admission, envelope/decision publication, atomic claim, own-window reopen, stop/cleanup, result report). C6's historical baseline checks remain case-specific. C7 has its own baseline validator because settled C6 costs are variable. Shared read-only history/source receipt checking can be extracted only where its existing assertions remain identical.
2. Driver: a trusted factory binds `{ declaration, manifestLocation, readInput, createIdentityReader, prepareExecution }` and returns bootstrap, stage, DAG and generation methods. It keeps the existing consumer, TaskJournal and one-repair path. D6 exports bind existing values; D7 exports bind the admitted immutable declaration.
3. Task: bind `{ declaration, manifestLocation }` around the existing deterministic coding task derivation and execution receipt. Preserve the fixed inherited C5 IDs, four design refs and media ref, current policy/tools/outputs, expected artifacts and immutable canonical bytes.
4. Input: expose the existing fixed-input factory as a trusted internal export, or move only that factory to an internal module if required to avoid changing old export bytes. All old input exports and manifest definitions remain unchanged. C7 consumes the identical tracked fixed requirement/template bytes with its own case identity.

Root has approved the source-only seam and the C7 admission quote envelope design. The envelope is C7-owned, with its own format tag and hash. It contains the original base quote2, explicit snapshot revision/hash, deterministically derived role vector, actual raw manifest reference/digest and exact source approval set. The underlying quote2 and ledger/snapshot schemas remain unchanged. Free preflight returns the envelope and digest in memory without publication or owners.

After a fresh authorized case intent, the fixed entry publishes the exact envelope immutably under the shared root and adds its exact ArtifactReference and the manifest reference to the actual operator receipt's sourceRefs. Before claim, it re-reads envelope/manifest/operator bytes, verifies the exact hashes and recomputes the current admission basis. Generic claim receives the base quote2 and still rejects changed snapshot bytes/revision or declaration. The current scope reader continues to verify the original envelope bytes, exact window quote, original historical fee prefix, current source and manifest at staging, author/repair dispatch, tools and promotion. Current C7 charges are excluded from the historical fee derivation and do not replace the original quote basis.

## File ownership

Create:

- `probes/transfer/validation-case-seven-declaration.ts`: fixed ID/parser and pure remaining-role declaration derivation, with no exported executable final grant constant.
- `probes/transfer/validation-case-seven-entry.ts`: fixed 14-case admission, source/closure checks, C7 admission envelope and public entry assembly.
- `probes/transfer/validation-case-seven-run.ts`: immutable original C5/parent/first-authorization pins, fixed source entry and CLI runner.
- `probes/transfer/validation-case-seven-driver.ts`: bind the approved common coding driver to the C7 declaration and manifest.
- `probes/transfer/validation-case-seven-task.ts`: bind current C7 coding/task receipt derivation.
- `probes/transfer/validation-case-seven-source.ts`: bind the actual fixed source or compiled execution import closure and resolved SDK/lock bytes; no repository tree scan.
- `probes/transfer/validation-coding-only-entry.ts`: shared post-admission lifecycle only, if this is the minimal extraction required to avoid copied orchestration.
- `tests/transfer/validation-case-seven.fixture.ts`: source/TEMP history, reconciled cost variants and authentic synthetic C5 manifests.
- `tests/transfer/validation-case-seven.test.ts`: declaration/parser, fee/closure/history/source refusals, read-only preservation and quote invalidation.
- `tests/transfer/validation-case-seven-task.test.ts`: current task/execution bytes, tools/policy/input isolation and cold derivation.
- `tests/transfer/validation-case-seven-driver.test.ts`: bootstrap/staging, own source/manifest/window/requirements and history refusal.
- `tests/transfer/validation-case-seven-runtime.test.ts`: one composition representative for claim, coding defect, own repair and cold owner reopen.
- `tests/transfer/validation-case-seven-compiled.test.ts`: temporary compiled source closure and representative admission/task/runtime boundary.

Modify only as required for the above seams:

- `probes/transfer/validation-case-six-entry.ts`: delegate common lifecycle while retaining all C6 baseline checks and public API/error behavior.
- `probes/transfer/validation-case-six-driver.ts`: bind existing exports to the trusted factory, preserving C6 behavior.
- `probes/transfer/validation-case-six-task.ts`: bind existing exports to the task factory, preserving D6 and canonical C6 receipt bytes.
- `probes/transfer/validation-input.ts`: export the trusted fixed reader seam without changing the old definitions/exports.
- `probes/transfer/README.md`: append C7 preparation instructions and current unknown refusal; preserve the full old byte prefix.

Do not modify product runtime/provider/role policy unless an independently reviewed defect blocks this specific source composition. COS59 production changes are already integrated. Do not edit task cards or GitHub metadata owned by Root.

## Task 1: Pure settled-cost declaration and fixed parser

Files: new declaration and `validation-case-seven.test.ts`.

- [ ] Write a RED test for `deriveTransferValidationCaseSevenDeclaration(state)`: two legal C6 final settled amounts must produce different correct C7 coding grants. The test uses no provider or owner.
- [ ] Run `node --experimental-strip-types --test --test-name-pattern="declaration|parser|settled" tests/transfer/validation-case-seven.test.ts`; expected missing API RED.
- [ ] Implement the minimum deterministic derivation using existing `COS16_GROUP_GRANTS` = planning400000/design1200000/art2800000/coding2800000/repair2800000. For each role: `remaining[role] = initial[role] - sum(actual settled historical role entries across D1..D6)`.
- [ ] Require unique exact D1..D6 membership, declarations/grant identities, matched request/entry ownership, no unknown/reserved/nonterminal rows, admitted settlement evidence and no foreign/duplicate role rows. The previous five-case vector remains 76320/601462/166678/677647/0; C6 is additional actual coding settlement, with the preserved 12 already settled request total135531 and the final reconciled response. Reject non-safe integers or any non-positive remaining role.
- [ ] Assert the vector sum equals original10m minus actual historical group commitment, and the closed grant net/allocated value equals actual historical settled cost. Preserve all declaration limits, output caps and fixed inputs; new task IDs are exactly `${case7}-${role}`.
- [ ] Assert unresolved last cost cannot be replaced by its 974882 reservation or zero default usage. Accept actual ledger costs only after their reconciliation/closure evidence is valid.
- [ ] Run the focused test GREEN and commit the smallest coherent change after reviewable code exists.

## Task 2: Fixed history and read-only C7 admission quote

Files: new entry/run/fixture, focused tests, shared entry seam and necessary C6 delegation.

- [ ] Write RED refusal tests using one reusable TEMP baseline: current unknown/remaining reservation; absent closure12; active/recovery owner; wrong current case/history count; repeated or foreign delegation/member; wrong parent index4/revision1414/hash/first authorization; wrong task role/cost; missing settlement/closure evidence; Source57/59 missing marker or either non-ancestor approval SHA.
- [ ] Run `node --experimental-strip-types --test --test-name-pattern="admission|readonly|quote|history" tests/transfer/validation-case-seven.test.ts`; expected missing entry/envelope RED.
- [ ] Implement fixed baseline checks before host prepare, claim, marker/root/envelope/decision publication or controller ownership. Validate snapshot3/ledger4/original run and prior probe reserve. Verify 14 old windows in order, 70 exact closures and 12 exact source-byte closure receipts, original six delegation prefix and role fee attribution. Require all owners idle, including all historical roots and shared recovery sentinels.
- [ ] Require historical C5 source/window/input pins and C5 stopped-manual result; C6 remains stopped with its original declaration/source/operator/result. C7 reads no historical coding journal/session/output as execution input. Historical coding fee rows remain accounting-only facts.
- [ ] Verify the clean pushed exact main identity, frozen input bytes, required source markers, approved/merge ancestry and actual C7 manifest bytes through COS56. Add Source57 and Source59 exact markers, not a generic READY substitute.
- [ ] Prepare base quote2 from the dynamically derived immutable C7 declaration, then create the C7 envelope binding that quote, snapshot hash/revision, grants, manifest digest and exact approvals. Return only in-memory quote/envelope/ref summaries with paidRequests0.
- [ ] Change a legal C6 amount with matching real synthetic reconciliation/closure; the vector and envelope must change. A previously built envelope/operator receipt must be rejected. Changing manifest raw bytes or approvals also invalidates the envelope. Record all preflight bytes, mtime and file sets before/after; target root/marker remain absent.
- [ ] Run the focused admission test GREEN. Reuse a single baseline for mutation matrices; restore exact bytes between scenarios.

## Task 3: Common lifecycle and atomic C7 claim

Files: shared entry lifecycle, C7 entry/run and focused admission/runtime tests.

- [ ] Write RED tests for fresh same-basis claim exactly once, stale envelope after host preparation, and consumed identity refusal. Count host prepare/bootstrap/SDK separately.
- [ ] Extract only the existing post-admission lifecycle from C6. Supply fixed case ID/parser, an admission preparer, native-host creator and immutable inherited task IDs. Preserve C6 public returned methods and baseline checks. Avoid public generic flags or arbitrary case/manifest/path selectors.
- [ ] C7 fresh run repeats the complete admission after host preparation, checks identical envelope hash, then immutably publishes the envelope/operator receipt and re-reads their actual bytes plus manifest. RunController atomically claims base quote2. Persist C7's exact origin/marker and own manifest reference. Historical14 cases, six delegation/12audit/fee/closure prefix, original run clock/parent/first auth and history files remain byte-identical.
- [ ] After claim, require one current window and the correct seventh delegation; total role grants are historical closed net plus derived current vector = original10m. No new money or old grant dispatch occurs. C7 planning only authorizes the existing bounded host worker.
- [ ] Run affected C6 lifecycle smoke/refusal coverage plus C7 claim GREEN; preserve C6 one-shot/cold behavior and report no actual provider activity.

## Task 4: Current C7 task, staging and immutable source closure

Files: C6 driver/task seams, C7 driver/task, input seam and task/driver tests.

- [ ] Write RED current task tests with own C7 declaration/requirement/window: preserve inherited C5 design/art IDs and complete refs, derive a fresh current coding ID/context/author, preserve policy/tools/acceptance/outputs/grant and reject an extra planner policy, wrong case/window/grant or historical coding input.
- [ ] Run `node --experimental-strip-types --test tests/transfer/validation-case-seven-task.test.ts tests/transfer/validation-case-seven-driver.test.ts`; expected missing factory/binding RED.
- [ ] Implement trusted task/driver factories described above. Keep the original C6 wrappers/definitions and canonical C6 execution data equivalent. C7 task uses the immutable admitted declaration, not a process-global dynamic grant value.
- [ ] Stage current fixed requirement separately; use the C7 manifest exact artifact ID/location/digest and C5 original roots/bytes. Build new current requirement/task/candidate/origin/plan refs through the existing COS56 host. Seal them before context/signature/author dispatch. Source54 file inventory and Source55 original-session build tool remain enabled for coding only.
- [ ] Bind current prepared tasks before author, cold resume and repair. The current source reader verifies source identity, actual admission/operator/manifest bytes, tracked fixed template bytes and current requirement/plan binding. Existing production source+compiled closure checks must include the new seam modules; detect a missing/unbound module rather than trusting only HEAD metadata.
- [ ] Write/read immutable C7 `execution-reused.json`; exact cold re-derivation checks bytes and policy without write/mtime change. Reject foreign root/window/deadline/case/task, changed grant/tool/plan/requirement/source/digest or imported incomplete old coding/session refs.
- [ ] Run task/staging GREEN and the short C6 task/bootstrap/scope smoke tests affected by seam changes. Compare old D6 canonical receipt and frozen hashes with base.

## Task 5: One combination representative and long timeout boundary

Files: new runtime fixture/test, compiled representative and README append.

- [ ] Create one authentic SOURCE/TEMP C5 two-PASS/seven-capture lineage for COS56 to read, plus a fully stopped/closed synthetic14-case baseline. Reuse already approved heavy C5/consumer/Edge/cap proofs. Do not generate the old native cases or C5 fee history repeatedly for every mutation test.
- [ ] Prefer an existing source fixture/data builder or a validated in-memory ledger/receipt constructor for old accounting history. It must pass `validateSnapshot`, original quote/hash/source checks and actual historical verifier reads. No fake historical callback is accepted as the composition proof. Synthetic records retain their own identities and are labeled as such; they are never represented as Root's history.
- [ ] Write RED representative: atomic C7 claim; one host bootstrap; current coding completes through real source role factory and produces a classified code defect; claim its one eligible repair; close/reopen actual owner; resume same case/window/deadline/envelope/execution; repair capture/host consumer/independent coding review/exact promotion. No planner/design/art SDK; logical contexts are coding,coding,reviewer. Passed current stages are not re-billed.
- [ ] Run only this new combination representative once to GREEN, retaining checkpoints for inspection. Use existing fake SDK/build/persistent-report transports through the actual production host/DAG. Do not rerun the 32-minute old C6 full composition or unaffected browser suites. If slow guards remain, report the measured current-window cost; do not introduce performance refactoring in this task.
- [ ] Assert native C7 host retains COS59 codingAuthorRequestTimeoutMs600000 and requestWindow current authority/deadline cleanup5000 for primary coding and coding repair. Reuse approved scaled COS59 streaming/stop/no-usage tests; run a short affected factory representative to prove current C7 routing. Other role/reviewer/intake cap and maxRetries0 remain unchanged; unknown later blocks dispatch/tools.
- [ ] Compile the new source entry and affected closure to TEMP using TypeScript rewriteRelativeImportExtensions, then import the compiled fixed runner and execute a short read-only refusal/task representative. Ensure the runtime host's actual source-input/compiled-input binding recognizes all new modules. No compiled test waits for a real long request or launches Edge.
- [ ] Append README with fixed C7 preflight/case commands, Root manifest/envelope responsibilities, actual unresolved refusal and source/TEMP status. Keep all old README bytes as a prefix.

## Verification and review handoff

- [ ] `node --experimental-strip-types --test tests/transfer/validation-case-seven.test.ts tests/transfer/validation-case-seven-task.test.ts tests/transfer/validation-case-seven-driver.test.ts tests/transfer/validation-case-seven-compiled.test.ts`: new boundary tests GREEN, no skipped failure, zero network SDK.
- [ ] `node --experimental-strip-types --test tests/transfer/validation-case-seven-runtime.test.ts`: exactly one new necessary composition GREEN. Raw evidence distinguishes synthetic transport from real normal-input browser proof.
- [ ] `node --experimental-strip-types --test --test-name-pattern="declaration|parser|derived|execution receipt|bootstrap|fixed case6 entry" tests/transfer/validation-case-six.test.ts tests/transfer/validation-case-six-task.test.ts tests/transfer/validation-case-six-driver.test.ts tests/transfer/validation-case-six-runtime.test.ts`: only affected short C6 smoke coverage; heavy existing composition excluded.
- [ ] `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions probes/transfer/validation-case-seven-run.ts tests/transfer/validation-case-seven.test.ts tests/transfer/validation-case-seven-task.test.ts tests/transfer/validation-case-seven-driver.test.ts tests/transfer/validation-case-seven-runtime.test.ts tests/transfer/validation-case-seven-compiled.test.ts`: exit0 for the actual affected source/test closure.
- [ ] `npm run typecheck`: exit0; use existing passing evidence for unaffected work and investigate only new failures.
- [ ] `git diff --check`: exit0. Strict UTF-8 decode all changed paths before edits; preserve LF/BOM style. Re-open Chinese README/test/plan content after changes and verify it renders. Compare original C1–6 run/declaration wrappers and frozen requirement/template bytes to base; internal C6 seam changes need equivalent short behavior and canonical data evidence.
- [ ] Commit exact implementation SHA(s) and report plan SHA, affected tests and timings, source/compiled evidence, old-byte preservation, any real-window performance gap, and actual C7/provider/human NONE. Independent reviewer first checks spec, then code quality. Fix actionable findings on this branch and rerun only affected verification; the sole merger integrates approved SHAs.

## Review checkpoints and remaining prerequisite

This commit is a plan only. No source changes begin until `PLAN_APPROVED`. The two architecture decisions above are agreed with Root; the reviewer must check whether the proposed seams and envelope cover the exact task without weakening C6 or quote2. Actual C7 admission remains blocked by the original unresolved C6 cost and missing closure12 until Root supplies authentic financial reconciliation, closure evidence, current approved main mapping and the C7 manifest. Source work neither resolves nor reinterprets those real prerequisites.

## Approved execution updates

- Independent `PLAN_APPROVED` applies to exact plan commit `ea1df224a444f13bc3445f5083e7751eb539500e`. Root approved the C7-specific actual execution closure module because the existing equivalent is private to the human path. The common factories stay in the existing C6 entry/driver/task files; there is no copied orchestrator or new product workflow.
- The C7 envelope also seals the exact old14 accounting prefix (old windows, six delegations,70 closures,12 audits and quote-basis request/fee rows). Current C7 rows are excluded. Scope readers re-read old closure source bytes; their hashes cannot be swapped while leaving the role total unchanged.
- Root approved test-only SOURCE/TEMP checkpoint replay. Setup `cosmos-transfer-entry-TLJJ6N` contains the genuine synthetic C5 two-PASS lineage and an exact before-C7 baseline SHA `0d7db5619c27d5a6001377f3cf7fb1761ef0f664e620cdc6a8cd5ee2bdd0196f`. The old setup helper was stopped because its already-loaded C7 modules preceded the final source edits; its C7 result is not final evidence. Eighty archived raw files, snapshot/operator/envelope/marker/root mapping and recovered ownership are retained under `.cosmos/SOURCE-stale-C7-setup/restore-manifest.json`. The original14 snapshot bytes match the old base quote's snapshot hash exactly. A fresh process uses frozen execution source and reuses the original C1–6 roots/journals/captures unchanged. This is synthetic fixture restoration only; actual C6/C7 are untouched.
- Candidate `991b0d8e1289142b358a0e23c03b4f7e57dd7403` passed the new full mechanism representative (1/1;1574865.5669ms test/1577918.5735ms process): readonly source/history/owner refusals, two legal14-case settled cost quotes, stale quote refusal, own coding/one repair/owner cold reopen and exact acceptedv2, logical coding/coding/reviewer. This proves the mechanism with synthetic transports. The independent reviewer found P1 because actual loaded Playwright children and compiler execution leaves were absent from the execution receipt;991 is not full source readiness. Its314 raw case files, snapshot/operator/envelope/root mapping and original14 SHA remain under `.cosmos/SOURCE-991-mechanism/mechanism-manifest.json`; raw TAP is `.cosmos/SOURCE-cos60-final-runtime-r2.tap`.
- The P1 fix stays in C7 source/entry/driver and tests: source-owned installed template baseline is derived from actual executing module layout; caller repository's fixed four config bytes must equal it. Preflight captures the fixed template lock, actual tsc/Vite entries and executable literal relative imports/requires without running CLIs or scanning vendor directories. Browser binding includes actual loaded Playwright CJS descendants, ESM wrappers and package roots. Bootstrap output and stage/current/cold/tool guards compare current C7 installed invocations/package metadata/lock and every relative executable closure byte to that baseline. Current framework/ledger schemas stay unchanged. Missing baseline or added/changed current closure refuses. Compiled/source mutation proof uses isolated TEMP package copies and a fresh helper process because Playwright prohibits loading two installations into one process.
- New focused files: `tests/transfer/validation-case-seven-source.test.ts`, `validation-case-seven-compiled.fixture.ts` and `validation-case-seven-binding.integration.ts`. The explicit binding integration uses the checked before14 SOURCE/TEMP seed to exercise actual preflight/claim/current tool/cold scope and immutable execution without rerunning the26-minute coding/repair mechanism or old C5 setup.

## Final author evidence

Production closure fix: `042ead093e89be0d4f9b980354615b93672ecb43`. Test-only complete-template fixture correction: `55d2c19a2b2b024832bfcbefda3fdf2f7d1aba84`, parent042. All production and test bytes remain frozen at55; later author changes in this plan are documentation evidence only. The task owns21 paths relative to approved main `bef8f5eb8d8af378b8627c6bee64799428cd2a5f`:10 probe source paths,2 documentation paths and9 test/fixture/integration paths. Original C1–6 declarations/run wrappers/requirements and README byte prefix were compared withfd5 and remain exact; internal C6 factory changes retain their canonical execution data and the four affected short C6 tests passed.

- Initial declaration/parser RED3/3 missing API→GREEN3/3; admission/envelope readonly RED2/2→GREEN; current task/bootstrap/execution missing-API RED→GREEN. Actual loaded Playwright child binding P1 RED named unbound `playwright/test.js`→GREEN. This is source/TEMP TDD; no paid provider call occurred.
- New focused source/task/staging/compiled/P1 suite:13/13,0fail0skip,22404.4433ms process, exit0. Raw `C:/Users/26557/AppData/Local/Temp/cos60-p1-focused-042ead0.tap`; its isolated source and compiled package/worker/template proof is retained at `C:/Users/26557/AppData/Local/Temp/cos60-compiled-AD42s5`. Actual TEMP Playwright CJS child, tsc `_tsc.js` and Vite `cli.js` byte mutations reject under both source and compiled guards; restore passes. Caller-template byte mismatch rejects. The earlier isolated representative raw is `C:/Users/26557/AppData/Local/Temp/cos60-p1-source-compiled-r3.tap` (1/1,14106.037ms test/17155.3393ms process).
- New amended binding integration under55:1/1,0fail0skip,178813.0161ms test/181820.1561ms process, exit0. Raw `C:/Users/26557/AppData/Local/Temp/cosmos-transfer-entry-TLJJ6N/.cosmos/SOURCE-cos60-p1-binding-55d2c19-r2.tap`. It authenticates the new actual receipt at preflight/claim, bootstraps the complete fixed template and actual TEMP tool packages, creates the production inherited host/current execution and coding author tools, rejects changed current tsc bytes before owned compiler dispatch without snapshot changes, closes/reopens the actual owner with the same window/deadline, rejects changed Vite bytes from cold scope, and preserves execution bytes/mtime. SDK prompt count is0, snapshot request count remains86. This is binding evidence; no game generation result is claimed by this short run.
- The prior55 binding attempts were test/setup failures (missing tracked `.gitignore`, then immutable same-hash envelope publication collision). Production correctly refused; failed raw reports and root/envelope/operator bytes remain in `.cosmos/SOURCE-042-binding-fixture-r1`. The test-only correction copies the complete declared template, and archived old setup receipts permit replaying the exact original14 seed without changing old history. No C5 stages or26-minute mechanism were rebuilt.
- The passed991 mechanism is read from `C:/Users/26557/AppData/Local/Temp/cosmos-transfer-entry-TLJJ6N/.cosmos/SOURCE-991-mechanism/case-seven-root/result.json` and `host-result.json`, with all314 original absolute file references mapped to SHA-checked archived files by `mechanism-manifest.json`. Its raw `.cosmos/SOURCE-cos60-final-runtime-r2.tap` remains unchanged. The current C7 directory holds the new short binding run and must not be presented as the991 generation result.
- Strict affected TypeScript closure and `npm run typecheck` exit0; `git diff --check` exit0. Changed files decode strictly as UTF-8/no BOM/LF; Chinese README reads back correctly. A Python console GBK display error was corrected by UTF-8 PowerShell readback; no file encoding or text bytes were changed by that display failure.

Known limits remain: actual C6 unknown974882 and Root's65 closed/11 audits are untouched; actual C7 claim/provider/billing/human result isNONE. Source readiness still requires the final independent review and sole merger. Synthetic SDK/build/browser transport proves the constrained mechanism and source bindings; it does not prove paid DeepSeek generation, normal-input browser gameplay, human experience or the complete classic game. The preserved991 current-source path took roughly26minutes in synthetic transport, so real45-minute window headroom remains a runtime consideration. The amended tool baseline must already be installed and match the fixed lock; missing baseline refuses preflight without installing tools or writing files.
