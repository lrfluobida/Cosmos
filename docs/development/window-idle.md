# 追加窗口的空闲停止证明

`RunController.closeAfterDrain(work)` 用真实 `OwnedWork` 等待本次写入结束，确认没有素材注册写锁，再在同一快照追加 `window_owner_drained` 事件。事件仅保存随机 nonce 的哈希。控制器及其已登记子进程全部退出、快照内容仍一致后，才发布含 nonce 的独立 receipt；关闭失败不发布。

`RunController.stopIdleWindow({ root, windowId, reason?, now? })` 返回 `{ runId, windowId, stopped: true }`。它先取得唯一快照写锁，核对当前窗口、准确 revision、快照字节和 nonce，再构造控制器并持久停止。验证失败不会触发到期写入。窗口再次 `open` 会追加 `window_owner_resumed`，使旧 receipt 失效；普通 `close` 或缺少 owner 文件都不能代替证明。

该证明只说明受控运行已收敛，不证明游戏或素材通过验收，也不增加预算、时间或执行权限。原始停止、任务、费用及截止时间全部保留。调用方仍须让所有写入归属同一个 `OwnedWork`，先关闭终端通知及控制通道，再调用 `closeAfterDrain`。未知外部写入、遗留素材写锁、未确定 PID 的子进程和未结束操作都保守拒绝。

本提交只提供核心接口。公开 CLI 的 teardown 和无活动通道停止分支在后续接线提交中调用它。

验证：12 项纯离线测试覆盖正常 drain/stop、错误 nonce/窗口/revision/字节、再次打开失效、缺证明、未知子进程、素材写锁、关闭失败及真实 drain 超时；另复用 5 项受影响 preAuthor 管线回归。无模型请求、浏览器或真实子进程。
