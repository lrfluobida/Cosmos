# COS102：C16推箱子迁移实际中断、恢复与闭账

日期：2026-10-17。单次C16实际执行中断后，两把旧owner锁已通过受审维护入口恢复，原`main@2f84eb328e59f20d73ceccdc69ff708f7be200a5`的accountingOnly API以真实当前时间记录deadline stop并close，closure22与最终独立后核完成。Root已解冻main，唯一merger `batch_previous_boot_merger`已本地集成恢复源码；文档组合尚待发布。恢复与闭账不构成游戏验收通过。

C16已消费：v1正式构建通过，首段21步中20通过、1失败；原一次repair产出v2并通过正式构建，但仅见v2首段plan，没有对应report。原coding failed、repair running/attempt1历史未改写；repair记录不代表当前仍有活进程。[COS102 / #103](https://github.com/lrfluobida/Cosmos/issues/103)保持open/incomplete、父项未勾选，`TRANSFER_CASE_SIXTEEN_SOURCE_READY`与源码批准保持。这里的实际产物是复用C5设计、美术的推箱子迁移案例；完整经典目标游戏、COS16/COS18及human验收均未提升。

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

Root于2026-10-17 `08:19:44.180626Z`保存只读静态观察：v1 candidate的`project/index.html:175`为`<div id="stage">`，src中动态testid仅用于cell；原browser visible观察调用`locator.isVisible()`。v2的`index.html:177`已添加`data-testid="board"`。这解释了v1 selector与DOM的差异，也证明v2作者已补该属性；没有v2 report，仍不能宣称浏览器修复通过。此观察没有启动浏览器、修改候选或新增付费。

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

## 两把锁的恢复阻碍与受审维护

[中断与恢复阻碍公开记录](https://github.com/lrfluobida/Cosmos/issues/103#issuecomment-6231450336)及独审确认了两项不同前置条件：

1. shared controller锁仍记录owner PID27212与15个children。原owner及其余14个children已不在；PID8448已被本轮boot的系统进程复用，不能按PID数字终止它或视其为原child仍活着。
2. registry `.commit.lock`记录owner PID27212、`acquiredAt:2026-10-16T12:36:10.888Z`、`untrackedWriters:true`、`children:[]`。默认recover拒绝该状态，不能手改flag、删锁或直接改ledger绕过。

恢复能力由独立任务[COS103 / #104](https://github.com/lrfluobida/Cosmos/issues/104)处理，id5896315224，已原生挂父COS102/#103。设计`1d400d75919eca0100b05488534c33e4ef6a4d81`经`cos102_recovery_reviewer`批准；源码`15488a9c41677a23566c8a4d24f7addd0f5224ff`经`previous_boot_recovery_reviewer`审查为`APPROVED_SOURCE_SCOPED`、无P1/P2，已发布精确分支。默认recover语义保持，没有kill复用PID。

SOURCE证据复用：全套49/49属于最终guard修正前版本；最终affected9/9含重叠，不与49相加，默认恢复回归24/24，最终typecheck/build均退出0。B3组合使用TEMP中的原`2f84eb3` runtime、真实源码身份读取与独立Node进程的真实now，只证明维护→accounting→closure契约，不是实际游戏执行。索引见`E:/CodexData/.codex/worktrees/cos-04-media/Cosmos/.cosmos/evidence/cos103/verification-index.json`。

Root从独立已审worktree调用精确维护SHA，先registry、后controller，实际执行均在2026-10-17 UTC：

| 对象 | operation | 结果时间UTC（北京时间） | 归档 |
| --- | --- | --- | --- |
| registry | `98bf6cb7-4f02-472d-b1c4-f562208f53ff` | `08:36:12.823Z`（`16:36:12.823`） | 原157字节逐字节归档 |
| controller | `6caf44cb-6a23-49e0-bd99-94112a6fb03d` | `08:36:29.078Z`（`16:36:29.078`） | 原1085字节逐字节归档 |

intent/outcome与完整quote/decision相符，原字节已保全。两锁后核通过后，维护进程退出，后续账务由原main源码另起进程执行；没有手改flag、锁或ledger。

## 原API deadline stop、closure22与独立后核

原accountingOnly controller未注入now，于2026-10-17 `08:38:18.674Z`（北京时间`16:38:18.674`）自然记录`code:deadline`并close。原deadline仍为2026-10-16 `12:53:14.977Z`；该恢复时stop没有倒填为原截止时正常停止，也没有改为manual。revision3332→3333仅增加当前case stop、对应event/revision及run waiting_user变化，停止快照SHA256为`22531eb0b858b5586da4eca97a04872fe062a73ec14f6679219545246745b2bb`。

原closure API在独立批准精确quote/decision后一次执行，退出0，起止为`08:41:58.861Z`～`08:42:00.625Z`（北京时间`16:41:58.861`～`16:42:00.625`）：

- quote：`vacq3-a600ff9e3e8646fe0cc49d86be5739c9c633621810de22aed90d299fe71dda25`。
- decision：`allocation-closure-4cf0d6ee-56bf-471c-aa35-59ed25fe4adb`。
- 最终revision3334、120 closures/22 audits；C16仍为51 requests、settled1265722µ，共享766 requests、settled18166722µ，reserved/unknown均0。
- 释放未用分配19734278µ（¥19.734278），不是费用退款；allocated93354297µ、unallocated56645703µ。原请求、任务、attempt、repair、预算组和时钟保持。
- 最终snapshot SHA256 `34a6ba11f4e96ad1c87a6a0cfb54ae6890e07036500af1a19660e9b45aeb4fef`；receipt SHA256 `575b0ba2924156ad6393a4eec77cd437bc4c5947fb532483bc72043235678713`。

独立`cos102_recovery_reviewer`给出`PASS_C16_INTERRUPTED_RECOVERY_AND_ACCOUNTING_CLOSED`，Root接受并解冻main。`08:42:49Z`（北京时间`16:42:49`）确认无关联writer、后代进程、原端口监听、owner或guard；case剩余9187文件metadata不变，仅移除registry锁，shared仅预期snapshot更新、controller锁移除和新增精确closure来源。后核复用未变文件的既有hash证据，没有重新hash全部文件。报告SHA256为`9cd247d338b05b74a4b9fad2ae6557c5af6e6a50f0caa6f6da2d436fdaaf76f1`。

账务处理已闭环；C16实际仍interrupted/consumed/incomplete。220步、62媒体字段、DeepSeek review、promotion及原deadline内clean final未完成，C15、COS16/COS18、full classic和human状态保持。本结果不授予新run、新预算或新的repair机会。唯一merger已将已审恢复源码合入本地main `402cfb56b44e211147014691b56b49ac53dc2393`，tree与已审`15488a9`完全一致；当前尚未push，最终发布SHA另行记录。COS103为source-integrated/实际恢复完成；#104先保持open，最终发布后由Root另行关闭。

Root已发布并逐字GET核对[COS102实际闭账结果](https://github.com/lrfluobida/Cosmos/issues/103#issuecomment-6231925268)与[COS103恢复结果](https://github.com/lrfluobida/Cosmos/issues/104#issuecomment-6231925739)。公开记录保留C16 incomplete及本地合入、待组合发布的边界。

## 证据索引

私有证据根`E:/develop/Cosmos/.cosmos/reconciliation/2026-10-13-c6-provider-usage`；下表只给定位，worker、账本、模型session及私有证据不复制进Git。

| 文件 | 范围 |
| --- | --- |
| `case16-preflight-v1.json`、`case16-preflight-v1-before.json`、`case16-preflight-v1-preservation.json`、`case16-preflight-review-scope-v1.json` | 715准入、来源保全与源码mtime限定 |
| `case16-root-intent-v1.json`、`case16-watch-start-v1.json`、`case16-claim-observed-v1.json`、`case16-launch-consumed-v1.json` | 一次授权、固定来源/quote、原claim/deadline及消费 |
| `case16-interrupted-before-recovery-v1.json`、`case16-controller-owner-before-recovery-v1.json`、`case16-registry-owner-before-recovery-v1.json` | 恢复前三个逐字节备份 |
| `case16-interruption-preservation-v1.json` | 95 shared/9188 case保全清单与已知费用 |
| `case16-boot-observation-v1.json` | cold boot、PID复用、原owner缺失与因果限定 |
| `case16-v1-board-static-observation-v1.json` | v1缺board testid、v2已添加；仅静态观察 |
| `cos103-published.json` | COS103/#104原生父子关系与设计批准登记 |
| `case16-{registry,controller}-recovery-{quote,decision,result}-v1.json` | 两次精确维护、原锁归档与回执 |
| `case16-accounting-stop-result-v1.json`、`case16-stopped-snapshot-v1.json` | 原API真实now的deadline stop与close |
| `case16-closure-{quote,decision,receipt,result}-v1.json`、`snapshot-after-case16-closure.json` | closure22、释放分配和最终账本 |
| `case16-recovery-final-postcheck-v1.json` | 最终独立后核、保全边界与Root解冻 |
| `cos102-cos103-closed-update-publication-v1.json` | 两条公开结果及逐字GET核对 |

实际case根为`E:/develop/Cosmos/.cosmos/e2e/cos20-transfer-validation-16`：

- `evidence/cos20-transfer-validation-16-{coding,repair}/build.json`保存v1/v2正式构建；coding目录的`media-usage.json`保存`coverage:null`。
- `browser-evidence/cos16-transfer/cos20-transfer-validation-16-game/v1/validation-2026-10-01/cos20-transfer-validation-16-transfer-v1-start/{plan,report}.json`保存精确断言、21步和native清理；同级截图与视频仅按已核范围引用。
- v2同结构的`cos20-transfer-validation-16-transfer-v2-start/plan.json`仅有计划；对应report缺失。
- repair claim、作者自检与恢复前任务状态沿Root已读取的原记录引用，不重新读取或公开完整模型session。
