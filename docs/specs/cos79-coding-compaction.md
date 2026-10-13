# COS-79 在成功工具回合接通有界上下文压缩

状态：SOURCE_NOT_READY / EXPERIMENT_COMPLETE / DESIGN_REVIEW_PENDING / open。Issue [#80](https://github.com/lrfluobida/Cosmos/issues/80)，id5835178325；父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)。

`cos77_implementer` acting COS79 implementer，仍独立审查他人编写的 COS78；`cos76_implementer` 完成 COS78 后独立 review 本卡；唯一 merger `batch75_76_merger`。[实施计划](../plans/2026-10-14-cos79-coding-compaction.md)。

## 问题与目标

COS77 能按实际请求与当前余额收缩输出，但不能保证后续输入仍可承担。Root仅以历史C8元数据作反事实计算：新余额1233190µ下前14个cap仍65536，历史费用后剩745662µ；下一普通输入405672 bytes本身需811344µ。此计算不是新模型执行或C9预测，也不授权重开C8。

原生压缩已接同一guarded stream/budget hooks，但目前automatic disabled，runtime没有提前调用方；预算失败后 session 已锁定，busy期间手动 compact 会被拒。SDK摘要通常请求较小cap，但wrapper覆盖成作者65536。单纯开flag不能解决费用触发、摘要本身准入、split-turn双请求及原生overflow retry边界。

## 固定契约

1. 仅 validation coding author 和同 coding-role repair；沿原 task/attempt、author/context、window、ledger、角色额度和请求次数。无策略及非目标路径保持，不扩展只读格式纠正或其他role。
2. 使用公开 `Agent.prepareNextTurnWithContext` 与 `SettingsManager.applyOverrides`，在成功工具回合之后、下一普通请求之前受控调用原 hook 的 native threshold compaction。临时设置在finally恢复；正常auto/postrun/overflow继续关闭，禁止恢复失败回复后自动retry。
3. 原生摘要本次effective cap不超过8192、原cfgcap和有效SDK maxTokens；实际 inputBytes/hasImages 使用原峰值报价与COS77策略，每笔完整reserve/admit/settle。split-turn可能两笔，每笔均占原次数/余额。unknown、deadline、race、不足和非法摘要均保守停止。
4. 摘要由原生 Pi 生成并按其成功路径追加记录；不得自写摘要、直接删除历史、吞错继续、伪造usage或改旧session。失败锁必须覆盖SDK内部catch；length保持incomplete，不保证8192能完成摘要。已结算费用不可因后来失败清零。
5. 同一不变投影不得反复付费压缩；无输入/预算收益时不得形成压缩循环。原系统验收包、输入版本、工具loadout/权限及文件、handoff/capture验收保持；模型摘要不成为新的授权。
6. 实验后提出固定规则，待独审：成功toolUse批次、非readonly、无失败/取消；投影至少131072 bytes，且原普通cap报价超过最新余额一半。相同投影跳过，native成功事件或新增entry才更新成功增长基线；成功后至少增长32768 bytes才可再次触发，原普通cap保守需求未下降则本session不再自动压缩。native无entry且无失败是no-op，只记录投影去重、恢复settings；不更新成功基线或无收益状态，不新prompt/continue/重试，普通请求继续原guard。阈值只决定触发，实际每笔费用仍需原子准入。

## 两阶段审批与验证

初始计划exact `e0248f70d96257a7fcac15cb6c8d8e7ad3db2a69` 已获独立PLAN_APPROVED，仅允许免费设计实验。实验前合入COS78已审集成main953f0eb，生产改动仍为空。实验使用真实Pi/session/controller与fake provider、network0；不注入compaction结果，金额均为合成usage/账本，不是供应商收费。

主矩阵16/16与费用补充2/2通过，完整脚本/raw TAP/每mode JSON及初次fixture缺依赖修正见计划。251339 bytes/1069753µ、普通65536仍可reserve1026966时触发；两次native摘要5583/4175 bytes各cap8192，将普通输入降至134861/151929。即使分别按76702/73886µ全部预留结算，仍同attempt继续并由真实registry捕获fixture文件。单/双摘要失败、unknown、截止/取消、race、length、非法SDKcap、无收益和重复边界有通过证据。

初审关于 `getSummarizationFailure` 只查error/length的观察不代表完整链遗漏工具检查：已实测native `generateSummaryWithUsage` / `generateTurnPrefixSummary` 后续toolCall检查在append前拒绝非法write，0entry/0工具执行。复用该守卫，不新增schema框架；失败latch仍阻止原生catch吞错后继续。

有效投影来自SDK projection→convertToLlm→normalizeContext的UTF-8 JSON字节，仅作触发观察，Pi仍按发送时实际context估价。临时reserve使本机SDK请求384000，已验证独立8192上限必要且尊重较小SDK值4096。503390-byte摘要在剩1000000µ时原守卫0发送。固定包、active tools、task/attempt、输入版本及中文输出/registry保持；不保证摘要语义或实际C9完成。

本次只申请明确设计独审，批准后才实施生产TDD；最终exact实现仍需规格与质量审查。

独审唯一no-op finding已在实验与设计补清：原生无可摘要历史时无start/end/summary/entry。最小代表先RED（原实验错误把169080记为成功基线），修后1/1，重复相同投影0新增请求、成功基线0/noBenefit=false，原普通准入仍执行。raw为同目录 `native-noop-red.tap`、`native-noop-green.tap` 和 `noop.json`；只跑新增代表，18项旧证据复用，生产仍未修改。

实际C9尚未消费时，可加本卡 `VALIDATION_CODING_COMPACTION_SOURCE_READY` 及reviewed/merge双祖先前置；C9此前已审入口与费用来源保持，不另开case10。本卡无paid、真实会话/账本/key读取或实际游戏通过；COS16/COS18、完整classic、PERFORMANCE和human状态不提升。
