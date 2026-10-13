# COS-79 在成功工具回合接通有界上下文压缩

状态：VALIDATION_CODING_COMPACTION_SOURCE_READY / PRODUCTION_PLAN_APPROVED / source-integrated / open。Issue [#80](https://github.com/lrfluobida/Cosmos/issues/80)，id5835178325；父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)。

`cos77_implementer` acting COS79 implementer，仍独立审查他人编写的 COS78；`cos76_implementer` 完成 COS78 后独立 review 本卡；唯一 merger `batch75_76_merger`。[实施计划](../plans/2026-10-14-cos79-coding-compaction.md)。

源码 exact `1d783c8f390b9927895d3a2c21c9b7f39a46d6e1` 已经 `cos76_implementer` 实际11paths规格→质量独审 APPROVED、无findings，唯一merger合入 `e06ce718fbec9d72f605d59680db6506aca804e3`。本卡source-integrated/open，公共发布由Root负责；actual C9/paid/human/game NONE。

## 问题与目标

COS77 能按实际请求与当前余额收缩输出，但不能保证后续输入仍可承担。Root仅以历史C8元数据作反事实计算：新余额1233190µ下前14个cap仍65536，历史费用后剩745662µ；下一普通输入405672 bytes本身需811344µ。此计算不是新模型执行或C9预测，也不授权重开C8。

实施前原生压缩已接同一guarded stream/budget hooks，但automatic disabled，runtime没有提前调用方；预算失败后 session 已锁定，busy期间手动 compact 会被拒。当时SDK摘要通常请求较小cap，但wrapper覆盖成作者65536。该缺口由下述已审实现处理，费用触发、摘要本身准入、split-turn双请求及原生overflow retry边界分别验证。

## 固定契约

1. 仅 validation coding author 和同 coding-role repair；沿原 task/attempt、author/context、window、ledger、角色额度和请求次数。无策略及非目标路径保持，不扩展只读格式纠正或其他role。
2. 使用公开 `Agent.prepareNextTurnWithContext` 与 `SettingsManager.applyOverrides`，在成功工具回合之后、下一普通请求之前受控调用原 hook 的 native threshold compaction。临时设置在finally恢复；正常auto/postrun/overflow继续关闭，禁止恢复失败回复后自动retry。
3. 原生摘要本次effective cap不超过8192、原cfgcap和有效SDK maxTokens；实际 inputBytes/hasImages 使用原峰值报价与COS77策略，每笔完整reserve/admit/settle。split-turn可能两笔，每笔均占原次数/余额。unknown、deadline、race、不足和非法摘要均保守停止。
4. 摘要由原生 Pi 生成并按其成功路径追加记录；不得自写摘要、直接删除历史、吞错继续、伪造usage或改旧session。失败锁必须覆盖SDK内部catch；length保持incomplete，不保证8192能完成摘要。已结算费用不可因后来失败清零。
5. 同一不变投影不得反复付费压缩；无输入/预算收益时不得形成压缩循环。原系统验收包、输入版本、工具loadout/权限及文件、handoff/capture验收保持；模型摘要不成为新的授权。
6. 已独审固定规则：成功toolUse批次、非readonly、无失败/取消；投影至少131072 bytes，且原普通cap报价超过最新余额一半。相同投影跳过，native成功事件或新增entry才更新成功增长基线；成功后至少增长32768 bytes才可再次触发，原普通cap保守需求未下降则本session不再自动压缩。native无entry且无失败是no-op，只记录投影去重、恢复settings；不更新成功基线或无收益状态，不新prompt/continue/重试，普通请求继续原guard。阈值只决定触发，实际每笔费用仍需原子准入。

## 两阶段审批与验证

初始计划exact `e0248f70d96257a7fcac15cb6c8d8e7ad3db2a69` 已获独立PLAN_APPROVED，仅允许免费设计实验。实验前合入COS78已审集成main953f0eb，生产改动仍为空。实验使用真实Pi/session/controller与fake provider、network0；不注入compaction结果，金额均为合成usage/账本，不是供应商收费。

主矩阵16/16与费用补充2/2通过，完整脚本/raw TAP/每mode JSON及初次fixture缺依赖修正见计划。251339 bytes/1069753µ、普通65536仍可reserve1026966时触发；两次native摘要5583/4175 bytes各cap8192，将普通输入降至134861/151929。即使分别按76702/73886µ全部预留结算，仍同attempt继续并由真实registry捕获fixture文件。单/双摘要失败、unknown、截止/取消、race、length、非法SDKcap、无收益和重复边界有通过证据。

初审关于 `getSummarizationFailure` 只查error/length的观察不代表完整链遗漏工具检查：已实测native `generateSummaryWithUsage` / `generateTurnPrefixSummary` 后续toolCall检查在append前拒绝非法write，0entry/0工具执行。复用该守卫，不新增schema框架；失败latch仍阻止原生catch吞错后继续。

有效投影来自SDK projection→convertToLlm→normalizeContext的UTF-8 JSON字节，仅作触发观察，Pi仍按发送时实际context估价。临时reserve使本机SDK请求384000，已验证独立8192上限必要且尊重较小SDK值4096。503390-byte摘要在剩1000000µ时原守卫0发送。固定包、active tools、task/attempt、输入版本及中文输出/registry保持；不保证摘要语义或实际C9完成。

实验后设计及no-op增量exact `b4918b89a525c0ffb97eb0b2b2c01e948b8cde96` 已获独立PRODUCTION_PLAN_APPROVED，随后实施生产TDD；最终exact实现已完成规格与质量独审并集成，双SHA见本卡顶部。

独审唯一no-op finding已在实验与设计补清：原生无可摘要历史时无start/end/summary/entry。最小代表先RED（原实验错误把169080记为成功基线），修后1/1，重复相同投影0新增请求、成功基线0/noBenefit=false，原普通准入仍执行。raw为同目录 `native-noop-red.tap`、`native-noop-green.tap` 和 `noop.json`；该阶段只跑新增代表，18项旧证据复用。

## 作者生产实现证据（已独审复用）

仅Pi adapter、factory、C9 source marker三处生产改动；已完成有效RED→GREEN，真实原生主矩阵18/18、readonly/无收益/no-op补充3/3及角色scope/repair3/3。新增policy-await直接close先RED再最小失败锁修正，affected4/4；当前20个生产场景有通过证据。compiled核心7/7，close修正后仅affected2/2；C9 source marker真实免费准入1/1、compiled闭包代表1/1。受影响61项中旧400ms墙钟断言单独复跑通过，其余60证据复用。typecheck/build/strict通过，全部raw与未通过的环境/时序尝试均在计划保留。

C9门禁沿用原sourceReady及reviewed/merge双祖先核验，免费测试只借用保存SOURCE history视图并恢复原snapshot，没有claim或新费用。为同seed串行，新增门禁代表归于原runtime测试文件，旧长链证据复用。生产失败锁保持最早原因，直接close/取消也不能让SDK吞错后返回成功。

实际C9尚未消费，其入口已要求本卡 `VALIDATION_CODING_COMPACTION_SOURCE_READY` 及reviewed/merge双祖先；C9此前已审入口与费用来源保持，不另开case10。本卡无paid、真实会话/账本/key读取或实际游戏通过；COS16/COS18、完整classic、PERFORMANCE和human状态不提升。

主线typecheck/build退出0；factory目标作者启用、policy-await关闭及native no-op三个代表3/3、0skip，TAP4820.8365ms，原始输出 `C:/Users/26557/AppData/Local/Temp/cos79-merge-integration.tap`。merger已读12份生产相关raw TAP，复用既有矩阵、compiled与C9免费marker/闭包证据；源码、测试与计划字节和批准提交一致。main干净推送后保持冻结，实际免费准入与C9执行由Root处理，merger不新增付费运行。
