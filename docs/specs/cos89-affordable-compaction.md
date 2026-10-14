# COS89 避免在编码请求仍可准入时提前压缩上下文

状态：**SOURCE_NOT_READY / PLAN_REVIEW_PENDING**。Issue [#90](https://github.com/lrfluobida/Cosmos/issues/90)，id5854211592；父#1，依赖COS79/COS85/COS88。[实施计划](../plans/2026-10-15-cos89-affordable-compaction.md)。专属implementer `cos89_implementer`；独立reviewer与唯一merger由Root指定。

## 问题与范围

factory原预算摘要规则在inputBytes至少131072、完整输出预留超过余额一半时选择摘要；因此无图片B=131072、cap65536、余额1067661µ时，786432µ普通请求完全可付仍触发。Pi临时reserveTokens等于模型窗口，使native阈值为0；keepRecent16000保持。这解释触发策略，不能证明模型动机、重复读取的因果或实际生成改善。

最小修正：保留128KiB门槛，只有 `validationReservation({...request, maxOutputTokens: min(4096, request.maxOutputTokens)}) > current.remainingMicroCny` 才选择预算摘要。等额下限可付时保留上下文，交原普通输出策略选择最大可付cap。

仅改必要factory谓词、定向测试和本卡/计划。保留原case/window/deadline/max-output/abort绑定、author/同role repair范围、实际reserve/admit/settle、unknown/model/accounting守卫、摘要cap、近期保留、length恢复、manual/overflow与原失败锁。不新增预算、时间、请求数、权限、计划视图或minify。

## 免费验收

先RED后GREEN，真实factory/controller/Pi/native与fake provider/network0证明：旧半额条件成立、普通下限可付时没有摘要或checkpoint，原context保留，实际普通cap与费用合法；覆盖完整cap、缩减cap、下限等额/低1µ、图片、stale authority及取消。下限不可付仅允许原摘要尝试，摘要自身不足仍由实际准入拒绝。

旧native夹具依赖旧半额规则，需要最小合成压力调整后重跑受影响代表，保留生命周期断言；未变COS85及输出策略通过证据复用。typecheck/build/affected strict与UTF-8中文回读/diffcheck通过，精确SHA独立规格→质量批准后才可标记 **AFFORDABLE_CODING_COMPACTION_SOURCE_READY**。

## 运行边界

基线 `388defc543ab4445b5446be6618215a61785168c`，隔离分支 `codex/cos89-affordable-compaction`。当前C13继续冻结版本；Root解除冻结前不整合main。无paid、真实ledger/session/key读取、运行中提示注入、C13复跑或结果改写。共享¥150、COS16组¥10、正式¥200/12h保持，COS16/COS18、完整classic与human状态不提升。

当前只有计划与任务说明，没有实现或验证结论。
