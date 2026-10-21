# COS-117 · Pi 请求报价排除未发送的工具元数据

父任务 COS18 / #19。前置 COS116 已发布；本卡与 COS118 同批，互不依赖源码。独立设计评估 `intake_budget_recovery_design` 已给 APPROVED_DESIGN；最终源码仍须专属 reviewer 检查。

## 事实与目标

原 room3 已真实确认 v6，随后设计第16次请求在派发前被预算门禁拒绝。15次设计响应已结算192638µ，原675000µ任务拨款剩482362µ；当前208483字节输入、8192输出上限报价482502µ，缺140µ。不是请求次数帽触发。全部原记录已关闭结算，不得恢复或再次结算。

只读诊断 `.cosmos/operator-checks/room3-generation-diagnosis.json` 及锁定SDK `openai-completions` 源码证明：`toolResult.details` 是保留在宿主上下文的元数据，实际provider消息转换只取content、toolCallId和可选toolName。该上下文含88843字节details值；连同字段结构剔除后，内存报价为304640µ。此诊断不证明设计会完成。

目标：仅在费用预估的输入投影中剔除该确定未发送字段，让真实发给provider的内容继续受原保守估算和准入约束。

## 必须满足

- 仅对消息 `role === 'toolResult'` 的顶层 `details` 做报价副本剔除，不删除其他字段或嵌套同名文本。
- live request 与可选compaction的inputBytes估价共用一个小helper。实际model context、SDK传输、native记录、工具结果均保留原值；完整输入身份和漂移检查继续比较完整原始序列化，不能改用剔除后的串。
- content文本、图片、工具定义、工具调用参数和现有hasImages/图片成本规则全部保留。未含该字段的输入报价保持一致。
- 原估算器、reserve/admit、未知费用处置、请求数、输出配置、截止时间、grant和总上限保持。历史request/receipt/账本不重算、不改写。
- 不修改SDK/依赖，不增加provider路由，不删除其他host字段，不扩展输出cap或请求机会。

## 免费验收

1. 真实Pi+fake fetch：巨大details与短details产生相同实际请求body，报价不再随details增长；native仍保存各自原details。
2. 将同量文本放进真实content时，body与inputBytes/报价都增长，并能由原预算准入拒绝；不能只测试返回值相等。
3. 用户/assistant或content里的同名details文本、工具schema/arguments、中文和图片保持；无toolResult.details的旧输入报价不变。
4. compaction候选与真实请求采用同一报价投影；完整上下文在等待cap选择/准入期间漂移仍拒绝，metadata漂移也不能绕过原身份检查。
5. 必要角色/intake/compaction兼容代表、typecheck/build/changed-test strict通过。复用未变证据，不重复整个测试矩阵。

源码批准只证明预估修复，不证明模型成功、游戏完成或允许旧运行续跑。原room1/2/3及memory运行永久关闭。

## 实施记录（2026-10-21）

本卡为 [COS117 / #118](https://github.com/lrfluobida/Cosmos/issues/118)，id5962948336，父COS18 / #19；设计和计划已经独立批准。实现基线 `74b96c12e4d5f3e8a21d3eb6ac9391932967e87d`，分支 `codex/pi-request-cost`，待专属独立reviewer审查及唯一merger集成。

`requestInputBytes` 只在报价副本中移除 toolResult 顶层 details，live request 和 compaction candidate 共用。`inputJson`、`serialized`、`lastProjection` 的完整身份比较，以及实际context、SDK传输、native记录、图片规则和原准入均保持。Node v22.22.2；已安装pi-ai/pi-coding-agent与锁文件均为0.99.2，无安装或依赖变更。

免费回归先RED：live和compaction各一项在相同provider body、不同native details下报价1920→301908字节，2失败；真实content增长对照通过。最小接线后新增9/9通过：两条投影、真实content增长与原预算beforeRequest拒绝、无details字节不变、只去掉顶层字段、中文/图片/schema/arguments保留，以及policy/admission/final-window三处metadata漂移拒绝。

兼容定向首轮12项中9通过、3失败。旧coding-compaction夹具将每个空details:{}也计入固定字节目标，导致131072目标的报价成131033，原压力不足且history漂移用例未进入预定摘要分支。经Root确认，只去掉夹具构造/返回中的两处无用空details，保持原padding、阈值、预算和行为断言；受影响3/3通过。history用例实际在summary length结算后追加native custom entry，再由原完整身份/leaf检查拒绝为compaction_failed。其余9项通过证据复用。

测试strict首轮发现新增夹具的NestedToolCallRecord字段不符SDK及既有mjs dispatch默认参数推断过窄；已用SDK status字段并补Context JSDoc类型，最终strict退出0；新增helper最终6/6复验与此前9/9重叠，不累计。typecheck/build均退出0。精确命令、原失败输出和其余最终检查见作者工作树 `.cosmos/cos117-evidence/verification-index.json`；源码范围始终只有helper及两个报价调用点。

本次只运行免费SOURCE/TEMP测试，不读取或打开真实controller，不派发真实模型或重结算；原room1/2/3与memory均永久关闭。源码通过只证明费用输入投影修复，不能证明实际模型、游戏生成或交付成功。
