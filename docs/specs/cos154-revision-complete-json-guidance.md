# COS154: selected revision complete JSON read guidance

状态：Root直接批准description-only最小scope，无额外独立plan审批；SOURCE pending。作者revision_read_guidance_implementer，独立源码reviewer revision_read_guidance_reviewer正在独审固定候选，尚无SOURCE批准，native辅助author_budget_recovery_design，唯一merger planning_budget_merger。新增指引只是行为假设，不证明修订会开始编辑或解决零写入。

任务：[COS154 / #155](https://github.com/lrfluobida/Cosmos/issues/155)，id6102546054；原生父COS18/#19未勾，依赖[COS149 / #150](https://github.com/lrfluobida/Cosmos/issues/150)及[COS146 / #147](https://github.com/lrfluobida/Cosmos/issues/147)。runtime基线 `b5a4ba7b23040fbae04da1d1fc21a0923061c4e0`。

Root批准输入SHA256：spec `884bfb2d20249390623a760347b63d0b9c97810ff5d421b20c960f78f0740962`；plan `082305033b6583f463765dc727e86c90a65c3a728567de599289e1065864dea4`。

Root directly approved this bounded implementation; no separate plan approval or paid validation is requested. Runtime base: b5a4ba7b23040fbae04da1d1fc21a0923061c4e0. Implementer: revision_read_guidance_implementer. Sole merger: planning_budget_merger.

R20 evidence (`.cosmos/planning/design-revision-reuse20/diagnosis.md`) shows 23 reads, zero writes, six summaries and successful readonly budget finalization before the correct no_output_change guard. Its 54,324-byte plan was read in 13 numeric pages before an eventual complete 34,442-byte compact read. This is a guidance hypothesis, not evidence of a read/budget bug or proof that the model will edit.

Extend the existing factory read-description prefix from designReviewBudget to the already validated designRevisionJsonReads selection. Keep the reviewer prefix byte-for-byte identical; the revision prefix changes only "review" to "revision". Omit optional offset/limit, or use null when the schema requires them; never invent numeric defaults; page after actual truncation and for non-JSON or targeted raw-source anchors.

No new selector, tool, schema, permission, execute behavior, compaction algorithm, limit, SDK normalization, task rule, seeded writer guidance, budget/model/request/cap policy or runtime mutation. Initial authors, other roles, planning and validation remain unselected. Only src/roles/factory.ts and focused existing tests change. Private notes remain outside the source commit.

Acceptance: selected revision and reviewer metadata contain the exact respective prefixes; false/missing/error/nonboolean selectors and other profiles retain existing behavior; actual verified host revision is selected while an initial task with revision suffix is not; native strict nullable parameters still produce full token-preserving UTF-8 JSON and explicit numeric pages still return SDK raw text. Reuse prior COS146 helper/permission/boundary evidence. All activity is free local synthetic SOURCE work; real-model adoption needs a later authorized run.
