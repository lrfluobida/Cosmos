# Checkpoint Input-order Diagnostic Implementation Plan

状态：Root直接批准最小checkpoint诊断scope，无额外独立plan审批；SOURCE pending。作者checkpoint_input_diagnostic_implementer，独立源码reviewer checkpoint_input_diagnostic_reviewer负责actualdiff、尚无SOURCE批准，native辅助author_budget_recovery_design，唯一merger planning_budget_merger。

任务：[COS155 / #156](https://github.com/lrfluobida/Cosmos/issues/156)，id6103761381；原生父COS18/#19未勾，正式依赖[COS145 / #146](https://github.com/lrfluobida/Cosmos/issues/146)。[COS151 / #152](https://github.com/lrfluobida/Cosmos/issues/152)仅为TEMP局部插入演示参考，非新增依赖。runtime基线 `0305f2135d236dde827b90f06a386510be90f3d3`。

Root批准输入SHA256：spec `b0516f10b2aa876e17769bd986405efba525866e670e4d807c9198e8f45b6433`；plan `db0cd09fb18104bc6177355301a74b48e0a1aceecff51f75a60b704e5c7c3bdb`；原批准快照保留。

> This is the dedicated implementation subtask of the Root-managed workflow. Root's scope approval is already present. Independent review follows the frozen source candidate; only planning_budget_merger integrates it.

**Goal:** Distinguish a checkpoint match missing normal click precedence from a missing checkpoint match.

**Architecture:** Share the existing observation/expected match predicate inside the current guard, preserving its acceptance and error priority. Add a bounded data-only diagnostic exclusively to its matching-but-no-prior-click branch.

**Tech Stack:** TypeScript, Node 22 node:test, existing validator and automatic write feedback.

- [x] Verify clean managed worktree, branch from `0305f2135d236dde827b90f06a386510be90f3d3`, inspect repository rules, related source and R21 diagnosis.
- [x] Detect UTF-8/LF before editing existing source/test files.
- [ ] Add focused failing tests in `tests/runtime/checkpoint-input-diagnostic.test.ts`; obtain actual R21 ordinary20 prefix for a private immutable reproduction test.
- [ ] Add an actual file-tool/afterFileWrite regression in `tests/runtime/ordinary-design-write-feedback.test.ts`.
- [ ] Run the new tests on unchanged production source; save expected RED logs.
- [ ] Minimal patch of `src/roles/requirements.ts`; keep all other production files unchanged.
- [ ] Run focused GREEN tests and affected existing checkpoint/automatic-feedback checks once. Run `npm run typecheck`, `npm run build`, strict typecheck for changed tests, and `git diff --check`.
- [ ] Reopen edited UTF-8 text, verify Chinese and LF, record exact commands/outcomes in private `verification-index.json`.
- [ ] Commit source/tests, freeze exact SHA, notify Root and merger for independent review. Do not merge/push.

The real-trace reproduction and any optional local insertion use copies in TEMP only. Preserve the R21 source and explicitly separate source acceptance from actual game/model outcomes. Reuse unchanged passing evidence; rerun affected checks only after a material change.
