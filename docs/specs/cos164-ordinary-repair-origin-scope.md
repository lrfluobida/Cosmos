# COS164 · 恢复普通设计修复任务的原有执行范围

[COS164 / #165](https://github.com/lrfluobida/Cosmos/issues/165) 已登记。`offline_repair_origin_reviewer` 对固定规格给出 APPROVED_DESIGN，Root 批准 `offline_repair_origin_implementer` 实施，源码待独审。三项已有测试复现了同一个问题：在允许通用设计修复的普通运行中，初稿缺失、JSON 无效、玩法覆盖缺失都会登记替换任务，但重建的来源与原 journal 不匹配，修复作者无法接手。本卡恢复这一次原有修复，并按已核实的替换关系区分原始设计、独立修订与通用替换任务。通用修复与续跑均没有 `budget-followup/1` 的额外收尾权限。

父任务为 COS18/#19，直接依赖 [COS136 / #137](https://github.com/lrfluobida/Cosmos/issues/137) 第 3 节的来源与收尾政策。原始设计及合法独立修订仍按其各自已认证策略工作。R27 采用独立设计修订流程，本任务的通用修复回归由离线测试验证。唯一 merger `planning_budget_merger` 在 Root 精确放行后集成到 `codex/gameplay-offline`。

批准规格原稿 SHA256 为 `2961a144c7b50d32640b032421d193cf495b7ee973e6042b04b452bc7c865338`。

代码基线为 codex/gameplay-offline 的 a86cc321e070664dc1023db14124505ea8f1d41f，后继 3e7cddf 为文档变更。

## 故障

普通设计运行允许通用缺陷修复的路径中，初稿缺失、JSON 无效或漏掉玩法覆盖都会触发既有的一次修复。登记出的替换任务来源没有 budget-followup/1；随后运行器用原设计任务的收尾策略重建预期来源，精确比对失败，修复作者无法运行。三种故障已在 ordinary-design-host.test.ts 复现。采用独立设计修订流程的新运行另有既有约束，本卡只修通用设计修复路径。

## 行为约定

使用已经核实的 repair-plan、替换关系和实际角色，派发或恢复时给原始设计任务、获准的设计修订和通用替换任务各自原有的执行范围。已登记的通用替换设计任务仍能执行正常的修复工作，遇到预算拒绝时没有额外收尾机会。修复编号后缀或作者声明不能选择策略。原始设计和被复用的已通过设计祖先仍须精确认证。TaskJournal 保持逐项匹配，已有原件不回填、不改写，不额外分配费用、修复次数或截止时间。

## 离线验证与发布

真实生产入口配合临时目录、模拟作者和浏览器验证三种已有失败，检查只有一个 design repair，后续版本绑定正确、验收流程到达原断言。定向验证中断后从原始 journal 恢复、篡加来源标记被拒，以及通用修复不会得到预算收尾权限；选择必要的历史原设计/唯一修订代表作回归。测试不产生真实模型请求或改动真实运行。由独立 implementer 和 reviewer 交付准确提交，唯一 merger 合入 codex/gameplay-offline。
