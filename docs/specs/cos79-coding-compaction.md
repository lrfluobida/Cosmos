# COS-79 在成功工具回合接通有界上下文压缩

状态：SOURCE_NOT_READY / PLAN_PENDING / open。Issue [#80](https://github.com/lrfluobida/Cosmos/issues/80)，id5835178325；父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)。

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
6. 固定生产触发条件先由免费大thinking/toolResult原生序列测定，并再次独审。必须证明在251339-byte/1069753µ、普通65536尚可发送时提前触发；阈值只是触发条件，实际摘要费用仍需原子准入。

## 两阶段审批与验证

初次PLAN_APPROVED只允许 SOURCE/TEMP 免费设计实验，不允许生产改动。实验使用真实Pi/session/controller和fake provider、network0；不注入compaction结果，核对实际摘要输入、cap、收费、压缩后输入及同attempt继续。候选128KiB字节阈值/余额压力未冻结为生产策略。

实验须覆盖单/双摘要、摘要不足、第二笔失败、unknown、取消/截止、race、length、摘要工具调用、重复/无收益，以及固定约束和工具/捕获不变。把明确规则与证据补入计划，经独立再审后实施；源码exact SHA再作规格与质量独审。

实际C9尚未消费时，可加本卡 `VALIDATION_CODING_COMPACTION_SOURCE_READY` 及reviewed/merge双祖先前置；C9此前已审入口与费用来源保持，不另开case10。本卡无paid、真实会话/账本/key读取或实际游戏通过；COS16/COS18、完整classic、PERFORMANCE和human状态不提升。
