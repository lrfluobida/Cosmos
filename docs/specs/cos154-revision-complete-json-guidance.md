# COS154: selected revision complete JSON read guidance

状态：SOURCE范围完成。revision_read_guidance_reviewer已对 `cbe41a66f53148f7f4067f7d44a6ac4659bc97a5` 独审APPROVED_SOURCE_SCOPED、无finding，Root批准唯一merger发布 `0305f2135d236dde827b90f06a386510be90f3d3`；[批准](https://github.com/lrfluobida/Cosmos/issues/155#issuecomment-6501713763)、[关闭](https://github.com/lrfluobida/Cosmos/issues/155#issuecomment-6501715652)及父[x]已GET。Root直接批准scope，无额外plan审批。main typecheck/build0、有限4/4、0skip；作者exact12/types/build/strict与native独审证据复用，reviewer前缀字节保持。

任务：[COS154 / #155](https://github.com/lrfluobida/Cosmos/issues/155)，id6102546054；原生父COS18/#19已勾（仅SOURCE，父仍open/partial），依赖[COS149 / #150](https://github.com/lrfluobida/Cosmos/issues/150)及[COS146 / #147](https://github.com/lrfluobida/Cosmos/issues/147)。runtime基线 `b5a4ba7b23040fbae04da1d1fc21a0923061c4e0`。

[R21结案](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-6501738570)：初始设计failed、review/revision未开始，COS154 selected-revision live分支未触发，不称其真实成功或失败。普通轮20时117main/10reopen已有checkpoint匹配断言却无前置normal click，后2次edit只改id、afterStepId使用0；轮25显式save空稿清为0/0，重建123main/0reopen且缺2AC。普通84246B/8192报价234028µ>余227106µ、差6922µ，守卫正确拒绝；readonly85873B/4096报价204514µ成功收尾，最终capture invalid_schema。无成功capture/review/game，无收尾/SDK/64cap/截止或预算分配/回流缺陷证据。

R21 planning3/46444µ、author52/561798µ、review0，共55笔608242µ、释放4391758µ。15:23:56.598Z→15:36:14.075Z的737477ms仅清理；15:41:24.644Z永久stop、15:41:32.939Z一次settle。独立PASS_CLOSED：child232 SHA `9c7e69af7383b3e1c89c37c277c22d67013cf5518e45d02c10a07cbb90bb6f95`；shared3407 SHA `b29e3b63d2e7b0fa31162e421a1ec5e47bf22b83b0f2f444d2abb2b1f3a80db8`，C34781744µ/H0。phase40/ref、room12v2、5M/30min保持；证据 `.cosmos/public-validation/room-20261029-reuse-21/{generation-closure.json,generation-execution.json}`，只读诊断 `.cosmos/planning/initial-design-reuse21/diagnosis.md`。旧run永久closed，无新paid准备。

Root批准输入SHA256：spec `884bfb2d20249390623a760347b63d0b9c97810ff5d421b20c960f78f0740962`；plan `082305033b6583f463765dc727e86c90a65c3a728567de599289e1065864dea4`。

Root directly approved this bounded implementation; no separate plan approval or paid validation is requested. Runtime base: b5a4ba7b23040fbae04da1d1fc21a0923061c4e0. Implementer: revision_read_guidance_implementer. Sole merger: planning_budget_merger.

R20 evidence (`.cosmos/planning/design-revision-reuse20/diagnosis.md`) shows 23 reads, zero writes, six summaries and successful readonly budget finalization before the correct no_output_change guard. Its 54,324-byte plan was read in 13 numeric pages before an eventual complete 34,442-byte compact read. This is a guidance hypothesis, not evidence of a read/budget bug or proof that the model will edit.

Extend the existing factory read-description prefix from designReviewBudget to the already validated designRevisionJsonReads selection. Keep the reviewer prefix byte-for-byte identical; the revision prefix changes only "review" to "revision". Omit optional offset/limit, or use null when the schema requires them; never invent numeric defaults; page after actual truncation and for non-JSON or targeted raw-source anchors.

No new selector, tool, schema, permission, execute behavior, compaction algorithm, limit, SDK normalization, task rule, seeded writer guidance, budget/model/request/cap policy or runtime mutation. Initial authors, other roles, planning and validation remain unselected. Only src/roles/factory.ts and focused existing tests change. Private notes remain outside the source commit.

Acceptance: selected revision and reviewer metadata contain the exact respective prefixes; false/missing/error/nonboolean selectors and other profiles retain existing behavior; actual verified host revision is selected while an initial task with revision suffix is not; native strict nullable parameters still produce full token-preserving UTF-8 JSON and explicit numeric pages still return SDK raw text. Reuse prior COS146 helper/permission/boundary evidence. All activity is free local synthetic SOURCE work; real-model adoption needs a later authorized run.
