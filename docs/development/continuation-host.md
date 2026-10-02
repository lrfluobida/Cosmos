# 续跑生产 host 接线（D3b2）

`createBrowserHost` 增加可选 `binding: { windowId, tasks: PreparedTask[] }`。v2 必须明确绑定当前窗口和完整 design/art/coding DAG；角色取 `PreparedTask.role`，不根据新 taskId 的文本猜测。binding 复制后固定，要求新 grant 的 workspace 位于原运行根下 `continuations/<decision>/workspace`，已有 passed 祖先保留原 workspace。输出从准确 `expectedArtifacts` 取得，核对 registry 的 canonical reference，并禁止占用其他历史任务的输出位置。同一已登记 successor 可以按相同 binding 恢复。

新 `preAuthor` 实现先核对任务窗口权限和新作者写区没有未知部分文件，再用已审 `materializeTaskInputs` 镜像固定输入。它由配套 orchestrator 钩子在依赖及固定输入核验后、创建 attempt 之前调用；此文件不在 role factory 内复制，也不吞掉复制失败。旧 passed 祖先的 journal/signature/provenance 核验仍在原 artifactRoot 完成。复制不是认证，上游新输出只有实际通过后才成为下游可镜像的输入。

作者文件读取和 `registerCapture.sourceRoot` 使用绑定的新 workspace。registry、candidate、rendered、evidence 和 reviews 仍位于原 root，并以新 taskId/version 区分。旧 `authors/*` 部分文件不复制、不覆盖。`designFor`、验证和 `recoverCapture` 继续读取原 registry 与实际 provenance；序列化 report 不会重建 promotion 所需的 WeakMap proof。

`BrowserHostIO.build/play` 接收 `{ taskId, windowId, deadlineAt }`。真实 `ownedNode` 在创建子进程前重新核对 controller authority，按当前 deadline 留出清理时间，并以实际 task/window 准备和登记 owned child。`finish` 检查当前窗口 stop 和完整有效 DAG；原窗口 stop 保持历史。绑定窗口下 `repair` 和旧 `continuationTargets` 返回 null。sessionRoot 仍是 `root/sessions/<attemptId>/{author,review}`，没有新增费用扫描层级。

## 已审代码与验证边界

代码 `38da6e008626dcabc08e702ef083828c6bbbf8aa` 已独立审查 READY，包含配套 `preAuthor` 提交 `9134e597d2fea516c05cde67015395be538b30ed`，并已合入 main `9b9e350`。主线 4 项代表检查与 build 通过。公开 continuation CLI 装配不在本段，不能据此声明完整 R15 已通过。

定向回归采用真实 controller、registry、journal、临时目录，以及模拟作者、编译和浏览器结果。新增 7 项和原 host 5 项共 12 项通过（`duration_ms: 14363.4497`）；组合 `npm run build` exit 0。包括 coding-only 续跑复用旧祖先、design 全组续跑动态镜像新上游、原 authors 不变、IO 窗口归属、原证据改变先阻断、绑定恢复、部分文件阻断、真实 WeakMap proof 要求和当前窗口停止。这组定向回归没有真实 API 或浏览器调用。

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test --test-reporter=spec tests/runtime/entrypoint-host-continuation.test.ts tests/runtime/entrypoint-host.test.ts
npm run build
```

## 真实 host smoke（零 API）

独立脚本 `tests/runtime/entrypoint-host-continuation.smoke.ts` 不由默认 suite 发现，已在审查批准后由 merger 执行。它使用编译后的 host、现有通用 2D 模板和测试媒体，覆盖实际 owned build、Edge 普通点击、报告、provenance、promotion 和关闭 owner，并确认旧部分输出未变。

通用模板须先安装其锁定依赖。首轮在 coding build 发现 `templates/2d/node_modules/typescript/bin/tsc` 缺失，尚未进入浏览器；失败目录 `.cosmos/cos18-continuation-host-smoke/60eb758b-b31f-4710-a64f-76ba927e39ff` 保留。随后仅从本地缓存安装 18 个锁定依赖包，manifest 未改：

```powershell
npm ci --prefix templates/2d --offline --no-audit --no-fund
```

同一源码复验 1/1 通过，test 17.080 秒、suite 19.817 秒；成功目录 `.cosmos/cos18-continuation-host-smoke/686e11e5-2fdc-4108-a0ed-c75ba605782b` 保留。Edge `153.0.4234.48`、视口 `1280×720` 完成 10 步普通输入；merger 查看截图，确认点击后显示 `playground:1`。报告为 `cleanup.processExited: true`、`ownerClosed: true`，owner lock 已移除，`ledger.entries` 为 0。

报告明确标记 `generatedByCosmos: false`、`modelRequests: 0`。测试媒体和离线 author/reviewer 契约只证明 host 接线与清理，不是 Cosmos 真实生成、完整游戏验收或听感与视觉体验认可。首败与成功证据均保留，本次文档更新复用这些结果，没有重新运行测试。
