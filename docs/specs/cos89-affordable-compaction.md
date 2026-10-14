# COS89 避免在编码请求仍可准入时提前压缩上下文

状态：**SOURCE_NOT_READY / PLAN_APPROVED / SOURCE_REVIEW_PENDING**。Issue [#90](https://github.com/lrfluobida/Cosmos/issues/90)，id5854211592；父#1，依赖COS79/COS85/COS88。[实施计划](../plans/2026-10-15-cos89-affordable-compaction.md)。专属implementer `cos89_implementer`，独立reviewer `cos89_reviewer`，唯一merger由Root指定。计划exact `66c51d6a05c5d833242ade918f480a5655926859` 已独立批准、无阻塞finding。

## 问题与范围

factory原预算摘要规则在inputBytes至少131072、完整输出预留超过余额一半时选择摘要；因此无图片B=131072、cap65536、余额1067661µ时，786432µ普通请求完全可付仍触发。Pi临时reserveTokens等于模型窗口，使native阈值为0；keepRecent16000保持。这解释触发策略，不能证明模型动机、重复读取的因果或实际生成改善。

最小修正：保留128KiB门槛，只有 `validationReservation({...request, maxOutputTokens: min(4096, request.maxOutputTokens)}) > current.remainingMicroCny` 才选择预算摘要。等额下限可付时保留上下文，交原普通输出策略选择最大可付cap。

仅改必要factory谓词、定向测试和本卡/计划。保留原case/window/deadline/max-output/abort绑定、author/同role repair范围、实际reserve/admit/settle、unknown/model/accounting守卫、摘要cap、近期保留、length恢复、manual/overflow与原失败锁。不新增预算、时间、请求数、权限、计划视图或minify。

## 免费验收

先RED后GREEN，真实factory/controller/Pi/native与fake provider/network0证明：旧半额条件成立、普通下限可付时没有摘要或checkpoint，原context保留，实际普通cap与费用合法；覆盖完整cap、缩减cap、下限等额/低1µ、图片、stale authority及取消。下限不可付仅允许原摘要尝试，摘要自身不足仍由实际准入拒绝。

旧native夹具依赖旧半额规则，需要最小合成压力调整后重跑受影响代表，保留生命周期断言；未变COS85及输出策略通过证据复用。typecheck/build/affected strict与UTF-8中文回读/diffcheck通过，精确SHA独立规格→质量批准后才可标记 **AFFORDABLE_CODING_COMPACTION_SOURCE_READY**。

## 运行边界

基线 `388defc543ab4445b5446be6618215a61785168c`，隔离分支 `codex/cos89-affordable-compaction`。计划时C13继续冻结版本；Root后续通知C13结束、closure19完成并明确解除冻结。本作者仍不整合main。无paid、真实ledger/session/key读取、运行中提示注入、C13复跑或结果改写。共享¥150、COS16组¥10、正式¥200/12h保持，COS16/COS18、完整classic与human状态不提升。

## 作者实现证据

生产仅factory谓词。真实链3有效RED→3GREEN：旧半额策略实际发送摘要；新策略在B131072、余额1067661/500000/294912µ时保留projection、0summary/0checkpoint，发送普通cap65536/29732/4096，实际元数据/预留/cap一致。

factory source28/28通过，包含图片floor等额/低1µ、128KiB低1byte、stale authority/取消/unknown及既有输出/repair代表。原native矩阵31pass/2fixture清理fail；按controller.stop已自动取消未派发行的既有语义修正重复cancel后，仅受影响2/2通过，其他31证据复用。原length/no-benefit/no-op与fatal生命周期断言保持；新夹具以真实临时reserve将余额降至floor−1，真实factory选择后在hook结束cancel释放，每个临时行费用0且从未admit。没有强制选择、修改grant或永久压低成功续行额度。

dist7/7、typecheck/build/affected strict退出0；strict补项目已有allowJs解决既有mjs导入声明问题，未放宽strict。所有原始输出、时长与未通过尝试见计划。源码等待独立审查；本卡不宣称实际游戏进展或生成改善。
