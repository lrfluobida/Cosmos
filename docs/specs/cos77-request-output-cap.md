# COS77 · 按实际请求与角色剩余额度收缩编码输出上限

状态：SOURCE_NOT_READY / open。稳定任务 ID：COS-77。Issue：[#78](https://github.com/lrfluobida/Cosmos/issues/78)，id5834357885；父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)。

专属 implementer `cos77_implementer`；独立 reviewer `cos76_implementer` acting COS77 reviewer；唯一 merger `batch75_76_merger`。实施计划：[2026-10-14-cos77-request-output-cap.md](../plans/2026-10-14-cos77-request-output-cap.md)。依赖已有 COS59 请求窗口、COS75 origin 守卫、COS76 当前任务与预算 authority。

## 问题与目标

Root提供的真实C8停止数据：14次API新增487528 micro-CNY，coding grant1720718、remaining1233190、未决预留0。下一请求实际输入405672 bytes、hasImages=false，65536输出上限需要预留1335632，超过剩余额度；52730输出的1233184可承担，52731的1233192不可承担。此为请求预留不匹配，不能记为已花完额度。原案例已停止，不重开。

## 契约

1. `PiSessionOptions.requestOutputLimit` 是可选可信异步策略，接收当前真实请求元数据；调用点位于实际 inputBytes/hasImages 计算后、费用估计和 beforeRequest 前。仅接受 positive safe integer 且不超过原配置/声明 cap。拒绝或非法结果在 provider 前失败。
2. 当前请求的预留元数据、报价以及原生 `originalStream.maxTokens` 严格共享有效 cap。新增 await 期间输入变化必须拒绝或发送绑定的一致快照，不能按旧小输入支付新大请求。未提供策略的现有路径保持兼容。
3. factory 只给 validation coding author 及既有同 coding-role repair author 接策略。reviewer、formal、planner、design、art 保持原逻辑。
4. 策略用原 `validationAuthority.remainingMicroCny` 与 `validationReservation`（含现有图片1000000输入单位规则），保留原 cap 若可承担；否则选择最大可承担 cap，最低阈值固定为 `min(4096, 原 cap)`。不得削弱字节保守估算、假设缓存命中、加预算、借角色余额、扩窗口或改调用次数。
5. 最终 `controller.reserve` 对最新余额原子核验保持。选择后余额 race、unknown、deadline、输入费用已不可承担或floor不足，全部零发送；不重算后自动retry。length仍为incomplete，缩减下限不代表一定完成。
6. auto compaction与新增调用编排不在本卡；现有手动compaction受busy/failure限制保持。

## 免费验收与状态边界

使用无真实会话内容的合成405672-byte context，经实际Pi边界证明原路径拒绝且零发送、有效cap52730假provider一次且网络0，实际 metadata/报价/发送一致。覆盖52731、NaN/negative/fractional/unsafe/above original、await输入变化、余额race、unknown、deadline、input/floor以及生产factory接线与非目标兼容。复用旧已审重型迁移fixture证据。

仅 source/free-fixture 工作，无新 paid/window/human/game通过；作者不得读取真实ledger/key/用户对话/实际sessions，也不读写参考安装。标记目标为 `VALIDATION_CODING_OUTPUT_CAP_SOURCE_READY`，必须以独立规格与质量批准的 exact SHA 为准。
