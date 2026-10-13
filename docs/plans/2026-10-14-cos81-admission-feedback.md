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

- [x] 提交本计划与 `docs/specs/cos81-admission-feedback.md`，请独立 reviewer 短核；在批准前只写/执行 RED 测试。
- [x] mapper RED：typed admission 的稳定 checkId/安全文案、既有费用保留、无秘密哨兵泄露；普通 `{code}` 不取得 typed 诊断，仍不能派发 repair/service retry。
- [x] 真实调用链 RED：复用既有 `outputLimitFixture` fake provider，将真实 Pi session 接入 `createRoleFactory` 和 `executeTaskDag`；可信输出策略拒绝，检查持久 failure.json、returned/persisted task 失败原因，一次准入、零 provider/capture/verify/reviewer/依赖任务派发，保留合成历史费用与原截止。
- [x] 只加 mapper typed 分支；运行上述两个新代表 GREEN。
- [x] 运行两个受影响测试文件，复用已有 Pi 零发送/失败锁及旧重型验证证据；执行 typecheck/build 和受影响测试 strict 编译。仅对新失败追加检查。
- [x] 回读 UTF-8/LF/中文，检查最小 diff，记录原始 TAP/退出码/限制，提交 exact SHA 供独立规格→质量审查。

命令：`node --experimental-strip-types --test --test-name-pattern="admission" tests/roles/repair-policy.test.ts tests/roles/roles.test.ts`（先 RED 后 GREEN）；完整受影响文件去掉 name pattern。`npm run typecheck`、`npm run build`。

## 当前状态

设计及计划 exact `844305124605ff4d8c675a26f5ca8ced38c44b75` 已由 `cos77_implementer` PLAN_APPROVED。实现完成待独立 exact 审查，仍为 SOURCE_NOT_READY；批准 marker 统一为 `ADMISSION_FAILURE_FEEDBACK_SOURCE_READY`。尚无新增实际运行。

## 免费实现证据

日志目录：`C:/Users/26557/AppData/Local/Temp/`。

| 验证 | 实际结果 | 原始日志 |
| --- | --- | --- |
| 两个新代表 RED | 0/2，均在 checkId 断言得到 author_handoff 而非 admission_rejected；退出1，3407.2577 ms | `cos81-admission-red.tap` |
| 同两个代表 GREEN | 2/2，0 skip；退出0，3233.4939 ms | `cos81-admission-green.tap` |
| 两个受影响文件完整回归 | 74/74，0 skip；退出0，7188.72 ms | `cos81-role-regression.tap` |
| `npm run typecheck` / `npm run build` | 均退出0 | `cos81-typecheck.log` / `cos81-build.log` |
| 受影响测试 strict 编译 | 退出0，无诊断 | `cos81-test-strict.log` |

strict 命令：`node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --allowImportingTsExtensions --allowJs --skipLibCheck --types node tests/roles/repair-policy.test.ts tests/roles/roles.test.ts`。

生产只有 mapper 两行新增和 checkId 分支。真实 Pi 在合成可信输出策略拒绝时产生 typed failure，经过原 factory/author/orchestrator 保存 failure.json；返回任务与持久任务失败说明相同。一次准入策略、provider dispatch0/network0；无 capture/verify/reviewer，依赖任务 waiting_user 且0 attempt。合成历史 planning40µ、requests、fees 和原截止逐项保持；mapper 另核同任务既有 settled 费用保持、plain code 不升级、linked repair 被原政策拒绝。完整回归同时保留真实作者 remaining/uncertainty、截断与其它失败路由。

三个既有代码/测试文件均 UTF-8/LF/noBOM，非 ASCII 字符序列与基线相同；文档中文回读、diff --check 通过。首次非 ASCII 检查命令因正则转义写错而误报，改用 codePointAt > 127 比较后通过，未因该误报修改源文件。

仅 source/free synthetic 证据。复用未变 Pi guard/失败锁及历史重型证据；未重跑 C9、未修生成游戏、未声称实际 provider 成功或节费。main 和真实历史不变。
