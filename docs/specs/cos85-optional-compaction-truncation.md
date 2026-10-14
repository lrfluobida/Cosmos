# COS-85 保留可选摘要截断后的原作者会话

状态：**SOURCE_NOT_READY / plan review pending**。Issue [#86](https://github.com/lrfluobida/Cosmos/issues/86)，id5849778421；父[#1](https://github.com/lrfluobida/Cosmos/issues/1)，依赖COS79/84。作者 `cos76_implementer`，独立reviewer `cos77_implementer`，唯一merger `batch75_76_merger`。

## 问题与范围

现有实际Pi/native夹具已复现：可选自动摘要length已结算且未保存checkpoint，原作者仍被共享incomplete锁终止。Root的1项有效RED及命令见[计划](../plans/2026-10-14-cos85-optional-compaction-truncation.md)。C11末次请求属于摘要是源码与时序推断；本卡不把8192上限当作请求类型的直接证据。

仅在当前可信自动摘要操作内，以操作身份识别已成功结算、正确model/known usage且无其它fatal/abort的length。SDK必须丢弃部分摘要和工具调用；原projection完整保留、无新checkpoint，finally恢复settings并关闭本session后续自动摘要。原next-turn继续同task/attempt，下一普通请求仍经过所有预算/source/窗口/次数准入；不足则原样停止，不新prompt、不重试、不清除全局失败锁。

普通author length、manual/overflow以及unknown、model、accounting、取消、截止、权限/source、非法额度等失败仍终止。split摘要的每笔真实费用保持，无任何退款或未知费用豁免。不改SDK、factory、ledger/schema、CLI或来源校验性能策略，不改C11历史或复制其代码。

## 验收与协作

生产预期仅`src/providers/pi.ts`，测试沿现有compaction fixture/test与Pi测试。单摘要/split第二摘要截断的RED→GREEN须实际经过factory/controller/Pi/native，证明原context、费用、settings、同attempt后续准入及无摘要重试；后续普通拒绝和所有fatal边界仍保持。source/compiled定向代表、typecheck/build/strict和UTF-8/diff检查通过，exact独审后才可标记 **OPTIONAL_COMPACTION_TRUNCATION_SOURCE_READY**。

本卡只免费源码及合成fixture，不读取真实ledger/session/key，不恢复C11或创建下一paid案例。共享¥150、COS16组¥10、正式¥200/12h保持，COS16/COS18、完整经典及human状态不提升。共享tracking由sole merger登记。
