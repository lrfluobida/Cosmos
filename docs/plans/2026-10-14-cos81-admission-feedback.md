# COS81 请求准入拒绝诊断实施计划

> **For agentic workers:** 按 `superpowers:executing-plans` 逐项执行；独立 reviewer 为 `cos77_implementer`，唯一 merger 为 `batch75_76_merger`。

**目标：** 将可信请求准入拒绝保存为准确、安全的失败原因，保留现有硬停止与失败分类。

**实现：** Pi 已产生并锁定 `PiSessionError('admission_rejected')`，factory/author 原样传递；`feedback.ts` 未识别该码而回落到 `author_handoff` 文案。只在 mapper 增加 typed 分支，复用现有 feedback → attempt.failure → host tasks/result taskHistory 链。

**技术与基线：** TypeScript、Node 内置测试；`730cb4de0cb6c3eb08b2f230ec9b09f54644c120`，分支 `codex/cos81-admission-feedback`。Issue [#82](https://github.com/lrfluobida/Cosmos/issues/82)，id5837671050；依赖 COS11/77/79。

## 范围与规则

- 生产仅改 `src/runtime/repair/feedback.ts`；测试只扩展 `tests/roles/repair-policy.test.ts` 与 `tests/roles/roles.test.ts`。
- 仅 `error instanceof PiSessionError && error.code === 'admission_rejected'` 命中；`checkId` 为 `admission_rejected`，分类仍为 `insufficient_evidence`。
- summary/actual 固定为 `Request admission was rejected (admission_rejected); this request was not sent to the provider.`。不透传异常原文，不断言余额耗尽或整轮零发送/零费用。
- 不改阶段、schema、预算/时限、重试或修复权限；不改旧费用、C9 历史或生成游戏。未识别异常和真实作者未完交接保持原行为。
- 不读取真实 ledger/session/thinking/key，不付费、不启动新窗口；共享 tracking 由 merger 处理。

## 执行步骤

- [ ] 提交本计划与 `docs/specs/cos81-admission-feedback.md`，请独立 reviewer 短核；在批准前只写/执行 RED 测试。
- [ ] mapper RED：typed admission 的稳定 checkId/安全文案、既有费用保留、无秘密哨兵泄露；普通 `{code}` 不取得 typed 诊断，仍不能派发 repair/service retry。
- [ ] 真实调用链 RED：复用既有 `outputLimitFixture` fake provider，将真实 Pi session 接入 `createRoleFactory` 和 `executeTaskDag`；可信输出策略拒绝，检查持久 failure.json、returned/persisted task 失败原因，一次准入、零 provider/capture/verify/reviewer/依赖任务派发，保留合成历史费用与原截止。
- [ ] 只加 mapper typed 分支；运行上述两个新代表 GREEN。
- [ ] 运行两个受影响测试文件，复用已有 Pi 零发送/失败锁及旧重型验证证据；执行 typecheck/build 和受影响测试 strict 编译。仅对新失败追加检查。
- [ ] 回读 UTF-8/LF/中文，检查最小 diff，记录原始 TAP/退出码/限制，提交 exact SHA 供独立规格→质量审查。

命令：`node --experimental-strip-types --test --test-name-pattern="admission" tests/roles/repair-policy.test.ts tests/roles/roles.test.ts`（先 RED 后 GREEN）；完整受影响文件去掉 name pattern。`npm run typecheck`、`npm run build`。

## 当前状态

设计已由 `cos77_implementer` 只读 PLAN_APPROVED；本文件等待 exact 短核。SOURCE_NOT_READY，尚无实现通过或新增实际运行。
