# COS138：设计审查的固定比较输入

状态：Root已批准固定设计、计划及免费SOURCE实施；独立design_candidate_review_reviewer已确认比较引用契约，源码审查仍pending。

任务：[COS138 / #139](https://github.com/lrfluobida/Cosmos/issues/139)，父COS18/#19未勾，依赖[COS137 / #138](https://github.com/lrfluobida/Cosmos/issues/138)。作者ordinary_design_revision_implementer，独审design_candidate_review_reviewer，唯一merger public_agent_batch_merger。

批准私有输入SHA256：spec `e32f801d98db33157296b5fadbba14256f25e740750297a1535e8612371c4a16`；plan `2d6f99421b6597771e993c5eb6f2b8d5ed2ca78747a24c0c6111ff0dedc2a0cc`。

状态：Root 按实际 reuse-4 失败和独立设计判断批准免费实现；GitHub 身份已登记，SOURCE待独立审查。
基线源码：b287e812f8994e23466297f63ca4454a935eb67d。依赖 COS137 / #138。

## 问题与证据

reuse-4 已永久停止并 PASS_CLOSED。真实 reviewer 第4次响应为 changes_requested，含8条 findings、2条原文准确的 concern resolutions。两条 basis 均为 captured_output，引用精确当前 design 以及同 task.inputs 的 requirement-draft、user-confirmation。四字段 parseReview 通过，但 parseDesignConcernReview 将 captured_output 白名单仅设为 task.artifacts，因而拒绝。

已批准 COS137 规范 §6 要求当前固定捕获及与需求的对应关系，没有明确 only-artifacts。初始及纠正提示同样没有这一排他要求。独立 reviewer 认定这是过窄实现，而非违反明确合同。

原一次纠正第5请求未发送：input181535B，4096 floor报价395838µ，余额371841µ，差23997µ。仅缩短提示不能补足；即使删除最后整条纠正消息，仍差18819µ。原运行费用36笔776868µ，已释放4223132µ；共享3372累计24106167µ，未决0。禁止恢复、改写或再次结算该运行。

诊断材料：`.cosmos/planning/ordinary-design-candidate-review/reuse4-review-diagnosis.json`；原 run 位于 .cosmos/public-validation/room-20261027-reuse-4/run，只读。

## 目标契约

仅修复 independent-review/2 的 captured_output resolution：

1. 每条 inputVersions 仍非空、无重复、每个引用逐字段精确匹配固定版本。
2. 允许引用集合为当前 task.artifacts 与同 task.inputs 的并集。
3. 每条至少包含一个精确当前 capture 引用（当前设计产物）。只含需求等输入不能证明当前输出。
4. context.interfaces 不因本修复获准；foreign、stale、仅旧 design、only-input、缺当前 capture 均拒绝。
5. captured_output 的 evidenceIds/evidenceRefs 继续为空。原 concern ID/文字、状态、rationale、acceptanceIds、完整 review 及身份/来源证明全部保持。
6. 原始 changes_requested 与8条 findings不删改、不自动批准。有效拒绝仅沿已有唯一设计修订路径；资源不足仍停止。
7. 初始与一次纠正提示明确同一引用规则；不新增字段、政策版本、会话、纠正次数、预算或输出下限，也不顺带改通用 requestReview 错误反馈框架。
8. fixed_input、host_evidence、旧 /1、其他角色的权限保持原约定。

## 验收

- 原真实 raw response 在固定原 task/concern/host 上只读纯函数重放：修复前精确拒绝，修复后不改变任何响应字段即可解析为 changes_requested，8条 findings及2条 resolution原样保留。此重放不是旧 run 的有效 review，不产生旧回执。
- 最小单元回归覆盖合法 capture+input；capture-only仍可；only-input、接口旧设计、外部引用、过期版本、重复和空引用、缺capture仍拒绝。复用已有相同负例，避免重复测试。
- 新 TEMP/fake-SSE 沿生产 factory/Pi/SDK，仅在 fetch 层模拟，重放真实2+2+1读取和四轮非零 usage，完整原设计/计划/确认及 concern 原文保留。第四轮合法 changes_requested 入正式新 TEMP review；无 protocol correction 或第5请求。
- 使用原 task grant1125000µ、review入口前已结609422µ、可用515578µ；这都是新 TEMP 合成账本，不触真实共享资金。逐轮归还 reserve/结算和当前来源证明照生产执行；记录实际请求大小与报价，不能把旧私有身份或旧收费冒充当前来源。
- 保留 malformed response 仍需一次原纠正且预算不足在发送前拒绝的负例；旧真实第5轮预算结果作为历史证据，不为重现它放宽预算。
- 受影响 typecheck/build 和独立 reviewer 实际 diff 审查通过，唯一 merger 集成。无需重跑无关 Edge/media 或全部历史矩阵。

## 实施范围

预计仅 src/runtime/repair/design-concerns.ts 的局部引用校验及提示构造、对应 proof/runtime/provider 测试与必要测试 fixture。若实际提示定义在相邻文件，仅改这一句契约。保持完整源签名、journal、selection 和费用算法不变。

本卡证明通用 agent 能接受合法的设计比较引用；不把模型8条 findings 当已证实语义结论，不宣称目标游戏完成。新付费验证须待已审源码和受影响集成完成。
