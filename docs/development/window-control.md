# 执行窗口 stop 控制（D3c 子模块）

接口为 `startControl(root, runId, stopAndDrain, windowId?)` 和 `requestStop(root, windowId?)`。v1 保留原调用与 `{ runId, stopped: true }` 返回形状；v2 必须明确匹配 currentWindowId，控制记录使用 formatVersion 2，请求、成功响应和错误响应都带绑定的 windowId。缺少或错误窗口在写控制记录、调用 owner 或恢复锁之前拒绝。

活动通道只有在可信 `stopAndDrain()` 完成且该窗口 stopReason 已持久化后才确认。原窗口的停止事实不算追加窗口已经停止。窗口已停止但 drain 仍在等待或失败时，客户端不会收到成功确认；其他窗口的响应也会被拒绝。

通道缺失或连接明确被拒绝时，v2 可使用已有崩溃恢复流程：先拒绝 registry `.commit.lock` 残留，再由 `recoverRunOwner` 核验旧 owner 及所有登记子进程退出，随后独占 `RunController.open({ root, windowId })`、停止当前窗口、关闭 owner，最后确认。活 owner、未退出子进程、未知 spawn intent、untracked writers 或不能证明收敛的状态均拒绝；费用、原开始/截止和原 stop 保留。`recoverRunOwner` 返回是否实际恢复了一个有记录的 owner，其他既有调用可继续忽略返回值。

正常 idle/drained 路径现直接调用 `RunController.stopIdleWindow({ root, windowId, reason })`，控制层不解析或制造 receipt。配套 core `2c32091c56244208c58154f3e88bc887c1ecc941` 已独立审查 IDLE_CORE_READY：`closeAfterDrain` 在真实 drain/close 后发布与 snapshot/window/revision、准确字节和 nonce 锚点匹配的证明；再次打开会消费锚点。单纯缺失 owner marker、伪造 receipt、过期锚点或改变的快照均不能取得确认。当前控制候选仍须独立审查，不代表完整公开 continuation 流程已完成。

## 定向证据

最终控制窗口 16 项与原 v1 控制 6 项共 22/22 通过（`duration_ms: 3158.2646`），组合 strict build exit 0。新增正常 idle stop 用例先红后绿；错误窗口、伪造凭据、快照字节变化和已消费凭据均拒绝且不改变快照或 receipt。此前 pipe/drain 和严格 owner/child 恢复证据保持有效。

下面命令的负向名称过滤未排除原 5 项真实本地进程用例，实际重复执行了它们；该执行偏差已报告协调者，所有 fixture 进程均已退出，后续不再重跑。没有浏览器、API、真实验证根目录或旧实验操作。

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test --test-reporter=spec --test-name-pattern='^(?!a crashed owner|owner recovery|a surviving owned child)' tests/cli/control-window.test.ts tests/cli/control.test.ts
npm run build
```

首次 RED 暴露旧 startControl 错误接受 v2 无窗口调用；该意外成功产生的测试 server 已定向清理，反例的 finally 也已补齐关闭逻辑。本次没有复跑无关 host/smoke。
