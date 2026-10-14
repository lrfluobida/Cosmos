# COS-92 持久浏览器启动截止与准备校验

状态：`PERSISTENT_BROWSER_LAUNCH_SOURCE_READY`，本卡 source scoped complete；GitHub当前open，待Root公开源码审批与关闭。计划 `4472e7bdea4227b7fb671880c0862628703943c6` 已独审 PLAN_APPROVED，无剩余 finding；[公开批准](https://github.com/lrfluobida/Cosmos/issues/93#issuecomment-6180438181) 已由 Root 精确读回。Issue [#93](https://github.com/lrfluobida/Cosmos/issues/93)，id5856929672，父 #1。依赖 COS37/COS52 持久浏览器路径及 COS91 / #92 的实际 C14 结果。

专职作者 `cos92_implementer`；独立 reviewer 与唯一 merger 由 Root 指派。分支 `codex/cos92-browser-launch`，复用 managed worktree `E:/CodexData/.codex/worktrees/cos76-transfer-case8/Cosmos`，起点为已解冻主线 `b20e9a43f26712a1f5a13468057df46b6c012b69`。[实施计划](../plans/2026-10-15-cos92-browser-launch.md)。本次先提交两份文档，独审批准后才修改生产实现；共享 tracking 由另一作者维护。

实现基线已合入 Root 指定 `2aca018c59a9fd16ac7b0a318139958f53e5af06`（仅 C14 文档），本分支 merge `dd05d246d38997e7ceb983d5f8804fdbccb9ea8d` 保留计划提交。独立 reviewer `cos92_reviewer`，唯一 merger `batch_c14_cos92_merger`；作者不合 main、不 push。

## 事实与缺口

- C14 生成 10 文件 / 35,771 字节，作者最后自检、capture、candidate v1 与正式构建输入一致，正式 TypeScript/Vite 退出 0。首段持久浏览器在 15 秒启动界限失败，21 步全部 skipped，无 session，PID/退出事实为 null；C14 仍失败且身份已消费。
- `bounded` 的 Promise.race 不取消迟到的 `ownedChild.prepare`。真实 lifecycle 在 prepare 之后、spawn 之前也没有本地截止核查。原运行的 `checkValidationIdentity` 已执行 `expire` 和 `requireActive`，不能替代这段局部寿命。
- 原只读样本：一次源码检查 873.523ms、历史校验 368.514ms、Git/固定输入身份 329.532ms。继承路径静态推导为一次绑定回调 12 次 validationScope / 24 次源码检查；约 20.96 秒是外推，历史完整链耗时与当时是否 spawn 均未知。
- 本次真实 lifecycle + 临时 OwnerLock 的模拟时钟 RED：超时后迟到 prepare 留下 null ticket、owner.close 拒绝；ticket 写入后恰到截止仍调用一次被测试拦截的 spawn。0pass/2fail/0skip，691.1629ms，未启动 OS 浏览器。
- 小型非继承真实 host 夹具的两次独立 `bindPreparedCandidate`，各实测 13 次 requireValidationHost / 13 次 readScope，429.516ms / 440.323ms。重复来自 `requireCurrent` 内 verify 后又直接 verify，非继承路径另含 design seal 的 guard；它不是 C14 的 12 次整链测量。计数 RED 0pass/1fail/0skip，15378.3635ms（含夹具准备）。原始位置及首次仪器修正见计划。

## 最小设计

### 1. 同次调用内复用已验证的输入

保留每次外部操作的新鲜来源、任务、案例、预算回执、原截止及取消检查。`runtime-host.ts` 的私有 requireCurrent 返回本次 verify 得到的 PreparedInputs；公开 preparation.requireCurrent 仍返回 void。bindCandidate 使用同次返回值，保留末尾 guard 以及 bindTransferAcceptance 的实际文件核验；不存入字段、Map、全局或跨调用缓存。

`entrypoint-host.ts` 的私有 requireDispatch 可接收当前 candidate：它仍执行原 scope、任务与 authority 核验，再在 preparation.requireCurrent 与 preparation.bindCandidate 之间选择一个完整操作。consumer.requireCurrent 使用该候选分支，替代同次 requireDispatch 后再次 bindCandidate。普通派发路径保持原分支。预计非继承 bind 的 scope 从 13 降到 8，继承组合路径从静态 12 降到 6；这是待回归验证的计数目标，不能据此宣称 15 秒内实际浏览器成功。

若这两处删减不足以满足现有启动界限，保留实际耗时与失败，再单独诊断剩余开销；不新增通用授权缓存、跳过 fresh guard 或提高超时。当前问题已证明的生命周期修复不依赖性能推断。

### 2. 本地启动寿命穿过真实 prepare 边界

runner 为每次 open 建立同一绝对启动截止与 AbortSignal，传给 OwnedAcceptanceLifecycle.open；超时、原取消及 open 失败时同步取消该寿命。persistent 的内部 bounded、prepare 与 prespawn 共用它，保留现有 15 秒及原运行清理余量。直接调用 lifecycle 的夹具仍建立等价局部寿命。

`ownedChild.prepare(launch)` 接收可信 `{ signal, deadlineAt }`，返回本次专属 `{ ticket, register(pid), releaseUnspawned() }`。nativeIO 在 binding 前后检查，并传入 RunController.prepareOwnedChild 的可选局部 guard；两个返回回调只闭包捕获这张 ticket，不接收调用方选票。controller 在原身份检查后、OwnerLock 持久化意图前检查；持久化期间取消则在返回 ticket 前结清本次未 spawn 意图。取消不等待无响应的 binding 才生效；binding 即使迟到返回也不能继续造 ticket。

persistent 始终观察 raw prepare promise，不能只接收 bounded race 的赢家。每次启动另建 completion promise；nativeIO 用独立 ready promise 交付 handle，OwnedWork 则继续等待 completion，直到 persistent 同步将子进程交给既有登记/退出路径，或等待 exact release 完成。单一 attempt 状态决定 spawn 与 release，二者不能同时发生；race 已拒绝时，迟到 handle 仍进入同一释放路径。prepare 拒绝且没有 ticket 时 completion 也须结束；release 失败使 completion 失败并保留意图和原错误，结束跟踪不等于清理成功。若 prepare 始终不返回，现有 drain 截止失败且保留 owner，不伪造已清理。

persistent 在 prepare 完成后立刻检查局部寿命，且从最后检查到 spawn 调用之间无 await。生命周期独占本次 ticket 与 spawnStarted 状态；一旦调用 spawn，不能走无进程清理分支。已经得到 PID 时先登记、保留 PID，即使随后身份或截止失败也按原 owned process 路径终止和核验退出。

### 3. 只结清有本次未 spawn 证据的确切 ticket

在 OwnerLock → SnapshotStore → RunController 增加窄 `releaseUnspawnedChild(ticket)`，仅由上述本次 prepare/prespawn 取消路径调用。OwnerLock 在现有串行队列和 owner token 核验下要求该 ticket 存在且 pid===null，只删除这一项；未知、已登记 PID、变更 owner 或已关闭 owner 均拒绝。本次返回闭包不能选择其他尝试的 ticket，释放后其他未登记 ticket 必须原样保留。controller 的 childTasks 映射同步移除；取消后清理不要求运行重新 active，也不能越过 close/persistence-failed 状态。

持久化后取消的回滚在原 OwnerLock 串行操作内完成，不递归等待自己的串行队列。外层路径只有本地 spawnStarted===false 才允许调用释放。release 失败保留错误与意图，不能把未证明的清理标成通过。原 recovery 对遗留 null ticket 的拒绝不改，不清理历史 C14 意图，不伪造 PID。

## 验收边界

用 deferred gate 和模拟时钟覆盖 binding/prepare 迟到、ticket 后 spawn 前截止、正常一次 spawn/register、已登记 PID、原运行取消/截止、来源变化、exact ticket/foreign ticket/owner 变化及 close/drain 竞态。必须另测 ticket 已持久化但 handle 交付被 gate 阻塞：abort 并开始 drain，确认 drain 尚未成功；之后交付 handle，确认零 spawn、零残留本次意图，drain 完成且 owner 可关闭。测试真实 lifecycle、nativeIO 接线、controller/store/OwnerLock，确定性竞态替换 OS spawn/CDP 与 provider transport。

再运行一项隔离 TEMP 的免费真实 Edge 正例，复用现有 media-observations 正例验证 prepare→register（CDP 前）→CDP/PID/profile 身份→完整退出，并保留原始报告。无需完整浏览器矩阵；该正例不重放 C14，不接触真实账本或付费 provider。

计数与耗时在同一夹具、同一输入环境前后比较，第二次操作须重新检查；不以计数外推代替 C14 完整链计时。仅跑受影响免费回归、typecheck/build、UTF-8 中文回读及 diff check，复用无变化证据。独审实际 diff 后由唯一 merger 集成；SOURCE_READY 只表示源码范围完成，不表示实际游戏、COS16/COS18、完整经典或 human 通过。

本任务不运行 paid/provider/新真实窗口，不重跑 C14，不读写真实 ledger/controller，不改生成游戏或参考安装，不追加预算。共享 ¥150、phase ¥30、正式生成 ¥200/12h 及优化目标 ¥100/6h 保持。

## 作者实现与免费验证

Task1 `f9f43eb7441db1bf5b47efc08e49fc0dbe0d0bb4` 已获独立 TASK1_DIFF_APPROVED，无 finding，17/17 原绑定/来源回归复用。追加真实 consumer 回调代表2/2：非继承两次各9 scopes、573.413/549.744ms；继承两次各6 scopes、2076.790/1874.086ms。小型TEMP夹具真实调用链通过；旧C14完整链耗时仍未知。

Task2 使用 `entrypoint-host.ts` 内的 `createPersistentOwnedChild` 作为 nativeIO 的真实交接实现，直接由测试调用。启动10项覆盖外层runner、迟到binding/handle、原停止/截止、exact prespawn释放、登记PID与清理失败；ownership14项和其余受影响回归合计59/59、0skip。generic host15/15、0skip。真实TEMP Edge正例1/1、0skip：PID13640，登记先于CDP，profile一致、closeEvent/exitConfirmed/PID已不存在均true，exit0、无强制终止或provider调用。证据与命令见计划。

生产typecheck/build退出0；六个新增/受影响测试文件strict退出0。generic-persistent-host.fixture的单独strict仍有4个原有诊断，已对完整旧生产接口与当前接口做内存编译对照，精确一致；未扩大修改。所有编辑文件UTF-8/LF、中文回读与diffcheck通过。没有新付费或真实C14运行，实际游戏与human结论保持。

最终独审另发现迟到release失败未传播到生产drain，已按P2修正：只保留原生交接明确报告的清理错误，公开drain在等待结束后连同原cause拒绝，operation移除后也不丢失；普通取消语义保持。公开路径RED后，定向27/27与补充回滚传播1/1通过，详见计划。原六文件strict命令成功但无输出，Tee未创建原列日志；已撤回不存在的路径，保留实际工具返回的exit0证据。

## 已审集成

作者 `cos92_implementer` 最终 `ffa0ce2918735f5b21b22c4373a390b156e63d33` 经 `cos92_reviewer` 独立规格→质量 APPROVED，无剩余finding；唯一merger `batch_c14_cos92_merger` 合入 `e74815f468b7158b5555ca2e5887ad3459b74dda`。主线src/tests与批准提交完全一致；typecheck/build退出0，迟到handle、正常spawn/register、两类公开drain失败与普通取消短集成5/5、0skip，4151.1296ms；命令及三个主线原始日志见计划。

已审Task1 17/17、受影响59/59、generic15/15、consumer2/2、真实Edge1/1、P2定向27/27及补充回滚1/1和affected strict证据复用，generic fixture的4条既有strict诊断保持。main保持unfrozen；C14原冻结`b20e9a43f26712a1f5a13468057df46b6c012b69`的失败/已消费与closure20历史保持，完整链诊断尚未执行。没有新付费、C14重放或真实账本操作；本卡源码完成不代表实际游戏、COS16/COS18、完整经典或human完成。
