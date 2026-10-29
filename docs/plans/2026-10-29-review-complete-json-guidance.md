# COS149 实施计划

状态：Root已按R15实证及nullable澄清批准小范围实施，不追加独立plan审批。登记期间，review_json_guidance_reviewer已对 `aef3b221abd9bd10886f0261846535091acb569f` 给出APPROVED_SOURCE_SCOPED、无finding，Root批准后续唯一集成；当前尚未集成或发布。仅选中ordinary design reviewer的read短指引，参数schema/执行/SDK限额/normalizer/权限/预算/strict保持。

任务：[COS149 / #150](https://github.com/lrfluobida/Cosmos/issues/150)，id6096612550，原生父COS18/#19未勾；依赖[COS146 / #147](https://github.com/lrfluobida/Cosmos/issues/147)及[COS141 / #142](https://github.com/lrfluobida/Cosmos/issues/142)。作者review_json_guidance_implementer，独立源码reviewer review_json_guidance_reviewer，唯一merger planning_budget_merger。

Root批准输入SHA256：spec `cb75e438c2cf6a6899dc0b01f16fc8c25b6cc506d36765d5b7e9164d6582be79`；plan `9b66a033057415033570f960d9000e90d7cd346adf2a49b7b448c9078e5d0e20`。

1. dedicated implementer在clean managed worktree新codex/review-complete-json-guidance分支，读取固定spec/实证和当前role选择，先做真实factory payload RED。
2. 仅为选中reviewer增短指引，原schema/权限/行为不变；依据已核实strict wire要求，用null表达未指定（或接口允许时省略），测试原SDK规范化的完整JSON读取与数值窗口原文。
3. 固定SOURCE SHA立即交独立reviewer，私有证据可并行补；只修finding并复核delta，不重复大矩阵。
4. 唯一planning_budget_merger登记/集成/有限检查后先发布source并停写，公共关闭文档可在真实run后收尾。
5. 后续同一原需求新验证仍5M/30min与phase40；所有已闭R1–R15不重开/重结。当前无paid active或新run准备。
