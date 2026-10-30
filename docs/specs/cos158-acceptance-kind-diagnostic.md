# COS158 acceptanceId diagnostics by step kind

状态：Root直接批准最小diagnostic scope，无额外独立plan审批。登记期间acceptance_kind_diagnostic_reviewer已对 `1b6a951b500b6a65c89fe45e86175fce6f627ac6` 独审APPROVED_SOURCE_SCOPED、无finding，Root精确批准唯一集成；当前集成/发布pending。作者acceptance_kind_diagnostic_implementer，helper author_budget_recovery_design仅FREE TEMP，唯一merger planning_budget_merger。

任务：[COS158 / #159](https://github.com/lrfluobida/Cosmos/issues/159)，id6112816276；原生父COS18/#19未勾，依赖[COS145 / #146](https://github.com/lrfluobida/Cosmos/issues/146)反馈基础。分支基线 `5c43c9c9b4531674f26b1f7e576a0cff96d83249`（runtime `bb25f37b93ff9408dba5685b5f1d45ad7a71df02`）。

Root批准输入SHA256：spec `9e87ed0b0f2cf2983dee03d1b19df67348edabe3dcb80c60ac0c2e895467f6d3`；plan `a17f7d8166ed6d38d3c63c60316e31ee363a1adfdf4576c1862d3622320c5014`；plan原始快照独立保留，后续执行checkbox/helper分派/candidate附记不覆盖批准稿。phase45已由用户明确批准并单次应用，C35976709µ/H0、旧run永久closed，当前无新paid准备。

Root authorized this bounded SOURCE task after R23's frozen trace showed input-only acceptanceId removal spreading to required assertion fields. The original validation was correct; diagnostic clarity is the only production change.

## Contract

- Add a bounded static hint to the existing single unknown-fields diagnostic only for mouse-click, mouse-move and locator-click steps whose own extra fields include acceptanceId. Explain that acceptanceId is forbidden for that input kind, but required on assert/wait-for; do not remove it globally. Preserve all unknown key names, order and issue count.
- At the existing assert/wait-for ID check, report an absent own acceptanceId as a missing required field and direct the author to the original criterion for that assertion. Present empty/null/undefined/unknown values retain Unknown acceptanceId. The original validity expression and covered.add remain unchanged.
- Both assert and wait-for require acceptanceId for text, visible and debug observations. Preserve all schema, predicates, coordinates, timeout, visible-boolean and read-only debug checks, coverage and first-error order.
- Do not echo arbitrary values or add autofill, repairs, tooling, canonical-ID changes, budget or runtime policy changes. Existing automatic feedback stays at eight groups / 4096 characters.

## Files and evidence

Production: src/acceptance/plan.ts only. Public regression fixtures: tests/acceptance/plan-kind-diagnostics.test.ts and tests/runtime/ordinary-design-diagnostics.test.ts. Private R23 evidence may use frozen source data in isolated TEMP output only, never alter the original run or ledger.

Success is scoped SOURCE diagnostics, not proof of a correct model repair, semantic gameplay or game completion. No provider calls, native 43-request replay, controller, ledger or actual run mutation. Independent reviewer and the sole planning_budget_merger remain responsible for review/integration.
