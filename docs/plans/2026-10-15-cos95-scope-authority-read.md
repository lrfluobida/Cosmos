# COS-95 Scope Authority Read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this reviewed plan task-by-task. Dedicated implementer and independent reviewer remain separate; only the assigned merger integrates and pushes.

**Goal:** 将每次 validation scope 首次身份读取从完整快照复制缩减为身份及完整窗口复制，并保留授权、新鲜度和超时语义。

**Architecture:** 新增 `RunController.readValidationScopeAuthority()`，复用原 `serial/expire/validationWindow`。只替换 `requireValidationScope()` 第一次读取；reader 后的完整 read、window 比对和最新 snapshot 返回保持。每次调用产生独立副本，无缓存。

**Tech Stack:** Node 22.22.2、TypeScript、node:test、真实 RunController/SnapshotStore、可信文件 reader、隔离 TEMP fixture。

---

规格：[COS95](../specs/cos95-scope-authority-read.md)。固定基线 `7df1e5b3b8662a4fa836c466f266f9b80d04d2e8`，分支 `codex/cos95-scope-authority-read`，工作副本 `E:/CodexData/.codex/worktrees/cos74-frozen-template/Cosmos`。复用前已核 clean、旧 `c772c9c340a8118878190d62755d837a3bf1f511` 为基线祖先；未 reset 或删除 ignored 资料。COS93 源码基线刷新由 Root 协调。

本阶段仅提交本计划和任务卡，随后交独立计划评审，批准前不修改生产源码。作者不合 main、不 push、不改共享 tracking。唯一 merger 为 `batch_c14_cos92_merger`，独立 reviewer 由 Root 分配，不与作者共享实现上下文。

计划 `bd4247cc5afd2d8c78e2e5b6c71d7265a8f400f4` 已由 `cos95_reviewer` 独立 `PLAN_APPROVED`、无 finding，并[公开批准](https://github.com/lrfluobida/Cosmos/issues/96#issuecomment-6182899219)。下述计划正文保留批准时要求，作者执行结果与最终源码独审集成见文末。

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

## 作者执行证据（已获源码独审）

目标 RED 提交 `8e81933c190c8b4e0eb65402da8ab2e76c615962`，生产与边界测试提交 `b0d987cb5e3facd6ef8a432e2c4c4c11c2337aa3`。实现保持固定基线，不吸收并行 tracking；生产 diff 只有 `run.ts` 新方法和 scope 首次读取的三处接线。原 `read`、`serial`、`expire`、`validationWindow`、`requireOwnSource`、5 秒 scope、15 秒 open 和整体 deadline 无修改。

以下 raw 均在 `C:/Users/26557/AppData/Local/Temp/cos95-scope-authority-9b7e0d05544c4e7ebcfc951cb7f25598`。不把失败记录覆盖为通过；已通过行为只复用，失败项修正后定向验证。

| 执行 | 观察结果 | raw |
| --- | --- | --- |
| Task 1 新复制计数测试 | RED 0/1、exit1、364.1394 ms；实际完整 snapshot 入参 2 次，目标 `2 !== 1` | `red.tap` |
| 最小补丁后的同一测试 | GREEN 1/1、exit0、348.2130 ms；实际入参为投影一次、完整 snapshot 一次 | `green-copy.tap` |
| 13 项新边界初跑 | 12/13；旧格式 fixture 漏必需 allocations，未进入目标断言 | `boundaries.tap` |
| Task 3 三文件受影响组 | 23/25、0skip、38478.8942 ms；legacy 空 allocations 仍违反最少一个 taskId，另有旧 guard 的 ENOENT 断言过时 | `focused.tap` |
| 修正 legacy 合法 grant 的单项及 guard 中间定向检查 | 2/2、0skip、10935.0202 ms；guard 此时使用 not-prepared 正则，后续按 Root 要求恢复旧断言做主线基线复现，再改精确值 | `corrected-focused.tap` |
| clean main ccd55bb 精确 guard selector | 0/1、exit1、9143.5644 ms；同一 not-prepared/ENOENT 不匹配 | `baseline-guard-main-ccd55bb.tap` |
| Root 核准后精确错误断言的 guard 单项 | 1/1、0skip、exit0、10159.4986 ms；原 reads/receipt/controller/provider/cleanup 断言全保留 | `corrected-guard.tap` |
| Task 3 routing 与 manifest 旧代表 | 2/2、0skip、15995.5550 ms | `representatives.tap` |
| compiled 最终完整 read 私有 timeout | 1/1、0skip、8673.1860 ms；完整 read 1 次、投影 1 次，保留私有 timeout 身份 | `compiled-final-read.tap` |
| typecheck / build | 均 exit0，后续只改测试 literal/断言和文档，生产结果复用 | `typecheck.log` / `build.log` |
| Task 5 affected strict，最终测试版本 | exit0 | `strict-final.log` |

最终 25 项受影响行为的证据由原 23 项通过、新 legacy 修正单项和最终精确 guard 单项组成；未为相同生产代码重跑完整组。新增 source/receipt 测试分别验证成功→真实字节变化拒绝→恢复后重新读取成功，reader 次数为 1→2→3；最终完整 snapshot 的 task/revision/event 与合法更新一致。

### 既有 guard 断言的基线事实

在 `E:/develop/Cosmos` 核 `HEAD=ccd55bb8fe6ecae10b9ddd011bc2f2b83b7c74a7` 且 clean；比较 `7df1e5b…` 到该 SHA 的 `run.ts`、`validation-scope.ts`、transfer `runtime-host.ts`、`scope-timeout-origin.test.ts` 和 `runtime-host.fixture.ts`，diff 为空。仅执行：

```text
node --experimental-strip-types --test --test-name-pattern='^real transfer host guard timeout preserves its origin before candidate binding$' tests/transfer/scope-timeout-origin.test.ts
```

该测试先验证实际 guard scope 超时但 origin 存活，再验证下一独立调用重验并到达缺失 prepared input，原注释为 `New call must progress to the absent synthetic prepared input`。COS92 `f9f43eb7` 的 `bindCandidate` 已在 `requireCurrent()` 后用 `requireThat(saved, 'candidate inputs are not prepared')` 明确拒绝；测试保留较旧 `ENOENT` 文字。Root 在基线失败与原意核对后批准改为精确完整错误字符串；未补伪造 prepared 数据，也未改变 guard、source、owner 或 cleanup。新 legacy fixture 的两次设置错误只修测试输入；这些均不计作新的生产修复。

### 唯一离线组件对照

目录：`C:/Users/26557/AppData/Local/Temp/cos95-scope-copy-a78343bd2aba48f99b93c3be024639c3`。按 Task 4 的既有 snapshot 来源复制一次，没有打开原 controller/store；`node --experimental-strip-types <该目录>/measure.mjs` 仅运行一次，exit0。原 raw 15,376,992 字节、revision3077、22 cases、715 requests、Node v22.22.2；原测试和编译进程已结束后再做组件测量。

| clone 输入 | 输入序列化字节 | 单次 wall ms |
| --- | ---: | ---: |
| 旧首次完整 snapshot | 10,253,640 | 85.3874 |
| 旧最终完整 snapshot | 10,253,640 | 78.8057 |
| 新首次身份及完整 window | 32,123 | 0.2129 |
| 新最终完整 snapshot | 10,253,640 | 81.8601 |

前后输入总量分别 20,507,280 / 10,285,763 字节；clone 合计 wall 164.1931 / 82.0730 ms。三个完整副本与原快照、投影与完整窗口均深比较相等，投影无 window/operatorDecision 别名。CPU user/system、入参键与限制均保存在 `result.json`；可复核脚本与日志为 `measure.mjs`、`measure.log`。

序列化字节不是堆分配量。单次进程按旧→新顺序测量，四份结果保留至等价检查，内存/GC/顺序噪声未控制；无预热、循环、择优重测、controller 队列、expire、可信 reader、source 校验或 native startup。此样本与生产复制计数共同支持减少复制输入量，不能证明整体 startup 加速、原超时已修复或 GC 根因。

所有改动文件严格 UTF-8/noBOM/LF，中文回读与 `git diff --check` 通过。提交时等待独立 reviewer 审实际最终 diff，再交唯一 merger；作者未改 main、共享 tracking、原账本、原始证据或生成内容，也未 push、重造历史请求、调用浏览器或付费模型。

## 已审集成

作者 `cos95_implementer` 最终 `04fdb8bd0b44bd059f49dcf7b43029f7647beb13` 经 `cos95_reviewer` 独立规格→质量 APPROVED，无finding；唯一merger `batch_c14_cos92_merger` 合入 `862514f269638d7489bb7438dc764777d8ed5c0e`，保留生产/测试提交 `b0d987cb5e3facd6ef8a432e2c4c4c11c2337aa3`。当前 `VALIDATION_SCOPE_AUTHORITY_READ_SOURCE_READY`，本卡source scoped complete，GitHub暂open待Root公开关闭。

主线COS95的两个生产文件和两个测试文件等同批准提交，COS93入口/fixture与COS94 runner/测试保持。`npm run typecheck` / `npm run build` 均退出0，raw `C:/Users/26557/AppData/Local/Temp/cos95-merge-typecheck.log`、`cos95-merge-build.log`。确认actual与compiled环境选择变量均未设置后执行 `node --experimental-strip-types --test --test-name-pattern='^scope clones one full snapshot and one isolated authority view$|^timeout during the final controller read retains the private timeout identity$|^COS93 fixture preserves returned verification failure' tests/runtime/validation-scope-authority.test.ts tests/transfer/scope-timeout-origin.test.ts tests/transfer/native-startup-diagnostic.test.ts`：3/3、0skip，10254.1566ms，raw `C:/Users/26557/AppData/Local/Temp/cos95-merge-focused.tap`。实际观察一次完整snapshot和一次身份/window投影；最终read仍保留私有timeout身份，COS93未到达分类保持。

复用原25项的23+2组合证据、旧2/2、compiled1/1、affected strict及唯一组件样本；没有重跑完整组或组件测量。复制输入减少不证明scope长尾、5秒历史失败或完整startup改善。COS93仍open/partial/actual-incomplete，原C14、媒体、ledger和human结果保持；未执行actual、715请求重建、浏览器或付费调用，main保持unfrozen。
