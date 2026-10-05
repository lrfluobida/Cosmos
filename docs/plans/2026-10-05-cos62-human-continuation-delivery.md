# COS62 编码追加主机与最终试玩接线计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement the following bounded steps. Each implementation commit receives an independent review; only batch08_merger integrates into main.

**Goal:** 让首个 human preparation 编码追加窗口通过生产主机，并把原 design/art 与新 coding 的完整交付证明送到现有最终试玩入口。

**Architecture:** 在 browser core host 内按已经认证的 HumanContinuationScope.lineage 读取同一 snapshot 的两个 passed 阶段，仅供职责校验和交付证明使用。当前计划、调度、grant、工具和角色仍只包含新 coding；finish 返回内部交付任务集，entrypoint 显式转成现有 effectiveTasks，不把内部字段写入公开报告。experience 沿用现有只读版本核验，不重新建立活动执行权限。

**Tech Stack:** TypeScript、Node 22、node:test、现有 createProductHost / transfer consumer / ArtifactRegistry。

任务卡：[#63](https://github.com/lrfluobida/Cosmos/issues/63)。基线 main `415dfb57bb04042ebc02128fa3c43fffdf055e5f`。Source61 原两阶段来源、当前 scope、双 audit plan、candidate consumer 和 source/compiled 证据复用。

## 1. 复现生产主机和报告缺口

**Files:** 新增 `tests/transfer/human-continuation-delivery.test.ts`；按需要最小扩展 `tests/transfer/human-continuation.fixture.ts`。

- [ ] 用现有 TEMP preparation fixture 得到原 design/art passed 与原 coding failed。
- [ ] 通过 `createProductHost` 的实际 execute 接线及公开 `runCli continue`，使用 fixture stdin 确认第一窗口；只在模型、构建和浏览器 I/O 边界注入 synthetic transport，不能替换 core host、validateTasks、finish 或候选认证。
- [ ] 运行 `node --experimental-strip-types --test tests/transfer/human-continuation-delivery.test.ts`，保留实际 RED：单 coding 的生产职责校验拒绝；最终报告缺少原设计/媒体验收证明。若第一拒绝阻断第二，用已接受候选的既有 COS34 fixture 单独复现报告 scope 缺口，禁止缩小原 acceptance。

## 2. 最小主机接线

**Files:** 修改 `src/runtime/entrypoint-host.ts`。

- [ ] 为 human continuation 解析 lineage.design/art 的原 taskId，在同一 snapshot 取 passed/independently approved 任务；由既有 requireCurrent 核验封存来源。
- [ ] validateTasks 使用这两个只读阶段检查设计、媒体、玩法职责及 coding 的依赖；当前 binding 仍严格为一个新 coding，不把旧阶段放入 boundTask 或派发路径。
- [ ] finish 再读取并核对当前 snapshot 的两个旧阶段，与新 coding 一起检查完整交付状态；原候选、journal signature、独立 review 和 promotion 检查继续执行。
- [ ] 新增定向负例：改变旧阶段 task proof 时拒绝，不产生新角色调用或候选接受。

## 3. 完整报告与公开体验入口

**Files:** 修改 `src/runtime/entrypoint.ts`；测试仍在 `tests/transfer/human-continuation-delivery.test.ts`，必要时复用 `tests/cli/experience.test.ts` 的版本绑定断言。

- [ ] `GenerationHost.finish` 允许内部返回 `deliveryTasks?: TaskContract[]`；continuation 将其转成 `deliveryTaskProofs`，公开 outcome 只展开 delivery/gaps/acceptedCandidate 等现有结果字段。
- [ ] 报告列出原 design/art 和当前 coding，覆盖原全部 acceptance；current window、candidate、attempt、review 和原 requirement 保持。
- [ ] 同一生产生成报告通过真实 `runCli experience` 和 synthetic stdin 分别 approve/reject；status 显示对应体验状态。cancel/EOF 不产生决定。
- [ ] 证明 experience 等待期间账本、原时钟、window/grants、旧阶段文件不变；变更 task proof 或报告后现有入口仍拒绝，不能为试玩重开活动 execution。

## 4. 定向验证与交付

- [ ] 重跑新用例，要求 GREEN、0 模型实费，记录 transport 层和真实执行层。
- [ ] 运行现有 `tests/cli/experience.test.ts` 和必要默认 continuation 兼容用例；不重复 Source61 长矩阵。
- [ ] `npm run typecheck`、`npm run build`、`git diff --check`；按实际源码/compiled 接线差异选一个有界 compiled CLI 代表用例。
- [ ] 检查 UTF-8 / 原 LF 并重新读取中文；提交准确 SHA、实际 stdout/exit、已知限制，等待独立规格和质量审查。

## 保持的边界

本任务不增加 schema、hash/auth 框架、第二窗口、通用 durable waiting 或完整经典基准。Root 实际 .cosmos、费用账本、key、session 和参考安装只由 Root 管理；implementer 仅操作自有 TEMP 夹具。Actual C6 unknown 974882 micro-CNY、closure12 和真实 C7 保持待核对。测试 stdin 不记为实际 human 验收；COS18 仍 partial/open。
