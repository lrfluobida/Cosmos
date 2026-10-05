# COS63 已完成运行恢复计划

> **For agentic workers:** Use superpowers:executing-plans; each task has its dedicated implementer and independent reviewer. Steps use checkbox syntax.

**Goal:** 公开和直接 runtime 的完成后 resume 复用原可信报告及试玩决定。

**Architecture:** 在恢复的 writer、过期处理和 host 前置之前，只读核对已有完成报告；使用现有 `loadExperienceBinding` 验证准确候选、任务、验收和独立批准，再返回同一报告。未完成路径继续原收据核对与恢复。

**Tech Stack:** Node 22、TypeScript、现有 CLI / registry / experience / node:test。

**Contract:** [COS63 / #64](https://github.com/lrfluobida/Cosmos/issues/64)，原 COS17 / COS18 / COS34；base `fd1983a7b84f0ef4b8c611773d1a6d6ef018c957`。

## 文件

- `src/runtime/experience.ts`：只读完成报告读取，保留报告位置、体验状态和准确时间来源。
- `src/cli/session.ts`、`src/cli/continuation-session.ts`、`src/runtime/entrypoint.ts`：两种恢复入口的完成分支。
- `tests/cli/continuation-session.fixture.ts`：可选完成原运行；默认中断行为不变。
- `tests/cli/completed-generation-resume.test.ts`：合法三任务和首追加窗口的公开入口、直接 runtime、冷编译入口与拒绝证明。
- 本计划：原始测试输出位置、最终 SHA 与已知缺口。

## Task 1: 公开入口 RED

- [ ] 仅测试夹具和新测试先写：用原真实 planner / DAG / registry，加 fake 模型、构建和浏览器形成合法接受候选；stdin 只是 fixture。
- [ ] 自动交付后通过 `experience` 保存 approve / reject，再实际 `runCli resume → executeGeneration`；断言报告 UUID/hash/current marker 和体验决定保持。
- [ ] 运行 `node --experimental-strip-types --test --test-name-pattern="completed original" tests/cli/completed-generation-resume.test.ts`，确认旧代码因重新发布报告或失去决定而 FAIL；保留原始输出。

## Task 2: 最小完成分支 GREEN

- [ ] 添加只读读取函数：缺报告、自动未过或无 acceptedCandidate 返回未完成；声称完成且有候选则完整验证，错误拒绝。
- [ ] 完成分支保留原确认、模式、指定窗口、当前有效停止、unknown/reserved 和 owner/registry writer 门禁；不恢复锁，不结算费用。未完成不提前拦截合法收据核对。
- [ ] CLI / runtime 在确认身份后、deadline / prepare / open / createHost 前读取；返回原报告与原体验状态，永不 publish 新报告。
- [ ] approve / reject / 待试玩及重复恢复 GREEN；已完成窗口模拟跨 deadline 仍只读。原时钟、停止、账本、报告、候选、来源文件 bytes/mtime 与调用列表不变。
- [ ] reportedAt 只称自动报告时间，用户 decidedAt 和等待单列；不当作 finally 清理结束或完整 12h 成绩。

## Task 3: 必要边界和回归

- [ ] 正式首追加窗口按原合法三任务一 grant 成功后，同样验证公开 `resume --window` 及直接 runtime；clock fixture 明确标注。
- [ ] 定向拒绝 wrong window/mode/确认来源、报告 hash/候选/任务/独审/AC 漂移、完成报告的 unknown/reserved/active owner/有效 hard stop；没有 writer / 新报告副作用。
- [ ] 未完成恢复和已有合法收据核对代表仍通过；复用 COS34、Source61、Source62 的未改证明，不重跑 110 秒生成或 Edge。
- [ ] 运行本新增测试文件、相关 CLI / runtime 恢复代表、`npm run typecheck` 和冷 `dist` 入口代表；检查 UTF-8/LF、中文 readback、`git diff --check`。
- [ ] 提交 exact SHA 给独立 reviewer，先规格后质量；修复有效 finding 后仅复查受影响部分。仅 batch08_merger 合并与 push。

## 边界

不变更报告格式、体验 binding、晋升、调度、追加授权和账本。不启动模型或实际用户试玩，不读 Root `.cosmos`、凭据、会话或参考安装。实际 C6 unknown、closure12/C7 仍外部待核对；完整 cleanup 计时、完整经典基准和真实 human 仍是已有缺口。
