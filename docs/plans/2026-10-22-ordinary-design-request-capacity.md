# COS122 普通设计作者容量实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. 独立作者、独立审查，唯一 merger 合入 main。

**Goal:** 普通设计作者可在原费用和时限内使用最多 32 次模型请求，并知道要为自检与最终交接留余量。

**Architecture:** 复用 RoleFactory 的作者覆盖配置模式，在 factory 中选定真实 maxRequests，并由 ordinary host 仅为 design 角色启用 32。原 Pi 计数及预算/窗口守卫不改。

**Tech Stack:** TypeScript、Node 22、Pi 0.99.2、node:test；真实 SDK + fake transport、TEMP controller。

## 文件

- 生产：`src/roles/factory.ts`、`src/runtime/entrypoint-host.ts`。不应需要修改 Pi adapter 或引入依赖。
- 测试：优先复用 `tests/runtime/ordinary-author-thinking.test.ts`、现有 factory/native/session-cap 测试和 fixture，按实际结构新增一个聚焦测试文件即可；勿猜测未存在的路径。
- 正式文档：`docs/specs/cos122-ordinary-design-request-capacity.md`、`docs/plans/2026-10-22-ordinary-design-request-capacity.md`。
- 三份 tracking 仅 merger 修改；真实运行/账本/产物只读。

## 步骤

- [x] 在 clean managed worktree 从批准基线建独立 `codex/` 分支，保留 ignored 证据。编辑前检测 UTF-8/行尾并说明目标文件。
- [x] 先写并运行有效 RED：原 ordinary design 的 16 限额阻断超过 16 后的正常交接，原提示未告知拟定容量；保存原断言与退出码。
- [x] 增加可信作者配置、角色/数值校验与 purpose/validation 选择；选定值同时用于 Pi 参数和仅覆盖作者的固定限额提示。
- [x] ordinary host 仅启用 design=32；用 host 矩阵核 planning/review/art/coding/legacy/fixed validation 不变，省略配置兼容。
- [x] 原 native fake transport 跑超过 16 的成功路径以及 32/33 精确边界；保留原收费、计数和准入事实，33 不 fetch/不计费。
- [x] 定向验证有额度不足或 deadline/authority 失效时仍会提前拒绝；不另建真实案例或调用付费模型。原 capture/review 必经条件用既有未变证据加最短相关代表核对。
- [x] 运行最少受影响兼容矩阵、typecheck/build 和变更测试 strict；保留命令/退出码，即使 stdout 为空。不要把重叠结果相加。
- [ ] UTF-8/中文回读、diff check，发布正式规格与计划并提交精确 SHA/证据索引/已知缺口；不 push main。
- [ ] 独立 reviewer 先规格后质量审实际 diff；原作者修 findings 后定向复审。唯一 merger 合并批准 SHA、短集成和元数据发布。

原 room6 已永久关闭。本卡不重开它、不追加尝试或付款；后续真实效果必须在独立获准的验证中观察，不能把 32 次当成保证成功。

## 实施证据

作者分支 `codex/ordinary-design-request-capacity`；登记任务 [COS122 / #123](https://github.com/lrfluobida/Cosmos/issues/123)。原始命令、退出码及 stdout/stderr 在作者 worktree 的 `.cosmos/cos122-evidence/verification-index.json`。

- `red`：6 项按预期失败，包含原 host 16/32 差异、未实现的配置校验、真实锁定 SDK 在第 17 次请求前触限；5 项原边界通过。
- `green`：11/11、0 skip，包含原 host 的七个规划/作者/独审会话，以及自检、capture、独审和下游证据门禁代表。原 host 测试只按实际受影响项改预期。
- `final-current`：最终聚焦测试 11/11、0 skip。17/32 次模型请求分别产生真实协议交接；每次中间回复发出两次原生 read，证明模型请求轮次与工具次数不同。33 次边界及 32 次成功后的 readonly 格式纠正都在 fetch/收费前拒绝。
- `compatibility`：legacy、preparation、旧失败任务不重新派发三个代表通过。未变的其他 host/validator/repair 证据复用，不累计重叠测试。
- 受资助 ordinary 入口仍使用 32；原 ¥5、30 分钟、分配与固定确认保持。原预算不足、截止清理余量和 authority 拒绝继续生效；均为 TEMP controller 与假传输。
- `typecheck`、`build` 保存独立命令、exit code 和空 stdout/stderr 文件；测试 strict 输出单独保存。UTF-8/中文回读与 diff 检查另存 `source-check`。

`final-focused` 和 `funded-delta` 的失败原样保留：早期受资助夹具未写输出，先在 capture 阶段失败并触发既有 repair，所以实际多构造一次 design 会话。最终夹具沿真实确认/规划/原任务准入构造设计作者后结束，聚焦配置与预算窗口；未修改生产 repair，也未把该夹具当作游戏生成通过。

`strict-final` 记录了测试中的 TS2353：直接对象字面量向 `createBrowserHost` 传入测试 sessionFactory，与已有兼容夹具的先声明 options 再传入模式不同。按既有模式调整测试变量声明，运行语义及生产源码保持；最终 strict 与受影响 funded 代表另留 `strict-resolved`、`funded-resolved`。

本次仅证明固定容量、提示同源及原守卫；未验证真实模型是否遵循提示或能在 32 次、原预算内完成设计与验收计划。独立 reviewer 与唯一 merger 的后续工作保持待办。
