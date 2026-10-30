# Structured Design Authoring Implementation Plan

状态：Root已读固定完整spec/plan并直接批准实施，无额外独立plan审批；SOURCE pending。作者structured_design_implementer，独立源码reviewer structured_design_reviewer待候选审actualdiff，尚无SOURCE批准，唯一merger planning_budget_merger。下方原计划的准备/等待follow-up措辞保留原批准快照语境，当前实施授权以本状态为准；不授权付费或恢复旧run。

任务：[COS156 / #157](https://github.com/lrfluobida/Cosmos/issues/157)，id6111163694；原生父COS18/#19未勾，依赖[COS147 / #148](https://github.com/lrfluobida/Cosmos/issues/148)结构化writer基础。runtime基线 `0341094c8cc12179f0de3a303318227681f907d3`。遵循既有ADR0005，无新ADR/CONTEXT。

Root批准输入SHA256：spec `ae4371a241d995f17d4b8e9b407ca0f71d9702d3781adcc4a9e09c0873b2bb1f`；plan `efe434cd020b71e1d29839805df750bc8dd57d9d516f33a316886bb7c5e88774`；原批准快照保留。phase40/C35395421µ/H0不变，下一完整5M exposure40395421µ超395421µ，当前禁止新fullpaid，增额未批准。

> **For agentic workers:** Use superpowers:executing-plans to implement this approved plan task-by-task. The dedicated implementer commits; Root assigns the separate-context reviewer; only planning_budget_merger integrates. Do not begin source edits before Root's plan follow-up.

**Goal:** Add a fixed-path structured design draft writer while preserving every legacy authoring selection and the existing acceptance gates.

**Architecture:** Add `write-game-design` beside the existing plan writer, extract only its proven JSON-data safety checker, and extend the already frozen policy field with `structured-design-plan/1`. Existing host guards, scoped filesystem writer, feedback, revision binding and Pi sequential execution remain the authorities.

**Tech Stack:** TypeScript, Node 22, existing Pi SDK 0.99.2 and TypeBox; node:test and TEMP fixtures; no new dependencies or real provider calls.

## Files and constraints

Worktree: `E:/CodexData/.codex/worktrees/cos-02-contracts/Cosmos`; branch `codex/structured-design-authoring`; baseline `0341094c8cc12179f0de3a303318227681f907d3`.

Expected production paths (all relative paths below are in that absolute worktree):

- Create `src/runtime/structured-author-json.ts`: extracted JSON-only validator with caller-specific label; retain all original plan error messages.
- Create `src/runtime/entrypoint-design-authoring.ts`: fixed design path, section list, new rule, save/set schema and writer.
- Modify `src/runtime/entrypoint-plan-authoring.ts`: delegate original JSON checker, extend policy union/validation; leave old tool description, schema, behavior and rule unchanged.
- Modify `src/runtime/entrypoint-host.ts`: register new tool/rule only under the new policy and reuse original guard/feedback/ownership.
- Modify `src/runtime/entrypoint.ts`: select new value only for eligible new runs; continue persisted original selection on resume.
- Create `tests/runtime/ordinary-structured-design-tool.test.ts` and `tests/runtime/ordinary-structured-design.test.ts`.
- Modify `tests/runtime/ordinary-structured-plan.test.ts` only for new-default assertions and focused compatibility assertions; narrowly extend `tests/runtime/ordinary-design.fixture.ts` if needed to construct truly frozen old-policy fixtures, not production escape hatches.

No expected edits to validators, provider implementation, budget machinery, `CONTEXT.md`, tracked progress/spec/issue metadata or historical actual files. Formal state documentation belongs to the merger. If inspection reveals a necessary additional source path, report the concrete reason to Root before broadening the patch.

## 1. Confirm baseline and write RED tests

- [ ] Recheck clean branch/base; strict UTF-8 decode every existing target before editing, record BOM and line endings, announce actual target paths. Stop on non-UTF-8. Read the approved spec and AGENTS rules.
- [ ] Add low-level tool tests against the planned `createGameDesignWriter`: save plain object; set each of six sections; nested HTML double quotes, single quotes, backslashes, newlines and Chinese survive JSON.parse exactly; unrelated sections and their nested values survive set.
- [ ] Cover explicit whole-object/whole-section replacement, empty/incomplete drafts, existing invalid fields preserved, BOM/CRLF, missing/bad JSON/non-object set failures, explicit save replacing syntactically invalid JSON encoded in valid UTF-8, and refusal of non-UTF-8 bytes.
- [ ] Cover unknown/inapplicable operation fields and section names; model path/authority/reference arguments; cycles, non-JSON primitives, accessors, custom toJSON/prototypes, symbols, non-enumerables and sparse arrays. Verify no write/feedback on rejection and getters/toJSON are not executed.
- [ ] Cover guard denial before operation and immediately before write, aborted signal, file/directory symlink escape and original scoped read-only/ownership restrictions. Assert `readOnly:false` and `executionMode:'sequential'`.
- [ ] Run `node --experimental-strip-types --test tests/runtime/ordinary-structured-design-tool.test.ts`; expected RED from missing new module/export before implementation.

## 2. Implement the smallest structured writer

- [ ] Extract the existing `requireJson` body into `structured-author-json.ts`, parameterizing only its label; keep plan wrapper/call behavior and exact messages. Run existing `ordinary-structured-plan-tool.test.ts` to detect extraction regressions.
- [ ] Implement `createGameDesignWriter({workspace,seededRevision?,guard,afterFileWrite})`. Reuse `regularFile`, fatal decoder and `createWorkspaceTools` fixed-path write. Apply only the operations and minimal shapes in spec; no JSON repair, deep merge, schema replication or general path API.
- [ ] Preserve existing newline/BOM on serialization using `JSON.stringify(value,null,2)`; check guard/cancellation before read work and before delegated write. Call original feedback after successful write, and describe saved output as an unapproved draft.
- [ ] Add initial/revision description text that explicitly distinguishes whole object save and whole selected section replacement; revision selection comes from host input only. Keep raw tools available.
- [ ] Run both low-level tool test files; expected PASS, old plan behavior unchanged. Inspect focused diff and re-open UTF-8 Chinese fixtures.

## 3. Freeze and wire the policy with RED-to-GREEN compatibility

- [ ] Add matrix tests for undefined / `structured-plan/1` / `structured-design-plan/1`: exact expected rules/tools, other roles denied, unknown values, missing/duplicate markers, mismatched receipts, both markers removed, and new-to-old downgrade with residual new surface fail closed. Arbitrary brief text and misleading task suffix do not select the tool.
- [ ] Extend the policy type and existing reader/task checks. Keep `ORDINARY_PLAN_AUTHORING_RULE` byte-identical; new selection adds one independent canonical design rule plus one tool. Never change legacy canonical strings or infer policies.
- [ ] Wire eligible new-run selection and write-once receipts. Host requires original design-path ownership and uses the existing guard plus `check.afterFileWrite`. No new budgets, grants, caps, request limits or requirement references.
- [ ] Add TEMP host tests for old absent-policy resume and explicit old-policy resume retaining frozen task bytes/tools/rules; new-run persistence and interrupted planning remain fail-closed without replanning. Exercise both old/new revisions with original task binding and unchanged seeded capture input.
- [ ] Test valid save reaching advisory feedback, incomplete/schema-invalid draft failing capture, invalid checkpoint objects still failing, and independent review rejection withholding candidate acceptance. Tool success must not alter controller accounting/approval snapshot.
- [ ] Test real factory denial after authority/source/attempt/workspace changes and readonly finalization having no writable tool. Reuse existing budget finalization fixture; no full budget simulation matrix.
- [ ] Run `node --experimental-strip-types --test tests/runtime/ordinary-structured-design.test.ts tests/runtime/ordinary-structured-plan.test.ts tests/runtime/revision-draft-guidance.test.ts`; expected PASS. Keep existing rule-dependent revision expectations valid by preserving the old rule in new selection.

## 4. Native SDK boundary and final verification

- [ ] In the new host test file, use actual factory and `createPiSession` with globally mocked fetch, synthetic credentials and TEMP root. Emit an R22-shaped structured payload containing `class="item item-crystal"`, Chinese and newlines, not a repaired copy of the original invalid file.
- [ ] Send save followed by at least two distinct-section set calls in one native reply. Confirm the provider-visible schema and real tool results, SDK nullable optional normalization, sequential execution and final file retaining both changes. Include an inapplicable field rejection. Keep independent reviewer rejecting so tool success cannot masquerade as accepted game output.
- [ ] Assert only fake fetch is invoked, real source/ledger/run paths are untouched, no browser gameplay claims, and complete strict capture/review boundaries still execute where the fixture reaches them.
- [ ] Run `npm run typecheck`, `npm run build`, and `git diff --check`; expected exit 0.
- [ ] Strict-check all new/edited tests with `node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --verbatimModuleSyntax --skipLibCheck --allowJs --types node tests/runtime/ordinary-structured-design-tool.test.ts tests/runtime/ordinary-structured-design.test.ts tests/runtime/ordinary-structured-plan.test.ts tests/runtime/ordinary-design.fixture.ts`. Expected no new diagnostics; preserve and attribute any proven pre-existing transitive baseline diagnostics rather than weakening flags.
- [ ] Run focused affected regression once: `node --experimental-strip-types --test tests/runtime/ordinary-structured-design-tool.test.ts tests/runtime/ordinary-structured-design.test.ts tests/runtime/ordinary-structured-plan-tool.test.ts tests/runtime/ordinary-structured-plan.test.ts tests/runtime/revision-draft-guidance.test.ts tests/runtime/ordinary-design-write-feedback.test.ts`. Reuse still-valid read-only/finalization evidence unless changed wiring requires its selected representative.
- [ ] Re-open changed UTF-8 text and inspect Chinese, BOM/line endings and diff; commit only task source/tests. Report exact SHA, changed paths, test commands/results and known gaps to Root for independent actual-diff specification then quality review. Fix findings only in this branch and rerun affected checks; do not merge or push main.

## Evidence limits

No test result claims real model adoption, R22 repair, generated gameplay, human acceptance or paid validation. Source completion waits for Root's independent review and the unique merger. Original R22 evidence and current phase40 balance remain untouched. This prep turn ends after writing and hashing spec/plan; no implementation is authorized by these unchecked steps alone.
