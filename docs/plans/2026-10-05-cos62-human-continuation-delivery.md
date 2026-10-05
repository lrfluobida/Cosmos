# COS62 准备模式追加后的生产交付与试玩验证计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement the following bounded steps. Each implementation commit receives an independent review; only batch08_merger integrates into main.

**Goal:** 用真实生产主机与公开 CLI 验证首个 human preparation 编码追加的完整交付证明和最终试玩入口。

**Architecture:** 现有 continuation plan 保留原 design/art 的两个 prepared contract，与唯一新 coding 一起进入生产主机；仅新 coding 获得当前 grant，旧阶段由恢复路径复用。现有 entrypoint 因此已经输出完整的三个 effectiveTasks，experience 沿用只读版本核验。本任务新增组合回归，不修改生产源码或内部交付接口。

**Tech Stack:** TypeScript、Node 22、node:test、现有 createProductHost / transfer consumer / ArtifactRegistry。

任务卡：[#63](https://github.com/lrfluobida/Cosmos/issues/63)。基线 main `415dfb57bb04042ebc02128fa3c43fffdf055e5f`。Source61 原两阶段来源、当前 scope、双 audit plan、candidate consumer 和 source/compiled 证据复用。

## 1. 核实生产主机和报告

**Files:** 新增 `tests/transfer/human-continuation-delivery.test.ts`；按需要最小扩展 `tests/transfer/human-continuation.fixture.ts`。

- [x] 用现有 TEMP preparation fixture 得到原 design/art passed 与原 coding failed。
- [x] 通过 `createProductHost` 的实际 execute 接线及公开 `runCli continue`，使用 fixture stdin 确认第一窗口；只在模型、构建和浏览器 I/O 边界注入 synthetic transport，没有替换 core host、validateTasks、finish 或候选认证。
- [x] 首轮断言计划只有 coding 失败，但生产结果已经是 awaiting_user_experience。实际计划是三个 prepared tasks、一个新 coding grant；原缺口探针只向 core 注入一个 task，不能代表公开入口。纠正测试预期后组合通过，保留首轮失败作为错误假设记录，不记为产品缺陷。

## 2. 现有主机接线核对

**Files:** 只读 `src/runtime/continuation-plan.ts`、`src/runtime/entrypoint-host.ts`。

- [x] 无 grant 的原已通过设计/美术 prepared contract 在 derive 中保留；唯一 coding clone 重映射当前身份。现有职责校验与准备上下文收到三个角色。
- [x] 真实生成结果与报告具有原 design/art 加当前 coding 的完整证明；原角色任务结果、停止记录和截止不变，只有 coding/reviewer 新增 synthetic 请求。
- [x] 保持原候选、journal signature、独立 review 和 promotion 路径；没有新增 deliveryTasks 或身份读取框架。

## 3. 完整报告与公开体验入口

**Files:** 新增 `tests/transfer/human-continuation-delivery.test.ts`；只读 `src/runtime/entrypoint.ts`、`src/runtime/experience.ts`，复用 COS34 的相反决定和版本绑定证据。

- [x] 报告列出原 design/art 和当前 coding，完整 acceptance 等于原 requirement；内部 task contract 不额外散入报告。
- [x] 真实 `runCli experience` 加 synthetic stdin 的 cancel/EOF 不产生决定，approve 后 status 显示 approved。
- [x] 等待 stdin 时更改原 art review proof 会拒绝提交；恢复原快照后认可成功。全过程快照字节、费用/时钟/window/grants、原四份来源文件字节和 mtime、模型调用列表不变。
- [x] 相反决定、reject 状态及 candidate/report 版本矩阵复用 COS34 原通过证据；本次没有修改对应生产代码，不重复长生成组合。

## 4. 定向验证与交付

- [x] 新组合 1/1 PASS、0 skip、0 模型实费；test 106812.2946ms、process 109884.2448ms、exit 0。首轮错误预期的 exit 1 独立保留。
- [x] 所有生产源码、依赖、环境和契约未改，复用 Source61 source/compiled 与 COS34 已过证据；不重跑 typecheck/build 或旧长矩阵。
- [ ] `git diff --check`、UTF-8/LF/中文读回；提交准确 SHA、实际 stdout/exit、已知限制，等待独立规格和质量审查。来源见 [验证记录](../reviews/2026-10-05-cos62-production-delivery-evidence.md)。

## 保持的边界

本任务不增加 schema、hash/auth 框架、第二窗口、通用 durable waiting 或完整经典基准。Root 实际 .cosmos、费用账本、key、session 和参考安装只由 Root 管理；implementer 仅操作自有 TEMP 夹具。Actual C6 unknown 974882 micro-CNY、closure12 和真实 C7 保持待核对。测试 stdin 不记为实际 human 验收；COS18 仍 partial/open。
