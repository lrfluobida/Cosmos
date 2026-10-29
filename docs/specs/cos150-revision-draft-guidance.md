# COS150：修订原稿上下文与save替换语义

状态：SOURCE范围完成。revision_draft_guidance_reviewer已对 `39adcdbba6a613bb29e94f2fe14ce1282086c647` 独审APPROVED_SOURCE_SCOPED、无finding，Root批准唯一merger发布 `5619429c8882bd381140211f701740474e44a1f6`；[批准](https://github.com/lrfluobida/Cosmos/issues/151#issuecomment-6496237662)、[关闭](https://github.com/lrfluobida/Cosmos/issues/151#issuecomment-6496238600)及父[x]已GET。Root直接批准最小实施，未追加独立plan审批。main typecheck/build0、有限2/2、0skip；作者9writer/4regression/native1/two-test strict、独审native1/1和R16 TEMP证据复用。

任务：[COS150 / #151](https://github.com/lrfluobida/Cosmos/issues/151)，id6098079912；原生父COS18/#19已勾（仅SOURCE，父仍open/partial），依赖[COS147 / #148](https://github.com/lrfluobida/Cosmos/issues/148)与[COS134 / #135](https://github.com/lrfluobida/Cosmos/issues/135)。runtime基线 `dc1d6f61d60929f4121e0b033cfc57925d5f4421`。

[R17结案](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-6496249569)：planning通过，初稿全程invalid、无有效handoff/host evidence，未review/revision/game；COS150 seeded-revision live分支未到达，不作其真实失败或成功结论。草稿一度190main+76reopen，结构诊断仅余一个checkpoint可见断言，仍非通过；模型raw write清空后重建到最终85main/0reopen。末文件与模型写入一致，无SDK丢edit证据。只读收尾90611B/4096报价213990µ高于作者192536µ，差21454µ，守卫正确拒绝且该请求未发送。

R17 planning4/68398µ，author27ordinary/460880µ+3summary/96584µ=30/557464µ，共34笔625862µ、释放4374138µ。11:09:40.888Z→11:16:31.944Z的411056ms仅清理；11:26:37.689Z永久stop、11:26:42.729Z一次settle。独立PASS_CLOSED：child148 SHA `de7c4b6673558d14bbdeb1821cc9db81e26e15ca3f5ead6664a1f21bf1aeb3e8`；shared3399 SHA `7d296c403113dc5287e7a6191050288025f6392bc70e5557c6857c11910041ab`，C31442050µ/H0。phase40/ref、room12v2、5M/30min保持；证据 `.cosmos/public-validation/room-20261029-reuse-17/{generation-closure.json,generation-execution.json}`，只读诊断 `.cosmos/planning/author-handoff-reuse17/diagnosis.json`。旧run永久closed，无新paid准备。

Root批准输入SHA256：spec `3f71baa1a6967e6d9332283e3f8a33bde756aca1dbb148d6b37ca4f0db1522b0`；plan `2ba5588b77ce1d2f9983ba5d14ea4f8451e69eeda51b64cc819134f5ca895294`。

## 依据

R16已永久PASS_CLOSED，shared3397/C30816188/H0，phase40、每次5M30min、总150M不变。初稿137 main+20 reopen，host/capture通过；独审实际5个null/null完整JSON读，全部read输出可解析，5请求cap16384。firstinputVersions6→COS148唯一具体诊断→second5，均changes_requested/9findings（非逐字同文）；得到有效review并启动revision。
revision工具工作区正确且已有v1。作者先写design.json，旧plan自检passed，随后主动save空scenario.steps且省略reopen，完整替换原计划，再append25+34步。最后6个selector鼠标点击仍用pixel坐标、4AC无断言，rawedit锚点失败后只读并收尾；未产生revision review/game。19笔367290µ，其中普通271457、摘要44850、只读50983。guard8K报价286032>作者可用283693差2339，4K收尾正常；不是length、max64或权限错误。
seedDesignRevision已预置旧两文件；deriveRevision clone原task并保留初稿First write/Prefer save建立draft规则。write-game-plan当前description未说明save整体替换scenario并移除未提供的steps/reopen。存在可证实的语境/语义清晰度缺口，但不能断言它决定了模型选择。

## 最小变更

1. 仅明确既有write-game-plan说明：save整体替换当前scenario（包括viewport、全部steps和reopen；省略内容不会被保留），append按原行为追加。save仍允许作者有意提交完整或未完成的替代草稿，不新增禁止/自动合并/自动补全/保存备份。
2. 仅经host真实revision plan/fixed task绑定的structured design revision作者，给该工具额外的阶段事实与指导：当前editable design.json/acceptance-plan.json已从上一捕获预置，仍是未批准草稿；先阅读当前原稿及实际review意见，优先针对性修改并保留未受影响覆盖/重开结构，不为开始修订而先save空计划。有意全量重写仍可，但需提供完整替代内容并通过原检查。
3. 修订额外指导可以说明：完整JSON阅读可在schema要求时用null表达未指定offset/limit（原SDK会规范化），exact-text edit前取原始数字分页中的精确锚点；不改read工具或参数行为，不把压缩展示当源格式。
4. 预计新增createGamePlanWriter的一个host-only可选情境参数，仅影响description；host从已有ordinaryRevisionTaskId（bindPreparedTasks验证readDesignRevisionPlan后保存）与当前真实original.taskId比较传入。不能按名字suffix、用户brief/任意文字或模型传入字段猜测。模型schema里不得新增此参数或path/ref/authority参数。
5. 初始writer只得到全量替换语义，不声称预置；其他role/profile或没有原structured工具的caller无新能力。新guide有界（建议新增总量<=1024UTF8B），保持原description必要内容/不越权/未accepted说明、参数schema、executionMode sequential、execute及所有guards/UTF8/scoped writer/feedback原样。
6. 原ORDINARY_PLAN_AUTHORING_RULE和冻结task.context.rules/tools、planning/execution policy及版本保持逐字/结构不变。不要改deriveRevision的已冻结规则或回填历史任务；这是现有API的语义说明和经验证阶段事实，不是新权限或新重试政策。
7. 不改save/append算法、parser/coverage/checkpoint/strict/capture/review、model/thinking/caps/reserve/grants/limits/请求数。不能手修R16游戏或复活旧run；旧guard和原工具行为正确，不因一个失败扩大机制。

## 必要验证

- RED显示说明缺少完整替换和预置revision事实；新说明在真实host/factory/provider payload中按scope出现。
- 真实host经固定revision绑定才展示额外指导；初稿即使名字以revision结尾也没有，wrong task/workspace/role仍拒绝；frozen rules/tools原样，legacy恢复不被新metadata改变。
- Save全量替换与append行为保持（包括有意save空草稿仍按原约定保存并被strict拒绝）；schema、executionMode、execute权限未改，模型不能自行选择host-only情境。
- 小native fakefetch代表确认真实模型可见metadata；synthetic本地修订操作保持旧草稿未涉及步骤/顺序/reopen/覆盖，原件不变。若用R16原137+20计划，仅做明确合成的局部ID/描述变更演示，不假称解决9项真实意见或产生批准。
- 原文件只读，全部新操作TEMP；复用C147 writer/schema/guard/native串行、C146/149读与null转换及当前budget证据，不重跑大矩阵。不制作新的重写机制、通用JSON工具或额外付费实验。
- typecheck/build、聚焦回归、独立actualdiff，唯一merger有限主线检查后先发布source；实际模型是否保留原稿/完成修改留待后续受限生成。

预计仅runtime/entrypoint-plan-authoring.ts和entrypoint-host.ts及相应focused tests。原SDKwrite/edit内部已有per-file mutation queue，本任务不改全局写入调度或provider。无新ADR/CONTEXT。
