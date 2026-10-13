# COS77 · 按实际请求与角色剩余额度收缩编码输出上限

状态：VALIDATION_CODING_OUTPUT_CAP_SOURCE_READY / PLAN_APPROVED / scoped complete / closed。稳定任务 ID：COS-77。Issue：[#78](https://github.com/lrfluobida/Cosmos/issues/78)，id5834357885；父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)。

专属 implementer `cos77_implementer`；独立 reviewer `cos76_implementer` acting COS77 reviewer；唯一 merger `batch75_76_merger`。实施计划：[2026-10-14-cos77-request-output-cap.md](../plans/2026-10-14-cos77-request-output-cap.md)。依赖已有 COS59 请求窗口、COS75 origin 守卫、COS76 当前任务与预算 authority。

exact `9d0efc6b362193d81c7fd5c96829a85e399eb5a3` 已由独立 acting reviewer 实际规格→质量 APPROVED、无 findings，合入 `b22120bc5d1012da2ac9df5fc06491b10f6a03e7`。[公开批准](https://github.com/lrfluobida/Cosmos/issues/78#issuecomment-6151413430)、closed(completed)及父勾选已由Root精确读回；本卡source/free-fixture scoped complete。

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

## 作者实现与证据

计划 exact `58a9905df01a137b5b1d6310cf167a4b1e878125` 已独立 `PLAN_APPROVED`。生产改动仅Pi adapter与role factory；异步策略与预留后窗口检查均绑定同一输入快照，原输入发生变化保守拒绝，已预留时报告not_sent。

新增source覆盖共32条：Pi17条与factory/controller15条均有通过证据；新增native SDK工具路径的测试断言修正及按影响范围复用记录见计划。merger已读原31/32与修后单条1/1保存TAP；既有SDK/output cap/request window/timeouts回归39/39（4775.3327ms）、compiled Pi/factory/repair代表6/6（5412.8045ms）为作者当次tool输出及计划记录，未另保存TAP，按原批准证据复用。源码build/typecheck及新增测试strict检查通过。所有provider为fake、network0，未读取真实会话或账本；这些证据不代表原C8重开或游戏生成通过。

主线typecheck/build退出0，生产factory选择52730并由Pi发送同一预留cap、final-window输入漂移拒绝代表2/2、0skip，TAP4155.0311ms，原始输出 `C:/Users/26557/AppData/Local/Temp/cos77-merge-integration.tap`。输入漂移发生在admission之后时已有账本admission/events和not_sent receipt，再由cancel(provenNoCost)释放预留；零发送不表示账本零变动。主线保留原C8/closure14事实及原审批源码字节，不启动C9，无新增实际paid/window/human/game。
