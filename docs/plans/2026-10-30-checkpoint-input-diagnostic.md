# Checkpoint Input-order Diagnostic Implementation Plan

状态：SOURCE范围完成。checkpoint_input_diagnostic_reviewer已对 `dc1f7ac4d5823e2a363489a3da8c30f2b687ccb9` 独审APPROVED_SOURCE_SCOPED、无finding，Root批准唯一merger发布 `0341094c8cc12179f0de3a303318227681f907d3`；[批准](https://github.com/lrfluobida/Cosmos/issues/156#issuecomment-6512079089)、[关闭](https://github.com/lrfluobida/Cosmos/issues/156#issuecomment-6512079682)及父[x]已GET。Root直接批准scope，无额外plan审批。main types/build0、4unique代表分2+2全过/0skip；只补筛选漏掉的2项，无source变更；作者15/18/types/build/strict、独审5600及真实R21反馈证据复用。

任务：[COS155 / #156](https://github.com/lrfluobida/Cosmos/issues/156)，id6103761381；原生父COS18/#19已勾（仅SOURCE，父仍open/partial），正式依赖[COS145 / #146](https://github.com/lrfluobida/Cosmos/issues/146)。[COS151 / #152](https://github.com/lrfluobida/Cosmos/issues/152)仅为TEMP局部插入演示参考，非新增依赖。runtime基线 `0305f2135d236dde827b90f06a386510be90f3d3`。

[R22结案](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-6512088069)：ordinary5首次design写入即有未转义HTML class引号，UTF8合法但JSONinvalid（line7/col83、JS字符串pos1095）；唯一edit只补括号，全部plan反馈被design解析先挡。COS155新branch0、COS154 revision未入，不提升或撤销未实测分支结论。计划显式142→11→0后重建134/18，afterStepId0，不是持续保全；plan单独还存在checkpoint observation类型错误，原运行未走到。普通87716B/8192报价240968µ>215509µ差25459µ，readonly89343B/4096报价211454µ成功；最终capture role-output-invalid_json，无review/game。

R22 planning2/39606µ、author38/574071µ，共40笔613677µ、释放4386323µ。2026-10-29 16:25:36.290Z→16:34:40.913Z的544623ms仅清理；16:40:57.251Z永久stop、16:41:04.806Z一次settle。独立PASS_CLOSED：child172 SHA `ca1576657170d9aabf71fea98a1ce71dcd427509d896a3359c4c9204a25df279`；shared3409 SHA `53eee86bbe912e0aee2fa95ac28f7dcf4631640144a6e48ad874690ba5f121ea`，C35395421µ/H0。phase40/ref、room12v2保持；下一完整5M exposure40395421µ超阶段395421µ，当前禁止新full-paid、未应用增额。证据 `.cosmos/public-validation/room-20261030-reuse-22/{generation-closure.json,generation-execution.json}`，只读诊断 `.cosmos/planning/initial-design-reuse22/diagnosis.md`；旧run永久closed，无新paid准备。

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
