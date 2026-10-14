# 原生迁移 C12：截止清理，末次作者自检失败

记录日期：2026-10-15。实际结果来自Root的安全运行汇总、`cos86_reviewer`独立批准的结果与文件核对，以及Root已精确读回的公开结果。本次文档归档未读取真实ledger/session/key，未修改游戏或重跑构建。

## 实际结果

- 冻结源码：`3cde457f77ef8990d73a650319b76900df3cdc11`。
- 52次请求均已准入和结算，新增 **¥1.664926**，共享累计 **¥14.467801**；未知费用和预留均为0。
- 结果为`failed`，coding唯一attempt `13fc5130-fb5b-4bf4-bc57-80d393ecb809`为`cancelled`。既定的截止前5秒自动清理定时器触发；没有延长原45分钟窗口。
- journal只有origin，registry candidates为空，host-result不存在；无handoff/capture、正式候选、正式build/browser/review/repair/accepted，用户体验未确认。复用的C5 design/art仍passed。
- 本轮沿原共享¥150能力验证授权执行，没有新增C12专属人工确认；这与最终用户体验验收是两个不同状态。

| 时间点 | 2026-10-14 UTC或时长 |
| --- | --- |
| 开始 | 16:12:55.983 |
| 原截止时间 | 16:57:55.983 |
| 第一次作者自检调用／返回 | 16:33:06.795／16:37:38.204 |
| 第二次作者自检调用／返回 | 16:54:47.456／16:57:22.672 |
| 截止前5秒定时器触发 | 16:57:51.053 |
| 结果结束 | 16:57:51.996 |
| 总用时 | 2,696,013毫秒，即44分56.013秒 |

## 两次自检与当前作者文件

第一次`check-game-build`的TypeScript/Vite退出码均为0，工具总耗时271.409秒，Vite自报994毫秒。第二次工具耗时155.216秒，TypeScript退出码2，错误为`src/boardScene.ts(150,18): TS2339: Property 'on' does not exist on type 'AnimationState'`。工具总耗时与Vite自身耗时范围不同。

当前作者输出7个文件，共36,508字节，与第二次失败自检副本`check-62Irti`逐字节一致。与第一次通过副本`check-MLs3Pc`相比，`index.html`均为5,222字节但内容不同；`src/boardScene.ts`从11,714变为12,018字节；其余5个源码文件相同。因此第一次自检通过不能用于当前文件版本，也没有形成正式游戏验收。

Root已将两次自检的现有TEMP输出只读保存在私有目录`.cosmos/reconciliation/2026-10-13-c6-provider-usage/case12-preserved/`，逐文件元数据见其中`evidence.json`：

| 保存副本 | 文件数／字节数 | 已有内容 |
| --- | ---: | --- |
| first-passed | 83／1,673,634 | 7个源码文件、固定配置、媒体及dist |
| last-failed | 46／261,244 | 7个源码文件、固定配置及媒体，无dist |

每个复制文件均核对与源文件复制前后字节一致，并保存逐文件SHA；排除了`node_modules` junction。保存操作没有手改游戏或重建，第一份已有dist不代表当前版本通过，也不构成正式accepted产物。

## 压缩恢复与工具元数据

Root记录了6次成功原生压缩。此后已结算请求`cc582695-8bcc-423b-a5ab-c9cac1a88baf`为`stopReason=length`、输出8192，原会话随后继续普通请求与工具调用。[COS85已审源码](../specs/cos85-optional-compaction-truncation.md)与该时序支持“可选摘要截断后保留原会话并继续”的推断，但请求kind没有持久化，不能把摘要阶段写成直接实测标识。本轮最终停止由截止定时器触发。

本轮工具元数据为45次read、7次write、5次edit、2次check-game-build；当前计划读取14次，其中10次在第一次自检后。工具错误包括`Validation scope check timed out`和截止时最后一次edit被中止。这些次数不用于推断作者动机。

case stop中的`manual`和旧C6标签沿用共享清理路径文字，不代表人工中断。`Historical source changed` gap出现在读取前的verify被中止之后，不能作为历史来源文件字节改变的证据。

## closure18与后续边界

Root已一次执行closure18，释放C12未使用额度 **¥1.335074**。全部旧历史与已结算费用保持；启动器、Node及check workers均已退出，owner/locks已释放。独立结果批准后，Root重新核对closure18及进程状态，并已解除main冻结。

| 核对项 | closure18之后 |
| --- | ---: |
| revision | 2770 |
| 已停止案例 | 20 |
| delegation记录 | 12 |
| 已关闭grants | 100 |
| closure审计 | 18 |
| 未知费用、预留 | 均为0 |
| 原COS16预算组可分配额度 | ¥2.540822 |

[COS16实际结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-6174293178)和[C12入口实际结果](https://github.com/lrfluobida/Cosmos/issues/87#issuecomment-6174294365)已由Root精确读回。COS86源码卡保持closed，COS16保持open；COS16/COS18、完整经典基准和最终用户试玩仍未完成。C12身份已消费，不能重启或延长；原COS16组剩余额度不足以覆盖新的固定¥3案例。本记录不授权新案例、扩大预算或新增付费。
