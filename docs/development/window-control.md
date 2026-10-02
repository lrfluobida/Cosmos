# 执行窗口 stop 控制（D3c 子模块）

接口为 `startControl(root, runId, stopAndDrain, windowId?)` 和 `requestStop(root, windowId?)`。v1 保留原调用与 `{ runId, stopped: true }` 返回形状；v2 必须明确匹配 currentWindowId，控制记录使用 formatVersion 2，请求、成功响应和错误响应都带绑定的 windowId。缺少或错误窗口在写控制记录、调用 owner 或恢复锁之前拒绝。

活动通道只有在可信 `stopAndDrain()` 完成且该窗口 stopReason 已持久化后才确认。原窗口的停止事实不算追加窗口已经停止。窗口已停止但 drain 仍在等待或失败时，客户端不会收到成功确认；其他窗口的响应也会被拒绝。

通道缺失或连接明确被拒绝时，v2 可使用已有崩溃恢复流程：先拒绝 registry `.commit.lock` 残留，再由 `recoverRunOwner` 核验旧 owner 及所有登记子进程退出，随后独占 `RunController.open({ root, windowId })`、停止当前窗口、关闭 owner，最后确认。活 owner、未退出子进程、未知 spawn intent、untracked writers 或不能证明收敛的状态均拒绝；费用、原开始/截止和原 stop 保留。`recoverRunOwner` 返回是否实际恢复了一个有记录的 owner，其他既有调用可继续忽略返回值。

**当前候选边界：** 单纯缺失 owner marker 仍不能证明收敛。正常 idle/drained 路径的可信 receipt 由配套 core/C 提交提供，须锚定准确 snapshot/window/revision，并在真实 drain、关闭成功后产生；本子模块尚待接入其消费 API，不能用自描述 JSON 代替证明。当前候选不代表完整公开 continuation 流程已完成。

## 定向证据

同进程真实 pipe/controller 的 6 项通过，覆盖窗口绑定、等待 drain、失败 drain、错误响应、marker 缺失和活 owner。真实本地 Node owner/child 的 5 项通过（`duration_ms: 1197.3779`），覆盖 stale channel 后恢复、错窗口无写入、未知 intent/untracked/registry 阻断，以及子进程退出前后行为。所有 fixture 进程已退出；没有浏览器、API、真实验证根目录或旧实验操作。

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test --test-reporter=spec tests/cli/control-window.test.ts
node --experimental-strip-types --experimental-test-isolation=none --test --test-reporter=spec --test-name-pattern='crashed owner|owner recovery|surviving owned child' tests/cli/control-window.test.ts
```

首次 RED 暴露旧 startControl 错误接受 v2 无窗口调用；该意外成功产生的测试 server 已定向清理，反例的 finally 也已补齐关闭逻辑。本候选的最终组合类型检查及 v1 控制回归将在 idle API 合入后协调执行，不复跑无关 host/smoke。
