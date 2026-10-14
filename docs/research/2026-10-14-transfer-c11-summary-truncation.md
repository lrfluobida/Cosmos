# 原生迁移 C11：自检通过后输出截断

记录日期：2026-10-14。实际结果来自Root提供的安全运行汇总、已精确读回的公开结果，以及`cos77_implementer`对作者文件与自检副本的独立核对。下文源码诊断单独标明推断；本次未读取真实ledger/session/key，未修改游戏或重跑构建。

## 实际结果

- 冻结源码：`2a7a291389b58bbd7dd4e4a4f34a61f7237e0141`。
- 41次请求均已准入和结算，新增 **¥1.336555**，共享累计 **¥12.802875**；未知费用和预留均为0。
- coding唯一attempt为`failed / insufficient_evidence`，result与host-result一致。journal只有origin、候选目录为空；无正式handoff/capture、候选build/browser、独立coding review、repair或accepted，用户体验未确认。复用的C5两阶段仍passed且独立review approved。
- 作者生成6个UTF-8文件，共37,377字节。cos77已确认与成功自检临时目录`check-M040lo`中的六个原始源码文件逐字节一致，未人工修改或重新构建。

| 时间点 | 2026-10-14 UTC或时长 |
| --- | --- |
| 开始 | 13:54:37.457 |
| 原截止时间 | 14:39:37.457 |
| 作者自检调用／返回 | 14:14:59.726／14:18:24.375 |
| 最后请求准入 | 14:24:42.521 |
| 作者收到截断错误 | 14:25:11.938 |
| 结果结束 | 14:25:41.350 |
| 总用时 | 1,863,893毫秒，即31分03.893秒 |

唯一一次`check-game-build`的TypeScript/Vite退出码均为0。工具总耗时204.649秒，Vite自报844毫秒；两者范围不同。自检通过没有形成正式候选或完整游戏验收。该轮早于截止时间结束，费用也低于¥3上限，不能归因为预算耗尽或截止清理。

## 截断与工具元数据

最后请求`8f3f9ec7-7f13-475b-ab50-a4ff8ac59255`的计费记录为`stopReason=length`，准入`maxOutputTokens=8192`、`inputBytes=38376`；usage为input10364、output8192、reasoning1209，elapsed28624.7745毫秒，**¥0.086264已结算**。随后SDK错误为`Provider output was truncated; task is incomplete`。作者error占位消息的全零usage不是该请求的账单，不能据此清零实际费用。

前一普通请求`2949f98e…`的cap为65536、inputBytes135667，正常toolUse read于14:24:39.208返回。Root记录了5次成功原生压缩，最后一次在14:23:47.794；末次请求之后没有新增compaction记录。

本轮工具元数据为39次read、6次write、2次edit、1次check-game-build；当前计划有18次读取调用，其中13次在编译通过后。三次read返回`Validation scope check timed out`，一次未授权Phaser类型路径读取被拒绝。这些次数不说明模型动机，批量返回时间也不代表单次调用耗时；三次scope超时的具体内层原因尚未定位。

## 源码诊断：确定的传播链与尚未直接标识的请求阶段

当前[Pi adapter](../../src/providers/pi.ts)在`session.isCompacting`时将摘要上限收紧至8192，再经过原输出额度策略和预算准入。普通请求也可能被余额策略收紧，`PiRequest`和[billing回执](../../src/roles/provider-budget.ts)没有持久化summary kind；`purpose=author`同时涵盖作者普通请求与摘要。因此，末次8192上限、较小输入和相邻工具事件强烈支持“摘要阶段截断”，但不是直接记录了该请求kind的实测结论。

当前源码的错误传播则可以确定：

1. `pi.ts`的guardedStream先`await report(message)`持久结算usage，再对任何`length`设置共享`incomplete`失败锁，并清空向SDK返回的失败内容。
2. 原生SDK的`getSummarizationFailure`拒绝length/error摘要。`agent-session`只有在完整摘要成功后才`appendCompaction`并刷新projection；split摘要也须两部分都成功。失败不会把部分摘要保存为checkpoint，原历史及此前成功的摘要保留。
3. SDK会捕获compaction错误并发送失败事件；Pi hook的`requireActive`及外层`run`仍重抛同一个首因。`finally`恢复compaction settings，但不会清除共享失败锁，所以摘要失败也会终止原作者attempt。

上述原生实现位于已安装SDK的`dist/core/compaction/compaction.js`（摘要校验与两段汇总）和`dist/core/agent-session.js`（保存后刷新、失败事件）。仓库已有[生产compaction测试](../../tests/providers/coding-compaction.test.mjs)明确要求length后无checkpoint、无后续ordinary dispatch，再次prompt也不新增请求；[COS79契约](../specs/cos79-coding-compaction.md)同样保留失败锁并说明8192不保证摘要完成。本次仅复用现有源码与证据，没有运行新的复现或修改此契约。

## closure17与后续边界

Root已一次执行经独审的closure17，释放C11未使用额度 **¥1.663445**；所有旧历史和已结算费用保持。启动器、Node及check workers均已退出，owner/lock已释放，main冻结已解除。case stop中的`manual`是入口正常one-shot收尾代码，不代表人工中断；旧C6 gap只是共享handler文字。

| 核对项 | closure17之后 |
| --- | ---: |
| revision | 2555 |
| 已停止案例 | 19 |
| delegation记录 | 11 |
| 已关闭grants | 95 |
| closure审计 | 17 |
| 未知费用、预留 | 均为0 |

[COS16实际结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-6170776637)、[C11入口实际结果](https://github.com/lrfluobida/Cosmos/issues/85#issuecomment-6170782350)和[COS84源码关闭](https://github.com/lrfluobida/Cosmos/issues/85#issuecomment-6169906507)已由Root精确读回。C11身份已消费，不能重跑；COS84只在源码范围完成，COS16/COS18、完整经典基准和最终用户试玩仍未完成。后续先免费复现并独立审查可选摘要截断的处理方案，不接受截断摘要、不减免费用或放宽原预算与时限，本记录不授权新案例或付费。
