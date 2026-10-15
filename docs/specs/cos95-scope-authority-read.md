# COS-95 · 减少验证范围首次身份读取的完整快照复制

任务：[COS95 / #96](https://github.com/lrfluobida/Cosmos/issues/96)，id5858781735，父 #1，登记时 95 个原生子任务。依赖 COS52 / #53、COS91 / #92、COS92 / #93，以及 COS93 / #94 已审诊断实现与证据；不要求 COS93 的完整启动目标已经通过。

状态：实现完成待源码独审，`SOURCE_NOT_READY`。计划 `bd4247cc5afd2d8c78e2e5b6c71d7265a8f400f4` 已由 `cos95_reviewer` 独立 `PLAN_APPROVED`、无 finding，Root 授权实施。作者 `cos95_implementer`，唯一 merger 为 `batch_c14_cos92_merger`；[实施计划及证据](../plans/2026-10-15-cos95-scope-authority-read.md)。

## 问题与证据边界

- COS93 首次实际诊断在 nativeIO 前失败：`scope.read` 第 100/105 次、trace id 2197，5014.7298 ms，超过原 5 秒限，没有完整浏览器启动结论。[完整结果](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6182530375)保持 failed/incomplete。
- `controller.execute` 1539.6089 ms 只包围 `read()` 的 `structuredClone` 回调，不包含排队、`expire`、磁盘读取或 `validateSnapshot`。长尾原因未知，不能据此认定 GC 根因。
- 已有免费组件样本在 `C:/Users/26557/AppData/Local/Temp/cosmos-scope-cpu-2d8b8adce61b455399a3547ed28e7fa5/{result.json,measure.mjs,snapshot.json}`。Node 22.22.2、快照 15,376,992 字节、715 requests；单次全量 clone 125.6228 ms，身份与完整 window 投影 clone 0.1581 ms。它没有复现 1.54 秒长尾，不能推导 C14 或整个 startup 的耗时。
- `src/runtime/validation-scope.ts` 首次 `controller.read()` 复制完整状态，后续只使用 `runId/specVersion/ledgerId` 和当前 window。首次读取位于 scope 私有计时器之前；本任务降低复制量，不直接移除已记录超时中的那次 clone，也不宣称修好历史超时。

## 选定方案

在 `RunController` 增加 `readValidationScopeAuthority()`，经原 `serial()` 队列与 `expire()`，在队列内调用现有 `validationWindow()` 选择当前实例绑定的窗口，再对 `{ runId, specVersion, ledgerId, window }` 做一次 `structuredClone`。返回的 `window` 是完整 `ValidationCaseWindow`，包括 quote、operatorDecision、stopReason、deadlineAt、repair 以及其余字段；不手工裁剪授权对象，也不暴露内部可变别名。

只将 `requireValidationScope()` 的第一次完整读取改为该方法，并适配三个扁平身份字段。保留：

- 入口和 reader 后的 `requireValidationCase()`；现有串行化、截止持久化、关闭和失败语义。
- 可信 reader、完整需求比对、实际 operator receipt 字节摘要和内容、historical manifest 校验。
- reader 后的完整 `controller.read()`、完整 window 比对、原截止余量检查、signal 检查，以及返回最新完整 snapshot。
- `probes/transfer/validation-case-seven-driver.ts` 的 `requireOwnSource()` 新鲜完整读取，以及 source、owner、window、budget、receipt 和 accounting 检查；所有其它完整读取继续走原 `read()`。
- 每个独立操作重新读取与核验；无跨操作缓存，无新授权或绕过路径。

保留原 5 秒 scope、15 秒 open 和整体 deadline。当前方案比继续全量复制少一份完整 snapshot；共享内部对象或缓存历史结果会破坏隔离或新鲜度，不采用。只优化已确认冗余，不扩大到 clone、账本或持久化体系重构。

## 文件范围

| 文件 | 变更 |
| --- | --- |
| `src/runtime/run.ts` | 在 `read()` 附近新增专用身份读取方法；复用已有 `ValidationCaseWindow` 类型 |
| `src/runtime/validation-scope.ts` | 只替换第一次读取与其身份字段访问 |
| `tests/runtime/validation-scope-authority.test.ts` | 新增真实小 controller 的复制量、等价性、隔离、串行与授权边界测试 |
| `tests/transfer/scope-timeout-origin.test.ts` | 更新现有 stub 接口与最终完整 read 超时定位 |
| 本任务卡与计划 | 记录实施、检查、独审证据和限制 |

既有 `validation-routing.fixture.ts`、`validation-window.test.ts` 供构建合法小 fixture 参考，不为本任务重构公共 fixture；`tests/e2e/validation-scope.test.ts` 与定向旧回归原则上只运行。共享 tracking、COS93 诊断、原 C14 和原始证据由协调者保管，本作者不修改。

## 免费验收

1. 对一次成功 scope 调用使用小型真实 `RunController` 和可信文件 reader，观察实际 `structuredClone` 输入；RED 记录两次完整 snapshot，GREEN 为一次完整 snapshot 加一次身份/window 投影。不能只统计方法调用，也不能在 measured 区间包含 fixture setup 或额外断言 read。
2. 投影身份和完整 window 与旧完整 read 等价；修改投影、深层 quote/operatorDecision/repair 不能影响 controller。合法串行更新先完成，随后投影必须观察更新；已关闭、错误实例窗口或已到期的行为不绕过原队列与窗口选择。
3. reader gate 期间通过真实 controller 改变 repair window、停止或到期，scope 必须拒绝；期间合法任务更新不改变 window 时，成功返回的完整 snapshot 包含最新 revision、task/event。保留 5 秒前截止余量和私有 timeout 身份。
4. 真实 source/receipt 字节漂移被拒绝，后续独立操作重新读取并验证；historical manifest 和 `requireOwnSource` 的既有检查复用定向证据。最终 read 超时测试必须挂在 reader 后唯一完整 read，不能误挂到投影。
5. 实现后在一个新 TEMP 目录、同一个既有快照副本和同一 Node 进程中，只做一次前后组件比较：旧两次完整 clone 与新投影加完整 clone，记录实际输入类型、次数、序列化字节量和耗时。序列化字节仅表示复制输入规模，不是堆分配量；不设耗时通过阈值。
6. 受影响短测试、typecheck/build、必要 strict、`git diff --check`、严格 UTF-8/中文回读通过；独立 reviewer 审实际 diff 后，由唯一 merger 集成批准 SHA。

## 运行与交付边界

本卡只允许免费源码、合成 TEMP fixture 与上述单次离线组件测量。复用既有 715 请求快照，不重造请求、不重跑 COS93、浏览器、模型、旧玩法或媒体，不打开原账本 owner，不改原账本、窗口、候选或失败记录。原参考游戏安装只读。共享验证 ¥150（含既有保守预留 ¥0.721771）、正式 ¥200/12h 与 ¥100/6h 优化目标保持，无新增额度。

任务关闭至多表示本窄范围源码验收通过。完整原生启动仍由 COS93 后续有界诊断验证；COS16/COS18、accepted、完整经典与 human 不因本卡改变。一次组件样本不能证明整体 startup 提速、消除原 5 秒超时或确定长尾根因。

## 作者实施证据（待源码独审）

- 目标 RED 提交 `8e81933c190c8b4e0eb65402da8ab2e76c615962`：一次真实 scope 调用实际传入两份完整 snapshot，`2 !== 1`，0/1 pass、exit1。实现提交 `b0d987cb5e3facd6ef8a432e2c4c4c11c2337aa3` 后，同一观察方式得到一份身份/完整 window 投影和一份完整 snapshot，1/1 pass。仅新增 `run.ts` 方法并改 scope 首次读取，其他完整读取、原 timeout 与全部授权检查保持。
- 新增 13 项测试覆盖完整 window 值与深层隔离、串行 repair、到期持久化、closed/legacy/wrong-window、reader 期间 repair/stop/deadline、5 秒截止余量、最终完整 snapshot 新鲜度及下一独立操作的 source/receipt 重验。受影响组首次 23/25；一个新 legacy fixture 补齐合法 grant 后通过，另一个既有 guard 断言按下述基线证据修正并通过；其余 23 项复用。另两项旧 routing/manifest 代表和 compiled 最终 read 用例通过，均 0 skip；typecheck/build 和最终 affected strict 退出 0。
- 既有 `real transfer host guard timeout preserves its origin before candidate binding` 原注释要求下一独立调用到达缺失 synthetic prepared input 的拒绝。clean main `ccd55bb8fe6ecae10b9ddd011bc2f2b83b7c74a7` 单项复现同样失败，相关 source/test/fixture 与固定基线相同；COS92 `f9f43eb7` 已将缺失输入提前报告为 `Transfer design: candidate inputs are not prepared`，旧测试仍期待 `ENOENT`。经 Root 核准，只更新该精确错误断言，保留重验次数、receipt、controller、provider 和 cleanup 断言；这不是 COS95 的生产修复。
- 单次离线对照：同一既有 15,376,992 字节、715-request 快照副本，Node 22.22.2。完整快照序列化输入 10,253,640 字节，完整 window 投影 32,123 字节；旧两次完整复制共 20,507,280 字节 / 164.1931 ms，新投影加最终完整复制共 10,285,763 字节 / 82.0730 ms。值等价与独立副本检查通过。序列化输入量不是堆分配量，单次时间受顺序、内存和 GC 噪声影响，没有运行 controller/store/source/native startup。
- 测试证据：`C:/Users/26557/AppData/Local/Temp/cos95-scope-authority-9b7e0d05544c4e7ebcfc951cb7f25598`；唯一组件对照：`C:/Users/26557/AppData/Local/Temp/cos95-scope-copy-a78343bd2aba48f99b93c3be024639c3/{measure.mjs,result.json,snapshot.json,measure.log}`。所有修改文件 UTF-8/noBOM/LF、中文回读与 diffcheck 通过；没有重造 715 请求、浏览器、付费或原账本操作。

收益仅是每次 scope 少一次多余完整复制。原 1.54 秒长尾原因、原 5 秒失败能否消除和完整 native startup 仍未知；COS93 raw/preserved failed/incomplete 与原 C14 结果保持。
