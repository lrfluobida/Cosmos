# COS-95 Scope Authority Read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this reviewed plan task-by-task. Dedicated implementer and independent reviewer remain separate; only the assigned merger integrates and pushes.

**Goal:** 将每次 validation scope 首次身份读取从完整快照复制缩减为身份及完整窗口复制，并保留授权、新鲜度和超时语义。

**Architecture:** 新增 `RunController.readValidationScopeAuthority()`，复用原 `serial/expire/validationWindow`。只替换 `requireValidationScope()` 第一次读取；reader 后的完整 read、window 比对和最新 snapshot 返回保持。每次调用产生独立副本，无缓存。

**Tech Stack:** Node 22.22.2、TypeScript、node:test、真实 RunController/SnapshotStore、可信文件 reader、隔离 TEMP fixture。

---

规格：[COS95](../specs/cos95-scope-authority-read.md)。固定基线 `7df1e5b3b8662a4fa836c466f266f9b80d04d2e8`，分支 `codex/cos95-scope-authority-read`，工作副本 `E:/CodexData/.codex/worktrees/cos74-frozen-template/Cosmos`。复用前已核 clean、旧 `c772c9c340a8118878190d62755d837a3bf1f511` 为基线祖先；未 reset 或删除 ignored 资料。COS93 源码基线刷新由 Root 协调。

本阶段仅提交本计划和任务卡，随后交独立计划评审，批准前不修改生产源码。作者不合 main、不 push、不改共享 tracking。唯一 merger 为 `batch_c14_cos92_merger`，独立 reviewer 由 Root 分配，不与作者共享实现上下文。

## Task 1: 真实小 fixture 的目标 RED

**Files:** 新增 `tests/runtime/validation-scope-authority.test.ts`；参考 `tests/runtime/validation-routing.fixture.ts` 的合法 claim/open/receipt/固定输入读取，以及 `tests/runtime/validation-window.test.ts` 的 `roleTask` 与失败任务 repair 前置。helper 留在新测试文件，避免重构公共 fixture。

- [ ] 写最小 TEMP fixture：合法初始 evaluation 历史、固定声明/输入文件、真实 quote/claim/open、真实 operator receipt 文件及 hash。可信 reader 每次读取固定输入与 receipt 并验证 source 字节。可注入测试时钟和 reader gate，不调用 SDK、浏览器或模型；清理仅限本 fixture 的已解析 TEMP 路径。
- [ ] fixture setup 与基线 `controller.read()` 在计数区间之外完成。用 `t.mock.method(globalThis, 'structuredClone', ...)` 包装真实 clone，按入参的 `formatVersion/run/ledger/tasks/requests/events` 识别完整 snapshot，另记录所有入参形状；不改入参或返回值，不并行运行这个测试。`finally` 恢复 mock。
- [ ] 对一次真实 `requireValidationScope(controller, requirement, binding)` 断言完整 snapshot clone 应为 1。当前源码预期目标 RED：实际为 2；诊断输出实际次数与输入形状。不要把新方法缺失或 fixture 非法当成复制量 RED。
- [ ] 运行 `node --experimental-strip-types --test tests/runtime/validation-scope-authority.test.ts`，保存 TEMP TAP；确认唯一目标失败来自 2 与 1 的差异，然后提交测试 SHA。

## Task 2: 专用投影与最小生产补丁

**Files:** 仅修改 `src/runtime/run.ts` 和 `src/runtime/validation-scope.ts`；同步 `tests/transfer/scope-timeout-origin.test.ts` 的合成 controller 接口。编辑前严格 UTF-8 检测，保持各文件现有换行和中文。

- [ ] 在 `read()` 旁新增以下方法，使用现有导入的 `ValidationCaseWindow`；不改变 `read()`、`serial()`、`expire()` 或 `validationWindow()`：

```typescript
async readValidationScopeAuthority(): Promise<{
  runId: string; specVersion: string; ledgerId: string; window: ValidationCaseWindow;
}> {
  return this.serial(async () => structuredClone({
    runId: this.snapshot.run.runId,
    specVersion: this.snapshot.run.specVersion,
    ledgerId: this.snapshot.ledger.ledgerId,
    window: this.validationWindow(),
  }));
}
```

- [ ] 仅替换首次读取为 `const before = await controller.readValidationScopeAuthority(), window = before.window, data = requirement.validation;`，三个比较改用 `before.runId`、`before.ledgerId`、`before.specVersion`。保留 `currentValidationCase` 导入供最终完整 read 比对使用；原 reader、receipt、historical manifest、timer、abort 和返回块逐行保持。
- [ ] 在 scope-timeout 的 `originFixture` stub 增加相同返回形状的深复制方法。`timeout during the final controller read retains the private timeout identity` 改为拦截 reader 返回后的唯一完整 read：在调用 verify 前安装包装，`readScope` 先保存 signal，包装 assert signal 已设置后等待 abort。明确断言完整 read 1 次且投影未挂起，避免旧 `++reads === 2` 误定位。
- [ ] 重跑 Task 1，要求 GREEN 的实际输入为 1 份完整 snapshot 和 1 份投影；不能仅通过改计数器或 fixture 获得通过。

## Task 3: 等价性、新鲜度与授权边界

**Files:** 扩展 `tests/runtime/validation-scope-authority.test.ts`，沿用同一个小 fixture，按测试各自创建隔离 controller。

- [ ] 将投影与一次完整 read 的 `{ runId, specVersion, ledgerId, window: currentValidationCase(snapshot) }` 深比较。断言完整 window 键集合及深层值；修改返回的身份、deadline、stopReason、operatorDecision.sourceRefs、quote 与非空 repair 后，新的 controller 读取必须未变。repair 非空使用真实失败任务和 `claimValidationRepair` 构造。
- [ ] 验证队列：先排入合法 `claimValidationRepair`、随后请求投影，投影须观察排在前面的 repair 更新；关闭后投影拒绝，旧格式运行不能获得 validation 投影，错误 window 的 open 仍拒绝。使用现有合法 fixture/context 绑定构造，不直接写私有 snapshot。
- [ ] reader gate 期间调用真实 `claimValidationRepair` 改变 window，最终完整比对必须拒绝；分别调用真实 `stop`、推进 controller 时钟越过 deadline，确认取消/过期拒绝。使用测试时钟覆盖 `deadlineAt - 5000` 安全余量，保持原值，不等待真实窗口耗尽。
- [ ] reader 期间通过 `registerTasks`/`saveTask` 做一次合法任务状态更新而不改变 window；scope 成功返回的 snapshot 必须具有更新后的 revision、task 和 event。证明最终完整 read 没有被先前投影替代。
- [ ] 用可信 reader 的实际文件分别覆盖 source 字节漂移和 operator receipt 字节漂移；每次都拒绝。一次成功后修改文件，再发独立 scope 操作，断言 reader 确实再次调用且拒绝；恢复仅限合成文件。取消、window 比对、receipt 和截止测试不计入复制量目标区间。
- [ ] 运行 `node --experimental-strip-types --test tests/runtime/validation-scope-authority.test.ts tests/e2e/validation-scope.test.ts tests/transfer/scope-timeout-origin.test.ts`。这组覆盖复制量、新鲜度、真实 reader、最终 read 私有 timeout 和 origin 生命周期；保存 pass/fail/skip 与 TAP。
- [ ] 运行既有短代表：`node --experimental-strip-types --test --test-name-pattern='scope changes between tasks|operator-covered manifest hashes actual changed bytes' tests/runtime/validation-routing.test.ts tests/transfer/passed-stage-reuse.test.ts`。预期匹配两项实际测试，不能把零测试/全 skip 当通过。未变的 source/owner/window/budget/receipt/`requireOwnSource` 逻辑由实际 diff 和既有已通过证据复用；不重跑 715 请求或完整 C14。

## Task 4: 一次离线复制量与耗时对照

**Files:** 只在一个新的 `cos95-scope-copy-*` TEMP 目录保存 `measure.mjs`、`snapshot.json`、`result.json`；本任务卡/计划记录结果。不增加生产测量开关或常驻 benchmark。

- [ ] 从已有 `C:/Users/26557/AppData/Local/Temp/cosmos-scope-cpu-2d8b8adce61b455399a3547ed28e7fa5/snapshot.json` 复制一次固定输入到新 TEMP；记录来源、Node 版本、原始字节数和 request 数。原文件与原始 result/measure 不写入，也不打开其 controller/store。
- [ ] 单次进程严格解码/parse 后，在同一对象上仅各执行一轮：旧 `structuredClone(state)` 两次；新 `structuredClone({ runId: state.run.runId, specVersion: state.run.specVersion, ledgerId: state.ledger.ledgerId, window: currentValidationCase(state) })` 加一次 `structuredClone(state)`。沿用真实 `structuredClone`，对照代码与 Task 2 的实际入参核对。准备、文件 IO、JSON parse 与计算输入序列化大小放在 timed 区间外。
- [ ] 执行 `node --experimental-strip-types <新TEMP>/measure.mjs` 一次，记录每个 clone 的 wall/CPU 时间、实际入参类型与次数、输入 `Buffer.byteLength(JSON.stringify(value))` 和等价性检查。旧为两份完整，新为一份完整加一份投影；Task 1 负责证明真实生产调用路径的数量。
- [ ] 完整/投影值等价且复制输入规模减少为确定性验收，耗时只记录，无性能阈值、循环、预热重测或取最佳值。此组件对照不运行 serial/expire/reader/source/浏览器，不能推导完整 startup 的提升，也不能证明原超时修复或 GC 根因。

## Task 5: 必要检查与独审交付

**Files:** 上述两个生产文件、两个测试文件及本任务卡/计划；其它文件不变。

- [ ] 运行 `npm run typecheck` 和 `npm run build`，两者必须退出 0。
- [ ] 运行受影响测试 strict：`node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions --allowJs --checkJs false tests/runtime/validation-scope-authority.test.ts tests/transfer/scope-timeout-origin.test.ts`。既有无关诊断先与基线比对，不扩大范围修复。
- [ ] build 后在临时进程环境设 `COSMOS_TEST_COMPILED=1`，运行 `node --experimental-strip-types --test --test-name-pattern='timeout during the final controller read' tests/transfer/scope-timeout-origin.test.ts`；退出后恢复该变量原值。只检验已改最终 read 接线，不重复长矩阵。
- [ ] `git diff --check`，严格 UTF-8 解码并回读全部改动文件，核对中文和原换行。核对 diff 只有计划列明的文件，特别确认 `requireOwnSource`、5 秒 scope、15 秒 open、整体 deadline 和历史报告没有变更。
- [ ] 更新本卡/计划的实际证据与限制，提交自己分支并报告 exact SHAs、RED/GREEN、短回归、类型/构建/strict、TEMP 样本目录。未知长尾原因、历史 failed/incomplete 和完整 native startup 尚未证明必须保留。
- [ ] Root 分配独立 reviewer 审实际 diff，先规格再质量；作者修 actionable finding 后提交新 SHA 并只复审受影响部分。将批准 SHA 与证据交唯一 `batch_c14_cos92_merger`，作者不合 main 或 push。

本任务无付费、浏览器、模型或原账本操作。原 COS93 raw/preserved 与 C14 失败事实保持；只减少首次复制量，最终 read 的那次完整 clone 继续存在。闭卡不能提升 COS16/COS18、accepted、完整经典或 human 状态。
