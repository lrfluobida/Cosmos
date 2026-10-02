# 续跑生产 host 接线候选（D3b2）

`createBrowserHost` 增加可选 `binding: { windowId, tasks: PreparedTask[] }`。v2 必须明确绑定当前窗口和完整 design/art/coding DAG；角色取 `PreparedTask.role`，不根据新 taskId 的文本猜测。binding 复制后固定，要求新 grant 的 workspace 位于原运行根下 `continuations/<decision>/workspace`，已有 passed 祖先保留原 workspace。输出从准确 `expectedArtifacts` 取得，核对 registry 的 canonical reference，并禁止占用其他历史任务的输出位置。同一已登记 successor 可以按相同 binding 恢复。

新 `preAuthor` 实现先核对任务窗口权限和新作者写区没有未知部分文件，再用已审 `materializeTaskInputs` 镜像固定输入。它由配套 orchestrator 钩子在依赖及固定输入核验后、创建 attempt 之前调用；此文件不在 role factory 内复制，也不吞掉复制失败。旧 passed 祖先的 journal/signature/provenance 核验仍在原 artifactRoot 完成。复制不是认证，上游新输出只有实际通过后才成为下游可镜像的输入。

作者文件读取和 `registerCapture.sourceRoot` 使用绑定的新 workspace。registry、candidate、rendered、evidence 和 reviews 仍位于原 root，并以新 taskId/version 区分。旧 `authors/*` 部分文件不复制、不覆盖。`designFor`、验证和 `recoverCapture` 继续读取原 registry 与实际 provenance；序列化 report 不会重建 promotion 所需的 WeakMap proof。

`BrowserHostIO.build/play` 接收 `{ taskId, windowId, deadlineAt }`。真实 `ownedNode` 在创建子进程前重新核对 controller authority，按当前 deadline 留出清理时间，并以实际 task/window 准备和登记 owned child。`finish` 检查当前窗口 stop 和完整有效 DAG；原窗口 stop 保持历史。绑定窗口下 `repair` 和旧 `continuationTargets` 返回 null。sessionRoot 仍是 `root/sessions/<attemptId>/{author,review}`，没有新增费用扫描层级。

## 当前候选证据与待完成项

本候选已合入配套 `preAuthor` 提交 `9134e597d2fea516c05cde67015395be538b30ed`；该依赖及本段均须独立审查，不代表 main 已 READY。公开 continuation CLI 装配不在本段，真实 host smoke 尚未执行，不能据此声明完整 R15 已通过。

定向回归采用真实 controller、registry、journal、临时目录，以及模拟作者、编译和浏览器结果。新增 7 项和原 host 5 项共 12 项通过（`duration_ms: 14363.4497`）；组合 `npm run build` exit 0。包括 coding-only 续跑复用旧祖先、design 全组续跑动态镜像新上游、原 authors 不变、IO 窗口归属、原证据改变先阻断、绑定恢复、部分文件阻断、真实 WeakMap proof 要求和当前窗口停止。没有真实 API 或浏览器调用。

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test --test-reporter=spec tests/runtime/entrypoint-host-continuation.test.ts tests/runtime/entrypoint-host.test.ts
npm run build
```

独立脚本 `tests/runtime/entrypoint-host-continuation.smoke.ts` 已准备，默认 suite 不会发现。它使用编译后的 host、现有通用 2D 模板和测试媒体，明确记录 `generatedByCosmos: false`、`modelRequests: 0`；测试实际 owned build、Edge 普通点击、报告、provenance、promotion 和关闭 owner，并确认旧部分输出未变。离线 fixture 提供 author/reviewer 契约，不冒充模型生成或用户体验认可。脚本仅通过语法检查，**尚未运行**；须独立审查后由 merger 安排唯一浏览器时段。

```powershell
node --experimental-strip-types --check tests/runtime/entrypoint-host-continuation.smoke.ts
```
