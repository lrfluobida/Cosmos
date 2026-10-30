# COS157 Public Validation Phase Successor Implementation Plan

状态：SOURCE范围完成。phase_successor_reviewer已先DESIGN_APPROVED，再对 `26a11bed54b5fbaf4fceec4c2056f936e9b21d45` 独审APPROVED_SOURCE_SCOPED、无finding；Root批准唯一merger与COS156组合发布 `bb25f37b93ff9408dba5685b5f1d45ad7a71df02`。[批准](https://github.com/lrfluobida/Cosmos/issues/158#issuecomment-6512808268)、[关闭](https://github.com/lrfluobida/Cosmos/issues/158#issuecomment-6512808747)及父[x]已GET。main types/build0、组合4/4、0skip，C1577+C15610 approved union17 exact；仅SOURCE/TEMP，非真实预算批准。原准备措辞保留为批准前快照，不新增设计gate。

任务：[COS157 / #158](https://github.com/lrfluobida/Cosmos/issues/158)，id6111325804；原生父COS18/#19已勾（仅SOURCE，父仍open/partial），依赖[COS143 / #144](https://github.com/lrfluobida/Cosmos/issues/144)。runtime基线 `0341094c8cc12179f0de3a303318227681f907d3`。沿ADR0001同一权威账本，无新ADR。

组合main typecheck/build0，有限4/4、0skip、TAP6991.3404ms：旧40不变、三代funding/latest source与历史reserve/settlement、原/新apply在held及后续结算后的无写精确重试，加COS156真实factory/Pi native save+2set。复用作者final new12、旧phase10、funding5、CLI4/types/build/strict；早期22包含new12+old10，production字节未变、后续仅new-test narrowing，不能再加22+12。独审TEMP1/1验证baseline phaseHistory字节/未知snapshot字段/原receipt/hash/三代source/held重试无写。COS156的55distinct及单列finalization证据按原边界保持。

[实际phase45应用](https://github.com/lrfluobida/Cosmos/issues/158#issuecomment-6514232685)：用户明确批准quote `pvpsq1-dad2d34bc052d4b2a5bae1df28b57eb8c4be418d9aece1dff635cded695dcfec` 的40M→45M；决定 `public-phase3-20261030-budget`，文件SHA `c1303f8d6104f5000cc4415a805622c748cd0723756e9f303c0ac93d87764e9e`。2026-10-30T02:37:34.305Z单次apply，shared3409→3410、SHA `919f61fc8124ab15e0068e0e875080202424917e00e515eff10da9bd300ab497`。Root后续只读兼容审计及应用独审已分别PASS_READ_ONLY_COMPATIBILITY/PASS_APPLIED_ONLY；原40M receipt和123份来源字节保持，应用只追加successor/event/revision，当时C35395421µ/H0且activationAllowed=false，不启动运行。原150M lifetime/每次5M30min保持；SOURCE批准与用户预算决定分别留证。

R23 planning3/52501µ、author40/528787µ，共43笔581288µ、释放4418712µ。02:45:33.043Z→02:53:56.503Z的503460ms仅清理，03:02:50.930Z永久stop、03:02:56.588Z一次settle。独立PASS_CLOSED：child184 SHA `1e050c2353d1c34792eed1fb67e1716e7fe630bfce349b3d0ce2badf6ec6e7b1`；shared3412 SHA `d7b08c7deaa30c8b4a6410eea72b1ac5907308db47c3fac70dd4c8a7d17db135`，C35976709µ/H0、phase45、room12v2不变。证据 `.cosmos/public-validation/room-20261030-reuse-23/{generation-closure.json,generation-execution.json}` 和 `.cosmos/planning/initial-design-reuse23/diagnosis.md`；无新paid准备，不重复apply或重开旧run。

设计批准输入SHA256：spec `03e603f57f23b0f7a40b147c49ccef1b52a9431ae650f05831793cd790381892`；plan `494757eeebc603f4dababd60e3e2e13f6261a51bf5c09cfec29d3434b7081927`；原批准快照保留。设计批准时phase40为原基线；后续用户对精确quote明确批准45M并单次apply，现有决定/审计及R23结案记录见上。没有自动默认增额。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. This preparatory turn ends before tracked source changes; Root owns the design review gate.

**Goal:** Add one explicitly decided successor to the original public-validation 30M→40M phase while preserving every original receipt, funding reference and stopped execution boundary.

**Architecture:** Keep the immutable original extension and append one separately typed successor receipt. Reuse the existing snapshot/source/idle/funding paths; historical funding resolves its own phaseDecisionId, fresh funding selects the latest effective phase.

**Tech Stack:** Existing TypeScript/Node 22, node:test, SnapshotStore and SHA256 helpers; no new dependencies, UI, ledger schema or controller.

---

## Inputs and work boundary

- Approved input candidate: `E:/develop/Cosmos/.cosmos/planning/public-validation-phase-successor/spec.md`; freeze its SHA256 and this plan's SHA256 after Root's independent design review.
- Base: `0341094c8cc12179f0de3a303318227681f907d3`.
- Implementer worktree: `E:/CodexData/.codex/worktrees/cos-01-reference/Cosmos`; branch `codex/phase-successor-budget`; original `codex/budget-media-revision-integration` branch retained.
- Sole merger: `planning_budget_merger`; implementer commits source only on the dedicated branch. Root assigns an independent reviewer with separate context; it reviews actual diff, spec first, then quality.
- All mutations/tests use source or newly created canonical absolute TEMP roots. No real shared-root prepare/apply, controller opening, ledger mutation, funding reservation, provider, root run or budget approval is permitted.
- Source publishing leaves the real phase40 receipt and 40M limit unchanged. Root's current C=35,395,421µ/H=R=U=0/revision3409 facts are supplied context, not freshly audited by this preparation.

## Exact files

Under `E:/CodexData/.codex/worktrees/cos-01-reference/Cosmos/`:

| File | Responsibility |
| --- | --- |
| `src/runtime/public-validation-phase-types.ts` | New distinct successor quote/decision/receipt; retain old literal protocol unchanged |
| `src/runtime/public-validation-phase-extension.ts` | Narrow prepare/apply entrypoints using current idle/source/atomic-store logic |
| `src/runtime/public-validation-phase-validation.ts` | Two frozen histories, strict successor validation/source, phase selection and historical authorization resolution |
| `src/runtime/public-validation-funding.ts` | Explicit original phase lookup for history; newest phase binding for fresh funding |
| `src/runtime/run-types.ts` | One optional receipt and one event literal |
| `src/runtime/run-validation.ts` | Admit the one successor event; existing phase validation entrypoint validates both receipts |
| `tests/runtime/public-validation-phase-successor.test.ts` | New offline production-path tests; local small helper around existing fundingFixture |

Do not edit existing source/test fixtures solely for convenience. Do not modify unrelated Chinese text, formatting or line endings. Before edits decode target bytes with fatal UTF-8, identify BOM/newlines, and stop on non-UTF-8; after minimal patches reopen every edited file. Tracked spec/plan/task metadata placement belongs to the Root/merger handoff after approval, not this preparation.

## Task 1: Lock the regression contract

- [ ] Record the approved design/plan hashes and verify the branch/base and clean worktree before implementation.
- [ ] Read existing COS143 phase tests and `fundingFixture`, `fundedIntake`, `chargeIntake` helpers; reuse them with new canonical TEMP roots. New helper asserts shared and repository roots are under `tmpdir()` before any mutating API.
- [ ] Add a minimal failing test named `successor source upgrade leaves an existing forty phase unchanged`: create a synthetic legacy phase through existing APIs, validate/read it with the candidate, check current limit remains 40M and no successor/event is produced.
- [ ] Add failing `successor prepare is readonly and requires an explicit bounded target`: no missing original receipt, no implicit target, reject non-safe integer/NaN/40M-or-less/>150M, accept 40M+1 and 150M; compare snapshot/source bytes/directory entries and make SnapshotStore.acquire throw during prepare.
- [ ] Run new tests once to establish RED from the missing successor implementation, retaining the failure output. No full-suite or paid baseline run.

Command from the assigned worktree:

```powershell
node --experimental-strip-types --test tests/runtime/public-validation-phase-successor.test.ts
```

Expected initial result: the new export/behavior is absent; not an environment or fixture failure. Existing 30M/40M evidence is reused until a changed path needs a representative regression.

## Task 2: Add strict one-successor state and history

- [ ] Add the exact types from spec; target is required number, protocol and from/lifetime/per-run/time literals remain strict.
- [ ] Add optional `publicValidationPhaseSuccessor` and event `public_validation_phase_successor_applied` to run types/event allow-list.
- [ ] Preserve old `phaseHistory` output by removing both phase receipt fields. Add narrowly scoped successor history reconstruction preserving the original receipt and truncating only at successor basis counts. Reuse internal prefix mechanics without changing legacy hash order/output.
- [ ] Validate predecessor IDs, serialized receipt hash, original source hash, exact event, basis ordering and all source/decision field allow-lists. Reject successor without original, duplicate events, impossible count ranges, or patched legacy receipt/history.
- [ ] Implement validated effective limit selection: successor target, otherwise original40, otherwise30. No existing caller ceiling constants or original dispatch declaration changes.
- [ ] Test `successor preserves original receipt and all three funding generations` with real synthetic pre-extension and phase40 closed funding. Preserve original receipt serialization, original external source bytes, ledger/allocations/cases/tasks and both historical funding records exactly. Mutated tags, predecessor/hash/history/event/counts must fail.

## Task 3: Implement readonly quote and atomic explicit apply

- [ ] Add `preparePublicValidationPhaseSuccessor({ root, repositoryRoot, toMicroCny, now? })` to the existing phase extension module. Reuse canonical root/idle/source checks and exact before/after snapshot bytes; no store acquisition in prepare.
- [ ] Require original phase40, no successor, stopped original/cases, closed public fundings, zero held/reserved/unknown, no owner/registry writer, no overrun, and valid original sources. Preserve stopped-case running labels under existing ownership proof.
- [ ] Create quote basis from current bytes/revision/amounts/counts, successor frozen history, and predecessor. Hash the full ordered payload for `pvpsq1-...`; validate before returning.
- [ ] Implement strict independent source-file verification for `operator-public-validation-phase-successor-decision/1`, exact quote and exact original phase sourceRef, distinct consumed identity and permitted time.
- [ ] Add `applyPublicValidationPhaseSuccessor({ root, repositoryRoot, quote, decision, now? })`: acquire the original shared store; validate state/source and exact retry first; reject reused IDs or stale basis; recompute equal quote under owned idle checks; recheck sources/bytes; append only receipt/event/revision and validate/write.
- [ ] Test `successor rejects stale authority sources and unresolved history`: changed revision/raw bytes/history, missing/altered original source, new decision source drift, active case, missing original stop, unknown/reserved/held, overrun, original/shared/funding-child owner and registry writer, wrong root/ledger/lifetime and malformed target. No mutation after each rejected operation.
- [ ] Test `successor retries preserve the sole receipt after committed lost response`: throw after successful store write, retry identical input, assert same receipt and event count; changed target/quote/decision/source or second prepare fail.

No production quote or decision files are created. Synthetic decision-file writer stays inside test TEMP roots.

## Task 4: Preserve historical source selection and gate new funding

- [ ] Extend `requirePhaseFundingAuthorization(state, authorization, phaseDecisionId?)`: omitted means newest receipt for fresh funding; supplied means exact known original phase, never fallback. Reject use of either phase decision ID as funding decision.
- [ ] In sharedSources, pass each tagged historical record's stored phaseDecisionId; retain untagged pre-extension behavior. Verify both phase source files and all original funding/settlement/operator/closure/supplement sources.
- [ ] In fresh reservation, tag the new record with successor ID when present, otherwise original ID. Existing-record idempotency keeps its original binding/tag and cannot reserve a new grant.
- [ ] Test `successor new grants use latest authority while closed history remains auditable`: new missing/old/wrong sourceRef, early decidedAt, reused phase/funding IDs, >5M or >30min fail; correct new source passes. Old pre-extension and phase40 authorization/settlement replay succeeds unchanged through accounting-only paths, and dispatch remains rejected for all closed records.
- [ ] Test `successor cumulative grants and settlement obey the selected ceiling`: after synthetic history above35M, source alone rejects a full5M under40; explicit TEMP45 permits it; held grants count; exact target boundary passes and one micro above fails; total150 allocation capacity remains binding. Use production reserve/intake charge/stop/settle, no mock successful settlement.
- [ ] Test pending reserve/admit sees changed original or successor source before transport; transport counter stays0. Restore source bytes only within TEMP before cleanup.
- [ ] Verify original `applyPublicValidationPhaseExtension` exact-input retry after successor and after later grant/settlement returns its original receipt without resetting effective target; likewise successor apply retry remains exact and append-free.
- [ ] Test old fixed-case prepare/claim/reserve/admit/continuation remain blocked, preserving the prior stopped-case running task bytes.

## Task 5: Focused verification and independent review

- [ ] Run the new successor file to GREEN; retain TAP and nonzero failures, with exact source SHA and environment. Do not hide a failure by broad reruns.
- [ ] Run old phase tests because their history/source paths changed; run limited funding/CLI regressions for sharedSources/accounting/binding. Existing unrelated browser/provider/game tests retain valid evidence.
- [ ] Run typecheck/build once after candidate stabilizes. Inspect `git diff --check`, reopen UTF-8 files, and confirm only seven intended files changed.
- [ ] Commit the complete reviewed candidate branch; report exact SHA, test totals/duration, source-only scope and known gaps. Root assigns independent actual-diff review; implementer fixes actionable findings on the same branch, reviewer checks affected delta.

Commands:

```powershell
node --experimental-strip-types --test tests/runtime/public-validation-phase-successor.test.ts tests/runtime/public-validation-phase-extension.test.ts
node --experimental-strip-types --test --test-name-pattern='a stopped public intake|parallel whole-run claims|committed settlement|legacy operator and allocation closure|real ledger5' tests/runtime/public-validation-funding.test.ts
node --experimental-strip-types --test --test-name-pattern='v2 source drift|funded public new preserves' tests/cli/public-validation-funding.test.ts
npm run typecheck
npm run build
git diff --check
```

Expected: selected tests pass, zero unexpected selected skips, both compiler commands exit0, whitespace check clean. Record filtered-out tests separately; do not count them as executed evidence. If representative tests require `COSMOS_TEMPLATE_ROOT`, set it to the absolute existing `E:/develop/Cosmos/templates/2d` as read-only input. No fixture may fall back to a real run/root or credentials.

## Task 6: Merger and subsequent proposal handoff

- [ ] Sole `planning_budget_merger` checks the independently approved SHA, combines it with stable main, runs short affected integration checks, and records exact merge/source equality and inherited evidence. It alone integrates into main/pushes.
- [ ] Only after independent SOURCE approval, Root may separately authorize a pure read audit of real snapshot and original sources. Do not acquire a controller/registry/store owner on real roots. A byte-identical snapshot copy under an explicitly verified absolute TEMP path may be passed only to pure validation; unchanged source references may be checked only by read-only code. Do not rewrite/rebind/rehash real history into synthetic authorization. Every mutating scenario uses a fresh wholly TEMP fixture and wholly TEMP synthetic sources, never a copied real ledger with live-root references.
- [ ] Source-upgrade evidence must show the unmodified real state still resolves to40M with original extension/source, C/H/R/U and no successor. Any failed compatibility check stops progression; do not repair real history.
- [ ] After stable main, Root alone prepares a current real readonly successor quote and presents its precise target, current basis and original150M/per-run5M/30min limits to the human. 45M is only a possible proposal. A stale quote must be freshly prepared and decided, never silently rebound.
- [ ] Actual apply/new funding/new run belong to a separately explicit human budget decision and run readiness. This task ends at SOURCE readiness and reviewable proposal support, with no budget increase, provider call or reopening of closed cases.

## Preparation completion record

This preparation created only the two ignored files at `E:/develop/Cosmos/.cosmos/planning/public-validation-phase-successor/`. No tracked implementation file changed, no tests executed, no actual quote prepared and no runtime state mutated. Root design review is the next step.
