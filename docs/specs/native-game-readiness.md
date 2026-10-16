# 原生游戏异步就绪、固定候选响应与有界清理

状态：设计提案，待独立评审。基线 `e2358cd59a6313e049605cd652912d326745d414`；本次仅文档，不占 COS 编号。Root 已同意推荐方向，源码实施与实际运行分别交由 Root 下达。关联 [实施计划](../plans/2026-10-16-native-game-readiness.md)、[ADR0003](../adr/0003-native-fixed-candidate-execution.md)；原 [COS97](cos97-native-validation-waits.md) 与 [ADR0002](../adr/0002-native-validation-waits.md) 的历史结论保留。

## 建议与尚未证实的部分

采用三个可分别实施、验证和评审的小任务：A 将指定 native 路径改为固定候选执行，移除 HTTP 热路径重复的完整来源/历史核验；B 在原导航预算内等待实际游戏 ready；C 修正 native 视频清理的共享预算。A/C 在同一新契约中集成，互不以对方的性能结果为前提；B 不依赖 A 的内部实现。三项完成并独审集成后才安排一次完整导航。

这是 `native-validation-waits/2`，不是 `/1` 的等价加速。它允许已获准固定候选在一个 segment 内运行；外部来源持久变化在后续完整 guard 拒绝发布，两个 guard 之间变化又恢复不保证被发现。实时 controller 停止、额度、任务状态、deadline 和每个响应的实际字节仍受检查。

[待证] 新 HTTP 总加载时间、27 个素材并发下的成本和正常视频收尾耗时尚未实测；不得写成必然在 300 秒内 ready 或 30 秒内清理成功。FFmpeg 的编码、尾帧、I/O 和协议等待各占多少尚未知。修复有证据的等待错误后直接走一次有界导航，不另开长期诊断项目。

## 证据与调用链

- [已证·本次读取 raw] `C:/Users/26557/AppData/Local/Temp/cos93-native-startup-navigation-JBTyHx/result.json`：prepare 24575.6104ms、register 26057.0091ms、transport 59.6950ms 均通过；navigation 192228.9083ms 后失败。首因为 `Diagnostic game engine is not ready`。HTTP started/settled/rejected/pending=8/8/6/0，只有 2 次 body；pre 最大 49618.0947ms，post 最大 47643.2195ms。
- [已证·Root 对原 trace 的复核] `goto(load)` 192.051 秒，ready 175.844ms 即失败；Phaser boot 为 17:22:35.133，ready 首因为 35.828，27 条素材 404 从 35.864 开始。404 晚于撤销，不能据此认定磁盘素材缺失。21 SVG 与 6 WAV 存在 dist 和固定交付清单。trace 没有逐 HTTP URL/id，不能指认六次拒绝的具体路径。2775 个 tracked spawn 中 2772 为 Git，这是完整准备与诊断总量，不能全部归因 HTTP。
- [已证·源码] `tests/transfer/native-startup-diagnostic.fixture.ts:158-180` 单次读取 `idle.seen`；`:184-203` 在外层加 3000ms 上限。原封存游戏 `src/scenes/BootScene.ts:25-45` 经 Phaser loader 加载 SVG/audio，create 后启动 GameScene，后者真实播放 player idle 才 mark seen。DOM load 和 board 出现都不证明该异步过程已结束。
- [已证·源码] `loopback-origin.ts` 的 native 每请求为 `runRequest → pre mounted.verifyScope → fetch/arrayBuffer → post mounted.verifyScope → verifyPayload → send`。mounted verifier 依次调用 `origin.verify → consumer.guard → cleanDelivery.requireCurrent`；consumer 又进入 `context.requireCurrent → requireDispatch → preparation.bindCandidate`、固定 plan/design/media 字节。origin 与 preparation 继续进入 scope/source/history。pre/post 各是一整条实时来源链，不是几次廉价内存检查。
- [已证·源码] `entrypoint-delivery.ts:80-151` 已持有私有 `fixed: Map<string,Buffer>`，从实际 upstream 读取的 bytes 必须等于 `fixed.get('dist/'+name)` 才可返回 200；action 后另比较 clean/candidate 完整快照。新方案继续比较实际响应，不直接拿 fixed bytes 冒充交付服务响应。
- [已证·Root 的依赖/trace 复核] `runner.ts:295-318` native cleanup reserve 3 秒、graceful 2 秒且每操作最多 1 秒，顺序先 screencast.stop 再 lifecycle.close。Playwright 1.63.0 的 `coreBundle.js:61242-61250,53839-53842,37061-37072,37141-37156` 表明 stop 包含服务端 recorder、FFmpeg 结束及 artifact 保存。原 FFmpeg close(code0) 在 ready 首因后约 10.322 秒；1 秒 race 已先失败。它证明收尾跨越 1 秒，不证明哪一子阶段慢，也不证明强杀浏览器对该时长没有影响。

## 三种方案

| 方案 | 容量与取舍 | 结论 |
| --- | --- | --- |
| 只把单次 ready 改成 3 秒轮询 | 可修短暂竞争，但单次 pre 已约 49 秒；异步素材可能尚未获准读取 | 不足以覆盖已证失败链 |
| 保持全部 HTTP fresh，ready 使用原 300 秒余量 | 修正单次观察错误；已耗 192 秒后只剩约 108 秒。即使按约 96 秒一批估算，一批能否涵盖全部资源未知；27 项若分多批或互相竞争即可能超界。不能把该估算当测量 | 可单独验证 B，但不足以解决重复成本；不采用持续增大 cap |
| 固定候选执行，HTTP 检查当前 owner/authority 与实际 bytes，边界做 full guard | 直接移除每资源两次 source/history 的成本；必须显式接受新的来源检测边界 | 推荐 A+B；C 独立修复有证据的清理预算 |

## A：固定候选执行契约

### 创建与边界

新增一个窄工厂 `createNativeSnapshotValidationWaits`，复用既有 helper 内部状态与品牌，固定产出 `/2`，必须接收可信 host 的 `requireExecution(callerSignal)`。原 `createNativeValidationWaits` 继续产出 `/1`；不开放数值预算、缓存选项或模式 JSON。`entrypoint-host.ts` 仅在既有 `validation && candidateConsumer` 分支选新工厂，固定同一 case/window/task/deadline/candidate；沿 consumer、mount、nativeIO、lifecycle 传递同一对象。

完整 guard 保留在现有位置：consumer bind/mount，series profile/per-segment，pre-ticket，exact PID 登记后 fresh，segment/aggregate 发布、consumer 诊断及最终发布；原 clean action 后双快照不变。不新增一轮 full guard，也不在 HTTP 外启动背景全量轮询。每次新 segment 仍做原入场检查；旧 generation 不可重用。`/1`、generic、human、直接 non-clean dist 分支保持原行为。

### HTTP 的具体顺序

```text
原 runRequest 捕获 segment/generation lease（导航前关闭）
  → pre：lease/signals/W + 当前 controller authority + 本地 origin receipt/listener/mount + clean active
  → body：原 clean upstream fetch + 完整 arrayBuffer
  → post：相同实时检查 + 原 verifyPayload(name, status, actualBytes)
  → 最后一次同步 lease/signals/deadline/mount 检查 → 发送刚比较的 actualBytes
```

`/2` pre/post 各 5000ms，body 15000ms，仍夹紧本请求捕获的 navigationEnd/W；原 navigation 300000ms、prepare/register 60000ms、transport 15000ms 不变。stage 名称继续表示权限检查，但 `/2` 明确不含 full source/history；报告不能混用两个版本。读取期间取消、mount 更换、旧 generation、payload 改变均不得发送有效内容；错 payload 后磁盘恢复也无效。原错误对象、first cause、raw owner、迟到 settle 与失效关闭分类保留。

最小实现位置：

1. `RunController` 增加只供可信 host 使用的 `requireNativeValidationExecution({caseId,windowId,taskId,deadlineAt}, callerSignal)`。在原 `serial` 中运行，先后检查 controller/caller，调用现有 `requireValidationCase`，核对原 deadline，复用 `validationTaskAuthority(taskId,'reviewer').admissionAllowed`。它只读取 controller 已持有的 `snapshot`，沿用 `serial → expire` 的截止/持久停止；不调用 identity/source/history、不重新读取磁盘、不建立第二份 authority 状态。
2. `entrypoint-host.ts` 捕获原 task/ref 与 controller，将该函数提供给新工厂；它不是模型可注入的回调。`validationTaskAuthority` 已检查 grant、组额度、请求数、当前任务状态、accountingOnly 与 unknown；reserved 通过原 committed/remaining 计算影响准入，合法并行任务的预留不单独导致 live 拒绝。测试覆盖合法 reserved 仍允许、预留耗尽额度拒绝、unknown、组/窗口停止和任务完成。原 `requireValidationHost` 的全 ledger reserved/unknown 检查仍在 full guard 边界执行；新 live 检查不复制这条零预留政策，属于本次明确变化。
3. `loopback-origin.ts` 把现有 listener/receipt/mount 的本地检查抽成私有函数，原 `verifyCurrent` 仍先调用原 `requireScope`；只有 `/2` HTTP 使用本地函数。receipt 仍读取实际文件并与原 receipt 比较；失败走原 `fail`，不默默删掉 close/retainCleanupFailure 副作用。
4. `CleanDelivery` 增加可选同步 `checkActive(callerSignal)`，只封装已有 controller/owner/caller/deadline 的 `check`；`/2` mount 必须具有它及 `verifyPayload`。原 `requireCurrent` 语义不变。每个 request 仍使用原实际服务和固定 payload 比较，没有新 Buffer/hash cache。

### 漂移的可达行为

| 变化 | `/2` 行为 |
| --- | --- |
| 当前 controller stop/close、额度耗尽、unknown、任务不再可执行 | 原 controller 内存状态和信号在 pre/post 拒绝；reserved沿原预算计算，合法预留本身不等于失效；到期由同步 deadline 与原 expire 拒绝 |
| controller 已持久停止，但某 raw 检查迟到 | 原 signal、generation 和 raw ownership 保证迟到结果不能重开 gate |
| source/HEAD/index/history 或外部 ledger 来源文件持久改变 | 当前已固定且 payload 匹配的响应可继续到下一 full guard；该 guard 保留原拒绝/关闭/分类，最终结果不能通过或发布 accepted |
| 上述文件在两个 full guard 之间改变又恢复 | 不保证检测；这是新契约的明确差异，不宣传等价性或连续来源监控 |
| 当前 clean 响应改变，随后磁盘恢复 | 比较已读取 actual bytes，拒绝；原 candidate/clean 最终快照仍须匹配 |
| origin receipt/listener/mount 改变 | 每 HTTP 本地检查拒绝；来源错误按原 origin 关闭规则处理 |

controller 是原独占状态所有者，正常应用写入经同一 serial/commit；直接修改磁盘 ledger 不会被伪称为已同步到内存，归入下一 full guard 的来源漂移。新路径只执行已核验候选，不派发 provider 或新额度。失败保留 raw 诊断，但不能提升 accepted、人类体验或完整游戏结论。

## B：等待实际 ready

保留原 load/HTTP/origin 检查，只有成功才进入 ready。移除 fixture 的独立 3000ms 子限时，使用已捕获 `min(navigationLife.deadlineAt, native.workDeadlineAt)`；不重开导航计时。只读地每 100ms 检查原按钮、board/player 初始格与 player idle seen；不存在/不可见/seen=false 为 pending，已存在却错误的角色/状态标识、错误按钮文字或 malformed debug 观测为失败。每轮及 await 前后做原 lifetime/取消检查，停止后不启动下一轮；原 reader 必须继续被跟踪到真实 settled。

仅所有既定条件真实成立才返回；保留最后 pending 状态用于超时原因。不得设置 seen、发送正常输入、跳过素材或降低 ready 条件。仍由真实 runner 通过 finishNavigation，随后原 clone-stop 终止诊断，220 步全 skipped。单一 idle 不构成全部媒体通过，原 62 字段证据按无变化范围复用。B 只修测试诊断入口，不改生成游戏或生产输入 plan 的原超时。

## C：native 清理使用共享余量

`/2` 固定 `W = min(D - 35000, runner 原执行终点)`：提前留下 native cleanup 30000ms 与外层收尾 5000ms。在 finally 撤销 gate 时立即冻结 `cleanupEnd = min(D - 5000, now + 30000)`，`gracefulEnd = cleanupEnd - 5000`；final screenshot 也在这段共享余量内，最多 5000ms。视频 stop/save、lifecycle.close、client.close 依原次序共享 gracefulEnd 剩余量，不各自获得新 25 秒，也不再每项限 1000ms。force 阶段与 raw settle 共用 cleanupEnd 剩余量，现有 exact PID/closeEvent/profile/port 证据要求不变。

已有 controller/work 取消或执行 deadline 错误继续走强制清理；剩余量≤0 不启动新的 graceful 操作，不用 max(1,...) 授予新执行时间。原 D、clean worker 的 D-5000、外层默认 drain 和总耗时都不延长。新 W 必须由同一 native 对象贯穿 checkRead、全部 phase/request lifetime、consumer/series 原读取和诊断 raw proof，不仅改 runner 局部 deadline；外层 reader 仍按原 signal 传播，不能获一份更晚的执行期限。来源/发布完整 guard 也须在其工作边界内完成；预留只给收尾，不保证临近 W 才完成玩法的结果还有时间通过发布。

正常清理中 screencast.stop 的 raw Promise 在派发前经同 native owner 登记，segment 保留到真实 settled；新增窄 `trackCleanup` 允许 closing 状态登记清理，不能开 HTTP 或输入。它使用原 `trackRaw`，无自等待；仅外层 drain 等 owner 集合，segment 只等自己的子集合。超时保留 raw pending 和 cleanup failure，force 不能自动把编码/保存标成成功；迟到拒绝有观察者。已取消 owner 不派发新的 graceful 工作，保留强制分支和未完成证据。

[推断·工程选择] 25 秒共享 graceful 高于本次观察到的约 10.3 秒 FFmpeg close 间隔，足以值得一次验证；样本不是正常 stop 的 p99。上限不随失败自动增大。小夹具证明顺序和共享预算；一次独立短录像实测可确认 Playwright stop/保存/进程退出顺序，不能代替真实候选导航清理。

## 验收、版本与范围

新生产 native 仅选择 `/2`，旧 `/1` 工厂及 expected `/1` 报告校验保留旧 60/15/60、D-5000 与原清理语义；旧 raw 不改写。`persistent-diagnostics.ts` 按可信 expected 版本验证严格固定值，不能从 raw 自选宽松版本。新增 `/2` raw 清理标量包括固定 end/gracefulEnd、各步骤起止/outcome、raw pending；generic/human 报告不被强加新字段。A 与 C 分别提交必要 helper/validator 的窄变更，唯一 merger 处理同文件冲突，组合版通过前不发布 `/2` 通过结论。

免费验证先覆盖活跃 authority、固定 payload、取消/迟到、旧路径，ready 大于3秒的真实等待模型和 cleanup 大于1秒的有界共享模型；然后 typecheck/build 与独审。完整导航只运行一次，另行批准 launcher、新 TEMP/intent、固定 exact source，要求真实 ready、零输入、正常视频与浏览器清理、无残留和原来源保全。若失败，保留具体首因，禁止无修改自动重复 actual。已有 220 步、62 字段和未变 source/ownership 证据复用。

验证共享 ¥150 含 prior probes ¥0.721771；正式 ¥200/12h，优化 ¥100/6h。没有新模型请求、账本变更或付费任务。原 C14 failed/consumed、COS93 旧 whole-open15 失败、accepted/human/完整经典未完成均保持。参考安装只读，密钥不进入产物/日志/Git。
