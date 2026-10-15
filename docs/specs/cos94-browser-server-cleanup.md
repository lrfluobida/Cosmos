# COS-94 普通浏览器服务清理

任务：[COS-94 / #95](https://github.com/lrfluobida/Cosmos/issues/95)，id5858068979，父 #1；依赖 COS40 / #41、COS64 / #65、COS92 / #93。起点 `61d13817ca871d2be04576b4d6fb51fa8a86b541`。计划 `e9e60894cea81fac3f99bfb4735635d8510f0e03` 已由独立 reviewer 批准；最小实现及静态/确定性检查已完成，真实正例与源码独审待完成。

## 范围与历史

仅修改普通 `runAcceptance` 的 BrowserServer 清理等待和已保存视频的失败文案。保留 persistent 启动 15 秒、所有权、来源、预算、取消、原绝对截止及强制退出确认规则。不重放 C14、不改运行时作者生成的源码或资产，不访问真实 ledger/store/window，不发模型请求。

原 C14 已失败且身份已消费。主线 `61d13817` 上独立媒体补采的 15 步和 62 字段已独审通过，但整轮因 `Cleanup: Server cleanup: timed out after 1000 ms` 失败；后续视频不可用文案来自同一失败分支。报告已登记 `browser.webm`，文件 93,887 字节，未验证播放。该历史报告保持失败。原 220 步玩法、62 字段绑定与覆盖证据复用，本卡不提升 COS16/COS18、accepted 或 human 状态。

## 已核实的原因与限制

当前顺序为 `context.close → video.saveAs → connected browser.close → BrowserServer.close`，各步骤均受 1,000 ms 局部上限限制。安装的 Playwright 为锁定版本 1.63.0：

- `coreBundle.js:62784` 的已连接 client `close()` 断开连接；它不证明浏览器进程退出。
- `coreBundle.js:57212` 的 BrowserServer `close()` 调用 `browserProcess.close()`。
- `coreBundle.js:9381` 附近的 `gracefullyClose()` 等待进程 `close`，随后等待临时目录清理。`coreBundle.js:39830` 的 SDK 自身回退时限不能取代 Cosmos 的原截止和有界终止。

最小真实 `runAcceptance` 使用独立 loopback 静态页面，原生产源码未改，复现相同错误。Context 关闭 163.780 ms、视频保存 8.118 ms、client 关闭 2.935 ms。Server 关闭开始后 1,015.124 ms 实际调用 `taskkill.exe /pid 23476 /T /F`；进程在 1,345.669 ms 时以 exitCode=1 退出，SDK 目录清理在进程退出后才开始。因此该次超时不是目录删除先占满 1 秒；它也不能证明浏览器若不被强制结束会何时正常退出。

一次原始 SDK 顺序正例和八次 TEMP runner 副本试验均以 exitCode=0 正常结束。副本仅把 server 局部观察窗口改成最多 6 秒、仍受原 gracefulDeadline 限制；八次 server 关闭实测 213–255 ms，没有观察到自然正常关闭超过 1 秒的样本。6 秒只是隔离诊断窗口，不是实现参数。这些证据说明延迟有波动，**尚未确定首次失败的底层 Windows / Edge 延迟原因，也不能宣称已找到历史故障的确定性修复**。保留原关闭顺序。

已确认的另一个错误是：`video.saveAs` 成功后，后续清理失败仍无条件记录视频不可用。保存完成可以证明保存操作完成，不能证明文件可播放或媒体验收通过。

## 最小行为变更

沿用既有预算：

```text
cleanupReserveMs = min(3000, floor(timeoutMs / 3))
forceReserveMs = min(1000, cleanupReserveMs)
gracefulDeadline = originalLifecycleDeadline - forceReserveMs
serverCloseAllowance = min(cleanupReserveMs - forceReserveMs,
                           gracefulDeadline - now)
```

只对 generic `server.close()` 使用 `serverCloseAllowance`。它通常最多为 2,000 ms；短超时额度为零或原截止已到时不发起新的优雅关闭等待，沿既有失败与强制清理路径处理。不得等待早结束时的全部剩余运行窗口。Context、视频、client 与 persistent close 的原 1,000 ms 局部界限保持。此变更是把已有清理预算分给等待进程退出的操作，依据是预算结构与已观察到的 1 秒提前强制终止；2 秒不是从真实慢退出样本推导的保证值。

不增加原绝对截止，不改变最后 `stopBrowserProcess` 的原剩余时间上限；真实挂起、截止、取消或退出未证实仍失败。不得吞掉清理错误或凭 BrowserServer Promise 完成伪造进程退出。

Generic 视频仅在 `saveAs` 完成后记为保存成功，后续关闭失败仍保留视频路径、截图、原错误和失败结论，但不再声称该视频不可用。保存尚未完成则保留原失败提示。不把文件存在视为成功保存，也不新增播放通过结论。Persistent 的保存和失败处理保持原行为。

## 验收与证据

使用现有 `node:test`、MockTimers、Playwright；不增加依赖或框架。确定性测试直接调用真实 runner，替换外部浏览器/进程边界，不创建真实 controller 或账本：

1. 正常关闭顺序及已证实退出通过；1,200 ms 关闭在原许可额度内通过、不强杀。
2. 真正挂起在最多 2,000 ms 或更早的原 gracefulDeadline 失败；强制终止仍有界，只处理本次 owned child，退出未证实保持失败。
3. 短预算、截止和 persistent 取消保持失败；persistent 启动及清理额度不变。
4. 已成功保存视频后，server 失败仍为 lifecycle failure，保留路径且没有错误的 unavailable 提示；未保存成功则仍提示证据缺失。
5. 实现后一个独立 TEMP 真 BrowserServer 正例，记录保存、关闭及实际退出时点，确认 own PID 和 loopback 端口消失。不重复玩法或媒体矩阵。

诊断目录：`C:/Users/26557/AppData/Local/Temp/cos94-cleanup-af7b3174b1d44d9ca7b14cab59875aa1`。基线 `summary.json`、`events.jsonl`、`guard.json`、`stdout.log`、`stderr.log` 保留真实 RED；`raw-window/` 和 `runner-window-1/` 至 `runner-window-8/` 保留隔离对照。所有外部 25 秒 guard 均未触发；后核未见记录的 20 个 Node/Edge PID、可追溯直接子进程或 10 个端口残留。

同目录 `cleanup-red.test.mjs` 已直接针对未改 runner 执行，0 pass / 2 fail / 0 skip，退出 1，663.7119 ms。第一项明确因 1,200 ms 正常关闭被 1,000 ms cap 拒绝失败；第二项因保存后仍出现 `Video unavailable` 失败。测试录像为合成占位字节，不能充当视频播放证据。

作者提交 plan/card 后停止，独立 reviewer 先审规格再审计划。批准后执行最小实现、受影响验证及独立源码评审；仅指定 merger 合入和推送。本卡 source 完成只覆盖上述行为。
