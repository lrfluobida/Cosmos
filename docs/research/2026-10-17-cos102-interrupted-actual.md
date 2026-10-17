# COS102：C16推箱子迁移实际中断记录（待收口草案）

日期：2026-10-17。本稿记录单次C16实际执行及恢复前证据；锁维护、原API停止、owner close、closure和最终独立后核仍待补证，不能作为闭账或交付结论。主线保持冻结在`2f84eb328e59f20d73ceccdc69ff708f7be200a5`。

C16已消费：v1正式构建通过，首段21步中20通过、1失败；原一次repair产出v2并通过正式构建，但仅见v2首段plan，没有对应report。恢复前快照保留coding failed、repair running/attempt1、case stop为null。[COS102 / #103](https://github.com/lrfluobida/Cosmos/issues/103)保持open/incomplete，`TRANSFER_CASE_SIXTEEN_SOURCE_READY`与源码批准保持。这里的实际产物是复用C5设计、美术的推箱子迁移案例；完整经典目标游戏、COS16/COS18及human验收均未提升。

## 来源、预检与单次授权

已审源码`d5a7a2cd94d928f9bccc78086508c5862f1954c5`的[公开批准](https://github.com/lrfluobida/Cosmos/issues/103#issuecomment-6214075389)及合入`cfc7feffb176981f057b6bc7f2b66962039229e8`保持。SOURCE的fake provider/browser证据仍只证明其原范围；既有SOURCE恢复与mtime限定见[实施记录](../plans/2026-10-16-cos102-transfer-case16.md#源码交付与主线集成记录)，没有因本次实际执行而撤回。

在冻结主线执行的生产715只读preflight返回`ready`、退出0，新增付费请求0，结束于2026-10-16 `11:12:42.09549Z`（北京时间`19:12:42.09549`）。独审结论为`APPROVED_PREFLIGHT_WITH_PRESERVATION_LIMITATION`：

- 91个shared文件与54个C5 capture文件的SHA/size/mtime精确不变；当时C16根和owner均不存在。
- 源码保全只证明干净Git身份、181个execution文件hash及锁定dependency/template字节。预检未采集源码文件的size/mtime前值，不能补称源码三项元数据精确不变。
- 原preflight证据未改写，也未为消除该记录缺口重跑；旧账本、预算、时钟和验收条件保持。

固定quote为`vq1-2d8c2808ff8727ad43bf4f67c35ba0e37f8b47000b5e141e50da6170b40edcf3`。Root在独审launcher后批准一次C16实际执行，见[启动记录](https://github.com/lrfluobida/Cosmos/issues/103#issuecomment-6214445576)及私有`case16-root-intent-v1.json`。仍使用原ledger5、非分组declaration-2：¥21为角色分配，实际新增费用硬帽¥5，claim后90分钟；shared ¥150、phase ¥30和claim前15分钟免费准备guard保持。本次授权没有自动重试或替代案例。

## 实际时间线与候选证据

下表日期均为2026-10-16。北京时间为UTC+08:00；文件mtime只表示文件最后写入记录，不代替阶段完成事件。

| 事件 | UTC | 北京时间 | 证据含义 |
| --- | --- | --- | --- |
| supervisor启动 | `11:21:37.7817283Z` | `19:21:37.7817283` | 固定source与quote，一次launcher已消费 |
| 原子claim | `11:23:14.977Z` | `19:23:14.977` | 原C16 window开始 |
| v1正式build文件mtime | `12:00:42.3819259Z` | `20:00:42.3819259` | TypeScript/Vite均退出0 |
| v1 start报告起止 | `12:07:24.506Z`～`12:08:30.266Z` | `20:07:24.506`～`20:08:30.266` | 21步全部执行，20 passed、1 failed |
| 原repair claim | `12:13:51.530Z` | `20:13:51.530` | 进入原一次修复机会 |
| repair作者首个`check-game-build`自检 | `12:32:48.037Z` | `20:32:48.037` | 两项退出0；作者自检单独记录 |
| v2正式build文件mtime | `12:37:27.5317102Z` | `20:37:27.5317102` | TypeScript/Vite均退出0，v1候选保留 |
| v2 start plan文件mtime | `12:44:17.9116013Z` | `20:44:17.9116013` | 仅证明plan已落盘，没有对应report |
| 原case deadline | `12:53:14.977Z` | `20:53:14.977` | 与claim相差5400000ms；未见正常hard stop完成证据 |

v1作者阶段累计30 requests、settled866005µ。固定验收计划为八段220步，实际只完成首段start的21步记录。失败项`start-015`属于`T16-01`，其原计划检查`[data-testid="board"]`的`visible`，expected true、actual false，83次observations后报告`Expected true; observed false`。顶层errors为空不改变此断言失败。截图中棋盘可见也不能覆盖精确DOM selector的验收结果。

该段native `prepare_authority`、`register_authority`、`browser_transport`和`navigation`均passed；HTTP为29 started/29 settled/0 rejected/0 pending，raw reads/operations pending均0。cleanup记录`forced:false`、`processExited:true`，video_stop、lifecycle_close和raw_settle通过。此首段失败不能归为native超时或强制清理失败；它的清理证据也只覆盖该段，不能证明整个C16正常结束。媒体记录`coverage:null`，没有62字段通过结论；存在视频文件及video_stop记录不等于完整视频解码验收。

[v1修复进展](https://github.com/lrfluobida/Cosmos/issues/103#issuecomment-6215311253)保留原一次repair身份。v2候选`cos20-transfer-validation-16-game@v2`与正式build已经落盘；作者自检不代替正式build，正式build不代替真实八段验收。没有v2 start report、独立DeepSeek截图review批准、精确promotion或clean final证据，不能据plan或候选存在判定这些阶段通过。

## 2026-10-17恢复会话时的保全与中断边界

恢复会话后的只读检查发现`watch-result`、`host-result`和`source-result`均缺失。worker stdout只有node started记录，worker output为0字节。原执行进程已不在，但controller owner和registry commit锁仍保留；这是恢复前观察，不是owner正常释放证明。

Root于`07:44:40.206529Z`（北京时间`15:44:40.206529`）保存保全清单：95个shared文件、9188个case普通文件及三个逐字节备份；目录reparse目标单列而未遍历。原始快照备份为18133935字节，SHA256 `f0ba6aea5e07715cfe158d0b7d5fbb7f496ae96e5f104a2b41a990da38d27251`。本稿复用该清单，没有重新hash整棵case目录。

恢复前账本状态如下；这些值尚不是最终闭账结果：

| 项目 | 保全值 |
| --- | --- |
| snapshot revision | 3332 |
| C16 task / repair | coding failed；repair running、attempt1 |
| C16 case stop | null |
| C16 requests / settled | 51 / 1265722µ（¥1.265722） |
| shared settled | 18166722µ（¥18.166722，含prior721771µ） |
| reserved / unknown | 0 / 0 |
| 既有closures / audits | 115 / 21 |

系统只读证据确认本轮Windows完整cold boot时间为2026-10-17 `07:09:16.500Z`（北京时间`15:09:16.500`）：CIM LastBootUpTime、Kernel-Boot 27（Record571331、BootType0）与Kernel-General 12（Record571324、BootMode0、同一StartTime）一致。原supervisor PID5488和已登记child PID8448如今分别指向本轮boot后创建的`svchost.exe`。这些证据足以区分当前复用PID与前一boot的进程，不能确定前一天具体中断原因、结束时刻，也不能证明C16在90分钟内正常hard stop或完成交付清理。

## 两把锁的恢复阻碍与待收口项

[中断与恢复阻碍公开记录](https://github.com/lrfluobida/Cosmos/issues/103#issuecomment-6231450336)及独审确认了两项不同前置条件：

1. shared controller锁仍记录owner PID27212与15个children。原owner及其余14个children已不在；PID8448已被本轮boot的系统进程复用，不能按PID数字终止它或视其为原child仍活着。
2. registry `.commit.lock`记录owner PID27212、`acquiredAt:2026-10-16T12:36:10.888Z`、`untrackedWriters:true`、`children:[]`。默认recover拒绝该状态，不能手改flag、删锁或直接改ledger绕过。

恢复能力由独立任务[COS103 / #104](https://github.com/lrfluobida/Cosmos/issues/104)处理。预定路径是在受审previous-boot维护能力解除两项阻碍后，使用原accountingOnly controller与close/closure API。恢复源码应从独立已审worktree的精确SHA调用，C16冻结的main/source身份保持。原accountingOnly open会用真实当前时间记录deadline stop；不能把它改写成manual，也不能倒填为原deadline时正常完成。

本草案尚不填成功值，待Root提供并经独审的实际结果后补齐：

- 两锁维护的已审源码SHA、执行回执与实际移除范围。
- 原API stop/close结果、reason/time/revision，以及费用与历史保全对比。
- closure quote、decision、receipt、释放分配和最终snapshot。
- 独立进程、端口、owner/registry锁与保护文件后核，以及main解冻与唯一merger结果。

本稿不改变源码批准，不宣告C16实际通过或闭账，不授予新run、新预算或新的repair机会。220步、62媒体字段、DeepSeek review、promotion、clean final、full classic及human仍各自缺证。

## 证据索引

私有证据根`E:/develop/Cosmos/.cosmos/reconciliation/2026-10-13-c6-provider-usage`；下表只给定位，worker、账本、模型session及私有证据不复制进Git。

| 文件 | 范围 |
| --- | --- |
| `case16-preflight-v1.json`、`case16-preflight-v1-before.json`、`case16-preflight-v1-preservation.json`、`case16-preflight-review-scope-v1.json` | 715准入、来源保全与源码mtime限定 |
| `case16-root-intent-v1.json`、`case16-watch-start-v1.json`、`case16-claim-observed-v1.json`、`case16-launch-consumed-v1.json` | 一次授权、固定来源/quote、原claim/deadline及消费 |
| `case16-interrupted-before-recovery-v1.json`、`case16-controller-owner-before-recovery-v1.json`、`case16-registry-owner-before-recovery-v1.json` | 恢复前三个逐字节备份 |
| `case16-interruption-preservation-v1.json` | 95 shared/9188 case保全清单与已知费用 |
| `case16-boot-observation-v1.json` | cold boot、PID复用、原owner缺失与因果限定 |

实际case根为`E:/develop/Cosmos/.cosmos/e2e/cos20-transfer-validation-16`：

- `evidence/cos20-transfer-validation-16-{coding,repair}/build.json`保存v1/v2正式构建；coding目录的`media-usage.json`保存`coverage:null`。
- `browser-evidence/cos16-transfer/cos20-transfer-validation-16-game/v1/validation-2026-10-01/cos20-transfer-validation-16-transfer-v1-start/{plan,report}.json`保存精确断言、21步和native清理；同级截图与视频仅按已核范围引用。
- v2同结构的`cos20-transfer-validation-16-transfer-v2-start/plan.json`仅有计划；对应report缺失。
- repair claim、作者自检与恢复前任务状态沿Root已读取的原记录引用，不重新读取或公开完整模型session。
