# COS-85 保留可选摘要截断后的原作者会话

状态：**SOURCE_NOT_READY / PLAN_APPROVED / implementation review pending**。Issue [#86](https://github.com/lrfluobida/Cosmos/issues/86)，id5849778421；父[#1](https://github.com/lrfluobida/Cosmos/issues/1)，依赖COS79/84。作者 `cos76_implementer`，独立reviewer `cos77_implementer`，唯一merger `batch75_76_merger`。

## 问题与范围

现有实际Pi/native夹具已复现：可选自动摘要length已结算且未保存checkpoint，原作者仍被共享incomplete锁终止。Root的1项有效RED及命令见[计划](../plans/2026-10-14-cos85-optional-compaction-truncation.md)。C11末次请求属于摘要是源码与时序推断；本卡不把8192上限当作请求类型的直接证据。

仅在当前可信自动摘要操作内，以操作身份识别已成功结算、正确model/known usage且无其它fatal/abort的length。SDK必须丢弃部分摘要和工具调用；原projection完整保留、无新checkpoint，finally恢复settings并关闭本session后续自动摘要。原next-turn继续同task/attempt，下一普通请求仍经过所有预算/source/窗口/次数准入；不足则原样停止，不新prompt、不重试、不清除全局失败锁。

普通author length、manual/overflow以及unknown、model、accounting、取消、截止、权限/source、非法额度等失败仍终止。split摘要的每笔真实费用保持，无任何退款或未知费用豁免。不改SDK、factory、ledger/schema、CLI或来源校验性能策略，不改C11历史或复制其代码。

## 验收与协作

生产预期仅`src/providers/pi.ts`，测试沿现有compaction fixture/test与Pi测试。单摘要/split第二摘要截断的RED→GREEN须实际经过factory/controller/Pi/native，证明原context、费用、settings、同attempt后续准入及无摘要重试；后续普通拒绝和所有fatal边界仍保持。source/compiled定向代表、typecheck/build/strict和UTF-8/diff检查通过，exact独审后才可标记 **OPTIONAL_COMPACTION_TRUNCATION_SOURCE_READY**。

本卡只免费源码及合成fixture，不读取真实ledger/session/key，不恢复C11或创建下一paid案例。共享¥150、COS16组¥10、正式¥200/12h保持，COS16/COS18、完整经典及human状态不提升。共享tracking由sole merger登记。

## 实现与证据

计划 `c108e9a797e708167f289d8b05227900be765a80` 已独立PLAN_APPROVED，无finding；测试前并入docs-only main，review base为 `ecd8d8e0c3f28e6d8f4cd34ea6219342900b9328`。生产仅`src/providers/pi.ts`，另3个既有fixture/test与本卡/计划。

真实单摘要及split第二摘要2 RED→2 GREEN；compaction source30/30，摘要费用收紧断言后affected2/2；Pi定向回归最初7/8，新增manual测试断言错误修正后1/1、其余7项复用，生产未因该误断言改变。dist Pi/factory核心及拒绝6/6；typecheck/build/affected strict退出0。原始TAP、命令与确切时长见计划，strict只有当次工具exit0、无独立日志。

成功代表实际保留原entries/projection与每笔摘要费用、没有checkpoint或部分工具执行、同attempt后续普通请求经原guard及合成文本capture。后续预算不足、unknown/model/accounting/cancel/close/deadline/source及历史变动仍停止，普通author/manual length保持fatal；settings恢复且本session不重试摘要。无新实际游戏、窗口或费用，等待最终exact源码独审。
