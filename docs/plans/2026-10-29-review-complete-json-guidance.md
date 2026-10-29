# COS149 实施计划

状态：SOURCE范围完成。review_json_guidance_reviewer已对 `aef3b221abd9bd10886f0261846535091acb569f` 独审APPROVED_SOURCE_SCOPED、无finding，Root批准唯一merger发布 `dc1d6f61d60929f4121e0b033cfc57925d5f4421`；[批准](https://github.com/lrfluobida/Cosmos/issues/150#issuecomment-6494620746)、[关闭](https://github.com/lrfluobida/Cosmos/issues/150#issuecomment-6494621393)及父[x]已GET核证。Root原先直接批准最小实施，未追加独立plan审批。main typecheck/build0、有限4/4、0skip；16regression/strict/原稿保真证据复用。

任务：[COS149 / #150](https://github.com/lrfluobida/Cosmos/issues/150)，id6096612550，原生父COS18/#19已勾（仅SOURCE，父仍open/partial）；依赖[COS146 / #147](https://github.com/lrfluobida/Cosmos/issues/147)及[COS141 / #142](https://github.com/lrfluobida/Cosmos/issues/142)。作者review_json_guidance_implementer，独立源码reviewer review_json_guidance_reviewer，唯一merger planning_budget_merger。

[R16结案](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-6494632627)：真实review采用5次null/null整JSON读，展示34585/680/26768/1016/30216B且均完整；5个review请求cap均16384。首份inputVersions6项经唯一COS148明确诊断纠正为5项，两份verdict均changes_requested、各9findings，文本并非逐字相同。有效独审后自动revision启动；预置137main+20reopen被作者save空scenario替换，再append59步、无reopen，6个selector鼠标点击保留pixel坐标并缺4AC，raw edit锚点失败，strict拒绝。无revision review/game，来源路径正确，不据此作工具或预算bug结论。

R16 planning2/29590µ、initial author53/551023µ、initial review5/122572µ、revision author19/367290µ，共79笔1070475µ、释放3929525µ。09:40:37.484Z→09:53:43.864Z的786380ms仅清理；09:55:11.043Z永久stop、09:55:15.347Z一次settle。独立PASS_CLOSED：child336 SHA `6d3c48710fda93a2c3ce2ff599c0b1a850b161fd52fd049cf2e55917eb569d54`；shared3397 SHA `4ff15dc32a8f2805956393f01ca176fd0fafde94533922f0f39b29e77529828b`，C30816188µ/H0。phase40/ref、room12v2、5M/30min保持；证据 `.cosmos/public-validation/room-20261029-reuse-16/{generation-closure.json,generation-execution.json}`。旧run永久closed，无新paid准备。

Root批准输入SHA256：spec `cb75e438c2cf6a6899dc0b01f16fc8c25b6cc506d36765d5b7e9164d6582be79`；plan `9b66a033057415033570f960d9000e90d7cd346adf2a49b7b448c9078e5d0e20`。

1. dedicated implementer在clean managed worktree新codex/review-complete-json-guidance分支，读取固定spec/实证和当前role选择，先做真实factory payload RED。
2. 仅为选中reviewer增短指引，原schema/权限/行为不变；依据已核实strict wire要求，用null表达未指定（或接口允许时省略），测试原SDK规范化的完整JSON读取与数值窗口原文。
3. 固定SOURCE SHA立即交独立reviewer，私有证据可并行补；只修finding并复核delta，不重复大矩阵。
4. 唯一planning_budget_merger登记/集成/有限检查后先发布source并停写，公共关闭文档可在真实run后收尾。
5. 后续同一原需求新验证仍5M/30min与phase40；所有已闭R1–R16不重开/重结。当前无paid active或新run准备。
