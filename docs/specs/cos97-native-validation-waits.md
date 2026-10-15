# COS-97 · 原生验证的权限等待与浏览器时限

状态：`design-pending / NOT_REVIEWED`。本提交只提出规格、ADR 与计划，不授权源码实施、测试、actual 或付费运行。任务 [COS97 / #98](https://github.com/lrfluobida/Cosmos/issues/98)，id5864160449，父 #1；依赖 COS52/92、COS93 已审诊断及 v3 证据、COS96 已审源码。作者 `cos97_implementer`，独审 `cos97_reviewer`，唯一 merger `batch_c14_cos92_merger`。

规划基线为已发布主线 `dd367c5dd007ecbd43e2daf5b4e29635afc87fbb`；分支 `codex/cos97-native-validation-waits`，独立 managed worktree `E:/CodexData/.codex/worktrees/cos76-transfer-case8/Cosmos`。关联 [ADR0002](../adr/0002-native-validation-waits.md) 与[实施计划](../plans/2026-10-15-cos97-native-validation-waits.md)。工程选择交由 Root 和独立 reviewer 审查；已确认的产品范围、游戏验收要求与预算保持。

## 事实与修订边界

[COS93 v3](../research/2026-10-15-cos93-v3-native-startup-diagnostic.md) 在 `84f9c8857908d9db7ecbc404c6d5afbdfdc32542` 上用时 983679ms、parent exit0。open #2869 在 14998.7753ms 超时，ticket 前的完整 binding #2870 迟到 31908.9892ms 返回；其后半与超时后的另一 binding 重叠，不能用作独立单次耗时。无重叠完整 binding #2605/#2737 已耗约 25.418/25.129 秒。六个 scope 均 returned，最长 3.777 秒，没有单项 5 秒 timeout；超时前 controller 排队仅微秒量级。没有浏览器 ticket、spawn、CDP 或身份结果。

COS96 只调整已知平面文件的每调用固定 4 路读取。唯一叶组件 A→B 为 55.8285→28.0087ms，存在热缓存与顺序偏差。v3 的 source/Git 与固定输入/history 互斥叶区间为 5.1343/8.4290/6.4491 秒；source 归零后 binding 仍约 20.283 秒。这些证据支持修订内部时限的责任边界，不能证明任何新的阶段预算会通过。

COS92 和现行代码的 **整个 open ≤15 秒** 是已审内部契约，COS93 按该契约仍为 `startup-failed`。本规格提出新的 `native-validation-waits/1`；旧报告、失败、版本、判断及原始时限字段原样保留，不能改写为旧契约通过。产品规范 4.5 要求等待、准备、验收、打包与清理计入原绝对截止；4B 的内容、数值容差、玩法、FPS 和用户体验条件没有 15 秒值。本次只修订指定原生验证路径的内部等待契约。

## 当前调用链与适用范围

基线源码的真实顺序：

```text
entrypoint-host acceptance → withCleanDelivery
  → transfer candidateConsumer → consumeTransferCandidate.guard / mount
  → nativeIO.playPersistent → executePersistentSeries
      → 原 private-profile / per-segment binding guard
      → runner: 一个 15 秒 launch lifetime
          → persistent.open: executable/profile/旧端点处理
          → ownedChild.prepare
              → 完整 verifyBinding → prepareOwnedChild ticket
          → spawn → registerOwnedChild(PID, exact ticket)
              → 再次完整 verifyBinding
          → endpoint → CDP → browser PID/profile → context
      → runner 页面、路由、视频、异常采集设置
      → goto(load): 15 秒
          → 每个 clean HTTP: verifyScope → fetch 实际字节 → verifyScope → send
      → 正常输入/观测 → 原退出及证据 → aggregate publication guard
```

`runtime-acceptance.ts` 的完整 consumer guard 仍调用 `context.requireCurrent()` → `entrypoint-host.requireDispatch(task, signal, candidate)` → scope/authority 与 `preparation.bindCandidate`。`runtime-host.ts` 内的多轮 origin guard、controller identity、实际 scope/source、history、inheritance 和 candidate/plan/design 字节核验保持。`RunController.serial` 与 identity 的 `finally` 会 expire 并可能持久化 stop；origin 的失败可以 close listener 并清除 mount，不能把这些嵌套操作当成可删除的纯重复函数。

生产 `entrypoint-host.ts` 的 candidateConsumer 总在 `withCleanDelivery` 内执行，`BrowserCandidateConsumerContext.cleanDelivery` 是必需项。其 mounted `verifyScope` 每次均依次执行 `origin.verify()`、完整 consumer binding、`cleanDelivery.requireCurrent()`；clean 分支读取前后各调用一次。当前 non-clean dist 回退只做读取前的 `verifyScope` 与读取后的 mount identity 检查；本任务不把它写成已有两次检查，也不修改该回退。

新契约仅由 `entrypoint-host.ts` 在 **validation 且存在 transfer candidateConsumer** 的生产分支构造。对象绑定当前 case/window/task/deadline，由 consumer 将同一对象交给 mount 和 native persistent transport。nativeIO 必须复核其身份、deadline、非 generic series、task 与原 authority 一致；错误对象直接拒绝，不回退到宽松路径。带新对象却没有 cleanDelivery 的 mount 拒绝执行。

以下调用保持旧默认：普通 `runAcceptance`、没有该可信对象的 owned lifecycle、generic persistent series、human transfer、测试或工具的直接 non-clean dist mount。CLI、模型 plan、环境变量、series JSON 与游戏脚本均没有预算选择字段。新对象不写入模型输入，不能成为新的权限来源。

## 方案选择与设计前沿

| 方案 | 取舍 |
| --- | --- |
| 推荐：保留检查顺序，源码固定阶段预算与原截止夹紧 | 能分别识别授权、登记、传输与导航停滞；需要共享的窄内部状态以处理恢复请求与迟到工作 |
| 完整授权只受父 deadline 约束，传输单独 15 秒 | 合法等待可继续，但单次授权停滞可能耗尽整个验证窗口，缺少局部停止与诊断界限 |
| 同调用传递已核实字节，证明等价后减少嵌套检查 | 可能减少成本，但现有 expire/close 等副作用和实时 guard 的等价证明不足；另立工作后再评估 |

本规格选择第一种。统一把 open 改成一个较大 timeout 不符合本规格。以下时限、起点、信号、门禁、错误与兼容决定均已在提案中定案，没有留给实现者、模型或配置自行扩大的参数。

## 绝对截止、固定预算与计时起点

`D` 是既有当前任务可执行 authority 的绝对截止，继续由 controller 对原 run/window/task binding、停止状态和预算约束核验。现行 validation 的 task.budget.originalDeadlineAt 保留 quote.basis 的旧原运行截止，当前验证窗口另有已批准的 deadline；不能新取两者最小值而否定既有合法续窗，也不能改写旧值。本契约沿用 validationAuthority 给当前 coding task 的截止，并与 consumer.deadlineAt、原 window 完全相同；不创建新的 run/window，也不延长任何截止。

`W = min(D - 5000, runner 原 execution deadline)`。原 runner 保留 `cleanupReserveMs=min(3000,floor(timeoutMs/3))`；clean delivery 已用 `D-5000`，scope 已保留同样 5 秒。使用最早的既有安全工作终点，保留 runner 的原 graceful/force 清理分配、owned-work 5 秒默认 drain 与 controller 硬停止；5 秒不是保证全部清理一定成功的承诺。

每一阶段进入时冻结 `stageEnd=min(W, stageStart+cap)`；抵达边界即到期。剩余量不为正时不派发新执行工作，不能把负数强制改成 1ms 来获得新权限。唯一既有收尾例外是已 spawn 的 exact PID 登记：它必须先发起以保存副作用证据，过期后不能再获 CDP 或游戏执行权限。阶段完成须再次核对原 signal、stageEnd、W 与当前门禁身份。所有原 fresh scope 仍各用原 5 秒内部 guard，父阶段不能改变它。

| 阶段 | 固定 cap | 起点与结束 |
| --- | --- | --- |
| `prepare_authority` | 60000ms | lifecycle.open 入口；包含原 executable/profile/旧端点处理、完整 pre-ticket binding、controller ticket 持久化及 raw handle 交接；完成前零 spawn |
| `register_authority` | 60000ms | spawn 返回后、发起 exact PID register 前；先持久化原 PID，再做完整 fresh binding；完成前零 endpoint/CDP/game 放行 |
| `browser_transport` | 15000ms | post-register fresh 返回且边界检查通过；endpoint 轮询、CDP connect、PID/profile、default context、原初始页面关闭与 service-worker block |
| `navigation` | 300000ms | runner 的路由、页面、viewport、视频与异常采集设置完成后，可信 goto 紧邻调用前；到 load HTTP 成功且 origin 核验完成 |
| `http_pre_authority` | 60000ms | 已放行请求进入处理；完整 mounted.verifyScope 返回并通过边界检查 |
| `http_body` | 15000ms | pre-authority 完成；现有 clean upstream fetch 与完整 actual byte read 完成 |
| `http_post_authority` | 60000ms | body 完成；原完整 mounted.verifyScope 与 mount/lease/signal/deadline 再检查完成，之后才发送 headers/body |

open 的有界等待完整包含前三阶段，最多 135000ms 且受 W 夹紧；没有重启总计时，迟到 raw 工作的实际收敛另行如实记录。prepare cap 明确也包含其原物理前置操作，不能把这部分时间归为已测纯授权成本。60 秒提供高于已测约 25 秒无重叠完整 binding 的有限工程余量；31.9 秒迟到且有重叠的样本只辅助说明长尾风险。这两个样本均不是 p99、最坏值或未来通过保证。15 秒 transport 沿用原物理连接的短界限，将授权从该限时责任中拆开；不是从统计减去授权时间。

单次 HTTP 的有界等待三阶段最多 135000ms，全部还受其请求的共同上界夹紧，迟到收敛不裁剪。导航期间该上界是 `min(W,navigationEnd)`；进入正常输入后新请求用 W。HTTP 的 60 秒 pre/post 各覆盖一轮完整 mounted verifier，沿用相同有限授权余量；15 秒 body 保持实际本地传输的短界限。300 秒导航为两个可能串行的完整 guarded 文档/脚本响应（2×135 秒）及有限其余等待留预算。这是明确的源码规划值，未量化实际 HTTP 成本、并行资产竞争或全部素材加载分布，也无 p99 保证。某次请求或整个导航仍可失败，不能因此自动再扩大预算。

导航完成不延长已经进入的请求寿命。正常输入默认 2000ms、locator-click 的原 plan timeout+100、assert/wait-for 的原逐步 timeout、截图/媒体/渲染采样、路由/页面/异常设置及普通非持久浏览器超时保持；导航授权等待不会转成免费的输入时间。延迟素材若导致原正常输入/观测失败，保留真实失败。

`executePersistentSeries` 的 profile 与各 segment/最终 publication guard 继续按原父 deadline 工作，全部计入 aggregate elapsed；每次独立调用仍执行完整 guard。本任务不通过移动 guard 到计时区间外取得较小数字。

## 窄接口与状态转移

新增内部模块 `src/acceptance/native-validation-waits.ts`，只服务本契约：固定版本与 caps、阶段 race/边界检查、当前 segment HTTP lease、first cause 及标量记录。不做可配置 timeout registry、通用调度器或跨操作数据 cache。工厂接收源码已核验的 `{caseId, windowId, taskId, deadlineAt, signal}` 及 host-owned 工作跟踪回调；不接收 caps、clock、reader 或权限替代物。工厂产生的对象以私有 WeakSet 验证来源，类型声明不构成授权。

最小接线接口：

- `BrowserCandidateConsumerContext.nativeValidationWaits?`：只由上述 entrypoint-host 分支构造；consumer 沿同一对象传递。
- `PersistentAcceptanceOptions.nativeValidationWaits?` 和 `OwnedAcceptanceLifecycle.nativeValidationWaits?`：可信 transport seam，nativeIO 复核后传给 lifecycle 与 runner；generic 无对象。
- `PreparedPersistentChild.register(pid, registrationLifetime?)`：可选第二参数保持现有调用兼容。新路径将 register 阶段的 signal/deadline 传给 native source handoff；旧调用保持原含义。
- 内部对象只公开 `beginSegment(reportId)`、`runRequest(operation)`、`snapshot()`。`beginSegment` 返回捕获唯一 generation 的只读 segment handle，只有该 handle 才有 `runStage(stage, operation)`、`beginNavigation()`、`finishNavigation()`、`revoke(reason?)` 与当前段 snapshot。`runStage` 给 operation 本阶段只读 `{signal,deadlineAt}`；允许的阶段是固定联合类型。`runRequest` 向 origin 提供请求入口捕获的不可替换 lease 和三个阶段执行器。

状态顺序固定为 `closed → preparing → registering → connecting → transport_ready → navigating → input → closing → closed`，失败可从任何执行状态进入 closing。`beginSegment` 开始时流量关闭；只有该 segment 的 browser identity、初始恢复页面关闭、service-worker block、route 与全部 driver 设置完成后，runner 紧邻 goto 调用该 segment handle 的 `beginNavigation` 才允许请求。此方法检查前置状态、原 W 与 signal，不做授权替代。重复 begin、跨 reportId、旧 lease 或上段未收尾直接失败。

每次 begin 使用不可复用的 generation；segment handle 固定绑定该 generation。origin mount 闭包固定绑定本次可信 wait 对象与原 mounted 对象，每个请求在入口捕获该对象当时的 segment/generation lease，此后不能替换。close、segment abort、原 controller/work abort 都立即撤销它，方法在操作前后检查。旧异步 callback 持有旧 handle/请求 lease，不能通过读取“当前段”重新取得新 generation；其迟到 begin/finish/response 只拒绝旧操作，不能打开、撤销或改写后续 mount/segment 的 gate 或首因。重新开启只能由正常串行 series 的下一个 beginSegment 产生新 handle，且上段 raw 工作及原 owned browser exit 已按原 series gate 收尾。

origin 在请求到达时捕获 gate 状态，closed 阶段请求直接返回现有 no-store 404；它们不能等门禁打开后变成合法请求。进入允许状态的请求须继续完整 pre/body/post，不能用 lease 跳过任何 guard。恢复页面在 OS spawn 后但 post-register fresh 或 CDP 前请求游戏内容时零有效字节；新段使用新 lease，上一段的请求不能穿过关闭/重开边界。mount 仍是原 candidate 与 cleanDelivery，URL、profile 与存档行为保持。

runner 在 finally 的首步撤销当前 lease，再进行原视频/关闭/force 清理。native source 跟踪每个 raw request 至真正 settled，响应连接关闭不等于授权工作退出；清理期只在原剩余清理预算内等待，超出则报告 cleanup/drain failure，保留 owner 追踪与诊断。没有在原截止之后继续发送游戏字节或把未收敛工作写成清理成功的路径。

## 信号、迟到结果与失败

每个阶段组合原 controller/work/consumer signal、当前 segment 取消与阶段 timer。阶段 timer 只产生模块私有、固定 stage/version 的 `DeadlineError` 子类；parent 到期使用原截止原因。成功阶段清 timer/listener，不自动 abort 仍由 exact ticket handoff 使用的成功 lifetime。

新路径的 race 在派发前检查已 abort 的原 reason；原取消、私有 scope timeout、source/HEAD/index/history/window/budget 错误对象直接传播，不能替换成文本匹配的宽泛 deadline。first cause 采用首次已观察的具体拒绝/取消原因；后来的超时、404、page.goto 错误和 cleanup failure 只追加为次生结果。若两个原因同时到达，按实际首个进入受控失败出口的事件记录，不根据事后耗时猜测因果。

新 helper 不改变通用 `bounded` 的默认错误行为。新 startup/navigation/HTTP 调用用同一 helper 保留原 reason；报告记录受控 stage、错误 name/message 和父/阶段边界，内存中的原对象保留给 private scope classifier 与 cleanup AggregateError。不得记录凭据、完整 source bytes、snapshot、Promise 或 Buffer。

pre-ticket 授权失败或到期：零 ticket/spawn；ticket 已持久化但 raw handle 迟到：继续观察其真实结果，只释放该 exact unspawned ticket。release 失败保留原原因和 cleanup 原因，进入已有 `retainCleanupFailure` / public drain，不能清除不确定 intent。

spawn 后即使本地时限已到，也必须先启动原 exact PID 登记，保留 OS 副作用证据；登记之后检查 register lifetime，再按原顺序做完整 fresh 核验并复查 lifetime。取消/过期可在开始 fresh 前拒绝，但任何仍获执行资格的成功路径必须完成原整轮 fresh。新 native 路径把 launch.completion 的 settle 推迟至 **raw registration/fresh 工作真正 settled**；bounded 先拒绝不能提前解除 OwnedWork 对该工作的追踪。raw prepare 与 raw register 各保留观察者，无 unhandled rejection。普通兼容路径的原 completion 行为不随本任务泛改。

raw handoff 的纸面状态与收尾顺序：

```text
preparing（OwnedWork 已跟踪 prepare operation）
  → ticket persisted → raw handle delivered → spawned
      → 立即启动 raw exact PID registration（不因到期跳过证据登记）
      → PID persisted → lifetime check → full fresh → lifetime check
      → raw register settled → completion resolve/reject → prepare operation settled

取消/到期且未 spawn：
  raw handle 未返回 → 等其真实返回/失败；返回后 release exact unspawned ticket
  release settled成功 → completion resolve；失败 → completion reject并retain cleanup failure

取消/到期且 raw register pending：
  stage race失败 → runner finally revoke gate → 原 close/force/owner收尾
  completion 继续pending；raw register迟到settled才resolve/reject它
  外部 public cancelAndDrain 观察parent/prepare/raw-request工作；超时保留未决ownership
```

`completion` 是本次 ticket handoff 的结算 latch，不等待 browser close、series completion 或 public drain。raw register 的 fulfilled/rejected observer 是该 spawned 路径唯一 completion 结算方；stage catch 不得先 reject 它。若 spawn 已开始却没有可登记 PID/无法启动登记，则立即 reject completion，保留已有不确定 intent/进程事实并报告失败，不能假释放。

无自等待证明：prepare operation 仅等待该 latch；raw register 从已交付 handle 直接启动，不加入一个“等待 prepare 结束”的串行任务，也不调用 public drain；它 settled 后释放 latch。runner finally 只等待本段 raw requests 的集合与原 browser cleanup，不等待包含自身的 OwnedWork 全集合。只有外层协调方调用 public cancelAndDrain，向既有 parent/prepare/request operations 发取消并等待快照。任何 raw 工作不收敛时原 5 秒 drain 失败保留责任，可后续再观察同一工作；不能重放登记、删 intent、把 drain 失败写成退出成功。release/registration 的 Error 与首因通过原 AggregateError/retainCleanupFailure 观察，迟到 rejection 不悬空。

post-register drift/私有 scope failure/到期：零 CDP/identity/游戏放行，原已登记 PID 走现有 runner/controller 退出与 owner 规则。无需已验证 identity 才能保留 PID 或执行现有 force 清理；缺 identity 仍不能宣称浏览器身份/正常退出证明成立。原 closeEvent、精确 profile/PID、CDP identity、端口和 profile 留存要求不弱化。

拒绝边界按真实检查位置解释，不添加另一轮完整 guard：pre-ticket binding 读取期间的漂移在 ticket/spawn 前拒绝；它通过后到 post-register fresh 期间的漂移，允许已有 owned spawn/PID 持久化，但必须在 CDP/游戏前拒绝；post-register fresh 之后到 HTTP 期间的漂移由每请求 pre/post 拒绝有效游戏内容。两个完成的 fresh 检查之间无法对任意瞬时外部写入作连续监控，不能把该检查模型写成零 OS 副作用的事务保证。HEAD、main/index flags、dirty/untracked、source/history、budget/window 均沿相同原检查边界验证。

HTTP 读取中 source/HEAD/index/window/budget/receipt/mount/clean bytes 漂移：post 检查拒绝，零有效响应；原 origin 是否 close 的私有 scope timeout 分类保持。新 gate 只撤销本 segment 的流量，不把暂时 scope timeout 伪装成来源漂移，也不据此绕开原 close 行为。HTTP 原因传入 first cause 后，goto 的派生错误不能把它升级成游戏代码缺陷。全部新生命周期/授权/传输错误保持 `insufficient_evidence`，不能自动获得修复、accepted 或 human 结论。

## 证据与兼容校验

新增可选 `nativeWaits` 标量记录到新路径的 raw segment/aggregate report：`contractVersion`、原 authority/W、consumerStartedAt、series 本身起止、segment reportId、各 stage 起点/race 结束/实际 elapsed、冻结 cap/end、outcome、first-cause stage/name/message、HTTP started/settled/pending 与拒绝计数。阶段可重叠，HTTP 的合计耗时不等于总墙钟。记录 Date 时间点以对照绝对截止，以 `performance.now()` 差值记录实际 elapsed；不保留请求正文、长 URL 查询、Promise 或完整状态。

consumer 在入口记录开始，最后一次原 guard 完成后、返回前在 `BrowserCandidateConsumerResult.nativeWaits` 写其独立结束/elapsed 摘要，host 将摘要写入原 browser evidence envelope。aggregate raw 在 series publication 时只记录已发生的 series 终点和 consumer 起点，不能提前填写尚未发生的 consumer 结束，也不回写已认证 raw。consumer binding/mount/诊断与 host 后续派发/写入的全部墙钟继续由既有运行计时覆盖。

每类 HTTP stage 只保留 count/total/max 和最早 failure 标量，单段最多 3 个 HTTP 聚合行；open 三段与 navigation 各一行。请求计数单调且安全整数，溢出直接失败。所有记录包括失败与未到阶段；未到为 skipped，race 已失败但 raw 仍在收敛时另记 pending，不能把 race 结束当成 raw 结束。成功阶段必须在冻结 end 以内完成边界检查；timer 调度迟到和失败 raw 的迟到 settle 如实记录，不能裁剪时间伪造边界。report publication 前关闭 gate 并检查 pending；pending 非零不能通过，新记录不是通过证明。

`persistent-diagnostics.ts` 的 expected 增加仅可信 host 提供的可选契约版本。新路径必须有同版本、同 task/deadline、合法阶段顺序与成功边界、在各自 segment/series 起止内的 timing；consumerStartedAt 可早于 series，不能错误要求两者区间相同。缺失或不一致是 insufficient evidence。旧 expected 无版本时继续用原诊断规则，不要求旧 raw 具备新字段；不能给旧报告补字段来获得新结论。总 `startedAt/endedAt`、原 timeoutMs/deadlineAt 与全部已有 failure facts、证据和 identity 字段保持，授权等待全部包含在原运行及 consumer/series 总耗时中。

未来实际诊断若另获 Root 授权，应报告新契约结果与旧 whole-open/导航 15 秒观测是否超界两个独立事实。只以真实计时说明旧阈值关系，不能把新契约成功称作 COS93 原目标通过。

## 后续验证门槛与当前禁止项

独审先审本 spec/ADR 和计划。源码实施须在独审批准并由 Root 明确授权后开始，且只改计划列出的必要文件。免费受控验证覆盖：合法长授权与短传输、阶段与父截止精确边界、原 5 秒私有 scope reason、所有阶段间真实来源/HEAD/index/window/budget 漂移、登记后零 CDP、恢复页早请求、HTTP 读取中漂移、正常输入旧时限、取消/迟到 handle/exact release failure/registration drain、generic 旧默认与完整墙钟。

先按实际代码变化选受影响短测试、typecheck/build/strict，再独立源码复审；既有 220 步玩法、62 媒体字段及未变 ownership 证据按版本复用，不为纯 harness 变更重新生成游戏。本阶段没有执行任何这些命令。

若需要一次新的完整免费实际诊断，必须在源码独审集成后另审一次性 launcher，冻结新源码，用新 TEMP/新 intent 与只读旧来源，至少覆盖真实导航/ready 和正常清理。原仅到 newPage 前的 sentinel 不足；不复用已消费 C14 身份，不重建其通过结论。本阶段没有第四次 actual、browser、controller/715 seed、provider 或付费授权。

原 v1/v2/v3、raw processesExited=false 与独立 PID 复用后核保持；COS93 仍 open/partial/startup-failed，原 C14 failed/consumed，coding review/accepted/human/完整经典/COS16/COS18 未提升。真实账本 revision3114、715 请求、16901000µ，reserved/unknown 0；共享验证 ¥150 含 prior probes 保守预留 ¥0.721771，正式 ¥200/12h，优化 ¥100/6h 保持。参考安装只读，不复制美术或音频，API keys 不进入文件、描述、日志或 Git。
