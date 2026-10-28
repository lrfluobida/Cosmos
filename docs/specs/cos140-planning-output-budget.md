# COS140：普通规划的预算内请求输出容量

状态：`source-integrated / source-scoped-complete`；最终 `67ebd312fddd5d4a95a7dcbc6d2d58b9c1831cda` 经planning_context_reviewer独立APPROVED_SOURCE_SCOPED、无P1/P2及Root批准，已发布 `7cffc467082fdd1fe9cc8e438023edde2a2f54a7`。[完成关闭](https://github.com/lrfluobida/Cosmos/issues/141#issuecomment-6474127714)、closed(completed)及父[x]已GET核证。4096为本卡新批准的ordinary planning工程floor，并非历史下限或完成保证。

任务：[COS140 / #141](https://github.com/lrfluobida/Cosmos/issues/141)，id6082443833，原生父COS18/#19已勾，依赖[COS139 / #140](https://github.com/lrfluobida/Cosmos/issues/140)。作者planning_context_implementer，独审planning_context_reviewer，唯一merger planning_budget_merger。

批准私有输入SHA256：spec `22d61b133e86391ebee9ebb7daf784c8ad8d4def719178466b8edd8e6a9d1eb5`；plan `1276cd13ff29913943717816c73cab5a0b1b645e3590ec0f54c68d2182fbf29f`。

基线：5445eda446442f9a01ba030ffdc41c4f52b0355a（runtime457c90c8）；依赖COS139/#140。

源码结果：4个批准文件精确、无冲突集成；main typecheck/build0，最短代表5/5、0skip、TAP5022.7093ms，完整9/9、旧受影响3/3、strict及native按8个生产文件指纹一致性复用。原R6固定读取和两笔usage在TEMP保持，第三同input77452B选择cap7534/报价215176µ，原余额215177µ可承担；cap7535即超额。第三最终规划回复及22600µ结算明确synthetic；floor拒绝、length结算后失败、严格host完整12条验收绑定均保持。仅SOURCE范围完成，父COS18仍open/partial、34/34仅指源码子项。

[reuse-7实际结果](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-6474843576)已永久PASS_CLOSED：规划2请求均cap8192通过，没有触发压力降cap；设计捕获与host验证后，review第四响应在预算充分时因length终止，无有效review、修订、art或code。实际正常规划通过不扩大为压力分支实证，真实游戏与人工体验未完成。

## 问题

reuse6已永久PASS_CLOSED。COS139索引确实启用；模型先读完整draft/confirmation，再读同内容capture镜像的前60行与confirmation。两次真实费用14814+20009=34823µ；planning原grant250000，余额215177。第三请求input77482B，8192报价220500，差5323，在发送前停止；没有最终planJSON/任务或schema失败。诊断见 `.cosmos/planning/planning-request-capacity/reuse6-diagnosis.json`。

仅说明镜像关系不能使固定原轨迹通过；完整JSON空白压缩的反事实只余91µ。本卡选择复用已有预算输出选择机制，不调整初始分配或原总额。

## 明确的新选择

仅可信新ordinary cosmos planning启用**新的4096–8192输出区间**。4096是本卡的工程下限，不是既有ordinary planning floor，也不保证模型一定完成。每次先尝试原8192；不足时选择原余额可承担的最大值。R6原轨迹可选7526、报价215172<=215177；R5原轨迹可选6623、报价222868<=222875。这些是生产报价计算，不是新真实运行通过。

预算紧时实际请求输出上限会缩小，可能增加截断风险；length仍必须在真实结算后使规划失败，不能接受不完整计划、补造JSON、清空缺口或自动重试。完整任务验收标准不变。

## 实施边界

1. 独立、明确的trusted planning配置，不能给COS139显示索引选项暗加容量含义。沿现ordinary新host范围启用，覆盖三槽/模块化五槽；默认factory、非cosmos planning、作者/reviewer和validation/preparation/human/binding/inherited保持原配置。
2. 复用authorBudgetOutputLimit的原纯报价搜索，不复制算法，不改ledger/Pi核心，不引入review reserve、compaction、finalization或新会话。只在请求发送前选择cap；最多8192、至少4096，优先最大可负担值。
3. 复用原run/grant/window/身份、未知费用、取消及5秒清理检查。真正reserve/admit仍是派发权威，选择与reserve之间的预算变化必须保守拒绝；不手写余额或自行返还费用。
4. 原请求计数在选择之前，原16上限不重置；floor也不可负担时不发送。原timeout、deadline、JSON output、输入内容、全部read结果、来源权限及plan/host验证保持。
5. 启用现有recordRequest:true，实际selected cap、inputBytes与quote写入现有billing回执；HTTP cap、计费准入与回执必须一致。不得仅暗改HTTP max_tokens。
6. 配置非法值在会话创建前拒绝。公开普通host固定选4096及8192最大值，模型和用户文本不能自设这一能力。
7. 无新增持久化执行policy版本或历史迁移。旧失败planning无plan/execution仍不得重规划，所有历史已关闭run永久不恢复/不改写/不重结算。

## 最小必要验证

- 在新TEMP使用真实factory/Pi/锁定SDK，仅fake fetch，固定重放原R6两轮响应、完整read及原usage/费用。旧8192请求机械RED；新策略第三请求机械GREEN，原前两轮仍8192，第三选择真实最大可负担cap。用最终源码/实际路径计算并报告input/quote，不能仅替换字符串宣布通过。
- 保留原所有主来源和镜像读取，不靠换掉第二响应或删内容造通过；所有非cap payload/JSONmode/thinking/tools内容、规范化消息及source绑定核对。第三最终规划回复明确标为synthetic，因为R6没有finalJSON，并以非零synthetic usage结算；保留完整plan/host验证，不称真实模型或游戏成功。
- 回执、HTTP、reserve与selected cap一致；原两笔真实用量在TEMP照值重放。每轮费用与余额分别列出，quote不当实际费用。
- floor不可负担时无transport/预留；length即使返回看似JSON仍在结算后终止，无自动第四请求或有效plan；次数、deadline/取消/未知费用及reserve race的已有helper证据复用或挑受影响短代表。
- 普通三/五槽各短代表和默认/排除caller保持原行为；非法floor/配置拒绝。COS139完整source/contract/host绑定证据保持并按不变范围复用，不重跑旧Edge/media/所有历史矩阵。
- typecheck/build、变更测试及实际diff独审；唯一merger做最短集成和source范围发布。新真实尝试待上述完成及原预算/新身份readiness。

## 预期改动

主要为roles/factory.ts的可信选项验证/规划分支/recordRequest及entrypoint-host.ts的选择；必要类型和定向测试。若需新的精确错误码，仅沿已有错误分类机制补充，不重构错误框架。不要改初始化分配、全局预算或旧运行。所有文本UTF-8，最小补丁并复读中文。
