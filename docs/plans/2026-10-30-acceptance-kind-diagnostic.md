# COS158 acceptanceId diagnostics Implementation Plan

状态：Root直接批准最小diagnostic scope，无额外独立plan审批。登记期间acceptance_kind_diagnostic_reviewer已对 `1b6a951b500b6a65c89fe45e86175fce6f627ac6` 独审APPROVED_SOURCE_SCOPED、无finding，Root精确批准唯一集成；当前集成/发布pending。作者acceptance_kind_diagnostic_implementer，helper author_budget_recovery_design仅FREE TEMP，唯一merger planning_budget_merger。

任务：[COS158 / #159](https://github.com/lrfluobida/Cosmos/issues/159)，id6112816276；原生父COS18/#19未勾，依赖[COS145 / #146](https://github.com/lrfluobida/Cosmos/issues/146)反馈基础。分支基线 `5c43c9c9b4531674f26b1f7e576a0cff96d83249`（runtime `bb25f37b93ff9408dba5685b5f1d45ad7a71df02`）。

Root批准输入SHA256：spec `9e87ed0b0f2cf2983dee03d1b19df67348edabe3dcb80c60ac0c2e895467f6d3`；plan `a17f7d8166ed6d38d3c63c60316e31ee363a1adfdf4576c1862d3622320c5014`；plan原始快照独立保留，后续执行checkbox/helper分派/candidate附记不覆盖批准稿。phase45已由用户明确批准并单次应用，C35976709µ/H0、旧run永久closed，当前无新paid准备。

> For agentic workers: this assigned implementer executes the Root-approved scope; acceptance_kind_diagnostic_reviewer independently reviews the exact commit; planning_budget_merger alone integrates it.

**Goal:** distinguish forbidden input acceptanceId fields from missing required assert/wait-for fields without changing validity.

**Architecture:** reuse the existing keys and ID check locations in src/acceptance/plan.ts. Add an optional static hint to the existing key error, and select the existing ID error message by own-field presence. Existing design writer/checker propagates the diagnostics unchanged.

**Tech Stack:** TypeScript, node:test, existing ordinary design writer/checker.

- [ ] Add small public unit fixtures in tests/acceptance/plan-kind-diagnostics.test.ts covering all three input kinds, unknown key grouping, all assertion/observation combinations, missing versus present invalid values, unchanged guards and issue order. Add a real writer/afterFileWrite fixture in tests/runtime/ordinary-design-diagnostics.test.ts.
- [ ] Run the new fixtures on baseline and preserve RED output showing missing diagnostics only.
- [ ] Make the minimal src/acceptance/plan.ts patch; re-open UTF-8 text and preserve existing line endings and Chinese text.
- [ ] Run new fixtures plus affected existing acceptance plan and ordinary feedback tests once. Use node --experimental-strip-types --test with explicit paths; preserve TAP logs.
- [ ] Reuse the frozen R23 prefix/final helper in TEMP to show original invalid diagnostics, 6 input removals plus 8 original-ID restores, and subsequent guards. Do not replay the native SDK or make model calls.
- [ ] Run npm run typecheck, npm run build, strict TypeScript checking for the new/affected tests, and git diff --check; preserve commands and logs in verification-index.md.
- [ ] Commit only production source/public tests, report exact SHA and evidence to Root/reviewer/merger, and freeze the implementation branch pending independent review.
